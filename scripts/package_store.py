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


STORE_FILES = (
    "README.md",
    "listing.en-US.md",
    "listing.zh-CN.md",
    "privacy-disclosures.md",
    "reviewer-notes.md",
)
EDGE_ROOT = ROOT / "store-assets" / "edge"
EDGE_FILES = (
    (EDGE_ROOT / "zh-CN" / "description.txt", "description.zh-CN.txt"),
    (EDGE_ROOT / "en-US" / "description.txt", "description.en-US.txt"),
    (EDGE_ROOT / "CAPTIONS.md", "CAPTIONS.md"),
    (EDGE_ROOT / "PARTNER_CENTER_CHECKLIST.md", "PARTNER_CENTER_CHECKLIST.md"),
    (EDGE_ROOT / "privacy-and-permissions.md", "privacy-and-permissions.md"),
    (EDGE_ROOT / "reviewer-notes.md", "reviewer-notes-v1.10.2.md"),
)
EDGE_ASSETS = (
    EDGE_ROOT / "assets" / "logo-300.png",
    EDGE_ROOT / "assets" / "promo-small-440x280.png",
    EDGE_ROOT / "assets" / "promo-large-1400x560.png",
    *(EDGE_ROOT / "screenshots" / f"0{index}_{name}.png" for index, name in (
        (1, "web_capture"),
        (2, "video_notebook"),
        (3, "vision_ai"),
        (4, "lightbox"),
        (5, "local_first"),
    )),
)


def build_store_kit(output_root: Path | None = None) -> tuple[Path, Path]:
    release = validate_version_metadata()
    version = release["components"]["browser_extension"]
    output = output_root or ROOT / "release" / f"store-v{version}"
    output.mkdir(parents=True, exist_ok=True)

    extension_files = mapped_files(tracked_files(), PurePosixPath("extension"))
    package = output / f"pagenest-web-store-v{version}.zip"
    write_zip(package, extension_files)

    build_assets()
    sources = [ROOT / "store" / name for name in STORE_FILES]
    sources.extend(EDGE_ASSETS)
    for source in sources:
        if not source.is_file():
            raise ValueError(f"Store submission asset is missing: {source}")
        validate_file_content(source)
        shutil.copyfile(source, output / source.name)
    for source, target in EDGE_FILES:
        validate_file_content(source)
        shutil.copyfile(source, output / target)

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
