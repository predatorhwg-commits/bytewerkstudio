# Sicherheit — Bytewerk Studio

Stand: 07.11.2026. Diese Datei beschreibt, was die Seite technisch tut, was sie
bewusst nicht tut und wie eine Meldung abläuft. Sie ist keine Zertifizierung.

Kontakt für Meldungen: **Haqmalh@icloud.com** ·
`/.well-known/security.txt` · Antwort in der Regel innerhalb von 72 Stunden.

## 1. Angriffsfläche

Die Seite ist statisch (GitHub Pages). Es gibt keinen eigenen Server, keine
Datenbank im Lieferumfang und keinen Schreib-Endpunkt. Damit fehlen die
klassischen Angriffsflächen: kein Login-Backend, keine SQL-Schicht, keine
Datei-Uploads, keine serverseitigen Templates.

Was trotzdem existiert und abgesichert ist:

| Fläche | Risiko | Maßnahme |
|---|---|---|
| Nutzertext im Forum | XSS über gespeicherte Beiträge | Rendern nur über `createTextNode`, siehe unten |
| `localStorage` | manipulierter Zustand | defensives Parsen, Allowlists, Längenlimits |
| Externe Links | `javascript:` / `data:` | Schema-Allowlist, `rel="noopener noreferrer nofollow ugc"` |
| Drittanbieter | Mitlesen, Tracking | keine fremden Skripte, keine CDN-Aufrufe, Fonts nur von Google Fonts |
| Formulare | Spam, CSRF | statische Seite, `form-action 'self' mailto:` in der CSP |
| Konto (Vorschau) | Passwort-Diebstahl aus dem Speicher | PBKDF2-SHA-256, 310 000 Iterationen, Zufalls-Salt |
| Supabase (optional) | Fremdzugriff | Row Level Security in `supabase/forum-schema.sql` |

## 2. Content Security Policy

Jede Seite liefert eine CSP im `<head>`. Muster:

```
default-src 'self';
script-src 'self' 'sha256-…' 'sha256-…';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
object-src 'none';
base-uri 'self';
form-action 'self' mailto:;
connect-src 'self' https://*.supabase.co;
upgrade-insecure-requests
```

**Skripte laufen über Hashes, nicht über `'unsafe-inline'`.** Jede Seite nennt
die SHA-256-Hashes ihrer eigenen Inline-Skripte (Sprachstart im `<head>` und,
wo vorhanden, ein Seiten-Skript). Ein injiziertes `<script>` hat keinen dieser
Hashes und wird vom Browser blockiert — auch dann, wenn es fertig in den
HTML-Baum gelangt. `'unsafe-inline'` steht in `script-src` auf **keiner** der
35 Seiten.

Nachweis, A/B im Browser: eine Seite mit falschem Hash meldet
`Executing inline script violates … The action has been blocked`, `window.__xss`
bleibt `undefined`; dieselbe Seite mit richtigem Hash führt aus (`title` wird
`PWNED`). Der Testaufbau wurde danach gelöscht.

Hashes veralten, sobald ein Inline-Skript geändert wird. Deshalb liegt der
Erzeuger im Baum:

```
node tools/csp-hash.mjs .          # schreibt die Hashes neu
node tools/csp-hash.mjs . --check  # Exit 1, wenn eine Seite abweicht
```

`--check` gehört vor jeden Push. `style-src` behält `'unsafe-inline'`, weil
`style="…"`-Attribute im Markup stehen; über CSS lässt sich kein Skript
ausführen. `object-src 'none'` verhindert Flash/PDF-Einbettung, `base-uri 'self'`
verhindert Base-Tag-Hijacking.

Zusätzlich auf allen Seiten: `referrer` = `strict-origin-when-cross-origin`,
`X-Content-Type-Options` soweit der Hoster es setzt, `noindex` auf Konto-,
Login- und Checkout-Seiten.

## 3. Nutzertext ist niemals Code

`community.js` rendert Beiträge ausschließlich über `document.createTextNode`
und eine feste Liste erlaubter Knoten (`strong`, `em`, `code`, `pre`, `ul`,
`ol`, `li`, `blockquote`, `p`, `br`, `a`). Kein `innerHTML` mit Nutzerdaten,
kein `eval`, kein `new Function`.

Links werden gegen eine Schema-Allowlist geprüft (`http:`, `https:`, `mailto:`).
Alles andere bleibt sichtbarer Text. Externe Links erhalten
`target="_blank"` plus `rel="noopener noreferrer nofollow ugc"`.

`loadState()` behandelt den Speicher als feindlich: Version prüfen, IDs gegen
`/^[a-z0-9_-]{2,40}$/i`, Kategorie gegen Allowlist, Längen klemmen, Autoren neu
aufbauen, unbekannte Abo-Stufen verwerfen.

## 4. Grenzen gegen Missbrauch

- 30 Sekunden Mindestabstand zwischen Beiträgen, 40 Beiträge pro Tag
- Titel 8–120 Zeichen, Beitrag 20–4000 Zeichen, maximal 3 Tags
- 80 Antworten pro Thema, 200 eigene Themen
- versteckte Honigfalle (`#cm-hp`): gefüllt → Beitrag wird still verworfen
- Melden blendet lokal aus, statt zu löschen — die Seite behauptet keine
  Moderation, die sie nicht hat

