import ctypes
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import uvicorn

from collector.config import settings
from collector.main import app


ERROR_ALREADY_EXISTS = 183
MUTEX_NAME = "Local\\PageNestLocalCollector"
_single_instance_handle = None


def create_single_instance_mutex(kernel32=None, get_last_error=None):
    """Create the per-session Windows mutex, or return None for a duplicate."""
    if kernel32 is None:
        if os.name != "nt":
            return True
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    get_last_error = get_last_error or ctypes.get_last_error
    handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if not handle:
        raise ctypes.WinError(get_last_error())
    if get_last_error() == ERROR_ALREADY_EXISTS:
        kernel32.CloseHandle(handle)
        return None
    return handle


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
    port = settings.pagenest_port
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
    global _single_instance_handle
    _single_instance_handle = create_single_instance_mutex()
    if _single_instance_handle is None:
        return
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
