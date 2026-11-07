# Sicherheit — Bytewerk Studio

Diese Website ist statisch (GitHub Pages, kein Build). Es gibt kein Backend,
keine Datenbank und in der ausgelieferten Fassung **kein Tracking**. Was hier
läuft, läuft im Browser der Besucherin.

## Eine Lücke melden

- **Mail:** [Haqmalh@icloud.com](mailto:Haqmalh@icloud.com?subject=Security%20report)
- **Maschinenlesbar:** [`.well-known/security.txt`](.well-known/security.txt)
- **Ablauf und Zusagen:** [sicherheit.html#meldeweg](sicherheit.html#meldeweg)

Bitte **kein** öffentliches Issue für eine ausnutzbare Lücke — eine Mail ist
schneller und bleibt zwischen uns, bis der Fix online ist.

**Was du erwarten kannst**

| Schritt | Zusage |
|---|---|
| Eingangsbestätigung | innerhalb von 48 Stunden, von einem Menschen |
| Einschätzung | mit Termin für den Fix, nicht mit Gegenfragen |
| Fix | in der Regel innerhalb von 14 Tagen |
| Nennung | auf Wunsch, mit Name oder Pseudonym |
| Kopfgeld | keins — dafür schnelle Antwort und sauberer Fix |

**Abgrenzung.** In guter Absicht melden und die Daten für sich behalten ist
in Ordnung. Nicht in Ordnung: Daten fremder Personen auslesen, Dienste
lahmlegen, automatisierte Lasttests ohne vorherige Absprache. Prüfe nur
Konten, die dir gehören, und lösche erhobene Daten nach der Meldung.

## Was hier bereits gehärtet ist

- **Content-Security-Policy** auf jeder Seite: `default-src 'self'`,
  `object-src 'none'`, `base-uri 'self'`, kein `unsafe-eval`.
- **Keine fremden Skripte.** three.js liegt lokal in `vendor/`, Schriften
  werden selbst gehostet bzw. über `fonts.gstatic.com` nur als Schrift geladen.
- **Kein `innerHTML` für berechnete Inhalte.** Alle dynamischen Texte gehen
  über `textContent` oder `createElement`.
- **Konten lokal** (Vorschau): PBKDF2-SHA256, 310.000 Runden, 16-Byte-Salz je
  Konto, Sperre nach fünf Fehlversuchen für 60 Sekunden.
- **Supabase-Variante:** Row Level Security auf allen Tabellen, drei Policies
  auf `profiles`, anon key im Client — `service_role` niemals.

Die vollständige, ehrliche Aufstellung inklusive der zwei bekannten Schwächen
steht in [`docs/SICHERHEIT.md`](docs/SICHERHEIT.md).

## Für Mitwirkende

Keine Secrets, Keys, Logs oder Build-Artefakte committen. Kein CDN für
Skripte hinzufügen — die CSP blockt es, und das fällt erst im Browser auf.
Neue Three.js-Szenen nutzen den vorhandenen Build in `vendor/`.
