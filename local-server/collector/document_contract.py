DEFAULT_DOCUMENT_TYPE = "web-capture"
WEB_CAPTURE_DOCUMENT_TYPE = DEFAULT_DOCUMENT_TYPE


def read_document_type(metadata: dict) -> str:
    value = metadata.get("document_type")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return DEFAULT_DOCUMENT_TYPE
