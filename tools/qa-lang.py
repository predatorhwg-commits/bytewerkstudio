"""Prueft den Sprachwechsel auf allen 31 Website-Seiten.

Laeuft im Repo-Verzeichnis und liest die Seitenliste von dort.
"""
import pathlib
import re
from playwright.sync_api import sync_playwright

PAGES = [p.name for p in sorted(pathlib.Path(".").glob("*.html")) if not p.name.startswith("google")]
DE = re.compile(r"[äöüÄÖÜß]|\b(und|der|die|das|mit|für|auf|ist|wird|wir|dein|deine|nicht|eine|einen|"
                r"einem|kannst|sich|auch|oder|aber|wenn|mehr|alle|uns|sind|hat|haben|werden|zum|zur)\b", re.I)
PRODUKTE = ("prüfungs-countdown", "burgenwerk", "mastil", "neon dominion", "lernreich",
            "keyforge vault", "lumaweek", "updatepilot", "pdf text pro", "bytewerk studio")

zeilen = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-gpu"])
    for name in PAGES:
        try:
            pg = b.new_page(viewport={"width": 1440, "height": 900}, locale="de-DE")
            pg.goto("http://127.0.0.1:8907/" + name, wait_until="load", timeout=40000)
            pg.wait_for_timeout(800)
            hat_knopf = pg.evaluate("!!document.querySelector('[data-lang-btn=\"en\"]')")
            if not hat_knopf:
                zeilen.append((name, "kein Sprachknopf", []))
                pg.close()
                continue
            pg.evaluate("document.querySelector('[data-lang-btn=\"en\"]').click()")
            pg.wait_for_timeout(600)
            rest = pg.evaluate("""
              () => {
                const m = document.querySelector('main') || document.body;
                const out = [];
                const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
                let n;
                while ((n = w.nextNode())) {
                  const t = (n.textContent || '').trim();
                  if (t.length < 10) continue;
                  out.push(t.slice(0, 60));
                }
                return out;
              }
            """)
            echte = []
            for t in rest:
                low = t.lower()
                if any(pr in low for pr in PRODUKTE) and len(t) < 30:
                    continue
                if DE.search(t):
                    echte.append(t)
            zeilen.append((name, f"{len(echte)}", echte))
            pg.close()
        except Exception as e:
            zeilen.append((name, "FEHLER " + str(e)[:40], []))

    b.close()

for name, status, echte in zeilen:
    print(f"{status:>8}  {name}")
    for t in echte[:3]:
        print(f"          {t}")

offen = [(n, e) for n, s, e in zeilen if e]
print(f"\n{len(offen)} Seiten mit deutschen Resten")
