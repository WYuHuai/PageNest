from collector.models import ArticleInput
from collector.rendering import render_page
from collector.sanitizer import CODE_BLOCK_CSS, sanitize_content


def article(**changes) -> ArticleInput:
    data = dict(
        title="CSDN 代码测试",
        url="https://blog.csdn.net/example/article/details/1",
        canonical_url="https://blog.csdn.net/example/article/details/1",
        captured_at="2026-07-27T12:00:00+08:00",
        article_html="<article></article>",
        article_text="代码测试",
        mode="original",
    )
    data.update(changes)
    return ArticleInput(**data)


def test_csdn_highlight_lines_are_preserved_and_long_code_collapses():
    rows = "".join(
        f'<li><div class="hljs-ln-code"><div class="hljs-ln-line">'
        f'<span class="hljs-keyword">const</span> value{i} = '
        f'<span class="hljs-string">"row-{i}"</span>;</div></div></li>'
        for i in range(25)
    )
    source = (
        '<pre class="new-version hljs set-code-height">'
        '<code class="hljs language-javascript"><ol class="hljs-ln">'
        f"{rows}</ol></code></pre>"
    )

    cleaned = sanitize_content(source)

    assert 'data-hermes-collapsible=""' in cleaned
    assert 'data-hermes-code-toggle=""' in cleaned
    assert 'aria-expanded="false"' in cleaned
    assert 'data-hermes-language="javascript"' in cleaned
    assert 'data-hermes-token="keyword"' in cleaned
    assert 'data-hermes-token="string"' in cleaned
    assert cleaned.count('data-hermes-kind="code-line"') == 25
    assert 'class="hljs' not in cleaned
    assert "style=" not in cleaned


def test_code_toolbar_copy_and_colors_are_in_every_offline_page():
    cleaned = sanitize_content(
        '<pre><code class="language-python"><span class="token keyword">return</span> '
        '<span class="token number">42</span></code></pre>'
    )
    rendered = render_page(article(), None, cleaned, "hash", "阅读记录", [])

    assert 'data-hermes-kind="code-toolbar"' in rendered
    assert 'data-hermes-copy=""' in rendered
    assert 'data-hermes-token="keyword"' in rendered
    assert 'data-hermes-token="number"' in rendered
    assert '[data-hermes-token="keyword"]{color:#ff7b72!important}' in CODE_BLOCK_CSS
    assert "color:inherit!important" not in rendered
    assert "button.closest('[data-hermes-kind=\"code-shell\"]')" in rendered
    assert "querySelectorAll('[data-hermes-kind=\"code-line\"]')" in rendered


def test_heading_links_are_rendered_as_plain_headings():
    cleaned = sanitize_content(
        '<h2><a href="https://blog.csdn.net/example#section">章节标题</a></h2>'
        '<p><a href="https://example.com">正文链接仍保留</a></p>'
    )

    assert '<h2>章节标题</h2>' in cleaned
    assert 'href="https://blog.csdn.net/example#section"' not in cleaned
    assert 'href="https://example.com"' in cleaned


def test_xiaohongshu_gallery_controls_are_sanitized_and_rendered():
    cleaned = sanitize_content(
        '<article data-hermes-kind="xhs-note"><h1>笔记</h1>'
        '<section data-hermes-kind="xhs-gallery" data-hermes-gallery="" data-hermes-gallery-index="0">'
        '<figure data-hermes-kind="xhs-slide"><img src="data:image/png;base64,AAAA"></figure>'
        '<p><a href="#" aria-label="上一张" data-hermes-gallery-prev="">‹</a>'
        '<a href="#" aria-label="下一张" data-hermes-gallery-next="">›</a></p></section>'
        '<section data-hermes-kind="xhs-comments"><p data-hermes-kind="xhs-comment">评论内容</p></section>'
        '</article>'
    )
    rendered = render_page(article(page_variant="xiaohongshu-note"), None, cleaned, "hash", "阅读记录", [])

    assert 'data-hermes-gallery-prev=""' in cleaned
    assert 'data-hermes-gallery-next=""' in cleaned
    assert 'data-hermes-gallery-index="0"' in cleaned
    assert 'xhs-gallery-controls' in rendered
    assert 'hermesShowGallerySlide' in rendered
    assert 'aria-label="上一张"' in cleaned
    assert ':hover [data-hermes-kind="xhs-gallery-controls"] a' in rendered
    assert 'position:absolute;inset:0' in rendered
    assert '[data-hermes-kind="xhs-comments"]' in rendered


def test_xiaohongshu_comments_render_as_escaped_semantic_items():
    captured = article(
        page_variant="xiaohongshu-note",
        comments=[
            {
                "author": '<script>用户</script>',
                "avatar_data_url": "data:image/png;base64,AAAA",
                "content": "第一行\n😊第二行 <b>不执行</b>",
                "time": "08-08",
                "location": "上海",
                "like_count": "12",
                "replies": [
                    {
                        "author": "回复者",
                        "content": "一级回复",
                        "is_author": True,
                    }
                ],
            },
            {"author": "无头像用户", "content": "内容", "location": "北京"},
        ],
    )

    rendered = render_page(captured, None, "<article><p>正文</p></article>", "hash", "阅读记录", [])

    for class_name in ("comment-item", "comment-avatar", "comment-author", "comment-content", "comment-meta"):
        assert f'class="{class_name}' in rendered
    assert "comment-replies" in rendered
    assert "&lt;script&gt;用户&lt;/script&gt;" in rendered
    assert "第一行\n😊第二行 &lt;b&gt;不执行&lt;/b&gt;" in rendered
    assert "上海 · 08-08 · 12 赞" in rendered
    assert "北京" in rendered
    assert '<script>用户</script>' not in rendered
    assert rendered.count('<section data-hermes-kind="xhs-comments" data-pagenest-role="comments">') == 1
    assert rendered.index("正文") < rendered.index('<section data-hermes-kind="xhs-comments"')
