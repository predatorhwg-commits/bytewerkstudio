#!/usr/bin/env python3
"""Vergleicht Seiten vor und nach einer Änderung Pixel für Pixel.

Gedacht für Umbauten, die das Aussehen nicht verändern dürfen — etwa
Inline-Stile in CSS-Klassen zu überführen. Zwei Aufnahmen derselben Seite
werden verglichen; Bewegung und Zufall werden vorher abgeschaltet:

- Animationen und Übergänge pausiert,
- Canvas versteckt (WebGL zeichnet bei jedem Lauf anders),
- Zufallstexte (Passwortgenerator) verdeckt,
- vorher einmal durchgescrollt, damit Einblendungen entschieden sind.

Das geschieht ohne eingeschobenes Stylesheet: Die Seiten erlauben mit
style-src 'self' keins, und das Werkzeug soll die Policy nicht umgehen.

Aufruf:
  python3 tools/qa_pixdiff.py --base http://127.0.0.1:8809 --save /tmp/before
  ... Änderung ...
  python3 tools/qa_pixdiff.py --base http://127.0.0.1:8809 --compare /tmp/before

Oder zwei Server live vergleichen (alter Stand auf Port 8811):
  python3 tools/qa_pixdiff.py --base http://127.0.0.1:8809 --before-base http://127.0.0.1:8811
"""
from __future__ import annotations

import argparse
import io
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]

# Einfrieren ohne <style>-Knoten: Die Seiten erlauben mit
# style-src 'self' kein eingeschobenes Stylesheet, und ein Messwerkzeug
# soll die Policy nicht umgehen müssen. Die Web-Animations-Schnittstelle
# pausiert CSS-Animationen und Übergänge; Canvas und Zufallstexte werden
# über die style-Eigenschaft versteckt (CSSOM, von der CSP nicht betroffen).
SETTLE = """
() => {
  document.getAnimations().forEach(a => { try { a.pause(); } catch (e) {} });
  document.querySelectorAll('canvas').forEach(c => { c.style.visibility = 'hidden'; });
  document.querySelectorAll('[data-pw-out], .pb-pw-field, .pb-pw-out')
    .forEach(el => { el.style.visibility = 'hidden'; });
}
"""

