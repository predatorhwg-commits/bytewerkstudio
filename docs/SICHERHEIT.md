# Sicherheit — technische Aufstellung

Stand: 7. November 2026 · gilt für `main` dieser Website.

Dieses Dokument beschreibt, was tatsächlich im Code steht — auch die
Stellen, die **nicht** ideal sind. Eine Sicherheitsseite, die nur Erfolge
aufzählt, ist Marketing. Diese hier ist ein Prüfbericht.

## 1. Angriffsfläche

| Faktor | Stand |
|---|---|
| Hosting | GitHub Pages, statische Dateien, kein Build-Schritt |
| Server-Code | keiner — kein PHP, kein Node, keine API |
| Datenbank | keine im Betrieb; Supabase nur als optionale Variante (`auth-config.js`, `mode: 'local'`) |
| Formulare | Kontakt und Check laufen über `mailto:` bzw. rein im Browser |
| Fremde Skripte | **keine** |
| Fremde Requests | **keine** — Schriften in `fonts/`, three.js in `vendor/` |
| Tracking | keins, keine Cookies für Analyse, kein Pixel |

Ohne Server gibt es keine serverseitigen Lücken — dafür auch keine
serverseitigen Schutzschichten. Der interessante Teil ist der Browser.

## 2. Content-Security-Policy

Auf allen 34 ausgelieferten Seiten identisch und ohne Ausnahme:

```
default-src 'self';
script-src  'self';
script-src-attr  'none';
script-src-elem  'self';
style-src   'self';
font-src    'self';
img-src     'self' data:;
object-src  'none';
base-uri    'self';
form-action 'self' mailto:;
connect-src 'self' https://*.supabase.co;
frame-src   'none';
worker-src  'none';
upgrade-insecure-requests
```

Die Google-Verifizierungsdatei `google3491bb2e3bfcb9d2.html` ist reiner Text
ohne CSP — sie enthält aber auch kein HTML, das ausgeführt würde.

### Was das verhindert

- `script-src 'self'` **ohne `'unsafe-inline'` und ohne `'unsafe-eval'`** —
  injizierte `<script>`-Blöcke, `onerror=`-Attribute, `eval`, `new Function`
  und String-Timer laufen nicht. Das ist der wichtigste Unterschied zu vorher.
- `script-src-attr 'none'` — Inline-Handler sind zusätzlich einzeln verboten,
  auch wenn ein Browser `script-src` großzügiger auslegt.
- `script-src-elem 'self'` — `<script src>` darf nur von der eigenen Domain
  kommen; eine fremde Einbindung ist nicht möglich.
- `frame-src 'none'` und `worker-src 'none'` — kein Nachladen von Frameworks
  oder Workern von außen.
- `default-src 'self'` — kein Nachladen von Bildern, Schriften oder Frames von
  fremden Hosts.
- `object-src 'none'` — kein Plugin-Einbettungskanal.
- `base-uri 'self'` — kein `<base href>`-Trick, der relative URLs umbiegt.
- `form-action` begrenzt, wohin Formulare senden dürfen.

### Wie der Umbau aussieht

Alle Inline-Skripte sind ausgelagert:

| vorher | jetzt |
|---|---|
| `<script>document.documentElement.classList.add('js')…</script>` auf jeder Seite | `bootstrap.js` (synchron, vor dem ersten Paint) |
| Seitenskripte in `<script>`-Blöcken | `inline/<seite>-<n>.js` (19 Dateien) |
| `script-src 'self' 'unsafe-inline'` | `script-src 'self'` + `script-src-attr 'none'` |
| Forum mit SHA-256-Hash | `script-src 'self'`, kein Hash nötig |

JSON-LD bleibt inline, weil es kein ausführbares Skript ist (`type="application/ld+json"`);
eine CSP mit `script-src 'self'` blockiert es nicht.

### Stile ohne Ausnahme

