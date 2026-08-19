from pathlib import Path

import pytest
from bs4 import BeautifulSoup
from pydantic import ValidationError

from collector.config import settings
from collector.limits import MAX_DOCUMENT_STYLES_CHARS
from collector.models import ArticleInput
from collector.rendering import render_page
from collector.sanitizer import sanitize_content
from collector.storage import collect


FIXTURE = Path(__file__).parent / "fixtures" / "local-html-visual-fidelity.html"


def _fixture_parts() -> tuple[str, str]:
    document = BeautifulSoup(FIXTURE.read_text("utf-8"), "html.parser")
    return str(document.main), document.style.get_text() if document.style else ""


def _article(styles: str, *, source_kind: str = "local-html") -> ArticleInput:
    body, _ = _fixture_parts()
    return ArticleInput(
        title="脱敏的本地 HTML 视觉保真测试",
        source_kind=source_kind,
        source_name="local-html-visual-fidelity.html",
        url="local-html:///local-html-visual-fidelity.html",
        captured_at="2026-08-19T12:00:00+08:00",
        article_html=body,
        article_text="本地视觉测试正文。" * 30,
        document_styles=styles,
        mode="original",
    )


def _render_fixture() -> str:
    body, styles = _fixture_parts()
    article = _article(styles)
    content = sanitize_content(body, article.article_text, preserve_visual_styles=True)
    return render_page(article, None, content, "fixture-hash", "阅读记录/待整理", [])


def test_local_html_visual_structure_survives_the_full_render_boundary():
    rendered = _render_fixture()

    for selector in (
        ".article-body .timeline::before",
        ".article-body .timeline-item::before",
        ".article-body .badge::after",
    ):
        assert selector in rendered
    for contract in (
        'content:""',
        "--accent:#2563eb",
        "var(--accent)",
        "border:1px solid #cbd5e1",
        "border-radius:14px",
        "background:var(--surface)",
        "padding:20px",
        "gap:16px",
    ):
        assert contract.replace(" ", "") in rendered.replace(" ", "")
    assert 'class="timeline"' in rendered
    assert 'class="timeline-item card"' in rendered
    assert 'class="badge"' in rendered
    assert 'style="margin-top:12px;padding-bottom:18px"' in rendered.replace(" ", "")


def test_local_html_styles_remain_offline_and_do_not_leak_paths():
    rendered = _render_fixture()
    lowered = rendered.lower()

    assert "file:///" not in lowered
    assert "c:/users/" not in lowered
    assert "d:/private/" not in lowered
    assert "example.invalid" not in lowered
    assert "@import" not in lowered
    assert "@font-face" not in lowered
    assert "expression(" not in lowered
    assert ".unsafe-rule" not in lowered
    assert "default-src 'none'" in lowered
    assert "style-src 'unsafe-inline'" in lowered


def test_ordinary_web_capture_does_not_enable_local_visual_styles():
    body, styles = _fixture_parts()
    article = _article(styles, source_kind="web")
    article.url = "https://example.test/article"
    content = sanitize_content(body, article.article_text)
    rendered = render_page(article, None, content, "web-hash", "阅读记录/待整理", [])

    assert 'class="timeline"' not in content
    assert 'style="' not in content
    assert ".article-body .timeline::before" not in rendered


def test_local_html_styles_have_a_bounded_payload():
    with pytest.raises(ValidationError, match="document_styles"):
        _article("a" * (MAX_DOCUMENT_STYLES_CHARS + 1))


@pytest.mark.asyncio
async def test_local_html_collect_writes_the_fidelity_contract(tmp_path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))
    _, styles = _fixture_parts()

    result = await collect(_article(styles))
    rendered = Path(result["page_path"]).read_text("utf-8")

    assert ".article-body .timeline::before" in rendered
    assert ".article-body .badge::after" in rendered
    assert 'class="timeline-item card"' in rendered
    assert "file:///" not in rendered
    assert "example.invalid" not in rendered
