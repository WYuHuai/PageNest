import os
import re
from dataclasses import dataclass
from pathlib import Path

from .document_text import PageNestDocument, extract_document


DOCUMENT_SUFFIXES = {".pagenest", ".hermes"}
IGNORED_DIRECTORIES = {".git", ".obsidian", ".trash", "node_modules", "__pycache__"}
MAX_DOCUMENT_BYTES = 256 * 1024 * 1024
MAX_SEARCH_FILES = 10_000
_SPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class SearchResult:
    path: str
    title: str
    source: str
    snippet: str
    score: int


def require_vault(vault: Path) -> Path:
    try:
        root = vault.expanduser().resolve(strict=True)
    except OSError as error:
        raise ValueError("PageNest Vault 不存在") from error
    if not root.is_dir():
        raise ValueError("PageNest Vault 不是文件夹")
    return root


def resolve_document_path(vault: Path, value: str | Path) -> Path:
    root = require_vault(vault)
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root)
    except (OSError, ValueError) as error:
        raise ValueError("只能读取当前 PageNest Vault 内的收藏") from error
    if not resolved.is_file() or resolved.suffix.casefold() not in DOCUMENT_SUFFIXES:
        raise ValueError("请选择 Vault 内的 .pagenest 或 .hermes 文件")
    return resolved


def read_document_file(vault: Path, value: str | Path) -> PageNestDocument:
    path = resolve_document_path(vault, value)
    if path.stat().st_size > MAX_DOCUMENT_BYTES:
        raise ValueError("收藏文件过大，暂时无法生成纯文本视图")
    try:
        return extract_document(path.read_text(encoding="utf-8"))
    except UnicodeDecodeError as error:
        raise ValueError("收藏文件不是有效的 UTF-8 PageNest 文档") from error


def iter_document_paths(vault: Path):
    root = require_vault(vault)

    def ignore_error(_error: OSError) -> None:
        return None

    seen = 0
    for current, directories, filenames in os.walk(root, topdown=True, onerror=ignore_error, followlinks=False):
        current_path = Path(current)
        directories[:] = [
            name
            for name in directories
            if name not in IGNORED_DIRECTORIES
            and not name.startswith(".")
            and not (current_path / name).is_symlink()
        ]
        for name in filenames:
            path = current_path / name
            if path.suffix.casefold() not in DOCUMENT_SUFFIXES or path.is_symlink():
                continue
            yield path
            seen += 1
            if seen >= MAX_SEARCH_FILES:
                return


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
    root = require_vault(vault)
    for path in iter_document_paths(root):
        try:
            document = read_document_file(root, path)
        except (OSError, ValueError):
            continue
        searchable = document.searchable_text
        folded = searchable.casefold()
        if not all(term in folded for term in terms):
            continue
        title = document.title or path.stem
        title_folded = title.casefold()
        score = sum(folded.count(term) for term in terms) + 10 * sum(term in title_folded for term in terms)
        results.append(
            SearchResult(
                path=path.relative_to(root).as_posix(),
                title=title,
                source=document.source,
                snippet=_snippet(searchable, terms),
                score=score,
            )
        )
    return sorted(results, key=lambda item: (-item.score, item.title.casefold(), item.path))[:limit]
