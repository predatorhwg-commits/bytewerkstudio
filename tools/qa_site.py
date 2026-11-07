#!/usr/bin/env python3
"""Bytewerk release audit.

Static checks (links, ids, assets, i18n coverage) plus browser checks
(console errors, overflow, language switch, mobile menu) for every page.

Usage:
  python3 tools/qa_site.py --base http://127.0.0.1:8808 --out docs/qa
  python3 tools/qa_site.py --static-only
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}
EXTERNAL_OK = ("http://", "https://", "mailto:", "tel:", "javascript:", "data:")


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.links = []
        self.assets = []
        self.images = []
        self.scripts = []
        self.metas = {}
        self.h1 = 0
        self.lang = None
        self.title = ""
        self.canonical = None
        self._in_title = False
        self._in_script = False
        self._script_type = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang")
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "a" and "href" in a:
            self.links.append(a["href"])
        if tag in ("img", "source", "video", "audio"):
            src = a.get("src") or a.get("data-src")
            if src:
                self.assets.append(src)
            if tag == "img":
                self.images.append((src, a.get("alt")))
        if tag == "link" and "href" in a:
            rel = (a.get("rel") or "").lower()
            if "stylesheet" in rel or "icon" in rel or "preload" in rel:
                self.assets.append(a["href"])
            if "canonical" in rel:
                self.canonical = a["href"]
        if tag == "script":
            if a.get("src"):
                self.assets.append(a["src"])
                self.scripts.append(a["src"])
            self._in_script = True
            self._script_type = (a.get("type") or "").lower()
        if tag == "meta":
            key = a.get("name") or a.get("property") or a.get("http-equiv")
            if key:
                self.metas[key.lower()] = a.get("content", "")
        if tag == "title":
            self._in_title = True
        if tag == "h1":
            self.h1 += 1

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_script = False
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def static_audit() -> dict:
    pages = sorted(p for p in ROOT.glob("*.html") if p.name not in SKIP)
    all_ids = {}
    results = []
    for p in pages:
        parser = PageParser()
        parser.feed(p.read_text(encoding="utf-8", errors="replace"))
        all_ids[p.name] = parser.ids
        results.append({"page": p.name, "parser": parser})

    report = {"pages": [], "summary": {}}
    total_missing_alt = 0
    total_broken = 0
    total_dup = 0
    total_h1 = 0
    for item in results:
        p = ROOT / item["page"]
        parser = item["parser"]
        dups = [i for i, n in Counter(parser.ids).items() if n > 1]
        missing_alt = [src for src, alt in parser.images if src and alt is None]
        broken = []
        for href in parser.links + parser.assets:
            if not href or href.startswith("#") or href.startswith(EXTERNAL_OK):
                continue
            clean = href.split("#")[0].split("?")[0]
            if not clean:
                continue
            target = (ROOT / clean.lstrip("/")) if clean.startswith("/") else (p.parent / clean).resolve()
            if not target.exists():
                broken.append(href)
        # anchors in internal page links
        for href in parser.links:
            if not href.startswith("#") or len(href) < 2:
                continue
            if href[1:] not in parser.ids:
                broken.append(href)
        total_missing_alt += len(missing_alt)
        total_broken += len(broken)
        total_dup += len(dups)
        if parser.h1 != 1:
            total_h1 += 1
        report["pages"].append({
            "page": item["page"],
            "title": parser.title.strip(),
            "lang": parser.lang,
            "h1": parser.h1,
            "ids": len(parser.ids),
            "duplicate_ids": dups,
            "images_without_alt": missing_alt,
            "broken_refs": sorted(set(broken)),
            "csp": "yes" if "content-security-policy" in parser.metas else "no",
            "description": bool(parser.metas.get("description")),
            "canonical": parser.canonical,
            "data_en": len(re.findall(r"data-en", p.read_text(encoding="utf-8", errors="replace"))),
        })
    report["summary"] = {
        "pages": len(pages),
        "broken_refs": total_broken,
        "duplicate_id_pages": total_dup,
        "images_without_alt": total_missing_alt,
        "pages_with_wrong_h1_count": total_h1,
        "pages_without_csp": sum(1 for x in report["pages"] if x["csp"] == "no"),
    }
    return report


def runtime_audit(base: str, outdir: Path, viewports=(("desktop", 1440, 900), ("tablet", 768, 1024), ("mobile", 390, 844))) -> dict:
    from playwright.sync_api import sync_playwright

    pages = sorted(p.name for p in ROOT.glob("*.html") if p.name not in SKIP)
    outdir.mkdir(parents=True, exist_ok=True)
    results = {name: {"page": name, "runs": []} for name in pages}

    def launch(pw):
        return pw.chromium.launch(args=[
            "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
            "--disable-dev-shm-usage", "--disable-webgl"
        ])

    def one_run(pw, name, label, width, height):
        browser = None
        ctx = None
        try:
            browser = launch(pw)
            ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
            ctx.add_init_script("try{localStorage.setItem('bw-lang','de')}catch(e){}")
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
            page.goto(f"{base}/{name}", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(900)
            info = page.evaluate("""() => {
              const d = document.documentElement;
              const nav = document.querySelector('.nav');
              const h1 = document.querySelectorAll('h1').length;
              const over = [...document.querySelectorAll('body *')].filter(e => {
                const r = e.getBoundingClientRect();
                const style = getComputedStyle(e);
                if (style.position === 'fixed') return false;
                return r.width > 0 && (r.right > d.clientWidth + 1.5 || r.left < -1.5);
              }).slice(0, 8).map(e => (e.tagName + '.' + String(e.className)).slice(0, 60));
              return {
                scrollW: d.scrollWidth, clientW: d.clientWidth,
                overflowNodes: over,
                navH: nav ? Math.round(nav.getBoundingClientRect().height) : null,
                h1, lang: d.lang,
                canonical: !!document.querySelector('link[rel=canonical]'),
                canvases: document.querySelectorAll('canvas').length,
                title: document.title
              };
            }""")
            lang_ok = None
            try:
                page.click('[data-lang-btn="en"]', timeout=1500)
                page.wait_for_timeout(120)
                en_lang = page.evaluate("document.documentElement.lang")
                page.click('[data-lang-btn="de"]', timeout=1500)
                page.wait_for_timeout(120)
                de_lang = page.evaluate("document.documentElement.lang")
                lang_ok = (en_lang == "en" and de_lang == "de")
            except Exception:
                lang_ok = None
            menu_ok = None
            if width <= 820:
                try:
                    page.click('[data-nav-toggle], .nav-toggle', timeout=1500)
                    page.wait_for_timeout(150)
                    menu_ok = page.evaluate("""() => {
                      const m = document.querySelector('.mobile-menu');
                      if (!m) return false;
                      const s = getComputedStyle(m);
                      return s.display !== 'none' && s.visibility !== 'hidden' && m.getBoundingClientRect().height > 20;
                    }""")
                except Exception:
                    menu_ok = False
            if label == "desktop" or (name == "index.html" and label in ("tablet", "mobile")):
                page.screenshot(path=str(outdir / f"{name.replace('.html','')}-{label}.png"), full_page=False)
            return {
                "viewport": label, "width": width, "height": height,
                **info, "errors": errors[:8], "lang_switch": lang_ok, "mobile_menu": menu_ok
            }
        except Exception as exc:
            return {"viewport": label, "width": width, "height": height, "fatal": str(exc)}
        finally:
            try:
                if ctx:
                    ctx.close()
            except Exception:
                pass
            try:
                if browser:
                    browser.close()
            except Exception:
                pass

    with sync_playwright() as pw:
        for label, width, height in viewports:
            for name in pages:
                print(f"[{label}] {name}", flush=True)
                result = one_run(pw, name, label, width, height)
                if "fatal" in result:
                    print(f"  retry after: {result['fatal'][:80]}", flush=True)
                    result = one_run(pw, name, label, width, height)
                results[name]["runs"].append(result)
                (outdir / "runtime.partial.json").write_text(
                    json.dumps({"pages": [results[n] for n in pages]}, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )

    results = [results[name] for name in pages]
    summary = {
        "pages": len(results),
        "console_error_pages": sum(1 for r in results if any(x.get("errors") for x in r["runs"])),
        "overflow_pages": sum(1 for r in results if any(x.get("scrollW", 0) > x.get("clientW", 0) + 1 for x in r["runs"])),
        "lang_switch_failures": sum(1 for r in results if any(x.get("lang_switch") is False for x in r["runs"])),
        "mobile_menu_failures": sum(1 for r in results if any(x.get("mobile_menu") is False for x in r["runs"])),
        "fatal_pages": sum(1 for r in results if any(x.get("fatal") for x in r["runs"])),
    }
    report = {"summary": summary, "pages": results}
    (outdir / "runtime.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8808")
    ap.add_argument("--out", default="docs/qa")
    ap.add_argument("--static-only", action="store_true")
    args = ap.parse_args()
    outdir = ROOT / args.out
    static = static_audit()
    (outdir).mkdir(parents=True, exist_ok=True)
    (outdir / "static.json").write_text(json.dumps(static, indent=2, ensure_ascii=False), encoding="utf-8")
    print("STATIC", json.dumps(static["summary"], ensure_ascii=False))
    if args.static_only:
        return 0
    runtime = runtime_audit(args.base, outdir)
    (outdir / "runtime.json").write_text(json.dumps(runtime, indent=2, ensure_ascii=False), encoding="utf-8")
    print("RUNTIME", json.dumps(runtime["summary"], ensure_ascii=False), flush=True)
    return 0 if all(v == 0 for v in runtime["summary"].values() if isinstance(v, int)) else 1


if __name__ == "__main__":
    sys.exit(main())