`style-src 'self'` gilt ohne `'unsafe-inline'`. Damit das möglich ist, sind
alle 196 `style`-Attribute aus dem Markup in `styles-inline.css` überführt
(Schritt `tools/csp_styles.py`). Die Klassen tragen `!important`, weil ein
Attribut jede normale Stylesheet-Regel schlägt — ohne `!important` hätte eine
spezifischere Regel wie `.cfg-summary .btn` die Oberhand gewonnen und das
Aussehen verändert. Zwei `<noscript><style>`-Blöcke liegen jetzt in
`nojs.css`, eingebunden per `<link>` innerhalb von `<noscript>`.

Was weiterhin erlaubt ist und nicht von `style-src` erfasst wird: das Setzen
einzelner Eigenschaften über die CSSOM (`element.style.visibility = …`). Das
ist kein eingebettetes Stylesheet, sondern eine Änderung am DOM — Skripte, die
das dürfen, dürfen ohnehin alles. Für eingeschleustes CSS über
`background-image: url(…)` bleibt `img-src 'self' data:` die Schranke.

### Was noch offen ist

- **`frame-ancestors`** ist in einer `<meta>`-CSP wirkungslos. Auf GitHub Pages
  gibt es keine Antwort-Header, deshalb schützt `bootstrap.js` aktiv: Wird die
  Seite in einem Frame geöffnet, blendet sie sich selbst aus und schickt den
  obersten Frame auf die eigene Adresse. Das ist kein Header-Schutz, aber es
  verhindert die typische Klickfalle. Für Hosts,
  die Header ausliefern, liegt die Regel in `_headers` (Netlify, Cloudflare
  Pages) und in `vercel.json`; beide setzen `frame-ancestors 'none'` und
  `X-Frame-Options: DENY`.
- **HSTS** lässt sich auf GitHub Pages nicht setzen. `_headers` und
  `vercel.json` enthalten `Strict-Transport-Security` für den Umzug;
  `upgrade-insecure-requests` deckt im HTML nur gemischte Inhalte ab, nicht
  den ersten Aufruf über HTTP.
- `_headers` im Wurzelverzeichnis ist die **Vorlage** für Netlify oder
  Cloudflare Pages. GitHub Pages ignoriert die Datei. Sie ist kein aktiver
  Schutz, sondern ein Umzugsgut — mit derselben strengen `script-src`-Regel
  wie das HTML, plus Cache-Regeln für `fonts/`, `vendor/` und `media/`.

## 3. `innerHTML`: was geprüft wurde

Die Regel: Werte gehen über `textContent`, `createElement` oder
`setAttribute`. `innerHTML` ist nur für konstantes Markup erlaubt (Icons,
Skelette) und für die Sprachtabellen in `components.js`, die aus eigenen
`data-en`-Attributen im HTML stammen — also aus dem Repository, nicht aus
einer Eingabe.

Stand 7. November 2026: **47 Zuweisungen in 10 Dateien**. Alle wurden
einzeln geprüft:

| Quelle | Bewertung |
|---|---|
| `ui-v4.js`, `ui-v5.js`, `werkkorb.js` | Icons, Skelette, Katalogdaten aus `CATALOG` (statisches Objekt) |
| `forum.js` | baut jeden Knoten mit `createElement`/`textContent`; `innerHTML` nur für konstante SVG-Pfade |
| `auth.js` | Nutzername und E-Mail über `escapeHTML()`; Konten mit PBKDF2 |
| `entwickler.js` | Sandbox-Antwort über `highlight()`, das `&`, `<`, `>` zuerst maskiert |
| `nf-find.js` | Suchbegriff geht in `textContent`, nicht in `innerHTML` |
| `ui-entscheidung.js` | Zellwerte aus dem Vergleichstabellen-Markup der Seite |

Der Warenkorb liest seinen Stand aus `localStorage`. Dort kann jemand
beliebige IDs eintragen; `load()` verwirft alles, was nicht in `CATALOG`
steht oder keine Zahl zwischen 1 und 9 ist. Damit ist der einzige
nutzereditierbare Speicher kein Einfallstor.

Nachprüfbar mit `python3 tools/qa_security.py`: Es sucht Inline-Handler,
`javascript:`-URLs, `eval`, `new Function`, fremde Skripte und Secrets und
meldet **0 Befunde** über 34 Seiten.

## 4. Konten

