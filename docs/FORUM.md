# Forum — wie es gebaut ist

`forum.html` ist die Seite, `forum.js` die Logik, `styles-forum.css` die
Gestaltung, `forum-scene.js` die three.js-Pinwand im Seitenkopf.

## Was ohne Server geht

Das Forum speichert in `localStorage` unter `bw-forum-v1`. Damit ist es
sofort benutzbar: Themen anlegen, antworten, suchen, als gelöst markieren,
beobachten. Grenzen, die daraus folgen und die die Seite auch benennt:

- Themen liegen auf einem Gerät, nicht auf einem Konto.
- Konten laufen weiter über `auth.js` (Vorschau-Modus, `local`) oder
  Supabase, wenn `auth-config.js` umgestellt ist.
- Der Vorschau-Modus nimmt keine Zahlungen. „Pro anfragen“ schaltet den
  Zugang lokal frei und sagt das auch.
- Der Speicher ist begrenzt: 200 Themen, 200 Beiträge je Thema, danach
  kommt eine ehrliche Meldung statt eines stillen Verlusts.

Für echte, geteilte Themen: `supabase/forum-schema.sql` ausführen und in
`forum.js` die Datenschicht (`load`/`save`) gegen Supabase-Aufrufe tauschen.
Die Datenform ist absichtlich schon so geschnitten: `id`, `slug`, `cat`,
`type`, `title{de,en}`, `body{de,en}`, `tags`, `author`, `createdAt`,
`updatedAt`, `solved`, `solvedPost`, `pinned`, `views`, `votes`, `posts`.

Das Schema ist gegen eine echte PostgreSQL-Instanz gelaufen, nicht nur
gegen einen Parser. Zwei Dinge, die dabei aufgefallen sind und die das
Schema jetzt löst:

- `array_to_string` ist als `stable` markiert, generierte Spalten
  verlangen aber `immutable` — `create table forum_threads` scheiterte
  an „generation expression is not immutable“. `forum_search_vector()`
  kapselt die Berechnung als `immutable`-Funktion (für `text[]` ist die
  Ausgabe konstant); die Spalte bleibt `generated always … stored`.
- Autoren durften eigene Themen anpinnen und als gelöst markieren.
  Der Trigger hält `pinned`, `solved`, `solved_post`, `slug` und
  `category` jetzt auch beim Autor fest; nur `mod` oder der Service-Role
  ohne `auth.uid()` ändert sie.

## Sicherheit

Das ist der Teil, der nicht verhandelbar ist.

1. **Kein `innerHTML` mit Nutzertext.** Beiträge, Titel, Tags und Namen
   werden mit `createElement` und `textContent` gebaut. `innerHTML` kommt
   nur für konstante SVG-Pfade aus `ICONS`/`CAT_ICONS` vor.
2. **Markdown ist eine Allowlist, kein Parser für alles.** Unterstützt
   werden Absätze, `h2`–`h4`, Listen, Zitate, Code-Blöcke, `**fett**`,
   `*kursiv*`, `` `code` `` und Links. Alles andere bleibt Text.
3. **Links nur mit `http`, `https`, `mailto`.** `safeUrl()` prüft über den
   `URL`-Konstruktor, nicht per Regex. `javascript:`, `data:` und
   `vbscript:` fallen durch. Externe Links bekommen
   `rel="noopener noreferrer nofollow ugc"`.
4. **Längen hart begrenzt:** Titel 8–110, Beitrag 20–8000, drei Tags à
   24 Zeichen. Die Grenzen stehen in `CFG` und im SQL-Schema.
5. **Ratenlimits:** höchstens fünf Beiträge pro Minute, mindestens 20
   Sekunden Abstand. Kein Sicherheitsmerkmal gegen Bots, aber gegen
   Doppelklicks und versehentliche Serien.
6. **Honeypot** im Formular: ein unsichtbares Feld, das nur Bots füllen.
7. **Keine Secrets im Repo.** Der Supabase-`anon`-Key ist öffentlich; der
   `service_role`-Key gehört nie in eine Datei, die ausgeliefert wird.
8. **CSP ohne Ausnahme für Styles:** `style-src 'self'
   https://fonts.googleapis.com` — kein `'unsafe-inline'`. Dazu
   `base-uri 'none'` und `form-action 'none'`; das Formular wird
   ausschließlich per JavaScript verarbeitet. Keine Inline-Handler, keine
   externen Skripte, three.js aus `vendor/`. Der Inline-Block in
   `forum.html` bleibt über seinen SHA-256-Hash erlaubt.
9. **RLS im Schema:** Lesen für Angemeldete, Schreiben nur mit passendem
   Plan. `author_id`, `author_name`, `created_at` setzt ein Trigger aus
   `auth.uid()` — nicht der Client.
10. **Gespeicherte Daten werden geprüft, nicht vertraut.** `normalizeDb()`
    repariert `bw-forum-v1`: falsche Typen fliegen raus, Titel und Texte
    werden auf die Grenzen gekürzt, unbekannte Kategorien fallen auf
    `frontend` zurück, doppelte Slugs und IDs werden eindeutig, Daten
    ohne gültigen Zeitstempel bekommen `jetzt`, und ein einzelner kaputter
    Eintrag leert nicht mehr das ganze Forum. Ist nichts mehr zu retten,
    wird neu aufgesetzt.
