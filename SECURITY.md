# Sicherheit — Bytewerk Studio

Meldungen zu Sicherheitslücken bitte an **Haqmalh@icloud.com**.
Mehr dazu in [`docs/SICHERHEIT.md`](docs/SICHERHEIT.md) und in
[`.well-known/security.txt`](.well-known/security.txt).

## Kurzfassung für Meldende

- Die Seite ist statisch. Es gibt keinen Server, keine Datenbank im
  Lieferumfang und keinen Schreib-Endpunkt.
- Bitte URL, Reproduktion und Auswirkung mitschicken. Keine öffentlichen
  PoCs, bevor das Problem behoben ist.
- Wir bestätigen den Eingang in der Regel innerhalb von 72 Stunden und nennen
  einen Zeitplan.
- Auf Wunsch nennen wir dich in der Danksagung.

## Was hier geprüft wird

| Prüfung | Werkzeug |
|---|---|
| CSP-Hashes je Seite | `node tools/csp-hash.mjs . --check` |
| Inline-Skripte ohne Hash | derselbe Lauf, Exit 1 |
| Kein `'unsafe-inline'` in `script-src` | derselbe Lauf |
| Kontrast (WCAG AA) | `probe`-Skripte, siehe `docs/SICHERHEIT.md` |
| Layout 390–1440 px, Konsole, Links | Release-Sweep |

## Geltungsbereich

Alles unter `https://bytewerkstudio.com/`. Fremde Dienste (Google Fonts,
GitHub Pages, optional Supabase) gehören ihren Betreibern; für Meldungen dort
wenden wir uns an den jeweiligen Anbieter.
