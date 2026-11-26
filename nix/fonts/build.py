import base64
import sys
from pathlib import Path

from fontTools import subset

LATIN = [
    (0x0020, 0x024F),
    (0x0370, 0x03FF),
    (0x2000, 0x206F),
    (0x2070, 0x209F),
    (0x20A0, 0x20CF),
    (0x2100, 0x214F),
    (0x2190, 0x21FF),
    (0x2200, 0x22FF),
]
HANGUL = [
    (0x1100, 0x11FF),
    (0x3000, 0x303F),
    (0x3131, 0x318E),
    (0xAC00, 0xD7A3),
    (0xFF01, 0xFF5E),
]


def ks_x_1001() -> list[int]:
    syllables = []
    for c in range(0xAC00, 0xD7A4):
        try:
            chr(c).encode("euc_kr")
        except UnicodeEncodeError:
            continue
        syllables.append(c)
    return syllables


def expand(ranges: list[tuple[int, int]]) -> list[int]:
    return [c for lo, hi in ranges for c in range(lo, hi + 1)]


def unicode_range(ranges: list[tuple[int, int]]) -> str:
    return ", ".join(f"U+{lo:04X}-{hi:04X}" for lo, hi in ranges)


def make_woff2(src: str, index: int, codepoints: list[int], dest: Path) -> bytes:
    options = subset.Options()
    options.flavor = "woff2"
    options.font_number = index
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.hinting = False
    font = subset.load_font(src, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    subset.save_font(font, str(dest), options)
    return dest.read_bytes()


def main() -> None:
    maru_regular, maru_bold, serif_dir, d2coding, out = sys.argv[1:6]
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    mono_ranges = [
        (0x0020, 0x00FF),
        (0x2190, 0x21FF),
        (0x2500, 0x257F),
        (0x3131, 0x318E),
    ]
    mono_points = expand(mono_ranges) + ks_x_1001()
    faces = [
        ("MaruBuri", 400, "normal", maru_regular, 0, HANGUL),
        ("MaruBuri", 700, "normal", maru_bold, 0, HANGUL),
        (
            "Source Serif 4",
            400,
            "normal",
            f"{serif_dir}/SourceSerif4-Regular.ttf",
            0,
            LATIN,
        ),
        ("Source Serif 4", 400, "italic", f"{serif_dir}/SourceSerif4-It.ttf", 0, LATIN),
        (
            "Source Serif 4",
            700,
            "normal",
            f"{serif_dir}/SourceSerif4-Bold.ttf",
            0,
            LATIN,
        ),
        (
            "Source Serif 4",
            700,
            "italic",
            f"{serif_dir}/SourceSerif4-BoldIt.ttf",
            0,
            LATIN,
        ),
        ("D2Coding", 400, "normal", d2coding, 0, None),
        ("D2Coding", 700, "normal", d2coding, 1, None),
    ]
    rules = []
    for family, weight, style, src, index, ranges in faces:
        points = expand(ranges) if ranges else mono_points
        name = f"{family.replace(' ', '')}-{weight}-{style}.woff2"
        data = make_woff2(src, index, points, out_dir / name)
        encoded = base64.b64encode(data).decode()
        lines = [
            "@font-face {",
            f'  font-family: "{family}";',
            f"  font-weight: {weight};",
            f"  font-style: {style};",
            "  font-display: swap;",
            f'  src: url("data:font/woff2;base64,{encoded}") format("woff2");',
        ]
        if ranges:
            lines.append(f"  unicode-range: {unicode_range(ranges)};")
        lines.append("}")
        rules.append("\n".join(lines))
        print(f"{name}: {len(data) // 1024} KiB")
    (out_dir / "fonts.css").write_text("\n".join(rules) + "\n")


if __name__ == "__main__":
    main()
