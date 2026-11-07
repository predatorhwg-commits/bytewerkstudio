"""Misst LCP, CLS und Seitengewicht je Seite im Browser."""
import pathlib
import sys
from playwright.sync_api import sync_playwright

PAGES = sys.argv[1:] or [p.name for p in sorted(pathlib.Path(".").glob("*.html"))
                         if not p.name.startswith("google")]

MESS = """
() => new Promise((fertig) => {
  const erg = {lcp: 0, cls: 0, shifts: []};
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) erg.lcp = Math.round(e.startTime);
    }).observe({type: 'largest-contentful-paint', buffered: true});
  } catch (e) {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (!e.hadRecentInput) {
          erg.cls += e.value;
          if (e.value > 0.001) erg.shifts.push([Math.round(e.startTime), +e.value.toFixed(4)]);
        }
      }
    }).observe({type: 'layout-shift', buffered: true});
  } catch (e) {}
  setTimeout(() => {
    const r = performance.getEntriesByType('resource');
    erg.bytes = r.reduce((s, x) => s + (x.transferSize || 0), 0);
    erg.requests = r.length;
    erg.dom = document.querySelectorAll('*').length;
    erg.fertig = true;
    fertig(erg);
  }, 2600);
})
"""

print(f"{'Seite':36} {'LCP':>6} {'CLS':>7} {'KB':>7} {'Req':>5} {'DOM':>6}")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-gpu"])
    for name in PAGES:
        try:
            pg = b.new_page(viewport={"width": 1440, "height": 900}, locale="de-DE")
            pg.goto("http://127.0.0.1:8907/" + name, wait_until="load", timeout=40000)
            m = pg.evaluate(MESS)
            print(f"{name:36} {m['lcp']:5}ms {m['cls']:7.4f} {m['bytes']/1024:6.0f} "
                  f"{m['requests']:5} {m['dom']:6}")
            if m["shifts"]:
                print(f"      Shifts: {m['shifts'][:4]}")
            pg.close()
        except Exception as e:
            print(f"{name:36} FEHLER {str(e)[:40]}")
    b.close()
