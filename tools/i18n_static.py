#!/usr/bin/env python3
"""Ergänzt data-en an statischen Texten, die noch deutsch bleiben.

Additiv und idempotent: Es wird nur ein Attribut ergänzt, der deutsche
Quelltext bleibt byte-gleich. Vorhandene data-en werden nie überschrieben.

Warum eine Liste und keine maschinelle Übersetzung: Die Texte sind
Marketing- und Rechtstexte. Eine falsche Übersetzung ist schlechter als
eine fehlende, und ein Wörterbuch macht jede Änderung nachvollziehbar.

Aufruf:
  python3 tools/i18n_static.py [--check]

--check meldet nur, was fehlt, und ändert nichts (für die CI).
"""
from __future__ import annotations

import html as htmllib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Deutsch -> Englisch. Nur vollständige, sich wiederholende Texte.
PAIRS = {
    # Preise und Aktionen
    "Kostenlos": "Free",
    "kostenlos": "Free",
    "Kaufen": "Buy",
    "Zum Produkt": "View product",
    "Alle Produkte": "All products",
    "Link kopieren": "Copy link",
    "Kopiert": "Copied",
    "Kaufanfrage per E-Mail senden": "Send purchase request by email",
    "Antworten": "Replies",
    "Gelöst": "Solved",
    "Offen": "Open",
    "Team": "Team",
    "Frage": "Question",
    "Diskussion": "Discussion",
    "Ankündigung": "Announcement",
    "Ankuendigung": "Announcement",
    "Filter zurücksetzen": "Reset filters",
    "Keine Treffer": "No results",
    "Andere Suche oder Filter zurücksetzen.": "Try another search or reset the filters.",
    "Nichts gefunden": "Nothing found",
    "Mehr laden": "Load more",
    "Zurück": "Back",
    "Weiter": "Next",
    "Schließen": "Close",
    "Abbrechen": "Cancel",
    "Speichern": "Save",
    "Löschen": "Delete",
    "Konto erstellen": "Create account",
    "Anmelden": "Sign in",
    "Abmelden": "Sign out",
    "Vergessen?": "Forgot?",
    "PayPal akzeptiert": "PayPal accepted",
    "Versand per E-Mail": "Delivery by email",
    "Sofort verfügbar": "Available now",
    "Beliebt": "Popular",
    "Neu": "New",
    "Bestseller": "Bestseller",
    # Produktkategorien
    "Windows · PDF/OCR · Lifetime-Lizenz": "Windows · PDF/OCR · lifetime licence",
    "Windows · Updates · Lebenslange Lizenz": "Windows · updates · lifetime licence",
    "Windows · Security · PayPal": "Windows · security · PayPal",
    "Windows · Planung · PayPal": "Windows · planning · PayPal",
    "Windows · Lernen · Produktivitaet": "Windows · learning · productivity",
    "Windows · Lernen · Produktivität": "Windows · learning · productivity",
    "Windows · Pro · PayPal": "Windows · pro · PayPal",
    "Windows · Pruefung · Planung": "Windows · exams · planning",
    "Windows · Prüfung · Planung": "Windows · exams · planning",
    "Web · Browser · Strategie": "Web · browser · strategy",
    "Windows · Premium · Tower Conquest": "Windows · premium · tower conquest",
    "Windows · Kostenlos · Lernen": "Windows · free · learning",
    "Windows · Kostenlos": "Windows · free",
    "Web · Kostenlos": "Web · free",
    # Navigation und Struktur
    "Arbeiten": "Work",
    "Produkte": "Products",
    "Leistungen": "Services",
    "Kontakt": "Contact",
    "Über uns": "About",
    "Ueber uns": "About",
    "Startseite": "Home",
    "Start": "Home",
    "Impressum": "Legal notice",
    "Datenschutz": "Privacy",
    "AGB": "Terms",
    "Sicherheit": "Security",
    "Forum": "Forum",
    "Showroom": "Showroom",
    "Marke": "Brand",
    "Entwickler": "Developers",
    "Musterbuch": "Sample book",
    "Probierstand": "Test bench",
    "Vergleich": "Comparison",
    "Preise": "Pricing",
    "Alle ansehen": "View all",
    "Mehr erfahren": "Learn more",
    "Details": "Details",
    "Öffnen": "Open",
    "Oeffnen": "Open",
}

# Zeilen, die nie übersetzt werden: Marken, Produktnamen, Domain, Recht.
NEVER = re.compile(
    r"^(Bytewerk|Bytewerk Studio|KeyForge Vault|UpdatePilot|Neon Dominion|Neon Horde|"
    r"Bytewerk PDF Text Pro|LumaWeek Planner|MASTIL|BURGENWERK|Lernreich|Lernreich Pro|"
    r"Pruefungs-Countdown|Prüfungs-Countdown|Windows|GitHub Repository|"
    r"bytewerkstudio\.com|Haqmalh@icloud\.com|"
    r"[\d\s.,:·%–—-]+)$"
)

# Elemente, deren Inhalt als Textknoten direkt zwischen den Tags steht.
TEXT_RE = re.compile(
    r"<(?P<tag>span|b|i|strong|em|small|p|h1|h2|h3|h4|li|td|th|a|button|div|figcaption)"
    r"(?P<attrs>[^>]*)>(?P<text>[^<>]+)</(?P=tag)>"
)


def esc(value: str) -> str:
    return htmllib.escape(value, quote=True)


def main() -> int:
    check = "--check" in sys.argv
    changed_files = 0
    added = 0
    unknown = set()

    for path in sorted(ROOT.glob("*.html")):
        if path.name.startswith("google"):
            continue
        src = path.read_text(encoding="utf-8")
        count = 0

        def repl(m):
            nonlocal count
            attrs = m.group("attrs")
            text = m.group("text").strip()
            if "data-en" in attrs:
                return m.group(0)
            if not text or len(text) > 70:
                return m.group(0)
            if NEVER.match(text):
                return m.group(0)
            en = PAIRS.get(text)
            if not en:
                if re.search(r"[A-Za-zÄÖÜäöüß]{4,}", text):
                    unknown.add(text)
                return m.group(0)
            count += 1
            return (f'<{m.group("tag")}{attrs} data-en="{esc(en)}">'
                    f'{m.group("text")}</{m.group("tag")}>')

        new = TEXT_RE.sub(repl, src)
        if new != src:
            changed_files += 1
            added += count
            if not check:
                path.write_text(new, encoding="utf-8")

    print(f"I18N_STATIC {added} Texte auf {changed_files} Seiten"
          + (" (Prüflauf)" if check else ""))
    if unknown:
        print(f"ohne Eintrag ({len(unknown)}), Auswahl:")
        for text in sorted(unknown)[:15]:
            print("  " + text[:70])
    return 1 if (check and added) else 0


if __name__ == "__main__":
    raise SystemExit(main())
