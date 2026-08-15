import html
import json

from .models import ArticleInput, CommentReplyInput, HermesResult
from .sanitizer import CODE_BLOCK_CSS, COPY_SCRIPT, _clean_text

PAGENEST_FORMAT_VERSION = 1
PAGENEST_DOCUMENT_SCHEMA_VERSION = 1


def _items(values: list[str], empty: str = "暂无") -> str:
    if not values:
        return f'<p class="empty">{html.escape(empty)}</p>'
    return "<ul>" + "".join(f"<li>{html.escape(value)}</li>" for value in values) + "</ul>"


def _tags(values: list[str]) -> str:
    return "".join(f'<span class="tag">#{html.escape(value.lstrip("#"))}</span>' for value in values)


def _render_system_metadata(article: ArticleInput, digest: str, category: str, embedded: int) -> str:
    source = article.canonical_url or article.url
    return "\n".join(
        (
            f'<meta name="hermes-content-hash" content="{html.escape(digest, quote=True)}">',
            f'<meta name="hermes-source" content="{html.escape(source, quote=True)}">',
            f'<meta name="hermes-category" content="{html.escape(category, quote=True)}">',
            f'<meta name="hermes-image-count" content="{embedded}">',
            '<meta name="hermes-save-complete" content="1">',
            f'<meta name="hermes-capture-version" content="{article.capture_version}">',
            f'<meta name="hermes-pagenest-format-version" content="{PAGENEST_FORMAT_VERSION}">',
        )
    )


def _document_metadata(
    article: ArticleInput,
    title: str,
    digest: str,
    category: str,
    embedded: int,
    result: HermesResult | None,
) -> dict:
    return {
        "document_schema_version": PAGENEST_DOCUMENT_SCHEMA_VERSION,
        "title": title,
        "source": article.url,
        "canonical_url": article.canonical_url,
        "source_kind": article.source_kind,
        "source_name": article.source_name,
        "author": article.author,
        "published_at": article.published_at,
        "captured_at": article.captured_at,
        "language": article.language,
        "category": category,
        "content_hash": digest,
        "saved_images": embedded,
        "hermes_success": bool(result),
        "page_variant": article.page_variant,
    }


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
    metadata = _document_metadata(article, article.title, digest, category, embedded, result)
    metadata_json = json.dumps(metadata, ensure_ascii=False).replace("</", "<\\/")
    note = html.escape(article.user_note.strip() or "未填写收藏备注。")
    ai_panel = ""
    if result:
        ai_panel = f'''<section class="collector-card" data-pagenest-role="summary">
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
{_render_system_metadata(article, digest, category, embedded)}
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
  <article class="bili-card"><div class="article-body" data-pagenest-role="content">{content}</div></article>
  <section class="collector-card"><h2>我的收藏备注</h2><p data-pagenest-role="note">{note}</p></section>
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
    metadata = _document_metadata(article, visible_title, digest, category, embedded, result)
    metadata_json = json.dumps(metadata, ensure_ascii=False).replace("</", "<\\/")
    note = html.escape(article.user_note.strip() or "未填写收藏备注。")
    ai_summary = ""
    if result:
        ai_summary = f'<section class="collector" data-pagenest-role="summary"><h2>AI 整理</h2><p>{html.escape(result.abstract or result.one_sentence_summary or "未生成摘要。")}</p></section>'
    elif error:
        ai_summary = f'<section class="collector muted"><h2>整理状态</h2><p>{html.escape(error)}</p></section>'
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'nonce-hermes-offline'; base-uri 'none'; form-action 'none'">
{_render_system_metadata(article, digest, category, embedded)}
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
[data-hermes-kind="missing-image"]{{display:inline-block;margin:.35em 0;padding:.2em .55em;border-radius:5px;background:#f5f6f7;color:var(--muted);font-size:.85em}}
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
  <div class="doc-body" data-pagenest-role="content">{content}</div>
  <section class="collector"><h2>我的收藏备注</h2><p data-pagenest-role="note">{note}</p></section>
  {ai_summary}
  <footer class="doc-footer">离线保存于 {html.escape(article.captured_at)} · <a href="{html.escape(article.url, quote=True)}">查看原始飞书文档</a></footer>
</main>
{COPY_SCRIPT}
<script type="application/json" id="hermes-metadata">{metadata_json}</script>
</body>
</html>'''


