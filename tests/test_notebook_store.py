import asyncio
import base64
import os
import socket
import subprocess
import threading
import time
from pathlib import Path

import pytest

from collector.notebooks.models import MAX_NOTEBOOK_SCREENSHOT_BYTES
from collector.notebooks.rendering import read_notebook
from collector.notebooks.store import (
    DEFAULT_NOTEBOOK_DIRECTORY,
    NotebookNotFoundError,
    NotebookStore,
    NotebookStoreError,
    NotebookWriteError,
    _validate_image_data_url,
)


PNG_BYTES = b"\x89PNG\r\n\x1a\nnotebook-frame"
PNG_DATA = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode("ascii")


def make_store(tmp_path: Path) -> tuple[NotebookStore, Path]:
    vault = tmp_path / "vault"
    vault.mkdir()
    return NotebookStore(lambda: vault), vault


def page(vault: Path, result: dict) -> Path:
    return vault.joinpath(*result["relative_path"].split("/"))


@pytest.mark.asyncio
async def test_create_append_order_revision_and_restart(tmp_path):
    store, vault = make_store(tmp_path)
    created = await store.create("视频笔记", "https://example.test/video", "示例")

    assert created["revision"] == 1
    assert created["entry_count"] == 0
    assert created["document_type"] == "video-notebook"
    assert created["relative_path"].startswith(f"{DEFAULT_NOTEBOOK_DIRECTORY}/")
    notebook_path = page(vault, created)
    assert notebook_path.is_file()

    first = await store.append(
        created["notebook_id"], created["relative_path"], 3.5, PNG_DATA, "第一帧"
    )
    restarted_store = NotebookStore(lambda: vault)
    second = await restarted_store.append(
        created["notebook_id"], first["relative_path"], 9, PNG_DATA, "第二帧"
    )
    restored = read_notebook(notebook_path.read_text("utf-8"))

    assert second["revision"] == 3
    assert second["entry_count"] == 2
    assert [entry.video_timestamp_seconds for entry in restored.entries] == [3.5, 9]
    assert [entry.title for entry in restored.entries] == ["第一帧", "第二帧"]
    assert notebook_path.read_text("utf-8").count(PNG_DATA) == 2


@pytest.mark.asyncio
async def test_create_is_collision_safe_and_accepts_same_source_more_than_once(tmp_path):
    store, vault = make_store(tmp_path)
    first = await store.create("同名", "https://example.test/video")
    second = await store.create("同名", "https://example.test/video")
    reserved = await store.create("CON", "https://example.test/video")

    assert first["notebook_id"] != second["notebook_id"]
    assert first["relative_path"].endswith("同名.pagenest")
    assert second["relative_path"].endswith("同名_2.pagenest")
    assert reserved["relative_path"].endswith("_CON.pagenest")
    assert all(page(vault, item).is_file() for item in (first, second, reserved))


@pytest.mark.asyncio
async def test_source_url_is_metadata_only_and_never_fetched(tmp_path, monkeypatch):
    store, vault = make_store(tmp_path)

    def reject_network(*_args, **_kwargs):
        raise AssertionError("Notebook store must not access the network")

    monkeypatch.setattr(socket, "create_connection", reject_network)
    created = await store.create(
        "仅保存来源", "https://remote.invalid/video", "远程标题"
    )

    assert page(vault, created).is_file()


@pytest.mark.asyncio
async def test_same_notebook_concurrent_append_loses_no_entry(tmp_path):
    store, vault = make_store(tmp_path)
    created = await store.create("并发", "https://example.test/video")

    await asyncio.gather(
        *(
            store.append(
                created["notebook_id"], created["relative_path"], index, PNG_DATA
            )
            for index in range(8)
        )
    )
    restored = read_notebook(page(vault, created).read_text("utf-8"))

    assert len(restored.entries) == 8
    assert {entry.video_timestamp_seconds for entry in restored.entries} == set(range(8))
    assert restored.revision == 9