11. **Auch die Nebenschlüssel sind typgeprüft.** `bw-forum-rate-v1`,
    `bw-forum-subs-v1` und `bw-forum-reports-v1` laufen über `readArray()`;
    ein Objekt oder String an dieser Stelle wirft nicht mehr, sondern
    wird als leere Liste behandelt.

Geprüft mit einem XSS-Durchlauf im Browser: Titel und Beitrag mit
`<img onerror>`, `<script>`, `<svg onload>`, `<iframe>`, `<math>`,
`javascript:`-Links (auch mit Tab und HTML-Entität), dazu vergifteter
Speicher mit Nutzlasten in **jedem** Feld (Titel, Text, Tags, Autor, Slug,
Kategorie, Typ, Datum, Stimmen, Lösung). Ergebnis: null eingeschleuste
Elemente, null Handler, null `javascript:`-Hrefs, null Alerts, null
Konsolenfehler — die Nutzlasten stehen als Text da.

Speicher- und Schlüsseltests: sechs kaputte `bw-forum-v1`-Formen
(`null`-Eintrag, String, fehlender Autor, `posts` als String, ungültiges
Datum, `__proto__`) und fünf falsch typisierte Nebenschlüssel. Vorher
legten drei Formen die Seite mit `pageerror` lahm; jetzt rendert jeder Fall,
und gültige Daten bleiben unverändert.

## Bedienung

| Aktion | Maus/Touch | Tastatur |
|---|---|---|
| Suche | Feld im Kopf der Liste | `/` (die Site-Suche bleibt auf `Cmd`/`Strg` + `K`) |
| Neues Thema | Knopf oben rechts | `n` |
| Senden | Knopf im Formular | `Strg`/`Cmd` + `Enter` |
| Formular schließen | X oder Klick daneben | `Esc` — der Fokus kehrt zum Knopf zurück |
| Thema öffnen | Klick auf die Zeile | `Tab`, dann `Enter` |
| Pinwand drehen | ziehen | Pfeiltasten bei Fokus |

Die Pinwand ist ein Canvas mit `aria-hidden`; die vier Karten im
`.fm-stage-fallback` sind echte Knöpfe und bleiben ohne WebGL sichtbar.
Bei `prefers-reduced-motion` wird ein Standbild gezeichnet, die Schleife
läuft nicht.

Die Suche markiert ihre Treffer im Listentitel und im Auszug mit `<mark>`
(mehrere Wörter, Groß-/Kleinschreibung egal, höchstens 24 Marken je Zeile).
Im Thema zeigt eine zwei Pixel hohe Linie den Lesefortschritt; sie beginnt
beim Öffnen bei 0, füllt sich beim Scrollen und ist auf der Liste unsichtbar.
Ohne JavaScript erklärt eine `noscript`-Zeile, warum das Forum leer bleibt,
und nennt eine Mailadresse.

Ein Thema zählt eine Ansicht pro Seitenaufruf. Antworten, Sprachwechsel und
erneutes Rendern erhöhen den Zähler nicht; gesperrte Pro-Themen zählen gar
nicht. Nach einem Reload zählt der nächste Aufruf als neue Ansicht.

## Bearbeiten

Eigene Beiträge lassen sich direkt im Thread ändern. Der erste Beitrag
darf auch den Titel korrigieren; der Slug bleibt dabei stehen, damit
geteilte Links (`forum.html#/t/slug`) nicht ins Leere laufen. Ein
`editedAt`-Zeitstempel erscheint am Beitrag. `Esc` bricht ab, auch wenn
der Fokus auf „Speichern“ oder im Titelfeld liegt; `Strg`/`Cmd` +
`Enter` speichert. Beide Felder sind über `label for` beschriftet, die
IDs kommen aus der Beitrags-ID.

## Teilen

`og:image` ist `media/og-forum.png` (1200 × 630, Papieroptik, gleiche
Palette wie die Seite). Die Karte wird nicht vom Browser geladen,
sondern nur von Crawlern — sie kostet also keine Ladezeit. Erzeugt aus
einer HTML-Vorlage mit denselben Schriften; bei einer Textänderung neu
rendern, sonst steht auf der Karte etwas anderes als im Titel.

## Sprachen

Die Seite ist auf Deutsch und Englisch geschrieben. `lang()` liest
zuerst `window.bwLang()` (gesetzt von `components.js`), sonst
`documentElement.lang`, und normalisiert auf `de`, `en` oder `es`.
Spanisch fällt auf Englisch zurück — nie auf Deutsch. Datumsformate
richten sich danach: `de-DE` nur bei `de`, sonst `en-GB`.

## Abo-Stufen

