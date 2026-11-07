"""Ersatz fuer build/build.js (kein node im PATH).

Erzeugt neon-horde/dist/index.html: alle src/*.js inline, boot.css inline.
Haelt sich an dieselbe Reihenfolge und dieselbe Split-Logik wie das
Original, damit sich beide Builds nicht auseinanderbewegen.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
ORDER = [
    "loader.js", "balance.js", "api.js", "lang.js",
    "audio.js", "input.js", "save.js", "meta.js",
    "entities.js", "weapons.js", "waves.js", "shop.js",
    "ui.js", "game.js", "main.js",
]

html = (ROOT / "index.html").read_text(encoding="utf-8")
missing = []

chunks = []
for name in ORDER:
    p = SRC / name
    if not p.exists():
        missing.append(name)
        continue
    code = p.read_text(encoding="utf-8")
    chunks.append(f"/* ==== src/{name} ({len(code.encode('utf-8')) / 1024:.1f} KB) ==== */\n{code}\n")
scripts = "\n".join(chunks)

stripped = re.sub(r'<script src="src/[^"]+"></script>\s*', "", html)

boot_css = (ROOT / "boot.css").read_text(encoding="utf-8")
stripped = re.sub(r'[ \t]*<link rel="stylesheet" href="boot\.css">\n', "", stripped)
stripped = stripped.replace("</head>", "  <style>\n" + boot_css + "  </style>\n</head>", 1)

parts = stripped.split("</body>")
single = parts[0] + "  <script>\n" + scripts + "\n  </script>\n</body>" + "</body>".join(parts[1:])

if "$all(sel)" not in single:
    raise SystemExit("BUILD-FEHLER: NH.dom.$all fehlt im Output")
if 'href="boot.css"' in single:
    raise SystemExit("BUILD-FEHLER: boot.css ist noch extern verlinkt")

# CSP fuer die Einzeldatei: statt 'unsafe-inline' bekommt genau dieser
# <style>- und <script>-Block einen SHA-256-Hash.
import base64
import hashlib

def sha(text):
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return "'sha256-" + base64.b64encode(digest).decode("ascii") + "'"

style_body = re.search(r"<style>([\s\S]*?)</style>", single).group(1)
script_body = re.search(r"<script>([\s\S]*?)</script>", single).group(1)
single = re.sub(r"style-src [^;]*;", "style-src " + sha(style_body) + ";", single, count=1)
single = re.sub(r"script-src [^;]*;", "script-src " + sha(script_body) + ";", single, count=1)

out_dir = ROOT / "dist"
out_dir.mkdir(exist_ok=True)
(out_dir / "index.html").write_text(single, encoding="utf-8")

kb = len(single.encode("utf-8")) / 1024
print(f"OK: dist/index.html ({kb:.1f} KB)" + (f" — FEHLEND: {', '.join(missing)}" if missing else ""))
