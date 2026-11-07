# Bytewerk Studio

Statische Website fuer Bytewerk Studio (bytewerkstudio.com), gehostet auf GitHub Pages.

Design v4 (06.11.2026): Claude-Optik mit warmem Papierweiss, Terrakotta-Akzent,
Serif-Ueberschriften (Newsreader) und ruhigen Flaechen. Basis bleibt
[styles.css](styles.css), darauf liegen [styles-v3.css](styles-v3.css),
[styles-auth.css](styles-auth.css) und die neue Schicht
[styles-claude.css](styles-claude.css). Wird nur die letzte Datei entfernt, ist
das dunkle Theme sofort wieder aktiv.

Funktionen der Schicht: globale Suche (Strg/Cmd+K), Projekt-Konfigurator auf der
Startseite, Shop mit Suche/Sortierung/URL-Zustand, Sticky-Kaufleiste auf
Produktseiten und der App-Finder auf [vergleich.html](vergleich.html).

## Seiten

- `index.html`: Startseite mit Hero, Kennzahlen, Leistungen, Arbeiten, Shop-Auszug, Prozess, Studio, Paketen und FAQ
- `softwareentwicklung-ludwigshafen.html`: lokale SEO-Landingpage fuer Softwareentwicklung, Webentwicklung, App-Entwicklung und IT-Dienstleistungen
- `shop.html`: Shop-Uebersicht mit Suche, Sortierung und Filtern
- `vergleich.html`: App-Finder und Vergleichstabelle aller Produkte
- `arbeiten.html`: Werkverzeichnis aller elf Produkte mit Filter, Tastaturbedienung und drei Fallstudien
- `produkt.html`: Produktdetailseite fuer Lernreich
- `pruefungs-countdown.html`: Produktdetailseite fuer die kostenlose Windows-App Pruefungs-Countdown
- `lernreich-pro.html`: Produktdetailseite fuer die kostenpflichtige Windows-App Lernreich Pro
- `keyforge-vault.html`: Produktdetailseite fuer die kostenpflichtige Windows-App KeyForge Vault
- `lumaweek-planner.html`: Produktdetailseite fuer die kostenpflichtige Windows-App LumaWeek Planner
- `updatepilot.html`: Produktdetailseite fuer die kostenpflichtige Windows-App UpdatePilot
- `bytewerk-pdf-text-pro.html`: Produktdetailseite fuer die kostenpflichtige Windows-App Bytewerk PDF Text Pro
- `mastil.html`: Produktdetailseite fuer das Web- und Windows-Spiel MASTIL
- `neon-dominion.html`: Produktdetailseite fuer das kostenpflichtige Windows-Strategiespiel Neon Dominion
- `burgenwerk.html`: Produktdetailseite fuer das kostenlose Browserspiel BURGENWERK
- `login.html`: Anmeldung
- `register.html`: Registrierung
- `passwort-vergessen.html`: Reset-Anfrage
- `konto.html`: Konto-Dashboard mit Uebersicht, Bibliothek, Bestellungen, Profil und Sicherheit
- `checkout.html`: Download-/Kontaktseite fuer Lernreich
- `marke.html`: die Marke als 3D-Objekt — Aufbau, Regeln, Dateien (three.js)
- `studio.html`: Studio-Profil
- `kontakt.html`: Kontaktformular mit Mail-Weiterleitung
- `impressum.html`, `datenschutz.html`, `agb.html`: Rechtliche Seiten
- `sicherheit.html`: Sicherheitsseite mit Meldeweg für Schwachstellen (Ziel von `.well-known/security.txt`)
- `probierstand.html`: vier Produkt-Werkzeuge live im Browser (Passwort, Countdown, Text, Woche)
- `404.html`: Fehlerseite fuer GitHub Pages
- `404.html`: Fehlerseite fuer GitHub Pages mit Karteikasten (`scene-notfound.js`,
  `styles-notfound.css`): fuenf Ziele als 3D-Karten, Register als normaler Linkweg

## Konto und Anmeldung

Die Auth-Engine ist [auth.js](auth.js), konfiguriert ueber [auth-config.js](auth-config.js).
Zwei Modi:

- `local` (Standard): Konten liegen im Browser, Passwoerter mit PBKDF2-SHA256
  (310.000 Iterationen, Salt) gehasht. Funktioniert sofort, aber nur auf einem Geraet
  und ohne E-Mail-Reset.
- `supabase`: echte Konten mit E-Mail-Bestaetigung, Passwort-Reset und Synchronisierung.
  Einrichtung und Schema stehen in [docs/KONTO.md](docs/KONTO.md) und
  [supabase/schema.sql](supabase/schema.sql).

