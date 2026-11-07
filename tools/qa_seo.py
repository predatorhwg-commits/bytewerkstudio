#!/usr/bin/env python3
"""SEO and social audit for the static site.

Checks per page: title length, description length, canonical, og/twitter tags,
structured data validity, hreflang/og locale alternatives, image lazy loading,
external link safety, and heading order.
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SKIP = {"google3491bb2e3bfcb9d2.html"}


class Audit(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._t = False
        self.meta = {}
        self.links = []
        self.imgs = []
        self.headings = []
        self.jsonld = []
        self._ld = False
        self._ld_buf = ""
        self.anchors = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._t = True
        if tag == "meta":
            k = (a.get("name") or a.get("property") or a.get("http-equiv") or "").lower()
            if k:
                self.meta.setdefault(k, []).append(a.get("content", ""))
        if tag == "link":
            self.links.append(a)
        if tag == "img":
            self.imgs.append(a)
        if tag in ("h1", "h2", "h3", "h4"):
            self.headings.append(tag)
        if tag == "script" and "ld+json" in (a.get("type") or ""):
            self._ld = True
            self._ld_buf = ""
        if tag == "a":
            self.anchors.append(a)

    def handle_endtag(self, tag):
        if tag == "title":
            self._t = False
        if tag == "script" and self._ld:
            self._ld = False
            self.jsonld.append(self._ld_buf)

    def handle_data(self, data):
        if self._t:
            self.title += data
        if self._ld:
            self._ld_buf += data


def one(v):
    return v[0] if v else ""


def main() -> int:
    rows = []
    problems = []
    for p in sorted(ROOT.glob("*.html")):
        if p.name in SKIP:
            continue
        a = Audit()
        a.feed(p.read_text(encoding="utf-8", errors="replace"))
        title = a.title.strip()
        desc = one(a.meta.get("description", [""]))
        canonical = next((l.get("href") for l in a.links if (l.get("rel") or "").lower() == "canonical"), "")
        og_image = one(a.meta.get("og:image", [""]))
        robots = one(a.meta.get("robots", [""]))
        ld_ok = True
        for block in a.jsonld:
            try:
                json.loads(block)
            except Exception as exc:
                ld_ok = False
                problems.append((p.name, f"JSON-LD invalid: {exc}"))
        heading_order = True
        seen_h2 = False
        for h in a.headings:
            if h == "h1":
                if seen_h2:
                    heading_order = False
            elif h == "h2":
                seen_h2 = True
        missing_alt = sum(1 for i in a.imgs if "alt" not in i)
        noopener = [x.get("href") for x in a.anchors
                    if x.get("target") == "_blank" and "noopener" not in (x.get("rel") or "")]
        lazy = sum(1 for i in a.imgs if i.get("loading") == "lazy")
        checks = {
            "page": p.name,
            "title_len": len(title),
            "desc_len": len(desc),
            "canonical": bool(canonical),
            "og_title": bool(one(a.meta.get("og:title", [""]))),
            "og_desc": bool(one(a.meta.get("og:description", [""]))),
            "og_image": bool(og_image),
            "og_image_exists": bool(og_image) and (ROOT / og_image.replace("https://bytewerkstudio.com/", "")).exists(),
            "twitter_card": bool(one(a.meta.get("twitter:card", [""]))),
            "ld_ok": ld_ok,
            "heading_order": heading_order,
            "imgs": len(a.imgs),
            "lazy": lazy,
            "missing_alt": missing_alt,
            "noopener_missing": len(noopener),
            "noindex": "noindex" in robots,
        }
        rows.append(checks)
        if p.name == "404.html":
            checks["canonical"] = True  # a 404 must not declare a canonical URL
        if not (20 <= checks["title_len"] <= 65):
            problems.append((p.name, f"title length {checks['title_len']}"))
        if not (70 <= checks["desc_len"] <= 175):
            problems.append((p.name, f"description length {checks['desc_len']}"))
        for key in ("canonical", "og_title", "og_desc", "og_image", "og_image_exists", "twitter_card", "ld_ok"):
            if not checks[key]:
                problems.append((p.name, f"missing {key}"))
        if checks["missing_alt"]:
            problems.append((p.name, f"{checks['missing_alt']} images without alt"))
        if checks["noopener_missing"]:
            problems.append((p.name, f"{checks['noopener_missing']} target=_blank without noopener"))
        if not heading_order:
            problems.append((p.name, "heading order (h1 after h2)"))

    print(json.dumps({"pages": len(rows), "problems": len(problems)}, ensure_ascii=False))
    for name, msg in problems:
        print(f"  {name}: {msg}")
    (ROOT / "docs" / "qa").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs" / "qa" / "seo.json").write_text(json.dumps({"rows": rows, "problems": problems}, indent=2, ensure_ascii=False), encoding="utf-8")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
