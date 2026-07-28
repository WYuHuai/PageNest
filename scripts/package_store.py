import argparse
import hashlib
import shutil
from pathlib import Path, PurePosixPath

if __package__:
    from .generate_store_assets import build_assets
    from .package_release import (
        ROOT,
        mapped_files,
        tracked_files,
        validate_file_content,
        validate_version_metadata,
        write_zip,
    )
else:
    from generate_store_assets import build_assets
    from package_release import (
        ROOT,
        mapped_files,
        tracked_files,
        validate_file_content,
        validate_version_metadata,
        write_zip,
    )


SCREENSHOT = ROOT / "store" / "assets" / "screenshot-01-capture-1280x800.png"
STORE_FILES = (
    "README.md",
    "listing.en-US.md",
    "listing.zh-CN.md",
    "privacy-disclosures.md",
    "reviewer-notes.md",
)


def build_store_kit(output_root: Path | None = None) -> tuple[Path, Path]:
    release = validate_version_metadata()
    version = release["components"]["browser_extension"]
    output = output_root or ROOT / "release" / f"store-v{version}"
    output.mkdir(parents=True, exist_ok=True)

    extension_files = mapped_files(tracked_files(), PurePosixPath("extension"))
    package = output / f"pagenest-web-store-v{version}.zip"
    write_zip(package, extension_files)

    assets = build_assets() + [SCREENSHOT]
    if not SCREENSHOT.is_file():
        raise ValueError(f"Store screenshot is missing: {SCREENSHOT}")
    for source in [ROOT / "store" / name for name in STORE_FILES] + assets:
        validate_file_content(source)
        shutil.copyfile(source, output / source.name)

    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(
        f"{digest}  {package.name}\n",
        encoding="utf-8",
        newline="\n",
    )
    return package, output


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the PageNest browser-store kit")
    parser.add_argument("--output", type=Path, help="Optional output directory")
    arguments = parser.parse_args()
    package, output = build_store_kit(arguments.output)
    print(package)
    print(f"Submission assets: {output}")


if __name__ == "__main__":
    main()
