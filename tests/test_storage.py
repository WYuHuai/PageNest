import asyncio
import base64
from pathlib import Path
import pytest
from collector.config import settings
from collector.models import ArticleInput, HermesResult, ImageInput
from collector.rendering import render_page
from collector.sanitizer import sanitize_content
from collector import images, storage
from collector.images import _data_bytes, _download_image, place_unreferenced_images, prune_invalid_images, save_images
from collector.storage import collect

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAzElEQVR4nO3QMQEAAAgDINc/9K3hHFQgE7OTTCZTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwlMpXIVCJTiUwF/rcBwoT3zMAAAAAASUVORK5CYII="

def article(**changes):
    data = dict(title='中文：非法/标题*测试', url='https://example.test/a?utm_source=x', canonical_url='https://example.test/a', captured_at='2026-07-15T12:00:00+08:00', article_html=f'<article><h1>标题</h1><p>图片之前。</p><img src="{PNG}"><p>图片之后。</p></article>', article_text='足够完整的正文内容。', mode='original')
    data.update(changes)
    return ArticleInput(**data)

@pytest.mark.asyncio
async def test_single_offline_page_and_duplicate(tmp_path: Path, monkeypatch):
    vault = tmp_path / '知识库'
    vault.mkdir()
    (vault / '各类学习知识' / '机器人').mkdir(parents=True)
    monkeypatch.setattr(settings, 'obsidian_vault_path', str(vault))

    def reject_move(*_args, **_kwargs):
        raise AssertionError("manual destinations must not move an already-written page")

    monkeypatch.setattr(Path, "replace", reject_move)
    real_write_text = Path.write_text
    vault_writes = []

    def track_write(path, *args, **kwargs):
        if path.suffix == ".pagenest":
            vault_writes.append(path)
        return real_write_text(path, *args, **kwargs)

    async def reject_organizer(*_args):
        raise AssertionError("original mode must never call the AI organizer")

    monkeypatch.setattr(Path, "write_text", track_write)
    monkeypatch.setattr(storage, "call_hermes", reject_organizer)
    first = await collect(article(images=[ImageInput(resolved_url=PNG, width=100, height=100)], category='各类学习知识/机器人'))
    page = Path(first['page_path'])
    rendered = page.read_text('utf-8')
    assert page.suffix == '.pagenest' and page.parent == vault/'各类学习知识'/'机器人'
    assert list(page.parent.iterdir()) == [page]
    assert 'data:image/png;base64,' in rendered
    assert rendered.index('图片之前') < rendered.index('data:image/png;base64,') < rendered.index('图片之后')
    assert 'assets/' not in rendered and first['single_file'] is True
    assert 'hermes-save-complete' in rendered
    assert vault_writes == [page]
    second = await collect(article(user_note='第二次备注'))
    assert second['duplicate'] is True

@pytest.mark.asyncio
async def test_image_downloads_are_concurrent(monkeypatch):
    body = base64.b64decode(PNG.split(",", 1)[1])
    active = 0
    peak = 0

    class Download:
        content_type = "image/png"

        def __init__(self, content):
            self.body = content

    async def fake_fetch(_client, _source, **_options):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.02)
        active -= 1
        return Download(body)

    monkeypatch.setattr(images, "fetch_bytes", fake_fetch)
    semaphore = asyncio.Semaphore(3)
    items = [ImageInput(resolved_url=f"https://example.test/{index}.png") for index in range(6)]
    results = await asyncio.gather(*[
        _download_image(object(), semaphore, index, item)
        for index, item in enumerate(items)
    ])
    assert peak == 3
    assert all(result[3] == body and not result[5] for result in results)


@pytest.mark.asyncio
async def test_image_failure_still_saves_one_readable_page(tmp_path: Path, monkeypatch):
    vault = tmp_path / "知识库"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))

    async def fail_images(*_args):
        raise RuntimeError("模拟图片阶段崩溃")

    monkeypatch.setattr(storage, "save_images", fail_images)
    result = await collect(article())
    page = Path(result["page_path"])
    assert page.exists()
    assert result["image_error"]
    assert "图片之前" in page.read_text("utf-8") and "图片之后" in page.read_text("utf-8")


def test_sanitizer_blocks_active_and_remote_content():
    source = '<article><h1>安全标题</h1><script>evil()</script><p onclick="evil()">正文</p><img src="https://remote.test/x.png" onerror="evil()"></article>'
    cleaned = sanitize_content(source)
    assert 'evil()' not in cleaned
    assert 'onclick' not in cleaned and 'onerror' not in cleaned
    assert 'https://remote.test' not in cleaned
    assert '此图片未能离线保存' in cleaned

