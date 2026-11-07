#!/usr/bin/env python3
"""Prüft die three.js-Bühnen im Browser.

Für jede Seite mit 3D-Szene: Canvas in den Blick scrollen, warten bis die
Szene initialisiert ist, WebGL-Kontext und Bildinhalt prüfen. Ein Canvas,
das nur einfarbig ist, gilt als nicht gerendert — dann steht die Bühne
still oder das Modul wurde nicht geladen.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_three.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
QA = ROOT / "docs" / "qa"

# Seiten mit three.js-Szene und der Selektor, hinter dem die Bühne liegt.
SCENES = {
    "index.html": "#schichtmodell",
    "404.html": "canvas",
    "arbeiten.html": "canvas",
    "entwickler.html": "canvas",
    "forum.html": "canvas",
    "probierstand.html": "canvas",
    "shop.html": "canvas",
    "showroom.html": "canvas",
    "sicherheit.html": "canvas",
}

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
    rows = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=ARGS)
        for page_name, anchor in SCENES.items():
            errs = []
            row = {"page": page_name, "anchor": anchor}
            ctx = None
            try:
                ctx = browser.new_context(viewport={"width": 1440, "height": 900})
                page = ctx.new_page()
                page.on("pageerror", lambda e: errs.append(str(e)[:120]))
                page.goto(f"{args.base}/{page_name}", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(600)
                page.evaluate(
                    "(sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({block:'center'}); }",
                    anchor,
                )
                page.wait_for_timeout(3500)
                info = page.evaluate("""() => {
                  const canvases = [...document.querySelectorAll('canvas')]
                    .filter(c => c.width > 120 && c.height > 90);
                  return canvases.map(c => {
                    let gl = null;
                    try { gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (e) {}
                    return {w: c.width, h: c.height, webgl: gl ? gl.getParameter(gl.VERSION) : null};
                  });
                }""")
                # readPixels liefert nach dem Frame 0 (Drawing-Buffer wird
                # geleert). Deshalb das gerenderte Bild aufnehmen und die
                # Helligkeitsstreuung messen: einfarbig = nichts gerendert.
                from PIL import Image
                import io
                shots = []
                handles = page.query_selector_all("canvas")
                for idx, handle in enumerate(handles):
                    box = handle.bounding_box()
                    if not box or box["width"] < 120 or box["height"] < 90:
                        continue
                    try:
                        raw = handle.screenshot(timeout=8000)
                        img = Image.open(io.BytesIO(raw)).convert("L")
                        hist = img.histogram()
                        total = sum(hist) or 1
                        mean = sum(i * n for i, n in enumerate(hist)) / total
                        var = sum((i - mean) ** 2 * n for i, n in enumerate(hist)) / total
                        shots.append({"index": idx, "std": round(var ** 0.5, 1)})
                    except Exception:
                        shots.append({"index": idx, "std": None})
                row["canvases"] = info
                row["pixel_std"] = shots
                row["rendered"] = any((s.get("std") or 0) > 4 for s in shots)
            except Exception as exc:
                row["error"] = str(exc)[:160]
            finally:
                if ctx:
                    try:
                        ctx.close()
                    except Exception:
                        pass
            row["page_errors"] = errs[:4]
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
        try:
            browser.close()
        except Exception:
            pass

    (outdir / "three.json").write_text(json.dumps({"rows": rows}, indent=2, ensure_ascii=False), encoding="utf-8")
    ok = sum(1 for r in rows if r.get("rendered"))
    print(f"THREE {ok}/{len(rows)} Szenen gerendert")
    return 0 if ok == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
