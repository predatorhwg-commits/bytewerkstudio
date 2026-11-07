# HOCHSPANNUNG — wie es gebaut ist

`hochspannung.html` ist die Seite, `hochspannung.js` die Spiellogik,
`styles-hochspannung.css` die Gestaltung. Das Vorschaubild liegt unter
`media/og-hochspannung.png`.

## Die Idee

Ein Funke hängt an einer Stromleitung. Halten greift die nächste Leitung,
Loslassen schleudert ihn weiter. Wer im richtigen Moment loslässt, sammelt
Energie und kommt weit. Eine Taste, eine Hand, kein Konto, kein Download.

Bewusst kein zweiter Shooter neben `neon-horde/`: Das hier ist ein
Geschicklichkeitsspiel mit einer einzigen Eingabe, das auch auf dem Handy
im Hochformat funktioniert.

## Steuerung

| Eingabe | Wirkung |
| --- | --- |
| Leertaste, Pfeil hoch, W | greifen (gedrückt halten), loslassen |
| Finger / Maus auf der Bühne | greifen, loslassen |
| P oder Esc | Pause / weiter |
| M | Ton an / aus |

Im Startmenü startet die Leertaste das Spiel. Nach dem Start hängt der
Funke bereits an der ersten Leitung; `grabLock = 0.45 s` verhindert, dass
ein versehentlicher früher Tipp den ersten Schwung sofort beendet. Ein
Tipp in dieser Zeit wird gemerkt und direkt nach Ablauf der Sperre
ausgeführt.

## Physik und Tuning

Alle Werte stehen oben in `hochspannung.js`:

- `GRAVITY 1650`, `SWING_ACCEL 980`, `MAX_SPEED 1380`
- `GRAB_RANGE 330`, `STEP 1/120`, `METRE 40`
- Anker liegen anfangs 280–320 px auseinander und rücken mit der
  Schwierigkeit enger zusammen; `dyMax` hält den nächsten Greifpunkt
  immer innerhalb der Reichweite.
- Der Schwung-Antrieb wirkt nur unterhalb des Aufhängepunkts (`dy > -60`).
  Ein verpasster Absprung kann so keinen Looping antreiben.
- Hindernisse bleiben in der unteren Hälfte (y 430–545), Anker darüber.
  Ein Hindernis kann nie auf einem Greifpunkt liegen.

## Punkte

`Punkte = Meter + Energiewert + Bonus`.

- Meter: größte erreichte Weite, 40 Weltpixel pro Meter.
- Energie: 10 Punkte × Multiplikator. Vier eingesammelte Orbs erhöhen den
  Multiplikator (maximal ×5); 3,4 s ohne Orb setzen ihn zurück.
- Sauberer Absprung (12–66°, schneller als 260, mindestens 0,1 s gehalten):
  +25 und ein kleiner Schub.
- Knapp an einem Hindernis vorbei: +10.

Der Rekord liegt lokal unter `bw-hochspannung-best-v1`, der Tonzustand
unter `bw-hochspannung-mute-v1`. Es gibt kein Tracking, keine Cookies und
zur Laufzeit keinen Netzwerkaufruf.

## Sicherheit und Barrierefreiheit

- CSP ohne `unsafe-inline`; der einzige ausführbare Inline-Block ist der
  Sprach-Snippet im Kopf, abgesichert über denselben SHA-256-Hash wie `forum.html`.
- Keine Bibliotheken, keine Assets, keine externen Skripte. Canvas 2D und
  WebAudio werden direkt benutzt.
- `prefers-reduced-motion` reduziert Partikel und schaltet die Puls-
  Animation des Loslass-Hinweises ab.
- Die Bühne ist per Tastatur bedienbar, Buttons haben Beschriftungen, der
  Spielstatus wird über eine höfliche Live-Region gemeldet.
- Deutsch und Englisch; jede andere Sprache (auch Spanisch) liest
  Englisch, nie Deutsch. Echte `data-es`-Texte werden nicht überschrieben.

## Prüfungen

Getestet wurde mit Playwright gegen einen lokalen Server:

- Laden und Layout bei 1440, 1024, 900, 768, 390 und 320 px:
  0 Konsolenfehler, 0 CSP-Verstöße, 0 horizontaler Überlauf.
- Start, Pause/Weiter, Tod, Neustart, Rekord-Speicherung, Mute, EN/ES.
- Touch: früher Tipp während der Sperre wird nachgeholt; Loslassen beendet
  den Schwung.
- Bot-Lauf: 32 Greifer / 32 Absprünge, Tod bei 1.320 Punkten, kein Absturz.
- Canvas-Pixelproben: Die Bühne ist nach dem Laden nachweislich bemalt.

`window.BWHS.getState()` liefert den Spielzustand lesend für Prüfungen —
absichtlich ohne Setter.

## Einbindung

`hochspannung.html` steht im Footer aller Seiten und in `sitemap.xml`.
Die Seite ist eigenständig; zum Entfernen reichen die drei Dateien, das
Vorschaubild, der Footer-Eintrag und der Sitemap-Block.
