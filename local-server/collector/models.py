from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

from .limits import (
    MAX_ARTICLE_HTML_CHARS,
    MAX_ARTICLE_TEXT_CHARS,
    MAX_HEADINGS,
    MAX_IMAGES,
    MAX_MEDIA_ITEMS,
    MAX_NOTE_CHARS,
    MAX_SELECTED_TEXT_CHARS,
    MAX_TITLE_CHARS,
    MAX_URL_CHARS,
)


def _resource_url(value: str) -> str:
    if not value.startswith(("data:", "blob:")) and len(value) > MAX_URL_CHARS:
        raise ValueError("资源 URL 过长")
    return value


ResourceUrl = Annotated[str, AfterValidator(_resource_url)]


class ImageInput(BaseModel):
    position_id: str = Field(default="", max_length=256)
    original_url: ResourceUrl = ""
    resolved_url: ResourceUrl = ""
    current_src: ResourceUrl = ""
    alt: str = Field(default="", max_length=MAX_TITLE_CHARS)
    caption: str = Field(default="", max_length=MAX_NOTE_CHARS)
    nearby_text: str = Field(default="", max_length=MAX_NOTE_CHARS)
    width: int = Field(default=0, ge=0)
    height: int = Field(default=0, ge=0)
    order: int = Field(default=0, ge=0)
    source_type: str = Field(default="img", max_length=64)
    content_hash: str = Field(default="", max_length=128)
    data_url: str = ""


class MediaInput(BaseModel):
    position_id: str = Field(default="", max_length=256)
    kind: Literal["video"] = "video"
    source_url: ResourceUrl = ""
    page_url: str = Field(default="", max_length=MAX_URL_CHARS)
    poster_url: ResourceUrl = ""
    data_url: str = ""
    mime_type: str = Field(default="", max_length=256)
    duration: float = Field(default=0, ge=0)
    width: int = Field(default=0, ge=0)
    height: int = Field(default=0, ge=0)
    order: int = Field(default=0, ge=0)


class CommentReplyInput(BaseModel):
    author: str = Field(default="", max_length=MAX_TITLE_CHARS)
    avatar_url: ResourceUrl = ""
    avatar_data_url: str = Field(default="", max_length=400_000)
    content: str = Field(default="", max_length=1600)
    time: str = Field(default="", max_length=128)
    location: str = Field(default="", max_length=128)
    like_count: str = Field(default="", max_length=64)
    is_author: bool = False
    replies: list = Field(default_factory=list, max_length=0)


class CommentInput(CommentReplyInput):
    replies: list[CommentReplyInput] = Field(default_factory=list, max_length=40)


class ArticleInput(BaseModel):
    capture_version: int = Field(default=1, ge=1)
    image_placement_policy: Literal["fallback", "strict"] = "fallback"
    page_variant: Literal["standard", "bilibili-opus", "feishu-document", "xiaohongshu-note"] = "standard"
    title: str = Field(default="未命名文章", max_length=MAX_TITLE_CHARS)
    author: str = Field(default="", max_length=MAX_TITLE_CHARS)
    published_at: str = Field(default="", max_length=256)
    site_name: str = Field(default="", max_length=MAX_TITLE_CHARS)
    source_kind: Literal["web", "local-html"] = "web"
    source_name: str = Field(default="", max_length=MAX_TITLE_CHARS)
    url: str = Field(max_length=MAX_URL_CHARS)
    canonical_url: str = Field(default="", max_length=MAX_URL_CHARS)
    language: str = Field(default="", max_length=64)
    selected_text: str = Field(default="", max_length=MAX_SELECTED_TEXT_CHARS)
    user_note: str = Field(default="", max_length=MAX_NOTE_CHARS)
    article_html: str = Field(default="", max_length=MAX_ARTICLE_HTML_CHARS)
    article_text: str = Field(default="", max_length=MAX_ARTICLE_TEXT_CHARS)
    headings: list[str] = Field(default_factory=list, max_length=MAX_HEADINGS)
    images: list[ImageInput] = Field(default_factory=list, max_length=MAX_IMAGES)
    media: list[MediaInput] = Field(default_factory=list, max_length=MAX_MEDIA_ITEMS)
    comments: list[CommentInput] = Field(default_factory=list, max_length=80)
    captured_at: str = Field(max_length=256)
    extraction_method: str = Field(default="", max_length=MAX_TITLE_CHARS)
    extraction_warning: str = Field(default="", max_length=MAX_NOTE_CHARS)
    mode: Literal["quick", "deep", "original"] = "quick"
    category: str = Field(default="auto", max_length=MAX_TITLE_CHARS)


class OrganizerSettingsInput(BaseModel):
    api_url: str = Field(default="", max_length=MAX_URL_CHARS)
    model_name: str = Field(default="", max_length=MAX_TITLE_CHARS)
    api_key: str | None = Field(default=None, max_length=MAX_NOTE_CHARS)


class ImageNote(BaseModel):
    image_filename: str = ""
    description: str = ""
    visible_text: str = ""
    article_role: str = ""
    related_section: str = ""
    importance: str = ""
    vision_verified: bool = False


class HermesResult(BaseModel):
    suggested_category: str = "阅读记录/待整理"
    normalized_title: str = ""
    one_sentence_summary: str = ""
    abstract: str = ""
    key_points: list[str] = Field(default_factory=list)
    actionable_methods: list[str] = Field(default_factory=list)
    tools_and_platforms: list[str] = Field(default_factory=list)
    people_and_organizations: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    obsidian_tags: list[str] = Field(default_factory=list)
    content_type: str = ""
    timeliness: str = ""
    relation_to_user_projects: list[str] = Field(default_factory=list)
    inspiration_value: str = ""
    image_notes: list[ImageNote] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    recommended_followups: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0, le=1)
