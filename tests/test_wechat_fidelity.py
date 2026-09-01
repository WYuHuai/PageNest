import base64
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from collector.images import save_images
from collector.models import ArticleInput, ImageInput
from collector.rendering import render_page
from collector.sanitizer import sanitize_content


def png_data_url(width: int, height: int) -> str:
    output = BytesIO()
    Image.new("RGB", (width, height), "#19b7a5").save(output, "PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def wechat_article(**changes) -> ArticleInput:
    values = {
        "capture_version": 12,
        "page_variant": "wechat-article",
        "title": "脱敏微信文章",
        "url": "https://mp.weixin.qq.com/s/sanitized-fixture",
        "captured_at": "2026-09-01T00:00:00+08:00",
        "article_text": "这是脱敏后的微信公众号正文，用于验证视觉语义和安全边界。",
        "mode": "original",
    }
    values.update(changes)
    return ArticleInput(**values)


def fidelity_source() -> str:
    emoji = png_data_url(24, 24)
    image = png_data_url(640, 360)
    return f'''<article class="rich_media_area_primary">
      <h1 id="activity-name">脱敏微信文章</h1>
      <div class="rich_media_meta_list" style="display:flex;align-items:center;gap:12px;border-left:4px solid #19b7a5;padding-left:12px">
        <span>示例作者</span><span>读完需要 6 分钟</span>
      </div>
      <section id="js_content" class="rich_media_content" style="background:linear-gradient(90deg,#eef 1px,transparent 1px);display:grid;gap:10px">
        <p><strong style="color:#1677ff;font-weight:700">蓝色重点</strong>
          <img src="{emoji}" alt="行内表情" style="display:inline;width:24px;height:24px;vertical-align:middle">
        </p>
        <img src="{image}" alt="正文配图" style="width:100%;height:auto;margin:18px 0">
        <div style="position:fixed;top:0;z-index:9999;transform:translateX(40px);background:url(https://evil.test/x.png);color:#333" onclick="steal()">不安全浮层</div>
        <a href="javascript:steal()">危险链接</a>
        <img src="https://evil.test/tracker.png" alt="远程跟踪图">
        <script>steal()</script>
      </section>
    </article>'''


def sanitized_fixture() -> str:
    return sanitize_content(
        fidelity_source(),
        preserve_visual_styles=True,
        restrict_positioning_styles=True,
    )


def test_wechat_safe_visual_semantics_and_renderer():
    cleaned = sanitized_fixture()
    rendered = render_page(
        wechat_article(),
        None,
        cleaned,
        "wechat-hash",
        "阅读记录/待整理",
        [],
    )

    assert "rich_media_meta_list" in cleaned
    assert "display:flex" in cleaned and "align-items:center" in cleaned  # WECHAT-01
    assert "border-left:4px solid #19b7a5" in cleaned  # WECHAT-02
    assert "background:linear-gradient(90deg,#eef 1px,transparent 1px)" in cleaned  # WECHAT-03
    assert "color:#1677ff" in cleaned and "font-weight:700" in cleaned  # WECHAT-04
    assert 'alt="行内表情"' in cleaned and "display:inline" in cleaned  # WECHAT-05
    assert 'alt="正文配图"' in cleaned and "width:100%" in cleaned and "height:auto" in cleaned  # WECHAT-06
    assert 'class="wechat-shell"' in rendered
    assert 'class="hero"' not in rendered


def test_wechat_visual_style_profile_removes_active_and_hijacking_content():
    cleaned = sanitized_fixture()

    assert "position:fixed" not in cleaned
    assert "z-index" not in cleaned
    assert "translateX" not in cleaned
    assert "url(" not in cleaned  # WECHAT-08
    assert "onclick" not in cleaned
    assert "javascript:" not in cleaned
    assert "<script" not in cleaned  # WECHAT-09
    assert "https://evil.test/tracker.png" not in cleaned
    assert "https://evil.test/x.png" not in cleaned  # WECHAT-10


@pytest.mark.asyncio
async def test_wechat_small_inline_image_is_kept(tmp_path: Path):
    source = png_data_url(32, 32)
    captured = wechat_article(
        images=[
            ImageInput(
                position_id="wechat-inline-emoji",
                resolved_url=source,
                data_url=source,
                alt="行内表情",
                width=32,
                height=32,
            )
        ]
    )

    saved, replacements = await save_images(captured, tmp_path / "assets")

    assert len(saved) == 1
    assert saved[0]["position_id"] == "wechat-inline-emoji"
    assert source in replacements


def test_non_wechat_small_decorative_image_is_still_filtered(tmp_path: Path):
    source = png_data_url(32, 32)
    captured = wechat_article(
        page_variant="standard",
        images=[ImageInput(resolved_url=source, data_url=source, width=32, height=32)],
    )

    async def run():
        return await save_images(captured, tmp_path / "assets")

    saved, replacements = __import__("asyncio").run(run())
    assert saved == []
    assert replacements == {}
