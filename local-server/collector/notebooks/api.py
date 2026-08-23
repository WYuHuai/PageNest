from fastapi import APIRouter, HTTPException

from .models import (
    AppendNotebookEntryRequest,
    CreateNotebookRequest,
    RenameNotebookRequest,
)
from .store import NotebookStoreError, notebook_store


router = APIRouter(prefix="/api/notebooks", tags=["video-notebooks"])


def _http_error(error: NotebookStoreError) -> HTTPException:
    return HTTPException(error.status_code, str(error))


@router.post("")
async def create_notebook(payload: CreateNotebookRequest):
    try:
        return await notebook_store.create(
            payload.title,
            payload.source_url,
            payload.source_title,
            payload.initial_entry,
        )
    except NotebookStoreError as exc:
        raise _http_error(exc) from exc


@router.get("/{notebook_id}")
async def get_notebook(notebook_id: str, relative_path: str):
    try:
        return await notebook_store.get(notebook_id, relative_path)
    except NotebookStoreError as exc:
        raise _http_error(exc) from exc


@router.post("/{notebook_id}/entries")
async def append_notebook_entry(
    notebook_id: str, payload: AppendNotebookEntryRequest
):
    try:
        return await notebook_store.append(
            notebook_id,
            payload.relative_path,
            payload.video_timestamp_seconds,
            payload.image_data_url,
            payload.title,
            payload.summary,
        )
    except NotebookStoreError as exc:
        raise _http_error(exc) from exc


@router.post("/{notebook_id}/rename")
async def rename_notebook(notebook_id: str, payload: RenameNotebookRequest):
    try:
        return await notebook_store.rename(
            notebook_id, payload.relative_path, payload.title
        )
    except NotebookStoreError as exc:
        raise _http_error(exc) from exc
