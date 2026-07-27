import base64
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from collector.media import SavedMedia, place_media, save_media
from collector.models import ArticleInput, MediaInput
from collector.sanitizer import sanitize_content
from collector.images import _asset_data_url, save_images
from collector.storage import collect
from collector.config import settings
from collector.models import ImageInput


def make_article(**changes):
    values = {
        "title": "媒体测试",
        "url": "https://example.com/article",
        "captured_at": "2026-07-26T00:00:00+08:00",
        "article_html": "<article><p>正文</p></article>",
        "article_text": "正文",
    }
    values.update(changes)
    return ArticleInput(**values)


def test_video_replaces_marker_without_player_control_text():
    payload = base64.b64encode(b"fake-mp4").decode("ascii")
    source = (
        '<article><p>正文</p>'
        '<div data-hermes-media-id="video-1">'
        '0/0 00:00/05:56 进度条 播放 倍速 超清 流畅'
        "</div></article>"
    )
    placed, stats = place_media(
        source,
        [SavedMedia("video-1", f"data:video/mp4;base64,{payload}")],
    )
    cleaned = sanitize_content(placed)

    assert stats == {"saved": 1, "failed": 0, "appended": 0}
    assert '<video controls=""' in cleaned
    assert "data:video/mp4;base64," in cleaned
    assert not any(word in cleaned for word in ("进度条", "倍速", "超清", "流畅"))


@pytest.mark.asyncio
async def test_direct_video_data_is_preserved():
    payload = base64.b64encode(b"small-video").decode("ascii")
    article = make_article(media=[
        MediaInput(
            position_id="video-1",
            data_url=f"data:video/mp4;base64,{payload}",
        )
    ])

    saved = await save_media(article)

    assert len(saved) == 1
    assert saved[0].error == ""
    assert saved[0].data_url == f"data:video/mp4;base64,{payload}"


@pytest.mark.asyncio
async def test_private_video_url_is_rejected_without_a_network_request():
    article = make_article(media=[
        MediaInput(position_id="video-1", source_url="http://127.0.0.1/private.mp4")
    ])

    saved = await save_media(article)

    assert len(saved) == 1
    assert "UnsafeDownloadUrl" in saved[0].error
    assert not saved[0].data_url


@pytest.mark.asyncio
async def test_animated_gif_keeps_all_frames(tmp_path: Path):
    output = BytesIO()
    frames = [
        Image.new("RGB", (100, 100), color)
        for color in ("red", "blue")
    ]
    frames[0].save(
        output,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=100,
        loop=0,
    )
    gif_data = "data:image/gif;base64," + base64.b64encode(output.getvalue()).decode("ascii")
    article = make_article(images=[
        ImageInput(
            position_id="gif-1",
            resolved_url=gif_data,
            data_url=gif_data,
            width=100,
            height=100,
        )
    ])
    assets = tmp_path / "assets"
    saved, _ = await save_images(article, assets)

    assert len(saved) == 1
    embedded = _asset_data_url(assets / saved[0]["filename"])
    body = base64.b64decode(embedded.split(",", 1)[1])
    with Image.open(BytesIO(body)) as image:
        assert image.format == "GIF"
        assert image.n_frames == 2



@pytest.mark.asyncio
async def test_collect_reports_and_embeds_video(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))
    payload = base64.b64encode(b"small-video").decode("ascii")
    captured = make_article(
        capture_version=7,
        category="auto",
        article_html=(
            '<article><p>真正正文</p>'
            '<div data-hermes-media-id="video-1">'
            '进度条 倍速 超清 流畅'
            "</div></article>"
        ),
        media=[
            MediaInput(
                position_id="video-1",
                data_url=f"data:video/mp4;base64,{payload}",
            )
        ],
    )

    result = await collect(captured)
    rendered = Path(result["page_path"]).read_text("utf-8")

    assert result["saved_videos"] == 1
    assert result["failed_videos"] == 0
    assert result["media_complete"] is True
    assert "data:video/mp4;base64," in rendered
    assert '<video controls=""' in rendered
    assert not any(word in rendered for word in ("进度条", "倍速", "超清", "流畅"))
