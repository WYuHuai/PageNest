import asyncio

import pytest
from fastapi.testclient import TestClient

from collector import main
from collector.config import settings
from collector.limits import MAX_REQUEST_BYTES
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


def test_request_body_limit_rejects_before_authentication():
    origin = "chrome-extension://" + "a" * 32
    response = client.post(
        "/api/collect",
        content=b"",
        headers={
            "Content-Length": str(MAX_REQUEST_BYTES + 1),
            "Origin": origin,
        },
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "请求体过大"}
    assert response.headers["access-control-allow-origin"] == origin


def test_meta_reports_explicit_service_capabilities(monkeypatch):
    monkeypatch.setattr(settings, "local_collector_token", "test-token")

    response = client.get(
        "/api/meta",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "service_version": "1.8.0",
        "api_protocol_version": 1,
        "pagenest_format_version": 1,
        "supported_page_variants": [
            "standard",
            "bilibili-opus",
            "feishu-document",
            "xiaohongshu-note",
        ],
    }


@pytest.mark.asyncio
async def test_collection_slot_limits_parallel_work(monkeypatch):
    monkeypatch.setattr(main, "collection_slots", asyncio.Semaphore(2))
    active = 0
    peak = 0

    async def worker():
        nonlocal active, peak
        slot = main.collection_slot()
        await anext(slot)
        try:
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.01)
            active -= 1
        finally:
            await slot.aclose()

    await asyncio.gather(*(worker() for _ in range(5)))
    assert peak == 2


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


def test_pairing_is_disabled_without_trusted_store_ids(monkeypatch):
    monkeypatch.setattr(settings, "pagenest_extension_ids", "")
    monkeypatch.setattr(settings, "local_collector_token", "private-token")

    response = client.post(
        "/api/pair",
        headers={"Origin": "chrome-extension://" + "a" * 32},
    )

    assert response.status_code == 404
    assert "private-token" not in response.text


def test_pairing_returns_token_only_to_trusted_store_extension(monkeypatch):
    trusted_id = "a" * 32
    monkeypatch.setattr(settings, "pagenest_extension_ids", trusted_id)
    monkeypatch.setattr(settings, "local_collector_token", "private-token")

    allowed = client.post(
        "/api/pair",
        headers={"Origin": f"chrome-extension://{trusted_id}"},
    )
    denied = client.post(
        "/api/pair",
        headers={"Origin": "chrome-extension://" + "b" * 32},
    )

    assert allowed.status_code == 200
    assert allowed.json() == {"token": "private-token"}
    assert denied.status_code == 403
    assert "private-token" not in denied.text
