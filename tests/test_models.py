import pytest
from pydantic import ValidationError

from collector.limits import MAX_ARTICLE_TEXT_CHARS, MAX_IMAGES, MAX_URL_CHARS
from collector.models import ArticleInput, ImageInput


BASE_ARTICLE = {
    "url": "https://example.com/article",
    "captured_at": "2026-07-27T00:00:00+08:00",
}


def test_article_text_and_image_count_limits():
    with pytest.raises(ValidationError):
        ArticleInput(**BASE_ARTICLE, article_text="x" * (MAX_ARTICLE_TEXT_CHARS + 1))
    with pytest.raises(ValidationError):
        ArticleInput(
            **BASE_ARTICLE,
            images=[ImageInput() for _ in range(MAX_IMAGES + 1)],
        )


def test_resource_data_url_remains_supported_but_long_http_url_is_rejected():
    data_url = "data:image/png;base64," + "a" * (MAX_URL_CHARS + 1)
    assert ImageInput(resolved_url=data_url).resolved_url == data_url
    with pytest.raises(ValidationError, match="资源 URL 过长"):
        ImageInput(resolved_url="https://example.com/" + "a" * MAX_URL_CHARS)


def test_model_list_defaults_are_not_shared():
    first = ArticleInput(**BASE_ARTICLE)
    second = ArticleInput(**BASE_ARTICLE)
    first.images.append(ImageInput())
    assert second.images == []
