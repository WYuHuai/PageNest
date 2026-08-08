import asyncio
import hashlib
import html
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path
from time import perf_counter
from urllib.parse import urlsplit, urlunsplit

from .config import settings
from .organizers import call_hermes
from .images import (
    _embed_images,
    localize_article_html,
    model_image_data,
    place_unreferenced_images,
    prune_invalid_images,
    save_images,
)
from .models import ArticleInput
from .media import place_media, save_media
from .rendering import render_page
from .sanitizer import sanitize_content
from .security import inside_vault, safe_title
from .vault import DEFAULT_CATEGORY, require_vault_folder, select_vault_folder


PAGE_SUFFIX = ".pagenest"
SUPPORTED_PAGE_SUFFIXES = (PAGE_SUFFIX, ".hermes")




def normalize_url(url: str) -> str:
    parts = urlsplit(url)
    query = "&".join(x for x in parts.query.split("&") if x and not x.lower().startswith(("utm_", "spm=", "from=")))
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/") or "/", query, ""))


def content_hash(text: str) -> str:
    return hashlib.sha256(re.sub(r"\s+", " ", text).strip().encode("utf-8")).hexdigest()


def _find_duplicate(
    vault: Path,
    article: ArticleInput,
    digest: str,
    target_category: str | None = None,
) -> Path | None:
    target_url = normalize_url(article.canonical_url or article.url)
    target_folder = (
        inside_vault(vault, vault / Path(target_category))
        if target_category
        else None
    )
    pages = (
        page
        for suffix in SUPPORTED_PAGE_SUFFIXES
        for page in vault.glob(f"**/*{suffix}")
    )
    for page in pages:
        try:
            if target_folder is not None and page.parent.resolve() != target_folder:
                continue
            with page.open("r", encoding="utf-8") as handle:
                head = handle.read(24000)
            hash_match = re.search(r'<meta name="hermes-content-hash" content="([^"]*)">', head)
            source_match = re.search(r'<meta name="hermes-source" content="([^"]*)">', head)
            image_count_match = re.search(r'<meta name="hermes-image-count" content="(\d+)">', head)
            complete_match = re.search(r'<meta name="hermes-save-complete" content="1">', head)
            capture_match = re.search(r'<meta name="hermes-capture-version" content="(\d+)">', head)
            saved_hash = html.unescape(hash_match.group(1)) if hash_match else ""
            saved_url = normalize_url(html.unescape(source_match.group(1))) if source_match else ""
            saved_image_count = int(image_count_match.group(1)) if image_count_match else 0
            saved_capture_version = int(capture_match.group(1)) if capture_match else 1
            if article.capture_version > saved_capture_version:
                continue
            if article.images and not complete_match and saved_image_count == 0:
                continue
            if saved_hash == digest or saved_url == target_url:
                return page
        except Exception:
            continue
    return None


def _unique_page(parent: Path, base: str) -> Path:
    page = parent / f"{base}{PAGE_SUFFIX}"
    index = 2
    while page.exists():
        page = parent / f"{base}_{index}{PAGE_SUFFIX}"
        index += 1
    return page


