#!/usr/bin/env python3
"""Grafische Prüfung: messbare Gestaltungsfehler statt Geschmacksurteile.

Geprüft wird, was sich im Browser messen lässt und fast immer ein Fehler ist:

- Tap-Ziele unter 24 × 24 px (WCAG 2.2, 2.5.8) bei 390 px
- Fließtext-Zeilen über 90 Zeichen (unlesbar lange Zeilen)
- Schriftgrößen unter 12 px bei Fließtext
- fehlende Zeilenhöhe bei mehrzeiligem Text
- Bilder, die ihr Seitenverhältnis verzerren (object-fit fehlt)
- horizontale Überläufe einzelner Elemente
- Abschnitte ohne jeden Innenabstand (Text klebt am Rand)

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_design.py --base http://127.0.0.1:8809
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

AUDIT = r"""
() => {
  const out = {tap: [], chars: [], small: [], leading: [], images: [], overflow: [], edges: []};
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };

  // 1. Tap-Ziele (WCAG 2.2, 2.5.8: mindestens 24 × 24 px)
  for (const el of document.querySelectorAll('a[href], button, [role=button], input[type=checkbox], input[type=radio], select')) {
    if (!vis(el)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;

    // Ausnahme 1: Links mitten im Satz (2.5.8 „inline“). Ein Link in einem
    // Absatz, einer Liste, einem Label oder einer Überschrift ist Satzfluss.
    const inText = el.closest('p, li, label, span, h1, h2, h3, h4, small, .lead, .small, .auth-switch');
    if (inText && getComputedStyle(el).display === 'inline') continue;
    // Dasselbe Muster in einem Container, der keinen Absatz ist: Steht neben
    // dem Link noch Text, ist er Teil eines Satzes (2.5.8 „inline“).
    const parent = el.parentElement;
    if (getComputedStyle(el).display === 'inline' && parent) {
      const own = parent.textContent.replace(el.textContent, '').trim();
      if (own.length > 3) continue;
    }

    // Ausnahme 2: Ein Kästchen oder Radio in einem Label — das Label ist die
    // Trefferfläche. Nur wenn das Label selbst zu klein ist, zählt es.
    const lab = el.closest('label');
    if (lab && (el.type === 'checkbox' || el.type === 'radio')) {
      const lr = lab.getBoundingClientRect();
      if (lr.width >= 24 && lr.height >= 24) continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;   // visuell versteckt
    if (r.width < 24 || r.height < 24) {
      out.tap.push({tag: el.tagName, cls: (el.className || '').toString().slice(0, 40),
                    w: Math.round(r.width), h: Math.round(r.height),
                    text: (el.textContent || '').trim().slice(0, 30)});
    }
  }

  // 2. Zeilenlänge und Schriftgröße im Fließtext
  for (const el of document.querySelectorAll('p, li, .lead, blockquote, dd, td')) {
    if (!vis(el) || el.closest('[aria-hidden="true"]')) continue;
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    const text = (el.textContent || '').trim();
    if (text.length < 40) continue;
    const chars = Math.round(el.clientWidth / (size * 0.5));
    if (chars > 90) out.chars.push({cls: (el.className || '').toString().slice(0, 40),
                                    chars, width: el.clientWidth, size});
    if (size < 12) out.small.push({cls: (el.className || '').toString().slice(0, 40), size,
                                   text: text.slice(0, 40)});
    const lh = parseFloat(s.lineHeight);
    if (isFinite(lh) && el.scrollHeight > size * 3 && lh < size * 1.25) {
      out.leading.push({cls: (el.className || '').toString().slice(0, 40), size, lineHeight: lh});
    }
  }

  // 3. Verzerrte Bilder
  for (const img of document.images) {
    if (!img.naturalWidth || !vis(img)) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const shown = r.width / r.height;
    const real = img.naturalWidth / img.naturalHeight;
    const fit = getComputedStyle(img).objectFit;
    if (fit === 'contain' || fit === 'cover') continue;
    if (Math.abs(shown - real) / real > 0.04) {
      out.images.push({src: (img.currentSrc || img.src).split('/').pop(),
                       shown: Math.round(shown * 100) / 100, real: Math.round(real * 100) / 100,
                       objectFit: fit});
    }
  }

  // 4. Überlaufende Elemente
  const vw = document.documentElement.clientWidth;
  for (const el of document.querySelectorAll('section, div, table, pre, ul')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 && el.scrollWidth > el.clientWidth + 2) {
      const s = getComputedStyle(el);
      if (s.overflowX === 'auto' || s.overflowX === 'scroll') continue;
      out.overflow.push({tag: el.tagName, cls: (el.className || '').toString().slice(0, 40),
                         right: Math.round(r.right), vw});
    }
  }

  // 5. Text am Viewport-Rand
  for (const el of document.querySelectorAll('p, h1, h2, h3, .lead')) {
    if (!vis(el)) continue;
    const rs = getComputedStyle(el);
    if (rs.clip !== 'auto' || rs.position === 'absolute' && el.clientWidth <= 1) continue;
    const r = el.getBoundingClientRect();
    if (r.left < 8 && (el.textContent || '').trim().length > 20) {
      out.edges.push({tag: el.tagName, cls: (el.className || '').toString().slice(0, 40),
                      left: Math.round(r.left)});
    }
  }
  return out;
}
"""


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
                ctx = browser.new_context(viewport={"width": 390, "height": 844})
                ctx.add_init_script("try{localStorage.setItem('bw-lang','de')}catch(e){}")
                page = ctx.new_page()
                page.goto(f"{args.base}/{name}", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(900)
                data = page.evaluate(AUDIT)
                row.update(data)
                row["problems"] = sum(len(v) for v in data.values())
            except Exception as exc:
                row["error"] = str(exc)[:140]
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
            print(f"{name}: {row.get('problems', 'ERR')} Befunde", flush=True)
        try:
            browser.close()
        except Exception:
            pass

    ok = [r for r in rows if "error" not in r]
    summary = {
        "pages": len(rows),
        "errors": len(rows) - len(ok),
        "tap_too_small": sum(len(r["tap"]) for r in ok),
        "long_lines": sum(len(r["chars"]) for r in ok),
        "font_below_12": sum(len(r["small"]) for r in ok),
        "tight_leading": sum(len(r["leading"]) for r in ok),
        "distorted_images": sum(len(r["images"]) for r in ok),
        "overflowing": sum(len(r["overflow"]) for r in ok),
        "text_at_edge": sum(len(r["edges"]) for r in ok),
    }
    (outdir / "design.json").write_text(
        json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False), encoding="utf-8")
    print("DESIGN", json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
