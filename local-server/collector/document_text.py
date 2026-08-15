import json
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag


_SPACE_RE = re.compile(r"\s+")
_STYLE_RE = re.compile(r"<style\b[^>]*>.*?</style\s*>", re.IGNORECASE | re.DOTALL)
_DATA_ATTRIBUTE_RE = re.compile(
    r"(\b(?:src|poster)\s*=\s*([\"']))data:[^\"']*(\2)",
    re.IGNORECASE,
)
_BLOCK_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "pre", "tr", "figcaption"}
_CONTENT_SELECTORS = (
    '[data-pagenest-role="content"]',
    ".article-body",
    ".doc-body",
    '[data-hermes-kind="xhs-note"]',
    "article.xhs-card",
    "main",
    "body",
)
_REMOVE_FROM_CONTENT = (
    '[data-pagenest-role="comments"]',
    '[data-pagenest-role="note"]',
    '[data-pagenest-role="summary"]',
    '[data-hermes-kind="xhs-comments"]',
    '[data-hermes-kind="xhs-gallery-controls"]',
    ".collector",
    ".collector-card",
    ".panel",
    ".xhs-meta",
    ".footer",
    ".doc-footer",
    ".bili-footer",
    ".xhs-footer",
    "nav",
    "footer",
    "button",
    "script",
    "style",
    "noscript",
)


@dataclass(frozen=True)
class CodeBlock:
    text: str
    language: str = ""


@dataclass(frozen=True)
class PageNestDocument:
    title: str
    source: str
    author: str
    captured_at: str
    category: str
    text: str
    headings: tuple[str, ...]
    code_blocks: tuple[CodeBlock, ...]
    comments: tuple[str, ...]
    image_descriptions: tuple[str, ...]
    summary: str
    note: str

    @property
    def searchable_text(self) -> str:
        parts = (self.title, self.author, self.text, *self.comments, self.summary, self.note)
        return "\n".join(part for part in parts if part)


def _clean(value: str) -> str:
    return _SPACE_RE.sub(" ", value or "").strip()


def _clean_code(value: str) -> str:
    return (value or "").replace("\r\n", "\n").replace("\r", "\n").strip("\n")


def _prepare_html(page: str) -> str:
    page = _STYLE_RE.sub("", page)
    return _DATA_ATTRIBUTE_RE.sub(r"\1data:,\3", page)


def _metadata(soup: BeautifulSoup) -> dict:
    node = soup.select_one("script#hermes-metadata")
    if not node:
        return {}
    try:
        value = json.loads(node.string or node.get_text() or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _meta(soup: BeautifulSoup, name: str) -> str:
    node = soup.find("meta", attrs={"name": name})
    return _clean(str(node.get("content", ""))) if isinstance(node, Tag) else ""


def _labelled_text(soup: BeautifulSoup, label: str, *, paragraph: int = 0) -> str:
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "strong"]):
        if _clean(heading.get_text(" ", strip=True)).rstrip("：:") != label:
            continue
        section = heading.find_parent("section") or heading.parent
        if not isinstance(section, Tag):
            continue
        paragraphs = section.find_all("p")
        if len(paragraphs) > paragraph:
            return _clean(paragraphs[paragraph].get_text(" ", strip=True))
    return ""


def _role_text(soup: BeautifulSoup, role: str) -> str:
    node = soup.select_one(f'[data-pagenest-role="{role}"]')
    if not isinstance(node, Tag):
        return ""
    paragraph = node.find("p")
    target = paragraph if isinstance(paragraph, Tag) else node
    return _clean(target.get_text(" ", strip=True))


def _content_root(soup: BeautifulSoup) -> Tag | None:
    for selector in _CONTENT_SELECTORS:
        node = soup.select_one(selector)
        if isinstance(node, Tag):
            return node
    return None


def _is_custom_block(node: Tag) -> bool:
    kind = str(node.get("data-hermes-kind", ""))
    return kind in {"paragraph", "list-item", "xhs-description", "comment-content"}


