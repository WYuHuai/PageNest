from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "extension" / "icons"
DOCS_DIR = ROOT / "docs" / "assets"
CANVAS = 1024


def gradient(size: int, start: tuple[int, int, int], end: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            amount = (x + y) / (2 * (size - 1))
            pixels[x, y] = tuple(
                round(left + (right - left) * amount)
                for left, right in zip(start, end)
            )
    return image


def build_master() -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))

    background_mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(background_mask).rounded_rectangle(
        (52, 52, 972, 972),
        radius=220,
        fill=255,
    )
    background = gradient(CANVAS, (29, 38, 80), (8, 12, 28)).convert("RGBA")
    image.alpha_composite(Image.composite(background, Image.new("RGBA", image.size), background_mask))

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (76, 76, 948, 948),
        radius=196,
        outline=(255, 255, 255, 20),
        width=8,
    )

    mark_mask = Image.new("L", image.size, 0)
    mark = ImageDraw.Draw(mark_mask)
    mark.polygon(
        [
            (246, 200),
            (342, 200),
            (342, 448),
            (682, 448),
            (682, 200),
            (778, 200),
            (778, 824),
            (730, 784),
            (682, 824),
            (682, 560),
            (342, 560),
            (342, 824),
            (246, 824),
        ],
        fill=255,
    )
    mark_gradient = gradient(CANVAS, (169, 149, 255), (69, 215, 242)).convert("RGBA")
    image.alpha_composite(Image.composite(mark_gradient, Image.new("RGBA", image.size), mark_mask))
    draw.rectangle((342, 448, 682, 560), fill=(234, 243, 255, 245))
    return image


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    master = build_master()
    for size in (16, 32, 48, 128):
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            ICON_DIR / f"icon{size}.png",
            optimize=True,
        )
    master.resize((256, 256), Image.Resampling.LANCZOS).save(
        DOCS_DIR / "hermes-icon-256.png",
        optimize=True,
    )


if __name__ == "__main__":
    main()