Diese Grenzen gelten im Browser. Wer sie umgeht, umgeht nur die eigene Kopie;
es gibt keinen Server, der etwas annehmen könnte.

## 5. Selbsttest auf der Seite

`community.html#sicherheit` enthält einen Selbsttest mit sieben echten
XSS-Payloads: `img/onerror`, `<script>`, `javascript:`-Link, `<iframe>`,
`data:`-Link, `svg/onload` und `<style>`-Injection. Jede Zeile zeigt das
Ergebnis der echten Render-Funktion (`blocked`), am Ende steht die Summe
(„7 of 7 attacks blocked"). Der Test läuft vollständig lokal und verändert keine
Daten.

## 5a. Kontrast: Messung und ein Fehlalarm

Gemessen wird mit einem Browser-Skript über alle 35 Seiten bei 1440 px: es
liest Textfarbe und die nächste deckende Hintergrundfarbe, rechnet beide in
relative Luminanz um und vergleicht mit der WCAG-2.1-AA-Schwelle (4.5:1 für
kleinen Text, 3:1 ab 24 px).

Gefundene und behobene echte Fehler:

| Element | vorher | nachher |
|---|---|---|
| `.lang-sep` (Sprachumschalter, alle Seiten) | 1.44:1 | 5.42:1 |
| `.mk-crumb` (`marke.html`) | 1.44:1 | 5.42:1 |
| `.fm-dot` (`forum.html`) | 1.52:1 | 5.42:1 |

Der Prüfer meldet auf `community.html` zusätzlich 13 Treffer für die
Avatar-Initialen (`.cm-ava`). Das ist ein Fehlalarm: die Initialen stehen weiß
auf einem Farbverlauf, und der Prüfer kann Verläufe nicht auflösen — er nimmt
den Seitenhintergrund an. Gegen den hellsten Farbstopp jedes Verlaufs gerechnet
ergibt sich:

```
#2a2825 14.70:1   #55504a 7.98:1
#37616b  6.81:1   #4a7682 4.99:1
#6a4f5c  7.28:1   #8a6b79 4.71:1
```

Alle sechs Verläufe liegen über 4.5:1, der hellste bei 4.71:1. Es bleibt beim
Ist-Zustand.

## 5b. Eingabefelder mit Obergrenze

25 sichtbare Text- und Passwortfelder hatten keine `maxlength`. Ein Feld ohne
Obergrenze lässt sich mit Megabytes füllen; landet der Wert im Speicher des
Browsers, ist die Kopie des Besuchers kaputt, nicht der Server — trotzdem ist
eine Grenze billig und richtig. Gesetzt:

| Feldgruppe | Grenze |
|---|---|
| Suche (`shop-search`, `fm-q`, `cm-q`) | 80 |
| Name, Firma | 100 / 120 |
| E-Mail | 254 (RFC-Obergrenze) |
| Passwort, Bestätigung | 200 |
| Nachricht, Projektziel | 4000 / 2000 |
| Notizen, Bestellnotiz | 2000 / 1000 |
| PDF-Text im Probierstand | 50 000 |

Ohne Grenze bleiben nur zwei Honigfallen (`cm-hp`, `website`) — sie sind
absichtlich frei, damit ein Bot sie füllt — und zwei Nicht-Text-Felder
(`number`, `date`), bei denen `maxlength` wirkungslos ist.

## 6. Konto und Passwörter (Vorschau-Modus)

`auth.js` speichert im lokalen Modus nur einen PBKDF2-Hash mit zufälligem Salt
und 310 000 Iterationen, nie das Passwort. Der Modus ist als Vorschau markiert
und für den Produktivbetrieb nicht gedacht. Für echte Konten: Supabase mit
`auth-config.js`, E-Mail-Bestätigung und RLS auf allen Tabellen.

## 7. Datenbank, falls Supabase aktiviert wird

`supabase/forum-schema.sql` aktiviert RLS auf `forum_categories`,
`forum_threads`, `forum_posts`, `forum_votes` und `forum_reports`. Lesen ist
öffentlich, Schreiben nur mit `auth.uid() = author_id`, Löschen nur durch den
Autor, Melden für alle Angemeldeten. Vor dem Produktivbetrieb:

1. Schema ausführen und RLS-Status prüfen (`select relrowsecurity from pg_class`).
2. `service_role`-Key niemals im Frontend.
3. Rate Limits zusätzlich serverseitig (Edge Function), nicht nur im Client.
4. Backups und ein Löschkonzept für gemeldete Inhalte.

## 8. Was bewusst fehlt

- Kein Tracking, keine Werbenetzwerke, keine externen Analyse-Skripte.
- Keine Telemetrie an Dritte.
- Keine Behauptung von Verschlüsselung, die es nicht gibt: die Seite nutzt
  HTTPS über den Hoster, mehr nicht.

## 9. Meldung

Bitte mit URL, Reproduktion und Auswirkung an **Haqmalh@icloud.com**. Keine
öffentlichen PoCs, bevor das Problem behoben ist. Wir bestätigen den Eingang,
nennen einen Zeitplan und nennen dich auf Wunsch in der Danksagung.
