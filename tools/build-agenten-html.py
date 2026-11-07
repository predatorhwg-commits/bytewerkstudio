#!/usr/bin/env python3
"""Erzeugt docs/AGENTEN.html aus den echten Zweigen des Forks.

Quelle: git (origin/main als Basis), nicht aus dem Gedaechtnis.
Aufruf:  python3 tools/build-agenten-html.py
"""
import json
import subprocess
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True).stdout


def esc(value):
    return html.escape(str(value), quote=True)


def fmt(number):
    """1234 -> '1.234'. Nur die Zahl, nie der umgebende Text."""
    return f"{number:,}".replace(",", ".")


# ---------------------------------------------------------------- Daten sammeln

SKIP = {"main", "preview-live", "preview-gesamt"}

branches = [
    line.strip()[5:]
    for line in run("git", "branch", "-r", "--list", "fork/*").splitlines()
    if line.strip()
]

rows = []
for name in branches:
    if name in SKIP:
        continue
    ref = f"fork/{name}"
    count = run("git", "rev-list", "--count", f"origin/main..{ref}").strip()
    if not count or count == "0":
        continue

    status = [line for line in run("git", "diff", "--name-status", f"origin/main...{ref}").splitlines() if line]
    added = [line.split("\t", 1)[1] for line in status if line.startswith("A")]
    modified = [line.split("\t", 1)[1] for line in status if line.startswith("M")]
    deleted = [line.split("\t", 1)[1] for line in status if line.startswith("D")]

    short = run("git", "diff", "--shortstat", f"origin/main...{ref}").strip()
    ins = re.search(r"(\d+) insertion", short)
    dels = re.search(r"(\d+) deletion", short)

    last = run("git", "log", "-1", "--format=%ad|%an|%s", "--date=format:%H:%M", ref).strip().split("|", 2)
    first = run("git", "log", "--reverse", "--format=%ad", "--date=format:%H:%M", f"origin/main..{ref}").strip().splitlines()

    rows.append({
        "branch": name,
        "commits": int(count),
        "added": added,
        "modified": modified,
        "deleted": deleted,
        "insertions": int(ins.group(1)) if ins else 0,
        "deletions": int(dels.group(1)) if dels else 0,
        "last_time": last[0] if last else "",
        "last_author": last[1] if len(last) > 1 else "",
        "last_msg": last[2] if len(last) > 2 else "",
        "first_time": first[0] if first else "",
    })

rows.sort(key=lambda r: -r["insertions"])

# ---------------------------------------------------------------- Zuordnung

AGENTS = [
    {
        "id": "fable",
        "name": "Fable",
        "role": "Community, Forum, Abo, Sicherheit",
        "color": "#b04f31",
        "tint": "rgba(176,79,49,.09)",
        "branches": ["fable/community", "fable/qa-release", "fable/werkstatt", "fable/atelier", "fable/werkprobe", "fable-hero-fix"],
        "note": "Forum mit Entwickler-Abo, Sicherheits-Selbsttest, 3D-Ideenregal. Dazu Werkstatt, Studio-Werkbank, Musterbuch.",
    },
    {
        "id": "astra",
        "name": "Astra",
        "role": "API, Entwickler-Seite, 3D-Bühnen",
        "color": "#4f7a63",
        "tint": "rgba(79,122,99,.09)",
        "branches": ["astra/api", "astra/entwickler", "astra/papierregal", "astra/schriften", "astra/zeichenwerk", "astra/showroom", "astra/404", "astra/maquette", "astra/systembau"],
        "note": "Entwickler-API mit Sandbox, lokale Schriften, Social-Cards, Papierregal, Zeichenwerk, 404-Karteikasten.",
    },
    {
        "id": "kimi",
        "name": "Kimi",
        "role": "Integration, Sicherheit, Startseite",
        "color": "#4e5c78",
        "tint": "rgba(78,92,120,.09)",
        "branches": ["kimi/integration", "kimi/sicherheit", "kimi/schichtmodell", "kimi/projektbrief", "mittag/integration"],
        "note": "Sammel-Merge über neun Zweige, Sicherheitsseite mit Papier-Schloss, 3D-Schichtmodell, Projektbrief auf der Kontaktseite.",
    },
    {
        "id": "claude",
        "name": "Claude",
        "role": "Forum, Speicher-Schutz, Bauplan",
        "color": "#8a6a3f",
        "tint": "rgba(138,106,63,.09)",
        "branches": ["claude/forum", "claude/storage-guard", "claude/bauplan", "claude/werkprobe", "claude/probierstand", "claude/werkkorb"],
        "note": "Eigenständiger Forum-Entwurf, Speicher-Schutz gegen blockiertes localStorage, Bauplan-Seite.",
    },
    {
        "id": "integration",
        "name": "Bytewerk Integration",
        "role": "Zusammenführung",
        "color": "#6a5a7a",
        "tint": "rgba(106,90,122,.09)",
        "branches": ["integ/final"],
        "note": "Der breiteste Zweig: 124 Dateien, alles zusammen. Hat aktuell Konflikte mit main.",
    },
]

