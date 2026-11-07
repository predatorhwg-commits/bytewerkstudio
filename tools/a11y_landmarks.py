#!/usr/bin/env python3
"""Ergänzt Sprungmarke und <main>-Landmarke auf Seiten, denen sie fehlen.

Regel: `<main id="main">` umschließt alles zwischen Header- und Footer-
Include. Die Sprungmarke steht direkt nach <body>. Beides ist idempotent:
bereits vorhandene Markierungen bleiben unverändert.

Aufruf:
  python3 tools/a11y_landmarks.py [--check]
"""
from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

SKIP_LINK = ('<a class="skip-link" href="#main" data-en="Skip to content">'
             'Zum Inhalt springen</a>')


def transform(html: str) -> tuple[str, list[str]]:
    changes = []

    # 1. Vorhandene <main>-Landmarke bekommt die Sprungziel-ID.
    if "<main" in html and not re.search(r'<main[^>]*\bid="main"', html):
        html = re.sub(r"<main(\s|>)", r'<main id="main"\1', html, count=1)
        changes.append("main-id")

    # 2. Sonst alles zwischen Header und Footer umschließen.
    if "<main" not in html:
        header = re.search(r'<div data-include="header"></div>', html)
        footer = re.search(r'<div data-include="footer"></div>', html)
        if header and footer and header.end() < footer.start():
            html = (html[:header.end()] + '\n\n<main id="main">' + html[header.end():footer.start()]
                    + '</main>\n\n' + html[footer.start():])
            changes.append("main")

    # 3. Sprungmarke nur setzen, wenn es ein Ziel gibt.
    if 'class="skip-link"' not in html and 'id="main"' in html:
        m = re.search(r"<body[^>]*>", html)
        if m:
            html = html[:m.end()] + "\n\n" + SKIP_LINK + html[m.end():]
            changes.append("Sprungmarke")
    return html, changes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="Nur prüfen, nichts schreiben")
    args = ap.parse_args()

    rows = []
    for path in sorted(ROOT.glob("*.html")):
        if path.name in SKIP:
            continue
        html = path.read_text(encoding="utf-8")
        new, changes = transform(html)
        rows.append((path.name, changes))
        if changes and not args.check:
            path.write_text(new, encoding="utf-8")
        print(f"{path.name}: {', '.join(changes) if changes else 'unverändert'}")
    changed = sum(1 for _, c in rows if c)
    print(f"LANDMARKS {changed} Seiten geändert" + (" (Prüflauf)" if args.check else ""))
    return 1 if (args.check and changed) else 0


if __name__ == "__main__":
    raise SystemExit(main())
