#!/usr/bin/env python3
"""Überführt Inline-Stile in eine CSS-Datei, damit `style-src 'self'` gilt.

Warum: `style="…"` im Markup zwingt die Content-Security-Policy zu
`style-src 'unsafe-inline'`. Damit darf jedes eingeschleuste Skript
beliebiges CSS setzen — etwa Formularfelder über deckende Flächen
unsichtbar machen oder per Attributselektor Eingaben abgreifen. Ohne
diese Ausnahme ist die Policy deutlich enger.

Was passiert:
- Jeder verschiedene Stilwert wird zu einer Klasse in styles-inline.css.
  Der Name ist aus Eigenschaft und Wert gebildet (u-mt-30px), damit man
  ihn im Markup lesen kann; bei Kollisionen kommt ein kurzer Hash dazu.
- Im HTML wird style="…" durch die Klasse ersetzt. Der Stil bleibt
  inhaltlich identisch; die Reihenfolge im Stylesheet entspricht der
  bisherigen Priorität (zuletzt geladen).
- Zwei <style>-Blöcke stehen in <noscript>. Sie werden zu einem
  <link> auf nojs.css: Bei aktivem JavaScript wird der Inhalt von
  <noscript> nicht geladen, ohne JavaScript schon.

Aufruf:
  python3 tools/csp_styles.py           # anwenden
  python3 tools/csp_styles.py --check   # nur prüfen (für die CI)
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = {"google3491bb2e3bfcb9d2.html"}
UTILITY_CSS = "styles-inline.css"
NOSCRIPT_CSS = "nojs.css"

# Kurzformen für Klassennamen. Unbekannte Eigenschaften behalten ihren Namen.
SHORT = {
    "margin-top": "mt", "margin-bottom": "mb", "margin-left": "ml",
    "margin-right": "mr", "padding-top": "pt", "padding-bottom": "pb",
    "padding-left": "pl", "padding-right": "pr", "position": "pos",
    "display": "d", "max-width": "maxw", "min-width": "minw", "width": "w",
    "height": "h", "font-size": "fs", "font-weight": "fwt",
    "font-style": "fst", "font-family": "ff", "line-height": "lh",
    "letter-spacing": "ls", "text-transform": "tt", "text-align": "ta",
    "text-decoration": "td", "color": "c", "background": "bg",
    "background-color": "bgc", "border": "bd", "border-color": "bdc",
    "border-block": "bb", "border-top": "bt", "border-bottom": "bbt",
    "border-left": "bl", "border-right": "br", "border-radius": "rad",
    "box-shadow": "sh", "gap": "gap", "flex": "fx", "flex-wrap": "fxw",
    "align-items": "ai", "justify-content": "jc", "overflow": "ov",
    "overflow-x": "ovx", "opacity": "op", "z-index": "z", "inset": "inset",
    "white-space": "ws", "object-fit": "of", "vertical-align": "va",
    "grid-template-columns": "gtc", "order": "ord", "inset-block": "ib",
    "min-height": "minh", "max-height": "maxh", "border-block-color": "bbc",
    "contain": "contain", "will-change": "wc", "aspect-ratio": "ar",
}

STYLE_RE = re.compile(r'style="([^"]*)"')
CLASS_RE = re.compile(r'class="([^"]*)"')
NOSCRIPT_STYLE_RE = re.compile(
    r"<noscript>\s*<style>(?P<css>.*?)</style>\s*</noscript>", re.S)


def slug(prop: str, value: str) -> str:
    name = SHORT.get(prop, prop)
    value = re.sub(r"\bvar\(\s*--([\w-]+)\s*\)", r"\1", value)
    value = value.replace("!important", "")
    text = re.sub(r"[^a-z0-9.]+", "-", value.lower()).strip("-")
    text = text.replace(".", "_")
    return f"{name}-{text}" if text else name


def build_class(decls: list[tuple[str, str]], used: dict[str, str]) -> str:
    """Klassenname für eine Deklarationsliste, stabil und ohne Kollision."""
    parts = [slug(p, v) for p, v in decls]
    name = "u-" + "_".join(parts)
    if len(name) > 46:
        name = "u-" + "_".join(parts[:2]) + "-" + hashlib.md5(
            ";".join(f"{p}:{v}" for p, v in decls).encode()).hexdigest()[:6]
    key = ";".join(f"{p}:{v}" for p, v in decls)
    if used.get(name) not in (None, key):
        name += "-" + hashlib.md5(key.encode()).hexdigest()[:4]
    return name


def parse(style: str) -> list[tuple[str, str]]:
    out = []
    for chunk in style.split(";"):
        if ":" not in chunk:
            continue
        prop, value = chunk.split(":", 1)
        prop = prop.strip()
        value = value.strip()
        if prop and value:
            out.append((prop, value))
    return out


def js_style_hits() -> list[str]:
    """Stil-Attribute in JavaScript-Zeichenketten (nicht CSSOM)."""
    hits = []
    for path in sorted(ROOT.rglob("*.js")):
        if "vendor" in path.parts:
            continue
        for no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if 'style="' in line or "style='" in line:
                hits.append(f"{path.relative_to(ROOT)}:{no}")
    return hits


def main() -> int:
    check = "--check" in sys.argv
    files = sorted(p for p in ROOT.glob("*.html") if p.name not in SKIP)

    used: dict[str, str] = {}
    order: list[tuple[str, str]] = []   # (class, css text)
    replacements: dict[str, str] = {}   # original style -> class list

    for path in files:
        src = path.read_text(encoding="utf-8")
        for m in STYLE_RE.finditer(src):
            style = m.group(1)
            if style in replacements:
                continue
            decls = parse(style)
            if not decls:
                replacements[style] = ""
                continue
            name = build_class(decls, used)
            used[name] = ";".join(f"{p}:{v}" for p, v in decls)
            css = "".join(f"{p}:{v};" for p, v in decls)
            if (name, css) not in order:
                order.append((name, css))
            replacements[style] = name

    remaining = 0
    for path in files:
        src = path.read_text(encoding="utf-8")
        remaining += len(STYLE_RE.findall(src))
        remaining += len(NOSCRIPT_STYLE_RE.findall(src))

    js_hits = js_style_hits()

    if check:
        print(f"CSP_STYLES {remaining} Inline-Stile verbleiben, "
              f"{len(js_hits)} Stil-Attribute in JavaScript")
        for hit in js_hits:
            print(f"  JS {hit}")
        return 1 if remaining or js_hits else 0

    # 1. CSS-Datei schreiben
    lines = ["/* Erzeugt von tools/csp_styles.py — nicht von Hand ändern.",
             "   Inline-Stile aus dem Markup, damit die CSP ohne",
             "   'unsafe-inline' auskommt.",
             "",
             "   Die Deklarationen stehen mit !important, weil ein style-Attribut",
             "   jede normale Regel der Stylesheets schlägt — auch spezifischere",
             "   wie .cfg-summary .btn. Ohne !important würde eine Klasse gegen",
             "   solche Regeln verlieren und das Aussehen ändern sich. */",
             ""]
    for name, css in order:
        decls = [d for d in css.split(";") if d.strip()]
        css = "".join(d + " !important;" for d in decls)
        lines.append(f".{name} {{ {css} }}")
    (ROOT / UTILITY_CSS).write_text("\n".join(lines) + "\n", encoding="utf-8")

    # 2. noscript-Blöcke einsammeln
    nojs = []
    for path in files:
        src = path.read_text(encoding="utf-8")
        for m in NOSCRIPT_STYLE_RE.finditer(src):
            css = " ".join(m.group("css").split())
            if css not in nojs:
                nojs.append(css)
    (ROOT / NOSCRIPT_CSS).write_text(
        "/* Erzeugt von tools/csp_styles.py. Gilt nur ohne JavaScript:\n"
        "   eingebunden über <link> in <noscript>. */\n"
        + "\n".join(nojs) + "\n", encoding="utf-8")

    # 3. HTML umschreiben
    changed = 0
    for path in files:
        src = path.read_text(encoding="utf-8")
        orig = src

        # style -> class (bestehende class zusammenführen)
        def on_tag(m):
            tag = m.group(0)
            sm = STYLE_RE.search(tag)
            if not sm:
                return tag
            cls = replacements.get(sm.group(1), "")
            tag = re.sub(r'\s*style="[^"]*"', "", tag)
            if not cls:
                return tag
            cm = CLASS_RE.search(tag)
            if cm:
                tag = tag.replace(cm.group(0), f'class="{cm.group(1)} {cls}"')
            else:
                tag = tag[:-1] + f' class="{cls}">'
            return tag

        src = re.sub(r"<[a-zA-Z][^>]*>", on_tag, src)

        # noscript-Style durch Link ersetzen
        src = NOSCRIPT_STYLE_RE.sub(
            f'<noscript><link rel="stylesheet" href="{NOSCRIPT_CSS}"></noscript>',
            src)

        # Stylesheet einbinden, falls noch nicht vorhanden. Ans Ende des
        # <head>, nicht hinter den letzten <link>: der steht auf manchen
        # Seiten in <noscript> und würde mit JavaScript nie geladen.
        if UTILITY_CSS not in src:
            head_end = src.lower().find("</head>")
            if head_end != -1:
                # 404.html wird unter beliebigen Pfaden ausgeliefert; dort
                # muss der Verweis absolut sein.
                href = f"/{UTILITY_CSS}" if path.name == "404.html" else UTILITY_CSS
                src = (src[:head_end]
                       + f'<link rel="stylesheet" href="{href}">\n'
                       + src[head_end:])
        if src != orig:
            path.write_text(src, encoding="utf-8")
            changed += 1

    print(f"CSP_STYLES {len(order)} Klassen, {changed} Seiten geändert, "
          f"{len(nojs)} noscript-Blöcke, {len(js_hits)} Stil-Attribute in JavaScript")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
