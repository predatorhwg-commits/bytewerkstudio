#!/usr/bin/env python3
"""Site-QA für die statische Bytewerk-Website.

Prüft jede Seite bei 1440 und 390 px: Status, Konsolenfehler,
fehlgeschlagene Requests, fremde Hosts, horizontalen Überlauf,
genau eine H1, Alt-Texte, doppelte IDs, CSP und Inline-Skripte.

Aufruf: python3 tools/qa-site.py [base-url]
"""
from playwright.sync_api import sync_playwright
import glob, json, os, sys

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8907").rstrip("/")
PAGES = ["/"] + ["/" + os.path.basename(p) for p in sorted(glob.glob("*.html")) if os.path.basename(p) != "index.html"]
VIEWPORTS = [(1440, 1000), (390, 844)]

# Googles Verifizierungsdatei ist kein Seiteninhalt: kein H1, keine CSP, kein Stylesheet.
EXEMPT = ("/google3491bb2e3bfcb9d2.html",)

MEASURE = """() => {
  const de = document.documentElement;
  const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(e => +e.tagName[1]);
  let skips = 0;
  for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i-1] > 1) skips++;
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
  const scriptSrc = (csp.match(/script-src([^;]*)/) || ['', ''])[1];
  return {
    overflow: de.scrollWidth - de.clientWidth,
    height: de.scrollHeight,
    h1: document.querySelectorAll('h1').length,
    headingSkips: skips,
    noalt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
    dupIds: [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))],
    lang: de.lang,
    title: (document.title || '').length,
    desc: (document.querySelector('meta[name=description]')?.content || '').length,
    inlineScripts: [...document.querySelectorAll('script:not([src])')]
      .filter(s => !/ld\\+json|application\\/json/.test(s.type)).length,
    cspStrict: /script-src 'self'\\s*(;|$)/.test(csp),
    csp: csp.slice(0, 40)
  };
}"""

report = {"base": BASE, "results": [], "problems": []}


def check(entry, label):
    p = report["problems"]
    if entry.get("error"):
        p.append(f"{label}: {entry['error']}")
        return
    if entry["status"] != 200:
        p.append(f"{label}: HTTP {entry['status']}")
    if entry["overflow"] > 0:
        p.append(f"{label}: overflow {entry['overflow']}px")
    if entry["page"] in EXEMPT:
        # Verifizierungsdatei: nur Status und Überlauf zählen.
        if entry["console"]:
            p.append(f"{label}: console {entry['console'][:3]}")
        if entry["failed"]:
            p.append(f"{label}: failed {entry['failed'][:3]}")
        return
    if entry["h1"] != 1:
        p.append(f"{label}: h1={entry['h1']}")
    if entry["noalt"]:
        p.append(f"{label}: {entry['noalt']} images without alt")
    if entry["dupIds"]:
        p.append(f"{label}: duplicate ids {entry['dupIds']}")
    if entry["inlineScripts"]:
        p.append(f"{label}: {entry['inlineScripts']} inline scripts")
    if not entry["cspStrict"] and entry["page"] not in ("/neon-horde/dist/index.html",):
        p.append(f"{label}: CSP script-src not strict ({entry['csp']})")
    if entry["console"]:
        p.append(f"{label}: console {entry['console'][:3]}")
    if entry["failed"]:
        p.append(f"{label}: failed {entry['failed'][:3]}")
    if entry["external"]:
        p.append(f"{label}: external {entry['external']}")


def new_session(p, width, height):
    browser = p.chromium.launch(args=["--disable-gpu", "--disable-dev-shm-usage"])
    context = browser.new_context(viewport={"width": width, "height": height}, locale="de-DE")
    return browser, context


def measure(p, width, height, path, session):
    """Misst eine Seite. Startet den Browser neu, wenn Chromium mittendrin abstuerzt."""
    browser, context = session
    for attempt in (1, 2, 3):
        console, failed, external = [], [], set()
        entry = {"viewport": width, "page": path, "console": console, "failed": failed}
        try:
            page = context.new_page()
            page.on("pageerror", lambda e: console.append("pageerror: " + str(e)[:140]))
            page.on("console", lambda m: console.append(m.text[:140]) if m.type == "error" else None)
            page.on("response", lambda r: failed.append(f"{r.status} {r.url.split('/')[-1]}") if r.status >= 400 else None)
            page.on("request", lambda r: external.add(r.url.split("/")[2])
                    if r.url.startswith("http") and not r.url.startswith(BASE) else None)
            resp = page.goto(BASE + path, wait_until="load", timeout=30000)
            page.wait_for_timeout(350)
            entry.update(page.evaluate(MEASURE))
            entry["status"] = resp.status if resp else 0
            entry["external"] = sorted(external)
            try:
                page.close()
            except Exception:
                pass
            return entry, session
        except Exception as exc:
            entry["error"] = str(exc)[:160]
            entry["external"] = sorted(external)
            try:
                browser.close()
            except Exception:
                pass
            if attempt == 3:
                return entry, None
            session = new_session(p, width, height)
    return entry, session


with sync_playwright() as p:
    for width, height in VIEWPORTS:
        session = new_session(p, width, height)
        for path in PAGES:
            if session is None:
                session = new_session(p, width, height)
            entry, session = measure(p, width, height, path, session)
            if session is None:
                report["results"].append(entry)
                check(entry, f"{width} {path}")
                print(f"{path:40} nach 3 Versuchen abgebrochen")
                continue
            report["results"].append(entry)
            check(entry, f"{width} {path}")
            if width == 1440:
                print(f"{path:40} h={entry.get('height', 0):6} ov={entry.get('overflow', '?')} "
                      f"err={len(entry['console'])} ext={len(entry['external'])}")
        if session is not None:
            try:
                session[0].close()
            except Exception:
                pass

print(f"\nSeiten geprüft: {len(report['results'])} · Probleme: {len(report['problems'])}")
for problem in report["problems"]:
    print(" -", problem)
os.makedirs("tools", exist_ok=True)
open("tools/qa-site.json", "w").write(json.dumps(report, indent=2, ensure_ascii=False))
