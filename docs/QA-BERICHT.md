# QA-Bericht

Stand: 7. November 2026. Dieser Bericht wird von `tools/qa_report.py`
aus den Messdateien in `docs/qa/` erzeugt. Alle Zahlen sind gemessen,
nicht geschätzt. Rohdaten liegen in `docs/qa/`: `static.json`,
`seo.json`, `runtime.json`, `security.json`, `xss.json`, `a11y.json`,
`keyboard.json`, `perf.json`, `three.json`.

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

Gemessen: **18 Seitenaufrufe** über 3 Breiten (desktop: 6, tablet: 6, mobile: 6).
Jeder Aufruf prüft Konsolenfehler, horizontales Überlaufen,
Sprachwechsel DE→EN→DE und – unter 820 px – das Mobilmenü.

| Messung | Ergebnis |
|---|---|
| Seitenaufrufe | 18 |
| Seiten mit Konsolenfehler | 0 |
| Seiten mit Überlauf | 0 |
| Sprachwechsel fehlgeschlagen | 0 |
| Mobilmenü fehlgeschlagen | 0 |
| Abgebrochene Aufrufe | 0 |
| Seiten mit Canvas | 6 |


Breiten: Desktop 1440 × 900, Tablet 768 × 1024, Mobil 390 × 844.

## 4. Sicherheit

`tools/qa_security.py` prüft die Fehlerklassen, die bei einer
statischen Seite vorkommen: gemischte Inhalte, fremde Skripte,
Inline-Handler, `javascript:`-URLs, `target="_blank"` ohne
`noopener`, fremde Formularziele, eine zu weite CSP, Secrets im
Repository, Klartextpasswörter und schwache PBKDF2-Parameter.

| Prüfung | Ergebnis |
|---|---|
| Geprüfte Seiten | 34 |
| Befunde | 0 |

Keine Beanstandung. Die CSP aller Seiten ist `script-src 'self'`
ohne `'unsafe-inline'` und ohne `'unsafe-eval'`, zusätzlich
`script-src-attr 'none'` und `frame-src 'none'`.

### Eingaben im Browser

`tools/qa_xss.py` ruft die Seiten mit präparierten Werten in
Query, Fragment und Suchfeld auf: `<img onerror>`, `<svg onload>`,
`</script><script>`, `javascript:` und ein `<iframe>`.

| Messung | Ergebnis |
|---|---|
| Aufrufe mit Angriffsmustern | 61 |
| Muster je Aufruf | 5 |
| Befunde (Markup injiziert oder Code gelaufen) | 0 |
| CSP blockiert nachträglichen Inline-Handler | ja |

## 5. Barrierefreiheit

Automatisch geprüft: Textkontrast nach WCAG AA (4,5:1, große
Schrift 3:1), sichtbarer Tastaturfokus, Formularbeschriftungen,
zugängliche Namen, ARIA-Referenzen, `<main>`-Landmarke und
Sprungmarke. Kein Ersatz für einen Screenreader-Test.

| Messung | Ergebnis |
|---|---|
| Seiten | 34 |
| Kontrastfehler | 0 |
| Fokus nicht sichtbar | 0 |
| Feld ohne Beschriftung | 0 |
| Element ohne zugänglichen Namen | 0 |
| ARIA-Referenz ohne Ziel | 0 |
| Seiten ohne <main> | 0 |
| Seiten ohne Sprungmarke | 0 |

### Tastaturbedienung

`tools/qa_keyboard.py` prüft echtes Verhalten bei 390 px:
Menü öffnen und per Escape schließen (Fokus zurück auf den
Knopf), Suche per Strg+K, Sprachknöpfe, Sprungmarke.

| Messung | Ergebnis |
|---|---|
| Seiten | 5 |
| Einzelprüfungen | 55 |
| Befunde | 0 |

## 6. Gestaltung

