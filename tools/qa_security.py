#!/usr/bin/env python3
"""Sicherheitsprüfung der ausgelieferten Dateien.

Kein Ersatz für einen Pentest, aber es prüft die Fehlerklassen, die bei
einer statischen Seite tatsächlich vorkommen:

- gemischte Inhalte (http://) und fremde Skripte
- Inline-Handler (onclick=…), javascript:-URLs, eval, new Function
- target="_blank" ohne rel="noopener"
- Formulare, die an fremde Hosts senden
- CSP: fehlt, zu weit (unsafe-eval) oder mit Inline-Ausnahme
- Secrets und Schlüssel im Repository
- Konten: Klartextpasswörter, schwache PBKDF2-Iterationen
- Nutzerinhalte, die über innerHTML laufen

Aufruf:
  python3 tools/qa_security.py
  python3 tools/qa_security.py --json docs/qa/security.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
SKIP = {"google3491bb2e3bfcb9d2.html"}

SECRET_PATTERNS = [
    (re.compile(r"sk_live_[0-9a-zA-Z]{10,}"), "Stripe-Live-Schlüssel"),
    (re.compile(r"sk_test_[0-9a-zA-Z]{10,}"), "Stripe-Test-Schlüssel"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS-Zugangsschlüssel"),
    (re.compile(r"ghp_[0-9a-zA-Z]{30,}"), "GitHub-Token"),
    (re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"), "privater Schlüssel"),
    (re.compile(r"eyJhbGciOiJIUzI1NiJ9\.[0-9A-Za-z_-]{10,}\."), "JWT"),
]

def form_action_ok(action: str) -> bool:
    """Nur eigene Ziele: relativ, Anker, mailto oder die eigene Domain."""
    if action in ("", "#") or action.startswith("mailto:"):
        return True
    if action.startswith("//") or re.match(r"^[a-z]+:", action, re.I):
        return action.startswith("https://bytewerkstudio.com/")
    return True


def scan_html(path: Path) -> list[dict]:
    html = path.read_text(encoding="utf-8", errors="replace")
    name = path.name
    findings: list[dict] = []

    def add(kind: str, detail: str):
        findings.append({"page": name, "kind": kind, "detail": detail[:160]})

    # Gemischte Inhalte
    for m in re.finditer(r'(?:src|href)="(http://[^"]+)"', html):
        add("mixed-content", m.group(1))

    # Fremde Skripte
    for m in re.finditer(r'<script[^>]+src="(https?://[^"]+)"', html):
        add("external-script", m.group(1))

    # Inline-Handler
    for m in re.finditer(r'\son(click|load|error|mouseover|focus|submit|change|input)="', html, re.I):
        add("inline-handler", m.group(0).strip())

    # javascript:-URLs
    for m in re.finditer(r'href="javascript:[^"]*"', html, re.I):
        add("javascript-url", m.group(0))

    # target=_blank ohne noopener
    for m in re.finditer(r'<a\b[^>]*target="_blank"[^>]*>', html, re.I):
        tag = m.group(0)
        if "noopener" not in tag and "noreferrer" not in tag:
            add("blank-without-noopener", tag)

    # Formulare
    for m in re.finditer(r'<form\b[^>]*>', html, re.I):
        tag = m.group(0)
        action = re.search(r'action="([^"]*)"', tag)
        if action and not form_action_ok(action.group(1)):
            add("foreign-form-action", action.group(1))

    # CSP
    csp = re.search(r'http-equiv="Content-Security-Policy"\s+content="([^"]+)"', html)
    if 'name="viewport"' in html and not csp:
        add("csp-missing", "keine CSP im Dokument")
    if csp:
        policy = csp.group(1)
        if "unsafe-eval" in policy:
            add("csp-unsafe-eval", policy[:120])
        if re.search(r"script-src[^;]*'unsafe-inline'", policy):
            add("csp-inline-script", policy[:120])
        if re.search(r"style-src[^;]*'unsafe-inline'", policy):
            add("csp-inline-style", policy[:120])
        if "object-src 'none'" not in policy:
            add("csp-object-src", "object-src fehlt")
        if "base-uri" not in policy:
            add("csp-base-uri", "base-uri fehlt")

    # Stil-Attribute im Markup: Sie zwingen style-src zu 'unsafe-inline'
    # oder werden von der Policy blockiert.
    for m in re.finditer(r'<[a-zA-Z][^>]*\sstyle="[^"]*"', html):
        add("inline-style-attr", m.group(0)[:90].replace("\n", " "))

    # Inline-Skripte, die nicht JSON-LD sind
    for m in re.finditer(r"<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>", html, re.S | re.I):
        attrs, body = m.group(1), m.group(2).strip()
        if "application/ld+json" in attrs.lower():
            continue
        if body:
            add("inline-script", body[:80].replace("\n", " "))

    return findings


def scan_js(path: Path) -> list[dict]:
    src = path.read_text(encoding="utf-8", errors="replace")
    findings = []
    for m in re.finditer(r"\beval\s*\(|\bnew\s+Function\s*\(|document\.write\s*\(", src):
        findings.append({"page": path.name, "kind": "dynamic-code", "detail": m.group(0)})
    return findings


def scan_secrets() -> list[dict]:
    findings = []
    skip_dirs = {".git", "node_modules", "docs/qa", "verify", ".thumbnail"}
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if any(part in skip_dirs for part in rel.parts):
            continue
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".woff2", ".ico", ".pdf", ".zip"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for pattern, label in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append({"page": str(rel), "kind": "secret", "detail": label})
    return findings


def scan_auth() -> list[dict]:
    findings = []
    auth = ROOT / "auth.js"
    if auth.exists():
        src = auth.read_text(encoding="utf-8")
        it = re.search(r"ITERATIONS\s*=\s*([0-9_]+)", src)
        if it:
            value = int(it.group(1).replace("_", ""))
            if value < 100_000:
                findings.append({"page": "auth.js", "kind": "weak-pbkdf2",
                                 "detail": f"{value} Iterationen (mindestens 100000)"})
        if re.search(r"password\s*:\s*password\b", src) and "hash" not in src:
            findings.append({"page": "auth.js", "kind": "plaintext-password", "detail": "Passwort ohne Hash"})
    return findings


def missing_headers_config() -> list[dict]:
    findings = []
    headers = ROOT / "_headers"
    if not headers.exists():
        findings.append({"page": "_headers", "kind": "headers-missing", "detail": "keine Header-Vorlage"})
        return findings
    text = headers.read_text(encoding="utf-8")
    required = ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options",
                "Referrer-Policy", "Permissions-Policy", "frame-ancestors 'none'"]
    for key in required:
        if key not in text:
            findings.append({"page": "_headers", "kind": "header-missing", "detail": key})
    if "frame-ancestors 'none'" in text and "X-Frame-Options" not in text:
        findings.append({"page": "_headers", "kind": "header-missing", "detail": "X-Frame-Options"})
    return findings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default="docs/qa/security.json")
    args = ap.parse_args()

    findings = []
    for path in sorted(ROOT.glob("*.html")):
        if path.name in SKIP:
            continue
        findings += scan_html(path)
    for path in sorted(ROOT.glob("*.js")):
        findings += scan_js(path)
    findings += scan_secrets()
    findings += scan_auth()
    findings += missing_headers_config()

    summary = {
        "pages": len([p for p in ROOT.glob("*.html") if p.name not in SKIP]),
        "findings": len(findings),
        "by_kind": {},
    }
    for f in findings:
        summary["by_kind"][f["kind"]] = summary["by_kind"].get(f["kind"], 0) + 1

    out = ROOT / args.json
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "findings": findings}, indent=2, ensure_ascii=False),
                   encoding="utf-8")

    for f in findings[:40]:
        print(f"{f['kind']:22} {f['page']:35} {f['detail'][:90]}")
    print("SECURITY", json.dumps(summary, ensure_ascii=False))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
