import base64

import pytest
from fastapi.testclient import TestClient

from collector.config import settings
from collector.limits import MAX_REQUEST_BYTES
from collector.main import app
from collector.notebooks import api
from collector.notebooks.store import NotebookStore


PNG_DATA = "data:image/png;base64," + base64.b64encode(
    b"\x89PNG\r\n\x1a\napi-frame"
).decode("ascii")


@pytest.fixture
def notebook_client(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "local_collector_token", "notebook-token")
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))
    monkeypatch.setattr(api, "notebook_store", NotebookStore(lambda: vault))
    return TestClient(app), vault


def auth_headers():
    return {"Authorization": "Bearer notebook-token"}


def test_notebook_api_requires_existing_auth_for_all_mutations(notebook_client):
    client, _vault = notebook_client
    endpoints = (
        ("/api/notebooks", {"title": "N", "source_url": "https://example.test"}),
        (
            "/api/notebooks/id/entries",
            {
                "relative_path": "Video Notebooks/N.pagenest",
                "video_timestamp_seconds": 1,
                "image_data_url": PNG_DATA,
            },
        ),
        (
            "/api/notebooks/id/rename",
            {"relative_path": "Video Notebooks/N.pagenest", "title": "New"},
        ),
    )

    for path, payload in endpoints:
        response = client.post(path, json=payload)
        assert response.status_code == 401


def test_notebook_routes_share_the_existing_request_body_limit(notebook_client):
    client, _vault = notebook_client
    response = client.post(
        "/api/notebooks",
        content=b"",
        headers={**auth_headers(), "Content-Length": str(MAX_REQUEST_BYTES + 1)},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "请求体过大"}


def test_authorized_create_get_append_and_rename(notebook_client):
    client, vault = notebook_client
    created_response = client.post(
        "/api/notebooks",
        json={
            "title": "API 笔记",
            "source_url": "https://example.test/video",
            "source_title": "示例视频",
        },
        headers=auth_headers(),
    )
    assert created_response.status_code == 200
    created = created_response.json()
    assert created["revision"] == 1
    assert str(vault) not in created_response.text

    appended_response = client.post(
        f"/api/notebooks/{created['notebook_id']}/entries",
        json={
            "relative_path": created["relative_path"],
            "video_timestamp_seconds": 2.5,
            "image_data_url": PNG_DATA,
            "summary": "关键画面",
        },
        headers=auth_headers(),
    )
    assert appended_response.status_code == 200
    appended = appended_response.json()
    assert appended["revision"] == 2
    assert appended["entry_count"] == 1
    assert PNG_DATA not in appended_response.text

    fetched_response = client.get(
        f"/api/notebooks/{created['notebook_id']}",
        params={"relative_path": created["relative_path"]},
        headers=auth_headers(),
    )
    assert fetched_response.status_code == 200
    assert fetched_response.json()["entries"][0]["summary"] == "关键画面"

    renamed_response = client.post(
        f"/api/notebooks/{created['notebook_id']}/rename",
        json={"relative_path": created["relative_path"], "title": "重命名笔记"},
        headers=auth_headers(),
    )
    assert renamed_response.status_code == 200
    renamed = renamed_response.json()
    assert renamed["revision"] == 3
    assert renamed["relative_path"].endswith("重命名笔记.pagenest")


def test_create_api_accepts_an_atomic_initial_entry(notebook_client):
    client, vault = notebook_client

    response = client.post(
        "/api/notebooks",
        json={
            "title": "视频原题",
            "source_url": "https://example.test/video",
            "source_title": "视频原题",
            "initial_entry": {
                "video_timestamp_seconds": 20,
                "image_data_url": PNG_DATA,
            },
        },
        headers=auth_headers(),
    )

    assert response.status_code == 200
    created = response.json()
    assert created["revision"] == 1
    assert created["entry_count"] == 1
    assert PNG_DATA not in response.text
    files = list(vault.rglob("*.pagenest"))
    assert len(files) == 1
    assert files[0].read_text("utf-8").count(PNG_DATA) == 1


def test_get_api_returns_video_timeline_order(notebook_client):
    client, _vault = notebook_client
    created = client.post(
        "/api/notebooks",
        json={"title": "API 时间线", "source_url": "https://example.test/video"},
        headers=auth_headers(),
    ).json()
    for timestamp in (49, 20):
        response = client.post(
            f"/api/notebooks/{created['notebook_id']}/entries",
            json={
                "relative_path": created["relative_path"],
                "video_timestamp_seconds": timestamp,
                "image_data_url": PNG_DATA,
            },
            headers=auth_headers(),
        )
        assert response.status_code == 200

    fetched = client.get(
        f"/api/notebooks/{created['notebook_id']}",
        params={"relative_path": created["relative_path"]},
        headers=auth_headers(),
    )
    assert fetched.status_code == 200
    assert [entry["video_timestamp_seconds"] for entry in fetched.json()["entries"]] == [
        20,
        49,
    ]


def test_malformed_missing_and_mismatched_notebook_errors_are_controlled(notebook_client):
    client, _vault = notebook_client
    malformed = client.post(
        "/api/notebooks",
        json={"title": "", "source_url": "file:///private/video.mp4"},
        headers=auth_headers(),
    )
    missing = client.get(
        "/api/notebooks/missing",
        params={"relative_path": "Video Notebooks/missing.pagenest"},
        headers=auth_headers(),
    )
    created = client.post(
        "/api/notebooks",
        json={"title": "真实 ID", "source_url": "https://example.test/video"},
        headers=auth_headers(),
    ).json()
    mismatch = client.get(
        "/api/notebooks/wrong-id",
        params={"relative_path": created["relative_path"]},
        headers=auth_headers(),
    )
    invalid_image = client.post(
        f"/api/notebooks/{created['notebook_id']}/entries",
        json={
            "relative_path": created["relative_path"],
            "video_timestamp_seconds": 1,
            "image_data_url": "https://remote.invalid/frame.png",
        },
        headers=auth_headers(),
    )

    assert malformed.status_code == 422
    assert missing.status_code == 404
    assert mismatch.status_code == 400
    assert invalid_image.status_code == 400
    for response in (malformed, missing, mismatch, invalid_image):
        assert response.status_code < 500
        assert "Traceback" not in response.text
