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
8. **CSP bleibt:** keine Inline-Handler, keine externen Skripte. Die Seite
   lädt three.js aus `vendor/`.
9. **RLS im Schema:** Lesen für Angemeldete, Schreiben nur mit passendem
   Plan. `author_id`, `author_name`, `created_at` setzt ein Trigger aus
   `auth.uid()` — nicht der Client.

Geprüft mit einem XSS-Durchlauf im Browser: Titel und Beitrag mit
`<img onerror>`, `<script>`, `<svg onload>`, `<iframe>`, `javascript:`-Links.
Ergebnis: null eingeschleuste Elemente, null ausgelöste Handler, keine
`javascript:`-Hrefs.

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
sie kommt aus dem Entwickler-Change-Set. Eine Prüfung per `HEAD` gab es
kurzzeitig, sie erzeugte aber bei fehlender Seite einen 404 im
Konsolenprotokoll und verstößt damit gegen die Regel „0 Konsolenfehler“.
Deshalb steht dort ein normaler Link.

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
- Spanisch: `lang='es'` liefert englische Oberfläche und `en-GB`-Datum,
  nie deutsche Texte.
