import json
import re

import yaml
from PIL import Image

from package_release import (
    ROOT,
    SECRET_PATTERN,
    validate_archive_entries,
    validate_version_metadata,
    tracked_files,
)


ACTION_REFERENCE = re.compile(r"^\s*uses:\s*[^@\s]+@([^\s#]+)", re.MULTILINE)
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
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
    validate_archive_entries([path.as_posix() for path in tracked])
    for relative in sorted(tracked):
        path = ROOT / relative.as_posix()
        if path.suffix.lower() not in TEXT_SUFFIXES and path.name != ".env.example":
            continue
        body = path.read_bytes()
        if SECRET_PATTERN.search(body):
            raise ValueError(f"Potential credential in tracked file: {relative}")


def main() -> None:
    tracked = tracked_files()
    validate_version_metadata()
    validate_yaml_and_json(tracked)
    validate_action_pins()
    validate_markdown_links(tracked)
    validate_icons()
    validate_tracked_boundary(tracked)
    print(f"Repository validation OK: {len(tracked)} tracked files")


if __name__ == "__main__":
    main()
