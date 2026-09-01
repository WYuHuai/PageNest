import re

from .limits import MAX_DOCUMENT_STYLES_CHARS


_SAFE_PROPERTIES = {
    "align-content", "align-items", "align-self", "aspect-ratio",
    "background", "background-color", "border", "border-collapse", "border-spacing",
    "box-shadow", "box-sizing", "bottom", "clear", "color", "columns", "content",
    "display", "float", "font", "font-family", "font-size", "font-style", "font-variant",
    "font-weight", "gap", "height", "inset", "justify-content", "justify-items",
    "justify-self", "left", "letter-spacing", "line-height", "list-style",
    "list-style-position", "list-style-type", "margin", "max-height", "max-width",
    "min-height", "min-width", "object-fit", "object-position", "opacity", "order",
    "outline", "overflow", "overflow-wrap", "overflow-x", "overflow-y", "padding",
    "place-content", "place-items", "position", "right", "table-layout", "text-align",
    "text-decoration", "text-indent", "text-overflow", "text-transform", "top",
    "transform", "transform-origin", "vertical-align", "visibility", "white-space",
    "width", "word-break", "word-spacing", "z-index",
}
_SAFE_PREFIXES = (
    "background-", "border-", "column-", "flex-", "grid-", "margin-", "max-",
    "min-", "outline-", "padding-", "text-decoration-",
)
_UNSAFE_VALUE = re.compile(
    r"url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|"
    r"-moz-binding|@import|@font-face|file\s*:|https?\s*:|[a-z]:[\\/]",
    re.IGNORECASE,
)
_CLASS_TOKEN = re.compile(r"[-_a-zA-Z0-9]{1,128}")
_MAX_STYLE_RULES = 4000


def _strip_comments(source: str) -> str:
    output: list[str] = []
    index = 0
    quote = ""
    while index < len(source):
        character = source[index]
        if quote:
            output.append(character)
            if character == "\\" and index + 1 < len(source):
                index += 1
                output.append(source[index])
            elif character == quote:
                quote = ""
        elif character in {'"', "'"}:
            quote = character
            output.append(character)
        elif source.startswith("/*", index):
            end = source.find("*/", index + 2)
            index = len(source) if end < 0 else end + 2
            continue
        else:
            output.append(character)
        index += 1
    return "".join(output)


def _split_top_level(source: str, delimiter: str) -> list[str]:
    parts: list[str] = []
    start = 0
    quote = ""
    round_depth = 0
    square_depth = 0
    index = 0
    while index < len(source):
        character = source[index]
        if quote:
            if character == "\\":
                index += 1
            elif character == quote:
                quote = ""
        elif character in {'"', "'"}:
            quote = character
        elif character == "(":
            round_depth += 1
        elif character == ")":
            round_depth = max(0, round_depth - 1)
        elif character == "[":
            square_depth += 1
        elif character == "]":
            square_depth = max(0, square_depth - 1)
        elif character == delimiter and round_depth == 0 and square_depth == 0:
            parts.append(source[start:index])
            start = index + 1
        index += 1
    parts.append(source[start:])
    return parts


def _declaration_parts(value: str) -> tuple[str, str]:
    pieces = _split_top_level(value, ":")
    if len(pieces) < 2:
        return "", ""
    return pieces[0].strip(), ":".join(pieces[1:]).strip()


def _safe_property(name: str) -> bool:
    return (
        bool(re.fullmatch(r"--[-_a-zA-Z0-9]+", name))
        or name in _SAFE_PROPERTIES
        or name.startswith(_SAFE_PREFIXES)
    )


def _safe_value(property_name: str, value: str) -> bool:
    if not value or len(value) > 4096 or "<" in value or "\x00" in value:
        return False
    if _UNSAFE_VALUE.search(f"{property_name}:{value}"):
        return False
    if property_name == "content":
        return value in {"normal", "none"} or bool(
            re.fullmatch(r'''(["'])(?:\\.|(?!\1).)*\1(?:\s*!important)?''', value)
        )
    return True


def _safe_positioning(property_name: str, value: str) -> bool:
    if property_name == "position":
        normalized = re.sub(r"\s*!important\s*$", "", value, flags=re.IGNORECASE).strip().lower()
        return normalized in {"static", "relative"}
    return property_name not in {
        "bottom", "inset", "left", "right", "top", "transform",
        "transform-origin", "z-index",
    }


def sanitize_inline_style(source: str, *, allow_positioning: bool = True) -> str:
    declarations: list[str] = []
    for part in _split_top_level(_strip_comments(str(source or "")), ";"):
        name, value = _declaration_parts(part)
        normalized = name if name.startswith("--") else name.lower()
        if (
            _safe_property(normalized)
            and _safe_value(normalized, value)
            and (allow_positioning or _safe_positioning(normalized, value))
        ):
            declarations.append(f"{normalized}:{value}")
    return ";".join(declarations)


def safe_class_names(values) -> list[str]:
    candidates = values if isinstance(values, list) else str(values or "").split()
    return [str(value) for value in candidates[:32] if _CLASS_TOKEN.fullmatch(str(value))]


def _flat_rules(source: str):
    index = 0
    while index < len(source):
        opening = source.find("{", index)
        if opening < 0:
            return
        selector = source[index:opening].strip()
        quote = ""
        round_depth = 0
        cursor = opening + 1
        while cursor < len(source):
            character = source[cursor]
            if quote:
                if character == "\\":
                    cursor += 1
                elif character == quote:
                    quote = ""
            elif character in {'"', "'"}:
                quote = character
            elif character == "(":
                round_depth += 1
            elif character == ")":
                round_depth = max(0, round_depth - 1)
            elif character == "}" and round_depth == 0:
                yield selector, source[opening + 1:cursor]
                index = cursor + 1
                break
            cursor += 1
        else:
            return


def _scope_selector(selector: str) -> str:
    value = selector.strip()
    if (
        not value
        or len(value) > 2048
        or value.startswith("@")
        or any(character in value for character in "{}<")
        or _UNSAFE_VALUE.search(value)
    ):
        return ""
    if value.startswith(":root"):
        return ".article-body" + value[len(":root"):]
    while True:
        match = re.match(r"^(?:html|body)(?=\s|$)\s*", value, re.IGNORECASE)
        if not match:
            break
        value = value[match.end():].lstrip()
    return ".article-body" + (f" {value}" if value else "")


def sanitize_document_styles(source: str) -> str:
    rules: list[str] = []
    total = 0
    cleaned = _strip_comments(str(source or "")[:MAX_DOCUMENT_STYLES_CHARS])
    for index, (selector_group, declaration_source) in enumerate(_flat_rules(cleaned)):
        if index >= _MAX_STYLE_RULES:
            break
        declarations = sanitize_inline_style(declaration_source)
        if not declarations:
            continue
        selectors = [
            scoped
            for selector in _split_top_level(selector_group, ",")
            if (scoped := _scope_selector(selector))
        ]
        if not selectors:
            continue
        rule = f"{','.join(selectors)}{{{declarations}}}"
        if total + len(rule) > MAX_DOCUMENT_STYLES_CHARS:
            break
        rules.append(rule)
        total += len(rule)
    return "\n".join(rules)