by_branch = {row["branch"]: row for row in rows}
assigned = {b for agent in AGENTS for b in agent["branches"]}
unassigned = [row for row in rows if row["branch"] not in assigned]

# ---------------------------------------------------------------- Konflikt-Karte

HOT = ["components.js", "sitemap.xml", "index.html", "README.md", "AGENTS.md", "styles-claude.css", "styles.css", "main.js", "ui-v4.js"]

hot_map = {}
for name in HOT:
    owners = []
    for row in rows:
        if name in row["added"] or name in row["modified"] or name in row["deleted"]:
            owners.append(row["branch"])
    if owners:
        hot_map[name] = owners

hot_sorted = sorted(hot_map.items(), key=lambda item: -len(item[1]))
hot_max = max((len(v) for v in hot_map.values()), default=1)

# ---------------------------------------------------------------- Seite bauen

total_commits = sum(r["commits"] for r in rows)
total_ins = sum(r["insertions"] for r in rows)
total_del = sum(r["deletions"] for r in rows)
total_files = len({f for r in rows for f in r["added"] + r["modified"] + r["deleted"]})

PAGE_TITLE = "Wer baut was — Bytewerk Studio"


def file_chips(row, limit=6):
    files = row["added"] + row["modified"]
    shown = files[:limit]
    rest = len(files) - len(shown)
    chips = "".join(
        f'<li class="chip{" is-mod" if f in row["modified"] else ""}">{esc(f)}</li>' for f in shown
    )
    if rest > 0:
        chips += f'<li class="chip is-more">+{rest} weitere</li>'
    return f'<ul class="chips">{chips}</ul>'


def branch_card(row):
    return f"""
      <article class="branch">
        <header class="branch-head">
          <code class="branch-name">{esc(row['branch'])}</code>
          <span class="branch-time">{esc(row['last_time'])}</span>
        </header>
        <p class="branch-msg">{esc(row['last_msg'])}</p>
        {file_chips(row)}
        <footer class="branch-foot">
          <span><b>{row['commits']}</b> Commits</span>
          <span class="plus">+{fmt(row['insertions'])}</span>
          <span class="minus">−{fmt(row['deletions'])}</span>
          <span>{len(row['added'])} neu</span>
        </footer>
      </article>"""


def agent_section(agent):
    cards = "".join(branch_card(by_branch[b]) for b in agent["branches"] if b in by_branch)
    live = [b for b in agent["branches"] if b in by_branch]
    commits = sum(by_branch[b]["commits"] for b in live)
    ins = sum(by_branch[b]["insertions"] for b in live)
    return f"""
    <section class="agent" id="{agent['id']}" style="--ac:{agent['color']};--tint:{agent['tint']}">
      <header class="agent-head">
        <span class="dot" aria-hidden="true"></span>
        <div>
          <h3>{esc(agent['name'])}</h3>
          <p class="agent-role">{esc(agent['role'])}</p>
        </div>
        <div class="agent-nums">
          <b>{len(live)}</b> Zweige · <b>{commits}</b> Commits · <b>+{fmt(ins)}</b>
        </div>
      </header>
      <p class="agent-note">{esc(agent['note'])}</p>
      <div class="branch-grid">{cards}</div>
    </section>"""


agent_html = "\n".join(agent_section(a) for a in AGENTS)

