#!/usr/bin/env python3
"""Prüft alle internen Links und Anker der statischen Website.

Läuft über das Dateisystem, ohne Server: jede *.html wird gelesen, jedes
href/src mit lokalem Ziel wird gegen die vorhandenen Dateien geprüft.
Anker (#id) werden gegen die IDs der Zieldatei geprüft, wobei IDs, die
erst per JavaScript eingefügt werden, als Ausnahme gelten können.

Aufruf: python3 tools/qa-links.py
"""
import glob
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Ziele, die absichtlich nicht als Datei existieren (externe Dienste, Platzhalter).
ALLOW_MISSING = ("mailto:", "tel:", "data:", "javascript:", "#")

# Seiten, deren Inhalte vollständig per JS entstehen.
JS_ONLY_ANCHORS = {
    "neon-horde/dist/index.html",
}

SKIP_DIRS = {".git", "node_modules", "vendor", "tools"}


class Collector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []          # (tag, attribut, wert)
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if a.get("name"):
            self.ids.add(a["name"])
        for attr in ("href", "src"):
            value = a.get(attr)
            if value:
                self.links.append((tag, attr, value.strip()))


def html_files():
    out = []
    for path in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
        rel = os.path.relpath(path, ROOT)
        if any(part in SKIP_DIRS for part in rel.split(os.sep)):
            continue
        out.append(rel)
    return sorted(out)


def parse(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        c = Collector()
        c.feed(fh.read())
        return c


def main():
    files = html_files()
    cache = {rel: parse(rel) for rel in files}
    problems = []
    checked = 0

    for rel in files:
        base_dir = os.path.dirname(rel)
        for tag, attr, value in cache[rel].links:
            if value.startswith(ALLOW_MISSING) or value.startswith("//"):
                continue
            parts = urlsplit(value)
            if parts.scheme in ("http", "https", "mailto", "tel", "data", "javascript"):
                continue

            target = parts.path
            frag = parts.query if parts.query.startswith("id=") else parts.fragment
            checked += 1

            if target:
                # Absolute Pfade ("/.well-known/...") lösen ab Wurzel auf.
                root_relative = target.startswith("/")
                dest = os.path.normpath(
                    os.path.join(ROOT if root_relative else base_dir, target.lstrip("/"))
                )
                if dest.startswith(".."):
                    continue
                full = dest
                dest = os.path.relpath(dest, ROOT)
                if not os.path.exists(full):
                    # Verzeichnis-Links wie "neon-horde/" sind gültig, wenn index.html existiert.
                    if not (os.path.isdir(full) and os.path.exists(os.path.join(full, "index.html"))):
                        problems.append(f"{rel}: fehlt → {value}")
                        continue
                if os.path.isdir(full):
                    dest = os.path.join(dest, "index.html")
                    full = os.path.join(ROOT, dest)
                if not dest.endswith(".html"):
                    continue
                target_rel = os.path.normpath(dest).replace(os.sep, "/")
            else:
                target_rel = rel

            if frag and target_rel in cache and target_rel not in JS_ONLY_ANCHORS:
                if frag not in cache[target_rel].ids:
                    problems.append(f"{rel}: Anker #{frag} fehlt in {target_rel}")

    print(f"{len(files)} Dateien, {checked} interne Verweise geprüft")
    if problems:
        print(f"{len(problems)} Probleme:")
        for p in problems:
            print(" -", p)
        return 1
    print("Keine Probleme gefunden.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