def test_code_blocks_are_readable_copyable_and_external_links_survive():
    cleaned = sanitize_content(
        '<article><pre><code><span style="color:white;background:white">print("ok")</span></code></pre>'
        '<a href="https://github.com/example/project"><svg></svg></a></article>'
    )
    rendered = render_page(article(), None, cleaned, "code-hash", "\u9605\u8bfb\u8bb0\u5f55", [])

    assert 'data-hermes-kind="code-shell"' in rendered
    assert 'data-hermes-copy' in rendered
    assert "\u590d\u5236\u4ee3\u7801" in rendered and "\u5df2\u590d\u5236" in rendered
    assert 'background:#11131a!important' in rendered
    assert '[data-hermes-kind="code-shell"] pre *' in rendered
    assert 'color:inherit!important' not in rendered
    assert 'href="https://github.com/example/project"' in rendered
    assert "\u6253\u5f00 GitHub \u94fe\u63a5" in rendered
    assert "script-src 'nonce-hermes-offline'" in rendered
    assert '<script nonce="hermes-offline">' in rendered
    assert 'window.parent.postMessage({type: "hermes-copy"' not in rendered


@pytest.mark.asyncio
async def test_invalid_vault(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, 'obsidian_vault_path', str(tmp_path/'missing'))
    with pytest.raises(ValueError):
        await collect(article())


def test_page_template_is_offline_and_polished():
    result = HermesResult(normalized_title='机器人教程', one_sentence_summary='离线摘要', abstract='完整摘要', key_points=['观点一'], obsidian_tags=['机器人'])
    rendered = render_page(article(user_note='用于机器人项目的设计参考'), result, '<p>正文</p>', 'abc', '各类学习知识/机器人', [])
    assert "default-src 'none'" in rendered
    assert '离线网页收藏' in rendered and 'Hermes 离线网页收藏' not in rendered
    assert '机器人教程' in rendered and '完整摘要' in rendered and '#机器人' in rendered
    assert '我的收藏备注' in rendered and '用于机器人项目的设计参考' in rendered
    assert '与现有项目的关系' not in rendered
    assert '后续行动' not in rendered


def test_page_always_shows_an_empty_saved_note():
    rendered = render_page(article(user_note=''), None, '<p>正文</p>', 'abc', '阅读记录/待整理', [])
    assert '我的收藏备注' in rendered
    assert '未填写收藏备注。' in rendered



def test_feishu_template_restores_title_and_labels():
    captured = article(
        title="\u2060\u200bDIY\u6559\u7a0b\u202c - \u98de\u4e66\u4e91\u6587\u6863",
        page_variant="feishu-document",
        capture_version=9,
    )
    rendered = render_page(captured, None, "<p>\u6b63\u6587</p>", "feishu-hash", "\u673a\u5668\u4eba", [])

    assert "\u2060" not in rendered and "\u200b" not in rendered and "\u202c" not in rendered
    assert '<h1 class="doc-document-title">DIY\u6559\u7a0b - \u98de\u4e66\u4e91\u6587\u6863</h1>' in rendered
    assert "\u79bb\u7ebf\u5355\u6587\u4ef6" in rendered
    assert "\u6211\u7684\u6536\u85cf\u5907\u6ce8" in rendered
    assert "????????" not in rendered


def test_downloaded_image_without_dom_node_is_inserted_near_context(tmp_path: Path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "image-001.png").write_bytes(base64.b64decode(PNG.split(",", 1)[1]))
    source = "<article><p>电路图所在段落，下面应当显示图片。</p><p>后续正文。</p></article>"

    placed = place_unreferenced_images(source, [{
        "filename": "image-001.png",
        "alt": "电路图",
        "caption": "控制器电路",
        "nearby_text": "电路图所在段落，下面应当显示图片。",
        "order": 1,
    }], assets)
    cleaned = sanitize_content(placed)

    assert 'data:image/png;base64,' in cleaned
    assert cleaned.index("电路图所在段落") < cleaned.index("data:image/png;base64,") < cleaned.index("后续正文")
    assert "控制器电路" in cleaned


