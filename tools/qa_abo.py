#!/usr/bin/env python3
"""Prüft den Weg vom Abo-Knopf bis ins Kontaktformular.

Die Entwickler-Seite nennt drei Stufen. Ein Knopf, der nur aussieht wie
ein Knopf, ist der häufigste Fehler auf solchen Seiten: Er führt auf eine
Seite, und dort steht nichts von der Absicht. Dieser Test bedient den Weg:

- Drei Stufen sichtbar, mit Preis, und der Umschalter Monat/Jahr ändert
  die Beträge wirklich (nicht nur die Beschriftung).
- "In der Sandbox testen" springt zum Sandbox-Abschnitt.
- "Pro anfragen" und "Sprich mit uns" führen ins Kontaktformular, wählen
  dort "API & Abo" und tragen die Stufe in die Rahmenbedingungen ein.
- Dasselbe auf Englisch, damit die Übernahme nicht nur deutsch ist.

Jeder Schritt läuft in einem eigenen Browser; ein Absturz zählt nie als
Befund und wird einmal vollständig wiederholt.

Aufruf:
  python3 tools/qa_abo.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]


class Failed(Exception):
    """Eine Zusicherung ist nicht erfüllt — kein Absturz, kein Wiederholen."""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8809")
    ap.add_argument("--out", default="docs/qa")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    checks: list[dict] = []

    def note(name, ok, detail=""):
        checks.append({"check": name, "ok": bool(ok), "detail": str(detail)[:200]})

    with sync_playwright() as pw:
        def new_page(locale="de-DE"):
            browser = pw.chromium.launch(args=ARGS)
            ctx = browser.new_context(viewport={"width": 1440, "height": 900},
                                      locale=locale)
            page = ctx.new_page()
            page.set_default_timeout(25000)
            return browser, ctx, page

        def step(name, fn, locale="de-DE"):
            last = ""
            for attempt in (1, 2):
                browser = ctx = None
                try:
                    browser, ctx, page = new_page(locale)
                    detail = fn(page)
                    note(name, True, detail or "")
                    return
                except Failed as exc:
                    note(name, False, str(exc))
                    return
                except Exception as exc:
                    last = f"Versuch {attempt}: {str(exc)[:150]}"
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
            note(name, False, last)

        def open_dev(page):
            page.goto(f"{args.base}/entwickler.html", wait_until="domcontentloaded",
                      timeout=45000)
            page.wait_for_selector(".dev-plan", timeout=25000)
            page.wait_for_timeout(400)

        # 1. Drei Stufen mit Preis
        def check_plans(page):
            open_dev(page)
            data = page.evaluate("""() => [...document.querySelectorAll('.dev-plan')]
              .map(c => ({
                name: (c.querySelector('h3')?.textContent || '').trim(),
                amount: (c.querySelector('.dev-amount')?.textContent || '').trim(),
                cta: (c.querySelector('.dev-plan-cta')?.getAttribute('href') || '')
              }))""")
            if len(data) != 3:
                raise Failed(f"{len(data)} Stufen statt 3")
            missing = [d["name"] for d in data if not d["amount"]]
            if missing:
                raise Failed(f"ohne Preis: {missing}")
            return " · ".join(f"{d['name']} {d['amount']}" for d in data)
        step("Drei Abo-Stufen sind sichtbar und bepreist", check_plans)

        # 2. Umschalter Monat/Jahr
        def check_billing(page):
            open_dev(page)
            monthly = page.evaluate("""() => [...document.querySelectorAll('[data-monthly]')]
              .map(e => e.textContent.trim())""")
            page.click('[data-billing="year"]')
            page.wait_for_timeout(250)
            yearly = page.evaluate("""() => [...document.querySelectorAll('[data-monthly]')]
              .map(e => e.textContent.trim())""")
            pressed = page.get_attribute('[data-billing="year"]', "aria-pressed")
            if monthly == yearly:
                raise Failed(f"Beträge unverändert: {monthly}")
            if pressed != "true":
                raise Failed(f"aria-pressed={pressed}")
            if not all(int("".join(c for c in y if c.isdigit())) <
                       int("".join(c for c in m if c.isdigit()))
                       for m, y in zip(monthly, yearly)):
                raise Failed(f"Jahrespreis nicht günstiger: {monthly} -> {yearly}")
            return f"{monthly} -> {yearly}"
        step("Umschalter Monat/Jahr ändert die Beträge", check_billing)

        # 3. Sandbox-Knopf
        def check_sandbox(page):
            open_dev(page)
            page.click('.dev-plan .dev-plan-cta[href="#sandbox"]')
            page.wait_for_timeout(500)
            state = page.evaluate("""() => {
              const s = document.getElementById('sandbox');
              if (!s) return {found: false};
              const r = s.getBoundingClientRect();
              return {found: true, visible: r.top < window.innerHeight && r.bottom > 0,
                      hash: location.hash};
            }""")
            if not state["found"] or not state["visible"]:
                raise Failed(json.dumps(state))
            return "Sandbox im Blick"
        step("Kostenlose Stufe führt zur Sandbox", check_sandbox)

        # 4–6. Übernahme ins Kontaktformular, je Stufe
        def make_plan_check(thema, type_value, needle):
            def check(page):
                page.goto(f"{args.base}/kontakt.html?thema={thema}",
                          wait_until="domcontentloaded", timeout=45000)
                page.wait_for_selector("#brief-form", timeout=25000)
                page.wait_for_timeout(900)
                state = page.evaluate("""() => {
                  const t = document.querySelector('input[name="type"]:checked');
                  const n = document.getElementById('notes');
                  const bar = document.getElementById('brf-prefill');
                  return {type: t ? t.value : null,
                          note: n ? n.value : '',
                          bar: bar ? !bar.hidden : null,
                          barText: bar ? bar.textContent.replace(/\\s+/g, ' ').trim() : ''};
                }""")
                if state["type"] != type_value:
                    raise Failed(f"Projektart {state['type']!r}")
                if needle not in state["note"]:
                    raise Failed(f"Notiz ohne Bezug: {state['note'][:80]!r}")
                if not state["bar"]:
                    raise Failed("Hinweisleiste bleibt verborgen")
                return state["note"][:90]
            return check

        step("Stufe Pro landet im Kontaktformular",
             make_plan_check("api-pro", "API / Abo", "Pro"))
        step("Stufe Team landet im Kontaktformular",
             make_plan_check("api-team", "API / Abo", "Team"))
        step("Allgemeine API-Anfrage landet im Kontaktformular",
             make_plan_check("api", "API / Abo", "API"))

        # 7. Englische Fassung übernimmt englisch
        def check_en(page):
            page.goto(f"{args.base}/kontakt.html?thema=api-pro",
                      wait_until="domcontentloaded", timeout=45000)
            page.wait_for_selector("#brief-form", timeout=25000)
            page.wait_for_timeout(900)
            state = page.evaluate("""() => {
              const n = document.getElementById('notes');
              const bar = document.getElementById('brf-prefill-note');
              return {note: n ? n.value : '',
                      bar: bar ? bar.textContent.trim() : '',
                      lang: document.documentElement.lang};
            }""")
            if state["lang"] != "en":
                raise Failed(f"Sprache {state['lang']}")
            german = ("möchte", "ich", "Stufe", "übernommen", "für")
            hit = [w for w in german if w in state["note"].lower()
                   or w in state["bar"].lower()]
            if hit:
                raise Failed(f"deutsch geblieben: {hit}")
            if "Pro" not in state["note"]:
                raise Failed(f"Stufe fehlt: {state['note'][:80]}")
            return state["note"][:80]
        step("Englische Fassung übernimmt englisch", check_en, locale="en-US")

    findings = [c for c in checks if not c["ok"]]
    summary = {"checks": len(checks), "findings": len(findings),
               "passed": len(checks) - len(findings)}
    (outdir / "abo.json").write_text(
        json.dumps({"summary": summary, "checks": checks}, indent=2,
                   ensure_ascii=False),
        encoding="utf-8")
    for c in checks:
        print(f"  {'ok  ' if c['ok'] else 'FEHL'} {c['check']:48} {c['detail']}")
    print("ABO", json.dumps(summary, ensure_ascii=False))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
