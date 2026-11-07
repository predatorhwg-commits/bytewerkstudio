#!/usr/bin/env python3
"""Ergaenzt Sprunglink und main-Landmarke, wo sie fehlen.

Warum: ohne Sprunglink muss jede Tastaturnutzerin auf jeder Seite erst durch
die gesamte Navigation tabben. Ohne <main> kann die Vorlesehilfe den Inhalt
nicht direkt anspringen.

Aufruf aus dem Wurzelverzeichnis:

    python3 tools/a11y-landmarks.py [--dry]

Idempotent: bereits vorhandene Markup-Teile bleiben unangetastet.
"""
from __future__ import annotations

import glob
import re
import sys

SKIP = '<a class="skip-link" href="#main" data-en="Skip to content" data-es="Ir al contenido">Zum Inhalt springen</a>'
HEADER = '<div data-include="header"></div>'
FOOTER = '<div data-include="footer"></div>'


def main() -> None:
    dry = "--dry" in sys.argv
    pages = [f for f in sorted(glob.glob("*.html")) if not f.startswith("google")]

    added_skip = added_main = skipped = 0

    for page in pages:
        html = open(page, encoding="utf-8").read()
        before = html

        if 'class="skip-link"' not in html:
            # direkt nach <body>, damit er das erste fokussierbare Element ist
            html = re.sub(r"(<body[^>]*>)", r"\1\n" + SKIP, html, count=1)

        if "<main" not in html:
            if HEADER in html and FOOTER in html:
                html = html.replace(HEADER, HEADER + "\n\n<main id=\"main\">", 1)
                html = html.replace(FOOTER, "</main>\n" + FOOTER, 1)
                added_main += 1
            else:
                skipped += 1

        if html != before:
            if 'class="skip-link"' in html and 'class="skip-link"' not in before:
                added_skip += 1
            if not dry:
                open(page, "w", encoding="utf-8").write(html)

    print(f"Sprunglink ergaenzt: {added_skip} | main ergaenzt: {added_main} | ohne Struktur: {skipped}")
    if dry:
        print("(Trockenlauf, nichts geschrieben)")


if __name__ == "__main__":
    main()
