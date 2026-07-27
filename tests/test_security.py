from pathlib import Path
import pytest
from collector.security import inside_vault, safe_title
from collector.storage import content_hash, normalize_url
from collector.vault import DEFAULT_CATEGORY, list_vault_folders, normalize_folder, require_vault_folder, select_vault_folder


def test_windows_title_cleaning_and_length():
    title = safe_title('测试<>:"/\\|?* 标题 ' * 20)
    assert len(title) <= 72
    assert not any(character in title for character in '<>:"/\\|?*')
    assert safe_title("标题\u200d\u200b正文") == "标题正文"


def test_url_normalization_and_hash():
    assert normalize_url("HTTPS://Example.COM/a/?utm_source=x&x=1#part") == "https://example.com/a?x=1"
    assert content_hash("中文  正文") == content_hash("中文 正文")


def test_vault_folders_refresh_after_add_and_rename(tmp_path: Path):
    vault = tmp_path / "知识库"
    vault.mkdir()
    (vault / "项目" / "机器人").mkdir(parents=True)
    (vault / ".obsidian" / "plugins").mkdir(parents=True)
    assert list_vault_folders(vault) == [DEFAULT_CATEGORY, "项目", "项目/机器人"]

    (vault / "项目" / "机器人").rename(vault / "项目" / "机械臂")
    (vault / "新分类").mkdir()
    folders = list_vault_folders(vault)
    assert "项目/机器人" not in folders
    assert "项目/机械臂" in folders and "新分类" in folders


def test_vault_folder_selection_rejects_unknown_and_traversal(tmp_path: Path):
    vault = tmp_path / "知识库"
    (vault / "工作记录" / "日报").mkdir(parents=True)
    assert normalize_folder(r"工作记录\日报") == "工作记录/日报"
    assert normalize_folder("../仓库外") is None
    assert normalize_folder("/仓库外") is None
    assert normalize_folder(r"C:\仓库外") is None
    assert select_vault_folder(vault, "工作记录/日报") == "工作记录/日报"
    assert select_vault_folder(vault, "不存在") == DEFAULT_CATEGORY
    assert select_vault_folder(vault, "../仓库外") == DEFAULT_CATEGORY
    with pytest.raises(ValueError, match="已不存在"):
        require_vault_folder(vault, "不存在")


def test_path_traversal_rejected(tmp_path: Path):
    vault = tmp_path / "vault"
    vault.mkdir()
    with pytest.raises(ValueError):
        inside_vault(vault, vault / ".." / "outside")
