import html
import logging
import os
import subprocess
from datetime import date
from pathlib import Path
from time import perf_counter
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from .config import organizer_configuration, save_organizer_configuration, settings
from .hermes import probe, probe_connection
from .models import ArticleInput, OrganizerSettingsInput
from .storage import collect
from .vault import DEFAULT_CATEGORY, list_vault_folders

app = FastAPI(title="Hermes Obsidian Web Collector", version="1.7.4")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])
logger = logging.getLogger("uvicorn.error")


def auth(authorization: str = Header(default="")):
    expected = settings.local_collector_token
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(401, "收藏器令牌不正确，请检查插件设置与 .env")


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


@app.get("/api/ai-settings")
async def ai_settings(_: None = Depends(auth)):
    return organizer_configuration()


@app.post("/api/ai-settings")
async def update_ai_settings(payload: OrganizerSettingsInput, _: None = Depends(auth)):
    api_key = settings.hermes_api_key if payload.api_key is None else payload.api_key.strip()
    if payload.api_url.strip():
        connection = await probe_connection(payload.api_url.strip().rstrip("/"), api_key, payload.model_name.strip())
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


def vault_stats():
    vault = settings.vault
    if not vault or not vault.is_dir():
        return {"writable": False, "today": 0, "pending": 0, "recent": []}
    files = sorted(vault.glob("**/*.hermes"), key=lambda path: path.stat().st_mtime, reverse=True)
    pending = vault / Path(DEFAULT_CATEGORY)
    return {
        "writable": os.access(vault, os.W_OK),
        "today": sum(datetime_from(path).date() == date.today() for path in files),
        "pending": len(list(pending.glob("*.hermes"))) if pending.exists() else 0,
        "recent": [str(path.relative_to(vault)) for path in files[:5]],
    }


def datetime_from(path: Path):
    from datetime import datetime
    return datetime.fromtimestamp(path.stat().st_mtime)


@app.get("/status", response_class=HTMLResponse)
async def status_page():
    hermes = await probe(); stats = vault_stats(); vault = str(settings.vault) if settings.vault else "未配置"
    recent = "".join(f"<li>{html.escape(item)}</li>" for item in stats["recent"]) or "<li>暂无</li>"
    vault_label = html.escape(vault)
    log_path = html.escape(str(Path(__file__).parents[1] / "logs"))
    return f'''<!doctype html><meta charset="utf-8"><title>网页收藏器状态</title><style>body{{font:16px system-ui;background:#11152a;color:#eef;max-width:850px;margin:40px auto;padding:24px}}section{{background:#1b2140;padding:20px;border-radius:16px;margin:14px 0}}b{{color:#9ddcff}}code{{word-break:break-all}}</style><h1>Hermes Obsidian 网页收藏器</h1><section><p>本地服务：<b>正常</b></p><p>Hermes：<b>{'在线' if hermes['online'] else '离线'}</b> · {hermes['message']}</p><p>模型：{hermes['model']}</p><p>图片输入：{'已验证' if hermes['vision'] else '尚未验证'}</p></section><section><p>Obsidian 仓库：<code>{vault_label}</code></p><p>可写：{'是' if stats['writable'] else '否'}</p><p>今日收藏：{stats['today']} · 待整理：{stats['pending']}</p><h3>最近五篇</h3><ul>{recent}</ul></section><section><p>日志位置：<code>{log_path}</code></p></section>'''


@app.post("/api/collect")
async def collect_api(article: ArticleInput, _: None = Depends(auth)):
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
        raise HTTPException(500, f"文章已尽量保留，但处理发生异常：{type(exc).__name__}: {exc}")


@app.post("/api/open-folder")
async def open_folder(payload: dict, _: None = Depends(auth)):
    vault = settings.vault
    target = Path(payload.get("path", "")).resolve()
    if not vault or (target != vault and vault not in target.parents): raise HTTPException(400, "拒绝打开仓库外路径")
    subprocess.Popen(["explorer.exe", str(target if target.is_dir() else target.parent)])
    return {"ok": True}