@pytest.mark.asyncio
async def test_different_notebooks_do_not_share_a_global_append_lock(tmp_path, monkeypatch):
    store, _vault = make_store(tmp_path)
    first = await store.create("A", "https://example.test/a")
    second = await store.create("B", "https://example.test/b")
    real_write = store._write_atomic
    guard = threading.Lock()
    active = 0
    peak = 0

    def observed_write(path, content, *, replace_existing):
        nonlocal active, peak
        if replace_existing:
            with guard:
                active += 1
                peak = max(peak, active)
            time.sleep(0.05)
            with guard:
                active -= 1
        return real_write(path, content, replace_existing=replace_existing)

    monkeypatch.setattr(store, "_write_atomic", observed_write)
    await asyncio.gather(
        store.append(first["notebook_id"], first["relative_path"], 1, PNG_DATA),
        store.append(second["notebook_id"], second["relative_path"], 2, PNG_DATA),
    )

    assert peak == 2


@pytest.mark.asyncio
async def test_failed_append_keeps_previous_complete_file(tmp_path, monkeypatch):
    store, vault = make_store(tmp_path)
    created = await store.create("原子写入", "https://example.test/video")
    notebook_path = page(vault, created)
    before = notebook_path.read_bytes()

    def fail_write(_path, _content, *, replace_existing):
        assert replace_existing is True
        raise OSError("simulated write failure")

    monkeypatch.setattr(store, "_write_atomic", fail_write)
    with pytest.raises(NotebookWriteError, match="无法更新"):
        await store.append(
            created["notebook_id"], created["relative_path"], 1, PNG_DATA
        )

    assert notebook_path.read_bytes() == before
    assert not list(notebook_path.parent.glob("*.tmp"))


@pytest.mark.asyncio
async def test_append_render_failure_keeps_previous_complete_file(tmp_path, monkeypatch):
    store, vault = make_store(tmp_path)
    created = await store.create("渲染失败", "https://example.test/video")
    notebook_path = page(vault, created)
    before = notebook_path.read_bytes()

    def fail_render(_notebook):
        raise RuntimeError("simulated render failure")

    monkeypatch.setattr("collector.notebooks.store.render_notebook", fail_render)
    with pytest.raises(NotebookWriteError, match="无法更新"):
        await store.append(
            created["notebook_id"], created["relative_path"], 1, PNG_DATA
        )

    assert notebook_path.read_bytes() == before


@pytest.mark.asyncio
async def test_create_write_failure_leaves_no_partial_notebook(tmp_path, monkeypatch):
    store, vault = make_store(tmp_path)

    def fail_write(_path, _content, *, replace_existing):
        assert replace_existing is False
        raise OSError("simulated create failure")

    monkeypatch.setattr(store, "_write_atomic", fail_write)
    with pytest.raises(NotebookWriteError, match="无法写入"):
        await store.create("创建失败", "https://example.test/video")

    assert not list(vault.glob("**/*.pagenest"))


@pytest.mark.asyncio
async def test_rename_changes_filename_preserves_id_and_handles_collision(tmp_path):
    store, vault = make_store(tmp_path)
    occupied = await store.create("目标", "https://example.test/occupied")
    created = await store.create("原名", "https://example.test/video")
    old_path = page(vault, created)

    renamed = await store.rename(
        created["notebook_id"], created["relative_path"], "目标"
    )
    new_path = page(vault, renamed)

    assert renamed["notebook_id"] == created["notebook_id"]
    assert renamed["revision"] == 2
    assert renamed["relative_path"].endswith("目标_2.pagenest")
    assert new_path.is_file() and not old_path.exists()
    assert page(vault, occupied).is_file()
    with pytest.raises(NotebookStoreError, match="标题不能为空"):
        await store.rename(
            renamed["notebook_id"], renamed["relative_path"], "   "
        )


@pytest.mark.asyncio
async def test_rename_write_failure_leaves_original_file(tmp_path, monkeypatch):
    store, vault = make_store(tmp_path)
    created = await store.create("保留原文件", "https://example.test/video")
    original = page(vault, created)
    before = original.read_bytes()

    def fail_write(_path, _content, *, replace_existing):
        raise OSError("simulated rename failure")

    monkeypatch.setattr(store, "_write_atomic", fail_write)
    with pytest.raises(NotebookWriteError, match="无法重命名"):
        await store.rename(
            created["notebook_id"], created["relative_path"], "新文件名"
        )

    assert original.read_bytes() == before
    assert not (original.parent / "新文件名.pagenest").exists()


