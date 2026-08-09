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


class FakeKernel32:
    def __init__(self, handle=42):
        self.handle = handle
        self.closed = []

    def CreateMutexW(self, *_args):
        return self.handle

    def CloseHandle(self, handle):
        self.closed.append(handle)


def test_single_instance_mutex_keeps_first_instance():
    kernel32 = FakeKernel32()

    assert run.create_single_instance_mutex(kernel32, lambda: 0) == 42
    assert kernel32.closed == []


def test_single_instance_mutex_rejects_duplicate():
    kernel32 = FakeKernel32()

    assert run.create_single_instance_mutex(kernel32, lambda: 183) is None
    assert kernel32.closed == [42]
