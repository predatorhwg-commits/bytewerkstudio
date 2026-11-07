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