@pytest.mark.asyncio
async def test_quick_mode_runs_text_organizer_while_images_download(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))
    organizer_started = asyncio.Event()

    async def fake_organizer(_article, image_context):
        assert image_context == []
        organizer_started.set()
        await asyncio.sleep(0.01)
        return HermesResult(suggested_category=storage.DEFAULT_CATEGORY), "", 0.01, ""

    async def fake_images(_article, _assets):
        await asyncio.wait_for(organizer_started.wait(), timeout=0.2)
        return [], {}

    monkeypatch.setattr(storage, "call_hermes", fake_organizer)
    monkeypatch.setattr(storage, "save_images", fake_images)

    result = await collect(article(mode="quick", category="auto"))

    assert result["hermes_success"] is True



def test_position_ids_restore_repeated_images_to_exact_dom_nodes(tmp_path: Path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "image-001.png").write_bytes(base64.b64decode(PNG.split(",", 1)[1]))
    source = """<article>
    <p>第一段</p><img data-hermes-image-id="position-a" src="https://remote/a.png">
    <p>中间段</p><img data-hermes-image-id="position-b" src="https://remote/a.png">
    <p>最后段</p></article>"""
    images = [
        {"filename": "image-001.png", "position_id": "position-a", "order": 1, "alt": "第一张"},
        {"filename": "image-001.png", "position_id": "position-b", "order": 2, "alt": "第二张"},
    ]

    cleaned = sanitize_content(place_unreferenced_images(source, images, assets))

    assert cleaned.count("data:image/png;base64,") == 2
    first = cleaned.index("第一段")
    first_image = cleaned.index("data:image/png;base64,", first)
    middle = cleaned.index("中间段")
    second_image = cleaned.index("data:image/png;base64,", first_image + 1)
    last = cleaned.index("最后段")
    assert first < first_image < middle < second_image < last
    assert "data-hermes-image-id" not in cleaned



def test_legacy_images_fill_existing_dom_slots_in_order(tmp_path: Path):
    assets = tmp_path / "assets"
    assets.mkdir()
    image_bytes = base64.b64decode(PNG.split(",", 1)[1])
    (assets / "image-001.png").write_bytes(image_bytes)
    (assets / "image-002.png").write_bytes(image_bytes)
    source = """<article>
    <p>before-a</p><img src="https://remote/a.png"><p>between</p>
    <img src="https://remote/b.png"><p>after-b</p></article>"""
    images = [
        {"filename": "image-001.png", "order": 1, "source_type": "img"},
        {"filename": "image-002.png", "order": 2, "source_type": "img"},
    ]

    placed, stats = place_unreferenced_images(source, images, assets, with_stats=True)

    assert stats == {"exact": 0, "ordinal": 2, "existing": 0, "context": 0, "appended": 0, "unplaced": 0}
    assert placed.count("data:image/png;base64,") == 2
    assert placed.index("before-a") < placed.index("data:image/png;base64,") < placed.index("between")
    assert placed.index("between") < placed.rindex("data:image/png;base64,") < placed.index("after-b")


@pytest.mark.asyncio
async def test_exact_image_placement_does_not_depend_on_organizer(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))

    async def busy_organizer(_article, _images):
        return None, "", 0.01, "organizer busy"

    monkeypatch.setattr(storage, "call_hermes", busy_organizer)
    captured = article(
        mode="quick",
        capture_version=2,
        article_html=(
            '<article><p>before</p><img data-hermes-image-id="image-a" '
            'src="https://remote.test/a.png"><p>after</p></article>'
        ),
        images=[ImageInput(
            position_id="image-a",
            resolved_url=PNG,
            width=100,
            height=100,
            order=1,
        )],
    )

    result = await collect(captured)
    rendered = Path(result["page_path"]).read_text("utf-8")

    assert result["hermes_success"] is False
    assert result["image_placement"]["exact"] == 1
    assert result["image_placement"]["appended"] == 0
    assert rendered.index(">before<") < rendered.index("data:image/png;base64,") < rendered.index(">after<")



def test_strict_feishu_placement_never_appends_unmatched_images(tmp_path: Path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "image-001.png").write_bytes(base64.b64decode(PNG.split(",", 1)[1]))
    source = "<article><p>正文开始</p><p>正文结束</p></article>"

    placed, stats = place_unreferenced_images(
        source,
        [{"filename": "image-001.png", "position_id": "missing-block-image", "order": 1}],
        assets,
        with_stats=True,
        allow_fallback=False,
    )

    assert "data:image/png;base64," not in placed
    assert stats["unplaced"] == 1
    assert stats["appended"] == 0



