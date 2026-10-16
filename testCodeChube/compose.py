"""Ghép ảnh nhân vật lên background thành khung cố định 180x214 (giống Edited.png).

Công thức tái tạo được từ Edited.png (lệch trung bình 0.0011/255, lớn nhất 1/255):
    1. Canvas cố định 180 x 214, nền trong suốt.
    2. background.png (180x180) dán ở đáy canvas: canh giữa ngang, y = 214 - 180 = 34.
    3. Ảnh nhân vật giữ nguyên kích thước, canh giữa theo CẢ ẢNH và canh mép trên
       của ảnh vào mép trên canvas. Với ảnh 248x248 => dx=-34, dy=0, hai bên bị cắt.
       Không canh theo bbox nội dung: các frame animation cùng grid nhưng quầng alpha
       mờ khác nhau, canh theo nội dung sẽ làm nhân vật nhấp nhô.
    4. Bỏ 1 cột pixel ở mỗi mép canvas khi vẽ nhân vật (--char-inset 1), tương đương
       cắt nhân vật còn rộng 178 rồi canh giữa => khớp tuyệt đối với Edited.png.
    5. Dải đặc ở đáy background (hàng 169..179, tức canvas y 203..213) vẽ đè lên trên.

Mặc định chạy hàng loạt:
    python compose.py            # đọc mọi ảnh trong "needed to edit" -> results/<tên gốc>

Tuỳ chọn thường dùng:
    python compose.py -i "needed to edit" -o results
    python compose.py --verify Edited.png     # in độ lệch so với ảnh mẫu
    python compose.py --bg background.png     # chỉ định background
    python compose.py -h                      # xem hết tuỳ chọn
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover
    sys.exit("Thiếu Pillow. Cài bằng: pip install Pillow")

CANVAS_W, CANVAS_H = 180, 214
SCRIPT_DIR = Path(__file__).resolve().parent
INPUT_DIR = SCRIPT_DIR / "needed to edit"
OUTPUT_DIR = SCRIPT_DIR / "results"
IMAGE_EXTS = {".png", ".webp", ".jpg", ".jpeg", ".jpe", ".jfif", ".bmp", ".tif", ".tiff", ".gif"}
BG_KEYWORDS = ("background", "backdrop", "bg", "nen", "nền")
SKIP_KEYWORDS = ("edited", "result", "output")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Ghép ảnh nhân vật lên background, xuất khung 180x214.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("characters", nargs="*", type=Path,
                   help="Ảnh cụ thể cần xử lý. Bỏ trống = lấy mọi ảnh trong --in.")
    p.add_argument("-i", "--in", dest="in_dir", type=Path, default=INPUT_DIR,
                   help="Thư mục chứa ảnh cần edit (mặc định: 'needed to edit' cạnh script).")
    p.add_argument("-o", "--out", type=Path, default=OUTPUT_DIR,
                   help="Thư mục xuất kết quả (mặc định: 'results' cạnh script).")
    p.add_argument("-b", "--bg", "--background", dest="bg", type=Path, default=None,
                   help="Ảnh background. Bỏ trống = tự tìm file có tên chứa 'background'/'bg'.")
    p.add_argument("--no-bg", action="store_true", help="Không dùng background (nền trong suốt).")
    p.add_argument("--suffix", default="",
                   help="Hậu tố tên file kết quả. Mặc định rỗng = giữ nguyên tên gốc.")
    p.add_argument("-W", "--width", type=int, default=CANVAS_W, help="Chiều rộng canvas.")
    p.add_argument("-H", "--height", type=int, default=CANVAS_H, help="Chiều cao canvas.")
    p.add_argument("--anchor", choices=("grid", "each", "content"), default="grid",
                   help="grid = canh 1 lần theo ảnh tham chiếu rồi áp cho mọi frame cùng size "
                        "(khuyến nghị cho chuỗi animation); each = canh riêng từng ảnh theo "
                        "--h-align/--v-align; content = luôn canh riêng theo vùng nội dung.")
    p.add_argument("--reference", type=Path, default=None,
                   help="Ảnh tham chiếu để tính offset ở chế độ grid. Mặc định ảnh đầu tiên.")
    p.add_argument("--h-align", choices=("content", "image"), default="image",
                   help="Canh ngang: theo cả ảnh hay theo vùng nội dung (bbox alpha).")
    p.add_argument("--v-align", choices=("content", "image"), default="image",
                   help="Canh dọc: mép trên cả ảnh (hoặc của nội dung) vào mép trên canvas.")
    p.add_argument("--alpha-threshold", type=int, default=0,
                   help="Ngưỡng alpha (0-255) để coi là nội dung khi tự canh.")
    p.add_argument("--dx", type=int, default=None, help="Ghi đè offset ngang của nhân vật.")
    p.add_argument("--dy", type=int, default=None, help="Ghi đè offset dọc của nhân vật.")
    p.add_argument("--char-inset", type=int, default=1,
                   help="Số cột pixel để trống ở mỗi mép canvas khi vẽ nhân vật (1 = như Edited.png).")
    p.add_argument("--bg-anchor", choices=("bottom", "top", "center"), default="bottom",
                   help="Vị trí dán background theo chiều dọc.")
    p.add_argument("--bg-footer", choices=("auto", "on", "off"), default="auto",
                   help="Vẽ dải đặc đáy background đè lên nhân vật ('auto' = tự nhận diện).")
    p.add_argument("--footer-alpha", type=int, default=250,
                   help="Ngưỡng alpha để nhận diện dải đặc ở đáy background.")
    p.add_argument("--scale", type=float, default=1.0, help="Tỉ lệ phóng/thu ảnh nhân vật.")
    p.add_argument("--bg-scale", type=float, default=1.0, help="Tỉ lệ phóng/thu background.")
    p.add_argument("--verify", type=Path, default=None,
                   help="So sánh kết quả với 1 ảnh mẫu và in độ lệch.")
    p.add_argument("--exclude", nargs="*", default=list(SKIP_KEYWORDS),
                   help="Từ khoá loại trừ khi quét ảnh cần edit.")
    return p.parse_args(argv)


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as im:
        return im.convert("RGBA")


def scale_image(img: Image.Image, factor: float) -> Image.Image:
    if factor == 1.0:
        return img
    return img.resize((max(1, round(img.width * factor)), max(1, round(img.height * factor))),
                      Image.LANCZOS)


def content_bbox(img: Image.Image, threshold: int) -> tuple[int, int, int, int]:
    """Bounding box (left, top, right, bottom) của vùng alpha > threshold."""
    alpha = img.getchannel("A")
    mask = alpha.point(lambda v: 255 if v > threshold else 0)
    return mask.getbbox() or (0, 0, img.width, img.height)


def find_background(folder: Path, explicit: Path | None) -> Path | None:
    if explicit is not None:
        return explicit
    for candidate_dir in (folder, Path.cwd(), SCRIPT_DIR):
        if not candidate_dir.is_dir():
            continue
        candidates = sorted(
            p for p in candidate_dir.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS
            and any(k in p.stem.lower() for k in BG_KEYWORDS)
        )
        if candidates:
            return candidates[0]
    return None


def collect_characters(in_dir: Path, explicit: list[Path], bg_path: Path | None,
                       exclude: list[str]) -> list[Path]:
    if explicit:
        return list(explicit)
    if not in_dir.is_dir():
        return []
    skip = [e.lower() for e in exclude if e]
    bg_resolved = bg_path.resolve() if bg_path else None
    found = []
    for p in sorted(in_dir.iterdir()):
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
            continue
        if bg_resolved is not None and p.resolve() == bg_resolved:
            continue
        if any(k in p.stem.lower() for k in skip):
            continue
        found.append(p)
    return found


def footer_band(bg: Image.Image, threshold: int) -> tuple[Image.Image, int] | None:
    """Dải đặc liền mạch ở đáy background (mọi cột đều có alpha >= threshold)."""
    alpha = bg.getchannel("A")
    px = alpha.load()
    start = bg.height
    for y in range(bg.height - 1, -1, -1):
        if all(px[x, y] >= threshold for x in range(bg.width)):
            start = y
        else:
            break
    if start >= bg.height:
        return None
    return bg.crop((0, start, bg.width, bg.height)), start


def background_offset(canvas_w: int, canvas_h: int, bg: Image.Image, anchor: str) -> tuple[int, int]:
    x = (canvas_w - bg.width) // 2
    if anchor == "bottom":
        y = canvas_h - bg.height
    elif anchor == "top":
        y = 0
    else:
        y = (canvas_h - bg.height) // 2
    return x, y


def character_offset(canvas_w: int, char: Image.Image, args: argparse.Namespace) -> tuple[int, int]:
    mode_h = "content" if args.anchor == "content" else args.h_align
    mode_v = "content" if args.anchor == "content" else args.v_align
    left, top, right, _ = content_bbox(char, args.alpha_threshold)
    dx = round(canvas_w / 2 - (left + right) / 2) if mode_h == "content" \
        else (canvas_w - char.width) // 2
    dy = -top if mode_v == "content" else 0
    return (args.dx if args.dx is not None else dx, args.dy if args.dy is not None else dy)


def apply_char_inset(char: Image.Image, dx: int, canvas_w: int, inset: int) -> Image.Image:
    """Xoá alpha ở các cột nhân vật rơi vào `inset` pixel ngoài cùng mỗi mép canvas."""
    if inset <= 0:
        return char
    keep_lo = max(0, min(char.width, inset - dx))
    keep_hi = max(0, min(char.width, canvas_w - inset - dx))
    if keep_lo == 0 and keep_hi == char.width:
        return char
    mask = Image.new("L", char.size, 0)
    if keep_hi > keep_lo:
        mask.paste(255, (keep_lo, 0, keep_hi, char.height))
    r, g, b, _ = char.split()
    return Image.merge("RGBA", (r, g, b, ImageChops.multiply(char.getchannel("A"), mask)))


def resolve_offset(char_path: Path, args: argparse.Namespace,
                   grid_offsets: dict[tuple[int, int], tuple[int, int]]) -> tuple[int, int]:
    char = scale_image(load_rgba(char_path), args.scale)
    cached = grid_offsets.get(char.size)
    if cached is not None and args.dx is None and args.dy is None:
        return cached
    return character_offset(args.width, char, args)


def compose(char_path: Path, background: Image.Image | None, offset: tuple[int, int],
            args: argparse.Namespace) -> Image.Image:
    canvas = Image.new("RGBA", (args.width, args.height), (0, 0, 0, 0))

    footer = None
    if background is not None:
        bg = scale_image(background, args.bg_scale)
        bx, by = background_offset(args.width, args.height, bg, args.bg_anchor)
        canvas.alpha_composite(bg, (bx, by))
        band = footer_band(bg, args.footer_alpha)
        if band is not None and args.bg_footer != "off" and (args.bg_footer == "on" or band[1] > 0):
            footer = (band[0], bx, by + band[1])

    dx, dy = offset
    char = apply_char_inset(scale_image(load_rgba(char_path), args.scale), dx, args.width,
                            args.char_inset)
    canvas.alpha_composite(char, (dx, dy))

    if footer is not None:
        canvas.alpha_composite(footer[0], (footer[1], footer[2]))
    return canvas


def report_diff(result: Image.Image, reference: Path) -> None:
    ref = load_rgba(reference)
    if ref.size != result.size:
        print(f"    verify: kích thước khác nhau ({ref.size} vs {result.size}) -> bỏ qua")
        return
    try:
        import numpy as np
    except ImportError:
        print("    verify: cần numpy để so sánh chi tiết")
        return
    diff = abs(np.asarray(result, dtype=int) - np.asarray(ref, dtype=int))
    print(f"    verify vs {reference.name}: lệch trung bình {diff.mean():.4f}/255, "
          f"lệch lớn nhất {diff.max()}/255, pixel lệch >3: {(diff.sum(axis=2) > 3).sum()}")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.in_dir.is_dir():
        search_dir = args.in_dir
    elif args.characters:
        search_dir = args.characters[0].parent
    else:
        print(f"Không thấy thư mục '{args.in_dir}'. Tạo nó hoặc dùng -i <thư mục>.", file=sys.stderr)
        return 1

    background_path = None if args.no_bg else find_background(search_dir, args.bg)
    if not args.no_bg and background_path is None:
        print(f"Cảnh báo: không tìm thấy background -> chỉ ghép nhân vật.", file=sys.stderr)
    background = load_rgba(background_path) if background_path else None

    characters = collect_characters(search_dir, args.characters, background_path, args.exclude)
    if not characters:
        print(f"Không có ảnh nào để xử lý trong {search_dir.resolve()}.", file=sys.stderr)
        return 1

    grid_offsets: dict[tuple[int, int], tuple[int, int]] = {}
    if args.anchor == "grid" and args.dx is None and args.dy is None:
        ref_path = args.reference or characters[0]
        ref_img = scale_image(load_rgba(ref_path), args.scale)
        ref_offset = character_offset(args.width, ref_img, args)
        grid_offsets[ref_img.size] = ref_offset
        print(f"Canh theo grid từ {ref_path.name} {ref_img.size}: "
              f"dx={ref_offset[0]}, dy={ref_offset[1]}")

    args.out.mkdir(parents=True, exist_ok=True)
    ok = 0
    for char_path in characters:
        if not char_path.is_file():
            print(f"Bỏ qua (không tồn tại): {char_path}", file=sys.stderr)
            continue
        try:
            offset = resolve_offset(char_path, args, grid_offsets)
            canvas = compose(char_path, background, offset, args)
        except Exception as exc:  # noqa: BLE001 - báo lỗi từng file, không dừng cả batch
            print(f"LỖI {char_path.name}: {exc}", file=sys.stderr)
            continue
        out_path = args.out / f"{char_path.stem}{args.suffix}.png"
        canvas.save(out_path)
        ok += 1
        src = background_path.name if background is not None else "không nền"
        print(f"{char_path.name} -> {out_path.as_posix()}  [dx={offset[0]}, dy={offset[1]}, "
              f"+ {src}, {args.width}x{args.height}]")
        if args.verify is not None:
            report_diff(canvas, args.verify)

    print(f"\nXong: {ok}/{len(characters)} ảnh -> {args.out.as_posix()}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
