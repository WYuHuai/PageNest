import json
import zipfile

import pytest
from PIL import Image

from scripts.package_store import build_store_kit
from scripts.package_release import (
    ROOT,
    build_release,
    validate_archive_entries,
    validate_version_metadata,
)


def test_release_versions_are_consistent():
    release = validate_version_metadata(ROOT)
    assert release["components"] == {
        "browser_extension": "1.7.4",
        "local_server": "1.7.4",
        "obsidian_viewer": "1.3.0",
    }


@pytest.mark.parametrize(
    "entry",
    [
        "local-server/.env",
        "local-server/.venv/python.exe",
        "logs/server.log",
        "test-output/profile/History",
        "private.hermes",
        "private.pagenest",
        "video.mp4",
    ],
)
def test_release_validator_rejects_runtime_and_private_entries(entry):
    with pytest.raises(ValueError):
        validate_archive_entries([entry])


def test_release_packages_have_expected_roots(tmp_path):
    packages = build_release(tmp_path)
    browser, viewer, server = packages

    with zipfile.ZipFile(browser) as archive:
        names = set(archive.namelist())
        assert "manifest.json" in names
        assert "icons/icon128.png" in names
        assert "connection-config.js" in names
        validate_archive_entries(list(names))

    with zipfile.ZipFile(viewer) as archive:
        assert set(archive.namelist()) == {
            "main.js",
            "manifest.json",
            "styles.css",
            "versions.json",
        }

    with zipfile.ZipFile(server) as archive:
        names = set(archive.namelist())
        assert "local-server/.env.example" in names
        assert "local-server/.env" not in names
        assert "启动网页收藏器.bat" in names
        assert not any(name.startswith("tests/") for name in names)


@pytest.mark.parametrize(
    ("path", "size"),
    [
        ("extension/icons/icon16.png", 16),
        ("extension/icons/icon32.png", 32),
        ("extension/icons/icon48.png", 48),
        ("extension/icons/icon128.png", 128),
        ("docs/assets/pagenest-icon-256.png", 256),
        ("assets/pagenest-icon-1024.png", 1024),
    ],
)
def test_brand_icons_have_expected_size_and_transparency(path, size):
    with Image.open(ROOT / path) as image:
        assert image.size == (size, size)
        assert image.convert("RGBA").getchannel("A").getextrema() == (0, 255)


def test_windows_icon_contains_required_sizes():
    with Image.open(ROOT / "installer" / "PageNest.ico") as image:
        assert image.format == "ICO"
        assert image.info["sizes"] >= {
            (16, 16),
            (32, 32),
            (48, 48),
            (128, 128),
            (256, 256),
        }

def test_store_assets_match_required_dimensions():
    expected = {
        "icon-128.png": (128, 128),
        "promo-small-440x280.png": (440, 280),
        "promo-marquee-1400x560.png": (1400, 560),
        "screenshot-01-capture-1280x800.png": (1280, 800),
    }
    for name, size in expected.items():
        with Image.open(ROOT / "store" / "assets" / name) as image:
            assert image.size == size


def test_store_package_is_upload_ready(tmp_path):
    package, output = build_store_kit(tmp_path)

    with zipfile.ZipFile(package) as archive:
        names = set(archive.namelist())
        manifest = json.loads(archive.read("manifest.json"))
        assert "manifest.json" in names
        assert "icons/icon128.png" in names
        assert "tabs" not in manifest["permissions"]
        assert not any(name.startswith("store/") for name in names)
        validate_archive_entries(list(names))

    assert (output / "listing.en-US.md").is_file()
    assert (output / "listing.zh-CN.md").is_file()
    assert (output / "privacy-disclosures.md").is_file()
    assert (output / "reviewer-notes.md").is_file()
    assert (output / "screenshot-01-capture-1280x800.png").is_file()
    assert package.name in (output / "SHA256SUMS.txt").read_text("utf-8")
