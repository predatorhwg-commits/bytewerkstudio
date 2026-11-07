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
| Konto (Vorschau) | Klartext-Passwörter | PBKDF2-SHA-256, 210 000 Iterationen, Zufalls-Salt |
| Supabase (optional) | Fremdzugriff | Row Level Security in `supabase/forum-schema.sql` |

## 2. Content Security Policy

Jede Seite liefert eine CSP im `<head>`. Muster:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
object-src 'none';
base-uri 'self';
form-action 'self' mailto:;
connect-src 'self' https://*.supabase.co;
upgrade-insecure-requests
```

`'unsafe-inline'` bleibt für Skripte nötig, weil Sprache und Zustand vor dem
ersten Paint gesetzt werden. Ein späterer Schritt wäre eine Nonce über einen
Build-Schritt; ohne Build bleibt es beim jetzigen Stand. `object-src 'none'`
verhindert Flash/PDF-Einbettung, `base-uri 'self'` verhindert Base-Tag-Hijacking.

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

`community.html#sicherheit` enthält einen Selbsttest mit acht echten
XSS-Payloads (`<script>`, `onerror=`, `javascript:`-Link, `svg/onload`,
`iframe`, `data:`-URI, `expression()`, `onmouseover=`). Er zeigt pro Zeile
`BLOCKED` oder `PASSED`. Der Test läuft vollständig lokal und verändert keine
Daten.

## 6. Konto und Passwörter (Vorschau-Modus)

`auth.js` speichert im lokalen Modus nur einen PBKDF2-Hash mit zufälligem Salt
und 210 000 Iterationen, nie das Passwort. Der Modus ist als Vorschau markiert
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
