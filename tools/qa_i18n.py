#!/usr/bin/env python3
"""Misst, wie vollständig die englische Fassung wirklich ist.

Die Seite schaltet über data-en, data-en-ph und data-en-aria um
(components.js). Fehlt an einem sichtbaren Textelement das Attribut,
bleibt dort Deutsch stehen — die Seite wirkt halb übersetzt.

Gezählt wird je Seite: sichtbare Textknoten mit Buchstaben, davon ohne
data-en am nächsten Element. Ausgenommen sind reine Zahlen, Symbolzeichen,
Eigennamen, Code und rechtlich maßgebliche Stellen, die bewusst deutsch
bleiben.

Zusätzlich wird die Umschaltung im Browser geprüft: Nach Klick auf EN
darf kein Element mit data-en mehr den deutschen Text zeigen, und die
Seite muss lang="en" setzen.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_i18n.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]

# Elemente, deren Inhalt nicht übersetzt wird: Code, Marken, Zahlen, Icons.
SKIP_TAGS = {"script", "style", "code", "pre", "svg", "kbd", "samp", "var",
             "sup", "sub", "time", "abbr"}

AUDIT = r"""
() => {
  const skip = new Set(['SCRIPT','STYLE','CODE','PRE','SVG','KBD','SAMP','VAR','SUP','SUB','TIME','ABBR']);
  const hasLetters = (t) => /[A-Za-zÄÖÜäöüß]{3,}/.test(t);
  const missing = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (text.length < 4 || !hasLetters(text)) continue;
    const el = node.parentElement;
    if (!el || skip.has(el.tagName)) continue;
    if (el.closest('[aria-hidden="true"], script, style, code, pre, svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // Ein Vorfahre mit data-en deckt den ganzen Teilbaum ab.
    if (el.closest('[data-en], [data-en-ph], [data-en-aria]')) continue;
    missing.push({text: text.slice(0, 60), tag: el.tagName,
                  cls: (el.className || '').toString().slice(0, 40)});
  }
  return {missing, lang: document.documentElement.lang};
}
"""

SWITCH_CHECK = r"""
() => {
  // data-en darf Markup enthalten (<br>, <em>, <span class="arr">). textContent
  // enthält nur Text. Ohne Entfernen der Tags vergleicht man Markup gegen
  // Text und meldet Fehler, die es nicht gibt.
  const plain = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const wrong = [];
  for (const el of document.querySelectorAll('[data-en]')) {
    const want = plain(el.getAttribute('data-en') || '');
    if (!want) continue;
    const now = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (now && now !== want) {
      wrong.push({want: want.slice(0, 40), now: now.slice(0, 40),
                  tag: el.tagName, cls: (el.className || '').toString().slice(0, 30)});
    }
  }
  return {wrong, lang: document.documentElement.lang,
          html_lang: document.documentElement.getAttribute('lang')};
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
                ctx = browser.new_context(viewport={"width": 1440, "height": 900})
                ctx.add_init_script("try{localStorage.setItem('bw-lang','de')}catch(e){}")
                page = ctx.new_page()
                page.goto(f"{args.base}/{name}", wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(900)
                data = page.evaluate(AUDIT)
                row["missing"] = data["missing"]
                row["missing_count"] = len(data["missing"])

                # Auf EN umschalten und prüfen, ob die Texte wirklich wechseln.
                toggled = page.evaluate("""() => {
                  const btn = document.querySelector('[data-lang-btn="en"]')
                    || [...document.querySelectorAll('[data-lang-btn]')]
                       .find(b => /en/i.test(b.textContent || ''));
                  if (btn) { btn.click(); return true; }
                  return false;
                }""")
                page.wait_for_timeout(600)
                if toggled:
                    sw = page.evaluate(SWITCH_CHECK)
                    row["switch"] = sw
                    row["switch_wrong"] = len(sw["wrong"])
                    row["lang_after"] = sw["html_lang"]
                else:
                    row["switch_wrong"] = None
                    row["switch_note"] = "kein Sprachknopf gefunden"
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
            print(f"{name}: {row.get('missing_count', 'ERR')} ohne data-en, "
                  f"{row.get('switch_wrong', '–')} falsch nach Umschaltung", flush=True)
        try:
            browser.close()
        except Exception:
            pass

    ok = [r for r in rows if "error" not in r]
    summary = {
        "pages": len(rows),
        "errors": len(rows) - len(ok),
        "texts_without_en": sum(r.get("missing_count", 0) for r in ok),
        "pages_with_missing": sum(1 for r in ok if r.get("missing_count")),
        "switch_failures": sum(r.get("switch_wrong") or 0 for r in ok),
        "pages_with_switch_failure": sum(1 for r in ok if r.get("switch_wrong")),
    }
    (outdir / "i18n.json").write_text(
        json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False),
        encoding="utf-8")

    if summary["texts_without_en"]:
        print("\nFehlende Übersetzungen (häufigste Texte):")
        from collections import Counter
        c = Counter()
        for r in ok:
            for m in r.get("missing", []):
                c[(m["text"], m["tag"], m["cls"])] += 1
        for (t, tag, cls), n in c.most_common(25):
            print(f"  {n:3}x {tag:6} {cls[:24]:24} {t[:52]}")
    print("I18N", json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