hot_html = "\n".join(
    f"""
      <li class="hot">
        <code>{esc(name)}</code>
        <span class="hot-bar"><i style="width:{max(6, round(len(owners) / hot_max * 100))}%"></i></span>
        <b>{len(owners)}</b>
        <span class="hot-owners">{esc(', '.join(o.split('/')[-1] for o in owners))}</span>
      </li>"""
    for name, owners in hot_sorted
)

unassigned_html = ""
if unassigned:
    chips = "".join(f'<li class="chip">{esc(r["branch"])} <span>{r["commits"]} c</span></li>' for r in unassigned)
    unassigned_html = f"""
    <section class="sec">
      <h2>Ohne feste Zuordnung</h2>
      <p class="lead">Kleine Zweige, die keinem der fünf Bereiche oben zugeordnet sind.</p>
      <ul class="chips">{chips}</ul>
    </section>"""

# Zeitachse: letzte Aktivitaet je Stunde
hours = {}
for row in rows:
    hour = row["last_time"].split(":")[0]
    hours.setdefault(hour, []).append(row["branch"])

timeline = "\n".join(
    f"""
      <li>
        <span class="tl-hour">{esc(hour)}:00</span>
        <span class="tl-bar"><i style="width:{round(len(names) / max(len(v) for v in hours.values()) * 100)}%"></i></span>
        <span class="tl-names">{esc(', '.join(sorted(n.split('/')[-1] for n in names)))}</span>
      </li>"""
    for hour, names in sorted(hours.items())
)

