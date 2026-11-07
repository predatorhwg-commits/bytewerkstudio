# Community & Forum

Seite: [community.html](../community.html) · Schicht: [styles-community.css](../styles-community.css)
· Motor: [community.js](../community.js) · Bühne: [community-scene.js](../community-scene.js)

Das Forum ist ein **statischer Vorschau-Modus**: Beiträge liegen in
`localStorage` unter `bw-community-v1`. Es gibt keinen Server, kein Konto, keine
Übertragung. Das ist Absicht — die Seite soll die Bedienung, das Design und die
Sicherheitsregeln zeigen, ohne eine halbfertige Datenbank zu behaupten.

## Was die Seite kann

| Bereich | Funktion |
|---|---|
| Bühne | Fünf Kategorie-Karten als Three.js-„Ideenregal“, ziehen dreht, Klick filtert |
| Forum | 9 Beispiel-Themen, Suche, Sortierung, Kategorie-Chips, Lesezeichen, Gelöst-Marke |
| Thema | Antworten, Hilfreich-Stimmen, Code-Blöcke mit Kopieren, Melden, eigene Beiträge löschen |
| Schreiben | Verfassen-Dialog mit Kategorie, Tags, Markdown-lite, Vorschau, Entwurf, Honigfalle |
| Abo | Community / Developer / Studio, Monat/Jahr-Umschalter, lokale Aktivierung, Verwaltung, Kündigung |
| Werkstatt | Nur mit Abo lesbar; gesperrte Ansicht mit klarem Weg zum Plan |
| Sicherheit | Sechs Karten plus Selbsttest mit sieben echten Angriffs-Payloads |
| Marketing | Weitergeben-Karte (Link kopieren, E-Mail-Einladung, LinkedIn) ohne Tracking-Parameter |

## Sicherheitsmodell

Die Seite ist so gebaut, dass Nutzertext niemals Code werden kann.

1. **Rendern ohne `innerHTML`.** `renderRich()` erzeugt ausschließlich
   `document.createTextNode`, `strong`, `em`, `code`, `pre`, `ul`, `ol`, `li`,
   `blockquote`, `p`, `br` und `a`. Unbekannte Zeichen bleiben Text.
2. **Link-Allowlist.** Nur `http:`, `https:` und `mailto:` werden zu Links;
   `javascript:` und `data:` bleiben sichtbarer Text. Jeder externe Link bekommt
   `rel="noopener noreferrer nofollow ugc"` und `target="_blank"`.
3. **Zustand ist untrusted.** `loadState()` parst `localStorage` defensiv:
   Version prüfen, IDs gegen `/^[a-z0-9_-]{2,40}$/i`, Kategorie gegen Allowlist,
   Längen klemmen, Autoren neu aufbauen, unbekannte Pläne verwerfen. Ein
   manipulierter Speicher kann die Seite nicht in einen anderen Zustand zwingen.
4. **CSP bleibt strikt.** `script-src 'self' 'unsafe-inline'` (das Inline-Skript
   im `<head>` setzt nur die Sprache), keine fremden Skripte, kein CDN, kein
   `eval`. Three.js kommt aus `vendor/`.
5. **Missbrauchsgrenzen.** 30 Sekunden zwischen Beiträgen, 40 Beiträge pro Tag,
   Titel 8–120 Zeichen, Beitrag 20–4000 Zeichen, maximal 3 Tags, 80 Antworten
   pro Thema, 200 eigene Themen.
6. **Honigfalle.** Ein visuell verstecktes Feld (`#cm-hp`). Ist es gefüllt, wird
   der Beitrag verworfen, ohne einen Fehler zu zeigen.
7. **Melden.** Ein gemeldeter Beitrag wird lokal ausgeblendet (`hiddenPosts`),
   nicht gelöscht. Die Seite behauptet keine Moderation, die sie nicht hat.

### Selbsttest

Der Knopf „Selbsttest starten“ schickt sieben Payloads durch denselben Renderer,
der jeden Beitrag rendert: `<img onerror>`, `<script>`, `javascript:`-Link,
`<iframe>`, `data:`-Link, `<svg onload>`, `<style>`. Geprüft wird, dass kein
Element aus der Gefahrenliste entsteht, kein `on*`-Attribut übrig bleibt und kein
Link ein gefährliches Protokoll behält.

### Was ein echter Betrieb zusätzlich braucht

Dieser statische Modus ersetzt **keine** Serverregeln. Für echte Konten:

- Beiträge serverseitig validieren und in einer Datenbank mit Row Level Security
  speichern (siehe [KONTO.md](KONTO.md)).
- Ratenlimits pro Konto **und** pro IP im Edge Function / API-Layer.
- Moderation mit Rollen, Meldequeue und Sperren.
- E-Mail-Verifizierung vor dem ersten Beitrag.
- Signierte Uploads nur für Bilder, mit Größen- und Typprüfung.
- Regelmäßige Abhängigkeitsprüfung (`npm audit`, Dependabot) für den Build.

## Sprache

