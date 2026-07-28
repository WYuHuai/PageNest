import io

import run


def test_usable_standard_stream_preserves_existing_stream():
    stream = io.StringIO()

    assert run.usable_standard_stream(stream) is stream


def test_usable_standard_stream_replaces_missing_console_stream():
    stream = run.usable_standard_stream(None)
    try:
        assert isinstance(stream.isatty(), bool)
        assert stream.writable()
    finally:
        stream.close()
