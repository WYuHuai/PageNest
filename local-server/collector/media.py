import asyncio
import base64
import mimetypes
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import imageio_ffmpeg
from bs4 import BeautifulSoup
from yt_dlp import YoutubeDL

from .config import settings
from .limits import MAX_MEDIA_BYTES, MEDIA_TIMEOUT
from .models import ArticleInput, MediaInput
from .network import decode_data_url, fetch_bytes, validate_download_url


@dataclass
class SavedMedia:
    position_id: str
    data_url: str
    poster_url: str = ""
    error: str = ""



def _video_data_url(body: bytes, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(body).decode("ascii")


def _download_with_ytdlp(page_url: str, directory: Path) -> tuple[bytes, str]:
    template = str(directory / "video.%(ext)s")
    options = {
        "format": (
            "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]"
            "/best[height<=360][ext=mp4]"
        ),
        "outtmpl": template,
        "merge_output_format": "mp4",
        "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 20,
        "retries": 1,
        "max_filesize": MAX_MEDIA_BYTES,
    }
    with YoutubeDL(options) as downloader:
        info = downloader.extract_info(page_url, download=True)
        filename = Path(downloader.prepare_filename(info))
    if not filename.is_file():
        candidates = sorted(directory.glob("video.*"))
        if not candidates:
            raise ValueError("视频提取器没有生成可播放文件")
        filename = candidates[0]
    body = filename.read_bytes()
    if not body or len(body) > MAX_MEDIA_BYTES:
        raise ValueError("视频为空或超过 150 MB 单文件限制")
    mime = mimetypes.guess_type(filename.name)[0] or "video/mp4"
    return body, mime


def _bilibili_page(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return host == "bilibili.com" or host.endswith(".bilibili.com")


async def _download_direct(item: MediaInput, article_url: str) -> tuple[bytes, str]:
    if item.data_url:
        return decode_data_url(item.data_url, max_bytes=MAX_MEDIA_BYTES)
    if not item.source_url or item.source_url.startswith("blob:"):
        raise ValueError("播放器只暴露了 blob 流，需使用页面视频提取")
    headers = {
        "Referer": article_url,
        "User-Agent": "Mozilla/5.0 HermesObsidianCollector/1.0",
    }
    timeout = httpx.Timeout(60, connect=8, pool=8)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, headers=headers) as client:
        download = await fetch_bytes(
            client,
            item.source_url,
            max_bytes=MAX_MEDIA_BYTES,
            allow_local_networks=settings.allow_local_network_downloads,
        )
    body, mime = download.body, download.content_type
    if not body:
        raise ValueError("视频为空")
    if not mime.startswith("video/"):
        mime = item.mime_type if item.mime_type.startswith("video/") else "video/mp4"
    return body, mime


async def save_media(article: ArticleInput) -> list[SavedMedia]:
    saved: list[SavedMedia] = []
    for item in sorted(article.media, key=lambda value: value.order):
        try:
            async with asyncio.timeout(MEDIA_TIMEOUT):
                try:
                    body, mime = await _download_direct(item, article.url)
                except Exception:
                    if not item.page_url:
                        raise
                    if not _bilibili_page(item.page_url):
                        raise ValueError("仅 B 站页面允许使用视频提取器")
                    await validate_download_url(
                        item.page_url,
                        allow_local_networks=settings.allow_local_network_downloads,
                    )
                    with tempfile.TemporaryDirectory(prefix="hermes-video-") as temporary:
                        body, mime = await asyncio.to_thread(
                            _download_with_ytdlp,
                            item.page_url,
                            Path(temporary),
                        )
            saved.append(
                SavedMedia(
                    position_id=item.position_id,
                    data_url=_video_data_url(body, mime),
                    poster_url=item.poster_url,
                )
            )
        except Exception as exc:
            saved.append(
                SavedMedia(
                    position_id=item.position_id,
                    data_url="",
                    poster_url=item.poster_url,
                    error=f"{type(exc).__name__}: {exc}",
                )
            )
    return saved


def place_media(source_html: str, saved: list[SavedMedia]) -> tuple[str, dict[str, int]]:
    soup = BeautifulSoup(source_html or "", "html.parser")
    container = soup.body or soup
    stats = {"saved": 0, "failed": 0, "appended": 0}
    for item in saved:
        marker = soup.find(attrs={"data-hermes-media-id": item.position_id})
        if item.data_url:
            video = soup.new_tag("video")
            video["src"] = item.data_url
            video["controls"] = ""
            video["preload"] = "metadata"
            video["playsinline"] = ""
            if item.poster_url.startswith("data:image/"):
                video["poster"] = item.poster_url
            if marker is not None:
                marker.replace_with(video)
            else:
                figure = soup.new_tag("figure")
                figure["data-hermes-kind"] = "offline-video"
                figure.append(video)
                container.append(figure)
                stats["appended"] += 1
            stats["saved"] += 1
        else:
            if marker is not None:
                marker.decompose()
            stats["failed"] += 1
    return str(soup), stats