@pytest.mark.asyncio
async def test_feishu_block_sequence_saves_repeated_images_in_place_without_ai(
    tmp_path: Path,
    monkeypatch,
):
    vault = tmp_path / "vault"
    target = vault / "机器人"
    target.mkdir(parents=True)
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))

    async def reject_organizer(*_args):
        raise AssertionError("original mode must not call AI")

    monkeypatch.setattr(storage, "call_hermes", reject_organizer)
    captured = article(
        mode="original",
        category="机器人",
        capture_version=3,
        image_placement_policy="strict",
        article_html=(
            '<article><p>block-a-text</p>'
            '<img data-hermes-image-id="block-a-image" src="https://remote.test/shared.png">'
            '<p>block-b-text</p>'
            '<img data-hermes-image-id="block-b-image" src="https://remote.test/shared.png">'
            '<p>block-c-text</p></article>'
        ),
        images=[
            ImageInput(
                position_id="block-a-image",
                resolved_url=PNG,
                width=100,
                height=100,
                order=0,
            ),
            ImageInput(
                position_id="block-b-image",
                resolved_url=PNG,
                width=100,
                height=100,
                order=1,
            ),
        ],
    )

    result = await collect(captured)
    rendered = Path(result["page_path"]).read_text("utf-8")
    first_image = rendered.index("data:image/png;base64,")
    second_image = rendered.index("data:image/png;base64,", first_image + 1)

    assert result["hermes_success"] is False
    assert result["image_placement"]["exact"] == 2
    assert result["image_placement"]["appended"] == 0
    assert result["image_placement"]["unplaced"] == 0
    assert (
        rendered.index("block-a-text")
        < first_image
        < rendered.index("block-b-text")
        < second_image
        < rendered.index("block-c-text")
    )



@pytest.mark.asyncio
async def test_new_capture_protocol_rebuilds_an_old_saved_page(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))
    old = await collect(article(capture_version=1))
    upgraded = await collect(article(capture_version=7))

    assert old["duplicate"] is False
    assert upgraded["duplicate"] is False
    assert Path(old["page_path"]) != Path(upgraded["page_path"])
    assert '<meta name="hermes-capture-version" content="7">' in Path(upgraded["page_path"]).read_text("utf-8")



def test_url_encoded_empty_svg_is_decoded_without_base64_corruption():
    body, mime = _data_bytes(
        "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E"
    )

    assert mime == "image/svg+xml"
    assert body.startswith(b"<svg")
    assert body.endswith(b"</svg>")


@pytest.mark.asyncio
async def test_wechat_empty_svg_placeholder_is_not_saved_or_appended(tmp_path: Path):
    empty_svg = (
        "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E"
    )
    captured = article(
        article_html=f"<article><p>正文</p><img src='{empty_svg}'></article>",
        images=[
            ImageInput(
                position_id="wechat-placeholder",
                resolved_url=empty_svg,
                width=900,
                height=30,
                order=0,
            )
        ],
    )

    saved, replacements = await save_images(captured, tmp_path / "assets")

    assert saved == []
    assert replacements == {}


@pytest.mark.asyncio
async def test_manual_folder_is_not_overridden_by_duplicate_in_pending(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    target = vault / "论文相关"
    target.mkdir(parents=True)
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))

    pending = await collect(article(category="auto", capture_version=3))
    selected = await collect(article(category="论文相关", capture_version=3))

    assert Path(pending["page_path"]).parent == vault / storage.DEFAULT_CATEGORY
    assert selected["duplicate"] is False
    assert Path(selected["page_path"]).parent == target
    assert selected["category"] == "论文相关"



LOADING_SVG = (
    "data:image/svg+xml;base64,"
    + base64.b64encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1012" height="28">'
        "<title>9.元素/加载/Black</title><rect width=\"1012\" height=\"28\"/>"
        "</svg>".encode("utf-8")
    ).decode("ascii")
)


@pytest.mark.asyncio
async def test_wechat_loading_svg_placeholder_is_not_saved(tmp_path: Path):
    captured = article(
        article_html=f"<article><p>正文</p><figure><img src='{LOADING_SVG}'></figure></article>",
        images=[
            ImageInput(
                position_id="wechat-loading-placeholder",
                resolved_url=LOADING_SVG,
                width=1012,
                height=28,
                order=0,
            )
        ],
    )

    saved, replacements = await save_images(captured, tmp_path / "assets")

    assert saved == []
    assert replacements == {}


