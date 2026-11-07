"""Listet die groessten geladenen Ressourcen je Seite."""
import sys
from playwright.sync_api import sync_playwright

PAGES = sys.argv[1:]

ABFRAGE = """
() => performance.getEntriesByType('resource')
  .map(r => ({name: r.name.split('/').pop(), bytes: r.transferSize || 0,
              typ: r.initiatorType, ms: Math.round(r.duration)}))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 10)
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-gpu"])
    for name in PAGES:
        pg = b.new_page(viewport={"width": 1440, "height": 900}, locale="de-DE")
        pg.goto("http://127.0.0.1:8907/" + name, wait_until="load", timeout=40000)
        pg.wait_for_timeout(2500)
        print(f"\n=== {name} ===")
        for r in pg.evaluate(ABFRAGE):
            print(f"  {r['bytes']/1024:7.1f} KB  {r['ms']:5}ms  {r['typ']:10} {r['name'][:60]}")
        pg.close()
    b.close()