def _text_blocks(root: Tag) -> tuple[str, ...]:
    candidates = [node for node in root.find_all(True) if node.name in _BLOCK_TAGS or _is_custom_block(node)]
    candidate_ids = {id(node) for node in candidates}
    blocks: list[str] = []
    for node in candidates:
        if any(id(parent) in candidate_ids for parent in node.parents if parent is not root):
            continue
        value = _clean_code(node.get_text()) if node.name == "pre" else _clean(node.get_text(" ", strip=True))
        if value and (not blocks or blocks[-1] != value):
            blocks.append(value)
    if blocks:
        return tuple(blocks)
    fallback = _clean(root.get_text(" ", strip=True))
    return (fallback,) if fallback else ()


def _language(pre: Tag) -> str:
    for node in (pre, pre.find("code"), pre.find_parent(attrs={"data-hermes-language": True})):
        if not isinstance(node, Tag):
            continue
        language = _clean(str(node.get("data-hermes-language", "")))
        if language:
            return language
        for class_name in node.get("class", []):
            if str(class_name).startswith("language-"):
                return str(class_name).removeprefix("language-")
    return ""


def extract_document(page: str) -> PageNestDocument:
    """Extract searchable, AI-friendly text without executing saved page content."""
    soup = BeautifulSoup(_prepare_html(page), "html.parser")
    metadata = _metadata(soup)
    root = _content_root(soup)

    if root:
        content_soup = BeautifulSoup(str(root), "html.parser")
        clean_root = content_soup.find()
        if isinstance(clean_root, Tag):
            for selector in _REMOVE_FROM_CONTENT:
                for node in clean_root.select(selector):
                    node.decompose()
            blocks = _text_blocks(clean_root)
        else:
            blocks = ()
    else:
        clean_root = None
        blocks = ()

    heading_root = clean_root or soup
    headings = tuple(
        value
        for node in heading_root.find_all(["h1", "h2", "h3", "h4", "h5", "h6"])
        if (value := _clean(node.get_text(" ", strip=True)))
    )
    code_blocks = tuple(
        CodeBlock(value, _language(node))
        for node in heading_root.find_all("pre")
        if (value := _clean_code(node.get_text()))
    )
    comments: list[str] = []
    for node in soup.select(
        '[data-pagenest-role="comments"] .comment-content, [data-hermes-kind="xhs-comments"] .comment-content'
    ):
        content = _clean(node.get_text(" ", strip=True))
        parent = node.find_parent(class_="comment-main") or node.find_parent(class_="comment-item") or node.parent
        author_node = parent.find(class_="comment-author") if isinstance(parent, Tag) else None
        author = _clean(author_node.get_text(" ", strip=True)) if isinstance(author_node, Tag) else ""
        if content:
            comments.append(f"{author}: {content}" if author else content)
    image_descriptions = tuple(
        dict.fromkeys(
            value
            for node in heading_root.find_all(["img", "figcaption"])
            if (value := _clean(str(node.get("alt", "")) if node.name == "img" else node.get_text(" ", strip=True)))
        )
    )

    title_node = soup.find("title")
    title = _clean(str(metadata.get("title", ""))) or (
        _clean(title_node.get_text(" ", strip=True)) if isinstance(title_node, Tag) else ""
    )
    source = (
        _clean(str(metadata.get("canonical_url", "")))
        or _clean(str(metadata.get("source", "")))
        or _meta(soup, "hermes-source")
    )
    note = _role_text(soup, "note") or _labelled_text(soup, "我的收藏备注")
    summary = _role_text(soup, "summary") or _labelled_text(soup, "AI 整理") or _labelled_text(soup, "内容摘要")

    return PageNestDocument(
        title=title,
        source=source,
        author=_clean(str(metadata.get("author", ""))),
        captured_at=_clean(str(metadata.get("captured_at", ""))),
        category=_clean(str(metadata.get("category", ""))) or _meta(soup, "hermes-category"),
        text="\n\n".join(blocks),
        headings=headings,
        code_blocks=code_blocks,
        comments=tuple(comments),
        image_descriptions=image_descriptions,
        summary=summary,
        note=note,
    )