`tools/qa_design.py` misst bei 390 px, was sich prüfen lässt und
fast immer ein Fehler ist — Geschmack ist keine Messgröße. Die
Ausnahmen der Norm sind eingebaut: Links mitten im Satz und
Kästchen, deren Label die Trefferfläche bildet, zählen nicht.

| Messung | Ergebnis |
|---|---|
| Seiten | 34 |
| Tap-Ziele unter 24 × 24 px | 0 |
| Zeilen über 90 Zeichen | 0 |
| Schrift unter 12 px | 0 |
| Zeilenhöhe unter 1,25 | 0 |
| Verzerrte Bilder | 0 |
| Überlaufende Elemente | 0 |
| Text am Viewport-Rand | 0 |

Behoben wurden unter anderem die Breadcrumbs auf sechs Seiten
(16–19 px hoch), der Showroom-Regler (18 × 22 px), die
Aktionsspalte der Vergleichstabelle (21 px) und 18 Textstellen
zwischen 9,5 und 11,5 px. Zusätzlich stand die Hinweiszeile der
Marken-Bühne absolut am Abschnittsende und damit unter dem
Kachelraster statt unter der Bühne; sie liegt jetzt im Fluss.

## 7. Ladezeit und Gewicht

Gemessen mit deaktiviertem Browser-Cache je Seite: übertragene
Bytes, Requests, LCP und CLS. Die Zahlen gelten für den lokalen
Server; im Netz kommen Latenz und TLS hinzu.

| Messung | Ergebnis |
|---|---|
| Seiten | 34 |
| Median übertragene Bytes | 1159 KB |
| Größte Seite | 1716 KB |
| Median LCP | 864 ms |
| Schlechtester LCP | 1032 ms |
| Seiten mit CLS über 0,1 | 0 |

Der größte Einzelposten ist three.js (`vendor/`, rund 700 KB) auf
den Seiten mit 3D-Bühne. Er wird nur geladen, wenn eine Bühne in
den Blick kommt; ohne WebGL bleibt die gezeichnete Ersatzbühne.

## 8. 3D-Bühnen (three.js)

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

## 9. Screenshots

`docs/qa/` enthält 34 Desktop-Aufnahmen (1440 × 900) sowie
Startseite in Tablet und Mobil. Sie zeigen den ersten Bildschirm
jeder Seite und dienen der Sichtprüfung von Typografie, Abständen
und 3D-Bühne. Erzeugt mit `tools/qa_shots.py` (WebGL an, damit die
Bühnen im Bild sind).

## 10. Was hier nicht geprüft wird

- **Echte Geräte.** Die Messung läuft in Chromium; Safari und Firefox
  werden nicht automatisch geprüft.
- **Barrierefreiheit nach WCAG.** Kontrast und Fokus sind von Hand
  geprüft, es gibt aber keinen automatisierten Axe-Lauf.
- **Netzwerk unter Last.** GitHub Pages liefert statisch; Latenz und
  Caching-Verhalten der Domain sind nicht Teil dieses Berichts.
- **Formularversand.** `mailto:` öffnet ein Mailprogramm; der Versand
  selbst lässt sich im Browser nicht abschließend testen.

## 11. Wiederholen

```
python3 tools/qa_site.py --static-only
python3 tools/qa_seo.py
python3 -m http.server 8809 --bind 127.0.0.1 &
python3 tools/qa_site.py --base http://127.0.0.1:8809 --out docs/qa --no-shots
python3 tools/qa_three.py --base http://127.0.0.1:8809
python3 tools/qa_security.py
python3 tools/qa_a11y.py --base http://127.0.0.1:8809
python3 tools/qa_xss.py --base http://127.0.0.1:8809
python3 tools/qa_keyboard.py --base http://127.0.0.1:8809
python3 tools/qa_design.py --base http://127.0.0.1:8809
python3 tools/qa_perf.py --base http://127.0.0.1:8809
python3 tools/qa_report.py
```
