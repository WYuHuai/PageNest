import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import uvicorn

from collector.main import app


def usable_standard_stream(stream):
    """Return a stream safe for libraries that call isatty()."""
    if stream is not None:
        return stream
    return open(os.devnull, "w", encoding="utf-8")


def configure_standard_streams() -> None:
    # PyInstaller's --noconsole mode sets these to None. Uvicorn's formatter
    # expects real streams even when its own log config is disabled.
    sys.stdout = usable_standard_stream(sys.stdout)
    sys.stderr = usable_standard_stream(sys.stderr)


def service_port() -> int:
    port = int(os.getenv("PAGENEST_PORT", "8765"))
    if not 1 <= port <= 65535:
        raise ValueError("PAGENEST_PORT must be between 1 and 65535")
    return port


def frozen_logging() -> dict:
    if not getattr(sys, "frozen", False):
        return {}
    log_directory = Path(sys.executable).with_name("logs")
    log_directory.mkdir(exist_ok=True)
    handler = RotatingFileHandler(
        log_directory / "service.log",
        maxBytes=2 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    return {"log_config": None}


def main() -> None:
    configure_standard_streams()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=service_port(),
        reload=False,
        **frozen_logging(),
    )


if __name__ == "__main__":
    main()