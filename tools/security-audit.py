#!/usr/bin/env python3
# ============================================================
#  BYTEWERK STUDIO — SICHERHEITS-AUDIT (07.11.2026)
#  ------------------------------------------------------------
#  Prüft die ausgelieferten Dateien gegen die Regeln aus
#  docs/SICHERHEIT.md. Keine Abhängigkeiten, kein Netz, nur lesen.
#
#  Aufruf:
#      python3 tools/security-audit.py
#      python3 tools/security-audit.py --json
#
#  Exit-Code 0 = keine Fehler, 1 = mindestens ein Fehler.
#  "warn" sind Hinweise, die man kennen sollte, aber nicht blocken.
# ============================================================

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {"vendor", "fonts", "media", "node_modules", ".git", "docs", "supabase", "tools"}

CSP_RE = re.compile(r'http-equiv="Content-Security-Policy"\s+content="([^"]+)"', re.I)
INLINE_SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>", re.I | re.S)
HREF_RE = re.compile(r'<a\b[^>]*target="_blank"[^>]*>', re.I)
STYLE_ATTR_RE = re.compile(r'\sstyle="[^"]*"', re.I)
EXT_SCRIPT_RE = re.compile(r'<script[^>]*src="(https?://[^"]+)"', re.I)
EVAL_RE = re.compile(r'(?<![\w.])eval\s*\(|new\s+Function\s*\(|document\.write\s*\(')
INNER_HTML_RE = re.compile(r'\.innerHTML\s*=\s*[^;\n]*(?:\$\{|\+\s*[A-Za-z_$])')
SECRET_RE = re.compile(
    r'(?:api[_-]?key|secret|password|token)\s*[:=]\s*["\']([A-Za-z0-9_\-]{24,})["\']', re.I
)


def files(pattern):
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for name in names:
            if name.endswith(pattern):
                yield os.path.join(base, name)


def rel(path):
    return os.path.relpath(path, ROOT)


def scope_pages():
    """Nur Seiten, die in der sitemap.xml stehen, sind die ausgelieferte
    Website. Alles andere (Google-Verifizierung, neon-horde/) ist Beiwerk
    und wird getrennt gemeldet statt als Fehler."""
    path = os.path.join(ROOT, "sitemap.xml")
    if not os.path.exists(path):
        return None
    body = open(path, encoding="utf-8").read()
    urls = re.findall(r"<loc>([^<]+)</loc>", body)
    out = set()
    for url in urls:
        local = url.split("bytewerkstudio.com/", 1)[-1].split("#")[0]
        out.add(local or "index.html")
    return out


