import asyncio
import base64
import hashlib
import mimetypes
import re
from collections import Counter
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup
from PIL import Image

from .config import settings
from .limits import IMAGE_BATCH_TIMEOUT, IMAGE_DOWNLOAD_CONCURRENCY, IMAGE_ITEM_TIMEOUT, MAX_IMAGE_BYTES
from .models import ArticleInput
from .network import decode_data_url, fetch_bytes

def _data_bytes(value: str) -> tuple[bytes, str]:
    return decode_data_url(value, max_bytes=MAX_IMAGE_BYTES)


def _placeholder_svg(body: bytes) -> bool:
    try:
        source = body.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return False
    loading_title = re.search(
        r"<title[^>]*>[^<]*(?:加载|loading)[^<]*</title>",
        source,
        flags=re.IGNORECASE,
    )
    has_visual = re.search(
        r"<(?:path|rect|circle|ellipse|line|polyline|polygon|image|text|use)\b",
        source,
        flags=re.IGNORECASE,
    )
    return bool(loading_title) or not has_visual


def _extension(mime: str, url: str, detected_format: str = "") -> str:
    mapping = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/bmp": ".bmp", "image/svg+xml": ".svg"}
    format_mapping = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp", "GIF": ".gif", "BMP": ".bmp"}
    ext = Path(urlsplit(url).path).suffix.lower()
    return mapping.get(mime.split(";")[0].lower(), format_mapping.get(detected_format.upper(), ext if ext in mapping.values() else ".bin"))


async def _download_image(client: httpx.AsyncClient, semaphore: asyncio.Semaphore, index: int, item):
    source = item.data_url or item.resolved_url or item.current_src or item.original_url
    if not source:
        return index, item, source, None, "", ""
    try:
        async with semaphore:
            async with asyncio.timeout(IMAGE_ITEM_TIMEOUT):
                if source.startswith("data:"):
                    body, mime = _data_bytes(source)
                else:
                    download = await fetch_bytes(
                        client,
                        source,
                        max_bytes=MAX_IMAGE_BYTES,
                        allow_local_networks=settings.allow_local_network_downloads,
                    )
                    body, mime = download.body, download.content_type
        return index, item, source, body, mime, ""
    except Exception as exc:
        return index, item, source, None, "", f"{type(exc).__name__}: {exc}"


async def save_images(article: ArticleInput, assets: Path) -> tuple[list[dict], dict[str, str]]:
    saved, replacements, hashes = [], {}, {}
    assets.mkdir(parents=True, exist_ok=True)
    ordered = sorted(article.images, key=lambda item: item.order)
    if not ordered:
        return saved, replacements

    semaphore = asyncio.Semaphore(IMAGE_DOWNLOAD_CONCURRENCY)
    timeout = httpx.Timeout(10, connect=4, pool=4)
    headers = {"Referer": article.url, "User-Agent": "Mozilla/5.0 PageNestWebCollector/1.7.4"}
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, headers=headers) as client:
        tasks = {
            asyncio.create_task(_download_image(client, semaphore, index, item)): (index, item)
            for index, item in enumerate(ordered)
        }
        done, pending = await asyncio.wait(tasks, timeout=IMAGE_BATCH_TIMEOUT)
        downloads = [task.result() for task in done]
        for task in pending:
            task.cancel()
            index, item = tasks[task]
            source = item.data_url or item.resolved_url or item.current_src or item.original_url
            downloads.append((
                index,
                item,
                source,
                None,
                "",
                f"TimeoutError: 图片批量处理超过 {IMAGE_BATCH_TIMEOUT} 秒",
            ))
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    for _, item, source, body, mime, error in sorted(downloads, key=lambda result: result[0]):
        if not source:
            continue
        if error:
            saved.append({"source": source[:300], "error": error})
            continue
        try:
            if mime.split(";", 1)[0].lower() == "image/svg+xml" and _placeholder_svg(body):
                continue
            digest = hashlib.sha256(body).hexdigest()
            if digest in hashes:
                filename = hashes[digest]
                saved.append({
                    "filename": filename,
                    "sha256": digest,
                    "alt": item.alt,
                    "caption": item.caption,
                    "nearby_text": item.nearby_text,
                    "vision_verified": False,
                    "order": item.order,
                    "position_id": item.position_id,
                    "source_type": item.source_type,
                    "duplicate_asset": True,
                })
                for key in (item.original_url, item.resolved_url, item.current_src, item.data_url):
                    if key:
                        replacements[key] = f"assets/{filename}"
                continue
            detected_format = ""
            try:
                with Image.open(BytesIO(body)) as image:
                    width, height = image.size
                    detected_format = image.format or ""
                if width < 80 and height < 80:
                    continue
            except Exception:
                if not mime.startswith("image/"):
                    raise ValueError("下载内容不是可识别图片")
            filename = f"image-{len(hashes)+1:03d}{_extension(mime, source, detected_format)}"
            hashes[digest] = filename
            (assets / filename).write_bytes(body)
            saved.append({
                "filename": filename,
                "sha256": digest,
                "alt": item.alt,
                "caption": item.caption,
                "nearby_text": item.nearby_text,
                "vision_verified": False,
                "order": item.order,
                "position_id": item.position_id,
                "source_type": item.source_type,
            })
            for key in (item.original_url, item.resolved_url, item.current_src, item.data_url):
                if key:
                    replacements[key] = f"assets/{filename}"
        except Exception as exc:
            saved.append({"source": source[:300], "error": f"{type(exc).__name__}: {exc}"})
    return saved, replacements



