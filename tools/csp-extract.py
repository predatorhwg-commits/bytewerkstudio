#!/usr/bin/env python3
"""CSP-Codemod für die Bytewerk-Website.

1. Der Inline-Sprachstart im <head> wird zu <script src="bootstrap.js">.
2. Jedes weitere Inline-Skript wandert nach js/inline/<seite>-<n>.js.
3. Die Meta-CSP wird auf script-src 'self' gekürzt; Fremdschriften entfallen.
4. Seiten ohne lokale Schriften bekommen fonts/fonts.css.

Aufruf:  python3 tools/csp-extract.py [--write]
Ohne --write nur Bericht (dry run).
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
WRITE = "--write" in sys.argv
PAGES = sorted(p for p in ROOT.glob("*.html") if not p.name.startswith("google"))
OUT = ROOT / "js" / "inline"

BOOTSTRAP = re.compile(
    r'<script>document\.documentElement\.classList\.add\(\'js\'\);var L=localStorage\.getItem\(\'bw-lang\'\);if\(L\)document\.documentElement\.lang=L;</script>'
)
CSP = re.compile(r'(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(">)')
SCRIPT = re.compile(r'<script([^>]*)>(.*?)</script>', re.S)
FONT_LINKS = (
    '<link rel="preload" href="fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>\n'
    '<link rel="preload" href="fonts/newsreader-latin.woff2" as="font" type="font/woff2" crossorigin>\n'
    '<link rel="stylesheet" href="fonts/fonts.css">'
)

report = {"bootstrap": 0, "extracted": 0, "skipped": [], "csp": 0, "fonts": 0, "files": []}

for page in PAGES:
    src = page.read_text(encoding="utf-8")
    original = src
    stem = page.stem

    # 1. Sprachstart
    if BOOTSTRAP.search(src):
        src = BOOTSTRAP.sub('<script src="bootstrap.js"></script>', src, count=1)
        report["bootstrap"] += 1

    # 2. Inline-Skripte einsammeln (JSON-LD bleibt, weil es kein Code ist)
    index = 0

    def repl(match):
        global index
        attrs, body = match.group(1), match.group(2)
        if "src=" in attrs:
            return match.group(0)
        if re.search(r'type="application/ld\+json"', attrs):
            return match.group(0)
        if not body.strip():
            return match.group(0)
        index += 1
        name = f"{stem}-{index}.js"
        target = OUT / name
        report["files"].append(str(target.relative_to(ROOT)))
        report["extracted"] += 1
        if WRITE:
            OUT.mkdir(parents=True, exist_ok=True)
            target.write_text(body.strip() + "\n", encoding="utf-8")
        keep = re.sub(r'\s(type|defer|async)="[^"]*"', "", attrs).strip()
        extra = attrs.strip()
        keep = extra if extra else ""
        return f'<script{(" " + keep) if keep else ""} src="js/inline/{name}"></script>'

    src = SCRIPT.sub(repl, src)

    # 3. CSP straffen
    def tighten(m):
        policy = m.group(2)
        if "script-src 'self'" not in policy or "'unsafe-inline'" in policy.split("script-src")[1].split(";")[0]:
            policy = re.sub(r"script-src[^;]*", "script-src 'self'", policy)
        policy = policy.replace("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "style-src 'self' 'unsafe-inline'")
        policy = policy.replace("font-src https://fonts.gstatic.com", "font-src 'self'")
        if policy != m.group(2):
            report["csp"] += 1
        return m.group(1) + policy + m.group(3)
    src = CSP.sub(tighten, src)

    # 4. Fremde Schrift-Hosts und lokale Schriften
    src = src.replace('<link rel="preconnect" href="https://fonts.googleapis.com">\n', "")
    src = src.replace('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n', "")
    if "fonts/fonts.css" not in src:
        src = src.replace('<link rel="stylesheet" href="styles.css">', FONT_LINKS + '\n<link rel="stylesheet" href="styles.css">', 1)
        report["fonts"] += 1

    if "fonts.googleapis.com" in src or "fonts.gstatic.com" in src:
        report["skipped"].append(page.name)

    if WRITE and src != original:
        page.write_text(src, encoding="utf-8")

print(("GESCHRIEBEN" if WRITE else "DRY RUN"))
print(f"Sprachstart ersetzt: {report['bootstrap']}")
print(f"Inline-Skripte extrahiert: {report['extracted']}")
print(f"CSP gestrafft: {report['csp']} Seiten")
print(f"Lokale Schriften ergänzt: {report['fonts']} Seiten")
if report["skipped"]:
    print("Noch fremde Schrift-Hosts:", ", ".join(report["skipped"]))
print("Dateien:")
for f in report["files"]:
    print(" ", f)
