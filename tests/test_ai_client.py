import json

import httpx
import pytest

from collector import ai_client
from collector.ai_client import (
    AIClient,
    AIResponseError,
    DIAGNOSTIC_MESSAGE_LIMIT,
    DIAGNOSTIC_LOGGER_NAME,
    chat_endpoint,
    log_analysis_stage,
    request_timeout,
    safe_error_message,
)


SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}},
    "required": ["answer"],
    "additionalProperties": False,
}


def mock_client(monkeypatch, handler, captured=None):
    real_client = httpx.AsyncClient

    def factory(**kwargs):
        if captured is not None:
            captured.update(kwargs)
        return real_client(
            transport=httpx.MockTransport(handler),
            timeout=kwargs.get("timeout"),
        )

    monkeypatch.setattr(httpx, "AsyncClient", factory)


async def complete(**changes):
    client_options = {
        "api_url": "https://api.example.test/v1",
        "api_key": "test-key",
        "model_name": "test-model",
        "timeout_seconds": 60,
    }
    completion_options = {
        "messages": [{"role": "user", "content": "test"}],
        "max_tokens": 1000,
        "response_schema": SCHEMA,
        "schema_name": "test_schema",
        "reasoning_effort": "none",
    }
    client_options.update(changes.pop("client_options", {}))
    completion_options.update(changes)
    async with AIClient(**client_options) as client:
        return await client.chat_completion(**completion_options)


@pytest.mark.asyncio
async def test_structured_request_succeeds_on_first_attempt(monkeypatch):
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "result"}}]})

    mock_client(monkeypatch, handler)
    result = await complete()

    assert result.content == "result"
    assert result.request_count == 1
    assert result.structured is True
    assert requests[0]["response_format"]["json_schema"]["schema"] == SCHEMA


@pytest.mark.asyncio
async def test_structured_request_falls_back_on_http_400(monkeypatch):
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        if len(requests) == 1:
            return httpx.Response(400, json={"error": "unsupported"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "fallback"}}]})

    mock_client(monkeypatch, handler)
    result = await complete()

    assert result.content == "fallback"
    assert result.request_count == 2
    assert result.structured is False
    assert "response_format" in requests[0]
    assert "response_format" not in requests[1]


@pytest.mark.asyncio
async def test_structured_request_falls_back_on_http_422(monkeypatch):
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        if len(requests) == 1:
            return httpx.Response(422, json={"error": "unsupported"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "fallback"}}]})

    mock_client(monkeypatch, handler)
    result = await complete()

    assert result.content == "fallback"
    assert result.request_count == 2
    assert result.structured is False
    assert "response_format" not in requests[1]


