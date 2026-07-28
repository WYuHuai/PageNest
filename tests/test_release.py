import zipfile

import pytest

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