- **Community (0 €):** lesen, fragen, antworten in vier offenen Kategorien.
- **Studio Pro:** zusätzlich Studio- und Feedback-Kategorie, Lösung
  markieren, Pro-Kennzeichen, Vorrang bei offenen Themen,
  vierteljährliche Sprechstunde. Preis und Stufen stehen bewusst nur auf
  `entwickler.html#abo` — eine Zahl an zwei Stellen läuft auseinander.

Der Link setzt voraus, dass `entwickler.html` mit ausgeliefert wird —
sie kommt aus dem Entwickler-Change-Set. Fehlt sie in einem Build, ersetzt
`checkPlansLink()` den Link durch einen Satz. Das Signal ist die
Kopfzeile: `components.js` baut Navigation und Forum-Link aus derselben
Liste, ein fehlender Nav-Eintrag heißt also fehlende Seite. Kein
`fetch`, kein `HEAD` — eine frühere Netzwerkprüfung erzeugte bei
fehlender Seite einen 404 im Konsolenprotokoll und verstieß gegen die
Regel „0 Konsolenfehler“.

Im Vorschau-Modus gibt es keine Zahlung. `Pro anfragen` setzt
`bw-forum-pro-preview` und zeigt den Zugang als „Pro (Vorschau)“ an. Für
echte Abos braucht es einen Zahlungsanbieter und einen serverseitigen
Webhook, der `profiles.plan` setzt — nicht einen Schalter im Browser.

## Prüfprotokoll (07.11.2026)

- 1440 × 900, 834 × 1112, 390 × 844, 320 × 700: kein horizontales
  Überlaufen, 0 Konsolenfehler, 0 fehlgeschlagene Requests.
- Thema öffnen, suchen, filtern, auf „offen“ filtern, Thema anlegen,
  antworten, Lösung markieren, beobachten, Link kopieren: geprüft.
- Ohne WebGL: `.is-flat`, vier klickbare Karten, Klick öffnet das Thema.
- Speicher blockiert: Warnung in der Seitenleiste, kein Absturz.
- DE/EN inklusive aller dynamisch erzeugten Texte geprüft.
- Inline-Bearbeitung: Anlegen, Titel und Text ändern, Abbrechen,
  `Esc` von Knopf und Titelfeld, `Strg+Enter`, zu kurzer Titel, zu
  kurzer Text, Antwort ohne Titelfeld, Persistenz nach Reload — geprüft,
  0 Fehler. Slug bleibt beim Titel-Edit erhalten.
- 390 px und 320 px mit offenem Editor: 0 Überlauf, Knöpfe passen.
- Belastung: 110-Zeichen-Titel ohne Leerzeichen, 160-Zeichen-URL und
  180-Zeichen-Zeile im Code-Block, Emoji und Umlaute — 320, 390, 834 und
  1440 px ohne Überlauf. Der Bruchschutz (`overflow-wrap: anywhere`) sitzt
  an Thread-Titel, Listentitel, Wissensarchiv, Beitragsnamen und
  Autorennamen; `pre` scrollt intern.
- Unbekannter Deep-Link `#/t/<slug>`: Liste sichtbar **und gefüllt**
  (neun Themen), Thread verborgen, Fortschrittslinie aus, einmaliger
  Hinweis „Dieses Thema gibt es nicht oder nicht mehr.“
- CSP ohne `'unsafe-inline'` für Styles, mit `base-uri 'none'` und
  `form-action 'none'`: Dialog, Editor, Suche, Leerzustand, Sprachwechsel,
  Pro-Band und Toast geprüft — 0 `securitypolicyviolation`, keine
  Konsolenfehler. `element.style.transform` für die Fortschrittslinie
  bleibt davon unberührt (CSSOM, kein Style-Attribut).
- Suche markiert mehrere Wörter (`three.js szene` → zwei Marken), der
  Leerzustand bleibt bei „zzzz“ sichtbar. Fortschrittslinie: 0 oben,
  `scaleX(1)` am Seitenende, auf der Liste `opacity: 0`.
- Ohne JavaScript: `noscript`-Hinweis sichtbar.
- Zähler: 214 → 215 beim Öffnen, 216 nach Reload (neue Sitzung), bleibt
  216 nach Antwort und Sprachwechsel; ein gesperrtes Pro-Thema bleibt
  bei 52. Vorher erhöhte jedes Neu-Rendern den Zähler.
- Spanisch: `lang='es'` liefert englische Oberfläche und `en-GB`-Datum,
  nie deutsche Texte.
- Supabase-Schema in einer echten PostgreSQL-Instanz (`pgserver`, nicht
  nur `pglast`): 6 Tabellen, 6 Kategorien, 13/13 Prüfungen grün. INSERT
  setzt Autor, Zeit und `views` und verwirft `pinned`/`solved`;
  Autor-Edit ändert Text, aber nicht Moderation, Slug oder Kategorie;
  fremder Edit darf nur `views` erhöhen; `views` bleibt monoton; eine
  Lösung aus einem fremden Thema und ein `reply_to` aus einem fremden
  Thema werden verworfen; die Vote-Policy blockt erfundene IDs und eine
  fremde `user_id` und erlaubt echte Themen. Der Suchvektor findet
  Titel, Text und Tag.
