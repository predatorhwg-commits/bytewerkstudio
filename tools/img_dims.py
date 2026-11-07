#!/usr/bin/env python3
"""Ergänzt width/height an Bildern, denen die Maße fehlen.

Ohne Maße kennt der Browser das Seitenverhältnis erst nach dem Laden und
verschiebt dann den Text darunter (Layout-Sprung, CLS). Die Attribute
tragen das intrinsische Verhältnis; das CSS darf sie weiterhin
überschreiben. Das Werkzeug ist idempotent und ändert nur <img>-Tags,
deren Datei lokal auflösbar ist.

Aufruf:
  python3 tools/img_dims.py [--check]
"""
from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

IMG = re.compile(r"<img\b[^>]*>", re.I)
ATTR = re.compile(r'([a-zA-Z-]+)="([^"]*)"')


def size_of(path: Path):
    """Intrinsische Maße aus der Datei lesen, ohne Zusatzbibliothek."""
    suffix = path.suffix.lower()
    try:
        data = path.read_bytes()
    except OSError:
        return None

    if suffix == ".png" and data[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")

    if suffix in (".jpg", ".jpeg"):
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            length = int.from_bytes(data[i + 2:i + 4], "big")
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h = int.from_bytes(data[i + 5:i + 7], "big")
                w = int.from_bytes(data[i + 7:i + 9], "big")
                return w, h
            i += 2 + length
        return None

    if suffix == ".webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X":
            w = int.from_bytes(data[24:27], "little") + 1
            h = int.from_bytes(data[27:30], "little") + 1
            return w, h
        if chunk == b"VP8 ":
            w = int.from_bytes(data[26:28], "little") & 0x3FFF
            h = int.from_bytes(data[28:30], "little") & 0x3FFF
            return w, h
        if chunk == b"VP8L":
            bits = int.from_bytes(data[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        return None

    if suffix == ".gif" and data[:6] in (b"GIF87a", b"GIF89a"):
        return int.from_bytes(data[6:8], "little"), int.from_bytes(data[8:10], "little")

    if suffix == ".svg":
        head = data[:2000].decode("utf-8", "ignore")
        vb = re.search(r'viewBox="([^"]+)"', head)
        if vb:
            parts = re.split(r"[\s,]+", vb.group(1).strip())
            if len(parts) == 4:
                return round(float(parts[2])), round(float(parts[3]))
        w = re.search(r'\bwidth="([0-9.]+)(px)?"', head)
        h = re.search(r'\bheight="([0-9.]+)(px)?"', head)
        if w and h:
            return round(float(w.group(1))), round(float(h.group(1)))
    return None


def fix_tag(tag: str):
    attrs = dict(ATTR.findall(tag))
    if "width" in attrs and "height" in attrs:
        return tag, False
    src = attrs.get("src", "")
    if not src or src.startswith(("http:", "https:", "//", "data:")):
        return tag, False
    target = (ROOT / src.lstrip("./")).resolve()
    if not target.is_file():
        return tag, False
    dims = size_of(target)
    if not dims:
        return tag, False
    w, h = dims
    new = tag
    if "width" not in attrs:
        new = new[:-1] + f' width="{w}">'
    if "height" not in attrs:
        new = new[:-1] + f' height="{h}">'
    return new, True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    changed_pages = 0
    changed_imgs = 0
    missing = []
    for path in sorted(ROOT.glob("*.html")):
        if path.name in SKIP:
            continue
        html = path.read_text(encoding="utf-8")
        count = 0

        def repl(m):
            nonlocal count
            new, changed = fix_tag(m.group(0))
            if changed:
                count += 1
            return new

        new_html = IMG.sub(repl, html)
        if count:
            changed_pages += 1
            changed_imgs += count
            if not args.check:
                path.write_text(new_html, encoding="utf-8")
            print(f"{path.name}: {count} Bild(er) ergänzt")

    # Reste melden: Bilder, die auch nach dem Lauf keine Maße haben.
    for path in sorted(ROOT.glob("*.html")):
        if path.name in SKIP:
            continue
        for m in IMG.finditer(path.read_text(encoding="utf-8")):
            tag = m.group(0)
            attrs = dict(ATTR.findall(tag))
            if "width" not in attrs or "height" not in attrs:
                missing.append(f"{path.name}: {attrs.get('src', '?')}")

    print(f"IMG_DIMS {changed_imgs} Bilder auf {changed_pages} Seiten"
          + (" (Prüflauf)" if args.check else ""))
    if missing:
        print("ohne Maße geblieben:")
        for m in missing[:10]:
            print("  " + m)
    return 1 if (args.check and changed_imgs) else 0


if __name__ == "__main__":
    raise SystemExit(main())
