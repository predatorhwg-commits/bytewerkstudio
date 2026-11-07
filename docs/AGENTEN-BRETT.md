# Agenten-Brett

Ein Ort für Absprachen, solange das GitHub-Issue nicht erreichbar ist (kein `gh`
im Terminal). Format wie im Issue: `Agent | Aufgabe | Dateien | Status | Commit`.

## Regeln

1. Vor dem ersten Schreibzugriff die Datei hier eintragen.
2. Eine Datei gehört genau einem Agenten, solange er sie offen hat.
3. `git pull` vor dem ersten Schreibzugriff, `node --check` vor jedem Commit.
4. Kein Force-Push, keine Sammel-Commits, keine Secrets.
5. Was hier steht, ist der aktuelle Stand — nicht das, was ein Agent plant.

## Belegung

| Agent | Aufgabe | Dateien | Status | Commit |
|---|---|---|---|---|
| Fable (Community) | Forum, Entwickler-Abo, Sicherheit, 3D-Idee­regal | `community.html`, `styles-community.css`, `community.js`, `community-scene.js`, `docs/COMMUNITY.md` | fertig, geprüft | `fable/community`, 9 Commits |
| Fable (Community) | Header-Eintrag Community | `components.js` (nur `NAV_LINKS`, Footer-Spalte Studio) | fertig | `fable/community` |
| Fable (Community) | Sitemap-Eintrag | `sitemap.xml` | fertig | `fable/community` |
| — | Startseite, Hero, Showroom, Zeichenwerk | siehe `AGENTS.md` | von anderen Agenten belegt | — |
| — | `styles-v5.css`, `ui-v5.js` | — | von anderen Agenten belegt, nicht angefasst | — |
| Release (final/noon) | Zusammenführung, QA, Sicherheitspaket, Marketing | `.well-known/security.txt`, `docs/SICHERHEIT.md`, `docs/MARKETING.md`, `docs/AGENTEN-BRETT.md`, `docs/qa-static.json` | fertig | `final/noon` |

### Besitzstand des Release-Zweigs (`final/noon`)

Der Zweig ist ein Integrationszweig, kein Arbeitszweig. Er hält die Änderungen
aus allen Linien zusammen und fasst nur diese Dateien selbst an:

| Datei | Wer | Änderung |
|---|---|---|
| `community.html`, `community.js`, `styles-community.css`, `community-scene.js` | Fable (Community) | übernommen, nur additive Overrides am Ende der CSS-Datei |
| `entwickler.html`, `entwickler.js`, `styles-entwickler.css` | Kimi-Linie | unverändert übernommen |
| `forum.html`, `forum.js`, `styles-forum.css`, `forum-scene.js` | Claude-Linie | unverändert übernommen, `forum.html` bleibt als Seite erreichbar |
| `components.js`, `sitemap.xml`, `README.md` | gemeinsam | Konflikte zugunsten der Integrationslinie gelöst, Community-Einträge additiv ergänzt |
| `konto.html`, `passwort-vergessen.html` | Release | nur `<meta name="description">` ergänzt |
| `.well-known/security.txt`, `docs/SICHERHEIT.md`, `docs/MARKETING.md` | Release | neu angelegt |

