import os

import uvicorn

from collector.main import app


def service_port() -> int:
    port = int(os.getenv("PAGENEST_PORT", "8765"))
    if not 1 <= port <= 65535:
        raise ValueError("PAGENEST_PORT must be between 1 and 65535")
    return port


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=service_port(), reload=False)
