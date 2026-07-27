from collector.config import settings
from collector.organizers import QUICK_RESULT_KEYS, request_payload, request_timeout, result_schema


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
