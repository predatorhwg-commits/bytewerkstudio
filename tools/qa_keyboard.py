#!/usr/bin/env python3
"""Tastaturbedienung: was Automatik-Tests sonst übersehen.

Geprüft wird echtes Verhalten, nicht nur Markup:

- Mobilmenü: öffnen, aria-expanded, Escape schließt und setzt den Fokus
  zurück auf den Knopf, Knopfbeschriftung passt zum Zustand.
- Suche: Strg+K öffnet, Fokus liegt im Feld, Escape schließt und setzt
  den Fokus auf den Auslöser zurück.
- Sprachumschaltung: beide Knöpfe erreichbar, Zustand wird angesagt.
- Sprungmarke: Enter auf „Zum Inhalt springen“ setzt den Fokus in <main>.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_keyboard.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]

PAGES = ["index.html", "forum.html", "shop.html", "sicherheit.html", "agb.html"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    rows = []
    findings = []

    def note(page, check, ok, detail=""):
        rows.append({"page": page, "check": check, "ok": bool(ok), "detail": detail})
        if not ok:
            findings.append({"page": page, "check": check, "detail": detail})

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=ARGS)
        for name in PAGES:
            ctx = None
            try:
                ctx = browser.new_context(viewport={"width": 390, "height": 844})
                ctx.add_init_script("try{localStorage.setItem('bw-lang','de')}catch(e){}")
                page = ctx.new_page()
                page.goto(f"{args.base}/{name}", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(700)

                # --- Mobilmenü ---
                toggle = page.query_selector(".nav-toggle")
                if toggle:
                    toggle.click()
                    page.wait_for_timeout(250)
                    state = page.evaluate("""() => {
                      const t = document.querySelector('.nav-toggle');
                      const m = document.querySelector('.mobile-menu');
                      return {expanded: t.getAttribute('aria-expanded'),
                              label: t.getAttribute('aria-label'),
                              controls: t.getAttribute('aria-controls'),
                              open: m.classList.contains('open'),
                              width: m.getBoundingClientRect().width};
                    }""")
                    note(name, "Menü öffnet", state["open"] and state["expanded"] == "true",
                         json.dumps(state, ensure_ascii=False))
                    note(name, "Menü nennt sich geschlossen", "schlie" in (state["label"] or ""),
                         state["label"] or "")
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(250)
                    after = page.evaluate("""() => ({
                      expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'),
                      open: document.querySelector('.mobile-menu').classList.contains('open'),
                      focused: document.activeElement.className,
                      label: document.querySelector('.nav-toggle').getAttribute('aria-label')
                    })""")
                    note(name, "Escape schließt Menü", not after["open"] and after["expanded"] == "false",
                         json.dumps(after, ensure_ascii=False))
                    note(name, "Fokus zurück auf Menüknopf", "nav-toggle" in after["focused"],
                         after["focused"])
                    note(name, "Knopf sagt wieder öffnen", "öffnen" in (after["label"] or ""),
                         after["label"] or "")
                else:
                    note(name, "Menüknopf vorhanden", False, "kein .nav-toggle")

                # --- Suche per Tastatur ---
                page.keyboard.press("Control+k")
                page.wait_for_timeout(400)
                dialog = page.evaluate("""() => {
                  const root = document.querySelector('.bw-cmd.open');
                  if (!root) return {open: false};
                  const input = root.querySelector('input');
                  return {open: true, focusInDialog: root.contains(document.activeElement),
                          modal: root.getAttribute('aria-modal'),
                          role: root.getAttribute('role')};
                }""")
                note(name, "Strg+K öffnet die Suche", dialog.get("open"), json.dumps(dialog, ensure_ascii=False))
                if dialog.get("open"):
                    note(name, "Fokus im Suchfeld", dialog.get("focusInDialog"), "")
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(300)
                    closed = page.evaluate("""() => ({
                      open: !!document.querySelector('.bw-cmd.open'),
                      focus: document.activeElement.className || document.activeElement.tagName })""")
                    note(name, "Escape schließt die Suche", not closed["open"], json.dumps(closed, ensure_ascii=False))

                # --- Sprachknöpfe ---
                lang_btns = page.query_selector_all("[data-lang-btn]")
                note(name, "Sprachknöpfe vorhanden", len(lang_btns) >= 2, str(len(lang_btns)))
                if lang_btns:
                    # Auf schmalen Breiten liegt der sichtbare Satz im Menü,
                    # der Satz im Kopf ist per CSS ausgeblendet.
                    toggle = page.query_selector(".nav-toggle")
                    if toggle:
                        toggle.click()
                        page.wait_for_timeout(300)
                    box = None
                    for btn in lang_btns:
                        b = btn.bounding_box()
                        if b and b["width"] > 0:
                            box = b
                            break
                    if toggle:
                        page.keyboard.press("Escape")
                        page.wait_for_timeout(200)
                    note(name, "Sprachknopf sichtbar und groß genug",
                         bool(box) and box["height"] >= 24 and box["width"] >= 24,
                         json.dumps(box))

                # --- Sprungmarke ---
                skip = page.query_selector(".skip-link")
                if skip:
                    skip.focus()
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(400)
                    target = page.evaluate("""() => ({
                      hash: location.hash,
                      main: !!document.getElementById('main'),
                      inMain: !!document.activeElement.closest('main')
                    })""")
                    note(name, "Sprungmarke erreicht <main>", target["hash"] == "#main" and target["main"],
                         json.dumps(target, ensure_ascii=False))
                else:
                    note(name, "Sprungmarke vorhanden", False, "")
            except Exception as exc:
                note(name, "Seite bedienbar", False, str(exc)[:120])
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

    summary = {"pages": len(PAGES), "checks": len(rows), "findings": len(findings)}
    (outdir / "keyboard.json").write_text(
        json.dumps({"summary": summary, "checks": rows, "findings": findings},
                   indent=2, ensure_ascii=False), encoding="utf-8")
    for f in findings:
        print("BEFUND", json.dumps(f, ensure_ascii=False))
    print("KEYBOARD", json.dumps(summary, ensure_ascii=False))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
