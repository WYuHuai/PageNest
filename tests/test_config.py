import re

import pytest

import run as service_run
from collector import config


def test_generic_organizer_settings_are_persisted_without_exposing_key(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("OBSIDIAN_VAULT_PATH=D:/Vault\nHERMES_API_URL=\n", "utf-8")
    monkeypatch.setattr(config, "ENV_FILE", env_file)
    monkeypatch.setattr(config.settings, "hermes_api_url", "")
    monkeypatch.setattr(config.settings, "hermes_model_name", "")
    monkeypatch.setattr(config.settings, "hermes_api_key", "")

    public = config.save_organizer_configuration(
        "https://api.example.test/v1/",
        "example-model",
        "secret-value",
    )

    assert public == {
        "api_url": "https://api.example.test/v1",
        "model_name": "example-model",
        "has_api_key": True,
    }
    assert "secret-value" not in str(public)
    saved = env_file.read_text("utf-8")
    assert "OBSIDIAN_VAULT_PATH=D:/Vault" in saved
    assert 'HERMES_API_URL="https://api.example.test/v1"' in saved
    assert 'HERMES_MODEL_NAME="example-model"' in saved
    assert 'HERMES_API_KEY="secret-value"' in saved


def test_generic_organizer_settings_reject_invalid_url():
    with pytest.raises(ValueError, match="http/https"):
        config.save_organizer_configuration("file:///unsafe", "model", "")


def test_generic_organizer_settings_reject_remote_http():
    with pytest.raises(ValueError, match="HTTPS"):
        config.save_organizer_configuration("http://api.example.test/v1", "model", "")


@pytest.mark.parametrize(
    "api_url",
    [
        "http://localhost:1234/v1",
        "http://127.0.0.1:1234/v1",
        "http://[::1]:1234/v1",
    ],
)
def test_generic_organizer_settings_allow_loopback_http(api_url, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / ".env")

    saved = config.save_organizer_configuration(api_url, "local-model", "")

    assert saved["api_url"] == api_url


def test_default_env_file_uses_explicit_override(tmp_path, monkeypatch):
    override = tmp_path / "custom.env"
    monkeypatch.setenv("PAGENEST_CONFIG_FILE", str(override))

    assert config.default_env_file() == override.resolve()


def test_default_env_file_lives_next_to_frozen_executable(tmp_path, monkeypatch):
    executable = tmp_path / "PageNestService.exe"
    monkeypatch.delenv("PAGENEST_CONFIG_FILE", raising=False)
    monkeypatch.setattr(config.sys, "frozen", True, raising=False)
    monkeypatch.setattr(config.sys, "executable", str(executable))

    assert config.default_env_file() == tmp_path / ".env"


def test_service_port_comes_from_loaded_configuration(monkeypatch):
    monkeypatch.setattr(service_run.settings, "pagenest_port", 18765)
    assert service_run.service_port() == 18765

    monkeypatch.setattr(service_run.settings, "pagenest_port", 70000)
    with pytest.raises(ValueError, match="between 1 and 65535"):
        service_run.service_port()


def test_extension_origin_regex_restricts_configured_store_ids(monkeypatch):
    first = "a" * 32
    second = "p" * 32
    monkeypatch.setattr(config.settings, "pagenest_extension_ids", f"{first},{second}")

    assert config.trusted_extension_origins() == {
        f"chrome-extension://{first}",
        f"chrome-extension://{second}",
    }
    pattern = re.compile(config.extension_origin_regex())
    assert pattern.fullmatch(f"chrome-extension://{first}")
    assert not pattern.fullmatch("chrome-extension://" + "b" * 32)


def test_extension_origin_regex_rejects_invalid_ids(monkeypatch):
    monkeypatch.setattr(config.settings, "pagenest_extension_ids", "not-an-extension")

    with pytest.raises(ValueError, match="invalid Chromium extension ID"):
        config.extension_origin_regex()
