import hashlib
import json
import re
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
        "browser_extension": "1.9.1",
        "local_server": "1.9.1",
        "obsidian_viewer": "1.4.0",
    }
    assert release["release"] == "1.9.1"
    assert release["protocol"] == {
        "api_protocol_version": 1,
        "pagenest_format_version": 1,
        "capture_version": 12,
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
    installer = tmp_path / "PageNest-Setup-1.9.1.exe"
    installer.write_bytes(b"test installer")
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
        assert "local-server/pagenest_cli.py" in names
        assert "local-server/collector/library.py" in names
        assert "local-server/.env" not in names
        assert "启动网页收藏器.bat" in names
        assert not any(name.startswith("tests/") for name in names)

    checksums = (tmp_path / "SHA256SUMS.txt").read_text("utf-8")
    assert installer.name in checksums
    assert hashlib.sha256(installer.read_bytes()).hexdigest() in checksums


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


def test_installer_accepts_only_explicit_store_extension_ids():
    script = (ROOT / "scripts" / "build_windows_installer.ps1").read_text("utf-8")
    smoke = (ROOT / "scripts" / "smoke_windows_installer.ps1").read_text("utf-8")
    definition = (ROOT / "installer" / "PageNest.iss").read_text("utf-8")
    example = (ROOT / "local-server" / ".env.example").read_text("utf-8")
    manifest = json.loads((ROOT / "release-manifest.json").read_text("utf-8"))
    configured_ids = [
        value for value in manifest["store_extension_ids"].values() if value
    ]

    assert "[string]$ExtensionIds" in script
    assert "$manifest.store_extension_ids.PSObject.Properties.Value" in script
    assert "^[a-p]{32}(,[a-p]{32})*$" in script
    assert '"/DExtensionIds=$ExtensionIds"' in script
    assert configured_ids == ["lbefpoljnlieecogeihhdmgnmjmjkmmd"]
    assert all(re.fullmatch(r"[a-p]{32}", value) for value in configured_ids)
    assert "PAGENEST_EXTENSION_IDS={#ExtensionIds}" in definition
    assert "ExistingConfigLine('HERMES_API_URL=')" in definition
    assert "ExistingConfigLine('HERMES_MODEL_NAME=')" in definition
    assert "ExistingConfigLine('HERMES_API_KEY=')" in definition
    assert "[string]$ExpectedExtensionIds" in smoke
    assert "Store extension pairing: passed" in smoke
    assert "Upgrade token preservation: passed" in smoke
    assert "PAGENEST_EXTENSION_IDS=" in example


def test_installer_opens_the_preconfigured_extension_directory():
    definition = (ROOT / "installer" / "PageNest.iss").read_text("utf-8")
    guide = (ROOT / "installer" / "extension-install.html").read_text("utf-8")
    extension_run_entry = (
        'Filename: "{app}\\Extension"; '
        'Description: "打开正确的浏览器扩展文件夹"; '
        "Flags: shellexec postinstall skipifsilent nowait"
    )
    assert extension_run_entry in definition
    assert 'Filename: "{sys}\\explorer.exe"' not in definition
    assert "请勿加载下载的源码目录" in definition
    assert "%LOCALAPPDATA%\\Programs\\PageNest\\Extension" in guide
    assert "不要选择下载的源码目录" in guide


def test_local_service_port_candidates_stay_in_sync():
    ports = (8765, 18765, 28765)
    connection = (ROOT / "extension" / "core" / "connection.js").read_text("utf-8")
    installer = (ROOT / "installer" / "PageNest.iss").read_text("utf-8")
    smoke = (ROOT / "scripts" / "smoke_windows_installer.ps1").read_text("utf-8")
    example = (ROOT / "local-server" / ".env.example").read_text("utf-8")

    for port in ports:
        assert f'"http://127.0.0.1:{port}"' in connection
        assert f"PortIsListening(Lines, {port})" in installer
        assert str(port) in smoke
    assert "PAGENEST_PORT=" in installer
    assert "PAGENEST_PORT=8765" in example


def test_installer_always_registers_and_starts_user_service():
    installer = (ROOT / "installer" / "PageNest.iss").read_text("utf-8")

    startup_entry = (
        'Name: "{userstartup}\\PageNest"; '
        'Filename: "{app}\\Service\\PageNestService.exe"'
    )
    assert startup_entry in installer
    assert "Tasks: startup" not in installer
    assert "WizardSilent or" not in installer
    assert "StartAndVerifyService;" in installer
    assert "{param:NOSTART|0}" in installer


def test_release_smoke_uses_an_isolated_ephemeral_port():
    smoke = (ROOT / "scripts" / "smoke_release_windows.ps1").read_text("utf-8")

    assert '[int]$Port = 0' in smoke
    assert "TcpListener" in smoke
    assert "Get-NetTCPConnection" not in smoke
