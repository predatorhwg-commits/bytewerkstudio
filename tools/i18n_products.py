#!/usr/bin/env python3
"""Add English translations to product detail pages (additive).

Only adds a data-en attribute where none exists; German source stays byte-identical.
Usage: python3 tools/i18n_products.py [--check]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FEATURES = {
    # produkt.html
    "Fokus-Sanduhr fuer klare Lerneinheiten": "Focus sand timer for clear study sessions",
    "XP, Streaks und Heatmap fuer sichtbaren Fortschritt": "XP, streaks and a heatmap make progress visible",
    "Journal und Wiederholungen fuer nachhaltiges Lernen": "Journal and spaced repetition for lasting learning",
    "Offline nutzbar, werbefrei und ruhig gestaltet": "Works offline, no ads, calm by design",
    # lernreich-pro
    "Premium-Fokus-Timer bis 150 Minuten mit Checkliste und Pause": "Premium focus timer up to 150 minutes with checklist and breaks",
    "XP, Level, Streaks, Tagesziel, Wochenziel und Lernstadt-Upgrades": "XP, levels, streaks, daily goal, weekly goal and learning-city upgrades",
    "Statistiken, Heatmap, Top-Faecher, Journal und Reflexion": "Statistics, heatmap, top subjects, journal and reflection",
    "Offline, lokale SQLite-Daten, Import/Export, kein Login, keine Cloud": "Offline, local SQLite data, import/export, no login, no cloud",
    # pruefungs-countdown
    "Mehrere Pruefungen mit Live-Countdown anlegen": "Set up several exams with a live countdown",
    "Themen, Tagesziele, Lernbloecke und Wochenplan organisieren": "Organise topics, daily goals, study blocks and a weekly plan",
    "Fokus-Timer, XP, Streaks, Heatmap und Statistik": "Focus timer, XP, streaks, heatmap and statistics",
    "Lokale Speicherung, JSON/CSV-Export, kein Login, keine Cloud": "Local storage, JSON/CSV export, no login, no cloud",
    # keyforge-vault
    "Offline-first Windows-App ohne Account und ohne Cloud-Zwang": "Offline-first Windows app with no account and no cloud lock-in",
    "Portable `.kfvault` Dateien fuer PC, USB-Stick, externe Laufwerke oder eigene Ordner": "Portable `.kfvault` files for PC, USB stick, external drives or your own folders",
    "Passwort-Presets: Easy, Balanced, Strong, Fortress und Custom": "Password presets: Easy, Balanced, Strong, Fortress and Custom",
    "Login-Verwaltung mit Suche, Kategorien, Tags, Favoriten, Bearbeiten und Duplizieren": "Login manager with search, categories, tags, favourites, editing and duplication",
    "Security-Audit fuer schwache, wiederverwendete, alte und unvollstaendige Eintraege": "Security audit for weak, reused, old and incomplete entries",
    "Auto-Lock, Clipboard-Clearing und Passwortstaerke mit Entropie-Anzeige": "Auto-lock, clipboard clearing and password strength with entropy display",
    # lumaweek
    "Wochenplan fuer Unterricht, Vorlesungen, Schichten, Lernbloecke und Arbeit": "Weekly plan for school, lectures, shifts, study blocks and work",
    "Jahresplan fuer Pruefungen, Deadlines, Ferien, Feiertage und Projekte": "Year plan for exams, deadlines, holidays, public holidays and projects",
    "Aufgaben mit Status, Prioritaet, Faelligkeit und Kategorien": "Tasks with status, priority, due date and categories",
    "Notizen fuer Kurse, Meetings, Projekte und eigene Informationen": "Notes for courses, meetings, projects and your own information",
    "Design Studio mit Farben, Layout-Dichte und Druckeinstellungen": "Design studio with colours, layout density and print settings",
    "PDF-Export, Drucken, A4-Layouts und lokale JSON-Backups": "PDF export, printing, A4 layouts and local JSON backups",
    # updatepilot
    "Scan installierter Windows-Programme mit Windows Package Manager `winget`": "Scan installed Windows programs with Windows Package Manager `winget`",
    "Einzelne Apps oder alle freigegebenen Updates aktualisieren": "Update single apps or every approved update",
    "Blocklisten fuer sensible Programme, zum Beispiel `Adobe*`": "Block lists for sensitive programs, for example `Adobe*`",
    "Bestimmte Update-Versionen voruebergehend ignorieren": "Temporarily ignore specific update versions",
    "Lokale Technikerprofile fuer verschiedene Kunden oder PCs": "Local technician profiles for different clients or PCs",
    "PDF- und CSV-Reports fuer private Nutzer und Techniker": "PDF and CSV reports for home users and technicians",
    # pdf-text-pro
    "PDFs per Drag & Drop oder Dateiauswahl in Text umwandeln": "Turn PDFs into text by drag and drop or file picker",
    "Eingebetteten Text aus normalen PDF-Dokumenten extrahieren": "Extract embedded text from regular PDF documents",
    "OCR-Fallback fuer gescannte oder bildbasierte PDF-Seiten": "OCR fallback for scanned or image-based PDF pages",
    "Deutsch und Englisch als OCR-Sprachen vorbereitet": "German and English prepared as OCR languages",
    "5 erfolgreiche PDF-Konvertierungen pro Tag kostenlos": "5 successful PDF conversions per day for free",
    "Unbegrenzte Nutzung mit Offline-Lifetime-Lizenz": "Unlimited use with an offline lifetime licence",
    # mastil
    "Mittelalterliches Strategie- und Tower-Defense-Spiel": "Medieval strategy and tower defence game",
    "Offline-Kaempfe gegen KI direkt im Browser spielbar": "Offline battles against AI, playable right in the browser",
    "Wellenfortschritt: Wellen 1-5 als freie Demo": "Wave progress: waves 1-5 as a free demo",
    "Reichsauswahl, moderne Menues und atmosphaerische Spielwelt": "Choose your realm, modern menus and an atmospheric game world",
    "Geplanter Online-1v1-Modus mit Socket.IO-Backend": "Planned online 1v1 mode with a Socket.IO backend",
    "Windows-App mit Installer- und Lizenz-Support": "Windows app with installer and licence support",
    # neon-dominion
    "Premium-Neon-Tech Tower-Conquest-Strategiespiel": "Premium neon-tech tower conquest strategy game",
    "30 handgebaute Kampagnenmissionen in Version 1.01.1": "30 hand-built campaign missions in version 1.01.1",
    "Lokale Speicherstaende, Achievements und Kampagnenstatistiken": "Local save games, achievements and campaign statistics",
    "Upgrade Lab mit Credits und fuenf gameplay-wirksamen Upgrade-Zweigen": "Upgrade lab with credits and five upgrade branches that change gameplay",
    "Overdrive, Missionswertung, Tutorial-Hinweise und taktische Neon-Karten": "Overdrive, mission scoring, tutorial hints and tactical neon maps",
    "Offline-Windows-Installer, kein Account, kein DRM, keine In-App-Kaeufe": "Offline Windows installer, no account, no DRM, no in-app purchases",
    # burgenwerk
    "Burg bauen mit 7 Gebaeudetypen und Ausbau bis Stufe 3": "Build a castle with 7 building types and upgrades up to level 3",
    "Verteidigung: 10 Wellen mit 4 Gegnertypen auf 4 Angriffsspuren": "Defence: 10 waves with 4 enemy types on 4 attack lanes",
    "Erobern: 4 Festungen auf der Feldzug-Karte einnehmen": "Conquer: take 4 fortresses on the campaign map",
    "Eigene Armee in Kasernen ausbilden und mit Schmieden verstaerken": "Train your own army in barracks and strengthen it with forges",
    "Echtzeit-Kaempfe mit Tuermen, Soldaten, Projektilen und Sound": "Real-time battles with towers, soldiers, projectiles and sound",
    "Automatisches Speichern, kein Download, kein Account, kostenlos": "Autosave, no download, no account, free",
}

LABELS = {
    "Plattform": "Platform",
    "Kategorie": "Category",
    "Preis": "Price",
    "Zahlung": "Payment",
    "Kauf": "Purchase",
    "Download": "Download",
    "Zugriff": "Access",
    "Studio": "Studio",
    "Website": "Website",
    "Verschluesselung": "Encryption",
    "Lizenz": "Licence",
    "Quellprojekt": "Source project",
    "Quellcode": "Source code",
    "Speicherung": "Storage",
    "Technik": "Stack",
    "Voraussetzung": "Requirement",
    "Kostenlos": "Free tier",
    "Version": "Version",
    "Demo": "Demo",
    "Vollversion": "Full version",
    "Web": "Web",
    "Windows": "Windows",
    "Kampagne": "Campaign",
    "Release": "Release",
    "System": "System",
    "Speichern": "Saving",
    "Sound": "Sound",
    "Spielen": "Play",
}

FILES = [
    "produkt.html", "lernreich-pro.html", "pruefungs-countdown.html", "keyforge-vault.html",
    "lumaweek-planner.html", "updatepilot.html", "bytewerk-pdf-text-pro.html", "mastil.html",
    "neon-dominion.html", "burgenwerk.html",
]

FEATURE_RE = re.compile(r'(<div class="f"><svg.*?</svg><span)(>)(.*?)(</span></div>)', re.S)
KEY_RE = re.compile(r'(<span class="key")(>)(.*?)(</span>)', re.S)


def esc(v: str) -> str:
    return v.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> int:
    check = "--check" in sys.argv
    missing = []
    changed_files = 0
    for name in FILES:
        p = ROOT / name
        s = p.read_text(encoding="utf-8")
        orig = s
        count = 0

        def feat(m):
            nonlocal count
            open_tag, close, text, tail = m.group(1), m.group(2), m.group(3), m.group(4)
            if "data-en" in open_tag:
                return m.group(0)
            en = FEATURES.get(text.strip())
            if not en:
                missing.append((name, text.strip()[:60]))
                return m.group(0)
            count += 1
            return f'{open_tag} data-en="{esc(en)}"{close}{text}{tail}'

        def key(m):
            nonlocal count
            open_tag, close, text, tail = m.group(1), m.group(2), m.group(3), m.group(4)
            if "data-en" in open_tag:
                return m.group(0)
            en = LABELS.get(text.strip())
            if not en:
                missing.append((name, "LABEL " + text.strip()[:60]))
                return m.group(0)
            count += 1
            return f'{open_tag} data-en="{esc(en)}"{close}{text}{tail}'

        s = FEATURE_RE.sub(feat, s)
        s = KEY_RE.sub(key, s)
        if s != orig:
            changed_files += 1
            if not check:
                p.write_text(s, encoding="utf-8")
        print(f"{name}: {count} translated")
    if missing:
        print("\nMISSING:")
        for name, text in missing:
            print(f"  {name}: {text}")
    print(f"files changed: {changed_files}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
