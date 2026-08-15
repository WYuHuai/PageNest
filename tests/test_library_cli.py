import json
from io import BytesIO, TextIOWrapper
from pathlib import Path

import pytest

import pagenest_cli
from collector.library import read_document_file, resolve_document_path
from collector.search_index import INDEX_RELATIVE_PATH, refresh_search_index, search_documents


def write_page(path: Path, *, title: str, text: str, comment: str = "") -> None:
    comments = (
        f'<section data-pagenest-role="comments"><article class="comment-item">'
        f'<div class="comment-main"><div class="comment-author">读者</div>'
        f'<div class="comment-content">{comment}</div></div></article></section>'
        if comment
        else ""
    )
    metadata = json.dumps(
        {
            "document_schema_version": 1,
            "title": title,
            "source": "https://example.com/article",
            "author": "作者",
            "category": "研究",
        },
        ensure_ascii=False,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"""<!doctype html><html><head><title>{title}</title></head><body>
        <main><article data-pagenest-role="content"><h1>{title}</h1><p>{text}</p></article>{comments}</main>
        <script type="application/json" id="hermes-metadata">{metadata}</script></body></html>""",
        encoding="utf-8",
    )


def test_read_is_limited_to_configured_vault(tmp_path: Path):
    vault = tmp_path / "vault"
    outside = tmp_path / "outside.pagenest"
    write_page(vault / "资料" / "inside.pagenest", title="内部", text="正文")
    write_page(outside, title="外部", text="不能读取")

    resolved = resolve_document_path(vault, "资料/inside.pagenest")
    assert resolved == (vault / "资料" / "inside.pagenest").resolve()
    assert read_document_file(vault, resolved).title == "内部"
    with pytest.raises(ValueError, match="只能读取"):
        resolve_document_path(vault, outside)
    with pytest.raises(ValueError, match="只能读取"):
        resolve_document_path(vault, "../outside.pagenest")


def test_search_finds_body_code_and_loaded_comments(tmp_path: Path):
    vault = tmp_path / "vault"
    write_page(vault / "时间序列.pagenest", title="TimesFM 预测", text="Python 时间序列代码", comment="适合科研")
    write_page(vault / "其他.hermes", title="普通文章", text="其他内容")
    write_page(vault / ".obsidian" / "ignored.pagenest", title="隐藏", text="时间序列")

    result = search_documents(vault, "时间序列 科研")

    assert len(result) == 1
    assert result[0].title == "TimesFM 预测"
    assert result[0].path == "时间序列.pagenest"
    assert "科研" in result[0].snippet


def test_search_validates_query_and_limit(tmp_path: Path):
    vault = tmp_path / "vault"
    vault.mkdir()

    with pytest.raises(ValueError, match="请输入"):
        search_documents(vault, "  ")
    with pytest.raises(ValueError, match="200"):
        search_documents(vault, "x" * 201)
    with pytest.raises(ValueError, match="1 到 100"):
        search_documents(vault, "正文", limit=0)


def test_search_index_reuses_unchanged_documents_and_removes_deleted(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    first = vault / "first.pagenest"
    second = vault / "second.hermes"
    write_page(first, title="第一篇", text="索引正文")
    write_page(second, title="第二篇", text="旧格式正文")

    initial = refresh_search_index(vault)
    assert set(initial) == {"first.pagenest", "second.hermes"}
    assert (vault / INDEX_RELATIVE_PATH).is_file()

    def unexpected_read(*_args, **_kwargs):
        raise AssertionError("unchanged documents should be reused from the index")

    with monkeypatch.context() as context:
        context.setattr("collector.search_index.read_document_file", unexpected_read)
        assert refresh_search_index(vault) == initial

    write_page(first, title="第一篇", text="已经更新的索引正文")
    assert "已经更新" in refresh_search_index(vault)["first.pagenest"]["text"]

    second.unlink()
    refreshed = refresh_search_index(vault)
    assert set(refreshed) == {"first.pagenest"}


def test_search_index_rebuilds_corrupt_index_without_html_or_base64(tmp_path: Path):
    vault = tmp_path / "vault"
    page = vault / "article.pagenest"
    write_page(page, title="干净索引", text="正文关键词")
    index_path = vault / INDEX_RELATIVE_PATH
    index_path.parent.mkdir(parents=True)
    index_path.write_text("not-json", encoding="utf-8")

    results = search_documents(vault, "正文关键词")
    index_text = index_path.read_text("utf-8")

    assert [result.path for result in results] == ["article.pagenest"]
    assert "正文关键词" in index_text
    assert "<html" not in index_text
    assert "data:image" not in index_text


def test_cli_read_outputs_ai_friendly_markdown(tmp_path: Path, capsys):
    vault = tmp_path / "vault"
    write_page(vault / "文章.pagenest", title="可读标题", text="干净正文", comment="评论内容")

    exit_code = pagenest_cli.main(["--vault", str(vault), "read", "文章.pagenest"])
    output = capsys.readouterr()

    assert exit_code == 0
    assert "# 可读标题" in output.out
    assert "## 网页正文" in output.out
    assert "干净正文" in output.out
    assert "读者: 评论内容" in output.out
    assert "<html" not in output.out
    assert output.err == ""


def test_cli_search_json_and_friendly_error(tmp_path: Path, capsys):
    vault = tmp_path / "vault"
    write_page(vault / "文章.pagenest", title="检索标题", text="唯一关键词")

    assert pagenest_cli.main(["--vault", str(vault), "search", "唯一关键词", "--json"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload[0]["path"] == "文章.pagenest"

    assert pagenest_cli.main(["--vault", str(vault), "read", "missing.pagenest"]) == 2
    error = capsys.readouterr().err
    assert "只能读取当前 PageNest Vault" in error


def test_cli_uses_utf8_when_windows_stream_started_with_legacy_encoding(tmp_path: Path, monkeypatch):
    vault = tmp_path / "vault"
    write_page(vault / "unicode.pagenest", title="Unicode", text="A😊B")
    output = BytesIO()
    stream = TextIOWrapper(output, encoding="gbk")
    monkeypatch.setattr(pagenest_cli.sys, "stdout", stream)

    assert pagenest_cli.main(["--vault", str(vault), "read", "unicode.pagenest", "--format", "text"]) == 0
    stream.flush()
    assert "A😊B" in output.getvalue().decode("utf-8")