Die Seite nutzt die vorhandene DE/EN-Engine aus `components.js`
(`data-en`, `data-en-ph`, `data-en-aria`) und hört auf `bw:lang`. Dynamische
Texte laufen über `t(de, en)` in `community.js`. Eine weitere Sprache braucht:
einen Knopf im Header, einen Eintrag in `components.js` (`applyLang`) und je
Text ein weiteres Datenattribut — die Struktur ist darauf vorbereitet.

## Dateien und Besitz

| Datei | Gehört | Änderbar durch |
|---|---|---|
| `community.html` | Community-Agent | nur nach Absprache |
| `styles-community.css` | Community-Agent | nur nach Absprache |
| `community.js` | Community-Agent | nur nach Absprache |
| `community-scene.js` | Community-Agent | nur nach Absprache |
| `components.js` | Shared | Header-Eintrag abgestimmt, sonst Shared-Owner |
| `sitemap.xml` | Shared | Eintrag ergänzt |

Die Koordination läuft über das Agenten-Issue im Repository; das lokale Brett
liegt in [AGENTEN-BRETT.md](AGENTEN-BRETT.md).

## Prüfen

```
python3 -m http.server 8765
```

Dann `http://127.0.0.1:8765/community.html` öffnen.

### Was gemessen wurde

| Prüfung | Ergebnis |
|---|---|
| Breiten 1440, 1280, 1240, 1101, 1024, 900, 768, 560, 390, 320 px | kein horizontales Überlaufen (`scrollWidth == innerWidth`) |
| Konsolenfehler auf allen Breiten | 0 |
| Navigationsleiste mit neun Punkten | eine Zeile ab 1101 px, darunter Burger; Abstände 10–45 px |
| Kontrast (WCAG AA, Text unter 18,66 px) | alle Textknoten ≥ 4,5:1; Kleinste gilt für Sekundärtexte, Avatare 4,71–7,28:1 |
| Touch-Ziele bei 390 px | alle ≥ 32 px hoch (Suche 46 px) |
| `node --check` | `community.js`, `components.js`; `--input-type=module` für `community-scene.js` |
| Selbsttest auf der Seite | 7 von 7 Payloads abgewehrt |
| XSS über das Formular | 0 eingeschleuste `img`/`script`, 0 `javascript:`-Links |
| Abo | Developer schaltet die Werkstatt frei (2 gesperrte Karten → 3 lesbare Beiträge) |
| Tastatur | Escape schließt Dialoge, Fokus bleibt im Dialog, Pfeiltasten wechseln die Regal-Kategorie |
| Ohne JavaScript | `<noscript>`-Hinweis, Navigation und Footer bleiben lesbar |
| Ohne WebGL | fünf CSS-Fallback-Karten statt Canvas, keine Fehlermeldung |
| `prefers-reduced-motion` | ein statisches Bild, keine Animationsschleife |
| Sprache | DE/EN vollständig, inklusive dynamischer Texte und `aria-label` |
| Deep-Link | `community.html#thread-s3` öffnet das Thema direkt |

## Teaser für die Startseite

`index.html` gehört einem anderen Agenten und wurde hier absichtlich **nicht**
angefasst. Der fertige Abschnitt liegt als Kopiervorlage bereit; er benutzt nur
vorhandene Klassen (`sec-pad`, `wrap`, `sec-head`, `eyebrow`, `h2`, `lead`,
`btn`), braucht also kein zusätzliches CSS. Einfügen zwischen Showroom-Teaser
und Prozess (`<!-- ============ PROZESS ============ -->`), dann DE/EN prüfen:

```html
<section class="sec-pad" id="community" aria-labelledby="cm-teaser-title" data-screen-label="Community">
  <div class="wrap">
    <div class="sec-head reveal" style="margin-bottom:32px">
      <span class="eyebrow" data-en="Community · Workshop">Community · Werkstatt</span>
      <h2 class="h2" id="cm-teaser-title" data-en="Questions that keep building.">Fragen, die weiterbauen.</h2>
      <p class="lead" data-en="A forum for people who ship: code, products, tools. Ask precisely, answer briefly, and the answer that helped stays marked. The workshop opens with the developer subscription.">
        Ein Forum für Leute, die ausliefern: Code, Produkte, Werkzeuge. Präzise fragen, knapp antworten — und die Antwort, die geholfen hat, bleibt markiert. Die Werkstatt öffnet mit dem Entwickler-Abo.
      </p>
    </div>
    <div class="reveal" style="display:flex;gap:12px;flex-wrap:wrap">
      <a class="btn btn-primary" href="community.html"><span data-en="Open community">Community öffnen</span> <span class="arr">→</span></a>
      <a class="btn btn-ghost" href="community.html#abo"><span data-en="Plans for developers">Abo für Entwickler</span></a>
    </div>
  </div>
</section>
```

Sobald der Abschnitt drin ist: 1440 und 390 px prüfen, `node --check` entfällt
(kein JavaScript), aber die Sprachumschaltung einmal durchklicken.

## Redaktion

Beispiel-Themen liegen als `SEED` in `community.js`. Ein neues Thema ist ein
Objekt mit `id`, `cat`, `author`, `at` (Millisekunden), `tags`, `title` und
`body` (je `de`/`en`) sowie `replies`. Danach `node --check community.js` und die
Seite neu laden.
