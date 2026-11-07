#!/usr/bin/env python3
"""Performance-Messung je Seite.

Misst pro Seite: übertragene Bytes, Anzahl Requests, größte Einzeldatei,
Bilder ohne feste Maße (CLS-Risiko), lazy geladene Bilder, LCP und CLS aus
der Performance-API. Schreibt docs/qa/perf.json.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_perf.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    pages = sorted(p.name for p in ROOT.glob("*.html") if p.name not in SKIP)
    rows = []

    with sync_playwright() as pw:
        browser = None
        for name in pages:
            ctx = None
            row = {"page": name}
            if browser is None or not browser.is_connected():
                browser = pw.chromium.launch(args=ARGS)
            try:
                ctx = browser.new_context(viewport={"width": 1440, "height": 900})
                page = ctx.new_page()
                sizes = {}

                def on_response(resp):
                    try:
                        body = resp.body()
                    except Exception:
                        return
                    sizes[resp.url] = len(body)

                page.on("response", on_response)
                page.add_init_script("""
                  window.__lcp = 0; window.__cls = 0;
                  try {
                    new PerformanceObserver(list => {
                      for (const e of list.getEntries()) window.__lcp = e.startTime;
                    }).observe({type: 'largest-contentful-paint', buffered: true});
                    new PerformanceObserver(list => {
                      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
                    }).observe({type: 'layout-shift', buffered: true});
                  } catch (e) {}
                """)
                page.goto(f"{args.base}/{name}", wait_until="load", timeout=45000)
                page.wait_for_timeout(1800)
                metrics = page.evaluate("""() => {
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
                }""")
                total = sum(sizes.values())
                biggest = sorted(sizes.items(), key=lambda kv: -kv[1])[:5]
                images = metrics.pop("images")
                row.update(metrics)
                row["bytes"] = total
                row["requests"] = len(sizes)
                row["biggest"] = [{"url": u.replace(args.base, ""), "bytes": b} for u, b in biggest]
                row["images_total"] = len(images)
                row["images_lazy"] = sum(1 for i in images if i["lazy"])
                row["images_no_dims"] = sum(1 for i in images if not i["w"] or not i["h"])
                row["images_oversize"] = sum(
                    1 for i in images if i["natural"] and i["w"] and int(i["w"]) * 2 < i["natural"] - 80
                )
            except Exception as exc:
                # Ein abgestürzter Renderer ist kein Messergebnis: neu starten
                # und die Seite genau einmal wiederholen.
                try:
                    browser.close()
                except Exception:
                    pass
                browser = None
                try:
                    browser = pw.chromium.launch(args=ARGS)
                    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
                    page = ctx.new_page()
                    page.goto(f"{args.base}/{name}", wait_until="load", timeout=45000)
                    page.wait_for_timeout(1500)
                    row["bytes"] = 0
                    row["note"] = "Neustart ohne Bytezählung: " + str(exc)[:80]
                except Exception as exc2:
                    row["error"] = str(exc2)[:160]
            finally:
                if ctx:
                    try:
                        ctx.close()
                    except Exception:
                        pass
            rows.append(row)
            print(f"{name}: {row.get('bytes', 0)//1024} KB, {row.get('requests', 0)} Requests, "
                  f"LCP {row.get('lcp', '–')} ms, CLS {row.get('cls', '–')}", flush=True)
        try:
            browser.close()
        except Exception:
            pass

    ok = [r for r in rows if "error" not in r]
    summary = {
        "pages": len(rows),
        "errors": len(rows) - len(ok),
        "median_bytes": sorted(r.get("bytes", 0) for r in ok)[len(ok) // 2] if ok else 0,
        "max_bytes": max((r.get("bytes", 0) for r in ok), default=0),
        "median_lcp": sorted(r.get("lcp", 0) for r in ok)[len(ok) // 2] if ok else 0,
        "worst_lcp": max((r.get("lcp", 0) for r in ok), default=0),
        "pages_cls_over_01": sum(1 for r in ok if r.get("cls", 0) > 0.1),
        "images_without_dims": sum(r.get("images_no_dims", 0) for r in ok),
    }
    (outdir / "perf.json").write_text(
        json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("PERF", json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
