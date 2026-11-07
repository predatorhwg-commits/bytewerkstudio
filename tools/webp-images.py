#!/usr/bin/env python3
"""Erzeugt WebP-Varianten (800w / 1200w / Original) fuer grosse Bilder.

Warum: die JPG/PNG-Fassungen sind fuer ihre Anzeigeflaeche zu gross.
Ein Bild, das mit 622 CSS-Pixeln dargestellt wird, braucht bei 2-facher
Pixeldichte rund 1244 Pixel — nicht 1672. WebP spart zusaetzlich.

Aufruf aus dem Wurzelverzeichnis:

    python3 tools/webp-images.py media/mastil-start-bg.jpg
    python3 tools/webp-images.py --quality 90 media/keyforge-vault-dashboard.png

Qualitaet: 76 fuer Fotos, 90 fuer Screenshots mit Schrift. Die Werte sind
gemessen, nicht geraten — bei q76 liegt die mittlere Pixelabweichung unter
3 von 255, bei q90 unter 1. Hoehere Werte kosten deutlich mehr Bytes,
ohne sichtbar besser zu werden.

Schreibt `<name>-800w.webp`, `<name>-1200w.webp` und `<name>.webp`.
"""
from __future__ import annotations

import os
import sys

from PIL import Image

WIDTHS = (800, 1200)


def build(path: str, quality: int) -> list[tuple[str, int, int, int]]:
    image = Image.open(path).convert("RGB")
    base = os.path.splitext(path)[0]
    out = []

    for width in WIDTHS:
        if image.width <= width:
            continue
        height = round(image.height * width / image.width)
        target = f"{base}-{width}w.webp"
        image.resize((width, height), Image.LANCZOS).save(
            target, "WEBP", quality=quality, method=6,
        )
        out.append((target, width, height, os.path.getsize(target)))

    target = f"{base}.webp"
    image.save(target, "WEBP", quality=quality, method=6)
    out.append((target, image.width, image.height, os.path.getsize(target)))
    return out


def main() -> None:
    args = sys.argv[1:]
    quality = 76
    if args[:1] == ["--quality"]:
        quality = int(args[1])
        args = args[2:]
    if not args:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    for path in args:
        if not os.path.exists(path):
            print(f"fehlt: {path}")
            continue
        before = os.path.getsize(path)
        source = Image.open(path)
        print(f"\n{path}  ({before // 1024} KB, {source.size[0]} px, q{quality})")
        for target, width, height, size in build(path, quality):
            saved = 100 - size * 100 // before
            print(f"  {target:46} {width:5}x{height:<5} {size // 1024:4} KB  ({saved:+3} %)")


if __name__ == "__main__":
    main()