@pytest.mark.asyncio
async def test_http_500_does_not_trigger_structured_fallback(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(500, json={"error": "server failure"})

    mock_client(monkeypatch, handler)
    with pytest.raises(httpx.HTTPStatusError):
        await complete()

    assert len(requests) == 1


@pytest.mark.asyncio
async def test_authorization_header_is_sent_when_key_is_configured(monkeypatch):
    headers = []

    def handler(request):
        headers.append(request.headers)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    mock_client(monkeypatch, handler)
    await complete()

    assert headers[0]["Authorization"] == "Bearer test-key"


@pytest.mark.asyncio
async def test_authorization_header_is_omitted_without_api_key(monkeypatch):
    headers = []

    def handler(request):
        headers.append(request.headers)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    mock_client(monkeypatch, handler)
    await complete(client_options={"api_key": ""})

    assert "Authorization" not in headers[0]


def test_chat_endpoint_normalizes_trailing_slashes():
    assert chat_endpoint("https://api.example.test/v1///") == (
        "https://api.example.test/v1/chat/completions"
    )


@pytest.mark.asyncio
async def test_timeout_is_passed_to_http_client(monkeypatch):
    captured = {}
    mock_client(
        monkeypatch,
        lambda _request: httpx.Response(
            200,
            json={"choices": [{"message": {"content": "ok"}}]},
        ),
        captured,
    )

    await complete(client_options={"timeout_seconds": 180})

    timeout = captured["timeout"]
    assert timeout == request_timeout(180)
    assert timeout.read == 185
    assert timeout.connect == 5


@pytest.mark.asyncio
async def test_raw_message_content_is_returned_unchanged(monkeypatch):
    raw = "  provider content with whitespace  "
    mock_client(
        monkeypatch,
        lambda _request: httpx.Response(
            200,
            json={"choices": [{"message": {"content": raw}}]},
        ),
    )

    result = await complete()

    assert result.content == raw


@pytest.mark.asyncio
async def test_malformed_response_structure_raises_controlled_error(monkeypatch):
    mock_client(
        monkeypatch,
        lambda _request: httpx.Response(200, json={"choices": []}),
    )

    with pytest.raises(AIResponseError, match=r"choices\[0\]\.message\.content"):
        await complete()


@pytest.mark.asyncio
async def test_request_build_exception_records_safe_stage(monkeypatch, caplog):
    def fail_build(**_options):
        raise RuntimeError("payload construction failed")

    monkeypatch.setattr(ai_client, "build_chat_payload", fail_build)
    with caplog.at_level("INFO", logger=DIAGNOSTIC_LOGGER_NAME):
        with pytest.raises(RuntimeError, match="payload construction failed"):
            await complete()

    assert "stage=REQUEST_BUILD status=failed" in caplog.text
    assert "exception=RuntimeError" in caplog.text


@pytest.mark.asyncio
async def test_http_transport_exception_records_send_stage(monkeypatch, caplog):
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)

    mock_client(monkeypatch, handler)
    with caplog.at_level("INFO", logger=DIAGNOSTIC_LOGGER_NAME):
        with pytest.raises(httpx.ConnectError):
            await complete()

    assert "stage=HTTP_SEND status=failed" in caplog.text
    assert "exception=ConnectError" in caplog.text
    assert "stage=HTTP_RESPONSE status=received" not in caplog.text


def test_sensitive_exception_content_is_fully_redacted(caplog):
    secret = "secret-value-that-must-never-appear"
    image = "data:image/png;base64,QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFB"
    error = RuntimeError(
        f"Authorization: Bearer {secret}; api_key={secret}; image={image}"
    )

    with caplog.at_level("INFO", logger=DIAGNOSTIC_LOGGER_NAME):
        log_analysis_stage("HTTP_SEND", "failed", error=error)

    assert "[redacted sensitive error message]" in caplog.text
    assert secret not in caplog.text
    assert "Authorization" not in caplog.text
    assert "Bearer" not in caplog.text
    assert "data:image" not in caplog.text
    assert "base64" not in caplog.text
    assert "QUFB" not in caplog.text


def test_safe_error_message_is_length_limited():
    message = safe_error_message(RuntimeError("safe failure " * 100))

    assert len(message) <= DIAGNOSTIC_MESSAGE_LIMIT
    assert message.endswith("…")


@pytest.mark.asyncio
async def test_success_records_request_and_http_response_boundaries(
    monkeypatch, caplog
):
    mock_client(
        monkeypatch,
        lambda _request: httpx.Response(
            200,
            json={"choices": [{"message": {"content": "ok"}}]},
        ),
    )

    with caplog.at_level("INFO", logger=DIAGNOSTIC_LOGGER_NAME):
        result = await complete()

    assert result.content == "ok"
    for expected in (
        "stage=AI_CLIENT_ENTER status=pass",
        "stage=REQUEST_BUILD status=pass",
        "stage=HTTP_SEND status=start",
        "stage=HTTP_RESPONSE status=received",
        "stage=HTTP_RESPONSE status=pass",
    ):
        assert expected in caplog.text
    assert "test-key" not in caplog.text
    assert "test-model" not in caplog.text
    assert '"messages"' not in caplog.text
