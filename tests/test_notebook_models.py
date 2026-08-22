import pytest
from pydantic import ValidationError

from collector.notebooks.models import (
    AppendNotebookEntryRequest,
    CreateNotebookRequest,
    RenameNotebookRequest,
)


def test_create_contract_is_generic_and_requires_http_source():
    request = CreateNotebookRequest(
        title="模型讲解",
        source_url="https://video.example/watch/42",
        source_title="课程视频",
    )

    assert request.model_dump() == {
        "title": "模型讲解",
        "source_url": "https://video.example/watch/42",
        "source_title": "课程视频",
    }
    assert not any(
        "bilibili" in name.lower() for name in CreateNotebookRequest.model_fields
    )
    with pytest.raises(ValidationError):
        CreateNotebookRequest(title=" ", source_url="https://example.test")
    with pytest.raises(ValidationError):
        CreateNotebookRequest(title="Notebook", source_url="file:///private/video.mp4")


def test_append_and_rename_contracts_are_narrow():
    append = AppendNotebookEntryRequest(
        relative_path="Video Notebooks/课程.pagenest",
        video_timestamp_seconds=12.5,
        image_data_url="data:image/png;base64,AAAA",
    )
    rename = RenameNotebookRequest(
        relative_path=append.relative_path,
        title="新标题",
    )

    assert append.video_timestamp_seconds == 12.5
    assert rename.title == "新标题"
    with pytest.raises(ValidationError):
        RenameNotebookRequest(relative_path=append.relative_path, title="")
