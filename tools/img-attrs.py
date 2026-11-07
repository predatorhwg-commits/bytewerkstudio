#!/usr/bin/env python3
"""Bild-Attribute ergänzen: width/height (echte Maße), loading, decoding.

Ohne width/height springt das Layout beim Laden (CLS), ohne loading="lazy"
lädt der Browser Bilder außerhalb des Viewports mit. Das Skript liest die
echten Maße aus der Datei und rührt Bilder nicht an, die schon Attribute
haben. Das erste Bild einer Seite bleibt eager, damit das LCP nicht leidet.

Aufruf: python3 tools/img-attrs.py [--write]
"""
import re
import sys
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
WRITE = "--write" in sys.argv
SIZE_CACHE = {}
IMG = re.compile(r'<img\b[^>]*>', re.I)

report = {"patched": 0, "sized": 0, "lazy": 0, "missing": [], "pages": 0}


def size_of(src: str):
    if src in SIZE_CACHE:
        return SIZE_CACHE[src]
    if re.match(r'^(https?:|data:)', src):
        SIZE_CACHE[src] = None
        return None
    path = ROOT / src.split("?")[0]
    try:
        with Image.open(path) as im:
            size = im.size
    except Exception:
        size = None
        if path.suffix == ".svg":
            try:
                head = path.read_text(encoding="utf-8")[:600]
                vb = re.search(r'viewBox="\s*[\d.-]+[,\s]+[\d.-]+[,\s]+([\d.]+)[,\s]+([\d.]+)', head)
                if vb:
                    size = (int(float(vb.group(1))), int(float(vb.group(2))))
            except Exception:
                size = None
    SIZE_CACHE[src] = size
    return size


for page in sorted(ROOT.glob("*.html")):
    if page.name.startswith("google"):
        continue
    src_text = page.read_text(encoding="utf-8")
    first = [True]

    def patch(m):
        tag = m.group(0)
        src_m = re.search(r'\bsrc="([^"]+)"', tag)
        if not src_m:
            return tag
        src = src_m.group(1)
        is_first = first[0]
        first[0] = False
        new = tag
        size = size_of(src)
        if size and not re.search(r'\bwidth=', new) and not re.search(r'\bheight=', new):
            new = new[:-1] + f' width="{size[0]}" height="{size[1]}"' + ">"
            report["sized"] += 1
        if "loading=" not in new:
            new = new[:-1] + ('' if is_first else ' loading="lazy"') + ">"
            if not is_first:
                report["lazy"] += 1
        if "decoding=" not in new:
            new = new[:-1] + ' decoding="async"' + ">"
        if not size:
            report["missing"].append(f"{page.name}: {src}")
        if new != tag:
            report["patched"] += 1
        return new

    out = IMG.sub(patch, src_text)
    report["pages"] += 1
    if WRITE and out != src_text:
        page.write_text(out, encoding="utf-8")

print(("GESCHRIEBEN" if WRITE else "DRY RUN"))
print(f"Seiten: {report['pages']} · geänderte img-Tags: {report['patched']}")
print(f"width/height ergänzt: {report['sized']} · lazy ergänzt: {report['lazy']}")
if report["missing"]:
    print("ohne Maß (externe oder fehlende Datei):", len(report["missing"]))
    for m in report["missing"][:10]:
        print("  ", m)
