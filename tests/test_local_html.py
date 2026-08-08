import asyncio
from pathlib import Path

import pytest

from collector.config import settings
from collector.models import ArticleInput
from collector.storage import collect


def local_article(text: str) -> ArticleInput:
    return ArticleInput(
        capture_version=12,
        page_variant="standard",
        source_kind="local-html",
        source_name="研究报告 8月8日.html",
        title="研究报告 8月8日",
        site_name="本地 HTML",
        url="local-html:///%E7%A0%94%E7%A9%B6%E6%8A%A5%E5%91%8A%208%E6%9C%888%E6%97%A5.html",
        canonical_url="",
        captured_at="2026-08-08T12:00:00+08:00",
        article_html=(
            '<main><h1>研究报告</h1>'
            f'<p>{text}</p>'
            '<a href="file:///C:/Users/Example/PrivateProject/appendix.html">附录</a>'
            '<script>window.localSecret = true</script>'
            '<style>body{display:none}</style></main>'
        ),
        article_text=f"研究报告 {text}",
        mode="original",
    )


@pytest.mark.asyncio
async def test_local_html_duplicate_uses_content_hash_not_file_name(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))

    first = await collect(local_article("Version A"))
    duplicate = await collect(local_article("Version A"))
    changed = await collect(local_article("Version B"))

    assert first["duplicate"] is False
    assert duplicate["duplicate"] is True
    assert changed["duplicate"] is False
    assert len(list(vault.glob("**/*.pagenest"))) == 2


@pytest.mark.asyncio
async def test_local_html_page_does_not_expose_absolute_file_paths(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))

    result = await collect(local_article("正文内容"))
    rendered = Path(result["page_path"]).read_text("utf-8")

    assert "本地 HTML" in rendered
    assert "研究报告 8月8日.html" in rendered
    assert '"source_kind": "local-html"' in rendered
    assert '"source_name": "研究报告 8月8日.html"' in rendered
    assert "附录" in rendered
    assert "file:///" not in rendered
    assert "C:/Users/" not in rendered
    assert "localSecret" not in rendered
    assert "display:none" not in rendered


@pytest.mark.asyncio
async def test_concurrent_local_html_capture_writes_one_page(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setattr(settings, "obsidian_vault_path", str(vault))

    first, second = await asyncio.gather(
        collect(local_article("Concurrent local content")),
        collect(local_article("Concurrent local content")),
    )

    assert sorted([first["duplicate"], second["duplicate"]]) == [False, True]
    assert len(list(vault.glob("**/*.pagenest"))) == 1
