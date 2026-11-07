# Marketing — Bytewerk Studio

Stand: 07.11.2026. Diese Datei sammelt, was die Seite für Sichtbarkeit tut, was
sie bewusst nicht tut und welche Texte für Kampagnen bereitstehen.

## 1. Positionierung

**Ein Satz:** Bytewerk Studio baut Software, Web und Apps in Ludwigshafen am
Rhein — ruhig gebaut, sauber übergeben, ohne Agentur-Lärm.

**Für wen:** kleine und mittlere Betriebe in der Metropolregion Rhein-Neckar,
Gründer und Tech-Teams, die eine zweite Meinung zu Architektur oder Code wollen.

**Abgrenzung:** kein Full-Service-Marketing, keine Werbebudgets, keine
Dauerbetreuung auf Zuruf. Stattdessen: klarer Bauplan, feste Stufen, fester
Preis, Code, der auch nach der Übergabe lesbar ist.

## 2. Botschaften pro Seite

| Seite | Botschaft | Ziel |
|---|---|---|
| `index.html` | Software aus Ludwigshafen, die bleibt | Erstkontakt, Vertrauen |
| `softwareentwicklung-ludwigshafen.html` | Lokal erreichbar, technisch auf Stand | lokale Suche |
| `entwickler.html` | Werkstatt für Leute, die bauen | Abo, Community |
| `community.html` | Fragen, die weiterbauen | Forum-Nutzung, Abo |
| `shop.html` | Werkzeuge, die wir selbst benutzen | Direktverkauf |
| `arbeiten.html` | Gebaut, nicht behauptet | Referenzprüfung |
| `studio.html` | Wer dahinter steht | Bindung |

## 3. Kanäle ohne Budget

1. **Lokale Suche.** Jede Leistungsseite nennt Ort und Leistung im Titel
   („Softwareentwicklung Ludwigshafen"), die Startseite verlinkt sie im Footer.
   Google Business Profil mit identischer Adresse und Telefonnummer anlegen.
2. **Fachliche Sichtbarkeit.** Die Forum-Themen sind so geschrieben, dass sie
   echte Suchfragen beantworten (three.js, CSP, Supabase RLS). Jedes gelöste
   Thema ist eine landing page ohne Werbekosten.
3. **Weitergeben ohne Tracking.** `community.html#forum` hat eine
   Weitergeben-Karte: Link kopieren, E-Mail-Einladung, LinkedIn. Bewusst ohne
   `utm_`-Parameter — der Link bleibt sauber, die Seite verspricht das auch.
4. **Direkte Ansprache.** `kontakt.html` mit vorbereiteter Mail pro Abo-Stufe
   (`entwickler.js` erzeugt Betreff, Tarif, Zeitraum, Preis). Kein Formular,
   das ins Leere läuft.
5. **Shop als Beweis.** Produktseiten zeigen, was gebaut wurde; der Shop ist
   der kürzeste Weg vom Interesse zum Umsatz.

## 3a. Vorschau in Suche und Chat

Wenn jemand einen Link teilt, entscheidet die Vorschau, ob geklickt wird. Stand
vor dieser Runde: 15 Seiten zeigten auf `logo.svg` — ein 28×28-SVG, das kaum
eine Plattform als Bild anzeigt — und `arbeiten.html` zeigte auf ein
`og-bytewerk.png`, das es nicht gab.

Jetzt hat jede öffentliche Seite eine eigene 1200×630-Karte in
`media/og-*.png`. Aufbau: Kicker, drei Zeilen Überschrift mit Terrakotta-Punkt,
Untertitel, Domain, rechts eine Kachel mit dem Produktzeichen. Erzeugt von
`tools/og-images.py`, damit die Karten reproduzierbar sind, wenn sich eine
Überschrift ändert.

| Seiten | Karte |
|---|---|
| Startseite, AGB, Datenschutz, Impressum | `og-bytewerk.png` |
| `community.html`, `forum.html` | `og-community.png` |
| `entwickler.html` | `og-entwickler.png` |
| `shop.html`, `showroom.html`, `arbeiten.html`, `studio.html` | eigene Karte je Seite |
| `marke.html`, `bauplan.html`, `kontakt.html`, `vergleich.html` | eigene Karte je Seite |
| Produktseiten (9) | Karte mit Produktzeichen |
| `checkout.html`, `produkt.html`, `lernreich-pro.html` | `og-lernreich-pro.png` |

Dazu auf jeder Seite `og:image:width`, `:height`, `:type` und ein passendes
`twitter:image`. `node tools/check-social.mjs .` prüft, dass die Datei
existiert, die Maße stimmen und `og:url` zur kanonischen Adresse passt.

Was das nicht ist: keine Werbung, kein Tracking. Es ist nur die Karte, die beim
Teilen erscheint.

## 4. Texte für den Erstkontakt

**Kurzbeschreibung (50 Wörter):**
Bytewerk Studio entwickelt Software, Websites und Apps in Ludwigshafen am
Rhein. Wir arbeiten in klaren Stufen mit festem Preis, dokumentieren die
Übergabe und bleiben erreichbar, wenn das Projekt läuft. Für Teams, die eine
zweite Meinung zu Architektur oder Code brauchen, gibt es die Werkstatt mit
Forum und Abo.

**Einladung ins Forum:**
„Du hängst an einem Problem, das jemand schon gelöst hat? Im Bytewerk-Forum
stehen Fragen und Antworten offen — ohne Konto lesbar, ohne Tracking."

**Einladung ins Abo:**
„Ein Code-Review im Monat, frühe Builds und ein ruhiger Raum für Fragen, die
nicht in ein öffentliches Issue gehören."

## 5. Was die Seite nicht tut

- Kein Tracking, keine Cookies außer dem Sprachschlüssel (`bw-lang`) und dem
  lokalen Forum-Zustand. Beides bleibt im Browser.
- Keine Werbenetzwerke, keine Retargeting-Pixel, keine Pop-ups.
- Keine erfundenen Referenzen, keine Bewertungssterne ohne Quelle.
- Keine Dringlichkeit, die es nicht gibt („nur heute").

Das ist selbst Teil der Positionierung: wer keine Daten sammelt, muss sie auch
nicht erklären.

## 6. Messen ohne Verletzung der Privatsphäre

Die Seite liefert keine Analytics. Wer Zahlen braucht, liest sie aus den
Server-Logs des Hosters (aggregiert, ohne IP-Speicherung) oder fragt nach dem
ersten Kontakt direkt. Für das Forum gilt: sichtbare Themen, Antworten und
gelöste Marken sind die Kennzahlen, die zählen.

## 7. Nächste Schritte (Priorität)

1. Google Business Profil und einheitliche NAP-Daten (Name, Adresse, Telefon).
2. Drei Forum-Themen pro Monat, jeweils mit echtem Fehlerbild und Lösung.
3. Einen Fall aus `arbeiten.html` als Kurzbericht verlinken (Problem, Weg,
   Ergebnis in Zahlen).
4. Shop-Produkte mit klarem Nutzen im ersten Satz; Preis und Lieferumfang
   ohne Kleingedrucktes.
5. Quartalsweise prüfen: welche Seite bringt Kontakte, welche nur Traffic.
