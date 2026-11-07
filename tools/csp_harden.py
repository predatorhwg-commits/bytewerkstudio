#!/usr/bin/env python3
"""Verschärft die CSP auf allen Seiten (idempotent).

Ergänzt script-src-attr 'none', script-src-elem 'self', frame-src 'none'
und worker-src 'none'. Damit sind Inline-Handler auch dann blockiert, wenn
ein Browser die alte script-src-Regel anders auslegt, und es gibt keinen
Weg, Inhalte als Frame oder Worker nachzuladen.

Aufruf:
  python3 tools/csp_harden.py [--check]
"""
from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

ADDITIONS = "script-src-attr 'none'; script-src-elem 'self'; frame-src 'none'; worker-src 'none';"


def harden(policy: str) -> str:
    if "script-src-attr" in policy:
        return policy
    if "upgrade-insecure-requests" in policy:
        return policy.replace("upgrade-insecure-requests", ADDITIONS + " upgrade-insecure-requests")
    return policy.rstrip().rstrip(";") + "; " + ADDITIONS


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    changed = 0
    for path in sorted(ROOT.glob("*.html")):
        if path.name in SKIP:
            continue
        html = path.read_text(encoding="utf-8")
        m = re.search(r'(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(")', html)
        if not m:
            print(f"{path.name}: keine CSP")
            continue
        new_policy = harden(m.group(2))
        if new_policy != m.group(2):
            html = html[:m.start(2)] + new_policy + html[m.end(2):]
            changed += 1
            if not args.check:
                path.write_text(html, encoding="utf-8")
            print(f"{path.name}: verschärft")
    print(f"CSP {changed} Seiten geändert" + (" (Prüflauf)" if args.check else ""))
    return 1 if (args.check and changed) else 0


if __name__ == "__main__":
    raise SystemExit(main())
