import json
import re

import yaml
from PIL import Image

from package_release import (
    MACHINE_PATH_PATTERN,
    ROOT,
    SECRET_PATTERN,
    validate_archive_entries,
    validate_version_metadata,
    tracked_files,
)


SANITIZED_RUNTIME_FIXTURES = {"tests/fixtures/legacy-page.hermes"}


ACTION_REFERENCE = re.compile(r"^\s*uses:\s*[^@\s]+@([^\s#]+)", re.MULTILINE)
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
NAMED_MESSAGE_PLACEHOLDER = re.compile(r"\$([A-Za-z0-9_]+)\$")
POSITIONAL_SUBSTITUTION = re.compile(r"\$\d+")
TEXT_SUFFIXES = {
    ".bat",
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".ps1",
    ".py",
    ".txt",
    ".yml",
    ".yaml",
}


def validate_yaml_and_json(tracked) -> None:
    for relative in sorted(tracked):
        path = ROOT / relative.as_posix()
        if path.suffix.lower() == ".json":
            json.loads(path.read_text("utf-8"))
        elif path.suffix.lower() in {".yml", ".yaml"}:
            yaml.safe_load(path.read_text("utf-8"))


def validate_locale_placeholders(messages: dict, locale_name: str) -> None:
    for key, entry in messages.items():
        message = entry.get("message", "")
        placeholders = entry.get("placeholders", {})
        defined = {name.lower() for name in placeholders}
        missing = sorted({
            name.lower()
            for name in NAMED_MESSAGE_PLACEHOLDER.findall(message)
            if name.lower() not in defined
        })
        if missing:
            raise ValueError(
                f"Undefined Chrome i18n placeholder in {locale_name}.{key}: "
                + ", ".join(missing)
            )
        for name, placeholder in placeholders.items():
            content = placeholder.get("content", "")
            if not POSITIONAL_SUBSTITUTION.fullmatch(content):
                raise ValueError(
                    f"Invalid Chrome i18n placeholder content in "
                    f"{locale_name}.{key}.{name}: {content!r}"
                )


def validate_extension_locales() -> None:
    locale_root = ROOT / "extension" / "_locales"
    locale_keys = None
    for messages_path in sorted(locale_root.glob("*/messages.json")):
        messages = json.loads(messages_path.read_text("utf-8"))
        validate_locale_placeholders(messages, messages_path.parent.name)
        keys = set(messages)
        if locale_keys is None:
            locale_keys = keys
        elif keys != locale_keys:
            raise ValueError(
                f"Chrome i18n locale key mismatch: {messages_path.parent.name}"
            )


def validate_action_pins() -> None:
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text("utf-8")
    references = ACTION_REFERENCE.findall(workflow)
    if not references or any(not re.fullmatch(r"[0-9a-f]{40}", ref) for ref in references):
        raise ValueError("Every GitHub Action must use a full lowercase commit SHA")


def validate_markdown_links(tracked) -> None:
    missing = []
    for relative in sorted(path for path in tracked if path.suffix.lower() == ".md"):
        source = ROOT / relative.as_posix()
        for link in MARKDOWN_LINK.findall(source.read_text("utf-8")):
            target = link.split("#", 1)[0]
            if not target or link.startswith(("http://", "https://", "#", "mailto:")):
                continue
            if not (source.parent / target).resolve().is_file():
                missing.append(f"{relative}: {link}")
    if missing:
        raise ValueError("Broken local Markdown links:\n" + "\n".join(missing))


def validate_icons() -> None:
    manifest = json.loads((ROOT / "extension" / "manifest.json").read_text("utf-8"))
    for size_text, relative in manifest["icons"].items():
        size = int(size_text)
        path = ROOT / "extension" / relative
        with Image.open(path) as image:
            if image.size != (size, size) or image.format != "PNG":
                raise ValueError(f"Invalid extension icon: {relative}")
        if manifest["action"]["default_icon"].get(size_text) != relative:
            raise ValueError(f"Action icon mismatch: {relative}")


def validate_tracked_boundary(tracked) -> None:
    validate_archive_entries([
        path.as_posix()
        for path in tracked
        if path.as_posix() not in SANITIZED_RUNTIME_FIXTURES
    ])
    for relative in sorted(tracked):
        path = ROOT / relative.as_posix()
        if (
            path.suffix.lower() not in TEXT_SUFFIXES
            and path.name != ".env.example"
            and relative.as_posix() not in SANITIZED_RUNTIME_FIXTURES
        ):
            continue
        body = path.read_bytes()
        if SECRET_PATTERN.search(body):
            raise ValueError(f"Potential credential in tracked file: {relative}")
        if (
            relative.as_posix() in SANITIZED_RUNTIME_FIXTURES
            and MACHINE_PATH_PATTERN.search(body)
        ):
            raise ValueError(f"Machine-specific path in tracked file: {relative}")


def main() -> None:
    tracked = tracked_files()
    validate_version_metadata()
    validate_yaml_and_json(tracked)
    validate_extension_locales()
    validate_action_pins()
    validate_markdown_links(tracked)
    validate_icons()
    validate_tracked_boundary(tracked)
    print(f"Repository validation OK: {len(tracked)} tracked files")


if __name__ == "__main__":
    main()
