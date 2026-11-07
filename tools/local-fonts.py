#!/usr/bin/env python3
"""Holt die selbst gehosteten Schriften aus den Google-CSS-Antworten.

Warum: `@import url(https://fonts.googleapis.com/...)` blockiert das Rendern,
kostet zwei zusaetzliche DNS/TLS-Verbindungen und uebertraegt bei jedem
Seitenaufruf die IP-Adresse an Google. Beides faellt weg, wenn die Dateien
lokal liegen und per `font-display: swap` geladen werden.

Aufruf (aus dem Wurzelverzeichnis):

    python3 tools/local-fonts.py /tmp/gf/a.css /tmp/gf/b.css

Schreibt `fonts/*.woff2` und `fonts/fonts.css`. Nur die Subsets `latin` und
`latin-ext` werden geladen — sie decken Deutsch, Englisch und Spanisch ab.
"""

from __future__ import annotations

import os
import re
import sys
import urllib.request

KEEP_SUBSETS = {"latin", "latin-ext"}
OUT_DIR = "fonts"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def parse(path: str) -> list[dict]:
    css = open(path, encoding="utf-8").read()
    blocks = []
    # Jeder @font-face-Block beginnt mit einem Kommentar, der das Subset nennt.
    for match in re.finditer(
        r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S
    ):
        subset, body = match.group(1), match.group(2)

        def field(name: str) -> str:
            m = re.search(rf"{name}:\s*([^;]+);", body)
            return m.group(1).strip() if m else ""

        url = re.search(r"url\((https://[^)]+)\)", body)
        if not url:
            continue
        blocks.append(
            {
                "subset": subset,
                "family": field("font-family").strip("'\""),
                "style": field("font-style") or "normal",
                "weight": field("font-weight") or "400",
                "display": field("font-display") or "swap",
                "range": field("unicode-range"),
                "url": url.group(1),
                "stretch": field("font-stretch"),
            }
        )
    return blocks


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python3 tools/local-fonts.py <google-css> [...]", file=sys.stderr)
        sys.exit(2)

    blocks = []
    for path in sys.argv[1:]:
        blocks.extend(parse(path))

    os.makedirs(OUT_DIR, exist_ok=True)
    lines = [
        "/* Selbst gehostete Schriften.",
        "   Erzeugt von tools/local-fonts.py aus den Google-CSS-Antworten.",
        "   Nur latin und latin-ext; das deckt DE, EN und ES ab. */",
        "",
    ]

    total = 0
    written = 0
    for block in blocks:
        if block["subset"] not in KEEP_SUBSETS:
            continue

        name = "-".join(
            filter(
                None,
                [
                    slug(block["family"]),
                    slug(block["weight"]),
                    block["subset"],
                ],
            )
        )
        target = os.path.join(OUT_DIR, name + ".woff2")

        if not os.path.exists(target):
            req = urllib.request.Request(block["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as response:
                data = response.read()
            with open(target, "wb") as handle:
                handle.write(data)
        size = os.path.getsize(target)
        total += size
        written += 1

        lines += [
            "@font-face {",
            f"  font-family: '{block['family']}';",
            f"  font-style: {block['style']};",
            f"  font-weight: {block['weight']};",
            "  font-display: swap;",
            f"  src: url('{name}.woff2') format('woff2');",
        ]
        if block["range"]:
            lines.append(f"  unicode-range: {block['range']};")
        lines += ["}", ""]
        print(f"{name:44} {size // 1024:4} KB")

    with open(os.path.join(OUT_DIR, "fonts.css"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))

    print(f"\n{written} Dateien · {total // 1024} KB · fonts/fonts.css")


if __name__ == "__main__":
    main()