def localize_article_html(html: str, replacements: dict[str, str]) -> str:
    """Rewrite image references in the DOM before single-page assembly."""
    soup = BeautifulSoup(html, "html.parser")
    source_attributes = ("src", "data-src", "data-original", "data-lazy-src", "data-actualsrc")
    for tag in soup.find_all(True):
        for attribute in source_attributes:
            value = tag.get(attribute)
            if value in replacements:
                tag[attribute] = replacements[value]
                if tag.name == "img":
                    tag["src"] = replacements[value]
        srcset = tag.get("srcset")
        if srcset:
            parts = []
            for candidate in srcset.split(","):
                fields = candidate.strip().split()
                if fields:
                    fields[0] = replacements.get(fields[0], fields[0])
                parts.append(" ".join(fields))
            tag["srcset"] = ", ".join(parts)
        style = tag.get("style")
        if style:
            for source, relative in replacements.items():
                style = style.replace(source, relative)
            tag["style"] = style
    return str(soup)
def model_image_data(path: Path) -> str:
    """Create a bounded analysis copy; the saved original is never replaced."""
    with Image.open(path) as image:
        image.seek(0)
        frame = image.convert("RGB")
        frame.thumbnail((960, 960), Image.Resampling.LANCZOS)
        output = BytesIO()
        frame.save(output, "JPEG", quality=76, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def _asset_data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    try:
        with Image.open(path) as image:
            mime = Image.MIME.get(image.format, mime)
    except Exception:
        pass
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def place_unreferenced_images(
    source_html: str,
    images: list[dict],
    assets: Path,
    *,
    with_stats: bool = False,
    allow_fallback: bool = True,
) -> str | tuple[str, dict[str, int]]:
    """Place images by marker, then DOM order, then nearby text for legacy captures."""
    soup = BeautifulSoup(source_html or "", "html.parser")
    container = soup.body or soup
    stats = {"exact": 0, "ordinal": 0, "existing": 0, "context": 0, "appended": 0, "unplaced": 0}
    existing_counts = Counter(
        image.get("src", "")
        for image in soup.find_all("img")
        if image.get("src", "").startswith("data:image/")
    )
    insertion_points: dict[str, object] = {}
    ordinal_slots = [
        image for image in soup.find_all("img")
        if not image.get("src", "").startswith("data:image/")
        and not image.get("data-hermes-image-id")
    ]
    ordinal_index = 0

    def normalized(value: str) -> str:
        return re.sub(r"\s+", "", value or "")

    for item in sorted((entry for entry in images if entry.get("filename")), key=lambda entry: entry.get("order", 0)):
        path = assets / item["filename"]
        data_url = _asset_data_url(path)
        position_id = item.get("position_id", "")
        marker = soup.find(attrs={"data-hermes-image-id": position_id}) if position_id else None
        if marker is not None:
            if marker.name == "img":
                marker["src"] = data_url
                if item.get("alt") and not marker.get("alt"):
                    marker["alt"] = item["alt"]
            else:
                image = soup.new_tag("img")
                image["src"] = data_url
                if item.get("alt"):
                    image["alt"] = item["alt"]
                marker.replace_with(image)
            stats["exact"] += 1
            continue

        if existing_counts[data_url] > 0:
            existing_counts[data_url] -= 1
            stats["existing"] += 1
            continue

        if allow_fallback and item.get("source_type", "img") == "img" and ordinal_index < len(ordinal_slots):
            slot = ordinal_slots[ordinal_index]
            ordinal_index += 1
            slot["src"] = data_url
            if item.get("alt") and not slot.get("alt"):
                slot["alt"] = item["alt"]
            stats["ordinal"] += 1
            continue

        figure = soup.new_tag("figure")
        image = soup.new_tag("img")
        image["src"] = data_url
        if item.get("alt"):
            image["alt"] = item["alt"]
        figure.append(image)
        caption = item.get("caption", "").strip()
        if caption:
            label = soup.new_tag("figcaption")
            label.string = caption
            figure.append(label)

        nearby = normalized(item.get("nearby_text", ""))
        key = nearby[:80]
        anchor = insertion_points.get(key)
        if anchor is None and len(nearby) >= 12:
            candidates = []
            for tag in soup.find_all(["p", "li", "figcaption", "h1", "h2", "h3", "h4", "div"]):
                text = normalized(tag.get_text(" ", strip=True))
                if not text:
                    continue
                probe = nearby[: min(60, len(nearby))]
                if probe in text or (len(text) >= 12 and text[: min(60, len(text))] in nearby):
                    candidates.append((len(text), tag))
            if candidates:
                anchor = min(candidates, key=lambda candidate: candidate[0])[1]
        if anchor is not None:
            anchor.insert_after(figure)
            stats["context"] += 1
            insertion_points[key] = figure
        elif allow_fallback:
            container.append(figure)
            stats["appended"] += 1
            insertion_points[key] = figure
        else:
            stats["unplaced"] += 1
    rendered = str(soup)
    return (rendered, stats) if with_stats else rendered


def prune_invalid_images(source_html: str) -> tuple[str, int]:
    """Remove invalid inline images and known loading placeholders before rendering."""
    soup = BeautifulSoup(source_html or "", "html.parser")
    removed = 0
    for image in list(soup.find_all("img")):
        src = image.get("src", "")
        invalid = False
        if src.startswith("data:image/"):
            try:
                body, mime = _data_bytes(src)
                if mime.lower() == "image/svg+xml":
                    invalid = _placeholder_svg(body)
                else:
                    with Image.open(BytesIO(body)) as opened:
                        width, height = opened.size
                    invalid = width <= 0 or height <= 0
            except Exception:
                invalid = True
        if not invalid:
            continue
        parent = image.parent
        if parent and parent.name == "figure":
            parent.decompose()
        else:
            image.decompose()
        removed += 1
    return str(soup), removed


def _embed_images(replacements: dict[str, str], assets: Path) -> dict[str, str]:
    embedded: dict[str, str] = {}
    cache: dict[str, str] = {}
    for source, relative in replacements.items():
        filename = Path(relative).name
        if filename not in cache:
            path = assets / filename
            mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
            try:
                with Image.open(path) as image:
                    mime = Image.MIME.get(image.format, mime)
            except Exception:
                pass
            cache[filename] = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")
        embedded[source] = cache[filename]
    return embedded
