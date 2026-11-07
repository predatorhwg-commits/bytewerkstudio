#!/usr/bin/env python3
"""Screenshots aller Seiten für die Sichtprüfung.

Standard: Desktop 1440 × 900 je Seite, zusätzlich Startseite in Tablet und
Mobil. WebGL bleibt an, damit die 3D-Bühnen im Bild sind.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_shots.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]

VARIANTS = [
    ("desktop", 1440, 900, None),
    ("tablet", 768, 1024, {"index.html"}),
    ("mobile", 390, 844, {"index.html"}),
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
    done = []

    with sync_playwright() as pw:
        for label, width, height, only in VARIANTS:
            browser = pw.chromium.launch(args=ARGS)
            for name in pages:
                if only and name not in only:
                    continue
                target = outdir / f"{name.replace('.html', '')}-{label}.png"
                for attempt in (1, 2):
                    ctx = None
                    try:
                        ctx = browser.new_context(viewport={"width": width, "height": height},
                                                  device_scale_factor=1)
                        ctx.add_init_script("try{localStorage.setItem('bw-lang','de')}catch(e){}")
                        page = ctx.new_page()
                        page.goto(f"{args.base}/{name}", wait_until="domcontentloaded", timeout=30000)
                        page.wait_for_timeout(1400)
                        # 3D-Bühnen laden teils erst beim Scrollen.
                        page.evaluate("""() => {
                          const c = document.querySelector('canvas');
                          if (c) c.scrollIntoView({block: 'center'});
                        }""")
                        page.wait_for_timeout(900)
                        page.evaluate("window.scrollTo(0, 0)")
                        page.wait_for_timeout(400)
                        page.screenshot(path=str(target), full_page=False, timeout=15000)
                        done.append(str(target))
                        print(f"[{label}] {name}", flush=True)
                        break
                    except Exception as exc:
                        print(f"  [{label}] {name} Versuch {attempt}: {str(exc)[:70]}", flush=True)
                        time.sleep(1.5)
                        if attempt == 2:
                            continue
                    finally:
                        if ctx:
                            try:
                                ctx.close()
                            except Exception:
                                pass
                if not browser.is_connected():
                    browser = pw.chromium.launch(args=ARGS)
            try:
                browser.close()
            except Exception:
                pass

    print(f"SHOTS {len(done)} Aufnahmen in {outdir}")
    return 0 if len(done) >= len(pages) else 1


if __name__ == "__main__":
    raise SystemExit(main())
