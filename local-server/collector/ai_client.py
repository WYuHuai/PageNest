import json
import logging
import re
from dataclasses import dataclass

import httpx


STRUCTURED_FALLBACK_STATUSES = {400, 422}
DIAGNOSTIC_MESSAGE_LIMIT = 240
DIAGNOSTIC_LOGGER_NAME = "pagenest.notebook_analyzer"

logger = logging.getLogger(DIAGNOSTIC_LOGGER_NAME)

_SENSITIVE_MESSAGE = re.compile(
    r"authorization|bearer\s+|api[ _-]?key|access[ _-]?token|service[ _-]?token|"
    r"password|secret|data:image/|base64,",
    re.IGNORECASE,
)
_HIGH_ENTROPY_VALUE = re.compile(r"[A-Za-z0-9+/=_-]{48,}")
_WHITESPACE = re.compile(r"\s+")
_COMPLETE_JSON_FENCE = re.compile(
    r"```(?:json)?[ \t]*\r?\n(?P<content>.*?)\r?\n[ \t]*```",
    re.IGNORECASE | re.DOTALL,
)
_TRAILING_JSON_FENCE = re.compile(
    r"(?P<content>.*?)\r?\n[ \t]*```",
    re.DOTALL,
)


class AIResponseError(ValueError):
    """Raised when a provider response lacks OpenAI-compatible content."""


@dataclass(frozen=True)
class ChatCompletion:
    content: str | None
    request_count: int
    structured: bool


def safe_error_message(error: BaseException) -> str:
    """Return a bounded diagnostic message only when it is clearly safe."""
    try:
        message = str(error)
    except Exception:
        return "[message unavailable]"
    if not message:
        return "[no message]"
    if _SENSITIVE_MESSAGE.search(message) or _HIGH_ENTROPY_VALUE.search(message):
        return "[redacted sensitive error message]"
    message = _WHITESPACE.sub(" ", message).strip()
    if len(message) > DIAGNOSTIC_MESSAGE_LIMIT:
        message = message[: DIAGNOSTIC_MESSAGE_LIMIT - 1].rstrip() + "…"
    return message or "[no message]"


def decode_json_object(content: str) -> dict:
    """Decode exactly one JSON object with only known fence noise."""
    text = content.strip()
    fenced = _COMPLETE_JSON_FENCE.fullmatch(text)
    if fenced is None:
        fenced = _TRAILING_JSON_FENCE.fullmatch(text)
    if fenced is not None:
        text = fenced.group("content").strip()
    decoded = json.loads(text)
    if not isinstance(decoded, dict):
        raise ValueError("Structured content must contain one JSON object")
    return decoded


def log_analysis_stage(
    stage: str,
    status: str,
    *,
    error: BaseException | None = None,
    attempt: int | None = None,
    http_status: int | None = None,
    structured: bool | None = None,
    image_chars: int | None = None,
    title_chars: int | None = None,
    summary_chars: int | None = None,
) -> None:
    """Emit fixed-field diagnostics without provider, user, or payload content."""
    details: list[str] = []
    if attempt is not None:
        details.append(f"attempt={attempt}")
    if http_status is not None:
        details.append(f"http_status={http_status}")
    if structured is not None:
        details.append(f"structured={str(structured).lower()}")
    if image_chars is not None:
        details.append(f"image_chars={image_chars}")
    if title_chars is not None:
        details.append(f"title_chars={title_chars}")
    if summary_chars is not None:
        details.append(f"summary_chars={summary_chars}")
    suffix = f" {' '.join(details)}" if details else ""
    if error is None:
        logger.info(
            "Notebook analyzer diagnostic stage=%s status=%s%s",
            stage,
            status,
            suffix,
        )
        return
    logger.error(
        "Notebook analyzer diagnostic stage=%s status=%s exception=%s message=%s%s",
        stage,
        status,
        type(error).__name__,
        safe_error_message(error),
        suffix,
    )


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
        log_analysis_stage("AI_CLIENT_ENTER", "start")
        try:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        except Exception as exc:
            log_analysis_stage("AI_CLIENT_ENTER", "failed", error=exc)
            raise
        log_analysis_stage("AI_CLIENT_ENTER", "pass")
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
            attempt = request_count + 1
            log_analysis_stage(
                "REQUEST_BUILD", "start", attempt=attempt, structured=use_structured
            )
            try:
                payload = build_chat_payload(
                    model_name=self.model_name,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    response_schema=response_schema if use_structured else None,
                    schema_name=schema_name,
                    reasoning_effort=reasoning_effort if use_structured else None,
                )
            except Exception as exc:
                log_analysis_stage(
                    "REQUEST_BUILD",
                    "failed",
                    error=exc,
                    attempt=attempt,
                    structured=use_structured,
                )
                raise
            log_analysis_stage(
                "REQUEST_BUILD", "pass", attempt=attempt, structured=use_structured
            )
            log_analysis_stage(
                "HTTP_SEND", "start", attempt=attempt, structured=use_structured
            )
            try:
                response = await self._client.post(
                    self.endpoint,
                    headers=self.headers,
                    json=payload,
                )
            except Exception as exc:
                log_analysis_stage(
                    "HTTP_SEND",
                    "failed",
                    error=exc,
                    attempt=attempt,
                    structured=use_structured,
                )
                raise
            request_count = attempt
            log_analysis_stage(
                "HTTP_RESPONSE",
                "received",
                attempt=attempt,
                http_status=response.status_code,
                structured=use_structured,
            )
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                log_analysis_stage(
                    "HTTP_RESPONSE",
                    "failed",
                    error=exc,
                    attempt=attempt,
                    http_status=response.status_code,
                    structured=use_structured,
                )
                if use_structured and exc.response.status_code in STRUCTURED_FALLBACK_STATUSES:
                    use_structured = False
                    if request_count == max_requests:
                        return ChatCompletion(None, request_count, use_structured)
                    continue
                raise
            try:
                content = extract_content(response)
            except Exception as exc:
                log_analysis_stage(
                    "HTTP_RESPONSE",
                    "failed",
                    error=exc,
                    attempt=attempt,
                    http_status=response.status_code,
                    structured=use_structured,
                )
                raise
            log_analysis_stage(
                "HTTP_RESPONSE",
                "pass",
                attempt=attempt,
                http_status=response.status_code,
                structured=use_structured,
            )
            return ChatCompletion(content, request_count, use_structured)
