from collector.models import ArticleInput
from collector.rendering import render_page
from collector.sanitizer import CODE_BLOCK_CSS, sanitize_content


def article() -> ArticleInput:
    return ArticleInput(
        title="CSDN 代码测试",
        url="https://blog.csdn.net/example/article/details/1",
        canonical_url="https://blog.csdn.net/example/article/details/1",
        captured_at="2026-07-27T12:00:00+08:00",
        article_html="<article></article>",
        article_text="代码测试",
        mode="original",
    )


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
