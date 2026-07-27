from collections.abc import Awaitable, Callable

from starlette.responses import JSONResponse


Receive = Callable[[], Awaitable[dict]]
Send = Callable[[dict], Awaitable[None]]


class RequestSizeLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: dict, receive: Receive, send: Send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        try:
            content_length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            content_length = 0
        if content_length > self.max_bytes:
            await self._reject(scope, receive, send)
            return

        messages = []
        total = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > self.max_bytes:
                    await self._reject(scope, receive, send)
                    return
                if not message.get("more_body", False):
                    break
            elif message["type"] == "http.disconnect":
                break

        pending = iter(messages)

        async def replay() -> dict:
            return next(pending, {"type": "http.disconnect"})

        await self.app(scope, replay, send)

    @staticmethod
    async def _reject(scope: dict, receive: Receive, send: Send):
        response = JSONResponse({"detail": "请求体过大"}, status_code=413)
        await response(scope, receive, send)