html_doc = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>{esc(PAGE_TITLE)}</title>
<meta name="description" content="Wer an der Bytewerk-Website was baut: Zweige, Dateien, Überschneidungen und Reihenfolge der Zusammenführung. Aus den echten Git-Daten erzeugt.">
<style>
  :root {{
    --paper: #faf9f5;
    --paper-2: #f4f1e8;
    --surface: #ffffff;
    --ink: #1f1e1d;
    --muted: #6b665c;
    --faint: #918b7e;
    --line: #e6e1d4;
    --line-2: #d8d2c1;
    --accent: #b04f31;
    --accent-700: #96402a;
    --sage: #4f7a63;
    --display: 'Newsreader', Georgia, 'Times New Roman', serif;
    --body: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace;
    --pad: clamp(20px, 5vw, 48px);
  }}
  * {{ box-sizing: border-box; }}
  html {{ -webkit-text-size-adjust: 100%; }}
  body {{
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: var(--body); font-size: 16px; line-height: 1.6;
    font-synthesis-weight: none;
  }}
  .wrap {{ width: 100%; max-width: 1120px; margin: 0 auto; padding-inline: var(--pad); }}
  header.top {{
    padding-block: clamp(44px, 7vw, 88px);
    border-bottom: 1px solid var(--line);
    background:
      radial-gradient(90% 120% at 100% 0%, rgba(176,79,49,.06), transparent 55%),
      radial-gradient(80% 100% at 0% 100%, rgba(79,122,99,.05), transparent 60%);
  }}
  .eyebrow {{
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--mono); font-size: 11px; letter-spacing: .09em;
    text-transform: uppercase; color: var(--accent-700); margin-bottom: 18px;
  }}
  .eyebrow::before {{
    content: ""; width: 7px; height: 7px; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 0 3px rgba(176,79,49,.12);
  }}
  h1 {{
    font-family: var(--display); font-weight: 500;
    font-size: clamp(38px, 7vw, 72px); line-height: 1.02;
    letter-spacing: -.02em; margin: 0 0 18px; text-wrap: balance;
  }}
  h1 em {{ font-style: italic; color: var(--accent-700); }}
  .lead {{ font-size: clamp(16px, 2vw, 19px); color: var(--muted); max-width: 62ch; margin: 0; }}
  .stats {{
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1px; margin-top: clamp(32px, 5vw, 52px);
    background: var(--line); border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
  }}
  .stat {{ background: var(--surface); padding: 20px 22px; }}
  .stat b {{ display: block; font-family: var(--display); font-size: clamp(26px, 3.6vw, 36px); font-weight: 500; line-height: 1.1; }}
  .stat span {{ display: block; margin-top: 4px; font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }}
  main {{ padding-block: clamp(44px, 6vw, 76px); }}
  .sec + .sec {{ margin-top: clamp(44px, 6vw, 76px); }}
  h2 {{
    font-family: var(--display); font-weight: 500; letter-spacing: -.01em;
    font-size: clamp(26px, 3.4vw, 36px); line-height: 1.15; margin: 0 0 10px;
  }}
  .sec > .lead {{ margin-bottom: 26px; }}

  /* Konflikt-Karte */
  .hot-list {{ list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }}
  .hot {{
    display: grid; grid-template-columns: minmax(120px, 170px) minmax(80px, 1fr) 34px;
    align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line);
  }}
  .hot code {{ font-family: var(--mono); font-size: 12.5px; color: var(--ink); overflow-wrap: anywhere; }}
  .hot-bar {{ height: 8px; border-radius: 99px; background: var(--paper-2); overflow: hidden; }}
  .hot-bar i {{ display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent), #c96a4b); }}
  .hot b {{ font-family: var(--mono); font-size: 12px; color: var(--accent-700); text-align: right; }}
  .hot-owners {{
    grid-column: 1 / -1; font-family: var(--mono); font-size: 10.5px;
    color: var(--faint); line-height: 1.5; overflow-wrap: anywhere;
  }}
  .callout {{
    margin-top: 22px; padding: 18px 20px; border: 1px solid var(--line-2);
    border-left: 3px solid var(--accent); border-radius: 0 12px 12px 0;
    background: var(--surface); color: var(--muted); font-size: 14.5px;
  }}
  .callout b {{ color: var(--ink); }}

  /* Agenten */
  .agent {{
    margin-top: 18px; padding: clamp(20px, 3vw, 30px);
    border: 1px solid var(--line); border-radius: 18px; background: var(--surface);
    box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 18px 40px -34px rgba(31,30,29,.4);
  }}
  .agent + .agent {{ margin-top: 16px; }}
  .agent-head {{ display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }}
  .agent-head .dot {{
    width: 11px; height: 11px; border-radius: 50%; background: var(--ac);
    margin-top: 8px; flex: 0 0 auto; box-shadow: 0 0 0 4px var(--tint);
  }}
  .agent-head h3 {{ font-family: var(--display); font-size: 23px; font-weight: 600; margin: 0; line-height: 1.2; }}
  .agent-role {{ margin: 2px 0 0; font-size: 13.5px; color: var(--muted); }}
  .agent-nums {{
    margin-left: auto; font-family: var(--mono); font-size: 10.5px;
    letter-spacing: .04em; color: var(--faint); text-align: right;
  }}
  .agent-nums b {{ color: var(--ac); font-weight: 600; }}
  .agent-note {{ margin: 14px 0 18px; font-size: 14px; color: var(--muted); max-width: 74ch; }}
  .branch-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }}
  .branch {{
    border: 1px solid var(--line); border-radius: 12px; background: var(--paper);
    padding: 13px 14px; display: flex; flex-direction: column; gap: 8px;
  }}
  .branch-head {{ display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }}
  .branch-name {{ font-family: var(--mono); font-size: 11.5px; color: var(--ac); font-weight: 600; overflow-wrap: anywhere; }}
  .branch-time {{ font-family: var(--mono); font-size: 10px; color: var(--faint); }}
  .branch-msg {{ margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--ink); }}
  .chips {{ list-style: none; display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; }}
  .chip {{
    font-family: var(--mono); font-size: 9.5px; letter-spacing: .01em;
    padding: 3px 6px; border-radius: 5px; color: var(--muted);
    background: var(--paper-2); border: 1px solid var(--line); overflow-wrap: anywhere;
  }}
  .chip.is-mod {{ background: #fff; border-color: var(--line-2); }}
  .chip.is-more {{ color: var(--faint); background: transparent; border-style: dashed; }}
  .chip span {{ color: var(--faint); }}
  .branch-foot {{
    display: flex; flex-wrap: wrap; gap: 10px; margin-top: auto; padding-top: 8px;
    border-top: 1px dashed var(--line-2);
    font-family: var(--mono); font-size: 10px; color: var(--faint);
  }}
  .branch-foot b {{ color: var(--ink); font-weight: 600; }}
  .branch-foot .plus {{ color: var(--sage); }}
  .branch-foot .minus {{ color: var(--accent-700); }}

  /* Reihenfolge */
  .steps {{ list-style: none; margin: 0; padding: 0; counter-reset: s; }}
  .steps li {{
    position: relative; padding: 0 0 22px 46px; counter-increment: s;
    border-left: 1px solid var(--line-2); margin-left: 15px;
  }}
  .steps li:last-child {{ border-left-color: transparent; padding-bottom: 0; }}
  .steps li::before {{
    content: counter(s); position: absolute; left: -15px; top: -2px;
    width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
    background: var(--surface); border: 1px solid var(--line-2);
    font-family: var(--mono); font-size: 12px; color: var(--accent-700);
  }}
  .steps h3 {{ margin: 4px 0 4px; font-size: 15.5px; font-weight: 600; }}
  .steps p {{ margin: 0; font-size: 14px; color: var(--muted); max-width: 70ch; }}
  .steps code {{ font-family: var(--mono); font-size: 12px; background: var(--paper-2); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }}

  /* Zeitachse */
  .tl {{ list-style: none; margin: 0; padding: 0; }}
  .tl li {{
    display: grid; grid-template-columns: 56px minmax(60px, 160px) 1fr;
    align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line);
  }}
  .tl-hour {{ font-family: var(--mono); font-size: 11px; color: var(--faint); }}
  .tl-bar {{ height: 6px; border-radius: 99px; background: var(--paper-2); overflow: hidden; }}
  .tl-bar i {{ display: block; height: 100%; border-radius: 99px; background: var(--sage); }}
  .tl-names {{ font-family: var(--mono); font-size: 10.5px; color: var(--muted); overflow-wrap: anywhere; }}

  .note {{
    margin-top: 34px; padding: 20px 22px; border: 1px solid var(--line);
    border-radius: 14px; background: var(--paper-2); font-size: 13.5px; color: var(--muted);
  }}
  .note b {{ color: var(--ink); }}
  footer {{
    border-top: 1px solid var(--line); padding-block: 30px;
    font-family: var(--mono); font-size: 10.5px; letter-spacing: .04em;
    text-transform: uppercase; color: var(--faint);
  }}
  footer .wrap {{ display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; }}

  @media (max-width: 700px) {{
    .hot {{ grid-template-columns: minmax(0, 1fr) 40px; }}
    .hot-bar {{ grid-column: 1 / -1; order: 3; }}
    .hot b {{ grid-row: 1; grid-column: 2; }}
    .agent-nums {{ margin-left: 0; text-align: left; width: 100%; }}
    .tl li {{ grid-template-columns: 46px 1fr; }}
    .tl-bar {{ display: none; }}
  }}
  @media (prefers-reduced-motion: reduce) {{
    * {{ animation: none !important; transition: none !important; }}
  }}
  @media print {{
    body {{ background: #fff; }}
    .agent, .stat {{ box-shadow: none; break-inside: avoid; }}
    header.top {{ padding-block: 24px; }}
  }}
</style>
</head>
<body>

<header class="top">
  <div class="wrap">
    <span class="eyebrow">Bytewerk Studio · Agenten-Brett</span>
    <h1>Wer baut <em>was.</em></h1>
    <p class="lead">Ein Brett statt vier Chatverläufe: welcher Agent welche Seite baut, welche Dateien
      dazugehören und wo sich die Zweige in die Quere kommen. Zahlen direkt aus Git,
      Basis <code>main</code> — nichts geschätzt.</p>
    <div class="stats">
      <div class="stat"><b>{len(rows)}</b><span>aktive Zweige</span></div>
      <div class="stat"><b>{total_commits}</b><span>Commits</span></div>
      <div class="stat"><b>{total_files}</b><span>berührte Dateien</span></div>
      <div class="stat"><b>+{total_ins:,}</b><span>Zeilen neu</span></div>
      <div class="stat"><b>−{total_del:,}</b><span>Zeilen entfernt</span></div>
    </div>
  </div>
</header>

<main class="wrap">

  <section class="sec" id="konflikte">
    <h2>Wo es kracht</h2>
    <p class="lead">Diese Dateien werden von mehreren Agenten gleichzeitig geändert. Jeder zusätzliche
      Bearbeiter ist ein zusätzlicher Konflikt beim Zusammenführen — hier entscheidet sich,
      wie teuer der Merge wird.</p>
    <ul class="hot-list">{hot_html}</ul>
    <p class="callout"><b>Die Engstelle ist die Navigation.</b> <code>components.js</code> trägt Kopf-
      und Fußzeile für alle Seiten. Wer dort einen Link ergänzt, muss gegen alle anderen
      Ergänzungen mergen. Deshalb gibt es am Ende genau <b>einen</b> Eintrag pro Seite —
      nicht einen pro Agent.</p>
  </section>

  <section class="sec" id="bereiche">
    <h2>Die Bereiche</h2>
    <p class="lead">Fünf Bereiche, nach Zuständigkeit sortiert. Jeder Zweig zeigt seinen letzten
      Commit, die wichtigsten Dateien und seine Größe.</p>
    {agent_html}
  </section>
  {unassigned_html}

  <section class="sec" id="reihenfolge">
    <h2>In welcher Reihenfolge</h2>
    <p class="lead">21 Zweige einzeln zu mergen ist der teuerste Weg. Ein Integrationszweig,
      dann die Sonderfälle — so bleibt jeder Schritt prüfbar.</p>
    <ol class="steps">
      <li>
        <h3>Einen Integrationszweig wählen</h3>
        <p><code>fable/qa-release</code> oder <code>integ/final</code> als Basis nehmen — nicht
          beide. Sie enthalten bereits den Großteil der Seiten; alles andere wird darauf gelegt.</p>
      </li>
      <li>
        <h3>Community einhängen</h3>
        <p><code>fable/community</code> bringt Forum, Entwickler-Abo, Sicherheits-Selbsttest und
          das 3D-Ideenregal mit. Konflikt in genau drei Dateien: <code>components.js</code>,
          <code>sitemap.xml</code>, <code>README.md</code>. Auflösung: ein Eintrag
          <b>Community</b>, <code>forum.html</code> bleibt als Seite erreichbar.</p>
      </li>
      <li>
        <h3>Doppelte Foren entscheiden</h3>
        <p><code>community.html</code> (Forum + Abo + Sicherheit) und <code>forum.html</code>
          (nur Forum) decken dieselbe Aufgabe ab. Eines davon ins Menü, das andere per
          <code>canonical</code> auf das erste zeigen lassen — sonst konkurrieren zwei Seiten
          um dieselben Suchbegriffe.</p>
      </li>
      <li>
        <h3>Prüfen, dann nach main</h3>
        <p>1440 und 390 px ohne Überlauf, 0 Konsolenfehler, <code>node --check</code> für jedes
          geänderte Skript, Anker und Doppel-IDs. Erst danach auf <code>main</code> — GitHub Pages
          veröffentlicht direkt, es gibt keinen Rückweg über einen Build.</p>
      </li>
    </ol>
  </section>

  <section class="sec" id="zeit">
    <h2>Wann gearbeitet wurde</h2>
    <p class="lead">Letzter Commit je Zweig, nach Stunde. Die Nacht war in Wellen aktiv —
      kurz vor sieben liefen die meisten Zweige gleichzeitig.</p>
    <ul class="tl">{timeline}</ul>
  </section>

  <p class="note"><b>Ehrlich gesagt:</b> Diese Seite beschreibt den Stand der Zweige, nicht den
    der Live-Seite. Auf <code>bytewerkstudio.com</code> ist davon noch nichts sichtbar, solange
    die Pull Requests offen sind — der vorhandene Zugang darf lesen, aber nicht schreiben.
    Die geprüfte Gesamtvorschau liegt unter
    <code>predatorhwg-commits.github.io/bytewerkstudio</code>.</p>

</main>

<footer>
  <div class="wrap">
    <span>Erzeugt aus Git · Basis main @ {esc(run('git', 'rev-parse', '--short', 'origin/main').strip())}</span>
    <span>{len(rows)} Zweige · {total_commits} Commits</span>
  </div>
</footer>

</body>
</html>
"""

out = ROOT / "docs" / "AGENTEN.html"
out.write_text(html_doc, encoding="utf-8")
print(f"geschrieben: {out}  ({len(html_doc):,} Zeichen)")
print(f"Zweige: {len(rows)}  Commits: {total_commits}  Dateien: {total_files}")