Der Header zeigt automatisch "Anmelden" oder das Konto-Menue. `konto.html` ist auf
`noindex` gesetzt und nicht in der Sitemap.

## Skripte

- `components.js`: Header, Footer, DE/EN-Umschaltung
- `auth-config.js`, `auth.js`: Registrierung, Login, Session, Dashboard-Daten
- `main.js`: Navigation, Scroll-Reveals, Hero-Canvas
- `ui-v3.js`: Scroll-Fortschritt, Zaehler, FAQ, Spotlight
- `ui-v4.js`: Befehlspalette/Suche, Shop-Werkzeuge, Sticky-Kaufleiste,
  Projekt-Konfigurator, Kontakt-Vorbelegung, Nach-oben-Knopf
- `marke-3d.js`: drehbares 3D-Zeichen auf `marke.html` (three.js r180 aus
  `vendor/`), mit Zerlege-Ansicht, Tastaturbedienung, WebGL-Fallback und
  Standbild bei `prefers-reduced-motion`
- `background.js`: Bewegter, code-only Hintergrund (Canvas), respektiert
  `prefers-reduced-motion` und pausiert in Hintergrund-Tabs
- `probierstand.js` + `scene-probierstand.js` + `styles-probierstand.css`:
  vier echte Werkzeuge (Passwort-Schmiede, Pruefungs-Countdown, Text-Werkstatt,
  Wochenbrett) und eine three.js-Werkbank mit vier Papierwerkzeugen. Alle Daten
  bleiben im Browser (localStorage), kein Backend, kein Upload.
- `scene-workstoff.js` + `styles-workstoff.css`: Materialstudie auf der
  Startseite. 72 Papierkarten formen sich beim Scrollen vom Raster ueber Lagen
  und Koerper zum Feld; Ziehen dreht das Modell. Ohne JavaScript oder WebGL
  steht dort ein CSS-Poster, bei `prefers-reduced-motion` ein fester Zustand.

## Betrieb

Die Seite laeuft direkt auf GitHub Pages unter `bytewerkstudio.com` (CNAME, HTTPS erzwungen).
Nach Aenderungen reicht ein Push auf `main`.

Lokaler Test:

```
python -m http.server 8765
```

Dann `http://127.0.0.1:8765/` oeffnen. Konten funktionieren auch auf `localhost`,
weil Web Crypto dort als sicherer Kontext gilt.

## Sicherheit

Die Seite ist statisch, es gibt kein Backend und keine Datenbank. Gehärtet ist trotzdem:

- **Content Security Policy** auf jeder Seite, direkt nach `<meta charset>`:
  `script-src 'self'`, `font-src 'self'`, `object-src 'none'`, `base-uri 'self'`.
  Keine Inline-Skripte, keine Inline-Handler (`onclick` und Co.), keine Fremd-CDN.
- **Schriften lokal** in `fonts/` (Inter, Newsreader, JetBrains Mono als Variable Fonts,
  latin und latin-ext). Keine Verbindung zu Google Fonts, kein `preconnect` dorthin.
- **Alle Skripte extern** in `page-js/` und `boot.js`. `boot.js` setzt `js`-Klasse und
  Sprache, bevor gerendert wird.
- **Formulare** nutzen `method="post"` und senden nichts an Dritte; das Kontaktformular
  öffnet das lokale Mailprogramm.
- **Konten** lokal mit PBKDF2-SHA256 (310.000 Iterationen, Salt); `register.html`
  rendert Nutzereingaben über DOM-APIs statt `innerHTML`.
- **`.well-known/security.txt`** mit Meldeweg, Frist und Sprache; die verlinkte
  Erklärseite ist `sicherheit.html`.

## Qualitätssicherung

Drei Skripte prüfen die Seite vor jedem Push (Python 3 + Playwright):

```
python3 tools/qa-site.py  http://127.0.0.1:8907   # 64 Seiten × 2 Viewports
python3 tools/qa-flow.py  http://127.0.0.1:8907   # 21 Interaktionstests
python3 tools/qa-links.py                          # 911 interne Links und Anker
```

`qa-site.py` prüft Status, Konsolenfehler, fehlgeschlagene Requests, fremde Hosts,
horizontalen Überlauf, genau eine H1, Alt-Texte, doppelte IDs, Inline-Skripte und die
CSP. `qa-flow.py` prüft Suche (Strg+K), FAQ-Akkordeon, DE/EN, mobiles Menü, Skip-Link,
Formular-Methoden und den Shop-Filter. `qa-links.py` läuft ohne Server über das
Dateisystem und prüft auch Anker.

Ergebnis des letzten Laufs: 0 Probleme, 0 Konsolenfehler, 0 Überlauf bei 1440 und 390 px.
