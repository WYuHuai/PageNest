import json
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .library import iter_document_paths, read_document_file, require_vault


INDEX_SCHEMA_VERSION = 1
INDEX_RELATIVE_PATH = Path(".pagenest") / "search-index.json"
MAX_INDEX_BYTES = 64 * 1024 * 1024
_SPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class SearchResult:
    path: str
    title: str
    source: str
    snippet: str
    score: int


def _load_index(path: Path) -> dict[str, dict]:
    try:
        if path.stat().st_size > MAX_INDEX_BYTES:
            return {}
        payload = json.loads(path.read_text("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}
    if payload.get("schema_version") != INDEX_SCHEMA_VERSION:
        return {}
    documents = payload.get("documents")
    return documents if isinstance(documents, dict) else {}


def _indexed_document(root: Path, path: Path, stat: os.stat_result) -> dict:
    document = read_document_file(root, path)
    return {
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
        "title": document.title or path.stem,
        "source": document.source,
        "text": document.searchable_text,
    }


def _write_index(path: Path, documents: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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
            json.dump(
                {"schema_version": INDEX_SCHEMA_VERSION, "documents": documents},
                handle,
                ensure_ascii=False,
                separators=(",", ":"),
            )
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def refresh_search_index(vault: Path) -> dict[str, dict]:
    root = require_vault(vault)
    index_path = root / INDEX_RELATIVE_PATH
    previous = _load_index(index_path) if index_path.is_file() else {}
    current: dict[str, dict] = {}

    for path in iter_document_paths(root):
        relative = path.relative_to(root).as_posix()
        try:
            stat = path.stat()
            cached = previous.get(relative)
            if cached and cached.get("size") == stat.st_size and cached.get("mtime_ns") == stat.st_mtime_ns:
                current[relative] = cached
            else:
                current[relative] = _indexed_document(root, path, stat)
        except (OSError, ValueError):
            continue

    if current != previous or not index_path.is_file():
        _write_index(index_path, current)
    return current


def _snippet(text: str, terms: tuple[str, ...], radius: int = 90) -> str:
    compact = _SPACE_RE.sub(" ", text).strip()
    folded = compact.casefold()
    positions = [folded.find(term) for term in terms]
    position = min((value for value in positions if value >= 0), default=0)
    start = max(0, position - radius)
    end = min(len(compact), position + max(map(len, terms), default=0) + radius)
    prefix = "…" if start else ""
    suffix = "…" if end < len(compact) else ""
    return f"{prefix}{compact[start:end].strip()}{suffix}"


def search_documents(vault: Path, query: str, *, limit: int = 20) -> list[SearchResult]:
    query = _SPACE_RE.sub(" ", query).strip()
    if not query:
        raise ValueError("请输入搜索关键词")
    if len(query) > 200:
        raise ValueError("搜索关键词不能超过 200 个字符")
    if not 1 <= limit <= 100:
        raise ValueError("搜索结果数量必须在 1 到 100 之间")

    terms = tuple(part.casefold() for part in query.split(" ") if part)
    results: list[SearchResult] = []
    for path, document in refresh_search_index(vault).items():
        searchable = str(document.get("text", ""))
        folded = searchable.casefold()
        if not all(term in folded for term in terms):
            continue
        title = str(document.get("title", "")) or Path(path).stem
        title_folded = title.casefold()
        score = sum(folded.count(term) for term in terms) + 10 * sum(
            term in title_folded for term in terms
        )
        results.append(
            SearchResult(
                path=path,
                title=title,
                source=str(document.get("source", "")),
                snippet=_snippet(searchable, terms),
                score=score,
            )
        )
    return sorted(results, key=lambda item: (-item.score, item.title.casefold(), item.path))[:limit]
