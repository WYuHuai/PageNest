import os
import re
import sys
import tempfile
import threading
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
CONFIG_WRITE_LOCK = threading.Lock()
EXTENSION_ID_PATTERN = re.compile(r"^[a-p]{32}$")


class Settings(BaseSettings):
    obsidian_vault_path: str = ""
    hermes_api_url: str = ""
    hermes_api_key: str = ""
    local_collector_token: str = ""
    pagenest_extension_ids: str = ""
    pagenest_port: int = 8765
    allow_local_network_downloads: bool = False
    hermes_model_name: str = ""
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    @property
    def vault(self) -> Path | None:
        if not self.obsidian_vault_path.strip():
            return None
        return Path(self.obsidian_vault_path).expanduser().resolve()


settings = Settings()


def trusted_extension_origins() -> set[str]:
    values = {
        value.strip().lower()
        for value in settings.pagenest_extension_ids.split(",")
        if value.strip()
    }
    invalid = values - {
        value for value in values if EXTENSION_ID_PATTERN.fullmatch(value)
    }
    if invalid:
        raise ValueError(
            "PAGENEST_EXTENSION_IDS contains an invalid Chromium extension ID"
        )
    return {f"chrome-extension://{value}" for value in values}


def extension_origin_regex() -> str:
    origins = trusted_extension_origins()
    if not origins:
        return r"^chrome-extension://[a-p]{32}$"
    escaped = "|".join(re.escape(origin) for origin in sorted(origins))
    return f"^(?:{escaped})$"


def organizer_configuration() -> dict:
    return {
        "api_url": settings.hermes_api_url,
        "model_name": settings.hermes_model_name,
        "has_api_key": bool(settings.hermes_api_key),
    }


def _quoted_env_value(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def _save_env_values(values: dict[str, str]) -> None:
    """Atomically update selected values while preserving the rest of the user config."""
    with CONFIG_WRITE_LOCK:
        text = ENV_FILE.read_text("utf-8") if ENV_FILE.exists() else ""
        lines = text.splitlines()
        found: set[str] = set()
        updated: list[str] = []
        pattern = re.compile(rf"^({'|'.join(map(re.escape, values))})\s*=")
        for line in lines:
            match = pattern.match(line)
            if match:
                name = match.group(1)
                updated.append(f"{name}={_quoted_env_value(values[name])}")
                found.add(name)
            else:
                updated.append(line)
        for name, value in values.items():
            if name not in found:
                updated.append(f"{name}={_quoted_env_value(value)}")

        ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=ENV_FILE.parent,
                prefix=f".{ENV_FILE.name}.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                temporary = Path(handle.name)
                handle.write("\n".join(updated).rstrip() + "\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, ENV_FILE)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def _is_secure_organizer_url(parts) -> bool:
    return parts.scheme == "https" or (
        parts.scheme == "http"
        and parts.hostname in {"127.0.0.1", "::1", "localhost"}
    )


def validate_organizer_url(api_url: str) -> str:
    api_url = api_url.strip().rstrip("/")
    if not api_url:
        return ""
    parts = urlsplit(api_url)
    if parts.scheme not in {"http", "https"} or not parts.netloc or parts.username or parts.password:
        raise ValueError("Base URL 必须是有效的 http/https 地址，且不能在地址中包含账号密码")
    if not _is_secure_organizer_url(parts):
        raise ValueError("远程智能整理接口必须使用 HTTPS；HTTP 仅允许 localhost 或回环地址")
    return api_url


def save_organizer_configuration(api_url: str, model_name: str, api_key: str | None) -> dict:
    api_url = validate_organizer_url(api_url)
    model_name = model_name.strip()
    if api_url:
        if not model_name:
            raise ValueError("填写 Base URL 后必须填写模型名称")
    resolved_key = settings.hermes_api_key if api_key is None else api_key.strip()
    values = {
        "HERMES_API_URL": api_url,
        "HERMES_MODEL_NAME": model_name,
        "HERMES_API_KEY": resolved_key,
    }
    _save_env_values(values)
    settings.hermes_api_url = api_url
    settings.hermes_model_name = model_name
    settings.hermes_api_key = resolved_key
    return organizer_configuration()


def save_vault_configuration(vault: Path) -> None:
    resolved = str(vault.resolve(strict=True))
    _save_env_values({"OBSIDIAN_VAULT_PATH": resolved})
    settings.obsidian_vault_path = resolved

