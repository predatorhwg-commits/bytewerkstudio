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
| `styles-3d.css` | Rahmen, Masken und Motion-Schalter der 3D-Szenen |
| `scene3d.js` | Three.js-Szenen (`stratum`, `contour`), laedt `vendor/` on demand |
| `scene-studio.js` | Hero-Buehne der Startseite (`#studio-stage`), Modul |
| `styles-studio3d.css` | Styling der Hero-Buehne |
| `styles-forum.css` | Forum-Oberflaeche, nur auf `forum.html` geladen |
| `forum.js` | Forum-Logik: Markdown-Allowlist, Suche, Ratenlimits, localStorage |
| `forum-scene.js` | three.js-Pinwand im Forum-Kopf, Modul |
| `vendor/three.module.min.js` + `vendor/three.core.min.js` | Three.js r180, lokal - die CSP erlaubt nur `'self'` |
| `community.html`, `styles-community.css`, `community.js` | Forum, Abo, Sicherheits-Selbsttest |
| `community-scene.js` | Ideenregal der Community-Seite (three.js) |
| `docs/COMMUNITY.md` | Aufbau und Sicherheitsmodell der Community-Seite |
| `docs/AGENTEN-BRETT.md` | Datei-Ownership, solange das GitHub-Issue fehlt |

#| `scene-notfound.js`, `styles-notfound.css` | Karteikasten auf der 404-Seite, three.js |
# Three.js - eine Regel, ein Build

- Szenen laufen ueber `scene3d.js` und den lokalen Build in `vendor/`.
  Kein CDN: `script-src 'self'` blockt jede fremde Quelle, das faellt erst im
  Browser auf. Wer eine neue Szene baut, haengt sie als Typ in `scene3d.js`
  ein - siehe `docs/SZENE3D.md`.
- Seiten mit eigenem Modul (`scene-studio.js`, `scene-aufbau.js`,
  `showroom-scene.js`, `marke-3d.js`) laden es als `<script type="module">`
  und importieren `vendor/three.module.min.js` - niemals eine eigene Kopie.
- Genau **ein** Three.js-Build im Repo: `vendor/three.module.min.js`
  (laedt `vendor/three.core.min.js` nach). Weitere Builds im Ordner sind
  Zwischenstaende und gehoeren nicht ins Repository.
- Gestaltung: Claude-Look (Papier, Terrakotta, Salbei, serifenlose Ruhe).
  Linien statt Neon, langsame Bewegung, kein Bloom, kein Partikelregen.
- Budget: DPR <= 2, <= 2,6 Mio. Pixel, Start erst im Viewport, Pause im
  Hintergrund-Tab, `prefers-reduced-motion` -> ein statisches Bild.
