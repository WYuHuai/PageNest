import pytest
from bs4 import BeautifulSoup

from collector.models import ArticleInput
from collector.rendering import render_page


def article(variant: str) -> ArticleInput:
    return ArticleInput(
        title=f"{variant} contract",
        url="https://example.test/article",
        canonical_url="https://example.test/article",
        captured_at="2026-08-08T12:00:00+08:00",
        article_html="<article><p>contract body</p></article>",
        article_text="contract body",
        page_variant=variant,
        capture_version=12,
        mode="original",
    )


@pytest.mark.parametrize(
    "variant",
    ["standard", "bilibili-opus", "feishu-document", "xiaohongshu-note"],
)
def test_every_renderer_emits_the_pagenest_contract(variant: str):
    rendered = render_page(article(variant), None, "<p>contract body</p>", "contract-hash", "阅读记录", [])
    document = BeautifulSoup(rendered, "html.parser")
    assert document.html is not None and document.head is not None and document.body is not None
    assert document.find("meta", attrs={"charset": "utf-8"}) is not None
    csp = document.find("meta", attrs={"http-equiv": "Content-Security-Policy"})
    assert csp is not None and "default-src 'none'" in csp.get("content", "")
    for name in (
        "hermes-content-hash",
        "hermes-source",
        "hermes-save-complete",
        "hermes-capture-version",
        "hermes-pagenest-format-version",
    ):
        assert document.find("meta", attrs={"name": name}) is not None, f"missing {name} for {variant}"
