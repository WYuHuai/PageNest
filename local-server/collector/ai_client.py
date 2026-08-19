from dataclasses import dataclass

import httpx


STRUCTURED_FALLBACK_STATUSES = {400, 422}


class AIResponseError(ValueError):
    """Raised when a provider response lacks OpenAI-compatible content."""


@dataclass(frozen=True)
class ChatCompletion:
    content: str | None
    request_count: int
    structured: bool


def chat_endpoint(api_url: str) -> str:
    return api_url.rstrip("/") + "/chat/completions"


def request_timeout(total_timeout: int) -> httpx.Timeout:
    """Keep the HTTP request alive until the outer model deadline expires."""
    return httpx.Timeout(total_timeout + 5, connect=5, pool=5)


def build_chat_payload(
    *,
    model_name: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float = 0.1,
    response_schema: dict | None = None,
    schema_name: str = "structured_response",
    reasoning_effort: str | None = None,
) -> dict:
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_schema is not None:
        if reasoning_effort is not None:
            payload["reasoning_effort"] = reasoning_effort
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": True,
                "schema": response_schema,
            },
        }
    return payload


def extract_content(response: httpx.Response) -> str:
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIResponseError(
            "AI response does not contain choices[0].message.content"
        ) from exc
    if not isinstance(content, str):
        original = AttributeError(
            f"'{type(content).__name__}' object has no attribute 'strip'"
        )
        raise AIResponseError("AI response message content is not text") from original
    return content


class AIClient:
    """Narrow OpenAI-compatible HTTP client with structured-output fallback."""

    def __init__(
        self,
        *,
        api_url: str,
        api_key: str,
        model_name: str,
        timeout_seconds: int,
    ) -> None:
        self.endpoint = chat_endpoint(api_url)
        self.model_name = model_name
        self.timeout = request_timeout(timeout_seconds)
        self.headers = {"Content-Type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "AIClient":
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def chat_completion(
        self,
        *,
        messages: list[dict],
        max_tokens: int,
        temperature: float = 0.1,
        response_schema: dict | None = None,
        schema_name: str = "structured_response",
        reasoning_effort: str | None = None,
        structured: bool = True,
        max_requests: int = 2,
    ) -> ChatCompletion:
        if self._client is None:
            raise RuntimeError("AIClient must be used as an async context manager")
        if max_requests < 1:
            raise ValueError("max_requests must be at least 1")

        request_count = 0
        use_structured = structured and response_schema is not None
        while request_count < max_requests:
            payload = build_chat_payload(
                model_name=self.model_name,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_schema=response_schema if use_structured else None,
                schema_name=schema_name,
                reasoning_effort=reasoning_effort if use_structured else None,
            )
            response = await self._client.post(
                self.endpoint,
                headers=self.headers,
                json=payload,
            )
            request_count += 1
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if use_structured and exc.response.status_code in STRUCTURED_FALLBACK_STATUSES:
                    use_structured = False
                    if request_count == max_requests:
                        return ChatCompletion(None, request_count, use_structured)
                    continue
                raise
            return ChatCompletion(
                extract_content(response),
                request_count,
                use_structured,
            )
