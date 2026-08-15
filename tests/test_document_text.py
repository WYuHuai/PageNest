import json

import pytest
from bs4 import BeautifulSoup

from collector.document_text import extract_document
from collector.models import ArticleInput
from collector.rendering import PAGENEST_DOCUMENT_SCHEMA_VERSION, render_page


def page(body: str, metadata: dict | None = None) -> str:
    encoded = json.dumps(metadata or {}, ensure_ascii=False)
    return f"""<!doctype html><html><head><title>后备标题</title>
    <meta name="hermes-source" content="https://example.com/fallback">
    <meta name="hermes-category" content="资料">
    <script type="application/json" id="hermes-metadata">{encoded}</script>
    <style>.hidden{{background:url(data:image/png;base64,AAAA)}}</style></head>
    <body>{body}<script>window.unwanted = true</script></body></html>"""


def test_extracts_clean_standard_document():
    document = extract_document(
        page(
            """
            <main><section class="panel"><h2>AI 整理</h2><div class="summary-card wide"><h3>内容摘要</h3><p>摘要内容</p></div></section>
            <section class="panel"><h2>我的收藏备注</h2><p class="saved-note">稍后复习</p></section>
            <article><div class="article-body"><h1>第一章</h1><p>真正正文。</p>
            <pre data-hermes-language="python"><code>def hello():
    print("hello")</code></pre>
            <figure><img src="data:image/png;base64,QUFBQQ==" alt="结构示意图"><figcaption>图一说明</figcaption></figure>
            </div></article><footer>系统页脚</footer></main>
            """,
            {
                "title": "机器可读标题",
                "source": "https://example.com/article",
                "author": "示例作者",
                "captured_at": "2026-08-15T10:00:00+08:00",
                "category": "研究",
            },
        )
    )

    assert document.title == "机器可读标题"
    assert document.source == "https://example.com/article"
    assert document.author == "示例作者"
    assert document.text == '第一章\n\n真正正文。\n\ndef hello():\n    print("hello")\n\n图一说明'
    assert document.headings == ("第一章",)
    assert document.code_blocks[0].language == "python"
    assert document.code_blocks[0].text == 'def hello():\n    print("hello")'
    assert document.image_descriptions == ("结构示意图", "图一说明")
    assert document.summary == "摘要内容"
    assert document.note == "稍后复习"
    assert "base64" not in document.searchable_text
    assert "系统页脚" not in document.searchable_text


def test_extracts_xiaohongshu_body_and_loaded_comments_separately():
    document = extract_document(
        page(
            """
            <main class="xhs-shell"><article class="xhs-card">
              <article data-hermes-kind="xhs-note"><h1>笔记标题</h1><p data-hermes-kind="xhs-description">笔记正文</p></article>
              <section data-hermes-kind="xhs-comments"><h2>评论</h2>
                <article><div class="comment-author">读者甲</div><div class="comment-content">第一条评论</div></article>
                <article><div class="comment-content">第二条评论</div></article>
              </section>
            </article></main>
            """
        )
    )

    assert document.text == "笔记标题\n\n笔记正文"
    assert document.comments == ("读者甲: 第一条评论", "第二条评论")
    assert "第一条评论" in document.searchable_text


def test_legacy_html_fallback_ignores_controls_and_invalid_metadata():
    document = extract_document(
        """<html><head><title>旧收藏</title>
        <meta name="hermes-source" content="https://example.com/legacy">
        <script id="hermes-metadata">not-json</script></head><body><main>
        <nav>导航</nav><h1>旧标题</h1><p>旧格式正文</p><button>复制</button><footer>页脚</footer>
        </main></body></html>"""
    )

    assert document.title == "旧收藏"
    assert document.source == "https://example.com/legacy"
    assert document.text == "旧标题\n\n旧格式正文"
    assert document.headings == ("旧标题",)


def test_data_urls_do_not_enter_extracted_text():
    payload = "A" * 200_000
    document = extract_document(page(f'<main><p>正文</p><img src="data:image/png;base64,{payload}" alt="配图"></main>'))

    assert document.text == "正文"
    assert document.image_descriptions == ("配图",)
    assert payload[:100] not in document.searchable_text


@pytest.mark.parametrize(
    ("variant", "content"),
    (
        ("standard", "<h2>标准章节</h2><p>标准正文</p>"),
        ("feishu-document", "<h2>飞书章节</h2><p>飞书正文</p>"),
        ("bilibili-opus", "<h2>B站章节</h2><p>B站正文</p>"),
        (
            "xiaohongshu-note",
            '<article data-hermes-kind="xhs-note"><h1>小红书章节</h1><p data-hermes-kind="xhs-description">小红书正文</p></article>',
        ),
    ),
)
def test_extracts_every_current_renderer_variant(variant: str, content: str):
    article = ArticleInput(
        page_variant=variant,
        title=f"{variant} 标题",
        author="统一作者",
        url="https://example.com/article",
        canonical_url="https://example.com/canonical",
        captured_at="2026-08-15T10:00:00+08:00",
        article_html=content,
        article_text="正文",
        user_note="测试备注",
    )
    rendered = render_page(article, None, content, "digest", "测试分类", [])
    document = extract_document(rendered)

    assert document.title == f"{variant} 标题"
    assert document.author == "统一作者"
    assert document.source == "https://example.com/canonical"
    assert document.category == "测试分类"
    assert "正文" in document.text
    metadata = json.loads(BeautifulSoup(rendered, "html.parser").select_one("#hermes-metadata").string)
    assert metadata["document_schema_version"] == PAGENEST_DOCUMENT_SCHEMA_VERSION
