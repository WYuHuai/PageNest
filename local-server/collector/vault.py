import os
import re
from pathlib import Path, PurePosixPath


DEFAULT_CATEGORY = "阅读记录/待整理"
IGNORED_FOLDER_NAMES = {".git", ".obsidian", ".trash", "node_modules", "__pycache__"}


def normalize_folder(value: str) -> str | None:
    """Return a safe vault-relative POSIX path, or None for unsafe input."""
    raw = value.strip().replace("\\", "/")
    if not raw or raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        return None
    normalized = raw.strip("/")
    parts = PurePosixPath(normalized).parts
    if any(part in {"", ".", ".."} or part.startswith(".") for part in parts):
        return None
    return "/".join(parts)


def list_vault_folders(vault: Path) -> list[str]:
    """Scan writable, non-hidden folders without following links."""
    root = vault.resolve(strict=True)
    folders: set[str] = {DEFAULT_CATEGORY}

    def ignore_error(_error: OSError) -> None:
        return None

    for current, dirnames, _filenames in os.walk(root, topdown=True, onerror=ignore_error, followlinks=False):
        current_path = Path(current)
        visible = []
        for name in dirnames:
            candidate = current_path / name
            if name in IGNORED_FOLDER_NAMES or name.startswith(".") or candidate.is_symlink():
                continue
            visible.append(name)
            if os.access(candidate, os.W_OK):
                folders.add(candidate.relative_to(root).as_posix())
        dirnames[:] = visible
    return sorted(folders, key=lambda value: (value.casefold(), value))


def require_vault_folder(vault: Path, value: str) -> str:
    """Return a current vault folder, raising when a stale manual choice is used."""
    normalized = normalize_folder(value)
    if normalized and normalized in set(list_vault_folders(vault)):
        return normalized
    raise ValueError("所选 Obsidian 文件夹已不存在，请刷新文件夹列表后重试")


def select_vault_folder(vault: Path, value: str) -> str:
    """Resolve an automatic suggestion, falling back to the pending folder."""
    try:
        return require_vault_folder(vault, value)
    except ValueError:
        return DEFAULT_CATEGORY