WIDTHS = (("desktop", 1440, 900), ("mobil", 390, 844))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--save", default="")
    ap.add_argument("--compare", default="")
    ap.add_argument("--before-base", default="",
                    help="zweiter Server mit dem alten Stand; wird live verglichen")
    ap.add_argument("--only", default="")
    ap.add_argument("--threshold", type=float, default=0.02,
                    help="erlaubter Anteil abweichender Pixel in Prozent")
    ap.add_argument("--expect", default="",
                    help="Seiten, deren Änderung beabsichtigt ist (durch Komma getrennt)")
    ap.add_argument("--reason", default="",
                    help="Begründung für --expect, erscheint im Ergebnis")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright
    from PIL import Image, ImageChops

    pages = sorted(p.name for p in ROOT.glob("*.html") if p.name not in SKIP)
    if args.only:
        wanted = {p.strip() for p in args.only.split(",") if p.strip()}
        pages = [p for p in pages if p in wanted]

    def shot(page, url):
        page.goto(url, wait_until="load", timeout=45000)
        # Einmal durchscrollen: Inhalte, die per IntersectionObserver
        # eingeblendet werden, sind sonst je nach Zeitpunkt sichtbar oder
        # nicht — und der Vergleich zeigt Unterschiede, die keine sind.
        page.evaluate("""() => new Promise(done => {
          let y = 0;
          const step = () => {
            y += window.innerHeight;
            window.scrollTo(0, y);
            if (y < document.body.scrollHeight) setTimeout(step, 90);
            else { window.scrollTo(0, 0); setTimeout(done, 300); }
          };
          step();
        })""")
        page.evaluate(SETTLE)
        page.wait_for_timeout(500)
        page.evaluate(SETTLE)
        # Chrome kann keine Aufnahme über rund 16 000 px Höhe erzeugen.
        # Sehr lange Seiten werden deshalb in Abschnitte geteilt; das
        # Ergebnis ist dasselbe, nur ohne Grenze.
        width = page.viewport_size["width"]
        height = page.evaluate("() => document.documentElement.scrollHeight")
        step = 4000
        if height <= 12000:
            return [page.screenshot(full_page=True)]
        parts = []
        y = 0
        while y < height:
            h = min(step, height - y)
            parts.append(page.screenshot(
                clip={"x": 0, "y": y, "width": width, "height": h},
                full_page=True))
            y += h
        return parts

    def changed_ratio(a: list, b: list) -> float:
        if len(a) != len(b):
            return 100.0
        # Flächengewichteter Mittelwert über alle Abschnitte.
        areas, sums = 0, 0.0
        for part_a, part_b in zip(a, b):
            ia = Image.open(io.BytesIO(part_a)).convert("L")
            ib = Image.open(io.BytesIO(part_b)).convert("L")
            if ia.size != ib.size:
                return 100.0
            hist = ImageChops.difference(ia, ib).histogram()
            total = sum(hist) or 1
            areas += total
            sums += sum(hist[12:])
        return (sums / areas * 100) if areas else 0.0

    rows = []
    with sync_playwright() as pw:
        browser = None
        for label, width, height in WIDTHS:
            for name in pages:
                if browser is None or not browser.is_connected():
                    browser = pw.chromium.launch(args=ARGS)
                ctx = None
                try:
                    ctx = browser.new_context(
                        viewport={"width": width, "height": height},
                        locale="de-DE", reduced_motion="reduce")
                    ctx.add_init_script(
                        "try{localStorage.setItem('bw-lang','de')}catch(e){}")
                    page = ctx.new_page()
                    page.set_default_timeout(30000)
                    data = shot(page, f"{args.base}/{name}")
                    if args.before_base:
                        old_page = ctx.new_page()
                        old = shot(old_page, f"{args.before_base}/{name}")
                        rows.append({"page": name, "width": label,
                                     "diff": round(changed_ratio(old, data), 3)})
                        continue
                    target = Path(args.save or args.compare) / f"{label}-{name}.png"
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if args.save:
                        target.write_bytes(data)
                        rows.append({"page": name, "width": label, "saved": True})
                    else:
                        old = target.read_bytes() if target.exists() else b""
                        if not old:
                            rows.append({"page": name, "width": label,
                                         "error": "keine Voraufnahme"})
                        else:
                            rows.append({"page": name, "width": label,
                                         "diff": round(changed_ratio(old, data), 3)})
                except Exception as exc:
                    rows.append({"page": name, "width": label,
                                 "error": str(exc)[:80]})
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

    if args.save:
        print(f"PIXDIFF {len(rows)} Aufnahmen gespeichert in {args.save}")
        return 0

    expected = {p.strip() for p in args.expect.split(",") if p.strip()}
    for r in rows:
        if r.get("page") in expected and r.get("diff", 0) > args.threshold:
            r["expected"] = args.reason or "beabsichtigte Änderung"
    bad = [r for r in rows if (r.get("diff", 0) > args.threshold or r.get("error"))
           and "expected" not in r]
    out = ROOT / "docs/qa/pixdiff.json"
    out.write_text(json.dumps({"summary": {
        "shots": len(rows), "differing": len(bad),
        "expected": sum(1 for r in rows if "expected" in r),
        "reason": args.reason,
        "threshold_pct": args.threshold}, "rows": rows},
        indent=2, ensure_ascii=False), encoding="utf-8")
    for r in rows:
        mark = "ok  " if r in [x for x in rows if x not in bad] else "ABW "
        print(f"  {mark} {r['width']:8} {r['page']:30} "
              f"{r.get('diff', r.get('error'))}")
    print("PIXDIFF", json.dumps({"shots": len(rows), "differing": len(bad),
                                 "threshold_pct": args.threshold}))
    return 0 if not bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
