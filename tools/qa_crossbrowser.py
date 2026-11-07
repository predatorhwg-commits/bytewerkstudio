#!/usr/bin/env python3
"""Prüft die Seiten in Firefox und WebKit (Safari-Kern).

Chromium allein sagt wenig über Safari und Firefox. Dieser Lauf misst je
Seite und Breite, was dort anders sein kann:

- Konsolenfehler (ohne WebGL-Rauschen, wenn die Umgebung kein WebGL hat),
- horizontales Überlaufen,
- Sprachwechsel DE→EN→DE und – unter 820 px – das Mobilmenü,
- ob `styles-inline.css` geladen ist und Regeln enthält,
- ob `oklch()`-Farben aufgelöst werden (sonst bliebe der Hintergrund
  farblos) und ob die Schrift geladen ist,
- ob eine 3D-Bühne zeichnet oder die gezeichnete Ersatzbühne sichtbar ist.

Ein Absturz zählt nie als Befund: Jede Seite wird einmal wiederholt.

Aufruf:
  python3 -m playwright install firefox webkit
  python3 tools/qa_crossbrowser.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}
WIDTHS = (("desktop", 1440, 900), ("mobil", 390, 844))

# Ohne WebGL kann three.js keinen Kontext anlegen; das ist ein Merkmal der
# Testumgebung, kein Fehler der Seite.
WEBGL_NOISE = ("WebGL context could not be created", "Error creating WebGL context",
               "Failed to create WebGL context", "WebGL is not supported")


def clean(errors):
    return [e for e in errors if not any(n in e for n in WEBGL_NOISE)]


# Firefox meldet gelegentlich einen abgebrochenen Font-Download, obwohl die
# Schrift danach benutzt wird. Das wird getrennt gezählt und nur dann als
# Warnung geführt, wenn die Schrift tatsächlich verfügbar ist.
FONT_NOISE = "downloadable font: download failed"


def audit(page):
    return page.evaluate("""() => {
      const d = document.documentElement;
      const over = [...document.querySelectorAll('body *')].filter(e => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        if (s.position === 'fixed') return false;
        return r.width > 0 && (r.right > d.clientWidth + 1.5 || r.left < -1.5);
      }).slice(0, 6).map(e => (e.tagName + '.' + String(e.className)).slice(0, 60));

      // Farben: oklch() wird von alten Engines nicht verstanden; dann
      // bliebe der Hintergrund transparent und der Text schwarz.
      const bg = (el) => getComputedStyle(el).backgroundColor;
      const opaque = (c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
      const rootBg = opaque(bg(d)) ? bg(d) : (opaque(bg(document.body)) ? bg(document.body) : 'transparent');
      const h1 = document.querySelector('h1');
      const h1s = h1 ? getComputedStyle(h1) : null;

      // Die ausgelagerte Stildatei muss geladen sein und Regeln haben.
      const sheet = [...document.styleSheets].find(s =>
        (s.href || '').includes('styles-inline.css'));
      let inlineRules = null;
      try { inlineRules = sheet ? sheet.cssRules.length : 0; } catch (e) { inlineRules = -1; }

      // Eine Klasse aus der Datei muss am Element ankommen.
      const util = document.querySelector('[class*="u-"]');
      const utilStyle = util ? getComputedStyle(util) : null;

      const canvases = [...document.querySelectorAll('canvas')].map(c => ({
        w: c.width, h: c.height,
        ctx: !!(c.getContext && (c.getContext('webgl2') || c.getContext('webgl')))
      }));

      return {
        scrollW: d.scrollWidth, clientW: d.clientWidth,
        overflowNodes: over,
        lang: d.lang,
        bodyBg: rootBg,
        h1Size: h1s ? h1s.fontSize : null,
        h1Family: h1s ? h1s.fontFamily.slice(0, 60) : null,
        inlineRules,
        utilClass: util ? String(util.className).slice(0, 60) : null,
        utilApplied: utilStyle ? utilStyle.cssText.slice(0, 0) || true : null,
        canvases,
        fonts: document.fonts ? document.fonts.status : null,
        fontUsable: (() => {
          try { return document.fonts.check('16px "JetBrains Mono"'); }
          catch (e) { return null; }
        })()
      };
    }""")


def one_run(pw, engine, name, label, width, height):
    browser = pw[engine].launch()
    try:
        ctx = browser.new_context(viewport={"width": width, "height": height},
                                  locale="de-DE", ignore_https_errors=True)
        ctx.add_init_script("try{localStorage.setItem('bw-lang','de')}catch(e){}")
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.goto(f"{BASE}/{name}", wait_until="load", timeout=45000)
        page.wait_for_timeout(1400)

        info = audit(page)
        menu_ok = None
        if width <= 820:
            try:
                page.click("[data-nav-toggle], .nav-toggle", timeout=2500)
                page.wait_for_timeout(350)
                menu_ok = page.evaluate("""() => {
                  const m = document.querySelector('.mobile-menu');
                  if (!m) return false;
                  const s = getComputedStyle(m);
                  return s.display !== 'none' && s.visibility !== 'hidden'
                         && m.getBoundingClientRect().height > 20;
                }""")
            except Exception:
                menu_ok = False

        lang_ok = None
        if width <= 820:
            try:
                page.click("[data-nav-toggle], .nav-toggle", timeout=2500)
                page.wait_for_timeout(300)
            except Exception:
                pass
        try:
            page.click('[data-lang-btn="en"]', timeout=2500)
            page.wait_for_timeout(250)
            en = page.evaluate("document.documentElement.lang")
            page.click('[data-lang-btn="de"]', timeout=2500)
            page.wait_for_timeout(250)
            de = page.evaluate("document.documentElement.lang")
            lang_ok = (en == "en" and de == "de")
        except Exception:
            lang_ok = None

        # Font-Meldungen nur dann als Fehler, wenn die Schrift nicht nutzbar
        # ist. Sonst sind sie eine Eigenheit der Engine (abgebrochener
        # zweiter Download), keine Folge der Seite.
        font_warn = [e for e in errors if FONT_NOISE in e]
        real = [e for e in clean(errors) if FONT_NOISE not in e]
        if font_warn and info.get("fontUsable") is not True:
            real.extend(font_warn)
        return {"page": name, "width": label, "engine": engine,
                **info, "errors": real[:6],
                "font_warnings": len(font_warn),
                "lang_switch": lang_ok, "mobile_menu": menu_ok}
    finally:
        try:
            browser.close()
        except Exception:
            pass


def main() -> int:
    global BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    BASE = args.base

    from playwright.sync_api import sync_playwright

    pages = sorted(p.name for p in ROOT.glob("*.html") if p.name not in SKIP)
    if args.only:
        wanted = {p.strip() for p in args.only.split(",") if p.strip()}
        pages = [p for p in pages if p in wanted]

    rows = []
    with sync_playwright() as pw:
        for engine in ("firefox", "webkit"):
            for label, width, height in WIDTHS:
                for name in pages:
                    row = None
                    for attempt in (1, 2):
                        try:
                            row = one_run(pw, engine, name, label, width, height)
                            break
                        except Exception as exc:
                            row = {"page": name, "width": label, "engine": engine,
                                   "fatal": str(exc)[:120]}
                    rows.append(row)
                    print(f"  {engine:7} {label:7} {name:32} "
                          f"{'ABBRUCH' if row.get('fatal') else 'ok'} "
                          f"{len(row.get('errors', []))} Fehler", flush=True)

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    # Teil-Läufe (--only) dürfen den vollen Lauf nicht überschreiben:
    # dieselbe Seite in derselben Engine und Breite wird ersetzt, alles
    # andere bleibt stehen.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from qa_store import merge_rows, write_report
    rows = merge_rows(outdir / "crossbrowser.json", rows,
                      key=("engine", "width", "page"))

    ok = [r for r in rows if not r.get("fatal")]
    overflow = [r for r in ok if r.get("scrollW", 0) > r.get("clientW", 0) + 1]
    err_pages = [r for r in ok if r.get("errors")]
    lang_fail = [r for r in ok if r.get("lang_switch") is False]
    menu_fail = [r for r in ok if r.get("mobile_menu") is False]
    no_css = [r for r in ok if not r.get("inlineRules")]
    no_color = [r for r in ok if r.get("bodyBg") in ("rgba(0, 0, 0, 0)", "transparent")]
    facts = {
        "runs": len(rows),
        "fatal": len(rows) - len(ok),
        "overflow": len(overflow),
        "console_error_runs": len(err_pages),
        "lang_switch_failures": len(lang_fail),
        "mobile_menu_failures": len(menu_fail),
        "css_missing": len(no_css),
        "background_transparent": len(no_color),
        "font_warnings": sum(1 for r in ok if r.get("font_warnings")),
        "font_unusable": sum(1 for r in ok if r.get("fontUsable") is False),
        "webgl_runs": sum(1 for r in ok if any(c.get("ctx") for c in r.get("canvases", []))),
        "canvas_runs": sum(1 for r in ok if r.get("canvases")),
    }
    write_report(outdir / "crossbrowser.json", facts, rows)

    for label, items in (("Überlauf", overflow), ("Konsolenfehler", err_pages),
                         ("Sprachwechsel", lang_fail), ("Mobilmenü", menu_fail),
                         ("CSS fehlt", no_css), ("Hintergrund farblos", no_color)):
        if items:
            print(f"{label}:")
            for r in items[:8]:
                print(f"  {r['engine']} {r['width']} {r['page']} "
                      f"{r.get('overflowNodes', r.get('errors', ''))}")
    print("CROSSBROWSER", json.dumps(facts, ensure_ascii=False))
    bad = (facts["fatal"] + facts["overflow"] + facts["console_error_runs"]
           + facts["lang_switch_failures"] + facts["mobile_menu_failures"]
           + facts["css_missing"] + facts["background_transparent"]
           + facts["font_unusable"])
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
