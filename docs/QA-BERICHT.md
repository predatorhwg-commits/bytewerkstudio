# QA-Bericht

Stand: 7. November 2026. Dieser Bericht wird von `tools/qa_report.py`
aus den Messdateien in `docs/qa/` erzeugt. Alle Zahlen sind gemessen,
nicht geschätzt. Rohdaten: `docs/qa/static.json`, `docs/qa/seo.json`,
`docs/qa/runtime.json`.

## 1. Statische Prüfung

Geprüft werden alle ausgelieferten HTML-Seiten: interne Links und Anker,
doppelte IDs, fehlende Alt-Texte, H1-Anzahl, CSP-Vorhandensein.

| Prüfung | Ergebnis |
|---|---|
| Seiten | 34 |
| Tote interne Verweise | 0 |
| Seiten mit doppelten IDs | 0 |
| Bilder ohne Alt-Text | 0 |
| Seiten mit falscher H1-Anzahl | 0 |
| Seiten ohne CSP | 0 |

## 2. Suchmaschinen und soziale Vorschau

Titellänge, Description-Länge, Canonical, Open Graph, Twitter-Card,
JSON-LD-Gültigkeit, Überschriftenreihenfolge, Alt-Texte, `rel="noopener"`.

Seiten geprüft: **34** · Beanstandungen: **0**

Keine Beanstandung. Jede indexierbare Seite hat eine eigene
Description im Zielbereich, ein Canonical und vollständige
Social-Tags; Konto-Seiten sind `noindex`.

## 3. Browserprüfung

Gemessen: **102 Seitenaufrufe** über 3 Breiten (desktop: 34, tablet: 34, mobile: 34).
Jeder Aufruf prüft Konsolenfehler, horizontales Überlaufen,
Sprachwechsel DE→EN→DE und – unter 820 px – das Mobilmenü.

| Messung | Ergebnis |
|---|---|
| Seitenaufrufe | 102 |
| Seiten mit Konsolenfehler | 0 |
| Seiten mit Überlauf | 0 |
| Sprachwechsel fehlgeschlagen | 0 |
| Mobilmenü fehlgeschlagen | 0 |
| Abgebrochene Aufrufe | 0 |
| Seiten mit Canvas | 34 |


Breiten: Desktop 1440 × 900, Tablet 768 × 1024, Mobil 390 × 844.

## 4. 3D-Bühnen (three.js)

Geprüft: **9 Seiten mit 3D-Szene**, gerendert: **9**.
Messung: Canvas in den Blick scrollen, WebGL-Kontext abfragen, Bild
aufnehmen und die Helligkeitsstreuung messen. Ein einfarbiges Bild
(Streuung unter 4) würde bedeuten, dass die Bühne leer bleibt.

| Seite | gerendert | WebGL-Canvas | Streuung | JS-Fehler |
|---|---|---|---|---|
| `index.html` | ja | 575×612 | 57.9 | 0 |
| `404.html` | ja | 512×502 | 72.2 | 0 |
| `arbeiten.html` | ja | 1440×520, 476×381 | 26.7 | 0 |
| `entwickler.html` | ja | 1440×775 | 31.1 | 0 |
| `forum.html` | ja | 500×424 | 32.4 | 0 |
| `probierstand.html` | ja | 552×425 | 39.8 | 0 |
| `shop.html` | ja | 1440×587 | 36.9 | 0 |
| `showroom.html` | ja | 734×510 | 34.5 | 0 |
| `sicherheit.html` | ja | 508×523 | 43.4 | 0 |

Alle Szenen laden three.js ausschließlich aus `vendor/`; das ist mit
`script-src 'self'` vereinbar. Ohne WebGL bleibt die gezeichnete
SVG-Bühne sichtbar, die Bedienelemente funktionieren weiter.

## 5. Screenshots

`docs/qa/` enthält 34 Desktop-Aufnahmen (1440 × 900) sowie
Startseite in Tablet und Mobil. Sie zeigen den ersten Bildschirm
jeder Seite und dienen der Sichtprüfung von Typografie, Abständen
und 3D-Bühne. Erzeugt mit `tools/qa_shots.py` (WebGL an, damit die
Bühnen im Bild sind).

## 6. Was hier nicht geprüft wird

- **Echte Geräte.** Die Messung läuft in Chromium; Safari und Firefox
  werden nicht automatisch geprüft.
- **Barrierefreiheit nach WCAG.** Kontrast und Fokus sind von Hand
  geprüft, es gibt aber keinen automatisierten Axe-Lauf.
- **Netzwerk unter Last.** GitHub Pages liefert statisch; Latenz und
  Caching-Verhalten der Domain sind nicht Teil dieses Berichts.
- **Formularversand.** `mailto:` öffnet ein Mailprogramm; der Versand
  selbst lässt sich im Browser nicht abschließend testen.

## 7. Wiederholen

```
python3 tools/qa_site.py --static-only
python3 tools/qa_seo.py
python3 -m http.server 8809 --bind 127.0.0.1 &
python3 tools/qa_site.py --base http://127.0.0.1:8809 --out docs/qa --no-shots
python3 tools/qa_three.py --base http://127.0.0.1:8809
python3 tools/qa_report.py
```
