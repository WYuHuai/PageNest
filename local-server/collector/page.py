import html
import json
import re
import unicodedata
from bs4 import BeautifulSoup
from .models import ArticleInput, HermesResult


BLOCKED_TAGS = {"script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "option", "link", "meta", "base", "svg", "canvas", "audio", "source", "track"}
SAFE_ATTRIBUTES = {"href", "src", "alt", "title", "colspan", "rowspan", "width", "height", "controls", "preload", "poster", "playsinline", "download"}
SAFE_DATA_ATTRIBUTES = {"data-hermes-kind", "data-hermes-token", "data-hermes-language"}
SYNTAX_TOKEN_ALIASES = {
    "comment": "comment", "quote": "comment",
    "keyword": "keyword", "selector-tag": "keyword", "literal": "keyword", "name": "keyword",
    "string": "string", "doctag": "string", "regexp": "string",
    "number": "number", "symbol": "number", "bullet": "number",
    "title": "function", "section": "function", "function": "function",
    "attr": "variable", "attribute": "variable", "variable": "variable", "template-variable": "variable",
    "built_in": "type", "builtin-name": "type", "type": "type", "class": "type",
    "meta": "meta", "operator": "operator",
}

CODE_BLOCK_CSS = """
[data-hermes-kind="code-shell"]{margin:20px 0;border-radius:13px;overflow:hidden;background:#11131a;color:#f8f8f2}
[data-hermes-kind="code-toolbar"]{min-height:44px;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:7px 10px;background:#1b1e28;border-bottom:1px solid #303542}
[data-hermes-code-language]{margin-right:auto;color:#9da5b4;font:600 12px/1.2 ui-sans-serif,system-ui;text-transform:uppercase;letter-spacing:.06em}
[data-hermes-kind="code-toolbar"] button{position:static!important;border:1px solid #555b6e;border-radius:7px;background:#292d3e;color:#fff;padding:6px 10px;cursor:pointer;font:600 12px/1.2 ui-sans-serif,system-ui}
[data-hermes-kind="code-toolbar"] button:hover{background:#353b50}
[data-hermes-kind="code-shell"] pre{overflow:auto;margin:0!important;padding:16px 18px!important;background:#11131a!important;color:#f8f8f2!important;border-radius:0!important;line-height:1.6;tab-size:4;white-space:pre!important}
[data-hermes-kind="code-shell"] pre *{background:transparent!important;text-shadow:none!important;border:0!important}
[data-hermes-kind="code-shell"][data-hermes-collapsible]:not([data-hermes-expanded]) pre{max-height:420px;overflow:hidden}
[data-hermes-kind="code-shell"][data-hermes-collapsible]:not([data-hermes-expanded]){position:relative}
[data-hermes-kind="code-shell"][data-hermes-collapsible]:not([data-hermes-expanded]):after{content:"";position:absolute;z-index:1;left:0;right:0;bottom:0;height:70px;pointer-events:none;background:linear-gradient(transparent,#11131a)}
[data-hermes-token="comment"]{color:#8b949e!important;font-style:italic}
[data-hermes-token="keyword"]{color:#ff7b72!important}
[data-hermes-token="string"]{color:#a5d6ff!important}
[data-hermes-token="number"]{color:#79c0ff!important}
[data-hermes-token="function"]{color:#d2a8ff!important}
[data-hermes-token="variable"]{color:#ffa657!important}
[data-hermes-token="type"]{color:#7ee787!important}
[data-hermes-token="meta"]{color:#c9d1d9!important}
[data-hermes-token="operator"]{color:#ff7b72!important}
"""


COPY_SCRIPT = """<script nonce="hermes-offline">
async function hermesCopyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (_) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}
document.addEventListener("click", async function (event) {
  const toggle = event.target.closest("[data-hermes-code-toggle]");
  if (toggle) {
    const shell = toggle.closest('[data-hermes-kind="code-shell"]');
    if (!shell) return;
    const expanded = shell.toggleAttribute("data-hermes-expanded");
    toggle.textContent = expanded ? "收起代码" : "展开全部";
    toggle.setAttribute("aria-expanded", String(expanded));
    return;
  }
  const button = event.target.closest("[data-hermes-copy]");
  if (!button) return;
  const shell = button.closest('[data-hermes-kind="code-shell"]');
  const code = shell && shell.querySelector("pre");
  if (!code) return;
  const lines = code.querySelectorAll('[data-hermes-kind="code-line"]');
  const text = lines.length
    ? Array.from(lines, function (line) { return line.innerText || line.textContent || ""; }).join("\\n")
    : (code.innerText || code.textContent || "");
  await hermesCopyText(text);
  const original = button.textContent;
  button.textContent = "已复制";
  setTimeout(function () { button.textContent = original; }, 1200);
});
</script>"""


def _clean_text(value: str) -> str:
    return "".join(character for character in value if unicodedata.category(character) != "Cf").strip()


def _syntax_token(classes: set[str]) -> str:
    for class_name in classes:
        normalized = re.sub(r"^(?:hljs-|token-?)", "", class_name)
        if normalized in SYNTAX_TOKEN_ALIASES:
            return SYNTAX_TOKEN_ALIASES[normalized]
    return ""


def _code_language(classes: set[str]) -> str:
    for class_name in classes:
        match = re.fullmatch(r"(?:language-|lang-)([\w.+#-]{1,24})", class_name, re.I)
        if match:
            return match.group(1)
    return ""


def sanitize_content(source_html: str, fallback_text: str = "") -> str:
    """Keep readable article structure while removing active or remote content."""
    soup = BeautifulSoup(source_html or "", "html.parser")
    for tag in list(soup.find_all(BLOCKED_TAGS)):
        tag.decompose()
    for line in soup.select(".hljs-ln-code .hljs-ln-line"):
        line["data-hermes-kind"] = "code-line"
    for tag in list(soup.find_all(True)):
        classes = set(tag.get("class", []))
        if tag.find_parent("pre"):
            token = _syntax_token(classes)
            if token:
                tag["data-hermes-token"] = token
            if "hljs-ln-line" in classes and tag.parent and "hljs-ln-code" in set(tag.parent.get("class", [])):
                tag["data-hermes-kind"] = "code-line"
        if tag.name in {"pre", "code"}:
            language = _code_language(classes)
            if language:
                tag["data-hermes-language"] = language
        heading = next((re.fullmatch(r"docx-heading([1-6])-block", name) for name in classes if name.startswith("docx-heading")), None)
        if heading:
            level = heading.group(1)
            value = _clean_text(tag.get_text(" ", strip=True))
            replacement = soup.new_tag(f"h{level}")
            replacement.string = value
            tag.replace_with(replacement)
            continue
        if "docx-callout-block" in classes:
            tag["data-hermes-kind"] = "feishu-callout"
        elif "docx-code-block" in classes:
            tag["data-hermes-kind"] = "feishu-code"
        elif "docx-quote-block" in classes:
            tag["data-hermes-kind"] = "feishu-quote"
        elif "docx-image-block" in classes:
            tag.name = "figure"
        elif "docx-text-block" in classes:
            tag["data-hermes-kind"] = "paragraph"
        elif "docx-bullet-block" in classes or "docx-ordered-block" in classes:
            tag["data-hermes-kind"] = "list-item"
        for attribute in list(tag.attrs):
            if attribute not in SAFE_ATTRIBUTES and attribute not in SAFE_DATA_ATTRIBUTES:
                del tag.attrs[attribute]
        if tag.name == "img":
            src = tag.get("src", "")
            if not src.startswith("data:image/"):
                placeholder = soup.new_tag("div")
                placeholder["data-hermes-kind"] = "missing-image"
                placeholder.string = tag.get("alt") or "此图片未能离线保存"
                tag.replace_with(placeholder)
                continue
            tag.attrs = {key: value for key, value in tag.attrs.items() if key in {"src", "alt", "title", "width", "height"}}
            tag["loading"] = "lazy"
        if tag.name == "video":
            src = tag.get("src", "")
            if not src.startswith("data:video/"):
                tag.decompose()
                continue
            tag.attrs = {
                key: value
                for key, value in tag.attrs.items()
                if key in {"src", "controls", "preload", "poster", "playsinline"}
            }
            tag["controls"] = ""
            tag["preload"] = "metadata"
        if tag.name == "a":
            href = tag.get("href", "")
            if not href.startswith(("http://", "https://", "#")):
                tag.unwrap()
                continue
            tag["target"] = "_blank"
            tag["rel"] = "noopener noreferrer"
            if not _clean_text(tag.get_text(" ", strip=True)):
                host = href.split("/", 3)[2].lower() if "://" in href else ""
                tag.string = "打开 GitHub 链接 ↗" if "github.com" in host else "打开外部链接 ↗"
    for pre in list(soup.find_all("pre")):
        if pre.parent and pre.parent.get("data-hermes-kind") == "code-shell":
            continue
        wrapper = soup.new_tag("div")
        wrapper["data-hermes-kind"] = "code-shell"
        line_count = len(pre.find_all("li")) or len(pre.get_text("\n").splitlines())
        if line_count > 20 or len(pre.get_text()) > 1200:
            wrapper["data-hermes-collapsible"] = ""
        toolbar = soup.new_tag("div")
        toolbar["data-hermes-kind"] = "code-toolbar"
        code = pre.find("code")
        language = pre.get("data-hermes-language") or (code.get("data-hermes-language", "") if code else "")
        if language:
            label = soup.new_tag("span")
            label["data-hermes-code-language"] = ""
            label.string = language
            toolbar.append(label)
        if "data-hermes-collapsible" in wrapper.attrs:
            toggle = soup.new_tag("button")
            toggle["type"] = "button"
            toggle["data-hermes-code-toggle"] = ""
            toggle["aria-expanded"] = "false"
            toggle.string = "展开全部"
            toolbar.append(toggle)
        button = soup.new_tag("button")
        button["type"] = "button"
        button["data-hermes-copy"] = ""
        button.string = "复制表格文本" if pre.get("data-hermes-kind") == "canvas-text" else "复制代码"
        toolbar.append(button)
        pre.wrap(wrapper)
        wrapper.insert(0, toolbar)
    body = soup.body or soup
    rendered = "".join(str(child) for child in body.contents).strip()
    if rendered:
        return rendered
    paragraphs = "".join(f"<p>{html.escape(line)}</p>" for line in fallback_text.splitlines() if line.strip())
    return paragraphs or "<p>未能提取网页正文。</p>"


def _items(values: list[str], empty: str = "暂无") -> str:
    if not values:
        return f'<p class="empty">{html.escape(empty)}</p>'
    return "<ul>" + "".join(f"<li>{html.escape(value)}</li>" for value in values) + "</ul>"


def _tags(values: list[str]) -> str:
    return "".join(f'<span class="tag">#{html.escape(value.lstrip("#"))}</span>' for value in values)




def _render_bilibili_opus_page(
    article: ArticleInput,
    result: HermesResult | None,
    content: str,
    digest: str,
    category: str,
    images: list[dict],
    error: str,
) -> str:
    embedded = len([item for item in images if "filename" in item])
    metadata = {
        "title": article.title,
        "source": article.url,
        "canonical_url": article.canonical_url,
        "captured_at": article.captured_at,
        "category": category,
        "content_hash": digest,
        "saved_images": embedded,
        "hermes_success": bool(result),
        "page_variant": article.page_variant,
    }
    metadata_json = json.dumps(metadata, ensure_ascii=False).replace("</", "<\\/")
    note = html.escape(article.user_note.strip() or "未填写收藏备注。")
    ai_panel = ""
    if result:
        ai_panel = f'''<section class="collector-card">
          <h2>AI 整理</h2>
          <p>{html.escape(result.abstract or result.one_sentence_summary or "未生成摘要。")}</p>
          {_items(result.key_points)}
        </section>'''
    elif error:
        ai_panel = f'<section class="collector-card muted"><h2>整理状态</h2><p>{html.escape(error)}</p></section>'
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'nonce-hermes-offline'; base-uri 'none'; form-action 'none'">
<meta name="hermes-content-hash" content="{html.escape(digest, quote=True)}">
<meta name="hermes-source" content="{html.escape(article.canonical_url or article.url, quote=True)}">
<meta name="hermes-category" content="{html.escape(category, quote=True)}">
<meta name="hermes-image-count" content="{embedded}">
<meta name="hermes-save-complete" content="1">
<meta name="hermes-capture-version" content="{article.capture_version}">
<title>{html.escape(article.title)}</title>
<style>
:root{{--bili-blue:#00aeec;--ink:#18191c;--muted:#9499a0;--line:#e3e5e7;--card:#fff}}
*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;color:var(--ink);font:15px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}}
body{{background:radial-gradient(circle at 12% 28%,rgba(255,255,255,.82),transparent 23%),linear-gradient(120deg,#eafafa,#d8f3f2 48%,#edfafa)}}
.bili-topbar{{height:64px;background:#fff;display:flex;align-items:center;gap:26px;padding:0 28px;box-shadow:0 1px 4px rgba(0,0,0,.08);position:sticky;top:0;z-index:2}}
.bili-logo{{font-size:27px;font-weight:900;color:var(--bili-blue);letter-spacing:-2px}}.bili-nav{{display:flex;gap:18px;font-size:14px}}.bili-search{{margin-left:auto;width:min(360px,34vw);height:40px;border-radius:8px;background:#f1f2f3;color:#9499a0;display:flex;align-items:center;padding:0 16px}}
.bili-login{{background:var(--bili-blue);color:#fff;border-radius:9px;padding:7px 18px;font-weight:700}}
.bili-layout{{width:min(760px,calc(100% - 24px));margin:14px auto 80px}}
.bili-card{{background:var(--card);box-shadow:0 2px 12px rgba(0,0,0,.08);overflow:hidden}}
.article-body>[data-hermes-kind="opus-card"]{{padding:0 44px 48px}}
[data-hermes-kind="opus-video"]{{position:relative;margin:0 -44px 22px;background:#000;aspect-ratio:16/9;overflow:hidden}}
[data-hermes-kind="opus-video"] img{{display:block;width:100%;height:100%;object-fit:cover;margin:0;border:0;border-radius:0;box-shadow:none;filter:brightness(.86)}}
[data-hermes-kind="opus-video"] video,.article-body>video{{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#000}}
[data-hermes-kind="opus-video"]:after{{content:"▶";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:68px;height:68px;border-radius:50%;background:rgba(0,174,236,.92);color:#fff;font-size:29px;padding-left:4px;box-shadow:0 8px 26px rgba(0,0,0,.28)}}
[data-hermes-kind="opus-title"]{{font-size:28px;line-height:1.35;margin:22px 0 14px;font-weight:700;letter-spacing:-.02em}}
[data-hermes-kind="opus-author"]{{display:flex;align-items:center;gap:13px;margin:0 0 28px;color:var(--muted);line-height:1.45}}
[data-hermes-kind="opus-author"]>img{{width:48px;height:48px;border-radius:50%;object-fit:cover;margin:0;border:0;box-shadow:none}}
[data-hermes-kind="opus-author"] strong{{display:block;color:#2f3134;font-size:16px}}[data-hermes-kind="opus-author"] time{{display:block;font-size:13px}}
[data-hermes-kind="opus-content"]{{font-size:17px;line-height:1.9}}[data-hermes-kind="opus-content"] p{{margin:1.2em 0}}[data-hermes-kind="opus-content"] img{{display:block;max-width:100%;height:auto;margin:22px auto;border-radius:6px}}
.collector-card{{margin-top:14px;padding:22px 26px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.05)}}.collector-card h2{{font-size:17px;margin:0 0 10px}}.collector-card p{{margin:0;white-space:pre-wrap}}.collector-card.muted{{color:var(--muted)}}
.bili-footer{{padding:24px;text-align:center;color:var(--muted);font-size:13px}}.bili-footer a{{color:var(--bili-blue)}}.empty{{color:var(--muted)}}
@media(max-width:700px){{.bili-nav{{display:none}}.bili-topbar{{padding:0 14px;gap:12px}}.bili-search{{width:auto;flex:1}}.article-body>[data-hermes-kind="opus-card"]{{padding:0 20px 34px}}[data-hermes-kind="opus-video"]{{margin:0 -20px 20px}}[data-hermes-kind="opus-title"]{{font-size:23px}}}}
{CODE_BLOCK_CSS}
</style>
</head>
<body>
<header class="bili-topbar"><div class="bili-logo">bilibili</div><nav class="bili-nav"><span>首页</span><span>番剧</span><span>直播</span><span>游戏中心</span><span>会员购</span><span>漫画</span><span>赛事</span></nav><div class="bili-search">搜索</div><div class="bili-login">登录</div></header>
<main class="bili-layout">
  <article class="bili-card"><div class="article-body">{content}</div></article>
  <section class="collector-card"><h2>我的收藏备注</h2><p>{note}</p></section>
  {ai_panel}
  <footer class="bili-footer">离线保存于 {html.escape(article.captured_at)} · {embedded} 张图片已内嵌 · <a href="{html.escape(article.url, quote=True)}">查看原始 B 站笔记</a></footer>
</main>
{COPY_SCRIPT}
<script type="application/json" id="hermes-metadata">{metadata_json}</script>
</body>
</html>'''

def _render_feishu_document_page(
    article: ArticleInput,
    result: HermesResult | None,
    content: str,
    digest: str,
    category: str,
    images: list[dict],
    error: str,
) -> str:
    embedded = len([item for item in images if "filename" in item])
    visible_title = _clean_text(article.title) or "未命名文档"
    metadata = {
        "title": visible_title,
        "source": article.url,
        "captured_at": article.captured_at,
        "category": category,
        "content_hash": digest,
        "saved_images": embedded,
        "hermes_success": bool(result),
        "page_variant": article.page_variant,
    }
    metadata_json = json.dumps(metadata, ensure_ascii=False).replace("</", "<\\/")
    note = html.escape(article.user_note.strip() or "未填写收藏备注。")
    ai_summary = ""
    if result:
        ai_summary = f'<section class="collector"><h2>AI 整理</h2><p>{html.escape(result.abstract or result.one_sentence_summary or "未生成摘要。")}</p></section>'
    elif error:
        ai_summary = f'<section class="collector muted"><h2>整理状态</h2><p>{html.escape(error)}</p></section>'
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'nonce-hermes-offline'; base-uri 'none'; form-action 'none'">
<meta name="hermes-content-hash" content="{html.escape(digest, quote=True)}">
<meta name="hermes-source" content="{html.escape(article.canonical_url or article.url, quote=True)}">
<meta name="hermes-category" content="{html.escape(category, quote=True)}">
<meta name="hermes-image-count" content="{embedded}">
<meta name="hermes-save-complete" content="1">
<meta name="hermes-capture-version" content="{article.capture_version}">
<title>{html.escape(visible_title)}</title>
<style>
:root{{--ink:#1f2329;--muted:#646a73;--line:#dee0e3;--blue:#3370ff;--page:#fff;--shell:#f5f6f7}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--shell);color:var(--ink);font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}}
.doc-topbar{{position:sticky;top:0;z-index:2;height:56px;display:flex;align-items:center;gap:14px;padding:0 24px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(10px)}}
.doc-title{{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}}.doc-state{{margin-left:auto;color:var(--muted);font-size:13px}}
.doc-page{{width:min(1180px,calc(100% - 28px));margin:14px auto 48px;background:var(--page);min-height:80vh;padding:38px clamp(24px,5vw,72px);box-shadow:0 1px 8px rgba(31,35,41,.08)}}
.doc-document-title{{max-width:1020px;margin:0 auto 26px;font-size:32px;line-height:1.32;font-weight:750}}.doc-body{{max-width:1020px;margin:0 auto}}.doc-body article{{display:block}}.doc-body p,.doc-body [data-hermes-kind="paragraph"]{{margin:.45em 0}}
.doc-body h1,.doc-body h2,.doc-body h3,.doc-body h4{{font-weight:700;line-height:1.35;margin:1.2em 0 .45em}}.doc-body h1{{font-size:30px}}.doc-body h2{{font-size:24px}}.doc-body h3{{font-size:20px}}
.doc-body a{{color:var(--blue);text-decoration:none}}.doc-body a:hover{{text-decoration:underline}}
.doc-body img{{display:block;max-width:100%;width:auto;height:auto;object-fit:contain;margin:14px auto;border:0;border-radius:0;box-shadow:none}}.doc-body figure{{margin:14px 0;overflow:auto}}
.doc-body [data-hermes-kind="feishu-callout"]{{margin:12px 0;padding:14px 18px;background:#fff7ed;border:1px solid #ffd6a1;border-radius:8px}}
.doc-body [data-hermes-kind="feishu-quote"]{{margin:18px 0;padding:8px 18px;border-left:4px solid #bbbfc4;color:#51565d}}
.doc-body [data-hermes-kind="feishu-code"]{{overflow:auto;padding:16px 18px;background:#f5f6f7;border-radius:8px;font-family:Consolas,monospace}}
.doc-body [data-hermes-kind="list-item"]{{position:relative;margin:.45em 0;padding-left:1.2em}}.doc-body [data-hermes-kind="list-item"]:before{{content:"\\2022";position:absolute;left:.2em}}
.doc-body details{{margin:10px 0;border:1px solid var(--line);border-radius:8px;padding:8px 12px}}.doc-body summary{{cursor:pointer;color:var(--blue)}}.doc-body table{{width:100%;border-collapse:collapse;display:block;overflow:auto}}.doc-body th,.doc-body td{{border:1px solid var(--line);padding:8px 10px}}
{CODE_BLOCK_CSS}
.doc-body video{{display:block;width:100%;height:auto;margin:20px auto;background:#000}}
[data-hermes-kind="missing-image"]{{padding:28px;border:1px dashed #bbbfc4;color:var(--muted);text-align:center}}
.collector{{max-width:920px;margin:30px auto 0;padding:18px 22px;border-top:1px solid var(--line);color:#373c43}}.collector h2{{font-size:16px;margin:0 0 8px}}.collector p{{margin:0;white-space:pre-wrap}}.collector.muted{{color:var(--muted)}}
.doc-footer{{max-width:920px;margin:30px auto 0;color:var(--muted);font-size:13px;text-align:center}}.doc-footer a{{color:var(--blue)}}
@media(max-width:700px){{.doc-topbar{{padding:0 12px}}.doc-state{{display:none}}.doc-page{{width:100%;margin:0;padding:30px 18px;box-shadow:none}}}}
{CODE_BLOCK_CSS}
</style>
</head>
<body>
<header class="doc-topbar"><span class="doc-title">{html.escape(visible_title)}</span><span class="doc-state">离线单文件 · {embedded} 张图片已内嵌</span></header>
<main class="doc-page">
  <h1 class="doc-document-title">{html.escape(visible_title)}</h1>
  <div class="doc-body">{content}</div>
  <section class="collector"><h2>我的收藏备注</h2><p>{note}</p></section>
  {ai_summary}
  <footer class="doc-footer">离线保存于 {html.escape(article.captured_at)} · <a href="{html.escape(article.url, quote=True)}">查看原始飞书文档</a></footer>
</main>
{COPY_SCRIPT}
<script type="application/json" id="hermes-metadata">{metadata_json}</script>
</body>
</html>'''
def render_page(article: ArticleInput, result: HermesResult | None, content: str, digest: str, category: str, images: list[dict], error: str = "") -> str:
    if article.page_variant == "bilibili-opus":
        return _render_bilibili_opus_page(article, result, content, digest, category, images, error)
    if article.page_variant == "feishu-document":
        return _render_feishu_document_page(article, result, content, digest, category, images, error)
    r = result or HermesResult(normalized_title=article.title, suggested_category=category, limitations=[error or "AI 未处理，已保留离线正文。"])
    title = r.normalized_title or article.title
    embedded = len([item for item in images if "filename" in item])
    failed = len([item for item in images if "error" in item])
    metadata = {
        "title": title,
        "source": article.url,
        "canonical_url": article.canonical_url,
        "captured_at": article.captured_at,
        "category": category,
        "content_hash": digest,
        "saved_images": embedded,
        "hermes_success": bool(result),
    }
    metadata_json = json.dumps(metadata, ensure_ascii=False).replace("</", "<\\/")
    source_label = article.site_name or "原网页"
    image_status = f"{embedded} 张图片已内嵌"
    if failed:
        image_status += f" · {failed} 张失败"
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-hermes-offline'; base-uri 'none'; form-action 'none'">
<meta name="hermes-content-hash" content="{html.escape(digest, quote=True)}">
<meta name="hermes-source" content="{html.escape(article.canonical_url or article.url, quote=True)}">
<meta name="hermes-category" content="{html.escape(category, quote=True)}">
<meta name="hermes-image-count" content="{embedded}">
<meta name="hermes-save-complete" content="1">
<meta name="hermes-capture-version" content="{article.capture_version}">
<title>{html.escape(title)}</title>
<style>
:root{{--paper:#fbfaf7;--surface:#fff;--ink:#202126;--muted:#6b6e76;--line:#e7e3dc;--accent:#6657d9;--accent-soft:#efedff;--shadow:0 18px 60px rgba(35,31,55,.10)}}
@media(prefers-color-scheme:dark){{:root{{--paper:#17171b;--surface:#202126;--ink:#f4f2ed;--muted:#aaa7b2;--line:#36363e;--accent:#aaa1ff;--accent-soft:#302d52;--shadow:0 18px 60px rgba(0,0,0,.28)}}}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.82 ui-serif,"Noto Serif SC","Source Han Serif SC",Georgia,serif}}
.shell{{width:min(980px,calc(100% - 32px));margin:0 auto;padding:42px 0 88px}}
.hero,.panel,.article{{background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}}
.hero{{padding:clamp(28px,6vw,64px);border-radius:30px 30px 18px 18px;position:relative;overflow:hidden}}
.hero:before{{content:"";position:absolute;inset:0 0 auto;height:5px;background:linear-gradient(90deg,#6657d9,#42b9a5,#e9a33f)}}
.eyebrow{{font:700 12px/1.2 ui-sans-serif,system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}}
h1{{font-size:clamp(32px,5vw,58px);line-height:1.18;letter-spacing:-.035em;margin:18px 0 20px;max-width:16em}}
.deck{{font-size:clamp(17px,2.2vw,22px);line-height:1.65;color:var(--muted);max-width:42em;margin:0}}
.meta{{display:flex;flex-wrap:wrap;gap:9px;margin-top:28px}}.pill,.tag{{font:600 13px/1.2 ui-sans-serif,system-ui;padding:8px 11px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}}
.panel{{margin-top:18px;padding:28px clamp(22px,4vw,42px);border-radius:18px}}
.panel h2,.article>h2{{font:700 22px/1.3 ui-sans-serif,system-ui;margin:0 0 16px}}
.saved-note{{margin:0;padding:18px 20px;border-left:4px solid var(--accent);border-radius:0 12px 12px 0;background:var(--accent-soft);white-space:pre-wrap}}
.saved-note.empty{{color:var(--muted);font-style:italic}}
.summary-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}.summary-card{{padding:20px;border-radius:14px;background:var(--paper);border:1px solid var(--line)}}.summary-card.wide{{grid-column:1/-1}}
.summary-card h3{{font:700 13px/1.2 ui-sans-serif,system-ui;color:var(--muted);margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em}}
.summary-card p{{margin:0}}ul{{padding-left:1.25em;margin:8px 0}}li{{margin:.45em 0}}.empty{{color:var(--muted)}}
.article{{margin-top:18px;padding:clamp(24px,6vw,68px);border-radius:18px 18px 30px 30px;overflow:hidden}}
.article-body{{max-width:760px;margin:0 auto}}.article-body h1,.article-body h2,.article-body h3,.article-body h4{{font-family:ui-sans-serif,system-ui;line-height:1.35;margin:2em 0 .7em;letter-spacing:-.02em}}.article-body h1{{font-size:2.1em}}.article-body h2{{font-size:1.65em}}.article-body h3{{font-size:1.3em}}
.article-body p,.article-body [data-hermes-kind="paragraph"]{{margin:1em 0}}.article-body [data-hermes-kind="list-item"]{{margin:.55em 0;padding-left:1.1em;position:relative}}.article-body [data-hermes-kind="list-item"]:before{{content:"•";position:absolute;left:0;color:var(--accent)}}
.article-body img{{display:block;max-width:100%;height:auto;margin:30px auto;border-radius:15px;border:1px solid var(--line);box-shadow:0 10px 35px rgba(20,18,30,.12)}}figure{{margin:30px 0}}figcaption{{color:var(--muted);text-align:center;font-size:.9em}}
.article-body video{{display:block;width:100%;height:auto;aspect-ratio:16/9;margin:30px auto;background:#000;border-radius:15px}}
.article-body blockquote{{margin:24px 0;padding:14px 20px;border-left:4px solid var(--accent);background:var(--accent-soft);border-radius:0 12px 12px 0}}
[data-hermes-kind="video-card"]>h1{{font-size:2.15em;margin:.2em 0 .45em}}
[data-hermes-kind="video-meta"],[data-hermes-kind="video-tags"]{{font:600 14px/1.7 ui-sans-serif,system-ui;color:var(--muted);padding:11px 14px;border-radius:10px;background:var(--paper)}}
[data-hermes-kind="video-cover"]{{margin:24px 0 34px}}[data-hermes-kind="video-cover"] img{{width:100%;aspect-ratio:16/9;object-fit:cover;margin:0}}
[data-hermes-kind="video-description"],[data-hermes-kind="video-chapters"],[data-hermes-kind="video-notes"]{{margin:34px 0;padding-top:4px}}
[data-hermes-kind="video-chapters"] ol{{padding-left:1.5em;columns:2;column-gap:36px}}
[data-hermes-kind="video-chapters"] li{{break-inside:avoid;margin:.55em 0}}
@media(max-width:700px){{[data-hermes-kind="video-chapters"] ol{{columns:1}}}}
code,pre{{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}}code{{background:var(--accent-soft);padding:.12em .35em;border-radius:5px}}table{{border-collapse:collapse;width:100%;display:block;overflow:auto}}th,td{{border:1px solid var(--line);padding:9px 12px;text-align:left}}
{CODE_BLOCK_CSS}
a{{color:var(--accent);text-decoration-thickness:.08em;text-underline-offset:.18em}}[data-hermes-kind="missing-image"]{{padding:18px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);text-align:center}}
.footer{{font:13px/1.6 ui-sans-serif,system-ui;color:var(--muted);text-align:center;padding:28px 12px}}.footer a{{color:inherit}}.tags{{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}}
@media(max-width:700px){{.shell{{width:min(100% - 18px,980px);padding-top:12px}}.hero{{border-radius:20px 20px 14px 14px}}.summary-grid{{grid-template-columns:1fr}}.summary-card.wide{{grid-column:auto}}.article{{padding:24px 18px}}}}
{CODE_BLOCK_CSS}
</style>
</head>
<body>
<main class="shell">
  <header class="hero">
    <div class="eyebrow">离线网页收藏</div>
    <h1>{html.escape(title)}</h1>
    <p class="deck">{html.escape(r.one_sentence_summary or article.user_note or "网页正文、图片与排版已封装为一个离线页面。")}</p>
    <div class="meta"><span class="pill">{html.escape(category)}</span><span class="pill">{html.escape(source_label)}</span><span class="pill">{html.escape(image_status)}</span><span class="pill">完全离线</span></div>
    <div class="tags">{_tags(r.obsidian_tags)}</div>
  </header>
  <section class="panel">
    <h2>我的收藏备注</h2>
    <p class="saved-note{' empty' if not article.user_note.strip() else ''}">{html.escape(article.user_note.strip() or "未填写收藏备注。")}</p>
  </section>
  <section class="panel">
    <h2>AI 整理</h2>
    <div class="summary-grid">
      <div class="summary-card wide"><h3>内容摘要</h3><p>{html.escape(r.abstract or "未生成摘要，正文已完整保留。")}</p></div>
      <div class="summary-card"><h3>核心观点</h3>{_items(r.key_points)}</div>
      <div class="summary-card"><h3>可执行方法</h3>{_items(r.actionable_methods)}</div>
    </div>
  </section>
  <article class="article">
    <h2>网页正文</h2>
    <div class="article-body">{content}</div>
  </article>
  <footer class="footer">收藏时间：{html.escape(article.captured_at)} · <a href="{html.escape(article.url, quote=True)}" target="_blank" rel="noopener noreferrer">查看原始网址</a><br>页面内容与图片已封装在当前文件中，不依赖原网站继续存在。</footer>
</main>
{COPY_SCRIPT}
<script type="application/json" id="hermes-metadata">{metadata_json}</script>
</body>
</html>'''