def _render_xhs_comments(comments: list[CommentReplyInput]) -> str:
    if not comments:
        return ""

    def item(comment: CommentReplyInput, reply: bool = False) -> str:
        avatar = comment.avatar_data_url
        if avatar.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,", "data:image/gif;base64,")):
            avatar_html = f'<img class="comment-avatar" src="{html.escape(avatar, quote=True)}" alt="">'
        else:
            avatar_html = '<span class="comment-avatar comment-avatar-placeholder" aria-hidden="true"></span>'
        meta = " · ".join(filter(None, (comment.location, comment.time, f"{comment.like_count} 赞" if comment.like_count else "")))
        replies = "" if reply or not comment.replies else '<div class="comment-replies">' + "".join(item(child, True) for child in comment.replies) + "</div>"
        author_tag = '<span class="comment-author-tag">作者</span>' if comment.is_author else ""
        classes = "comment-item comment-reply" if reply else "comment-item"
        return f'''<article class="{classes}">{avatar_html}<div class="comment-main"><div class="comment-author">{html.escape(comment.author)}{author_tag}</div><div class="comment-content">{html.escape(comment.content)}</div>{f'<div class="comment-meta">{html.escape(meta)}</div>' if meta else ''}{replies}</div></article>'''

    return '<section data-hermes-kind="xhs-comments" data-pagenest-role="comments"><h2>评论</h2>' + "".join(item(comment) for comment in comments) + "</section>"


