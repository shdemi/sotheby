"""
Pre-scales the resonance pattern glyphs for the OG card.

`images/shape_pattern/<shape>/<pattern>.png` is 170x170 or 170x114, and the card draws it
in a 44x44 box. Satori hands the image to resvg, whose plain bilinear downscale samples
~1 pixel in 16 at that ratio and drops the glyph's 1px strokes, so the Discord preview
showed a chewed-up icon. Scaling here with LANCZOS gives satori a 44px-wide file it can
draw 1:1.

    python scripts/og/pattern-icons.py

Re-run after `npm run sync:assets` brings new pattern art; `npm run sync:verify` checks
that every icon the data names has a pre-scaled copy.
"""
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "images" / "shape_pattern"
OUT = ROOT / "assets" / "og" / "pattern"
BOX = 44


def main() -> int:
    if not SRC.is_dir():
        print(f"missing {SRC}", file=sys.stderr)
        return 1
    written = 0
    for path in sorted(SRC.rglob("*.png")):
        image = Image.open(path).convert("RGBA")
        width, height = image.size
        scale = min(BOX / width, BOX / height)
        size = (max(1, round(width * scale)), max(1, round(height * scale)))
        target = OUT / path.relative_to(SRC)
        target.parent.mkdir(parents=True, exist_ok=True)
        image.resize(size, Image.LANCZOS).save(target, optimize=True)
        written += 1
    print(f"wrote {written} pattern icons to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
