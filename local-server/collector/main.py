import asyncio
import logging
import subprocess
from pathlib import Path
from time import perf_counter
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from .config import (
    extension_origin_regex,
    organizer_configuration,
    save_organizer_configuration,
    settings,
    trusted_extension_origins,
)
from .organizers import probe, probe_connection
from .limits import MAX_CONCURRENT_COLLECTIONS, MAX_REQUEST_BYTES
from .models import ArticleInput, OrganizerSettingsInput
from .request_limits import RequestSizeLimitMiddleware
from .storage import collect
from .vault import DEFAULT_CATEGORY, list_vault_folders

app = FastAPI(title="PageNest Web Collector", version="1.7.4")
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=MAX_REQUEST_BYTES)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=extension_origin_regex(),
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
logger = logging.getLogger("uvicorn.error")
collection_slots = asyncio.Semaphore(MAX_CONCURRENT_COLLECTIONS)


def auth(authorization: str = Header(default="")):
    expected = settings.local_collector_token
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(401, "收藏器令牌不正确，请检查插件设置与 .env")


async def collection_slot():
    async with collection_slots:
        yield


@app.get("/api/health")
async def health(_: None = Depends(auth)):
    vault = settings.vault
    configured = bool(vault and vault.is_dir())
    return {
        "ok": True,
        "vault_configured": configured,
        "folder_count": len(list_vault_folders(vault)) if configured else 0,
        "hermes": await probe(),
    }


@app.post("/api/pair")
async def pair_extension(origin: str = Header(default="")):
    allowed = trusted_extension_origins()
    if not allowed:
        raise HTTPException(404, "商店扩展自动配对尚未启用")
    if origin not in allowed:
        raise HTTPException(403, "该扩展来源无权配对")
    if not settings.local_collector_token:
        raise HTTPException(503, "本地收藏器尚未生成连接令牌")
    return {"token": settings.local_collector_token}


@app.get("/api/ai-settings")
async def ai_settings(_: None = Depends(auth)):
    return organizer_configuration()


@app.post("/api/ai-settings")
async def update_ai_settings(payload: OrganizerSettingsInput, _: None = Depends(auth)):
    api_key = (
        settings.hermes_api_key if payload.api_key is None else payload.api_key.strip()
    )
    if payload.api_url.strip():
        connection = await probe_connection(
            payload.api_url.strip().rstrip("/"), api_key, payload.model_name.strip()
        )
        if not connection["online"]:
            raise HTTPException(400, connection["message"])
    try:
        configuration = save_organizer_configuration(
            payload.api_url,
            payload.model_name,
            payload.api_key,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {**configuration, "connection": await probe()}


@app.get("/api/folders")
async def folders(_: None = Depends(auth)):
    vault = settings.vault
    if not vault or not vault.is_dir():
        raise HTTPException(400, "尚未配置有效的 OBSIDIAN_VAULT_PATH")
    return {
        "ok": True,
        "vault_name": vault.name,
        "default": DEFAULT_CATEGORY,
        "folders": list_vault_folders(vault),
    }


@app.get("/status", response_class=HTMLResponse)
async def status_page():
    vault = settings.vault
    vault_ready = bool(vault and vault.is_dir())
    return f"""<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>网页收藏器状态</title>
<style>
body {{
  font: 16px system-ui;
  background: #11152a;
  color: #eef;
  max-width: 850px;
  margin: 40px auto;
  padding: 24px;
}}
section {{ background: #1b2140; padding: 20px; border-radius: 16px; }}
b {{ color: #9ddcff; }}
</style>
<h1>PageNest 网页收藏器</h1>
<section>
  <p>本地服务：<b>正常</b></p>
  <p>Obsidian 仓库：<b>{"已配置" if vault_ready else "未配置"}</b></p>
  <p>智能整理：<b>{"已配置" if settings.hermes_api_url else "未配置"}</b></p>
</section>
</html>"""


@app.post("/api/collect")
async def collect_api(
    article: ArticleInput,
    _: None = Depends(auth),
    _slot: None = Depends(collection_slot),
):
    started = perf_counter()
    try:
        result = await collect(article)
        result["total_seconds"] = perf_counter() - started
        if result.get("hermes_error"):
            logger.warning("Organizer failed: %s", result["hermes_error"])
        logger.info(
            "Collect completed in %.1fs (images %.1fs, organizer %.1fs, saved images %s, capture v%s, placement %s)",
            result["total_seconds"],
            result.get("image_seconds", 0.0),
            result.get("hermes_seconds", 0.0),
            result.get("saved_images", 0),
            result.get("capture_version", 1),
            result.get("image_placement", {}),
        )
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(
            500, f"文章已尽量保留，但处理发生异常：{type(exc).__name__}: {exc}"
        )


@app.post("/api/open-folder")
async def open_folder(payload: dict, _: None = Depends(auth)):
    vault = settings.vault
    target = Path(payload.get("path", "")).resolve()
    if not vault or (target != vault and vault not in target.parents):
        raise HTTPException(400, "拒绝打开仓库外路径")
    subprocess.Popen(
        ["explorer.exe", str(target if target.is_dir() else target.parent)]
    )
    return {"ok": True}