def _render_xiaohongshu_note_page(
    article: ArticleInput,
    result: HermesResult | None,
    content: str,
    digest: str,
    category: str,
    images: list[dict],
    error: str,
) -> str:
    embedded = len([item for item in images if "filename" in item])
    title = _clean_text(article.title) or "小红书笔记"
    metadata = _document_metadata(article, title, digest, category, embedded, result)
    metadata_json = json.dumps(metadata, ensure_ascii=False).replace("</", "<\\/")
    note = html.escape(article.user_note.strip() or "未填写收藏备注。")
    summary = html.escape(result.abstract or result.one_sentence_summary) if result else ""
    comments = _render_xhs_comments(article.comments)
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'nonce-hermes-offline'; base-uri 'none'; form-action 'none'">
{_render_system_metadata(article, digest, category, embedded)}
<title>{html.escape(title)}</title>
<style>
:root{{--paper:#f7f7f7;--card:#fff;--ink:#222;--muted:#8b8b8b;--line:#ececec;--accent:#ff2442}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}}.xhs-shell{{width:min(680px,100%);margin:0 auto;padding:18px 12px 72px}}.xhs-card,.xhs-meta{{background:var(--card);border:1px solid var(--line);border-radius:16px}}.xhs-card{{padding:22px}}[data-hermes-kind="xhs-note"] h1{{font-size:24px;line-height:1.4;margin:0 0 8px}}[data-hermes-kind="xhs-author"]{{color:var(--muted);margin:0 0 18px}}[data-hermes-kind="xhs-gallery"]{{position:relative;margin:0 -22px 22px;background:#111;overflow:hidden}}[data-hermes-kind="xhs-slide"]{{margin:0}}[data-hermes-kind="xhs-slide"] img{{display:block;width:100%;max-height:72vh;object-fit:contain;margin:auto}}[data-hermes-kind="xhs-gallery-controls"]{{position:absolute;inset:0;margin:0;pointer-events:none}}[data-hermes-kind="xhs-gallery-controls"] a{{position:absolute;top:50%;display:grid;place-items:center;width:42px;height:56px;border-radius:12px;background:rgba(17,17,17,.64);color:#fff;text-decoration:none;font:40px/1 Arial,sans-serif;opacity:0;pointer-events:auto;transform:translateY(-50%);transition:opacity .16s ease,background .16s ease}}[data-hermes-gallery-prev]{{left:12px}}[data-hermes-gallery-next]{{right:12px}}[data-hermes-kind="xhs-gallery"]:hover [data-hermes-kind="xhs-gallery-controls"] a,[data-hermes-kind="xhs-gallery-controls"] a:focus-visible{{opacity:1}}[data-hermes-kind="xhs-gallery-controls"] a:hover{{background:rgba(17,17,17,.82)}}[data-hermes-kind="xhs-gallery-count"]{{position:absolute;left:50%;bottom:12px;min-width:54px;padding:3px 10px;border-radius:999px;background:rgba(17,17,17,.62);color:#fff;text-align:center;font-size:12px;opacity:.9;transform:translateX(-50%)}}[data-hermes-kind="xhs-description"]{{white-space:pre-wrap;margin:0 0 26px;font-size:16px}}[data-hermes-kind="xhs-comments"]{{border-top:1px solid var(--line);margin-top:24px;padding-top:20px}}[data-hermes-kind="xhs-comments"] h2{{font-size:18px;margin:0 0 10px}}.comment-item{{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}}.comment-avatar{{flex:0 0 36px;width:36px;height:36px;border-radius:50%;object-fit:cover;background:#eee}}.comment-avatar-placeholder{{display:block}}.comment-main{{min-width:0;flex:1}}.comment-author{{font-size:14px;color:#555}}.comment-author-tag{{margin-left:6px;color:var(--accent);font-size:12px}}.comment-content{{margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere}}.comment-meta{{margin-top:5px;color:var(--muted);font-size:12px}}.comment-replies{{margin:10px 0 0 4px;padding-left:12px;border-left:2px solid var(--line)}}.comment-reply{{padding:10px 0;border-bottom:0}}.comment-reply .comment-avatar{{flex-basis:28px;width:28px;height:28px}}.xhs-meta{{margin-top:12px;padding:16px 18px;color:var(--muted)}}.xhs-meta p{{margin:0;white-space:pre-wrap}}.xhs-meta strong{{color:var(--ink)}}.xhs-footer{{margin-top:18px;text-align:center;color:var(--muted);font-size:12px}}.xhs-footer a{{color:inherit}}@media(max-width:520px){{.xhs-shell{{padding:0 0 50px}}.xhs-card,.xhs-meta{{border-radius:0;border-left:0;border-right:0}}.xhs-card{{padding:18px}}[data-hermes-kind="xhs-gallery"]{{margin:0 -18px 20px}}}}
</style>
</head>
<body>
<main class="xhs-shell">
  <article class="xhs-card">{content}{comments}</article>
  <section class="xhs-meta"><strong>我的收藏备注</strong><p data-pagenest-role="note">{note}</p>{f'<p data-pagenest-role="summary"><strong>AI 整理：</strong>{summary}</p>' if summary else ''}</section>
  <footer class="xhs-footer">离线保存于 {html.escape(article.captured_at)} · 已内嵌 {embedded} 张图片 · <a href="{html.escape(article.url, quote=True)}">查看原网页</a></footer>
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
    if article.page_variant == "xiaohongshu-note":
        return _render_xiaohongshu_note_page(article, result, content, digest, category, images, error)
    r = result or HermesResult(normalized_title=article.title, suggested_category=category, limitations=[error or "AI 未处理，已保留离线正文。"])
    title = r.normalized_title or article.title
    embedded = len([item for item in images if "filename" in item])
    failed = len([item for item in images if "error" in item])
    metadata = _document_metadata(article, title, digest, category, embedded, result)
    metadata_json = json.dumps(metadata, ensure_ascii=False).replace("</", "<\\/")
    source_label = article.site_name or "原网页"
    if article.source_kind == "local-html":
        source_footer = f"来源：本地 HTML · {html.escape(article.source_name or article.title)}"
    else:
        source_footer = f'<a href="{html.escape(article.url, quote=True)}" target="_blank" rel="noopener noreferrer">查看原始网址</a>'
    image_status = f"{embedded} 张图片已内嵌"
    if failed:
        image_status += f" · {failed} 张失败"
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-hermes-offline'; base-uri 'none'; form-action 'none'">
{_render_system_metadata(article, digest, category, embedded)}
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
a{{color:var(--accent);text-decoration-thickness:.08em;text-underline-offset:.18em}}[data-hermes-kind="missing-image"]{{display:inline-block;margin:.35em 0;padding:.2em .55em;border-radius:5px;background:var(--paper);color:var(--muted);font:13px/1.5 ui-sans-serif,system-ui}}
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
    <p class="saved-note{' empty' if not article.user_note.strip() else ''}" data-pagenest-role="note">{html.escape(article.user_note.strip() or "未填写收藏备注。")}</p>
  </section>
  <section class="panel">
    <h2>AI 整理</h2>
    <div class="summary-grid">
      <div class="summary-card wide" data-pagenest-role="summary"><h3>内容摘要</h3><p>{html.escape(r.abstract or "未生成摘要，正文已完整保留。")}</p></div>
      <div class="summary-card"><h3>核心观点</h3>{_items(r.key_points)}</div>
      <div class="summary-card"><h3>可执行方法</h3>{_items(r.actionable_methods)}</div>
    </div>
  </section>
  <article class="article">
    <h2>网页正文</h2>
    <div class="article-body" data-pagenest-role="content">{content}</div>
  </article>
  <footer class="footer">收藏时间：{html.escape(article.captured_at)} · {source_footer}<br>页面内容与图片已封装在当前文件中，不依赖原网站继续存在。</footer>
</main>
{COPY_SCRIPT}
<script type="application/json" id="hermes-metadata">{metadata_json}</script>
</body>
</html>'''