Zwei Modi, umschaltbar in `auth-config.js`:

**`local` (aktuell aktiv).** Konten liegen im `localStorage` des Browsers.
- PBKDF2-SHA256, **310.000 Runden**, 256 Bit Ausgabe
- 16-Byte-Salz je Konto, eigenes `crypto.getRandomValues`
- Sperre nach **5 Fehlversuchen** für **60 Sekunden**
- Sitzung 30 Tage, Abmelden löscht den Eintrag

Das ist eine Vorschau, kein Ersatz für ein Backend: Wer Gerät oder Browser
wechselt, kommt nicht an sein Konto; wer den `localStorage` liest, hat den
Hash. Genau so steht es auch in `auth-config.js`.

**`supabase` (vorbereitet, nicht aktiv).** Echte Konten mit
E-Mail-Bestätigung und Passwort-Reset. `supabase/schema.sql` aktiviert Row
Level Security auf `profiles` mit drei Policies (`select`, `insert`, `update`
jeweils auf `auth.uid() = id`). Der `anon`-Key ist ein öffentlicher
Client-Key; der `service_role`-Key gehört **niemals** in den Client.

## 5. Drittanbieter

**Keine.** Schriften liegen als WOFF2 unter `fonts/` im Repository, three.js
unter `vendor/`. Es gibt kein Analyse-Skript, keinen Pixel, keine externe Karte
und keinen CDN-Aufruf. Ein Test im Browser zählt die Requests: alle gehen an
die eigene Domain, bis auf die optionale Supabase-Verbindung, wenn
`auth-config.js` auf `supabase` steht.

Das ist nicht nur Datenschutz, sondern auch Angriffsfläche: Ein fremder Host
kann kompromittiert werden, ein lokaler nicht.

## 6. Automatische Prüfungen

Im Repository, ohne Zusatzsoftware lauffähig:

| Werkzeug | Prüft |
|---|---|
| `tools/qa_security.py` | Inline-Handler, `javascript:`-URLs, fremde Skripte und Formularziele, `eval`, Secrets, PBKDF2-Stärke, CSP-Weite, Header-Vorlage |
| `tools/qa_site.py --static-only` | tote Links, doppelte IDs, Alt-Texte, H1, CSP auf jeder Seite |
| `tools/qa_seo.py` | Titel, Description, Canonical, Open Graph, JSON-LD |
| `tools/qa_a11y.py` | Kontrast, Fokus, Beschriftungen, ARIA-Ziele, Landmarken |
| `tools/csp_harden.py --check` | dass keine Seite hinter die aktuelle CSP zurückfällt |
| `tools/a11y_landmarks.py --check` | dass keine Seite `<main>` oder Sprungmarke verliert |

`.github/workflows/qa.yml` führt die statischen Prüfungen bei jedem Push und
jedem Pull Request aus. Der Browserlauf bleibt lokal, weil er Playwright und
mehr Zeit braucht.

Die Sicherheitsseite selbst ist zusätzlich gegen folgende Fälle getestet:

- 320 / 390 / 768 / 1440 px ohne horizontales Überlaufen
- kein WebGL → SVG-Fallback statt leerer Leinwand
- `prefers-reduced-motion: reduce` → statisches Bild, keine Eigenbewegung
- JavaScript aus → Fragen lesbar, Check-Panel ausgeblendet, `<noscript>`-Hinweis
- Tastatur: Radios per Pfeiltaste, Tabs per Pfeil/Home/End, sichtbarer Fokusring
- Kopieren mit und ohne Clipboard-Berechtigung (Fallback über `execCommand`)
- 0 Konsolenfehler, 0 fehlende Ressourcen

## 7. Meldeweg

- Mail: [Haqmalh@icloud.com](mailto:Haqmalh@icloud.com?subject=Security%20report)
- [`/.well-known/security.txt`](../.well-known/security.txt) nach RFC 9116
- Ablauf und Zusagen: [sicherheit.html#meldeweg](../sicherheit.html#meldeweg)

Bestätigung in 48 Stunden, Fix in der Regel in 14 Tagen, Nennung auf Wunsch,
kein Kopfgeld.
