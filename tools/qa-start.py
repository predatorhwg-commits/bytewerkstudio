#!/usr/bin/env python3
"""Startseiten-QA: Layout, Konsole, Links, A11y-Basics, Requests.
Aufruf: python3 tools/qa-start.py [base-url]"""
from playwright.sync_api import sync_playwright
import json, sys
from urllib.parse import urljoin

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8899").rstrip("/")
PAGES = ["/", "/arbeiten.html", "/shop.html", "/kontakt.html", "/studio.html", "/login.html", "/showroom.html"]
VIEWPORTS = [(1440, 1000), (1024, 900), (768, 900), (390, 844)]
report = {"base": BASE, "pages": {}, "problems": []}

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in VIEWPORTS:
        ctx = browser.new_context(viewport={"width": width, "height": height}, locale="de-DE")
        page = ctx.new_page()
        console, failed, external = [], [], set()
        page.on("pageerror", lambda e: console.append("pageerror: " + str(e)[:160]))
        page.on("console", lambda m: console.append("console: " + m.text[:160]) if m.type == "error" else None)
        page.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        page.on("request", lambda r: external.add(r.url.split("/")[2]) if not r.url.startswith(BASE) and not r.url.startswith("data:") else None)
        for path in PAGES if width in (1440, 390) else ["/"]:
            page.goto(BASE + path, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(500)
            m = page.evaluate("""() => {
              const de = document.documentElement;
              const focusables = [...document.querySelectorAll('a,button,summary,input,select,textarea')];
              const smallEls = focusables.filter(e => { const r=e.getBoundingClientRect();
                return r.width>0 && r.height>0 && (r.height<24 || r.width<24); });
              const small = smallEls.length;
              const smallList = smallEls.slice(0,4).map(e => (e.textContent||e.getAttribute('aria-label')||e.className||e.tagName).trim().slice(0,40));
              const h1 = document.querySelectorAll('h1').length;
              const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(e=>+e.tagName[1]);
              let skips=0; for(let i=1;i<heads.length;i++) if(heads[i]-heads[i-1]>1) skips++;
              const imgs=[...document.images]; const noalt=imgs.filter(i=>!i.hasAttribute('alt')).length;
              const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
              const dup=[...new Set(ids.filter((v,i)=>ids.indexOf(v)!==i))];
              return { overflow: de.scrollWidth-de.clientWidth, height: de.scrollHeight,
                       h1, headingSkips: skips, imgs: imgs.length, noalt, dupIds: dup,
                       smallTargets: small, smallList, lang: de.lang,
                       title: document.title, desc: document.querySelector('meta[name=description]')?.content?.length||0 };
            }""")
            key = f"{width} {path}"
            report["pages"][key] = m
            if m["overflow"] > 0: report["problems"].append(f"{key}: horizontal overflow {m['overflow']}px")
            if m["h1"] != 1: report["problems"].append(f"{key}: h1 count {m['h1']}")
            if m["headingSkips"] > 1: report["problems"].append(f"{key}: heading skips {m['headingSkips']}")
            if m["noalt"]: report["problems"].append(f"{key}: images without alt {m['noalt']}")
            if m["dupIds"]: report["problems"].append(f"{key}: duplicate ids {m['dupIds']}")
            if m["smallTargets"]: report["problems"].append(f"{key}: {m['smallTargets']} targets under 24px {m['smallList']}")
            print(f"{key:20} ov={m['overflow']} h={m['height']} h1={m['h1']} skips={m['headingSkips']} small={m['smallTargets']} noalt={m['noalt']} dup={len(m['dupIds'])}")
        if console: report["problems"].append(f"{width}px console errors: {console[:6]}")
        if failed: report["problems"].append(f"{width}px HTTP failures: {failed[:6]}")
        if external: report["problems"].append(f"{width}px external requests: {sorted(external)}")
        print(f"  {width}px errors={console[:3]} failed={failed[:3]} external={sorted(external)}")
        ctx.close()
    browser.close()

print("\nPROBLEME:", len(report["problems"]))
for x in report["problems"]: print(" -", x)
open("tools/qa-start.json", "w").write(json.dumps(report, indent=2, ensure_ascii=False))
