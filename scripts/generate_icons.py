from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "pagenest-icon-1024.png"
PNG_OUTPUTS = {
    ROOT / "extension" / "icons" / "icon16.png": 16,
    ROOT / "extension" / "icons" / "icon32.png": 32,
    ROOT / "extension" / "icons" / "icon48.png": 48,
    ROOT / "extension" / "icons" / "icon128.png": 128,
    ROOT / "docs" / "assets" / "pagenest-icon-256.png": 256,
}
INSTALLER_ICON = ROOT / "installer" / "PageNest.ico"


def load_master() -> Image.Image:
    with Image.open(SOURCE) as image:
        master = image.convert("RGBA")
    if master.size != (1024, 1024):
        master = master.resize((1024, 1024), Image.Resampling.LANCZOS)
    return master


def resize_icon(master: Image.Image, size: int) -> Image.Image:
    icon = master.resize((size, size), Image.Resampling.LANCZOS)
    icon.putalpha(icon.getchannel("A").point(lambda alpha: 0 if alpha < 8 else alpha))
    return icon


def main() -> None:
    master = load_master()
    master.save(SOURCE, optimize=True)
    for path, size in PNG_OUTPUTS.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        resize_icon(master, size).save(path, optimize=True)
    master.save(
        INSTALLER_ICON,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
