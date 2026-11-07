#!/usr/bin/env python3
"""Translate the shared cross-sell descriptions on product pages (additive).

Adds data-en to <p> elements whose German source matches a known sentence.
German text is not changed. Run with --check to see what is still open.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MAP = {
    "Minimaler Wochen- und Jahresplaner fuer Schule, Uni und Arbeit mit Aufgaben, Notizen, PDF-Export und lokalen Backups.":
        "Minimal weekly and yearly planner for school, university and work with tasks, notes, PDF export and local backups.",
    "PDFs in sauberen Text umwandeln, mit OCR fuer Scans, 5 Gratis-PDFs pro Tag und Lifetime-Lizenz.":
        "Turn PDFs into clean text, with OCR for scans, 5 free PDFs per day and a lifetime licence.",
    "Eine fokussierte Lern-App mit Fokus-Sanduhr, XP, Streaks, Heatmap, Journal und Wiederholungsplanung.":
        "A focused learning app with a focus sand timer, XP, streaks, heatmap, journal and repetition planning.",
    "Minimaler Windows-Update-Manager mit winget-Scan, freigegebenen Updates, Blocklisten, Technikerprofilen und PDF/CSV-Reports.":
        "Minimal Windows update manager with winget scan, approved updates, block lists, technician profiles and PDF/CSV reports.",
    "Premium-Offline-Passwortgenerator und verschluesselter Vault mit AES-256-GCM, Audit, Auto-Lock und Clipboard-Clearing.":
        "Premium offline password generator and encrypted vault with AES-256-GCM, audit, auto-lock and clipboard clearing.",
    "Premium-Offline-Fokussoftware mit XP, Streaks, Lernstadt, Journal, SQLite-Speicher und lokalen Exporten.":
        "Premium offline focus software with XP, streaks, learning city, journal, SQLite storage and local exports.",
    "Eine kostenlose Windows-App fuer Pruefungscountdowns, Lernziele, Fokus-Timer, XP, Streaks, Heatmap und lokale Exporte.":
        "A free Windows app for exam countdowns, learning goals, focus timer, XP, streaks, heatmap and local exports.",
    "Premium-Neon-Tech-Tower-Conquest-Spiel mit 30 Offline-Missionen, lokalen Saves, Achievements, Overdrive und Upgrade Lab.":
        "Premium neon-tech tower conquest game with 30 offline missions, local saves, achievements, overdrive and upgrade lab.",
    "Mittelalterliches Strategie- und Tower-Defense-Spiel fuer Web und Windows, mit Offline-KI, Wellenfortschritt und Reichsauswahl.":
        "Medieval strategy and tower defence game for web and Windows, with offline AI, wave progress and realm selection.",
    "Premium-Offline-Passwortgenerator und verschluesselter Vault mit AES-256-GCM, Auto-Lock und Clipboard-Clearing.":
        "Premium offline password generator and encrypted vault with AES-256-GCM, auto-lock and clipboard clearing.",
    "Premium-Offline-Passwortgenerator und verschluesselter Vault mit AES-256-GCM, portablen Vault-Dateien, Audit, Auto-Lock und Clipboard-Clearing.":
        "Premium offline password generator and encrypted vault with AES-256-GCM, portable vault files, audit, auto-lock and clipboard clearing.",
    "Minimaler Wochen- und Jahresplaner fuer Schule, Uni und Arbeit mit Aufgaben, Notizen, PDF-Export, Drucken und lokalen Backups.":
        "Minimal weekly and yearly planner for school, university and work with tasks, notes, PDF export, printing and local backups.",
    "Minimaler Windows-Update-Manager mit winget-Scan, freigegebenen Updates, Blocklisten, Technikerprofilen, Lizenzierung und PDF/CSV-Reports. Einmal kaufen, dauerhaft behalten.":
        "Minimal Windows update manager with winget scan, approved updates, block lists, technician profiles, licensing and PDF/CSV reports. Buy once, keep forever.",
    "Premium-Windows-App zum Umwandeln von PDFs in sauberen Text, mit OCR fuer Scans, 5 Gratis-PDFs pro Tag und Offline-Lifetime-Lizenz.":
        "Premium Windows app that turns PDFs into clean text, with OCR for scans, 5 free PDFs per day and an offline lifetime licence.",
    "Mittelalterliches Strategie- und Tower-Defense-Spiel fuer Web und Windows, mit Offline-KI, Wellenfortschritt, Reichsauswahl und geplanter Online-1v1-Funktion.":
        "Medieval strategy and tower defence game for web and Windows, with offline AI, wave progress, realm selection and a planned online 1v1 mode.",
    "Mittelalterliches Strategie- und Tower-Defense-Spiel fuer Web und Windows, mit Offline-KI, Wellenfortschritt, Reichsauswahl und geplantem Online-1v1.":
        "Medieval strategy and tower defence game for web and Windows, with offline AI, wave progress, realm selection and a planned online 1v1.",
}

PAT = re.compile(r"<p>((?:Eine|Ein|Premium|Minimaler|Mittelalterliches|PDFs)[^<]{20,320})</p>")


def esc(v: str) -> str:
    return v.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> int:
    check = "--check" in sys.argv
    open_items = []
    total = 0
    files = 0
    for p in sorted(ROOT.glob("*.html")):
        s = p.read_text(encoding="utf-8")
        orig = s
        n = 0

        def repl(m):
            nonlocal n
            text = m.group(1)
            en = MAP.get(text)
            if not en:
                open_items.append((p.name, text[:70]))
                return m.group(0)
            n += 1
            return f'<p data-en="{esc(en)}">{text}</p>'

        s = PAT.sub(repl, s)
        if s != orig:
            files += 1
            total += n
            if not check:
                p.write_text(s, encoding="utf-8")
    for name, text in open_items:
        print(f"OPEN {name}: {text}")
    print(f"translated {total} paragraphs in {files} files")
    return 1 if open_items else 0


if __name__ == "__main__":
    sys.exit(main())