def _write_page_atomic(final_path: Path, content: str) -> None:
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=final_path.parent,
            prefix=f".{final_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        if final_path.exists():
            raise FileExistsError(f"Refusing to replace existing page: {final_path}")
        os.replace(temporary, final_path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


async def collect(article: ArticleInput) -> dict:
    """Build the complete offline page first, then write to the vault exactly once."""
    vault = settings.vault
    if not vault or not vault.is_dir():
        raise ValueError("尚未配置有效的 OBSIDIAN_VAULT_PATH")
    digest = content_hash(article.article_text or article.selected_text)
    manual_category = (
        require_vault_folder(vault, article.category)
        if article.category != "auto"
        else None
    )
    duplicate = _find_duplicate(vault, article, digest, manual_category)
    if duplicate:
        return {
            "ok": True,
            "duplicate": True,
            "page_path": str(duplicate),
            "markdown_path": str(duplicate),
            "folder_path": str(duplicate.parent),
            "category": str(duplicate.parent.relative_to(vault)),
            "hermes_success": True,
            "saved_images": 0,
            "saved_videos": 0,
            "failed_videos": 0,
            "single_file": True,
            "detected_images": len(article.images),
            "failed_images": 0,
            "media_complete": True,
            "capture_version": article.capture_version,
            "image_placement": {
                "exact": 0,
                "ordinal": 0,
                "existing": 0,
                "context": 0,
                "appended": 0,
                "unplaced": 0,
            },
        }

    quick_task = asyncio.create_task(call_hermes(article, [])) if article.mode == "quick" else None
    media_task = asyncio.create_task(save_media(article))
    result = None
    organizer_error = ""
    image_error = ""
    organizer_elapsed = 0.0
    image_started = perf_counter()

    with tempfile.TemporaryDirectory(prefix="hermes-web-") as temporary:
        assets = Path(temporary) / "assets"
        try:
            images, replacements = await save_images(article, assets)
        except Exception as exc:
            images, replacements = [], {}
            image_error = f"图片处理失败：{type(exc).__name__}: {exc}"
        image_elapsed = perf_counter() - image_started

        try:
            saved_media = await media_task
        except Exception as exc:
            saved_media = []
            image_error = "；".join(
                value for value in (
                    image_error,
                    f"视频处理失败：{type(exc).__name__}: {exc}",
                )
                if value
            )

        embedded = _embed_images(replacements, assets)
        localized_html = localize_article_html(article.article_html, embedded)
        localized_html, image_placement = place_unreferenced_images(
            localized_html,
            images,
            assets,
            with_stats=True,
            allow_fallback=article.image_placement_policy != "strict",
        )
        localized_html, removed_placeholders = prune_invalid_images(localized_html)
        image_placement["removed_placeholders"] = removed_placeholders
        localized_html, media_placement = place_media(localized_html, saved_media)
        content = sanitize_content(localized_html, article.article_text or article.selected_text)

        if quick_task:
            result, _, organizer_elapsed, organizer_error = await quick_task
        elif article.mode == "deep":
            context = []
            seen_files = set()
            for image in (item for item in images if "filename" in item):
                if image["filename"] in seen_files:
                    continue
                seen_files.add(image["filename"])
                try:
                    context.append({**image, "data_url": model_image_data(assets / image["filename"])})
                except Exception as exc:
                    context.append({**image, "analysis_error": f"{type(exc).__name__}: {exc}"})
                if len(context) == 8:
                    break
            result, _, organizer_elapsed, organizer_error = await call_hermes(article, context)

        if article.category == "auto":
            requested = result.suggested_category if result else DEFAULT_CATEGORY
            category = select_vault_folder(vault, requested)
        else:
            category = manual_category

        destination = inside_vault(vault, vault / Path(category))
        destination.mkdir(parents=True, exist_ok=True)
        title = safe_title(article.title)
        final_path = _unique_page(destination, f"{datetime.now():%Y-%m-%d}_{title}")
        combined_error = "；".join(value for value in (organizer_error, image_error) if value)
        page = render_page(article, result, content, digest, category, images, combined_error)
        _write_page_atomic(final_path, page)

    saved_images = len([item for item in images if "filename" in item])
    failed_images = len([item for item in images if "error" in item])
    saved_videos = media_placement.get("saved", 0)
    failed_videos = media_placement.get("failed", 0)
    media_complete = (
        failed_images == 0
        and failed_videos == 0
        and image_placement.get("unplaced", 0) == 0
    )
    vision_count = sum(note.vision_verified for note in result.image_notes) if result else 0
    return {
        "ok": True,
        "duplicate": False,
        "title": article.title,
        "category": category,
        "page_path": str(final_path),
        "markdown_path": str(final_path),
        "folder_path": str(final_path.parent),
        "saved_images": saved_images,
        "saved_videos": saved_videos,
        "detected_images": len(article.images),
        "detected_videos": len(article.media),
        "failed_images": failed_images,
        "failed_videos": failed_videos,
        "media_complete": media_complete,
        "vision_images": vision_count,
        "single_file": True,
        "hermes_success": bool(result),
        "hermes_error": organizer_error,
        "image_error": image_error,
        "hermes_seconds": organizer_elapsed,
        "image_seconds": image_elapsed,
        "capture_version": article.capture_version,
        "image_placement": image_placement,
        "media_placement": media_placement,
    }
