from collector.config import settings
import httpx
import pytest

from collector.organizers import (
    QUICK_RESULT_KEYS,
    _available_models,
    probe_connection,
    request_payload,
    request_timeout,
    result_schema,
)


def test_http_timeout_outlives_outer_model_deadline():
    timeout = request_timeout(120)

    assert timeout.connect == 5
    assert timeout.read == 125
    assert timeout.write == 125
    assert timeout.pool == 5



def test_basic_openai_fallback_omits_optional_provider_features(monkeypatch):
    monkeypatch.setattr(settings, "hermes_model_name", "compatible-model")
    payload = request_payload([{"role": "user", "content": "test"}], "quick", structured=False)

    assert payload["model"] == "compatible-model"
    assert "response_format" not in payload
    assert "reasoning_effort" not in payload



def test_quick_schema_requests_only_core_fields():
    quick = result_schema("quick")
    deep = result_schema("deep")

    assert quick["required"] == QUICK_RESULT_KEYS
    assert set(quick["properties"]) == set(QUICK_RESULT_KEYS)
    assert len(deep["properties"]) > len(quick["properties"])


@pytest.mark.asyncio
async def test_model_discovery_and_probe_use_exact_selected_model(monkeypatch):
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [
                {"id": "deepseek-v4-flash"},
                {"id": "deepseek-v4-pro"},
            ]})
        payload = __import__("json").loads(request.content)
        assert payload["model"] == "deepseek-v4-pro"
        return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        models = await _available_models(client, "https://api.deepseek.com", "test-key")
    assert models == ["deepseek-v4-flash", "deepseek-v4-pro"]

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **_: original_client(transport=httpx.MockTransport(handler)),
    )
    result = await probe_connection("https://api.deepseek.com", "test-key", "deepseek-v4-pro")

    assert result["online"] is True
    assert result["model"] == "deepseek-v4-pro"
    assert any(request.method == "POST" and request.url.path.endswith("/chat/completions") for request in requests)


@pytest.mark.asyncio
async def test_gemini_model_discovery_uses_native_list_and_only_generation_models():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1beta/models"
        assert request.url.params["pageSize"] == "1000"
        assert request.headers["x-goog-api-key"] == "gemini-key"
        return httpx.Response(200, json={"models": [
            {
                "name": "models/gemini-3.6-flash",
                "baseModelId": "gemini-3.6-flash",
                "supportedGenerationMethods": ["generateContent"],
            },
            {
                "name": "models/gemini-embedding-001",
                "baseModelId": "gemini-embedding-001",
                "supportedGenerationMethods": ["embedContent"],
            },
        ]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        models = await _available_models(
            client,
            "https://generativelanguage.googleapis.com/v1beta/openai",
            "gemini-key",
        )

    assert models == ["gemini-3.6-flash"]


@pytest.mark.asyncio
async def test_siliconflow_model_discovery_filters_chat_models_at_source():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/models"
        assert dict(request.url.params) == {"type": "text", "sub_type": "chat"}
        return httpx.Response(200, json={"data": [{"id": "deepseek-ai/DeepSeek-V4"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        models = await _available_models(client, "https://api.siliconflow.cn/v1", "test-key")

    assert models == ["deepseek-ai/DeepSeek-V4"]


@pytest.mark.parametrize("api_url", [
    "https://api.openai.com/v1",
    "https://api.deepseek.com",
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "https://open.bigmodel.cn/api/paas/v4",
    "https://api.minimaxi.com/v1",
    "https://openrouter.ai/api/v1",
    "http://127.0.0.1:1234/v1",
    "http://127.0.0.1:11434/v1",
])
@pytest.mark.asyncio
async def test_openai_compatible_providers_discover_models_from_their_base_url(api_url):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/models")
        return httpx.Response(200, json={"data": [{"id": "exact-model-id"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        models = await _available_models(client, api_url, "test-key")

    assert models == ["exact-model-id"]


@pytest.mark.asyncio
async def test_model_probe_allows_manual_model_when_list_endpoint_is_unsupported(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(404)
        return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **_: original_client(transport=httpx.MockTransport(handler)),
    )

    result = await probe_connection("https://compatible.example/v1", "test-key", "manual-model")

    assert result["online"] is True
    assert result["model"] == "manual-model"
