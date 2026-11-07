#!/usr/bin/env python3
"""Erzeugt die Social-Cards (1200x630) fuer alle Seiten.

Warum als Skript und nicht als Fertigbild: die Karten sollen reproduzierbar
sein, wenn sich eine Ueberschrift aendert. Aufruf aus dem Wurzelverzeichnis:

    python3 tools/og-images.py

Voraussetzungen: Pillow. SVG-Logos werden ueber QuickLook (macOS) gerastert;
fehlt qlmanage, wird die Karte ohne Logo gezeichnet.
"""

from __future__ import annotations

import os
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
SITE = "bytewerkstudio.com"

PAPER = (250, 249, 245)
INK = (31, 30, 29)
ACCENT = (176, 79, 49)
MUTED = (107, 102, 92)
LINE = (228, 222, 209)
SOFT = (244, 240, 230)

DISPLAY = "/System/Library/Fonts/Avenir Next.ttc"
MONO_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
]

# (datei, kicker, titelzeilen, untertitel, logo, akzent)
CARDS = [
    ("og-bytewerk", "BYTEWERK STUDIO · LUDWIGSHAFEN",
     ["Software.", "Web.", "Apps."],
     "Vom ersten Entwurf bis zum Start.", None, ACCENT),
    ("og-community", "COMMUNITY & FORUM",
     ["Fragen, die", "weiterbauen."],
     "Antworten aus dem Studio, offen für alle.", None, (79, 122, 99)),
    ("og-entwickler", "ENTWICKLER-ABO",
     ["Werkstatt statt", "Warteschlange."],
     "Code-Reviews, Prototypen, direkter Draht.", None, ACCENT),
    ("og-shop", "SHOP",
     ["Werkzeuge,", "die bleiben."],
     "Eigene Software für Windows und Web.", None, ACCENT),
    ("og-showroom", "SHOWROOM",
     ["Gebaute Sachen,", "keine Behauptungen."],
     "Ausgewählte Projekte mit Kontext.", None, (91, 107, 138)),
    ("og-arbeiten", "ARBEITEN",
     ["Projekte von", "der ersten", "Skizze an."],
     "Auswahl aus Kunden- und Eigenarbeit.", None, ACCENT),
    ("og-studio", "STUDIO",
     ["Eine kleine", "Werkstatt."],
     "Software, Websites, Apps. Direkt gearbeitet.", None, (79, 122, 99)),
    ("og-marke", "MARKE",
     ["Zeichen, Farbe,", "Haltung."],
     "Das Erscheinungsbild von Bytewerk Studio.", None, ACCENT),
    ("og-bauplan", "BAUPLAN",
     ["Wie wir", "arbeiten."],
     "Ablauf, Übergaben, was du erwarten kannst.", None, (138, 106, 63)),
    ("og-kontakt", "KONTAKT",
     ["Ein Satz", "reicht."],
     "Direkt zum Menschen, der es baut.", None, ACCENT),
    ("og-vergleich", "PAKETVERGLEICH",
     ["Pakete", "nebeneinander."],
     "Umfang, Grenzen, Preise — ohne Kleingedrucktes.", None, (91, 107, 138)),
    ("og-probierstand", "PROBIERSTAND",
     ["Erst prüfen,", "dann glauben."],
     "Kleine Werkzeuge, direkt im Browser.", None, (138, 106, 63)),
    ("og-zeichenwerk", "ZEICHENWERK",
     ["Schrift als", "Material."],
     "Buchstaben in 3D, direkt im Browser.", None, ACCENT),
    ("og-ludwigshafen", "SOFTWAREENTWICKLUNG",
     ["Aus Ludwigshafen.", "Für den Rest."],
     "Websites, Shops und Werkzeuge aus der Region.", None, (79, 122, 99)),
    ("og-lernreich-pro", "LERNFREICH PRO",
     ["Üben, bis es", "sitzt."],
     "Lernsoftware für Schule und Studium.",
     "media/lernreich-pro-icon.svg", (176, 79, 49)),
    ("og-pruefungs-countdown", "PRÜFUNGS-COUNTDOWN",
     ["Die Zeit im", "Blick."],
     "Prüfungstermine, Fristen, ruhiger Überblick.",
     "media/pruefungs-countdown-logo.png", (91, 107, 138)),
    ("og-keyforge-vault", "KEYFORGE VAULT",
     ["Zugänge", "an einem Ort."],
     "Passwortverwaltung für Windows.",
     "media/keyforge-vault-icon.svg", (42, 40, 37)),
    ("og-lumaweek", "LUMAWEEK PLANNER",
     ["Wochen, die", "passen."],
     "Planung ohne Reibung.",
     "media/lumaweek-icon.svg", (79, 122, 99)),
    ("og-updatepilot", "UPDATEPILOT",
     ["Updates ohne", "Überraschung."],
     "Verteilt und geprüft, statt hoffentlich.",
     "media/updatepilot-icon.png", (91, 107, 138)),
    ("og-pdf-text-pro", "BYTEWERK PDF TEXT PRO",
     ["Text aus PDF,", "brauchbar."],
     "Extraktion und OCR für Windows.",
     "media/bytewerk-pdf-text-pro-logo.png", ACCENT),
    ("og-neon-dominion", "NEON DOMINION",
     ["Strategie im", "Neonlicht."],
     "Ein Taktikspiel für Windows.",
     "media/neon-dominion-icon.svg", (176, 79, 49)),
    ("og-mastil", "MASTIL",
     ["Segel setzen,", "Kurs halten."],
     "Spielbare Web-Demo im Browser.",
     "media/mastil-logo.jpg", (55, 97, 107)),
    ("og-burgenwerk", "BURGENWERK",
     ["Aufbauen,", "Schicht für Schicht."],
     "Ein Aufbauspiel für Windows.",
     "media/burgenwerk-logo.png", (138, 106, 63)),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(DISPLAY, size, index=1 if bold else 0)
    except OSError:
        return ImageFont.load_default()


def mono(size: int) -> ImageFont.FreeTypeFont:
    for path in MONO_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def raster_svg(path: str, size: int = 512) -> Image.Image | None:
    """Rastert ein SVG ueber QuickLook und macht den weissen Rand transparent."""
    with tempfile.TemporaryDirectory() as tmp:
        try:
            subprocess.run(
                ["qlmanage", "-t", "-s", str(size), "-o", tmp, path],
                check=True, capture_output=True, timeout=30,
            )
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return None
        rendered = os.path.join(tmp, os.path.basename(path) + ".png")
        if not os.path.exists(rendered):
            return None
        img = Image.open(rendered).convert("RGBA")

    # Weisser Rand von aussen nach innen entfernen; weisse Flaechen im Logo
    # bleiben, weil sie nicht mit dem Rand zusammenhaengen.
    px = img.load()
    w, h = img.size
    seen = [[False] * w for _ in range(h)]
    stack = [(x, y) for x in (0, w - 1) for y in (0, h - 1)]
    stack += [(x, y) for y in (0, h - 1) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        seen[y][x] = True
        r, g, b, a = px[x, y]
        if a > 0 and min(r, g, b) < 244:
            continue
        px[x, y] = (r, g, b, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return img


def load_logo(spec: str | None) -> Image.Image | None:
    if not spec or not os.path.exists(spec):
        return None
    if spec.lower().endswith(".svg"):
        return raster_svg(spec)
    img = Image.open(spec).convert("RGBA")
    if spec.lower().endswith((".jpg", ".jpeg")):
        # Ein Foto als Logo: in eine abgerundete Kachel setzen.
        return img
    return img


def draw_mark(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], accent: tuple[int, int, int]) -> None:
    """Vier Felder plus Punkt — die Form aus logo.svg, gross gezeichnet."""
    x0, y0, x1, y1 = box
    size = min(x1 - x0, y1 - y0)
    x0 += (x1 - x0 - size) // 2
    y0 += (y1 - y0 - size) // 2
    gap = int(size * 0.09)
    cell = (size - gap) // 2
    for cx, cy in ((x0, y0), (x0 + cell + gap, y0), (x0, y0 + cell + gap)):
        d.rounded_rectangle([cx, cy, cx + cell, cy + cell], radius=int(cell * 0.26), fill=INK)
    r = int(cell * 0.5)
    d.ellipse([x0 + cell + gap + cell // 2 - r, y0 + cell + gap + cell // 2 - r,
               x0 + cell + gap + cell // 2 + r, y0 + cell + gap + cell // 2 + r], fill=accent)


def build(card) -> str:
    name, kicker, lines, subtitle, logo_spec, accent = card
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    for y in range(0, H, 8):
        d.line([(0, y), (W, y)], fill=(252, 251, 248))

    f_kicker = mono(19)
    f_title = font(int(86 if len(lines) <= 2 else 74), bold=True)
    f_sub = font(27)
    f_foot = mono(17)

    d.text((80, 92), kicker, font=f_kicker, fill=MUTED)

    y = 158
    step = int(f_title.size * 1.14)
    for line in lines:
        d.text((76, y), line, font=f_title, fill=INK)
        w = d.textlength(line, font=f_title)
        r = max(5, int(f_title.size * 0.13))
        d.ellipse([76 + w + 12, y + int(f_title.size * 0.72),
                   76 + w + 12 + r * 2, y + int(f_title.size * 0.72) + r * 2], fill=accent)
        y += step

    rule_y = max(y + 26, 448)
    d.line([(80, rule_y), (760, rule_y)], fill=LINE, width=2)
    d.text((80, rule_y + 22), subtitle, font=f_sub, fill=MUTED)

    d.text((80, H - 62), SITE, font=f_foot, fill=MUTED)
    d.line([(80, H - 76), (560, H - 76)], fill=LINE, width=1)

    # Rechte Bildebene: eine Kachel mit dem Zeichen der Seite.
    panel = (830, 76, 1120, 554)
    d.rounded_rectangle(panel, radius=22, fill=SOFT, outline=LINE, width=2)

    tile_size = 196
    tile_x = (panel[0] + panel[2] - tile_size) // 2
    tile_y = 150
    logo = load_logo(logo_spec)

    if logo is None:
        draw_mark(d, (tile_x, tile_y, tile_x + tile_size, tile_y + tile_size), accent)
    else:
        # Dunkle Zeichen bekommen eine dunkle Flaeche, helle eine helle —
        # sonst verschwindet das Logo im Untergrund.
        small = logo.resize((16, 16), Image.LANCZOS).convert("RGB")
        pixels = list(small.getdata())
        avg = sum(sum(p) for p in pixels) / (len(pixels) * 3)
        dark = avg < 118
        plate = (31, 30, 29) if dark else (255, 253, 249)
        d.rounded_rectangle([tile_x, tile_y, tile_x + tile_size, tile_y + tile_size],
                            radius=34, fill=plate,
                            outline=None if dark else LINE, width=2)

        inner = int(tile_size * (0.74 if dark else 0.80))
        copy = logo.copy()
        copy.thumbnail((inner, inner), Image.LANCZOS)
        lw, lh = copy.size
        img.paste(copy, (tile_x + (tile_size - lw) // 2, tile_y + (tile_size - lh) // 2), copy)

    # Ein Wort zur Einordnung, mit Abstand unter der Kachel.
    label = name.replace("og-", "")
    label = {"bytewerk": "BYTEWERK STUDIO", "ludwigshafen": "LUDWIGSHAFEN",
             "pdf-text-pro": "PDF TEXT PRO"}.get(label, label.replace("-", " ").upper())
    f_label = mono(16)
    lw = d.textlength(label, font=f_label)
    d.text(((panel[0] + panel[2] - lw) // 2, tile_y + tile_size + 34), label, font=f_label, fill=MUTED)

    # Feine Linie darunter, damit die Kachel nicht frei schwebt.
    d.line([(panel[0] + 40, tile_y + tile_size + 22), (panel[2] - 40, tile_y + tile_size + 22)],
           fill=LINE, width=1)

    out = f"media/{name}.png"
    img.save(out, optimize=True)
    return out


def main() -> None:
    total = 0
    for card in CARDS:
        path = build(card)
        size = os.path.getsize(path)
        total += size
        print(f"{path:34} {size // 1024:4} KB")
    print(f"\n{len(CARDS)} Karten · {total // 1024} KB gesamt")


if __name__ == "__main__":
    main()
