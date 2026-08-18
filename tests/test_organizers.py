import json

from collector.config import settings
import httpx
import pytest

from collector.models import ArticleInput
from collector.organizers import (
    QUICK_RESULT_KEYS,
    call_hermes,
    probe_connection,
    request_payload,
    request_timeout,
    result_schema,
)


def article(mode="quick"):
    return ArticleInput(
        title="离线测试文章",
        url="https://example.test/article",
        captured_at="2026-08-18T00:00:00+08:00",
        article_text="用于验证智能整理生命周期的正文。",
        mode=mode,
    )


def quick_result(**changes):
    result = {
        "suggested_category": "阅读记录/待整理",
        "normalized_title": "整理后的标题",
        "one_sentence_summary": "一句话摘要",
        "abstract": "摘要",
        "key_points": ["要点"],
        "keywords": ["测试"],
        "obsidian_tags": ["回归"],
        "confidence": 0.9,
    }
    result.update(changes)
    return result


def mock_client(monkeypatch, handler):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(handler),
            timeout=kwargs.get("timeout"),
        ),
    )


def configure_ai(monkeypatch):
    monkeypatch.setattr(settings, "hermes_api_url", "https://api.example.test/v1")
    monkeypatch.setattr(settings, "hermes_api_key", "test-key")
    monkeypatch.setattr(settings, "hermes_model_name", "test-model")


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
async def test_probe_uses_exact_manually_entered_model(monkeypatch):
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        payload = __import__("json").loads(request.content)
        assert payload["model"] == "deepseek-v4-pro"
        return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})

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
async def test_ai_structured_json_succeeds_without_retry(monkeypatch):
    configure_ai(monkeypatch)
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(quick_result())}}]})

    mock_client(monkeypatch, handler)
    result, raw, _elapsed, error = await call_hermes(article(), [])

    assert result.normalized_title == "整理后的标题"
    assert error == ""
    assert json.loads(raw)["one_sentence_summary"] == "一句话摘要"
    assert len(requests) == 1
    assert requests[0]["response_format"]["json_schema"]["schema"]["required"] == QUICK_RESULT_KEYS


async def assert_structured_fallback(monkeypatch, status_code):
    configure_ai(monkeypatch)
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        if len(requests) == 1:
            return httpx.Response(status_code, json={"error": "unsupported structured output"})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(quick_result())}}]})

    mock_client(monkeypatch, handler)
    result, _raw, _elapsed, error = await call_hermes(article(), [])

    assert result is not None
    assert error == ""
    assert "response_format" in requests[0]
    assert "response_format" not in requests[1]
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_ai_structured_output_falls_back_on_400(monkeypatch):
    await assert_structured_fallback(monkeypatch, 400)


@pytest.mark.asyncio
async def test_ai_structured_output_falls_back_on_422(monkeypatch):
    await assert_structured_fallback(monkeypatch, 422)


@pytest.mark.asyncio
async def test_ai_invalid_json_is_repaired_with_conversation_context(monkeypatch):
    configure_ai(monkeypatch)
    requests = []

    def handler(request):
        payload = json.loads(request.content)
        requests.append(payload)
        content = "not-json" if len(requests) == 1 else json.dumps(quick_result())
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    mock_client(monkeypatch, handler)
    result, _raw, _elapsed, error = await call_hermes(article(), [])

    assert result is not None
    assert error == ""
    assert requests[1]["messages"][-2] == {"role": "assistant", "content": "not-json"}
    assert "上一个回复不是合法结构" in requests[1]["messages"][-1]["content"]


@pytest.mark.asyncio
async def test_ai_three_invalid_json_responses_preserve_last_raw(monkeypatch):
    configure_ai(monkeypatch)
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        content = f"invalid-{len(requests)}"
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    mock_client(monkeypatch, handler)
    result, raw, _elapsed, error = await call_hermes(article(), [])

    assert result is None
    assert raw == "invalid-3"
    assert error == "智能整理返回内容未通过结构校验"
    assert len(requests) == 3


@pytest.mark.asyncio
async def test_ai_http_500_returns_failure_without_raising(monkeypatch):
    configure_ai(monkeypatch)
    mock_client(monkeypatch, lambda _request: httpx.Response(500, json={"error": "server failure"}))

    result, raw, _elapsed, error = await call_hermes(article(), [])

    assert result is None
    assert raw == ""
    assert "PageNest 调用失败：HTTPStatusError" in error


@pytest.mark.asyncio
async def test_ai_timeout_returns_mode_deadline_without_waiting(monkeypatch):
    configure_ai(monkeypatch)

    def timeout(_request):
        raise TimeoutError("simulated deadline")

    mock_client(monkeypatch, timeout)
    result, raw, _elapsed, error = await call_hermes(article(), [])

    assert result is None
    assert raw == ""
    assert error == "PageNest 整理超过 60 秒，离线页面已保留"


@pytest.mark.asyncio
async def test_ai_vision_input_marks_returned_image_notes_verified(monkeypatch):
    configure_ai(monkeypatch)
    requests = []
    deep = quick_result(image_notes=[{"image_filename": "image-001.png", "description": "示意图"}])

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(deep)}}]})

    mock_client(monkeypatch, handler)
    images = [{"filename": "image-001.png", "data_url": "data:image/png;base64,AA=="}]
    result, _raw, _elapsed, error = await call_hermes(article("deep"), images)

    assert error == ""
    assert result.image_notes[0].vision_verified is True
    content = requests[0]["messages"][1]["content"]
    assert any(item.get("type") == "image_url" for item in content)


@pytest.mark.asyncio
async def test_ai_without_api_url_never_opens_http_client(monkeypatch):
    monkeypatch.setattr(settings, "hermes_api_url", "")
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: pytest.fail("network must not be used"))

    result, raw, elapsed, error = await call_hermes(article(), [])

    assert (result, raw, elapsed, error) == (None, "", 0, "未配置 HERMES_API_URL")


@pytest.mark.asyncio
async def test_probe_reports_http_failure(monkeypatch):
    mock_client(monkeypatch, lambda _request: httpx.Response(429, json={"error": "quota"}))

    result = await probe_connection("https://api.example.test/v1", "key", "model")

    assert result == {
        "online": False,
        "model": "model",
        "vision": False,
        "message": "所选模型调用失败：HTTP 429，请检查模型权限和余额",
    }


@pytest.mark.asyncio
async def test_probe_reads_local_model_vision_capability(monkeypatch):
    def handler(request):
        if request.method == "POST":
            return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})
        return httpx.Response(200, json={"models": [{"key": "vision-model", "capabilities": {"vision": True}}]})

    mock_client(monkeypatch, handler)
    result = await probe_connection("http://127.0.0.1:1234/v1", "", "vision-model")

    assert result["online"] is True
    assert result["vision"] is True
    assert "图片能力已确认" in result["message"]


@pytest.mark.asyncio
async def test_probe_unreachable_provider_returns_readable_status(monkeypatch):
    def unreachable(_request):
        raise httpx.ConnectError("offline")

    mock_client(monkeypatch, unreachable)
    result = await probe_connection("https://api.example.test/v1", "", "model")

    assert result["online"] is False
    assert result["vision"] is False
    assert result["message"] == "无法连接：ConnectError"
