from fastapi.testclient import TestClient

from collector.config import settings
from collector.main import app


client = TestClient(app)


def test_cors_allows_only_chromium_extension_origins():
    allowed = "chrome-extension://" + "a" * 32
    headers = {
        "Origin": allowed,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    }

    response = client.options("/api/collect", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == allowed

    for denied in ("https://example.com", "chrome-extension://" + "z" * 32):
        response = client.options("/api/collect", headers={**headers, "Origin": denied})
        assert response.status_code == 400
        assert "access-control-allow-origin" not in response.headers


def test_public_status_hides_local_and_organizer_details(tmp_path, monkeypatch):
    vault = tmp_path / "private-vault"
    vault.mkdir()
    (vault / "private-article.hermes").write_text("private", encoding="utf-8")
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))
    monkeypatch.setattr(settings, "hermes_api_url", "https://private-api.example/v1")
    monkeypatch.setattr(settings, "hermes_model_name", "private-model")

    response = client.get("/status")

    assert response.status_code == 200
    assert "Obsidian 仓库：<b>已配置</b>" in response.text
    assert "智能整理：<b>已配置</b>" in response.text
    for private_value in (
        str(vault),
        vault.name,
        "private-article.hermes",
        "private-api.example",
        "private-model",
        "logs",
    ):
        assert private_value not in response.text
