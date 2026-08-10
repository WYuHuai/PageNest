from pathlib import Path

import pytest

from collector import config, storage, vault_selection
from collector.config import Settings, settings
from collector.models import ArticleInput


def make_vault(root: Path, name: str, folders: tuple[str, ...] = ()) -> Path:
    vault = root / name
    (vault / ".obsidian").mkdir(parents=True)
    for folder in folders:
        (vault / folder).mkdir(parents=True)
    return vault


def switch_with_temp_config(tmp_path, monkeypatch, selected: Path | None):
    env_file = tmp_path / "service.env"
    vault_a = make_vault(tmp_path, "Vault A", ("Old Folder",))
    env_file.write_text(
        f'OBSIDIAN_VAULT_PATH="{vault_a}"\nLOCAL_COLLECTOR_TOKEN="keep-me"\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(config, "ENV_FILE", env_file)
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault_a))
    result = vault_selection.switch_vault(lambda _current: selected)
    return vault_a, env_file, result


def test_switch_vault_persists_rescans_and_survives_settings_reload(tmp_path, monkeypatch):
    vault_b = make_vault(tmp_path, "Vault B", ("Research", "Research/Papers"))

    vault_a, env_file, result = switch_with_temp_config(tmp_path, monkeypatch, vault_b)

    assert result["ok"] is True
    assert result["cancelled"] is False
    assert result["vault_name"] == "Vault B"
    assert result["default"] == vault_selection.DEFAULT_CATEGORY
    assert set(result["folders"]) == {
        vault_selection.DEFAULT_CATEGORY,
        "Research",
        "Research/Papers",
    }
    assert settings.vault == vault_b.resolve()
    saved = env_file.read_text("utf-8")
    assert str(vault_b.resolve()).replace("\\", "\\\\") in saved
    assert 'LOCAL_COLLECTOR_TOKEN="keep-me"' in saved
    restarted = Settings(_env_file=env_file)
    assert restarted.vault == vault_b.resolve()
    assert (vault_a / "Old Folder").is_dir()


def test_cancelled_selection_keeps_existing_vault_and_config(tmp_path, monkeypatch):
    vault_a, env_file, result = switch_with_temp_config(tmp_path, monkeypatch, None)

    assert result == {"ok": True, "cancelled": True}
    assert settings.vault == vault_a.resolve()
    assert str(vault_a) in env_file.read_text("utf-8")


@pytest.mark.parametrize("kind", ["missing", "file"])
def test_selection_rejects_missing_or_non_directory_path(tmp_path, kind):
    selected = tmp_path / "missing"
    if kind == "file":
        selected.write_text("not a directory", encoding="utf-8")

    with pytest.raises(vault_selection.VaultSelectionError, match="不存在|不是文件夹"):
        vault_selection.validate_vault_path(selected)


def test_selection_rejects_non_obsidian_folder(tmp_path):
    selected = tmp_path / "ordinary-folder"
    selected.mkdir()

    with pytest.raises(vault_selection.VaultSelectionError, match=r"没有找到 \.obsidian"):
        vault_selection.validate_vault_path(selected)


def test_selection_rejects_folder_without_write_access(tmp_path, monkeypatch):
    selected = make_vault(tmp_path, "Read Only")

    def deny_write(*_args, **_kwargs):
        raise PermissionError("denied")

    monkeypatch.setattr(vault_selection.tempfile, "NamedTemporaryFile", deny_write)
    with pytest.raises(vault_selection.VaultSelectionError, match="写入权限"):
        vault_selection.validate_vault_path(selected)


@pytest.mark.skipif(vault_selection.os.name != "nt", reason="Windows picker only")
def test_picker_launch_failure_has_readable_error(monkeypatch):
    def fail_launch(*_args, **_kwargs):
        raise OSError("PowerShell unavailable")

    monkeypatch.setattr(vault_selection.subprocess, "run", fail_launch)
    with pytest.raises(vault_selection.VaultSelectionError, match="无法打开文件夹选择器") as error:
        vault_selection.open_windows_vault_picker()
    assert error.value.status_code == 500


@pytest.mark.asyncio
async def test_new_collections_go_to_vault_b_without_changing_vault_a(tmp_path, monkeypatch):
    vault_a = make_vault(tmp_path, "Vault A", ("Old Folder",))
    vault_b = make_vault(tmp_path, "Vault B")
    existing = vault_a / "existing.pagenest"
    existing.write_text("keep this page unchanged", encoding="utf-8")
    before = existing.read_bytes()
    env_file = tmp_path / "service.env"
    env_file.write_text(f'OBSIDIAN_VAULT_PATH="{vault_a}"\n', encoding="utf-8")
    monkeypatch.setattr(config, "ENV_FILE", env_file)
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault_a))

    vault_selection.switch_vault(lambda _current: vault_b)
    captured = ArticleInput(
        title="Vault switch test",
        url="https://example.test/vault-switch",
        captured_at="2026-08-10T12:00:00+08:00",
        article_html="<article><h1>Vault switch test</h1><p>Saved in Vault B.</p></article>",
        article_text="Saved in Vault B.",
        mode="original",
    )

    result = await storage.collect(captured)

    assert Path(result["page_path"]).is_relative_to(vault_b)
    assert not list(vault_a.glob("**/Vault switch test*.pagenest"))
    assert existing.read_bytes() == before


def test_config_save_failure_keeps_runtime_vault(tmp_path, monkeypatch):
    vault_a = make_vault(tmp_path, "Vault A")
    vault_b = make_vault(tmp_path, "Vault B")
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault_a))

    def fail_save(_vault):
        raise OSError("disk full")

    monkeypatch.setattr(vault_selection, "save_vault_configuration", fail_save)
    with pytest.raises(vault_selection.VaultSelectionError, match="无法保存仓库设置"):
        vault_selection.switch_vault(lambda _current: vault_b)
    assert settings.vault == vault_a.resolve()
