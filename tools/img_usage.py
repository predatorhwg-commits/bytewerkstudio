#!/usr/bin/env python3
"""Misst, wie groß Bilder tatsächlich angezeigt werden.

Ein Bild mit 1672 px Breite, das nie über 601 CSS-Pixel dargestellt wird,
überträgt rund zwei Drittel seiner Bytes umsonst. Das Werkzeug öffnet
jede Seite bei 1440 px, scrollt sie vollständig durch (damit lazy
geladene Bilder wirklich messen) und notiert je Datei die größte
dargestellte Breite.

Ausgabe: docs/qa/img-usage.json

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/img_usage.py --base http://127.0.0.1:8809
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

COLLECT = """() => {
  const out = [];
  for (const img of document.images) {
    const src = img.currentSrc || img.src;
    if (!src || !src.includes('/media/')) continue;
    const r = img.getBoundingClientRect();
    if (!r.width) continue;
    out.push({file: src.split('/').pop(), shown: Math.round(r.width),
              natural: img.naturalWidth || 0, height: Math.round(r.height)});
  }
  return out;
}"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    pages = sorted(p.name for p in ROOT.glob("*.html") if p.name not in SKIP)
    usage: dict[str, dict] = {}

    with sync_playwright() as pw:
        browser = None
        for name in pages:
            if browser is None or not browser.is_connected():
                browser = pw.chromium.launch(args=ARGS)
            ctx = None
            try:
                ctx = browser.new_context(viewport={"width": 1440, "height": 900})
                page = ctx.new_page()
                page.goto(f"{args.base}/{name}", wait_until="load", timeout=45000)
                # Durchscrollen, sonst bleiben loading="lazy"-Bilder bei 0 px.
                page.evaluate("""async () => {
                  const step = window.innerHeight * 0.8;
                  for (let y = 0; y < document.body.scrollHeight; y += step) {
                    window.scrollTo(0, y);
                    await new Promise(r => setTimeout(r, 90));
                  }
                  window.scrollTo(0, 0);
                }""")
                page.wait_for_timeout(500)
                for row in page.evaluate(COLLECT):
                    cur = usage.setdefault(row["file"], {
                        "file": row["file"], "shown_max": 0,
                        "shown_at": "", "natural": row["natural"], "pages": [],
                    })
                    if row["shown"] > cur["shown_max"]:
                        cur["shown_max"] = row["shown"]
                        cur["shown_at"] = name
                    if name not in cur["pages"]:
                        cur["pages"].append(name)
                    cur["natural"] = max(cur["natural"], row["natural"])
                print(f"{name}: {len(page.evaluate(COLLECT))} Bilder", flush=True)
            except Exception as exc:
                print(f"{name}: abgebrochen ({str(exc)[:60]})", flush=True)
                try:
                    browser.close()
                except Exception:
                    pass
                browser = None
            finally:
                if ctx:
                    try:
                        ctx.close()
                    except Exception:
                        pass
        try:
            browser.close()
        except Exception:
            pass

    rows = []
    for info in sorted(usage.values(), key=lambda r: -r["natural"]):
        need = info["shown_max"] * 2  # 2x für scharfe Darstellung auf Retina
        info["needed_px"] = need
        info["oversize"] = round(info["natural"] / need, 2) if need else 0
        if info["oversize"] >= 1.5 and info["natural"] > 400:
            rows.append(info)

    (outdir / "img-usage.json").write_text(
        json.dumps({"images": sorted(usage.values(), key=lambda r: r["file"]),
                    "oversize": rows}, indent=2, ensure_ascii=False),
        encoding="utf-8")

    print(f"\nBilder gesamt: {len(usage)} | deutlich zu groß: {len(rows)}")
    for r in rows[:15]:
        print(f"  {r['file']:40} {r['natural']:5} px geliefert, "
              f"{r['shown_max']:4} px gezeigt ({r['oversize']}x)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
