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

Auf 30 von 31 Seiten identisch (die Ausnahme ist die
Google-Verifizierungsdatei `google3491bb2e3bfcb9d2.html`, reiner Text).
`sicherheit.html` selbst ist strenger — dort fehlt `'unsafe-inline'`
in **beiden** Direktiven:

```
default-src 'self';
script-src  'self' 'unsafe-inline';   /* sicherheit.html: 'self' */
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
                                      /* sicherheit.html: 'self' https://fonts.googleapis.com */
font-src    https://fonts.gstatic.com;
img-src     'self' data:;
object-src  'none';
base-uri    'self';
form-action 'self' mailto:;
connect-src 'self' https://*.supabase.co;
upgrade-insecure-requests
```

### Was das verhindert

- `default-src 'self'` — kein Nachladen von Skripten, Bildern oder Frames von
  fremden Hosts. Ein injizierter `<script src="https://cdn…">` läuft nicht.
- `object-src 'none'` — kein Flash/PDF-Plugin-Einbettungskanal.
- `base-uri 'self'` — kein `<base href>`-Trick, der relative URLs umbiegt.
- kein `unsafe-eval` — `eval`, `new Function` und String-Timer sind blockiert.
- `form-action` begrenzt, wohin Formulare senden dürfen.

### Zwei echte Schwächen

**1. `script-src 'unsafe-inline'`.** Auf 30 der 31 Seiten. Jede hat mindestens ein
Inline-Skript (Sprachstart, JSON-LD). Damit ist eine XSS-Lücke nicht automatisch
harmlos: Wer HTML einschleusen kann, kann auch ein `<script>` einschleusen.

`sicherheit.html` ist die **Ausnahme und der Beweis, dass es ohne geht**:
die drei Zeilen Sprachstart liegen in `bootstrap.js`, die Seite läuft mit
`script-src 'self'`. Geprüft mit einem eingeschleusten Inline-Skript — es
wird blockiert, die Verletzung landet in der Konsole, JSON-LD parst weiter:

```
inline script executed: False
CSP violation logged:   True
JSON-LD:                ok 4 nodes
```

Der Umbau für die übrigen Seiten ist drei Zeilen pro Datei:

1. `bootstrap.js` nach `<meta charset>` einbinden,
2. den Inline-Block `<script>document.documentElement.classList.add('js')…</script>` löschen,
3. in der CSP `script-src 'self' 'unsafe-inline'` auf `script-src 'self'` kürzen.

Offen bleibt `style-src` für die übrigen Seiten: Reveal-Animationen und
Fortschrittsringe arbeiten dort mit `style`-Attributen. Für diese Seite ist
das erledigt, siehe Punkt 2.

**2. `style-src 'unsafe-inline'`.** Auf den übrigen 30 Seiten nötig, weil sie
dynamische `style`-Attribute setzen (Fortschrittsringe, Reveal-Delays).
Risiko ist geringer als bei Skripten, aber real: Injektion von CSS kann über
`background-image: url(…)` Daten abfließen lassen, wenn `img-src` es erlaubt.
Hier ist `img-src 'self' data:` — fremde URLs bleiben blockiert.

`sicherheit.html` braucht auch diese Ausnahme nicht mehr. Drei Dinge waren
nötig, alle in dieser Datei erledigt:

1. **Der `<noscript>`-Block mit `<style>` ist weg.** Seine vier Regeln stehen
   jetzt in `styles-sicherheit.css` unter `html:not(.js)`. Die Klasse `js`
   setzt `bootstrap.js` — fehlt sie, ist JavaScript aus. Gleiche Wirkung,
   kein `<style>`-Element.
2. **Keine `style`-Attribute im Markup.** `grep -c 'style="'` ergibt 0.
3. **Der Fortschrittsring** setzt `strokeDashoffset` über die CSSOM
   (`element.style…`). Das ist keine Inline-Style-Deklaration im Sinne der
   CSP und wird von `style-src` nicht blockiert — geprüft, nicht angenommen.

Nachgewiesen im Browser mit `style-src 'self' https://fonts.googleapis.com`:

```
CSP violations:        []            (0 Verstöße, 6 Stylesheets, Fonts geladen)
score 100 → ring       0.26522px     (Ring rechnet und zeichnet)
ohne JavaScript        html ohne .js → Ergebnis aus, Hinweis an, Panels offen
mit JavaScript         html.js      → Ergebnis an, Hinweis aus
```

### Was fehlt

- **`frame-ancestors`** ist in einer `<meta>`-CSP wirkungslos. Auf GitHub Pages
  gibt es keine Antwort-Header, also **kein Clickjacking-Schutz**. Wer die Seite
  einbetten will, kann das.
- **HSTS** lässt sich nicht setzen (GitHub Pages liefert keinen
  `Strict-Transport-Security`-Header; `upgrade-insecure-requests` deckt nur
  gemischte Inhalte ab, nicht den ersten Aufruf über HTTP).
- `_headers` im Wurzelverzeichnis ist die **Vorlage** für Netlify oder
  Cloudflare Pages. GitHub Pages ignoriert die Datei. Sie ist kein aktiver
  Schutz, sondern ein Umzugsgut.

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
