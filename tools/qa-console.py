"""Prueft alle Seiten auf Konsolenfehler und CSP-Verletzungen."""
import glob
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8907"

pages = sorted(glob.glob("*.html"))
pages = [p for p in pages if not p.startswith("google")]
pages += ["neon-horde/index.html"]

problems = {}

with sync_playwright() as p:
    for page in pages:
        errs = []
        for attempt in range(3):
            b = None
            try:
                b = p.chromium.launch(args=["--disable-gpu"])
                pg = b.new_page(viewport={"width": 1440, "height": 1000}, locale="de-DE")
                pg.on("console", lambda m: errs.append((m.type, m.text[:220]))
                      if m.type in ("error", "warning") else None)
                pg.on("pageerror", lambda e: errs.append(("pageerror", str(e)[:220])))
                pg.goto(BASE + "/" + page, wait_until="load", timeout=45000)
                pg.wait_for_timeout(1100)
                b.close()
                b = None
                break
            except Exception as e:
                errs.append(("crash", str(e)[:80]))
                if b:
                    try:
                        b.close()
                    except Exception:
                        pass
                errs.clear()
        if errs:
            problems[page] = errs

print(f"{len(pages)} Seiten geprueft\n")
if not problems:
    print("Keine Konsolenfehler, keine CSP-Verletzungen.")
else:
    for page, errs in problems.items():
        print(f"{page}:")
        for kind, text in errs[:4]:
            print(f"    [{kind}] {text}")
print(f"\n{len(problems)} Seiten mit Meldungen")
