import re
import unicodedata
from pathlib import Path

def safe_title(value: str, limit: int = 72) -> str:
    value = "".join(character for character in value if unicodedata.category(character) != "Cf")
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" .")
    cleaned = re.sub(r"\s+", " ", cleaned) or "未命名文章"
    return cleaned[:limit].rstrip(" .")


def inside_vault(vault: Path, path: Path) -> Path:
    root = vault.resolve(strict=True)
    candidate = path.resolve(strict=False)
    if candidate == root or root not in candidate.parents:
        raise ValueError("目标路径不在 Obsidian 仓库内")
    current = candidate
    while current != root and current.exists():
        if current.is_symlink():
            raise ValueError("拒绝写入符号链接路径")
        current = current.parent
    return candidate
