import json
from html import escape

from bs4 import BeautifulSoup, Tag

from .models import (
    DEFAULT_NOTEBOOK_DIRECTORY,
    NOTEBOOK_SCHEMA_VERSION,
    Notebook,
    NotebookEntry,
)


def serialize_json_script(value: dict) -> str:
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        .replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
    )


def _entry_state(entry: NotebookEntry) -> dict:
    return entry.model_dump(exclude={"image_data"})


def notebook_state(notebook: Notebook) -> dict:
    return {
        "schema_version": NOTEBOOK_SCHEMA_VERSION,
        **notebook.model_dump(exclude={"entries"}),
        "entries": [_entry_state(entry) for entry in notebook.entries],
    }


def _entry_html(entry: NotebookEntry) -> str:
    title = f"<h3>{escape(entry.title)}</h3>" if entry.title else ""
    summary = f"<p>{escape(entry.summary)}</p>" if entry.summary else ""
    minutes, seconds = divmod(int(entry.video_timestamp_seconds), 60)
    timestamp = f"{minutes:02d}:{seconds:02d}"
    entry_id = escape(entry.id, quote=True)
    return f"""
<article data-pagenest-notebook-entry data-entry-id="{entry_id}">
  <div class="entry-meta"><time>{escape(timestamp)}</time><span>{escape(entry.captured_at)}</span></div>
  <img src="{escape(entry.image_data, quote=True)}" alt="{escape(entry.title or timestamp, quote=True)}">
  {title}{summary}
</article>"""


def render_notebook(notebook: Notebook) -> str:
    metadata = {
        "document_type": notebook.document_type,
        "title": notebook.title,
        "source": notebook.source_url,
        "canonical_url": notebook.source_url,
        "captured_at": notebook.created_at,
        "category": DEFAULT_NOTEBOOK_DIRECTORY,
    }
    state = notebook_state(notebook)
    entries = "".join(_entry_html(entry) for entry in notebook.entries)
    source_label = notebook.source_title or notebook.source_url
    empty = '<p class="empty">尚未添加视频画面。</p>' if not notebook.entries else ""
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="hermes-source" content="{escape(notebook.source_url, quote=True)}">
<meta name="hermes-category" content="{DEFAULT_NOTEBOOK_DIRECTORY}">
<title>{escape(notebook.title)}</title>
<style>
:root{{color-scheme:light;font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#172033;background:#f5f7fb}}
*{{box-sizing:border-box}}body{{margin:0;padding:32px 18px}}main{{width:min(860px,100%);margin:auto}}
header{{padding:28px;background:#fff;border:1px solid #e5e9f2;border-radius:18px}}
h1{{margin:0 0 10px;font-size:clamp(1.6rem,4vw,2.35rem);line-height:1.2}}a{{color:#1e45fb;overflow-wrap:anywhere}}
.meta{{color:#697386;font-size:.92rem}}.entries{{display:grid;gap:20px;margin-top:20px}}
article{{padding:20px;background:#fff;border:1px solid #e5e9f2;border-radius:18px}}
.entry-meta{{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px;color:#697386;font-size:.9rem}}
time{{font-weight:700;color:#1e45fb}}img{{display:block;width:100%;height:auto;border-radius:12px;background:#eef1f7}}
h3{{margin:18px 0 8px;font-size:1.1rem}}p{{margin:8px 0;line-height:1.7;white-space:pre-wrap}}.empty{{text-align:center;color:#697386}}
</style>
<script id="hermes-metadata" type="application/json">{serialize_json_script(metadata)}</script>
<script id="pagenest-notebook-data" type="application/json">{serialize_json_script(state)}</script>
</head>
<body><main>
<header><h1>{escape(notebook.title)}</h1><div class="meta">来源：<a href="{escape(notebook.source_url, quote=True)}" target="_blank" rel="noopener noreferrer">{escape(source_label)}</a> · {len(notebook.entries)} 个画面 · revision {notebook.revision}</div></header>
<section class="entries" data-pagenest-role="content">{entries}{empty}</section>
</main></body>
</html>"""


def read_notebook(page: str) -> Notebook:
    soup = BeautifulSoup(page, "html.parser")
    state_node = soup.select_one("script#pagenest-notebook-data")
    if not isinstance(state_node, Tag):
        raise ValueError("文件不是有效的 Video Notebook")
    try:
        state = json.loads(state_node.string or state_node.get_text() or "{}")
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Video Notebook 状态数据损坏") from exc
    if not isinstance(state, dict):
        raise ValueError("Video Notebook 状态数据损坏")

    images: dict[str, str] = {}
    for node in soup.select("[data-pagenest-notebook-entry][data-entry-id]"):
        image = node.find("img")
        if isinstance(image, Tag):
            images[str(node.get("data-entry-id", ""))] = str(image.get("src", ""))
    entries = state.get("entries", [])
    if not isinstance(entries, list):
        raise ValueError("Video Notebook 条目数据损坏")
    state["entries"] = [
        {**entry, "image_data": images.get(str(entry.get("id", "")), "")}
        for entry in entries
        if isinstance(entry, dict)
    ]
    try:
        return Notebook.model_validate(state)
    except Exception as exc:
        raise ValueError("Video Notebook 状态数据损坏") from exc
