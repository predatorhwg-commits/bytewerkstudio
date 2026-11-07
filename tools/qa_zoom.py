#!/usr/bin/env python3
"""Prüft Anforderungen, die im normalen Browserlauf unsichtbar bleiben.

Drei Pflichtpunkte aus WCAG 2.2, die man nicht am Quelltext sieht, sondern
nur im umgebauten Browser:

- 1.4.4 Größenanpassung: Bei 200 % Zoom (1280 px Breite entspricht dann
  640 CSS-Pixel) darf nichts überlaufen und kein Text abgeschnitten werden.
- 1.4.12 Textabstände: Wird der Zeilenabstand auf 1,5, der Absatzabstand
  auf 2 em, die Buchstabenbreite auf 0,12 em und der Wortabstand auf
  0,16 em gesetzt, darf kein Inhalt verloren gehen.
- 1.4.3 / Systemfarben: Im erzwungenen Kontrastmodus (Windows Hoher
  Kontrast) müssen Bedienelemente sichtbar bleiben, nicht verschwinden.

Geprüft wird je Seite: horizontales Überlaufen, abgeschnittener Text
(Element mit overflow hidden, dessen Inhalt größer ist als die Box) und
unsichtbare Bedienelemente.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_zoom.py --base http://127.0.0.1:8809
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

# Elemente, bei denen ein overflow:hidden gewollt ist (dekorativ, gekürzt).
CLIP_OK = {"sr-only", "visually-hidden", "v5-tag", "wc-cat", "fm-access-name",
           "pd-sku", "shw-name", "mk-eyebrow"}

AUDIT = r"""
() => {
  const out = {overflow: [], clipped: [], hidden: [], tiny: []};
  const vw = document.documentElement.clientWidth;
  const docScroll = document.documentElement.scrollWidth;
  if (docScroll > vw + 2) {
    out.overflow.push({what: 'dokument', scrollWidth: docScroll, vw});
  }

  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };

  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || el.closest('[aria-hidden="true"]')) continue;
    const s = getComputedStyle(el);

    // Text, der in einer zu kleinen Box abgeschnitten wird.
    // Nur echter Textverlust zählt. Nicht gemeint sind:
    // - scrollbare Leisten (overflow-x: auto/scroll) — Scrollen ist gewollt,
    // - Abschnitte mit dekorativem Überstand (Glow, große Zahlen),
    // - Code und Tabellen, die absichtlich horizontal scrollen.
    const scrollable = s.overflowX === 'auto' || s.overflowX === 'scroll';
    const decorative = el.matches('section, header, footer, canvas, svg, pre, code, table, .cta-band');
    if (!scrollable && !decorative && s.overflow !== 'visible' &&
        el.scrollWidth > el.clientWidth + 2 &&
        el.clientWidth > 40 && (el.textContent || '').trim().length > 12) {
      const cls = (el.className || '').toString();
      if (!/\b(sr-only|visually-hidden)\b/.test(cls)) {
        out.clipped.push({tag: el.tagName, cls: cls.slice(0, 40),
                          text: (el.textContent || '').trim().slice(0, 40),
                          scroll: el.scrollWidth, client: el.clientWidth});
      }
    }

    // Bedienelement, das im Kontrastmodus verschwindet. Kästchen und Radios
    // sind absichtlich 1 px groß: die Trefferfläche ist das umschließende
    // Label, und das bleibt sichtbar.
    if (el.matches('button, a[href], input, select, textarea, [role=button]')) {
      const r = el.getBoundingClientRect();
      const wrapped = el.closest('label');
      const checkboxish = el.matches('input[type=checkbox], input[type=radio]');
      if (r.width < 4 || r.height < 4) {
        if (wrapped && checkboxish && wrapped.getBoundingClientRect().height >= 16) continue;
        out.hidden.push({tag: el.tagName, cls: (el.className || '').toString().slice(0, 40),
                         text: (el.textContent || '').trim().slice(0, 30)});
      }
    }
  }
  return out;
}
"""

TEXT_SPACING = """
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
"""


def run(pw, name, base, mode):
    """Eine Seite in einem Modus messen."""
    browser = pw.chromium.launch(args=ARGS)
    ctx = None
    try:
        if mode == "zoom":
            # 200 % Zoom heißt: halb so viele CSS-Pixel in derselben
            # Fensterbreite. Ein style.zoom im Dokument bildet das NICHT ab,
            # weil Media-Queries davon unberührt bleiben — die Desktop-
            # Navigation bliebe sichtbar und der Test meldete Fehler, die
            # es bei echtem Zoom nicht gibt. Also echter schmaler Viewport.
            ctx = browser.new_context(viewport={"width": 640, "height": 480},
                                      device_scale_factor=1)
            ctx.set_default_timeout(45000)
        elif mode == "spacing":
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        else:
            ctx = browser.new_context(viewport={"width": 1280, "height": 900},
                                      color_scheme="dark")
            ctx.add_init_script(
                "document.addEventListener('DOMContentLoaded',()=>{"
                "document.documentElement.style.forcedColorAdjust='auto'});")

        page = ctx.new_page()
        page.goto(f"{base}/{name}", wait_until="domcontentloaded", timeout=45000)
        if mode == "spacing":
            page.add_style_tag(content=TEXT_SPACING)
        if mode == "contrast":
            page.emulate_media(forced_colors="active")
        page.wait_for_timeout(600)
        data = page.evaluate(AUDIT)
        return data
    finally:
        try:
            if ctx:
                ctx.close()
        finally:
            browser.close()


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
        for name in pages:
            row = {"page": name}
            for mode in ("zoom", "spacing", "contrast"):
                for attempt in (1, 2):
                    try:
                        data = run(pw, name, args.base, mode)
                        row[mode] = data
                        row[f"{mode}_problems"] = sum(len(v) for v in data.values())
                        break
                    except Exception as exc:
                        if attempt == 2:
                            row[f"{mode}_error"] = str(exc)[:120]
            rows.append(row)
            print(f"{name}: zoom {row.get('zoom_problems', 'ERR')}, "
                  f"abstand {row.get('spacing_problems', 'ERR')}, "
                  f"kontrast {row.get('contrast_problems', 'ERR')}", flush=True)

    ok = [r for r in rows if not any(k.endswith("_error") for k in r)]
    summary = {
        "pages": len(rows),
        "errors": len(rows) - len(ok),
        "zoom_overflow": sum(1 for r in ok if r.get("zoom", {}).get("overflow")),
        "zoom_clipped": sum(len(r.get("zoom", {}).get("clipped", [])) for r in ok),
        "spacing_clipped": sum(len(r.get("spacing", {}).get("clipped", [])) for r in ok),
        "spacing_overflow": sum(1 for r in ok if r.get("spacing", {}).get("overflow")),
        "contrast_hidden": sum(len(r.get("contrast", {}).get("hidden", [])) for r in ok),
    }
    (outdir / "zoom.json").write_text(
        json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False),
        encoding="utf-8")
    print("ZOOM", json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
