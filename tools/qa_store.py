#!/usr/bin/env python3
"""Sammeldateien für Messungen: Teil-Läufe dürfen nichts wegwerfen.

Ein Lauf mit --only misst wenige Seiten. Würde er die Sammeldatei einfach
überschreiben, stünden im Bericht plötzlich nur noch diese Seiten — und
die Zahlen wären falsch, ohne dass es jemand merkt. Deshalb wird immer
zusammengeführt: neue Messung ersetzt den Eintrag derselben Seite,
alle anderen bleiben.

Aufruf im Werkzeug:

    from qa_store import merge_rows, write_report

    rows = merge_rows(outdir / "i18n.json", rows)
    summary = summarize(rows)
    write_report(outdir / "i18n.json", summary, rows)
"""
from __future__ import annotations

import json
from pathlib import Path


def load_rows(path: Path) -> list[dict]:
    """Vorhandene Zeilen lesen; eine kaputte Datei zählt als leer."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    rows = data.get("rows")
    return rows if isinstance(rows, list) else []


def merge_rows(path: Path, fresh: list[dict], key: str = "page") -> list[dict]:
    """Neue Zeilen über die alten legen, je Seite eine Zeile."""
    merged: dict[str, dict] = {}
    for row in load_rows(path):
        name = row.get(key)
        if name:
            merged[str(name)] = row
    for row in fresh:
        name = row.get(key)
        if name:
            merged[str(name)] = row
    return [merged[name] for name in sorted(merged)]


def write_report(path: Path, summary: dict, rows: list[dict]) -> None:
    path.write_text(
        json.dumps({"summary": summary, "rows": rows}, indent=2,
                   ensure_ascii=False),
        encoding="utf-8")
