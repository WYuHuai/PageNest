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
    try:
        config.save_organizer_configuration("file:///unsafe", "model", "")
    except ValueError as exc:
        assert "http/https" in str(exc)
    else:
        raise AssertionError("invalid URL was accepted")
