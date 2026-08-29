import base64
import json

from bs4 import BeautifulSoup

from collector.document_text import extract_document
from collector.notebooks.models import Notebook, NotebookEntry
from collector.notebooks.rendering import read_notebook, render_notebook


PNG_DATA = "data:image/png;base64," + base64.b64encode(
    b"\x89PNG\r\n\x1a\nrender-test"
).decode("ascii")


def make_notebook() -> Notebook:
    return Notebook(
        id="notebook-1",
        title="安全 </script><b>标题</b>",
        source_url="https://example.test/watch?q=1&next=2",
        source_title="<来源>",
        created_at="2026-08-22T00:00:00Z",
        updated_at="2026-08-22T00:01:00Z",
        revision=2,
        entries=[
            NotebookEntry(
                id="entry-1",
                captured_at="2026-08-22T00:01:00Z",
                video_timestamp_seconds=65,
                image_data=PNG_DATA,
                title="<img src=x onerror=alert(1)>",
                summary="总结 </script><script>alert(1)</script>",
            )
        ],
    )


def test_notebook_is_self_contained_safe_html_and_stores_image_once():
    rendered = render_notebook(make_notebook())
    soup = BeautifulSoup(rendered, "html.parser")
    state_node = soup.select_one("#pagenest-notebook-data")
    state = json.loads(state_node.string)

    assert rendered.count(PNG_DATA) == 1
    assert PNG_DATA not in state_node.string
    assert state["document_type"] == "video-notebook"
    assert state["entries"][0]["id"] == "entry-1"
    assert "image_data" not in state["entries"][0]
    assert not soup.select("script[src], link[rel=stylesheet], img[src^=http]")
    assert "default-src 'none'" in rendered
    assert "connect-src 'none'" in rendered
    assert "frame-src 'none'" in rendered
    assert "</script><script>alert(1)</script>" not in rendered
    assert soup.select_one("article h3 img") is None
    assert soup.select_one("[onerror]") is None


def test_notebook_round_trip_and_generic_document_reader_do_not_crash():
    original = make_notebook()
    rendered = render_notebook(original)
    restored = read_notebook(rendered)
    generic = extract_document(rendered)

    assert restored == original
    assert generic.document_type == "video-notebook"
    assert generic.title == original.title
    assert "总结" in generic.text
    assert generic.source == original.source_url


def test_knowledge_10_old_notebook_without_analysis_status_remains_readable():
    rendered = render_notebook(make_notebook())
    rendered = rendered.replace(',"analysis_status":null', "")

    restored = read_notebook(rendered)

    assert restored.entries[0].title == "<img src=x onerror=alert(1)>"
    assert restored.entries[0].summary == "总结 </script><script>alert(1)</script>"
    assert restored.entries[0].analysis_status is None