def test_final_image_pruning_removes_loading_figure_but_keeps_real_image():
    source = (
        f"<article><p>正文</p><figure><img src='{LOADING_SVG}'></figure>"
        f"<figure><img src='{PNG}'></figure></article>"
    )

    cleaned, removed = prune_invalid_images(source)

    assert removed == 1
    assert "9.元素/加载/Black" not in cleaned
    assert PNG in cleaned
    assert cleaned.count("<figure>") == 1


def test_strict_placement_uses_nearby_text_without_appending(tmp_path: Path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "image-001.png").write_bytes(base64.b64decode(PNG.split(",", 1)[1]))
    source = "<article><p>第一段</p><div>飞书图片所在区块的对应文字</div><p>最后一段</p></article>"
    images = [{
        "filename": "image-001.png",
        "order": 0,
        "nearby_text": "飞书图片所在区块的对应文字",
        "source_type": "img",
        "position_id": "missing-marker",
    }]

    rendered, stats = place_unreferenced_images(
        source,
        images,
        assets,
        with_stats=True,
        allow_fallback=False,
    )

    assert stats["context"] == 1
    assert stats["appended"] == 0
    assert stats["unplaced"] == 0
    assert rendered.index("飞书图片所在区块的对应文字") < rendered.index("data:image/png;base64,") < rendered.index("最后一段")



def test_bilibili_video_layout_survives_sanitizing():
    source = """
    <article data-hermes-kind="video-card">
      <h1>视频标题</h1>
      <p data-hermes-kind="video-meta">UP主：测试作者 · 时长：05:39</p>
      <figure data-hermes-kind="video-cover"><img src="{image}" alt="视频封面"></figure>
      <section data-hermes-kind="video-description"><h2>视频简介</h2><p>有效简介</p></section>
      <section data-hermes-kind="video-chapters"><h2>视频章节</h2><ol><li>第一章 05:39</li></ol></section>
      <section data-hermes-kind="video-notes"><h2>B 站笔记</h2><blockquote>有效笔记正文</blockquote></section>
    </article>
    """.format(image=PNG)

    cleaned = sanitize_content(source)

    assert 'data-hermes-kind="video-card"' in cleaned
    assert 'data-hermes-kind="video-cover"' in cleaned
    assert 'data-hermes-kind="video-chapters"' in cleaned
    assert "视频标题" in cleaned
    assert "有效笔记正文" in cleaned
    assert "data:image/png;base64," in cleaned




def test_bilibili_opus_uses_dedicated_offline_layout():
    captured = article(
        title="置身事内推荐书单",
        site_name="哔哩哔哩",
        page_variant="bilibili-opus",
        capture_version=7,
        user_note="稍后阅读",
    )
    source = (
        '<article data-hermes-kind="opus-card">'
        '<figure data-hermes-kind="opus-video"><img src="' + PNG + '"></figure>'
        '<h1 data-hermes-kind="opus-title">置身事内推荐书单</h1>'
        '<div data-hermes-kind="opus-author"><strong>作者</strong><time>2026-07-26</time></div>'
        '<section data-hermes-kind="opus-content"><p>正文内容</p></section>'
        '</article>'
    )
    rendered = render_page(
        captured,
        None,
        sanitize_content(source),
        "opus-hash",
        "各类学习知识/论文相关",
        [{"filename": "cover.png"}],
    )

    assert 'class="bili-topbar"' in rendered
    assert 'class="bili-logo">bilibili' in rendered
    assert 'data-hermes-kind="opus-card"' in rendered
    assert 'hermes-capture-version" content="7"' in rendered
    assert "我的收藏备注" in rendered and "稍后阅读" in rendered
    assert "正文内容" in rendered and PNG in rendered
    assert 'class="hero"' not in rendered

@pytest.mark.asyncio
async def test_incomplete_strict_media_is_reported_instead_of_fake_success(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))
    captured = article(
        capture_version=5,
        image_placement_policy="strict",
        article_html="<article><p>飞书正文，但位置标记缺失</p></article>",
        images=[
            ImageInput(
                position_id="missing-frame-marker",
                resolved_url=PNG,
                width=100,
                height=100,
                order=0,
            )
        ],
    )

    result = await collect(captured)

    assert result["saved_images"] == 1
    assert result["image_placement"]["unplaced"] == 1
    assert result["media_complete"] is False
    assert result["failed_images"] == 0
