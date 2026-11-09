"""Prepare the fonts the OG image renderer needs.

Satori (inside @vercel/og 0.6.x) only understands TTF/OTF/WOFF, so the fonts are
committed as TTF in ``assets/og/``:

- ``be-vietnam-pro-{400,700}.ttf``  Latin + full Vietnamese diacritics
- ``noto-sans-sc-{400,700}.ttf``    subset: only the glyphs the card can print

The CJK font is a 17 MB variable font upstream; it is instanced at 400/700 and
then subset to the Chinese names that actually appear on a card (arcanist and
psychube names plus the fixed CN labels below). Re-run after the roster or the
labels change:

    python scripts/og/fetch-fonts.py

Requires ``fonttools`` (``pip install fonttools``), which the repo already uses
for the data pipeline.
"""

from __future__ import annotations

import io
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "og"

FONTS = {
    "be-vietnam-pro-400.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/bevietnampro/BeVietnamPro-Regular.ttf",
    "be-vietnam-pro-700.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/bevietnampro/BeVietnamPro-Bold.ttf",
}
LICENSES = {
    "OFL-BeVietnamPro.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/bevietnampro/OFL.txt",
    "OFL-NotoSansSC.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt",
}
CJK_SOURCE = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"

# Fixed labels the CN card can print. Keep in sync with api/_lib/og/labels.mjs and
# api/_lib/og/cards.mjs (footer + default-card lines are written in the card module).
CJK_LABELS = [
    "培养指南",
    "手提箱",
    "有资料",
    "角色",
    "心相",
    "共鸣",
    "队伍",
    "攻略",
    "暂无推荐",
    "名角色",
]

# UI strings the cards read from content/i18n.json.
I18N_KEYS = ["card.portrait", "card.resonance", "builds.psychubes", "og.teamBuild", "og.noBuild", "og.members"]
I18N_PREFIXES = ("afflatus.", "pattern.")


def download(url: str) -> bytes:
    print(f"  fetch {url.rsplit('/', 1)[-1]}")
    req = urllib.request.Request(url, headers={"User-Agent": "sothebys-mansion-font-prep"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read()


def cjk_text() -> str:
    """Every character a card can print in Chinese."""
    chars: set[str] = set("".join(CJK_LABELS))

    arcanists = json.loads((ROOT / "data" / "ArcanistMap.json").read_text(encoding="utf-8"))
    for entry in arcanists:
        for value in (entry.get("name"), entry.get("nameEng")):
            if value:
                chars.update(str(value))

    psychubes = json.loads((ROOT / "data" / "psychube_id.json").read_text(encoding="utf-8"))
    for rows in psychubes.values():
        for row in rows:
            for value in (row.get("nameCN"), row.get("name")):
                if value:
                    chars.update(str(value))

    # The card labels come from content/i18n.json, so a translation edit is picked up
    # by the next run instead of silently rendering tofu.
    i18n = json.loads((ROOT / "content" / "i18n.json").read_text(encoding="utf-8"))
    cn = i18n.get("cn", {})
    for key in I18N_KEYS:
        chars.update(str(cn.get(key, "")))
    for key, value in cn.items():
        if key.startswith(I18N_PREFIXES):
            chars.update(str(value))

    # CJK ranges only; ASCII is covered by Be Vietnam Pro.
    return "".join(sorted(c for c in chars if ord(c) > 0x2E7F))



def main() -> int:
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
    except ImportError:
        print("fonttools is required: pip install fonttools", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)

    for name, url in FONTS.items():
        (OUT / name).write_bytes(download(url))
        print(f"  wrote {name}")

    for name, url in LICENSES.items():
        (OUT / name).write_bytes(download(url))

    text = cjk_text()
    print(f"  CJK subset: {len(text)} unique glyphs")

    print("  fetch NotoSansSC[wght].ttf")
    source = io.BytesIO(download(CJK_SOURCE))

    for weight in (400, 700):
        source.seek(0)
        font = TTFont(source)
        instanced = instancer.instantiateVariableFont(font, {"wght": weight})

        options = subset.Options()
        options.layout_features = []
        options.name_IDs = ["*"]
        options.notdef_outline = True
        options.recalc_bounds = True
        options.drop_tables += ["DSIG"]
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(text=text)
        subsetter.subset(instanced)

        target = OUT / f"noto-sans-sc-{weight}.ttf"
        instanced.flavor = None
        instanced.save(target)
        print(f"  wrote {target.name} ({(target.stat().st_size / 1024):.0f} KB)")

    for path in sorted(OUT.iterdir()):
        if path.suffix == ".ttf":
            print(f"  final {path.name} {(path.stat().st_size / 1024):.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
