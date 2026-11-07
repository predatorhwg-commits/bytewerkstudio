# Bytewerk Website — Arbeitsregeln

Statische Website für bytewerkstudio.com. GitHub Pages veröffentlicht direkt aus
`main`, es gibt keinen Build-Schritt.

## Vor der Arbeit

- Offene Issues lesen: `gh issue list --repo bytewerkstudio/bytewerkstudio --state open`.
- Aufgabe im Issue **„Agenten-Austausch: Aufgaben und Datei-Ownership (Website)“**
  claimen, bevor Dateien geändert werden.
- Dateien, die ein anderer Agent dort beansprucht, nicht ohne Absprache ändern.
- `git pull` vor dem ersten Schreibzugriff, damit alle denselben Stand haben.

## Prüfen vor jedem Push

- `node --check` für jede geänderte JavaScript-Datei.
- Interne Links und Anker prüfen, doppelte IDs vermeiden.
- 1440 px und 390 px ohne horizontales Überlaufen testen.
- 0 Konsolenfehler im Browser.
- Keine Secrets, Keys, Logs, `status.json`, Build-Artefakte oder `*.bak_*`
  committen.

## Koordination

- Ein Kanal: das Agenten-Issue. Kein zweites Parallelsystem.
- Check-in-Format: `Agent | Aufgabe | Dateien | Status | Commit`.
- Wer eine Datei länger als einen Arbeitsschritt offen hat, trägt sie als
  beansprucht ein.
- `main` wird direkt veröffentlicht, deshalb keinen Force-Push und keine
  ungeprüften Sammel-Commits.

## Aktuelle Schichten

| Datei | Zweck |
|---|---|
| `styles.css` | Basis-Theme |
| `styles-v3.css` | Editorial-Layer |
| `styles-auth.css` | Konto und Anmeldung |
| `styles-claude.css` | Claude-Look und V4-Funktionen, wird zuletzt geladen |
| `components.js` | Header, Footer, DE/EN |
| `ui-v4.js` | Suche, Shop-Werkzeuge, Konfigurator |
| `background.js` | Bewegter Hintergrund, code-only |
| `styles-studio3d.css` | Hero-Bühne (Studio-Modell), zuletzt geladen |
| `scene-studio.js` | three.js-Szene der Hero-Bühne (r180 aus `vendor/`) |
| `styles-inline.css` | Erzeugt aus den früheren `style`-Attributen (`tools/csp_styles.py`), lädt zuletzt |
| `nojs.css` | Ersatz für die `<noscript><style>`-Blöcke, nur ohne JavaScript geladen |

## Stile

`style`-Attribute im Markup gibt es nicht mehr — die CSP steht auf
`style-src 'self'`. Neue Einmal-Stile gehören als Klasse in
`styles-inline.css` (über `tools/csp_styles.py` erzeugt) oder in eine der
anderen CSS-Dateien. Einzelne Eigenschaften per JavaScript
(`el.style.visibility = …`) sind erlaubt; ein eingeschobenes `<style>` oder
`setAttribute('style', …)` blockiert die CSP. `tools/csp_styles.py --check`
meldet beides und läuft in der CI.
