"""Ersetzt style-Attribute in HTML durch Utility-Klassen (CSP ohne unsafe-inline).

Arbeitet attributweise: der komplette Tag wird mit einem Regex in Attribute
zerlegt, style entfernt und die Klasse ergaenzt. Attribute bleiben in ihrer
Reihenfolge und Schreibweise erhalten.

Das Skript macht drei Schritte, damit ein Lauf den Endzustand herstellt:
  1. style-Attribute durch Utility-Klassen ersetzen
  2. styles-util.css einbinden (nach dem letzten Stylesheet)
  3. CSP auf style-src 'self' verschaerfen
"""
import glob
import html.parser
import re
import sys

MAP = {
    "padding-top:0": "u-pt-0",
    "position:relative": "u-rel",
    "color:var(--accent-300);position:relative": "u-c-accent u-rel",
    "margin-bottom:34px": "u-mb-34",
    "margin-bottom:18px": "u-mb-18",
    "margin-top:30px": "u-mt-30",
    "padding-bottom:clamp(72px,11vw,140px)": "u-pb-cta",
    "max-width:54ch": "u-max-54",
    "margin-top:22px": "u-mt-22",
    "font-size:clamp(38px,5vw,68px);margin-top:18px": "u-display-68 u-mt-18",
    "margin-top:18px": "u-mt-18",
    "display:flex;gap:10px;flex-wrap:wrap": "u-row-10",
    "color:var(--muted);font-style:normal": "u-muted-normal",
    "max-width:58ch": "u-max-58",
    "max-width:56ch": "u-max-56",
    "max-width:52ch": "u-max-52",
    "max-width:48ch": "u-max-48",
    "max-width:340px": "u-max-340",
    "margin-top:20px": "u-mt-20",
    "margin-top:16px": "u-mt-16",
    "margin-bottom:44px": "u-mb-44",
    "font-size:clamp(38px,5.8vw,74px);margin-top:18px": "u-display-74 u-mt-18",
    "font-size:15px": "u-fs-15",
    "display:flex;gap:14px;flex-wrap:wrap;position:relative": "u-row-14 u-rel",
    "padding:24px": "u-p-24",
    "padding-top:clamp(48px,7vw,80px)": "u-pt-48",
    "max-width:52ch;position:relative": "u-max-52 u-rel",
    "max-width:48ch;position:relative": "u-max-48 u-rel",
    "margin:0;font-size:12.5px;color:var(--faint)": "u-note-sm",
    "margin:0": "u-m-0",
    "margin-top:40px;font-family:var(--mono);font-size:13px;color:var(--faint)": "u-mt-40 u-mono-13",
    "margin-top:36px": "u-mt-36",
    "margin-top:28px": "u-mt-28",
    "margin-top:18px;font-family:var(--mono);font-size:11.5px;color:var(--faint)": "u-mt-18 u-mono-11",
    "margin-left:auto;background:none;border:0;color:var(--accent-700);cursor:pointer": "u-crumb-btn",
    "margin-bottom:clamp(40px,6vw,72px)": "u-mb-head",
    "margin-bottom:30px": "u-mb-30",
    "font-size:22px": "u-fs-22",
    "font-family:var(--mono);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--faint)": "u-eyebrow-mono",
    "font-family:var(--body);font-size:13.5px;letter-spacing:0": "u-checkline",
    "display:flex;gap:12px;flex-wrap:wrap;position:relative": "u-row-12 u-rel",
    "color:var(--accent-700);position:relative": "u-c-accent-700 u-rel",
    "background:var(--paper-2);border-bottom:1px solid var(--line)": "u-subband",
}

TAG = re.compile(r"<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]*))?)*)(\s*/?)>")
ATTR = re.compile(r"(\s+)([^\s=>/]+)(?:(\s*=\s*)(\"[^\"]*\"|'[^']*'|[^\s>]*))?")
SCRIPT = re.compile(r"(<script\b[^>]*>.*?</script>)", re.S | re.I)


