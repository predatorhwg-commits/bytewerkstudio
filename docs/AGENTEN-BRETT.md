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


## Abschluss-Lauf 07.11.2026 — Fable (Release/QA)

| Agent | Aufgabe | Dateien | Status | Commit |
|---|---|---|---|---|
| Fable (Release/QA) | Release-Zweig zusammengeführt (Werkstatt, Forum/Community, Sicherheit, Schriften, Zeichenwerk, Schichtmodell, Papierregal) | Integrationsbranch `final/noon`, Arbeitsbranch `fable/qa-release` | fertig | s. `git log fable/qa-release` |
| Fable (Release/QA) | Abo-Stufen vereinheitlicht: Community 0 €, Developer 19 €/190 €, Studio 49 €/490 € — auf `forum.html`, `community.html`, `entwickler.html` | `forum.html`, `forum.js`, `entwickler.html`, `entwickler.js`, `brief.js`, `components.js` | fertig, geprüft | — |
| Fable (Release/QA) | CSP ohne `'unsafe-inline'` für Skripte: Sprachstart → `bootstrap.js`, 19 Seiten-Skripte → `js/inline/*.js`, CSP an erster Stelle im `<head>` | `bootstrap.js`, `js/inline/*` (19), `tools/csp-extract.py`, alle `*.html` | fertig | — |
| Fable (Release/QA) | Schriften lokal auf allen Seiten (`fonts/fonts.css`), keine Google-Fonts-Requests mehr | `fonts/*`, `community.html`, `forum.html`, `entwickler.html`, `zeichenwerk.html`, `abo.html`, `sicherheit.html` | fertig | — |
| Fable (Release/QA) | Bilder: `width`/`height` (105), `loading="lazy"` (86), `decoding="async"`; Layoutsprung und Nachladen außerhalb des Viewports | alle Seiten mit `<img>` | fertig | — |
| Fable (Release/QA) | Marketing/SEO: `hreflang` DE/EN/ES + `x-default` auf 25 Seiten, OG-Bild 1200×630 überall, fehlende Beschreibungen ergänzt | `*.html`, `media/og-*.png` | fertig | — |
| Fable (Release/QA) | Sicherheit: `_headers` (HSTS, frame-ancestors, Permissions-Policy, COOP/CORP), `security.txt`, SECURITY.md, Sicherheitsseite im Footer | `_headers`, `.well-known/security.txt`, `SECURITY.md`, `sicherheit.html` | fertig | — |
| Fable (Release/QA) | Sprachwahl teilbar: `?lang=de|en|es`, Start aus Adresse → Speicher → Browsersprache, URL wird beim Umschalten nachgeführt | `bootstrap.js`, `components.js` | fertig, geprüft | — |
| Fable (Release/QA) | Prüfwerkzeuge: `docs/qa-scan.mjs` (Links, Anker, IDs, CSP, Alt), `tools/img-attrs.py`, `tools/csp-extract.py` | `docs/`, `tools/` | fertig | — |

### Abgrenzung (keine Doppelarbeit)

- **`community.html` = Werkstatt** (Forum-Vorschau, Abo-Stufen, Sicherheits-Selbsttest). **`forum.html` = offenes Forum** (Threads, Wissensarchiv). Beide bleiben, sind aber jetzt im Header und Footer klar getrennt: `Forum` → `forum.html`, `Community & Werkstatt` → `community.html`. Kein zweiter Navigationspunkt „Community-Forum“ mehr.
- **Keine 3D-Szene neu gebaut und keine fremde Szene geändert.** Vorhandene Module (`scene-studio.js`, `scene-workstoff.js`, `schichtmodell.js`, `zeichenwerk.js`, `community-scene.js`, `forum-scene.js`, `scene-sicherheit.js`) bleiben inhaltlich unangetastet; nur die CSP- und Schrift-Einbindung wurde umgestellt.
- **Kein Backend erfunden.** Forum und Community bleiben im lokalen Vorschau-Modus. `supabase/forum-schema.sql` und `docs/FORUM.md` beschreiben den Weg, sind aber nicht aktiv.
- **Fremde Arbeitsverzeichnisse nicht angefasst.** Gearbeitet wurde ausschließlich in `bytewerkstudio-qa` (Branch `fable/qa-release`); alle anderen Worktrees blieben unverändert.
- **Keine gestalterische Neuerfindung.** Der Claude-Look (Papier, Terrakotta, Salbei, Newsreader/Inter/JetBrains Mono lokal) bleibt; ergänzt wurden nur Abstände, Fokus- und Zustandsregeln.

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
- [ ] Übersetzung in eine dritte Sprache
- [ ] Startseiten-Teaser, der auf `community.html` verweist
