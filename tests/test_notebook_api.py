import base64
import asyncio

import pytest
from fastapi.testclient import TestClient

from collector.config import settings
from collector.limits import MAX_REQUEST_BYTES
from collector.main import app
from collector.notebooks import api
from collector.notebooks.analyzer import AnalysisResult
from collector.notebooks.models import AnalyzeNotebookEntryRequest
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
        (
            "/api/notebooks/id/entries/entry/analyze",
            {"relative_path": "Video Notebooks/N.pagenest"},
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


def test_analyze_api_updates_existing_entry_and_preserves_capture(notebook_client, monkeypatch):
    client, vault = notebook_client

    async def success(image_data_url, source_title, video_timestamp_seconds, source_url):
        assert image_data_url == PNG_DATA
        assert source_title == "视频原题"
        assert video_timestamp_seconds == 12
        assert source_url == "https://example.test/video"
        return AnalysisResult(
            status="complete",
            title="视觉标题",
            summary="画面展示了主要对象之间的关系。",
        )

    monkeypatch.setattr(api, "analyze_frame", success)
    created = client.post(
        "/api/notebooks",
        json={
            "title": "视觉 API",
            "source_url": "https://example.test/video",
            "source_title": "视频原题",
            "initial_entry": {
                "video_timestamp_seconds": 12,
                "image_data_url": PNG_DATA,
                "request_analysis": True,
            },
        },
        headers=auth_headers(),
    ).json()
    entry_id = created["entry_id"]
    before = next(vault.rglob("*.pagenest")).read_text("utf-8")

    response = client.post(
        f"/api/notebooks/{created['notebook_id']}/entries/{entry_id}/analyze",
        json={"relative_path": created["relative_path"]},
        headers=auth_headers(),
    )

    assert response.status_code == 200
    result = response.json()
    assert result["revision"] == 2
    assert result["entry_id"] == entry_id
    assert result["analysis_status"] == "complete"
    assert result["title"] == "视觉标题"
    assert result["summary"] == "画面展示了主要对象之间的关系。"
    after = next(vault.rglob("*.pagenest")).read_text("utf-8")
    assert before.count(PNG_DATA) == after.count(PNG_DATA) == 1


def test_analyze_api_failure_is_saved_and_never_returns_500(notebook_client, monkeypatch):
    client, _vault = notebook_client

    async def failed(*_args):
        return AnalysisResult(status="failed")

    monkeypatch.setattr(api, "analyze_frame", failed)
    created = client.post(
        "/api/notebooks",
        json={
            "title": "失败仍保存",
            "source_url": "https://example.test/video",
            "initial_entry": {
                "video_timestamp_seconds": 5,
                "image_data_url": PNG_DATA,
                "request_analysis": True,
            },
        },
        headers=auth_headers(),
    ).json()

    response = client.post(
        f"/api/notebooks/{created['notebook_id']}/entries/{created['entry_id']}/analyze",
        json={"relative_path": created["relative_path"]},
        headers=auth_headers(),
    )

    assert response.status_code == 200
    assert response.json()["entry_id"] == created["entry_id"]
    assert response.json()["analysis_status"] == "failed"


@pytest.mark.asyncio
async def test_running_analysis_releases_lock_for_new_append(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    store = NotebookStore(lambda: vault)
    monkeypatch.setattr(api, "notebook_store", store)
    started = asyncio.Event()
    release = asyncio.Event()

    async def delayed(*_args):
        started.set()
        await release.wait()
        return AnalysisResult(status="complete", title="A", summary="A summary")

    monkeypatch.setattr(api, "analyze_frame", delayed)
    created = await store.create(
        "并发 API",
        "https://example.test/video",
        initial_entry={
            "video_timestamp_seconds": 49,
            "image_data_url": PNG_DATA,
            "request_analysis": True,
        },
    )
    task = asyncio.create_task(
        api.analyze_notebook_entry(
            created["notebook_id"],
            created["entry_id"],
            AnalyzeNotebookEntryRequest(relative_path=created["relative_path"]),
        )
    )
    await asyncio.wait_for(started.wait(), timeout=1)

    appended = await asyncio.wait_for(
        store.append(
            created["notebook_id"],
            created["relative_path"],
            20,
            PNG_DATA,
            request_analysis=True,
        ),
        timeout=1,
    )
    release.set()
    analyzed = await asyncio.wait_for(task, timeout=1)
    restored = await store.get(created["notebook_id"], created["relative_path"])

    assert appended["revision"] == 2
    assert analyzed["revision"] == 3
    assert [entry["video_timestamp_seconds"] for entry in restored["entries"]] == [20, 49]
    assert len(restored["entries"]) == 2


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