class AttrCounter(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.total = 0

    def handle_starttag(self, tag, attrs):
        self.total += len(attrs)

    handle_startendtag = handle_starttag


def count_attrs(src):
    c = AttrCounter()
    c.feed(src)
    return c.total


def rewrite_tags(part, stats):
    def repl(m):
        tag, attrs, tail = m.group(1), m.group(2), m.group(3)
        slots = []
        class_idx = None
        style_val = None

        for am in ATTR.finditer(attrs):
            space, name, eq, val = am.groups()
            if name.lower() == "style":
                style_val = (val or "").strip("\"'")
                continue
            if name.lower() == "class":
                class_idx = len(slots)
            slots.append([space, name, eq, val])

        if style_val is None:
            return m.group(0)

        if style_val.startswith("--i:"):
            stats["index"] += 1
            new_class = ""
        else:
            new_class = MAP.get(style_val)
            if new_class is None:
                raise SystemExit(f"UNBEKANNTES STYLE: {style_val!r} in <{tag}>")
            stats["mapped"] += 1

        if class_idx is not None:
            space, name, eq, val = slots[class_idx]
            quote = val[0] if val and val[0] in "\"'" else '"'
            cur = (val or "").strip("\"'")
            merged = (cur + " " + new_class).strip() if new_class else cur
            slots[class_idx] = [space, name, eq or "=", f"{quote}{merged}{quote}"]
        elif new_class:
            # Tag hatte keine class: Attribut vorne anhaengen
            slots.insert(0, [" ", "class", "=", f'"{new_class}"'])

        out = [f"<{tag}"]
        for space, name, eq, val in slots:
            if eq is None:
                out.append(f"{space}{name}")
            else:
                out.append(f"{space}{name}{eq}{val}")
        out.append(tail)
        out.append(">")
        return "".join(out)

    return TAG.sub(repl, part)


stats = {"mapped": 0, "index": 0, "csp": 0, "linked": 0}

for p in sorted(glob.glob("*.html")):
    src = open(p, encoding="utf-8").read()
    orig = src
    before_attrs = count_attrs(src)

    # 1) Styles ersetzen, Skriptbloecke auslassen
    parts = SCRIPT.split(src)
    for i, part in enumerate(parts):
        if i % 2 == 0:  # gerade Indizes sind Markup
            parts[i] = rewrite_tags(part, stats)
    src = "".join(parts)

    # 2) CSP verschaerfen
    if "style-src 'self' 'unsafe-inline'" in src:
        src = src.replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")
        stats["csp"] += 1

    # 3) Utility-Stylesheet einbinden, falls Klassen genutzt werden
    uses_u = re.search(r'class="[^"]*\bu-[a-z]', src) is not None
    if uses_u and "styles-util.css" not in src:
        links = list(re.finditer(r'[ \t]*<link rel="stylesheet" href="[^"]+">\n', src))
        if not links:
            raise SystemExit(f"KEIN STYLESHEET-LINK in {p}")
        last = links[-1]
        indent = re.match(r"[ \t]*", last.group(0)).group(0)
        src = src[: last.end()] + f'{indent}<link rel="stylesheet" href="styles-util.css">\n' + src[last.end():]
        stats["linked"] += 1

    if src != orig:
        after_attrs = count_attrs(src)
        removed = before_attrs - after_attrs
        # Jedes entfernte style-Attribut erklaert genau eine Differenz,
        # die neue class kommt hinzu, wenn vorher keine da war.
        print(f"  {p:44} Attribute {before_attrs} -> {after_attrs}")
        open(p, "w", encoding="utf-8").write(src)

print(f"\n{stats['mapped']} Styles auf Klassen abgebildet, {stats['index']} --i entfernt")
print(f"CSP verschaerft: {stats['csp']} Dateien, Utility-Link ergaenzt: {stats['linked']}")

rest = sum(len(re.findall(r"\sstyle=\"", open(p, encoding="utf-8").read())) for p in glob.glob("*.html"))
print("verbleibende style-Attribute:", rest)