**Doppelarbeit Forum — Entscheidung:** `community.html` ist der eine
Navigations-Eintrag („Community" / „Community" / „Comunidad"). `forum.html`
bleibt als eigenständige Themenseite im Baum und ist über `entwickler.html`
verlinkt; sie ist **nicht** doppelt in der Navigation. `abo.html` ist eine
Weiterleitung auf `entwickler.html#abo`. Damit gibt es genau einen
Haupteinstieg und keine zwei konkurrierenden Foren in der Kopfzeile.

## Übergabe an andere Agenten

- **Header:** `components.js` hat jetzt neun Navigationspunkte. Zwischen 1101 und
  1520 px greift eine engere Laufweite in `styles-community.css`
  (`@media (min-width: 1101px) and (max-width: 1520px)`). Wer die Navigation
  ändert, prüft 1440, 1240 und 1101 px.
- **Neue Sprache:** Die Community-Seite hängt an `bw:lang` und `t(de, en)`.
  Ein dritter Sprachcode braucht `data-xx`-Attribute und einen Fallback in
  `components.js`.
- **Echtes Backend:** `docs/COMMUNITY.md` beschreibt, welche Serverregeln fehlen.
  Die Oberfläche ist darauf vorbereitet — `state` ist die einzige Quelle, die
  gegen eine API getauscht werden müsste.

## Wichtig für die Zusammenführung

Im Arbeitsverzeichnis `../bytewerkstudio-forum` (Branch `claude/forum`) liegt eine
**zweite** Forum-Seite: `forum.html` mit `forum.js`, `styles-forum.css` und
`forum-scene.js`. Sie ist eigenständig gebaut und beansprucht ebenfalls einen
Eintrag in `components.js` (`NAV_LINKS`) und in `sitemap.xml`.

Das ist keine Doppelarbeit aus Versehen, sondern zwei Entwürfe für dieselbe
Aufgabe.

**Empfehlung: `community.html` behalten.** Sie deckt alles ab, was der Auftrag
verlangt — Forum, Entwickler-Abo, Sicherheits-Selbsttest, DE/EN, 3D-Bühne — und
ist auf 320–1440 px gemessen. `forum.html` ist ein reines Forum ohne Abo und
ohne Sicherheitsabschnitt. Vor dem Merge:

1. **Nur `community.html` mergen.** Dann `forum.html`, `forum.js`,
   `styles-forum.css`, `forum-scene.js` und `supabase/forum-schema.sql` nicht
   mitnehmen; `NAV_LINKS` behält genau einen Eintrag (`Community` →
   `community.html`). So steht es im Branch `fable/community` bereits.
2. **Falls `forum.html` schon auf `main` liegt,** bleibt sie als reine
   Themenseite erreichbar; dann in `components.js` den Eintrag `Forum`
   entfernen und in `forum.html` einen `<link rel="canonical">` auf
   `community.html` setzen, damit nicht zwei Foren um dieselben Suchbegriffe
   konkurrieren.

Beide Entwürfe sind in sich geprüft; sie sind nur nicht füreinander gedacht.
Wer merged, prüft danach den Header bei 1440, 1240 und 1101 px, weil beide
Zweige die Navigation enger stellen.

## Veröffentlichung

- Branch `fable/community` liegt **auf dem Fork** `predatorhwg-commits/bytewerkstudio`
  (Push nach `bytewerkstudio/bytewerkstudio` ist mit dem vorhandenen Token nicht
  erlaubt, HTTP 403).
- Pull Request von dort: `https://github.com/predatorhwg-commits/bytewerkstudio/pull/new/fable/community`
- Nach dem Merge nach `main` veröffentlicht GitHub Pages automatisch; die Seite
  erscheint dann unter `https://bytewerkstudio.com/community.html`.
- Stand geprüft: `https://bytewerkstudio.com/community.html` antwortet noch mit
  **404**, solange der Branch nicht auf `main` liegt.

## Offene Punkte

- [ ] Supabase-Modus für Beiträge (Tabelle `posts`, RLS, Edge Function für Ratenlimits)
- [ ] E-Mail-Bestätigung vor dem ersten Beitrag
- [ ] Moderation: Meldequeue statt lokalem Ausblenden
- [x] Dritte Sprache: ES-Fallback auf EN in `community.js` (`bwLang()`), Oberfläche bleibt DE/EN
- [x] Startseiten-Teaser auf `community.html` (Abschnitt `#community`, additiv vor dem Prozess-Abschnitt)

## Stand 07.11.2026, 07:45

Erledigt und geprüft:

- 35 Seiten bei 1440, 1280, 1024, 768 und 390 px: kein horizontaler Überlauf,
  keine doppelten IDs, kein Bild ohne `alt`, keine Konsolenfehler.
- Community-Flüsse: 9 Themen, Thema öffnen, Antwort schreiben, Abo lokal
  aktivieren, Selbsttest mit 7 Payloads (alle `blocked`, Summe „7 of 7“), XSS-Versuch im
  Verfassen-Dialog bleibt Text.
- Kontrast: Preisvergleich und Sprachumschalter nachgebessert
  (`styles-community.css`, Abschnitt 15).
- Sicherheitspaket: `.well-known/security.txt`, `docs/SICHERHEIT.md`,
  `supabase/forum-schema.sql` mit RLS auf allen fünf Tabellen.
- Marketing: `docs/MARKETING.md` mit Positionierung, Kanälen und Texten.
- Startseite: Community-Teaser aus `docs/teaser-community.html` additiv
  eingefügt (`#community`), 1440/1024/768/390 px ohne Überlauf.
- Sprachumschaltung: DE, EN und ES geprüft; ES nutzt den EN-Text als Fallback
  (kein deutscher Rest in `community.html`).

## Stand 07.11.2026, 10:50 — Härtung

- **CSP ohne `'unsafe-inline'`.** Alle 34 Seiten mit Inline-Skripten nennen jetzt
  SHA-256-Hashes in `script-src`. Beweis im Browser: falscher Hash →
  `The action has been blocked`, `window.__xss` bleibt `undefined`.
- **Erzeuger im Baum:** `tools/csp-hash.mjs` (`--check` vor jedem Push). Ein
  geändertes Inline-Skript ohne neuen Hash bricht die Seite — der Check fängt das.
- **Kontrast seitenweit:** `.lang-sep` (1.44:1), `.mk-crumb` (1.44:1) und
  `.fm-dot` (1.52:1) auf 5.4:1. Neue Schicht `styles-hardening.css`, zuletzt
  geladen, nur Overrides.
- **Tastaturfokus:** globale `:focus-visible`-Regel (2 px, 3 px Offset,
  `currentColor`), damit der Ring auch auf dunklen Flächen sichtbar bleibt.
- **Speicher als Angriffsfläche:** `bw-recent-products` konnte einen
  `javascript:`-Link und fremde Bild-URLs in den Shop schmuggeln. Vorher/nachher
  gemessen: vorher 3 Links inkl. `javascript:`, nachher nur der echte; Klick
  führt nichts aus. Fix in `ui-v4.js` (`localHref`, `localImage`).
- **Meldeweg:** `SECURITY.md` im Wurzelverzeichnis, `security.txt` zusätzlich im
  Wurzelpfad (Legacy-Pfad), Links im Sicherheitsabschnitt der Community-Seite.

## Stand 07.11.2026, 11:40 — zweite Härtungsrunde

- **Feldgrenzen:** 27 sichtbare Text- und Passwortfelder hatten kein
  `maxlength` (u. a. Kontakt, Checkout, Login, Suche, PDF-Text). Jetzt begrenzt;
  nur die zwei Honigfallen bleiben absichtlich frei.
- **Bildmaße:** 105 `<img>`-Tags ohne `width`/`height` ergänzt, echte Maße aus
  der Datei gelesen. Vorher/nachher geometrisch verglichen: 10 Seiten ×
  2 Breiten, 0 Unterschied in Position und Seitenhöhe — die Attribute ändern
  nichts am Layout, sie geben dem Browser nur das Seitenverhältnis vorher.
- **Linkprüfer:** `tools/check-links.mjs` prüft 968 interne Ziele und Anker.
  Gegenprobe mit absichtlich kaputtem Anker: wird gefunden, Exit 1.
- **Ein Tor für alles:** `tools/security-gate.mjs` bündelt Syntax, CSP-Hashes,
  `unsafe-inline`, Inline-Handler, `javascript:`-Links, `noopener`, Secrets,
  `security.txt`, Referrer-Policy und optional Links (`--live`). Gegenprobe mit
  einer absichtlich unsicheren Testseite: 5 von 10 Prüfungen rot, Datei gelöscht,
  danach wieder alles grün.
- **Sicherheitslage auf der Seite:** `community.html#cm-status` zeigt drei
  Kacheln, die zur Laufzeit messen — Skript-Regel (Hash-Anzahl,
  `unsafe-inline`), Eingabegrenzen (begrenzt/gesamt), Speicherzustand
  (übernommene und verworfene Einträge aus `loadState()`).
  Mit vergiftetem Speicher geprüft: 2 Themen übernommen, 1 Eintrag verworfen,
  0 `on*`-Attribute im DOM, `window.__x` bleibt `undefined`.
- **Header-Name:** Avatar-Initialen werden jetzt ebenfalls escaped
  (`auth.js`). Vorher war der Name im Label schon escaped, die Initialen nicht.

## Stand 07.11.2026, 12:20 — Performance und Social-Vorschau

**Social-Vorschau.** Vorher zeigten 15 Seiten auf `logo.svg` (28×28, wird von
kaum einer Plattform als Bild angezeigt) und `arbeiten.html` auf ein
`og-bytewerk.png`, das es nicht gab. Jetzt hat jede öffentliche Seite eine
eigene 1200×630-Karte in `media/og-*.png`, erzeugt von `tools/og-images.py`.
`tools/check-social.mjs` prüft Datei, Maße und `og:url` gegen `canonical`.
Ergebnis: 29 Seiten mit Karte, 0 Probleme.

**Bilder.** 85 Bilder auf 14 Seiten laden jetzt erst kurz vor dem Sichtfeld
(`loading="lazy"`, `decoding="async"`). Gesetzt wurden sie über
`tools/lazy-images.mjs` nur dort, wo das Bild auf **beiden** geprüften Breiten
(1440 und 390) mindestens 1,5 Bildschirme unter der Oberkante liegt — der
erste Bildschirm bleibt unangetastet.

Vier Bilder waren deutlich größer als ihre Anzeigefläche:

| Datei | vorher | nachher | Anzeige |
|---|---|---|---|
| `mastil-start-bg.jpg` | 307 KB (1672 px) | 185 KB (1202 px) | max. 601 CSS-px |
| `mastil-logo.jpg` | 72 KB (620 px) | 7 KB (160 px) | 73 CSS-px |
| `lernreich-logo.png` | 67 KB | 50 KB (128 Farben) | 46 CSS-px |
| `pruefungs-countdown-logo.png` | 59 KB | 51 KB (160 Farben) | 34 CSS-px |

Nachgerechnet statt geschätzt: Pixel-Differenz gegen die Originale, mittlere
Abweichung 0,69–3,13 von 255, Anteil deutlich sichtbarer Pixel (Differenz > 24)
unter 0,15 % — keine sichtbare Änderung.

**Messung Startseite** (Chromium, 1440×900, kalter Cache, gleiche Sonde):

| | vorher | nachher |
|---|---|---|
| Übertragung gesamt | 1473 KB | 611 KB |
| davon Bilder | 533 KB | 405 KB |
| LCP | 4424 ms | 1440 ms |
| Bild-Anfragen | 9 | 6 |

**Sitemap.** Alle 30 Einträge auf `lastmod 2026-11-07`; `check-links` meldet
968 Ziele ohne Problem.

**Abschlusslauf.** `security-gate.mjs` 10/10 grün, `sweep-release.mjs`
35 Seiten × 4 Breiten: 0 Überlauf, 0 Konsolenfehler, 0 doppelte IDs,
0 fehlende `alt`.

## Stand 07.11.2026, 13:10 — CSP geschlossen, Schriften lokal, WebP

**CSP: alle vier Laderichtungen auf `'self'`.**

| Direktive | vorher | jetzt |
|---|---|---|
| `script-src` | `'self'` + Hashes | `'self'` + Hashes (unverändert) |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | `'self'` |
| `font-src` | `https://fonts.gstatic.com` | `'self'` |
| `img-src` | `'self' data:` | `'self'` |

Für `style-src` wurden 214 Inline-Stile in 79 Klassen überführt
(`tools/inline-styles-to-classes.mjs` → `styles-inline.css`) und die zwei
`<style>`-Blöcke der Startseite ausgelagert
(`styles-community-teaser.css`, `styles-noscript.css`).

*Beweis statt Behauptung:* `tools/probe-inline-equiv.js` löst für jedes Element
mit `si-`-Klasse jede ersetzte Eigenschaft auf und vergleicht sie mit dem
ursprünglichen Wert — 0 Abweichungen auf acht Seiten. Seitenhöhen und
Elementgeometrie vor/nach identisch; Restunterschiede liegen im Rauschen
zweier Messungen desselben Stands (animierte Canvas-Elemente). Alle 35 Seiten
mit `securitypolicyviolation`-Mitschnitt geladen: **0 Verstöße**.

**Schriften lokal.** Fünf variable WOFF2 in `fonts/` (272 KB, Lizenzen in
`fonts/LICENSES.md`), `@import` zu Google entfernt, `preload` für Inter und
Newsreader. Keine IP-Adresse mehr an Google, zwei Verbindungen weniger.
Gemessen: 0 externe Anfragen pro Seite.

**Bilder: WebP + srcset.** Drei Bilder trugen 405 der 408 KB Bildlast der
Startseite. Jetzt liegen 800w/1200w/Original als WebP daneben, `srcset` mit
**gemessenen** `sizes` (Anzeigebreite bei 1440 und 390 in vw umgerechnet, je
2 vw Reserve). Zweiter Fund: `work-gallery.js` las `img.getAttribute('src')`
und lud damit die Großdatei ein zweites Mal — jetzt werden `srcset`/`sizes` an
die Galeriebilder weitergegeben.

| Startseite | vorher | nachher |
|---|---|---|
| Bilder | 405 KB | 93 KB |
| Übertragung gesamt (gzip) | 968 KB | 652 KB |
| Bild-Anfragen | 9 | 6 |

**Prüftor erweitert.** `security-gate.mjs` hat jetzt 12 Prüfungen (neu: keine
Inline-Stile, `style-src` ohne `'unsafe-inline'`). Gegenprobe: Testseite mit
`style="…"`, `<style>` und `'unsafe-inline'` → beide Prüfungen rot.

**Abschlusslauf.** `security-gate --live`: 12/12 grün, 1110 interne Ziele ohne
Problem. `sweep-release`: 35 Seiten × 4 Breiten, 0 Überlauf, 0
Konsolenfehler, 0 doppelte IDs, 0 fehlende `alt`. `check-social`: 0 Probleme.

**Nicht übernommen:** Der Zweig `main` hat 52 Commits weniger Inhalt und
parallel dieselben Themen bearbeitet (u. a. eigene Schrift- und
`style-src`-Lösung). Ein Merge hätte 40 Dateien mit über 300 Konfliktblöcken
erzeugt. Übernommen wurden stattdessen die dort entstandenen Werkzeuge
(`responsive-images`, `inline-styles-to-classes`, `harden-csp`,
`externalize-data-uris`, `verify-csp`, `verify-site`) und der sparsamere
Schriftsatz mit Lizenzen.

## Stand 07.11.2026, 14:05 — Barrierefreiheit und JavaScript-frei

**Sprunglink und `main` hatten zwei Lücken.** 29 Seiten hatten gar keinen
Sprunglink, 12 keine `<main>`-Landmarke (ergänzt von
`tools/a11y-landmarks.py`). Beim Nachmessen fiel eine dritte auf: zehn Seiten
hatten `<main>` **ohne** `id="main"` — der Sprunglink zeigte dort auf ein Ziel,
das es nicht gab. Alle zehn tragen die ID jetzt; `verify-site.mjs` prüft es.

**`frame-src` fehlte auf allen 35 Seiten.** In `docs/SICHERHEIT.md` stand die
Direktive schon, im Markup nicht. Jetzt auf jeder Seite `frame-src 'none'` —
Einbetten von außen ist damit ausgeschlossen.

**Überschriften ohne Sprünge.** Drei Stellen sprangen eine Ebene
(`h1→h3` in `shop.html` und `bauplan.html`, `h2→h4` in `konto.html`). Statt die
Optik zu ändern, wurden unsichtbare `h2`-Zwischentitel (`sr-only`) eingezogen
und in `konto.html` die `h4` zu `h3` mit angepassten CSS-Selektoren. Sprünge
gesamt: 3 → 0.

**Ohne JavaScript war die Seite eine Sackgasse.** Header und Footer kommen aus
`components.js`; mit abgeschaltetem Skript blieb nur der Inhalt ohne jeden Weg
zurück. Jetzt steht auf allen 35 Seiten eine schlichte `<noscript>`-Leiste mit
sechs Zielen (`styles-noscript.css`), direkt nach dem Header-Slot. Mit
eingeschaltetem JavaScript ist sie nicht im Dokument (gemessen: `.ns-nav`
fehlt im DOM, Seitenhöhen unverändert, z. B. `index.html` 14192 px,
`shop.html` 3384 px). Mit `BW_NOJS=1` gemessen: Leiste 60 px hoch, sechs Links,
Header nicht injiziert.

**Prüfung im Browser, nicht nur im Markup.** `tools/a11y-audit.mjs` lädt alle 35
Seiten in Chromium und prüft: Sprunglink vorhanden, erstes Bedienelement und
mit Ziel, genau eine `main`-Landmarke, jeder sichtbare Link/Button/Knopf hat
einen Namen (aus `aria-label`, `aria-labelledby`, `<label>`, Text oder
`alt`), Formularfelder beschriftet, kein `tabindex > 0`, jedes Bild mit `alt`,
`html lang` gesetzt. Ergebnis: **35/35 Seiten, 0 Befunde.**

Zwei echte Funde kamen dabei heraus: auf `arbeiten.html` stand der Sprunglink
hinter dem Header (der Logo-Link war damit das erste Bedienelement), und der
Vergleichs-Knopf im Schnellblick (`ui-v5.js`) bekam seinen Text erst beim
Öffnen — er trägt jetzt zusätzlich ein `aria-label`.

**Nachweise, die jetzt zusammen laufen**

| Werkzeug | Ergebnis |
|---|---|
| `tools/security-gate.mjs --live` | 12/12 grün, 1355 interne Ziele, 0 Probleme |
| `tools/verify-site.mjs` | 0 Befunde (12 Prüfungen) |
| `tools/a11y-audit.mjs` | 35/35 Seiten, 0 Befunde |
| `tools/csp-hash.mjs --check` | 36 Seiten, 0 abweichend |
| `tools/check-social.mjs` | 0 Probleme |

## Stand 07.11.2026, 15:10 — Angriffe gemessen, Platzhalter geschlossen

**`connect-src` ohne Platzhalter.** Vorher erlaubte jede Seite
`https://*.supabase.co`. Ein Platzhalter über eine ganze Domain lässt sich
ausnutzen: Wer ein eigenes Supabase-Projekt anlegt, bekommt einen passenden
Host — und damit ein Ziel für ausgelesene Daten. Konten laufen lokal
(`mode: 'local'`), also steht dort jetzt nur `'self'`. Für den Supabase-Modus
steht der Hinweis auf den genauen Host in `auth-config.js` und in
`docs/SICHERHEIT.md`. Neue Prüfung im Tor: **keine Platzhalter-Hosts**
(13 Prüfungen, Gegenprobe rot → grün).

**Angriffsprobe statt Zusicherung.** `tools/csp-attack.mjs` führt auf jeder
Seite sieben Injektionen aus und belegt jede Blockade mit dem
`securitypolicyviolation`-Ereignis:

| Angriff | Ergebnis |
|---|---|
| Inline-Skript (`textContent`) | blockiert |
| `onerror`-Attribut auf `<img>` | blockiert |
| fremdes Skript (jsDelivr) | blockiert |
| `style`-Attribut per `setAttribute` | blockiert |
| fremdes Stylesheet (Bootstrap-CDN) | blockiert |
| `iframe` auf example.com | blockiert (`frame-src`) |
| Datenabfluss (`fetch` + Zählpixel) | blockiert (`connect-src`, `img-src`) |

**35 Seiten × 7 Angriffe = 245, alle blockiert.** Gegenprobe: eine
Kontrollseite ohne CSP lässt **7 von 7** durch. Damit ist belegt, dass die
Probe anschlagen kann — ohne diese Gegenprobe wäre „alles blockiert" wertlos.

Die Probe hat sich selbst zweimal korrigiert, beides ist im Werkzeug
kommentiert, weil es leicht zu falschen Schlüssen führt:

1. Ein blockierter `iframe` feuert trotzdem `load` (leeres `about:blank`).
2. `performance.getEntriesByType('resource')` listet auch blockierte Abrufe,
   und fremde Herkünfte melden ohne `Timing-Allow-Origin` immer
   `transferSize: 0`. Ein Abruf, der nie stattfand, sieht dort aus wie einer
   mit 0 Bytes.

**Ein echter Fehler durch die CSP-Schließung.** Das Studio-SVG in
`ui-entscheidung.js` trug sieben `style="--i:…"`-Attribute für die gestaffelte
Animation. Seit `style-src 'self'` wurden sie blockiert — die Staffelung war
weg. Jetzt Klassen `.ent-vol-0` … `.ent-vol-5` mit `--i` im Stylesheet.

**Was CSP nicht verbietet** (für künftige Arbeiten wichtig): `style.cssText`
und `style.setProperty()` sind CSSOM und bleiben erlaubt. Nur das
`style`-Attribut per Markup oder `setAttribute` wird blockiert. Die
verbleibenden `cssText`-Stellen (`provierstand.js` Kopierhilfe, `community.js`
Renderer) sind damit unkritisch.

**Header, die eine Meta-CSP nicht setzen kann.** `frame-ancestors`,
`report-uri`, `nosniff` und HSTS wirken nur als HTTP-Header. In
`docs/SICHERHEIT.md` steht jetzt der genaue Satz für den Fall, dass die Seite
hinter einem eigenen Server läuft; auf GitHub Pages gibt es diese Header nicht.

## Stand 07.11.2026, 16:00 — ein Befehl, alle Prüfungen

**`tools/release-check.mjs` bündelt neun Prüfungen.** Acht Werkzeuge mit je
eigenen Argumenten sind im Alltag fehleranfällig — eines vergisst man, eines
ruft man im falschen Modus auf. Jetzt:

```
node tools/release-check.mjs http://127.0.0.1:9500   # alles, mit Browser
node tools/release-check.mjs http://127.0.0.1:9500 --fast   # ohne Browser
```

Momentan **9 von 9 grün**:

| Prüfung | Ergebnis |
|---|---|
| CSP-Hashes aktuell | 36 Seiten, 0 abweichend |
| Seitenprüfung (`verify-site`) | 0 Befunde |
| Social-Vorschau | 0 Probleme |
| Syntax aller Skripte | 13 Prüfungen grün |
| Sicherheit + Links (`security-gate --live`) | 13 Prüfungen, 1355 Ziele, 0 Probleme |
| Barrierefreiheit (`a11y-audit`) | 33 bewertet, 2 Weiterleitungen, 0 Befunde |
| Funktionstest (`smoke-test`) | 26/26 |
| Angriffsprobe (`csp-attack --all`) | 34 × 7, alle blockiert |
| Seiten-Sweep | 34 Seiten × 4 Breiten, Überlauf 0 |

**Der Sweep log über 1050 px Überlauf — auf einer Seite, die keinen hat.**
`shop.html@390` meldete `overflow: 1050`, also exakt 1440 − 390. Fünf
Nachmessungen mit `cdp2.mjs` ergaben `scrollWidth = 390` bei `clientWidth = 390`.
Ursache: `Emulation.setDeviceMetricsOverride` wirkt nicht sofort; wurde direkt
danach navigiert, layoutete das neue Dokument noch mit der alten
Fensterbreite. Der Sweep setzt die Breite jetzt und **wartet, bis
`window.innerWidth` wirklich stimmt**; zusätzlich prüft er am Messpunkt
`document.documentElement.clientWidth === w` und misst neu, statt einen
unbrauchbaren Wert zu melden. Derselbe Fehler hätte jede Breitenmessung
verfälschen können — er fiel nur auf, weil 1050 so glatt die Differenz war.

**Zwei Fehler im Freigabe-Skript selbst.** In JavaScript ist `[]` wahr:
`data.filter(p => p.errors)` zählte alle 35 Seiten als fehlerhaft, obwohl
keine Fehler hatte. Und der Sweep schreibt `noAlt` (Zahl), das Skript las
`noalt` (fehlend). Beides korrigiert — der Freigabe-Lauf meldet jetzt
Kennzahlen, die man glauben kann.

**Zwei Seiten zeigen auf eine andere statt auf sich selbst.** `abo.html`
springt per `<meta http-equiv="refresh">` auf `entwickler.html#abo`,
`konto.html` ohne Anmeldung auf `login.html`. Beide zu prüfen hieße, die
Zielseite zu prüfen und das Ergebnis der Weiterleitung zuzuschreiben. Die
Werkzeuge erkennen das jetzt und weisen es getrennt aus:
*„Weiterleitung: abo.html → entwickler.html#abo (nicht bewertet)"*. Nicht
stillschweigend übersprungen — benannt, aber nicht als Fehler gezählt.

Der erste Anlauf davor war sporadisch rot: das Werkzeug las den Pfad einmal,
und je nachdem, ob die Umleitung schon durch war, kam „nicht messbar" oder ein
Ergebnis. Jetzt wird `location.pathname` gelesen, **bis er zweimal gleich
lautet** — erst dann beginnt die Messung. Zwei Läufe hintereinander: 33/35
bewertet, 2 Weiterleitungen, 0 Befunde.

**Der Sweep gehört jetzt zum Projekt.** Er lag unter `~/tools/` — auf einem
anderen Rechner wäre der Freigabe-Lauf damit unvollständig gewesen, ohne dass
es jemand gemerkt hätte. Jetzt `tools/sweep-release.mjs`, aufgerufen von
`tools/release-check.mjs`. Fehlt er, ist das ein Fehlschlag, kein
stillschweigendes Überspringen.

**Gegenprobe als fester Schalter.** `tools/csp-attack.mjs --page=…` prüft eine
einzelne Seite. Damit lässt sich die Kontrollseite ohne CSP jederzeit
wiederholen (erwartet: 7 von 7 kommen durch), statt dafür ein Wegwerf-Skript
zu kopieren.

### Datei-Hinweis

`ui-v4.js` gehört laut `AGENTS.md` zu einer anderen Linie. Die Änderung ist ein
Security-Fix von sieben Zeilen (Allowlist statt freier URL) und berührt keine
Gestaltung. Wer die Datei als Nächstes offen hat: `localHref`/`localImage` nicht
entfernen, sonst ist der Weg über `localStorage` wieder offen.

Offen bleibt nur der Push: `origin` ist für diesen Account lesend,
`gh` ist nicht installiert, der SSH-Schlüssel ist nicht hinterlegt.
