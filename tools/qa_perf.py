#!/usr/bin/env python3
"""Performance-Messung je Seite.

Misst pro Seite: übertragene Bytes, Anzahl Requests, größte Einzeldatei,
Bilder ohne feste Maße (CLS-Risiko), lazy geladene Bilder, LCP und CLS aus
der Performance-API. Schreibt docs/qa/perf.json.

Ein Absturz des Renderers ist kein Messergebnis: Die Seite wird nach einem
Neustart vollständig neu gemessen, nicht mit leerem Ergebnis übernommen.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_perf.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]

INIT = """
  window.__lcp = 0; window.__cls = 0;
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) window.__lcp = e.startTime;
    }).observe({type: 'largest-contentful-paint', buffered: true});
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({type: 'layout-shift', buffered: true});
  } catch (e) {}
"""

METRICS = """() => {
  const imgs = [...document.images].map(i => ({
    src: i.currentSrc || i.src, w: i.getAttribute('width'),
    h: i.getAttribute('height'), lazy: i.loading === 'lazy',
    natural: i.naturalWidth || 0
  }));
  const nav = performance.getEntriesByType('navigation')[0] || {};
  return {
    lcp: Math.round(window.__lcp || 0),
    cls: Math.round((window.__cls || 0) * 1000) / 1000,
    dom: Math.round(nav.domContentLoadedEventEnd || 0),
    load: Math.round(nav.loadEventEnd || 0),
    images: imgs,
  };
}"""


def measure(pw, browser, name: str, base: str, depth: int = 0,
            width: int = 1440, height: int = 900):
    """Eine Seite messen. Gibt (row, browser) zurück; browser kann neu sein."""
    ctx = None
    row = {"page": name}
    try:
        ctx = browser.new_context(viewport={"width": width, "height": height})
        page = ctx.new_page()
        sizes = {}

        def on_response(resp):
            try:
                sizes[resp.url] = len(resp.body())
            except Exception:
                pass

        page.on("response", on_response)
        page.add_init_script(INIT)
        page.goto(f"{base}/{name}", wait_until="load", timeout=45000)
        page.wait_for_timeout(1800)
        metrics = page.evaluate(METRICS)
        images = metrics.pop("images")
        row.update(metrics)
        row["bytes"] = sum(sizes.values())
        row["requests"] = len(sizes)
        row["biggest"] = [
            {"url": u.replace(base, ""), "bytes": b}
            for u, b in sorted(sizes.items(), key=lambda kv: -kv[1])[:5]
        ]
        row["images_total"] = len(images)
        row["images_lazy"] = sum(1 for i in images if i["lazy"])
        row["images_no_dims"] = sum(1 for i in images if not i["w"] or not i["h"])
        row["images_oversize"] = sum(
            1 for i in images if i["natural"] and i["w"] and int(i["w"]) * 2 < i["natural"] - 80
        )
    except Exception as exc:
        # Renderer abgestürzt: aufräumen, Browser neu starten, Seite komplett
        # neu messen. Ein leeres Ergebnis wird nicht als Messung übernommen.
        try:
            if ctx:
                ctx.close()
        except Exception:
            pass
        try:
            browser.close()
        except Exception:
            pass
        time.sleep(1.5)
        if depth >= 2:
            row["error"] = str(exc)[:160]
            return row, browser
        browser = pw.chromium.launch(args=ARGS)
        row, browser = measure(pw, browser, name, base, depth + 1, width, height)
        row["retried"] = True
    finally:
        if ctx:
            try:
                ctx.close()
            except Exception:
                pass
    return row, browser


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    ap.add_argument("--only", default="", help="Kommagetrennte Seitennamen")
    ap.add_argument("--width", type=int, default=1440, help="Viewport-Breite")
    ap.add_argument("--height", type=int, default=900, help="Viewport-Höhe")
    ap.add_argument("--label", default="", help="Namenszusatz, z. B. mobil")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    pages = sorted(p.name for p in ROOT.glob("*.html") if p.name not in SKIP)
    if args.only:
        wanted = {p.strip() for p in args.only.split(",") if p.strip()}
        pages = [p for p in pages if p in wanted]

    rows = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=ARGS)
        for name in pages:
            row, browser = measure(pw, browser, name, args.base,
                                   width=args.width, height=args.height)
            if args.label:
                row["label"] = args.label
            rows.append(row)
            print(f"{name}: {row.get('bytes', 0)//1024} KB, {row.get('requests', 0)} Requests, "
                  f"LCP {row.get('lcp', '–')} ms, CLS {row.get('cls', '–')}", flush=True)
        try:
            browser.close()
        except Exception:
            pass

    # Teil-Läufe dürfen die Sammeldatei nicht auf die paar Seiten kürzen.
    target = outdir / (f"perf-{args.label}.json" if args.label else "perf.json")
    if args.only and target.exists():
        try:
            old = json.loads(target.read_text(encoding="utf-8"))
            measured = {r["page"] for r in rows}
            rows = rows + [r for r in old.get("rows", []) if r.get("page") not in measured]
            rows.sort(key=lambda r: r.get("page", ""))
        except Exception:
            pass

    bad = [r for r in rows if not r.get("bytes") or "error" in r]
    ok = [r for r in rows if r not in bad]
    summary = {
        "pages": len(rows),
        "errors": len(bad),
        "median_bytes": sorted(r["bytes"] for r in ok)[len(ok) // 2] if ok else 0,
        "max_bytes": max((r["bytes"] for r in ok), default=0),
        "median_lcp": sorted(r.get("lcp", 0) for r in ok)[len(ok) // 2] if ok else 0,
        "worst_lcp": max((r.get("lcp", 0) for r in ok), default=0),
        "pages_cls_over_01": sum(1 for r in ok if r.get("cls", 0) > 0.1),
        "images_without_dims": sum(r.get("images_no_dims", 0) for r in ok),
    }
    target.write_text(
        json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("PERF", json.dumps(summary, ensure_ascii=False))
    for r in bad:
        print("  ohne Messung:", r["page"], r.get("error") or r.get("note"))
    return 0 if not bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
