import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
FIXED_ZIP_TIME = (2026, 7, 27, 0, 0, 0)
PLUGIN_DIR = PurePosixPath("obsidian-plugin/hermes-page-viewer")
PLUGIN_FILES = ("main.js", "manifest.json", "styles.css", "versions.json")
SERVER_FILES = (
    "local-server/.env.example",
    "local-server/requirements.txt",
    "local-server/run.py",
    "安装依赖.bat",
    "启动网页收藏器.bat",
    "停止网页收藏器.bat",
    "检查运行状态.bat",
    "README.zh-CN.md",
    "LICENSE",
    "PRIVACY.md",
    "SECURITY.md",
)
DENIED_PARTS = {
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".visual-check",
    "test-output",
    "logs",
    "runtime",
    "crashpad",
}
DENIED_NAMES = {"cookies", "history", "login data", "web data", "local state"}
DENIED_SUFFIXES = {
    ".hermes",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".log",
    ".dmp",
    ".tmp",
    ".bak",
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".mkv",
}
SECRET_PATTERN = re.compile(
    rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
    rb"|gh[pousr]_[A-Za-z0-9_]{20,}"
    rb"|sk-[A-Za-z0-9]{20,}"
    rb"|AIza[0-9A-Za-z_-]{30,}"
)
MACHINE_PATH_PATTERN = re.compile(
    rb"(?:[A-Za-z]:\\(?:Users\\[^\\\r\n]+|CODEX)\\)",
    re.IGNORECASE,
)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def tracked_files(root: Path = ROOT) -> set[PurePosixPath]:
    raw = subprocess.check_output(
        ["git", "-c", "core.quotepath=false", "ls-files", "-z"],
        cwd=root,
    )
    return {
        PurePosixPath(value.decode("utf-8"))
        for value in raw.split(b"\0")
        if value
    }


def validate_version_metadata(root: Path = ROOT) -> dict:
    release = load_json(root / "release-manifest.json")
    extension = load_json(root / "extension" / "manifest.json")
    viewer = load_json(root / "obsidian-plugin" / "hermes-page-viewer" / "manifest.json")
    versions = load_json(root / "obsidian-plugin" / "hermes-page-viewer" / "versions.json")
    server_source = (root / "local-server" / "collector" / "main.py").read_text("utf-8")
    server_match = re.search(r'FastAPI\([^)]*version="([^"]+)"', server_source)
    if not server_match:
        raise ValueError("Cannot find the local service version")

    components = release["components"]
    actual = {
        "browser_extension": extension["version"],
        "local_server": server_match.group(1),
        "obsidian_viewer": viewer["version"],
    }
    if actual != components:
        raise ValueError(f"Component version mismatch: expected {components}, got {actual}")
    if versions.get(viewer["version"]) != viewer["minAppVersion"]:
        raise ValueError("Obsidian versions.json does not match manifest.json")
    return release


def validate_archive_entries(entries: list[str]) -> None:
    for name in entries:
        path = PurePosixPath(name)
        lowered_parts = {part.lower() for part in path.parts}
        if lowered_parts & DENIED_PARTS:
            raise ValueError(f"Forbidden directory in package: {name}")
        if path.name.lower() in DENIED_NAMES:
            raise ValueError(f"Forbidden profile file in package: {name}")
        if path.name == ".env" or path.suffix.lower() in DENIED_SUFFIXES:
            raise ValueError(f"Forbidden runtime file in package: {name}")


def validate_file_content(path: Path) -> None:
    if path.suffix.lower() not in {
        ".bat",
        ".css",
        ".html",
        ".js",
        ".json",
        ".md",
        ".py",
        ".txt",
        ".yml",
        ".yaml",
    } and path.name != ".env.example":
        return
    body = path.read_bytes()
    if SECRET_PATTERN.search(body):
        raise ValueError(f"Potential credential in release source: {path}")
    if MACHINE_PATH_PATTERN.search(body):
        raise ValueError(f"Machine-specific path in release source: {path}")


def write_zip(
    destination: Path,
    mappings: list[tuple[Path, PurePosixPath]],
) -> None:
    entries = [target.as_posix() for _, target in mappings]
    validate_archive_entries(entries)
    with zipfile.ZipFile(
        destination,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for source, target in sorted(mappings, key=lambda item: item[1].as_posix()):
            validate_file_content(source)
            info = zipfile.ZipInfo(target.as_posix(), FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())


def mapped_files(
    tracked: set[PurePosixPath],
    prefix: PurePosixPath,
) -> list[tuple[Path, PurePosixPath]]:
    return [
        (ROOT / path.as_posix(), path.relative_to(prefix))
        for path in tracked
        if path.is_relative_to(prefix)
    ]


def build_release(output_root: Path | None = None) -> list[Path]:
    release = validate_version_metadata()
    tracked = tracked_files()
    version = release["release"]
    components = release["components"]
    output = output_root or ROOT / "release" / f"v{version}"
    output.mkdir(parents=True, exist_ok=True)

    extension_files = mapped_files(tracked, PurePosixPath("extension"))
    plugin_files = [
        (
            ROOT / (PLUGIN_DIR / filename).as_posix(),
            PurePosixPath(filename),
        )
        for filename in PLUGIN_FILES
    ]
    server_paths = {
        PurePosixPath(path)
        for path in SERVER_FILES
    } | {
        path
        for path in tracked
        if path.is_relative_to(PurePosixPath("local-server/collector"))
        and path.suffix == ".py"
    }
    server_files = [
        (ROOT / path.as_posix(), path)
        for path in server_paths
    ]

    expected = {
        PurePosixPath("manifest.json"),
        PurePosixPath("icons/icon16.png"),
        PurePosixPath("icons/icon32.png"),
        PurePosixPath("icons/icon48.png"),
        PurePosixPath("icons/icon128.png"),
    }
    extension_entries = {target for _, target in extension_files}
    if not expected <= extension_entries:
        raise ValueError(f"Extension package is missing: {sorted(expected - extension_entries)}")
    for source, _ in plugin_files + server_files:
        if not source.is_file():
            raise ValueError(f"Release source is missing: {source}")

    packages = [
        output / f"hermes-browser-extension-v{components['browser_extension']}.zip",
        output / f"hermes-obsidian-viewer-v{components['obsidian_viewer']}.zip",
        output / f"hermes-local-server-windows-v{components['local_server']}.zip",
    ]
    for package, files in zip(packages, (extension_files, plugin_files, server_files)):
        write_zip(package, files)

    notes = ROOT / "docs" / f"release-notes-v{version}.md"
    if notes.is_file():
        (output / "RELEASE_NOTES.md").write_bytes(notes.read_bytes())

    checksum_lines = [
        f"{hashlib.sha256(package.read_bytes()).hexdigest()}  {package.name}"
        for package in packages
    ]
    (output / "SHA256SUMS.txt").write_text(
        "\n".join(checksum_lines) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return packages


def main() -> None:
    parser = argparse.ArgumentParser(description="Build verified Hermes release archives")
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional output directory; defaults to release/v<version>",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Validate version metadata without building archives",
    )
    arguments = parser.parse_args()
    release = validate_version_metadata()
    if arguments.check_only:
        print(f"Release metadata OK: v{release['release']}")
        return
    for package in build_release(arguments.output):
        print(package)


if __name__ == "__main__":
    main()
