from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

from ..limits import MAX_NOTE_CHARS, MAX_TITLE_CHARS, MAX_URL_CHARS, MEBIBYTE


VIDEO_NOTEBOOK_DOCUMENT_TYPE = "video-notebook"
NOTEBOOK_SCHEMA_VERSION = 1
DEFAULT_NOTEBOOK_DIRECTORY = "Video Notebooks"
MAX_NOTEBOOK_SCREENSHOT_BYTES = 10 * MEBIBYTE
MAX_RELATIVE_PATH_CHARS = 4096


def _nonempty(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("标题不能为空")
    return value


def _source_url(value: str) -> str:
    value = value.strip()
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        raise ValueError("来源地址必须是有效的 HTTP 或 HTTPS URL")
    return value


class NotebookEntry(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    captured_at: str = Field(min_length=1, max_length=64)
    video_timestamp_seconds: float = Field(ge=0)
    image_data: str = Field(min_length=1)
    title: str = Field(default="", max_length=MAX_TITLE_CHARS)
    summary: str = Field(default="", max_length=MAX_NOTE_CHARS)
    analysis_status: Literal["pending", "complete", "failed"] | None = None


class Notebook(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    document_type: Literal["video-notebook"] = VIDEO_NOTEBOOK_DOCUMENT_TYPE
    title: str = Field(max_length=MAX_TITLE_CHARS)
    source_url: str = Field(max_length=MAX_URL_CHARS)
    source_title: str = Field(default="", max_length=MAX_TITLE_CHARS)
    created_at: str = Field(min_length=1, max_length=64)
    updated_at: str = Field(min_length=1, max_length=64)
    revision: int = Field(ge=1)
    entries: list[NotebookEntry] = Field(default_factory=list)

    _validate_title = field_validator("title")(_nonempty)
    _validate_source_url = field_validator("source_url")(_source_url)


class CreateNotebookRequest(BaseModel):
    title: str = Field(max_length=MAX_TITLE_CHARS)
    source_url: str = Field(max_length=MAX_URL_CHARS)
    source_title: str = Field(default="", max_length=MAX_TITLE_CHARS)

    _validate_title = field_validator("title")(_nonempty)
    _validate_source_url = field_validator("source_url")(_source_url)


class NotebookReference(BaseModel):
    relative_path: str = Field(min_length=1, max_length=MAX_RELATIVE_PATH_CHARS)


class AppendNotebookEntryRequest(NotebookReference):
    video_timestamp_seconds: float = Field(ge=0)
    image_data_url: str = Field(min_length=1)
    title: str = Field(default="", max_length=MAX_TITLE_CHARS)
    summary: str = Field(default="", max_length=MAX_NOTE_CHARS)


class RenameNotebookRequest(NotebookReference):
    title: str = Field(max_length=MAX_TITLE_CHARS)

    _validate_title = field_validator("title")(_nonempty)
