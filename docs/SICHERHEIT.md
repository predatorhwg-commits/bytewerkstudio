# Sicherheit — technische Aufstellung

Stand: 7. November 2026 · gilt für `main` dieser Website.

Dieses Dokument beschreibt, was tatsächlich im Code steht — auch die zwei
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
| Fremde Requests | Google Fonts (`styles.css`, `styles-claude.css` per `@import`) — CSS und WOFF2, kein JavaScript |
| Tracking | keins, keine Cookies für Analyse, kein Pixel |

Ohne Server gibt es keine serverseitigen Lücken — dafür auch keine
serverseitigen Schutzschichten. Der interessante Teil ist der Browser.

## 2. Content-Security-Policy

Auf allen 33 ausgelieferten Seiten identisch und ohne Ausnahme für Skripte:

```
default-src 'self';
script-src  'self';
style-src   'self' 'unsafe-inline';
font-src    'self' https://fonts.gstatic.com;
img-src     'self' data:;
object-src  'none';
base-uri    'self';
form-action 'self' mailto:;
connect-src 'self' https://*.supabase.co;
upgrade-insecure-requests
```

Die Google-Verifizierungsdatei `google3491bb2e3bfcb9d2.html` ist reiner Text
ohne CSP — sie enthält aber auch kein HTML, das ausgeführt würde.

### Was das verhindert

- `script-src 'self'` **ohne `'unsafe-inline'` und ohne `'unsafe-eval'`** —
  injizierte `<script>`-Blöcke, `onerror=`-Attribute, `eval`, `new Function`
  und String-Timer laufen nicht. Das ist der wichtigste Unterschied zu vorher.
- `default-src 'self'` — kein Nachladen von Skripten, Bildern oder Frames von
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
| `script-src 'self' 'unsafe-inline'` | `script-src 'self'` |
| Forum mit SHA-256-Hash | `script-src 'self'`, kein Hash nötig |

JSON-LD bleibt inline, weil es kein ausführbares Skript ist (`type="application/ld+json"`);
eine CSP mit `script-src 'self'` blockiert es nicht.

### Was noch offen ist

**`style-src 'unsafe-inline'`.** Nötig, weil die Seite dynamische
`style`-Attribute setzt (Reveal-Delays, Fortschrittsring, 3D-Bühnen). Das
Risiko ist geringer als bei Skripten, aber real: Injiziertes CSS kann über
`background-image: url(…)` Daten abfließen lassen, wenn `img-src` es erlaubt.
Hier ist `img-src 'self' data:` — fremde URLs bleiben blockiert. Der Umbau auf
Klassen statt Attributen ist ein eigener Arbeitsschritt.

- **`frame-ancestors`** ist in einer `<meta>`-CSP wirkungslos. Auf GitHub Pages
  gibt es keine Antwort-Header, also **kein Clickjacking-Schutz**. Wer die Seite
  einbetten will, kann das.
- **HSTS** lässt sich nicht setzen (GitHub Pages liefert keinen
  `Strict-Transport-Security`-Header; `upgrade-insecure-requests` deckt nur
  gemischte Inhalte ab, nicht den ersten Aufruf über HTTP).
- `_headers` im Wurzelverzeichnis ist die **Vorlage** für Netlify oder
  Cloudflare Pages. GitHub Pages ignoriert die Datei. Sie ist kein aktiver
  Schutz, sondern ein Umzugsgut — inzwischen mit derselben strengen
  `script-src 'self'`-Regel wie das HTML.

## 3. Kein `innerHTML` für berechnete Inhalte

Die Regel im neuen Code: Werte gehen über `textContent`, `createElement` oder
`setAttribute`. `innerHTML` ist nur für konstantes Markup erlaubt (Icons,
Skelette) und für die Sprachtabellen in `components.js`, die aus eigenen
`data-en`-Attributen im HTML stammen — also aus dem Repository, nicht aus
einer Eingabe.

Geprüft: die Kommandosuche (`ui-v4.js`) ist die einzige Stelle, an der
Besuchereingaben verarbeitet werden. Sie baut Ergebnisse mit
`createElement`/`textContent`, nicht mit `innerHTML`.

Ehrlich dazu: im Altbestand gibt es 45 `innerHTML`-Zuweisungen. Die
überwiegende Zahl setzt Icons und Skelette. Eine vollständige Senken-Prüfung
über alle Dateien steht aus — sie ist der nächste sinnvolle Schritt, nicht
erledigt.

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

Google Fonts ist der einzige fremde Host. Dabei wird die IP der Besucherin an
Google übertragen — datenschutzrechtlich der bekannte Streitpunkt. Der
Gegenentwurf (Schriften selbst hosten) liegt als eigenes Thema auf dem Tisch,
ist aber nicht Teil dieser Änderung: Er würde `styles.css`, `styles-claude.css`
und mehrere `font-family`-Stacks betreffen, also fremde Dateien.

## 6. Prüfungen, die zu dieser Seite gehören

`scene-sicherheit.js` und `sicherheit.js` sind gegen folgende Fälle getestet:

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