@pytest.mark.asyncio
async def test_rename_render_failure_leaves_original_file(tmp_path, monkeypatch):
    store, vault = make_store(tmp_path)
    created = await store.create("原始标题", "https://example.test/video")
    original = page(vault, created)
    before = original.read_bytes()

    def fail_render(_notebook):
        raise RuntimeError("simulated rename render failure")

    monkeypatch.setattr("collector.notebooks.store.render_notebook", fail_render)
    with pytest.raises(NotebookWriteError, match="无法重命名"):
        await store.rename(
            created["notebook_id"], created["relative_path"], "新标题"
        )

    assert original.read_bytes() == before
    assert not (original.parent / "新标题.pagenest").exists()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "unsafe",
    [
        "../outside.pagenest",
        "/absolute.pagenest",
        "C:/private.pagenest",
        "\\\\server\\share\\private.pagenest",
        "Video Notebooks\\private.pagenest",
    ],
)
async def test_path_traversal_and_absolute_paths_are_rejected(tmp_path, unsafe):
    store, _vault = make_store(tmp_path)
    with pytest.raises(NotebookStoreError):
        await store.get("missing", unsafe)


@pytest.mark.asyncio
async def test_symlink_escape_is_rejected_when_platform_allows_symlinks(tmp_path):
    store, vault = make_store(tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "private.pagenest").write_text("private", encoding="utf-8")
    directory = vault / DEFAULT_NOTEBOOK_DIRECTORY
    directory.mkdir()
    link = directory / "escape"
    try:
        os.symlink(outside, link, target_is_directory=True)
    except OSError:
        if os.name != "nt":
            pytest.skip("Symlink creation is not available")
        result = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(outside)],
            capture_output=True,
            check=False,
        )
        if result.returncode:
            pytest.skip("Symlink and junction creation are not available")

    with pytest.raises(NotebookStoreError):
        await store.get(
            "outside", f"{DEFAULT_NOTEBOOK_DIRECTORY}/escape/private.pagenest"
        )


@pytest.mark.asyncio
async def test_missing_file_and_notebook_id_mismatch_are_controlled(tmp_path):
    store, _vault = make_store(tmp_path)
    created = await store.create("ID", "https://example.test/video")

    with pytest.raises(NotebookNotFoundError):
        await store.get("missing", "Video Notebooks/missing.pagenest")
    with pytest.raises(NotebookStoreError, match="不匹配"):
        await store.get("wrong-id", created["relative_path"])


@pytest.mark.parametrize(
    "value",
    [
        "https://example.test/frame.png",
        "file:///private/frame.png",
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "data:image/png;base64,%%%",
        "data:image/png;base64,SGVsbG8=",
    ],
)
def test_non_raster_remote_file_svg_and_invalid_image_data_are_rejected(value):
    with pytest.raises(NotebookStoreError):
        _validate_image_data_url(value)


def test_supported_raster_mime_signatures_are_accepted():
    values = (
        ("image/png", b"\x89PNG\r\n\x1a\ncontent"),
        ("image/jpeg", b"\xff\xd8\xffcontent"),
        ("image/webp", b"RIFF\x04\x00\x00\x00WEBPcontent"),
    )

    for mime, content in values:
        value = f"data:{mime};base64," + base64.b64encode(content).decode("ascii")
        assert _validate_image_data_url(value) == value


def test_screenshot_size_boundary_and_oversize_are_enforced():
    boundary = b"\x89PNG\r\n\x1a\n" + b"x" * (MAX_NOTEBOOK_SCREENSHOT_BYTES - 8)
    accepted = "data:image/png;base64," + base64.b64encode(boundary).decode("ascii")
    oversized_bytes = boundary + b"x"
    oversized = "data:image/png;base64," + base64.b64encode(oversized_bytes).decode(
        "ascii"
    )

    assert _validate_image_data_url(accepted) == accepted
    with pytest.raises(NotebookStoreError, match="10 MiB"):
        _validate_image_data_url(oversized)


@pytest.mark.asyncio
async def test_ten_entry_growth_is_linear_and_images_are_not_duplicated(tmp_path):
    store, vault = make_store(tmp_path)
    created = await store.create("十帧", "https://example.test/video")
    notebook_path = page(vault, created)
    sizes = [notebook_path.stat().st_size]
    result = created
    for index in range(10):
        result = await store.append(
            result["notebook_id"], result["relative_path"], index, PNG_DATA
        )
        sizes.append(notebook_path.stat().st_size)

    rendered = notebook_path.read_text("utf-8")
    increments = [right - left for left, right in zip(sizes, sizes[1:])]
    assert result["entry_count"] == 10
    assert rendered.count(PNG_DATA) == 10
    assert max(increments) < min(increments) * 1.25
