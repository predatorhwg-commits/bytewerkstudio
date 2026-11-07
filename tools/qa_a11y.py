#!/usr/bin/env python3
"""Barrierefreiheit: automatische Prüfung im Browser.

Geprüft wird, was sich ohne Screenreader zuverlässig messen lässt:
Kontrast von Text (WCAG AA, 4.5:1 bzw. 3:1 für große Schrift), sichtbarer
Fokus, Formularbeschriftungen, zugängliche Namen von Knöpfen und Links,
auflösbare ARIA-Referenzen, Sprungmarke, Sprachauszeichnung und
Landmark-Struktur.

Kein Ersatz für einen Screenreader-Test, aber deckt die Fehler ab, die
sich maschinell sicher feststellen lassen.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_a11y.py --base http://127.0.0.1:8809
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

AUDIT_JS = r"""
() => {
  // Übergänge abschalten, sonst liefert getComputedStyle direkt nach dem
  // Fokus noch den alten Wert und ein vorhandener Fokusring wird übersehen.
  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
  document.head.appendChild(kill);
  const out = {contrast: [], focus: [], labels: [], names: [], aria: [], landmarks: [], skip: null, lang: document.documentElement.lang};

  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number);
    return {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1};
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
      n = n.parentElement;
    }
    return {r: 255, g: 255, b: 255, a: 1};
  };
  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1
  });
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  // 1. Textkontrast
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (text.length < 2) continue;
    const el = node.parentElement;
    if (!el || seen.has(el) || !visible(el)) continue;
    if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|CANVAS)$/.test(el.tagName)) continue;
    // Dekorative Elemente sind vom Kontrast ausgenommen (WCAG 1.4.3).
    if (el.closest('[aria-hidden="true"]')) continue;
    // Text auf einer 3D-Bühne: Hintergrund ist ein Canvas, dessen Farbe
    // sich nicht aus dem DOM lesen lässt. Nicht bewertbar, also überspringen.
    const r0 = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.min(window.innerWidth - 2, Math.max(2, r0.left + Math.min(r0.width / 2, 120))),
      Math.min(window.innerHeight - 2, Math.max(2, r0.top + r0.height / 2))
    );
    if (hit && (hit.tagName === 'CANVAS' || hit.closest('.schm-stage, .bs-stage, .sr-stage, .brf-stage, .atl-stage'))) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    if (s.color === 'rgba(0, 0, 0, 0)') continue;
    const fg = parse(s.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const eff = fg.a < 1 ? blend(fg, bg) : fg;
    const cr = ratio(eff, bg);
    const size = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (cr < need - 0.05) {
      out.contrast.push({
        text: text.slice(0, 60),
        ratio: Math.round(cr * 100) / 100,
        need,
        size: Math.round(size * 10) / 10,
        color: s.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        cls: (el.className || '').toString().slice(0, 50)
      });
    }
  }

  // 2. Sichtbarer Fokus
  const focusables = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), summary')]
    .filter(visible);
  const focusStyle = (el) => {
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow,
            s.borderColor, s.backgroundColor].join('|');
  };
  // Ein Fokusring darf auch am umschließenden Feld hängen (:focus-within).
  const ringOf = (el) => {
    const parts = [];
    let n = el;
    for (let i = 0; i < 4 && n; i++) { parts.push(focusStyle(n)); n = n.parentElement; }
    return parts.join('||');
  };
  for (const el of focusables.slice(0, 40)) {
    const before = ringOf(el);
    el.focus({preventScroll: true});
    const after = ringOf(el);
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    if (!outline && before === after) {
      out.focus.push({tag: el.tagName, cls: (el.className || '').toString().slice(0, 50),
                      text: (el.textContent || '').trim().slice(0, 40), type: el.type || null});
    }
  }
  try { document.activeElement.blur(); } catch (e) {}

  // 3. Formularfelder
  for (const f of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    const id = f.id;
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const wrap = f.closest('label');
    const aria = f.getAttribute('aria-label') || f.getAttribute('aria-labelledby');
    if (!label && !wrap && !aria && !f.placeholder) {
      out.labels.push({name: f.name || f.id || f.type, type: f.type});
    }
  }

  // 4. Zugängliche Namen
  const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') ||
    (el.textContent || '').trim() || (el.querySelector('img')?.alt || '')).trim();
  for (const el of document.querySelectorAll('a[href], button')) {
    if (!visible(el)) continue;
    if (!nameOf(el)) out.names.push({tag: el.tagName, cls: (el.className || '').toString().slice(0, 60),
                                     html: el.outerHTML.slice(0, 100)});
  }

  // 5. ARIA-Referenzen
  for (const el of document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]')) {
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      for (const id of v.split(/\s+/)) {
        if (id && !document.getElementById(id)) {
          out.aria.push({attr, id, tag: el.tagName, cls: (el.className || '').toString().slice(0, 40)});
        }
      }
    }
  }

  // 6. Landmarks und Sprungmarke
  out.landmarks = {
    main: document.querySelectorAll('main').length,
    header: document.querySelectorAll('body > header, header[role=banner]').length,
    nav: document.querySelectorAll('nav').length,
    footer: document.querySelectorAll('body > footer, footer[role=contentinfo]').length,
    h1: document.querySelectorAll('h1').length
  };
  const skip = document.querySelector('a[href^="#"]');
  const first = document.querySelector('.skip, .skip-link, [data-skip]');
  if (first) {
    const target = document.querySelector(first.getAttribute('href'));
    out.skip = {text: first.textContent.trim().slice(0, 40), target: !!target};
  } else if (skip) {
    out.skip = {text: skip.textContent.trim().slice(0, 40), target: !!document.querySelector(skip.getAttribute('href'))};
  }

  // Fokus nach der Prüfung zurück auf den Körper
  try { document.activeElement.blur(); } catch (e) {}
  kill.remove();
  return out;
}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    ap.add_argument("--only", default="", help="Kommagetrennte Seitennamen")
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
                for attempt in (1, 2):
                    try:
                        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
                        page = ctx.new_page()
                        page.goto(f"{args.base}/{name}", wait_until="domcontentloaded", timeout=30000)
                        page.wait_for_timeout(1200)
                        data = page.evaluate(AUDIT_JS)
                        row.pop("error", None)
                        row.update(data)
                        row["problems"] = (len(data["contrast"]) + len(data["focus"]) +
                                           len(data["labels"]) + len(data["names"]) + len(data["aria"]))
                        if attempt == 2:
                            row["retried"] = True
                        break
                    except Exception as exc:
                        # Renderer abgestürzt: neuer Browser, Seite vollständig
                        # neu messen. Ein Abbruch ist kein Messergebnis.
                        try:
                            if ctx:
                                ctx.close()
                        except Exception:
                            pass
                        try:
                            browser.close()
                        except Exception:
                            pass
                        ctx = None
                        if attempt == 2:
                            row["error"] = str(exc)[:150]
                            break
                        browser = pw.chromium.launch(args=ARGS)
            except Exception as exc:
                row["error"] = str(exc)[:150]
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

    # Teil-Läufe dürfen die Sammeldatei nicht auf wenige Seiten kürzen.
    target = outdir / "a11y.json"
    if args.only and target.exists():
        try:
            old = json.loads(target.read_text(encoding="utf-8"))
            measured = {r["page"] for r in rows}
            rows = rows + [r for r in old.get("rows", []) if r.get("page") not in measured]
            rows.sort(key=lambda r: r.get("page", ""))
        except Exception:
            pass

    ok = [r for r in rows if "error" not in r]
    summary = {
        "pages": len(rows),
        "errors": len(rows) - len(ok),
        "contrast_findings": sum(len(r["contrast"]) for r in ok),
        "focus_findings": sum(len(r["focus"]) for r in ok),
        "label_findings": sum(len(r["labels"]) for r in ok),
        "name_findings": sum(len(r["names"]) for r in ok),
        "aria_findings": sum(len(r["aria"]) for r in ok),
        "pages_without_main": sum(1 for r in ok if r["landmarks"]["main"] != 1),
        "pages_without_skip": sum(1 for r in ok if not r.get("skip") or not r["skip"].get("target")),
    }
    target.write_text(
        json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("A11Y", json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
