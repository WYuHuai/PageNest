import asyncio
import base64
import binascii
import os
import re
import tempfile
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from uuid import uuid4

from ..config import settings
from ..security import inside_vault, safe_title
from .models import (
    AnalysisStatus,
    DEFAULT_NOTEBOOK_DIRECTORY,
    MAX_NOTEBOOK_SCREENSHOT_BYTES,
    Notebook,
    NotebookEntry,
    NotebookEntryRequest,
)
from .rendering import read_notebook, render_notebook


_DATA_URL_RE = re.compile(
    r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$",
    re.IGNORECASE,
)
_WINDOWS_DRIVE_RE = re.compile(r"^[A-Za-z]:")
_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


class NotebookStoreError(ValueError):
    status_code = 400


class NotebookNotFoundError(NotebookStoreError):
    status_code = 404


class NotebookConflictError(NotebookStoreError):
    status_code = 409


class NotebookWriteError(NotebookStoreError):
    status_code = 500


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_image_data_url(value: str) -> str:
    match = _DATA_URL_RE.fullmatch(value.strip())
    if not match:
        raise NotebookStoreError("截图必须是 PNG、JPEG 或 WEBP 的 base64 data URL")
    mime = match.group(1).lower()
    encoded = match.group(2)
    maximum_encoded = 4 * ((MAX_NOTEBOOK_SCREENSHOT_BYTES + 2) // 3)
    if len(encoded) > maximum_encoded:
        raise NotebookStoreError("截图大小超过 10 MiB 限制")
    try:
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise NotebookStoreError("截图 base64 数据无效") from exc
    if len(content) > MAX_NOTEBOOK_SCREENSHOT_BYTES:
        raise NotebookStoreError("截图大小超过 10 MiB 限制")
    signatures = {
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/webp": content.startswith(b"RIFF") and content[8:12] == b"WEBP",
    }
    if not signatures[mime]:
        raise NotebookStoreError("截图内容与声明的图片格式不一致")
    return f"data:{mime};base64,{encoded}"


def _validate_title(value: str) -> str:
    value = value.strip()
    if not value:
        raise NotebookStoreError("标题不能为空")
    return value


def _filename_stem(title: str) -> str:
    stem = safe_title(title, limit=96)
    if stem.split(".", 1)[0].upper() in _WINDOWS_RESERVED_NAMES:
        return f"_{stem}"
    return stem


def _sort_entries(notebook: Notebook) -> None:
    notebook.entries.sort(
        key=lambda entry: (
            entry.video_timestamp_seconds,
            entry.captured_at,
            entry.id,
        )
    )


class NotebookStore:
    def __init__(self, vault_provider: Callable[[], Path | None] | None = None):
        self._vault_provider = vault_provider or (lambda: settings.vault)
        self._create_lock = asyncio.Lock()
        self._notebook_locks: dict[str, asyncio.Lock] = {}

    def _vault(self) -> Path:
        vault = self._vault_provider()
        if not vault or not vault.is_dir():
            raise NotebookStoreError("尚未配置有效的 OBSIDIAN_VAULT_PATH")
        return vault.resolve(strict=True)

    def _lock_for(self, notebook_id: str) -> asyncio.Lock:
        return self._notebook_locks.setdefault(notebook_id, asyncio.Lock())

    @staticmethod
    def _relative_path(vault: Path, path: Path) -> str:
        return path.relative_to(vault).as_posix()

    @staticmethod
    def _resolve(vault: Path, relative_path: str, *, must_exist: bool = True) -> Path:
        raw = relative_path.strip()
        if (
            not raw
            or raw.startswith(("/", "\\"))
            or _WINDOWS_DRIVE_RE.match(raw)
            or "\\" in raw
        ):
            raise NotebookStoreError("Notebook 路径必须是仓库内的相对 POSIX 路径")
        parts = raw.split("/")
        if any(part in {"", ".", ".."} for part in parts):
            raise NotebookStoreError("Notebook 路径包含不安全的目录片段")
        pure = PurePosixPath(raw)
        if pure.suffix.lower() != ".pagenest":
            raise NotebookStoreError("Notebook 文件必须使用 .pagenest 扩展名")
        try:
            path = inside_vault(vault, vault.joinpath(*pure.parts))
        except ValueError as exc:
            raise NotebookStoreError(str(exc)) from exc
        if must_exist and (not path.is_file() or path.is_symlink()):
            raise NotebookNotFoundError("Video Notebook 不存在")
        return path

    @staticmethod
    def _unique_path(parent: Path, title: str, *, current: Path | None = None) -> Path:
        base = _filename_stem(title)
        candidate = parent / f"{base}.pagenest"
        index = 2
        while candidate.exists() and candidate != current:
            candidate = parent / f"{base}_{index}.pagenest"
            index += 1
        return candidate

    @staticmethod
    def _write_atomic(path: Path, content: str, *, replace_existing: bool) -> None:
        temporary: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=path.parent,
                prefix=f".{path.name}.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                temporary = Path(handle.name)
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            if replace_existing:
                os.replace(temporary, path)
            else:
                try:
                    os.link(temporary, path)
                except FileExistsError as exc:
                    raise NotebookConflictError("同名 Video Notebook 已存在") from exc
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    @staticmethod
    def _load(path: Path, notebook_id: str) -> Notebook:
        try:
            notebook = read_notebook(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, ValueError) as exc:
            raise NotebookStoreError(str(exc)) from exc
        if notebook.id != notebook_id:
            raise NotebookStoreError("Notebook ID 与文件不匹配")
        _sort_entries(notebook)
        return notebook

    async def create(
        self,
        title: str,
        source_url: str,
        source_title: str = "",
        initial_entry: NotebookEntryRequest | dict | None = None,
    ) -> dict:
        title = _validate_title(title)
        entry = None
        if initial_entry is not None:
            if not isinstance(initial_entry, NotebookEntryRequest):
                initial_entry = NotebookEntryRequest.model_validate(initial_entry)
            entry = initial_entry.model_dump()
            entry["image_data_url"] = await asyncio.to_thread(
                _validate_image_data_url, entry["image_data_url"]
            )
        async with self._create_lock:
            return await asyncio.to_thread(
                self._create_sync,
                title,
                source_url.strip(),
                source_title.strip(),
                entry,
            )

    def _create_sync(
        self,
        title: str,
        source_url: str,
        source_title: str,
        initial_entry: dict | None,
    ) -> dict:
        vault = self._vault()
        destination = inside_vault(vault, vault / DEFAULT_NOTEBOOK_DIRECTORY)
        destination.mkdir(parents=True, exist_ok=True)
        path = self._unique_path(destination, title)
        timestamp = _now()
        notebook = Notebook(
            id=uuid4().hex,
            title=title,
            source_url=source_url,
            source_title=source_title,
            created_at=timestamp,
            updated_at=timestamp,
            revision=1,
        )
        entry_id = None
        if initial_entry is not None:
            entry_id = uuid4().hex
            notebook.entries.append(
                NotebookEntry(
                    id=entry_id,
                    captured_at=timestamp,
                    video_timestamp_seconds=initial_entry["video_timestamp_seconds"],
                    image_data=initial_entry["image_data_url"],
                    title=initial_entry["title"].strip(),
                    summary=initial_entry["summary"].strip(),
                    analysis_status=(
                        "pending" if initial_entry["request_analysis"] else None
                    ),
                )
            )
        try:
            rendered = render_notebook(notebook)
            self._write_atomic(path, rendered, replace_existing=False)
        except NotebookStoreError:
            raise
        except Exception as exc:
            raise NotebookWriteError("无法写入 Video Notebook") from exc
        return self._summary(vault, path, notebook, entry_id=entry_id)

    async def get(self, notebook_id: str, relative_path: str) -> dict:
        vault = self._vault()
        path = self._resolve(vault, relative_path)
        notebook = await asyncio.to_thread(self._load, path, notebook_id)
        return self._summary(vault, path, notebook)

    async def append(
        self,
        notebook_id: str,
        relative_path: str,
        video_timestamp_seconds: float,
        image_data_url: str,
        title: str = "",
        summary: str = "",
        request_analysis: bool = False,
    ) -> dict:
        image_data = await asyncio.to_thread(_validate_image_data_url, image_data_url)
        async with self._lock_for(notebook_id):
            return await asyncio.to_thread(
                self._append_sync,
                notebook_id,
                relative_path,
                video_timestamp_seconds,
                image_data,
                title.strip(),
                summary.strip(),
                request_analysis,
            )

    def _append_sync(
        self,
        notebook_id: str,
        relative_path: str,
        video_timestamp_seconds: float,
        image_data: str,
        title: str,
        summary: str,
        request_analysis: bool,
    ) -> dict:
        vault = self._vault()
        path = self._resolve(vault, relative_path)
        notebook = self._load(path, notebook_id)
        timestamp = _now()
        entry_id = uuid4().hex
        notebook.entries.append(
            NotebookEntry(
                id=entry_id,
                captured_at=timestamp,
                video_timestamp_seconds=video_timestamp_seconds,
                image_data=image_data,
                title=title,
                summary=summary,
                analysis_status="pending" if request_analysis else None,
            )
        )
        _sort_entries(notebook)
        notebook.revision += 1
        notebook.updated_at = timestamp
        try:
            rendered = render_notebook(notebook)
            self._write_atomic(path, rendered, replace_existing=True)
        except NotebookStoreError:
            raise
        except Exception as exc:
            raise NotebookWriteError("无法更新 Video Notebook") from exc
        return self._summary(vault, path, notebook, entry_id=entry_id)

    async def analysis_input(
        self, notebook_id: str, relative_path: str, entry_id: str
    ) -> dict:
        async with self._lock_for(notebook_id):
            return await asyncio.to_thread(
                self._analysis_input_sync, notebook_id, relative_path, entry_id
            )

    def _analysis_input_sync(
        self, notebook_id: str, relative_path: str, entry_id: str
    ) -> dict:
        vault = self._vault()
        path = self._resolve(vault, relative_path)
        notebook = self._load(path, notebook_id)
        entry = next((item for item in notebook.entries if item.id == entry_id), None)
        if entry is None:
            raise NotebookNotFoundError("Video Notebook 条目不存在")
        return {
            "entry_id": entry.id,
            "image_data_url": entry.image_data,
            "video_timestamp_seconds": entry.video_timestamp_seconds,
            "source_title": notebook.source_title,
            "source_url": notebook.source_url,
        }

    async def update_analysis(
        self,
        notebook_id: str,
        relative_path: str,
        entry_id: str,
        *,
        status: AnalysisStatus,
        title: str = "",
        summary: str = "",
    ) -> dict:
        async with self._lock_for(notebook_id):
            return await asyncio.to_thread(
                self._update_analysis_sync,
                notebook_id,
                relative_path,
                entry_id,
                status,
                title,
                summary,
            )

    def _update_analysis_sync(
        self,
        notebook_id: str,
        relative_path: str,
        entry_id: str,
        status: AnalysisStatus,
        title: str,
        summary: str,
    ) -> dict:
        vault = self._vault()
        path = self._resolve(vault, relative_path)
        notebook = self._load(path, notebook_id)
        entry = next((item for item in notebook.entries if item.id == entry_id), None)
        if entry is None:
            raise NotebookNotFoundError("Video Notebook 条目不存在")
        entry.analysis_status = status
        if status == "complete":
            entry.title = title.strip()
            entry.summary = summary.strip()
        _sort_entries(notebook)
        notebook.revision += 1
        notebook.updated_at = _now()
        try:
            rendered = render_notebook(notebook)
            self._write_atomic(path, rendered, replace_existing=True)
        except NotebookStoreError:
            raise
        except Exception as exc:
            raise NotebookWriteError("无法更新 Video Notebook 分析结果") from exc
        return self._summary(vault, path, notebook, entry_id=entry_id)

    async def rename(self, notebook_id: str, relative_path: str, title: str) -> dict:
        title = _validate_title(title)
        async with self._lock_for(notebook_id):
            return await asyncio.to_thread(
                self._rename_sync, notebook_id, relative_path, title
            )

    def _rename_sync(self, notebook_id: str, relative_path: str, title: str) -> dict:
        vault = self._vault()
        old_path = self._resolve(vault, relative_path)
        notebook = self._load(old_path, notebook_id)
        new_path = self._unique_path(old_path.parent, title, current=old_path)
        notebook.title = title
        notebook.revision += 1
        notebook.updated_at = _now()
        try:
            rendered = render_notebook(notebook)
            if new_path == old_path:
                self._write_atomic(old_path, rendered, replace_existing=True)
            else:
                self._write_atomic(new_path, rendered, replace_existing=False)
                try:
                    old_path.unlink()
                except OSError:
                    new_path.unlink(missing_ok=True)
                    raise
        except NotebookStoreError:
            raise
        except Exception as exc:
            raise NotebookWriteError("无法重命名 Video Notebook") from exc
        return self._summary(vault, new_path, notebook)

    @staticmethod
    def _summary(
        vault: Path, path: Path, notebook: Notebook, *, entry_id: str | None = None
    ) -> dict:
        result = {
            "notebook_id": notebook.id,
            "document_type": notebook.document_type,
            "title": notebook.title,
            "source_url": notebook.source_url,
            "source_title": notebook.source_title,
            "created_at": notebook.created_at,
            "updated_at": notebook.updated_at,
            "revision": notebook.revision,
            "entry_count": len(notebook.entries),
            "relative_path": NotebookStore._relative_path(vault, path),
            "entries": [entry.model_dump(exclude={"image_data"}) for entry in notebook.entries],
        }
        if entry_id is not None:
            result["entry_id"] = entry_id
        return result


notebook_store = NotebookStore()
