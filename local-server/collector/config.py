import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


def default_env_file() -> Path:
    override = os.getenv("PAGENEST_CONFIG_FILE", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).with_name(".env")
    return Path(__file__).parents[1] / ".env"


ENV_FILE = default_env_file()
ORGANIZER_ENV_NAMES = {
    "HERMES_API_URL": "hermes_api_url",
    "HERMES_MODEL_NAME": "hermes_model_name",
    "HERMES_API_KEY": "hermes_api_key",
}


class Settings(BaseSettings):
    obsidian_vault_path: str = ""
    hermes_api_url: str = ""
    hermes_api_key: str = ""
    local_collector_token: str = ""
    allow_local_network_downloads: bool = False
    hermes_model_name: str = "Qwen3.6-35B-A3B"
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    @property
    def vault(self) -> Path | None:
        if not self.obsidian_vault_path.strip():
            return None
        return Path(self.obsidian_vault_path).expanduser().resolve()


settings = Settings()


def organizer_configuration() -> dict:
    return {
        "api_url": settings.hermes_api_url,
        "model_name": settings.hermes_model_name,
        "has_api_key": bool(settings.hermes_api_key),
    }


def _quoted_env_value(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def _is_secure_organizer_url(parts) -> bool:
    return parts.scheme == "https" or (
        parts.scheme == "http"
        and parts.hostname in {"127.0.0.1", "::1", "localhost"}
    )


def save_organizer_configuration(api_url: str, model_name: str, api_key: str | None) -> dict:
    api_url = api_url.strip().rstrip("/")
    model_name = model_name.strip()
    if api_url:
        parts = urlsplit(api_url)
        if parts.scheme not in {"http", "https"} or not parts.netloc or parts.username or parts.password:
            raise ValueError("Base URL 必须是有效的 http/https 地址，且不能在地址中包含账号密码")
        if not _is_secure_organizer_url(parts):
            raise ValueError("远程智能整理接口必须使用 HTTPS；HTTP 仅允许 localhost 或回环地址")
        if not model_name:
            raise ValueError("填写 Base URL 后必须填写模型名称")
    resolved_key = settings.hermes_api_key if api_key is None else api_key.strip()
    values = {
        "HERMES_API_URL": api_url,
        "HERMES_MODEL_NAME": model_name,
        "HERMES_API_KEY": resolved_key,
    }
    text = ENV_FILE.read_text("utf-8") if ENV_FILE.exists() else ""
    lines = text.splitlines()
    found: set[str] = set()
    updated: list[str] = []
    pattern = re.compile(r"^(HERMES_API_URL|HERMES_MODEL_NAME|HERMES_API_KEY)\s*=")
    for line in lines:
        match = pattern.match(line)
        if match:
            name = match.group(1)
            updated.append(f"{name}={_quoted_env_value(values[name])}")
            found.add(name)
        else:
            updated.append(line)
    for name in ORGANIZER_ENV_NAMES:
        if name not in found:
            updated.append(f"{name}={_quoted_env_value(values[name])}")
    temporary = ENV_FILE.with_suffix(".env.tmp")
    temporary.write_text("\n".join(updated).rstrip() + "\n", "utf-8")
    temporary.replace(ENV_FILE)
    settings.hermes_api_url = api_url
    settings.hermes_model_name = model_name
    settings.hermes_api_key = resolved_key
    return organizer_configuration()