def audit():
    errors, warnings, facts = [], [], {}
    scope = scope_pages()

    pages = sorted(files(".html"))
    js_files = sorted(files(".js"))
    facts["html_pages"] = len(pages)
    facts["js_files"] = len(js_files)

    no_csp, loose_script, loose_style = [], [], []
    inline_scripts = 0
    style_attrs = 0
    ext_scripts = []
    inline_page_scripts = {}

    for page in pages:
        text = open(page, encoding="utf-8", errors="replace").read()
        name = rel(page)
        match = CSP_RE.search(text)

        in_scope = scope is None or name in scope
        if not match:
            if in_scope:
                no_csp.append(name)
        else:
            csp = match.group(1)
            if re.search(r"script-src[^;]*'unsafe-inline'", csp) and in_scope:
                loose_script.append(name)
            if re.search(r"style-src[^;]*'unsafe-inline'", csp) and in_scope:
                loose_style.append(name)

        count = 0
        for attrs, body in INLINE_SCRIPT_RE.findall(text):
            if re.search(r'type="application/ld\+json"', attrs, re.I):
                continue
            if body.strip():
                count += 1
        if count and (scope is None or name in scope):
            inline_page_scripts[name] = count
            inline_scripts += count

        if in_scope:
            style_attrs += len(STYLE_ATTR_RE.findall(text))
            ext_scripts += [(name, u) for u in EXT_SCRIPT_RE.findall(text)]

    facts["pages_without_csp"] = len(no_csp)
    facts["pages_script_unsafe_inline"] = len(loose_script)
    facts["pages_style_unsafe_inline"] = len(loose_style)
    facts["inline_scripts"] = inline_scripts
    facts["style_attributes"] = style_attrs
    facts["external_scripts"] = len(ext_scripts)
    facts["strict_pages"] = 0

    outside = sorted(rel(p) for p in pages if scope is not None and rel(p) not in scope)
    in_scope_pages = [p for p in pages if scope is None or rel(p) in scope]
    facts["strict_pages"] = sum(1 for p in in_scope_pages if rel(p) not in loose_script)
    facts["in_scope_pages"] = len(in_scope_pages)

    if no_csp:
        errors.append("Seite ohne CSP: " + ", ".join(no_csp))
    if outside:
        facts["pages_outside_scope"] = len(outside)
    if ext_scripts:
        for page, url in ext_scripts:
            errors.append(f"Fremdes Skript auf {page}: {url}")

    # Erst ab einer Größenordnung ein Fehler, sonst nur Hinweis:
    # der Altbestand ist bekannt, siehe docs/SICHERHEIT.md.
    if loose_script:
        warnings.append(
            f"{len(loose_script)} Seiten mit script-src 'unsafe-inline': "
            + ", ".join(loose_script)
        )
    if loose_style:
        warnings.append(
            f"{len(loose_style)} Seiten mit style-src 'unsafe-inline': "
            + ", ".join(loose_style)
        )
    if inline_page_scripts:
        listing = ", ".join(f"{k} ({v})" for k, v in sorted(inline_page_scripts.items()))
        warnings.append("Inline-Skripte im HTML (Sprachstart o. ä.): " + listing)

    for page in pages:
        text = open(page, encoding="utf-8", errors="replace").read()
        for tag in HREF_RE.findall(text):
            if "noopener" not in tag.lower() and "noreferrer" not in tag.lower():
                errors.append(f'target="_blank" ohne rel="noopener" in {rel(page)}')
                break

    for path in js_files:
        text = open(path, encoding="utf-8", errors="replace").read()
        name = rel(path)
        for m in EVAL_RE.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            errors.append(f"{name}:{line} eval/Function/document.write")
        for m in INNER_HTML_RE.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            warnings.append(f"{name}:{line} innerHTML mit Interpolation")
        for m in SECRET_RE.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            errors.append(f"{name}:{line} möglicher Secret-Wert im Code")

    # sitemap: jede URL muss eine Datei sein
    if scope is not None:
        missing = [u for u in sorted(scope) if not os.path.exists(os.path.join(ROOT, u))]
        if missing:
            errors.append("sitemap.xml zeigt auf fehlende Dateien: " + ", ".join(missing))

    # security.txt: Pflichtfelder nach RFC 9116
    sec = os.path.join(ROOT, ".well-known", "security.txt")
    if os.path.exists(sec):
        body = open(sec, encoding="utf-8").read()
        for field in ("Contact:", "Expires:"):
            if field not in body:
                errors.append(f"security.txt ohne {field}")
        facts["security_txt"] = True
    else:
        errors.append(".well-known/security.txt fehlt")
        facts["security_txt"] = False

    return errors, warnings, facts


def main():
    errors, warnings, facts = audit()

    if "--json" in sys.argv:
        print(json.dumps({"facts": facts, "errors": errors, "warnings": warnings}, indent=2))
        return 1 if errors else 0

    print("Sicherheits-Audit — Bytewerk Studio")
    print("=" * 58)
    print(f"Seiten: {facts['html_pages']}   JS-Dateien: {facts['js_files']}   "
          f"security.txt: {'ja' if facts['security_txt'] else 'nein'}")
    print()
    print(f"Seiten im Scope ................ {facts['in_scope_pages']}")
    print(f"Seiten ohne CSP ................ {facts['pages_without_csp']}")
    print(f"davon ohne unsafe-inline ....... {facts['strict_pages']}")
    print(f"script-src mit unsafe-inline ... {facts['pages_script_unsafe_inline']}")
    print(f"style-src mit unsafe-inline .... {facts['pages_style_unsafe_inline']}")
    print(f"Inline-Skripte im HTML ......... {facts['inline_scripts']}")
    print(f"style-Attribute im HTML ........ {facts['style_attributes']}")
    print(f"Fremde Skripte ................. {facts['external_scripts']}")
    if facts.get("pages_outside_scope"):
        print(f"Seiten außerhalb der sitemap ... {facts['pages_outside_scope']} (nicht bewertet)")
    print()

    if errors:
        print(f"FEHLER ({len(errors)})")
        for item in errors:
            print("  ✗ " + item)
        print()
    if warnings:
        print(f"HINWEISE ({len(warnings)})")
        for item in warnings:
            print("  · " + item)
        print()

    if not errors:
        print("Ergebnis: keine Fehler.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
