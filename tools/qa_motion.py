#!/usr/bin/env python3
"""Prüft, ob sich die Seite bei "Bewegung reduzieren" wirklich beruhigt.

WCAG 2.2 (2.3.3 Animation from Interactions, 2.2.2 Pause/Stop/Hide): Wer im
System "Bewegung reduzieren" gesetzt hat, darf keine dauerhaft laufenden
Animationen, keine automatisch wechselnden Inhalte und keine weichen
Übergänge bekommen.

Gemessen wird nicht der Quelltext, sondern der laufende Browser: Bilder
werden zu zwei Zeitpunkten aufgenommen und verglichen. Bewegt sich nichts,
sind sie gleich. Zusätzlich werden laufende CSS-Animationen und die
Übergangsdauer an sichtbaren Elementen geprüft.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_motion.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qa_store import merge_rows, write_report  # noqa: E402

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]

AUDIT = r"""
() => {
  const out = {running: [], longTransitions: []};
  for (const el of document.getAnimations ? document.getAnimations() : []) {
    let name = '';
    try { name = el.animationName || (el.effect && el.effect.getKeyframes ? 'transition' : ''); } catch (e) {}
    const timing = el.effect && el.effect.getTiming ? el.effect.getTiming() : {};
    const iterations = timing.iterations === undefined ? 1 : timing.iterations;
    const target = el.effect && el.effect.target ? el.effect.target : null;
    if (!target) continue;
    const r = target.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const endless = iterations === Infinity || iterations > 6;
    if (endless || (el.playState === 'running' && timing.duration > 400)) {
      out.running.push({
        cls: (target.className || '').toString().slice(0, 44),
        tag: target.tagName,
        duration: Math.round(Number(timing.duration) || 0),
        iterations: endless ? 'endlos' : iterations,
        state: el.playState
      });
    }
  }
  return out;
}
"""


def shot_bytes(page):
    return page.screenshot(full_page=False)


def diff_ratio(a, b):
    """Anteil unterschiedlicher Pixel zwischen zwei PNG-Aufnahmen."""
    from PIL import Image, ImageChops
    import io

    ia = Image.open(io.BytesIO(a)).convert("L")
    ib = Image.open(io.BytesIO(b)).convert("L")
    if ia.size != ib.size:
        return 1.0
    d = ImageChops.difference(ia, ib)
    hist = d.histogram()
    total = sum(hist)
    changed = sum(hist[8:])  # Toleranz gegen Kompressionsrauschen
    return changed / total if total else 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    ap.add_argument("--only", default="")
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
        browser = None
        for name in pages:
            if browser is None or not browser.is_connected():
                browser = pw.chromium.launch(args=ARGS)
            ctx = None
            row = {"page": name}
            try:
                ctx = browser.new_context(
                    viewport={"width": 1440, "height": 900},
                    reduced_motion="reduce",
                )
                page = ctx.new_page()
                page.goto(f"{args.base}/{name}", wait_until="load", timeout=45000)
                page.wait_for_timeout(900)
                first = shot_bytes(page)
                page.wait_for_timeout(1400)
                second = shot_bytes(page)
                row["motion_px"] = round(diff_ratio(first, second) * 100, 2)
                data = page.evaluate(AUDIT)
                row["running"] = data["running"]
                row["problems"] = len(data["running"])
                row["moves"] = row["motion_px"] > 1.0
            except Exception as exc:
                row["error"] = str(exc)[:120]
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
            rows.append(row)
            print(f"{name}: {row.get('problems', 'ERR')} laufende Animationen, "
                  f"{row.get('motion_px', '–')} % Bildänderung", flush=True)
        try:
            browser.close()
        except Exception:
            pass

    target = outdir / "motion.json"
    rows = merge_rows(target, rows)

    ok = [r for r in rows if "error" not in r]
    summary = {
        "pages": len(rows),
        "errors": len(rows) - len(ok),
        "running_animations": sum(len(r.get("running", [])) for r in ok),
        "pages_still_moving": sum(1 for r in ok if r.get("moves")),
    }
    write_report(target, summary, rows)
    for r in ok:
        if r.get("moves") or r.get("running"):
            print(f"  BEFUND {r['page']}: {r['motion_px']} % Änderung, "
                  f"{len(r['running'])} Animationen")
    print("MOTION", json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
