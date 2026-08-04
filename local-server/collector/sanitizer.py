import html
import re
import unicodedata
from bs4 import BeautifulSoup


BLOCKED_TAGS = {"script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "option", "link", "meta", "base", "svg", "canvas", "audio", "source", "track"}
SAFE_ATTRIBUTES = {"href", "src", "alt", "title", "colspan", "rowspan", "width", "height", "controls", "preload", "poster", "playsinline", "download"}
SAFE_DATA_ATTRIBUTES = {"data-hermes-kind", "data-hermes-token", "data-hermes-language"}
PLAYER_CONTROL_TOKENS = {
    "00", "0/0", "00:00", "播放", "暂停", "倍速", "全屏", "退出全屏",
    "倍速播放中", "0.5倍", "0.75倍", "1.0倍", "1.5倍", "2.0倍",
    "超清", "高清", "流畅", "自动", "已关注", "关注", "重播", "赞",
    "观看更多", "继续观看", "转载", "视频详情",
}
PLAYER_SHELL_MARKERS = {"已关注", "关注", "重播", "赞", "观看更多", "继续观看", "转载", "视频详情"}
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


def _is_player_control_text(value: str) -> bool:
    tokens = _clean_text(value).split()
    return bool(tokens) and all(
        token in PLAYER_CONTROL_TOKENS
        or re.fullmatch(r"\d{2}:\d{2}(?:/\d{2}:\d{2})?", token)
        or re.fullmatch(r"(?:进度条[，,、:]?|百分之\d+)", token)
        for token in tokens
    )


def _player_shell(video):
    candidate = None
    for ancestor in list(video.parents)[:10]:
        if ancestor.name in {"article", "body", "html"}:
            break
        text = _clean_text(ancestor.get_text(" ", strip=True))
        classes = " ".join(ancestor.get("class", []))
        marker_count = sum(marker in text for marker in PLAYER_SHELL_MARKERS)
        is_player = re.search(r"(?:^|[-_])(player|video)(?:[-_]|$)", classes, re.I) or marker_count >= 3
        if len(ancestor.find_all("video")) == 1 and is_player and len(text) < 800:
            candidate = ancestor
    return candidate


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
    for video in list(soup.find_all("video")):
        if shell := _player_shell(video):
            poster = shell.find("img", src=lambda value: value and value.startswith("data:image/"))
            if poster and not video.get("poster"):
                video["poster"] = poster["src"]
            shell.replace_with(video.extract())
    for tag in reversed(list(soup.find_all(["a", "button", "div", "p", "span"]))):
        if not tag.find(["img", "video", "pre", "code", "table"]) and _is_player_control_text(tag.get_text(" ", strip=True)):
            tag.decompose()
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
                alt = _clean_text(tag.get("alt", ""))
                if alt:
                    placeholder = soup.new_tag("span")
                    placeholder["data-hermes-kind"] = "missing-image"
                    placeholder.string = f"图片未保存：{alt}"
                    tag.replace_with(placeholder)
                else:
                    tag.decompose()
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
            if not _clean_text(tag.get_text(" ", strip=True)) and not tag.find(["img", "picture", "video"]):
                host = href.split("/", 3)[2].lower() if "://" in href else ""
                if host == "github.com" or host.endswith(".github.com"):
                    tag.string = "打开 GitHub 链接 ↗"
                elif host in {"gitee.com", "gitcode.net"} or host.endswith((".gitee.com", ".gitcode.net")):
                    tag.string = "打开代码仓库 ↗"
                else:
                    tag.decompose()
    for item in list(soup.find_all("li")):
        if not _clean_text(item.get_text(" ", strip=True)) and not item.find(["img", "video", "pre", "code", "table"]):
            item.decompose()
    for container in list(soup.find_all(["ul", "ol"])):
        if not container.find("li"):
            container.decompose()
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
