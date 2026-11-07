#!/usr/bin/env python3
"""Prüft, ob Nutzereingaben als Markup in die Seite gelangen (XSS).

Für jede Seite werden typische Eingabewege mit präparierten Werten
aufgerufen: Query-Parameter, Fragment und das Suchfeld. Danach wird
geprüft, ob ein Marker-Element im DOM entstanden ist oder ob Code
ausgeführt wurde. Beides darf nicht passieren.

Zusätzlich wird die CSP im Browser geprüft: Ein absichtlich injizierter
Inline-Handler darf nicht laufen (script-src-attr 'none').

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_xss.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import quote

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]

PAYLOADS = [
    '"><img src=x id="bw-xss" onerror="window.__bwXss=1">',
    "'><svg id=\"bw-xss\" onload=\"window.__bwXss=1\">",
    '</script><script>window.__bwXss=1</script>',
    'javascript:window.__bwXss=1',
    '"><iframe id="bw-xss" src="javascript:window.__bwXss=1"></iframe>',
]

# Seiten, die Eingaben aus der URL lesen, und der Parameter, den sie lesen.
TARGETS = [
    ("kontakt.html", "q"),
    ("forum.html", "t"),
    ("login.html", "next"),
    ("register.html", "next"),
    ("passwort-vergessen.html", "next"),
    ("musterbuch.html", "farbe"),
    ("index.html", "q"),
    ("404.html", "q"),
    ("shop.html", "q"),
    ("arbeiten.html", "case"),
]

CHECK = """() => ({
  marker: !!document.getElementById('bw-xss'),
  executed: window.__bwXss === 1,
  scripts: document.querySelectorAll('script').length,
  iframes: document.querySelectorAll('iframe').length,
  inlineHandler: [...document.querySelectorAll('*')]
    .some(el => [...el.attributes].some(a => /^on/i.test(a.name)))
})"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    findings = []
    checks = 0

    state = {"browser": None, "ctx": None, "page": None}

    def fresh():
        for key in ("ctx", "browser"):
            try:
                if state[key]:
                    state[key].close()
            except Exception:
                pass
        state["browser"] = pw.chromium.launch(args=ARGS)
        state["ctx"] = state["browser"].new_context(viewport={"width": 1440, "height": 900})
        state["page"] = state["ctx"].new_page()

    def inspect(url, settle=400):
        """Laden, kurz warten, DOM prüfen — nach Absturz einmal komplett neu."""
        for attempt in (1, 2):
            try:
                state["page"].goto(url, wait_until="domcontentloaded", timeout=30000)
                state["page"].wait_for_timeout(settle)
                return state["page"].evaluate(CHECK)
            except Exception:
                if attempt == 2:
                    raise
                fresh()
        raise RuntimeError("nicht erreichbar")

    with sync_playwright() as pw:
        fresh()

        for name, param in TARGETS:
            for payload in PAYLOADS:
                url = f"{args.base}/{name}?{param}={quote(payload)}"
                try:
                    res = inspect(url)
                    checks += 1
                    if res["marker"] or res["executed"]:
                        findings.append({"page": name, "param": param, "payload": payload[:60],
                                         "marker": res["marker"], "executed": res["executed"]})
                except Exception as exc:
                    findings.append({"page": name, "param": param, "payload": payload[:60],
                                     "error": str(exc)[:100]})

        # Fragment: manche Seiten lesen den Hash (Forum, Arbeiten, Probierstand).
        for name in ("forum.html", "arbeiten.html", "probierstand.html"):
            for payload in PAYLOADS[:2]:
                url = f"{args.base}/{name}#{quote(payload)}"
                try:
                    res = inspect(url)
                    checks += 1
                    if res["marker"] or res["executed"]:
                        findings.append({"page": name, "param": "#hash", "payload": payload[:60],
                                         "marker": res["marker"], "executed": res["executed"]})
                except Exception as exc:
                    findings.append({"page": name, "param": "#hash", "payload": payload[:60],
                                     "error": str(exc)[:100]})

        # Suchfeld: Eingabe darf nur als Text in der Trefferliste landen.
        for name in ("index.html", "forum.html", "shop.html", "404.html"):
            try:
                state["page"].goto(f"{args.base}/{name}", wait_until="domcontentloaded", timeout=30000)
                state["page"].wait_for_timeout(500)
            except Exception:
                fresh()
                state["page"].goto(f"{args.base}/{name}", wait_until="domcontentloaded", timeout=30000)
                state["page"].wait_for_timeout(500)
            page = state["page"]
            openers = page.query_selector_all("[data-search-open]")
            if openers:
                try:
                    openers[0].click(timeout=3000)
                    page.wait_for_timeout(300)
                except Exception:
                    pass
            field = page.query_selector(".bw-cmd input, input[type=search], .nf-field input")
            if field:
                field.fill('<img src=x id="bw-xss" onerror="window.__bwXss=1">')
                page.wait_for_timeout(500)
                res = page.evaluate(CHECK)
                checks += 1
                if res["marker"] or res["executed"]:
                    findings.append({"page": name, "param": "Suchfeld",
                                     "payload": "img/onerror", "marker": res["marker"],
                                     "executed": res["executed"]})

        # CSP-Gegenprobe: Ein Inline-Handler, der ins DOM gesetzt wird, darf
        # nicht ausgeführt werden.
        try:
            state["page"].goto(f"{args.base}/index.html", wait_until="domcontentloaded", timeout=30000)
        except Exception:
            fresh()
            state["page"].goto(f"{args.base}/index.html", wait_until="domcontentloaded", timeout=30000)
        page = state["page"]
        page.evaluate("""() => {
          window.__bwCsp = 0;
          const b = document.createElement('button');
          b.id = 'bw-csp-probe';
          b.setAttribute('onclick', 'window.__bwCsp = 1');
          document.body.appendChild(b);
          b.click();
        }""")
        csp_res = page.evaluate("() => ({fired: window.__bwCsp === 1, exists: !!document.getElementById('bw-csp-probe')})")
        checks += 1
        if csp_res["fired"]:
            findings.append({"page": "index.html", "param": "CSP-Gegenprobe",
                             "payload": "onclick", "executed": True})

        # Clickjacking: Eine fremde Seite bettet die Startseite ein. Weil
        # GitHub Pages keinen X-Frame-Options-Header liefert und
        # frame-ancestors in einer <meta>-CSP unwirksam ist, muss die Seite
        # selbst ausbrechen. Geprüft wird das Ergebnis, nicht der Code.
        frame_path = ROOT / "__bw-frame-test.html"
        frame_path.write_text(
            "<!DOCTYPE html><html><head><meta charset='utf-8'><title>fremd</title></head>"
            f"<body><h1>fremd</h1><iframe id='victim' src='{args.base}/index.html' "
            "width='900' height='600'></iframe></body></html>",
            encoding="utf-8")
        framed = None
        try:
            state["page"].goto(f"{args.base}/__bw-frame-test.html",
                               wait_until="domcontentloaded", timeout=30000)
            state["page"].wait_for_timeout(1200)
            framed = {
                "url": state["page"].url,
                "iframe_present": state["page"].evaluate(
                    "() => !!document.getElementById('victim')"),
            }
        except Exception:
            try:
                fresh()
                state["page"].goto(f"{args.base}/__bw-frame-test.html",
                                   wait_until="domcontentloaded", timeout=30000)
                state["page"].wait_for_timeout(1200)
                framed = {"url": state["page"].url,
                          "iframe_present": state["page"].evaluate(
                              "() => !!document.getElementById('victim')")}
            except Exception as exc:
                framed = {"error": str(exc)[:120]}
        finally:
            try:
                frame_path.unlink()
            except OSError:
                pass
        escaped = bool(framed) and "url" in framed and not framed["url"].endswith(
            "__bw-frame-test.html")
        checks += 1
        if not escaped:
            findings.append({"page": "index.html", "param": "Clickjacking",
                             "payload": "iframe", "detail": framed})

        # Aufräumen und Ergebnis
        try:
            state["ctx"].close()
            state["browser"].close()
        except Exception:
            pass

    summary = {"checks": checks, "findings": len(findings), "payloads": len(PAYLOADS),
               "csp_blocks_inline_handler": not csp_res["fired"],
               "frame_buster_active": escaped}
    (outdir / "xss.json").write_text(
        json.dumps({"summary": summary, "findings": findings}, indent=2, ensure_ascii=False),
        encoding="utf-8")
    for f in findings[:20]:
        print("BEFUND", json.dumps(f, ensure_ascii=False))
    print("XSS", json.dumps(summary, ensure_ascii=False))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
