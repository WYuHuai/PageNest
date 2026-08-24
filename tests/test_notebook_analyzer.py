import asyncio
import json

import httpx
import pytest
from pydantic import ValidationError

from collector.config import settings
from collector.notebooks import analyzer


class Completion:
    def __init__(self, content):
        self.content = content
        self.request_count = 1
        self.structured = True


def fake_client(monkeypatch, response=None, error=None, wait=False):
    calls = []

    class Client:
        def __init__(self, **options):
            calls.append({"options": options})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def chat_completion(self, **options):
            calls.append({"request": options})
            if wait:
                await asyncio.sleep(3600)
            if error:
                raise error
            return Completion(response)

    monkeypatch.setattr(analyzer, "AIClient", Client)
    return calls


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "hermes_api_url", "https://ai.example.test/v1")
    monkeypatch.setattr(settings, "hermes_api_key", "secret")
    monkeypatch.setattr(settings, "hermes_model_name", "vision-model")


@pytest.mark.parametrize(
    "content",
    [
        pytest.param('{"title":"A","summary":"B"}', id="VISION-PARSE-01"),
        pytest.param(
            '```json\n{"title":"A","summary":"B"}\n```',
            id="VISION-PARSE-02",
        ),
        pytest.param(
            '{"title":"A","summary":"B"}\n```',
            id="VISION-PARSE-03",
        ),
        pytest.param(
            ' \r\n```\r\n  {"title":"A","summary":"B"}  \r\n```\r\n ',
            id="VISION-PARSE-04",
        ),
    ],
)
def test_structured_content_decoder_accepts_only_markdown_fence_noise(content):
    assert analyzer._decode_structured_content(content) == {
        "title": "A",
        "summary": "B",
    }


@pytest.mark.parametrize(
    "content",
    [
        pytest.param(
            '{"title":"A","summary":"B"}\nHere is the result.',
            id="VISION-PARSE-05",
        ),
        pytest.param(
            'Here is the result:\n{"title":"A","summary":"B"}',
            id="VISION-PARSE-06",
        ),
        pytest.param(
            '{"title":"A","summary":"B"}\n'
            '{"title":"C","summary":"D"}',
            id="VISION-PARSE-07",
        ),
        pytest.param('["A","B"]', id="VISION-PARSE-11"),
        pytest.param('{"title":"A",', id="VISION-PARSE-12"),
    ],
)
def test_structured_content_decoder_rejects_non_contract_content(content):
    with pytest.raises((json.JSONDecodeError, ValueError)):
        analyzer._decode_structured_content(content)


@pytest.mark.parametrize(
    "content",
    [
        pytest.param(
            '{"name":"A","description":"B"}',
            id="VISION-PARSE-08",
        ),
        pytest.param('{"title":"","summary":"B"}', id="VISION-PARSE-09"),
        pytest.param('{"title":"A","summary":""}', id="VISION-PARSE-10"),
    ],
)
def test_frame_analysis_validation_remains_strict(content):
    decoded = analyzer._decode_structured_content(content)

    with pytest.raises(ValidationError):
        analyzer.FrameAnalysis.model_validate(decoded)


@pytest.mark.asyncio
async def test_trailing_fence_analysis_completes_without_retry(monkeypatch):
    calls = fake_client(
        monkeypatch,
        '{"title":"A","summary":"B"}\n```',
    )

    result = await analyzer.analyze_frame("data:image/png;base64,AAAA", "")

    assert result == analyzer.AnalysisResult(
        status="complete",
        title="A",
        summary="B",
    )
    assert len([call for call in calls if "request" in call]) == 1


@pytest.mark.asyncio
async def test_success_uses_multimodal_structured_request_and_bounded_result(monkeypatch):
    calls = fake_client(
        monkeypatch,
        json.dumps({"title": "关键结构", "summary": "画面展示了机械结构及其连接关系。"}),
    )

    result = await analyzer.analyze_frame(
        "data:image/png;base64,AAAA",
        "课程标题",
        49,
        "https://example.test/watch?v=1",
    )

    assert result.status == "complete"
    assert result.title == "关键结构"
    assert result.summary.startswith("画面展示")
    request = calls[1]["request"]
    content = request["messages"][1]["content"]
    assert content[-1] == {
        "type": "image_url",
        "image_url": {"url": "data:image/png;base64,AAAA"},
    }
    assert "课程标题" in content[0]["text"]
    assert "49.000 秒" in content[0]["text"]
    assert "即使完全没有文字" in request["messages"][0]["content"]
    assert request["response_schema"]["additionalProperties"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "content",
    [
        "not-json",
        json.dumps({"title": "only-title"}),
        json.dumps({"title": "x" * (analyzer.MAX_ANALYSIS_TITLE_CHARS + 1), "summary": "ok"}),
        json.dumps({"title": "ok", "summary": "x" * (analyzer.MAX_ANALYSIS_SUMMARY_CHARS + 1)}),
    ],
)
async def test_invalid_or_oversize_output_is_controlled_failure(monkeypatch, content):
    fake_client(monkeypatch, content)

    result = await analyzer.analyze_frame("data:image/png;base64,AAAA", "")

    assert result.status == "failed"
    assert result.title == ""
    assert result.summary == ""


@pytest.mark.asyncio
async def test_no_text_visual_can_still_return_meaningful_metadata(monkeypatch):
    fake_client(
        monkeypatch,
        json.dumps({
            "title": "山间骑行者",
            "summary": "一名骑行者沿山路前进，远处可见连绵山脉。",
        }),
    )

    result = await analyzer.analyze_frame("data:image/png;base64,AAAA", "")

    assert result.status == "complete"
    assert result.title
    assert result.summary


@pytest.mark.asyncio
async def test_unconfigured_ai_is_unavailable_without_network(monkeypatch):
    monkeypatch.setattr(settings, "hermes_api_url", "")
    monkeypatch.setattr(analyzer, "AIClient", lambda **_kwargs: pytest.fail("no network"))

    result = await analyzer.analyze_frame("data:image/png;base64,AAAA", "")

    assert result.status == "unavailable"


@pytest.mark.asyncio
async def test_text_only_provider_is_controlled_unsupported(monkeypatch):
    request = httpx.Request("POST", "https://ai.example.test/v1/chat/completions")
    response = httpx.Response(415, request=request)
    fake_client(monkeypatch, error=httpx.HTTPStatusError("unsupported", request=request, response=response))

    result = await analyzer.analyze_frame("data:image/png;base64,AAAA", "")

    assert result.status == "unsupported"


@pytest.mark.asyncio
async def test_structured_and_fallback_http_400_produce_one_unsupported_result(
    monkeypatch,
):
    requests = []
    real_client = httpx.AsyncClient

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(400, json={"error": {"type": "unsupported_input"}})

    def client_factory(**options):
        return real_client(
            transport=httpx.MockTransport(handler),
            timeout=options.get("timeout"),
        )

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)

    result = await analyzer.analyze_frame("data:image/png;base64,AAAA", "")

    assert result.status == "unsupported"
    assert result.title == ""
    assert result.summary == ""
    assert len(requests) == 2
    assert "response_format" in requests[0]
    assert "response_format" not in requests[1]


@pytest.mark.asyncio
async def test_timeout_is_controlled_failure(monkeypatch):
    fake_client(monkeypatch, wait=True)
    monkeypatch.setattr(analyzer, "ANALYSIS_TIMEOUT_SECONDS", 0.001)

    result = await analyzer.analyze_frame("data:image/png;base64,AAAA", "")

    assert result.status == "failed"
