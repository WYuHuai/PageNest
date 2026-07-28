from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "pagenest-icon-1024.png"
OUTPUT = ROOT / "store" / "assets"


def _background(size: tuple[int, int]) -> Image.Image:
    width, height = size
    top, bottom = (13, 16, 32), (35, 37, 84)
    rows = Image.new("RGB", (1, height))
    for y in range(height):
        ratio = y / max(height - 1, 1)
        rows.putpixel((0, y), tuple(round(a + (b - a) * ratio) for a, b in zip(top, bottom)))
    image = rows.resize(size)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((-width // 5, -height, width // 2, height), fill=(124, 108, 255, 70))
    draw.ellipse((width * 2 // 3, -height // 2, width * 4 // 3, height), fill=(69, 199, 255, 48))
    return image.convert("RGBA")


def _promo(icon: Image.Image, size: tuple[int, int], icon_size: int) -> Image.Image:
    image = _background(size)
    icon = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    position = ((size[0] - icon_size) // 2, (size[1] - icon_size) // 2)
    image.alpha_composite(icon, position)
    return image


def build_assets() -> list[Path]:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as source:
        icon = source.convert("RGBA")
    outputs = {
        "icon-128.png": icon.resize((128, 128), Image.Resampling.LANCZOS),
        "promo-small-440x280.png": _promo(icon, (440, 280), 176),
        "promo-marquee-1400x560.png": _promo(icon, (1400, 560), 360),
    }
    paths = []
    for name, image in outputs.items():
        path = OUTPUT / name
        image.save(path, optimize=True)
        paths.append(path)
    return paths


if __name__ == "__main__":
    for asset in build_assets():
        print(asset)
