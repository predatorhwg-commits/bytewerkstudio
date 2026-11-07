# Marketing — was auf der Seite schon eingebaut ist

Stand: 7. November 2026. Diese Datei beschreibt die vorhandenen Marketing-
Flächen und die Regeln, nach denen sie gepflegt werden. Sie ist keine
Kampagnenplanung, sondern die technische Grundlage dafür.

## Sichtbare Flächen

| Fläche | Datei | Zweck |
|---|---|---|
| Startseite mit Hero, Kennzahlen, Leistungen, Arbeiten, Shop, Prozess, Studio, Preisen, Konfigurator, FAQ, CTA | `index.html` | Verkauf und Selbstdarstellung |
| Community-Abschnitt mit Forum, API und Sicherheit | `index.html#community` | führt in Forum, Entwicklerbereich und Sicherheitsseite |
| Werkverzeichnis mit elf Produkten | `arbeiten.html` | Referenz und Vertrauen |
| 3D-Showroom | `showroom.html` | Produkt erklären, ohne Textwand |
| Produktseiten mit Preis, Kaufweg und Cross-Sell | `produkt.html` u. a. | direkter Verkauf per Mail/PayPal |
| Entwicklerbereich mit Abo-Stufen und Sandbox | `entwickler.html` | zweite Zielgruppe: Entwickler |
| Forum | `forum.html` | Bindung, Wissensarchiv, organische Sichtbarkeit |
| Sicherheitsseite mit Meldeweg | `sicherheit.html` | Vertrauen bei Einkauf und Bewerbung |

## Suchmaschinen

- Jede indexierbare Seite hat eine eigene `description` (70–175 Zeichen),
  einen `canonical` und vollständige Open-Graph- und Twitter-Tags.
- Strukturierte Daten: `ProfessionalService` auf der Startseite,
  `SoftwareApplication` + `Offer` auf Produktseiten, `OfferCatalog` für das
  Abo, `BreadcrumbList` wo es Sinn ergibt.
- `sitemap.xml` führt 29 URLs mit `lastmod`; `robots.txt` erlaubt alles und
  verweist auf die Sitemap.
- Konto-, Login- und Reset-Seiten sind `noindex` und stehen nicht in der Sitemap.
- Sprache: Eine URL, zwei Sprachen (DE/EN) über `data-en` und `bw-lang`.
  `hreflang` wäre falsch, solange es keine getrennten URLs gibt.

## Soziale Vorschau

| Seite | Bild |
|---|---|
| Startseite und Standard | `media/og-bytewerk.png` |
| Forum | `media/og-forum.jpg` |
| Sicherheit | `media/og-sicherheit.jpg` |
| Entwicklerbereich | `media/og-entwickler.png` |
| Produktseiten | je eigenes `media/og-<produkt>.png` |

Die Bilder sind 1200 × 630 px. Wer eine neue Seite anlegt, kopiert den
OG-Block einer bestehenden Seite und tauscht `og:url`, `og:title`,
`og:description` und `og:image`.

## Regeln

1. **Keine Werbe-Cookies, kein Tracking, keine externen Skripte.** Das ist
   Teil des Verkaufsarguments und steht so im Datenschutztext.
2. **Preise nur an einer Stelle je Produkt.** Die Übersicht verlinkt, die
   Produktseite nennt den Preis. Abo-Preise stehen ausschließlich auf
   `entwickler.html`; `abo.html` leitet dorthin weiter.
3. **Jede Aussage ist belegbar.** Keine erfundenen Kundenstimmen, keine
   Reichweitenzahlen, keine Bewertungen ohne Quelle.
4. **Deutsch ist die Quelle, Englisch die Übersetzung.** Neue Texte bekommen
   `data-en`; die Prüfwerkzeuge unten zählen, was noch fehlt.
5. **Bilder unter 200 kB, `loading="lazy"` außerhalb des ersten Bildschirms.**

## Prüfwerkzeuge

```
python3 tools/qa_seo.py                     # Titel, Description, OG, JSON-LD
python3 tools/qa_site.py --static-only      # Links, IDs, Alt-Texte, CSP
python3 tools/qa_site.py --base http://127.0.0.1:8809   # Browser: 3 Breiten
```

Ergebnisse landen in `docs/qa/`. Der letzte Lauf ist in
[QA-BERICHT.md](QA-BERICHT.md) zusammengefasst.
