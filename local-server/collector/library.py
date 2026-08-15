import os
from pathlib import Path

from .document_text import PageNestDocument, extract_document


DOCUMENT_SUFFIXES = {".pagenest", ".hermes"}
IGNORED_DIRECTORIES = {".git", ".obsidian", ".trash", "node_modules", "__pycache__"}
MAX_DOCUMENT_BYTES = 256 * 1024 * 1024
MAX_SEARCH_FILES = 10_000


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
