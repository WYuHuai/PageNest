from typing import Literal
from pydantic import BaseModel, Field, HttpUrl


class ImageInput(BaseModel):
    position_id: str = ""
    original_url: str = ""
    resolved_url: str = ""
    current_src: str = ""
    alt: str = ""
    caption: str = ""
    nearby_text: str = ""
    width: int = 0
    height: int = 0
    order: int = 0
    source_type: str = "img"
    content_hash: str = ""
    data_url: str = ""


class MediaInput(BaseModel):
    position_id: str = ""
    kind: Literal["video"] = "video"
    source_url: str = ""
    page_url: str = ""
    poster_url: str = ""
    data_url: str = ""
    mime_type: str = ""
    duration: float = 0
    width: int = 0
    height: int = 0
    order: int = 0


class ArticleInput(BaseModel):
    capture_version: int = 1
    image_placement_policy: Literal["fallback", "strict"] = "fallback"
    page_variant: Literal["standard", "bilibili-opus", "feishu-document"] = "standard"
    title: str = "未命名文章"
    author: str = ""
    published_at: str = ""
    site_name: str = ""
    url: str
    canonical_url: str = ""
    language: str = ""
    selected_text: str = ""
    user_note: str = ""
    article_html: str = ""
    article_text: str = ""
    headings: list[str] = []
    images: list[ImageInput] = []
    media: list[MediaInput] = []
    captured_at: str
    extraction_method: str = ""
    extraction_warning: str = ""
    mode: Literal["quick", "deep", "original"] = "quick"
    category: str = "auto"


class OrganizerSettingsInput(BaseModel):
    api_url: str = ""
    model_name: str = ""
    api_key: str | None = None


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
    key_points: list[str] = []
    actionable_methods: list[str] = []
    tools_and_platforms: list[str] = []
    people_and_organizations: list[str] = []
    keywords: list[str] = []
    obsidian_tags: list[str] = []
    content_type: str = ""
    timeliness: str = ""
    relation_to_user_projects: list[str] = []
    inspiration_value: str = ""
    image_notes: list[ImageNote] = []
    limitations: list[str] = []
    recommended_followups: list[str] = []
    confidence: float = Field(default=0.0, ge=0, le=1)

