#!/usr/bin/env python3
"""Prüft das Forum als Funktion, nicht als Seite.

Ein Screenshot zeigt, dass etwas aussieht. Hier wird bedient:

- Liste, Suche (Treffer und leerer Zustand), Sortierung, Kategoriefilter.
- Gast ohne Konto: „Thema eröffnen" führt zur Anmeldung statt zum Dialog.
- Konto anlegen, Thread veröffentlichen, Detailseite, Antwort schreiben —
  jeweils mit Neuladen geprüft, damit nicht nur der Speicher im Tab zählt.

Jeder Prüfschritt läuft in einem eigenen Browser. Stürzt der Renderer ab
(unter Last sporadisch), wird der Schritt einmal vollständig wiederholt;
ein Absturz zählt nie als Befund.

Aufruf:
  python3 -m http.server 8809 --bind 127.0.0.1 &
  python3 tools/qa_forum.py --base http://127.0.0.1:8809
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))

ARGS = [
    "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage", "--mute-audio", "--no-first-run",
]

TITLE = "Testthread aus der Prüfung"
BODY = ("Dieser Beitrag wird automatisch angelegt, um das Forum zu prüfen. "
        "Er liegt nur im Speicher dieses Browsers.")
REPLY = "Antwort aus der Prüfung: Der Thread nimmt Beiträge an."


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
        def new_page(viewport=(1440, 900)):
            browser = pw.chromium.launch(args=ARGS)
            ctx = browser.new_context(viewport={"width": viewport[0],
                                                "height": viewport[1]},
                                      locale="de-DE")
            page = ctx.new_page()
            page.set_default_timeout(25000)
            return browser, ctx, page

        def open_forum(page):
            page.goto(f"{args.base}/forum.html", wait_until="domcontentloaded",
                      timeout=45000)
            page.wait_for_selector(".fm-item", timeout=25000)
            page.wait_for_timeout(400)

        def step(name, fn):
            """Ein Schritt in frischem Browser, bei Absturz einmal wiederholt."""
            last = ""
            for attempt in (1, 2):
                browser = ctx = None
                try:
                    browser, ctx, page = new_page()
                    detail = fn(page)
                    note(name, True, detail or "")
                    return
                except Failed as exc:
                    note(name, False, str(exc))
                    return
                except Exception as exc:  # Absturz, Timeout, geschlossene Seite
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

        # 1. Grundzustand
        def check_list(page):
            open_forum(page)
            n = page.evaluate("() => document.querySelectorAll('.fm-item').length")
            if n < 5:
                raise Failed(f"nur {n} Threads sichtbar")
            return f"{n} Threads"
        step("Liste zeigt die vorhandenen Threads", check_list)

        # 2. Suche filtert
        def check_search(page):
            open_forum(page)
            total = page.evaluate("() => document.querySelectorAll('.fm-item').length")
            first = page.eval_on_selector(
                ".fm-item-title", "el => (el.textContent || '').trim()")
            word = next((w.strip('.,:;!?') for w in first.split()
                         if len(w.strip('.,:;!?')) >= 5), first)
            page.fill("[data-fm-search]", word)
            page.wait_for_timeout(500)
            hits = page.evaluate("() => document.querySelectorAll('.fm-item').length")
            if hits < 1:
                raise Failed(f"'{word}' ergab keinen Treffer")
            if hits >= total:
                raise Failed(f"'{word}' filtert nicht ({hits} von {total})")
            return f"'{word}': {hits} von {total}"
        step("Suche schränkt die Liste ein", check_search)

        # 3. Suche ohne Treffer
        def check_empty(page):
            open_forum(page)
            page.fill("[data-fm-search]", "zzzqqqunsinnzzz")
            page.wait_for_timeout(600)
            state = page.evaluate("""() => {
              const box = document.getElementById('fm-empty');
              return {
                hidden: box ? box.hidden : null,
                shown: box ? !!(box.offsetWidth || box.offsetHeight) : false,
                items: document.querySelectorAll('.fm-item').length
              };
            }""")
            if state["items"] != 0 or not state["shown"]:
                raise Failed(json.dumps(state))
            return "leerer Zustand sichtbar, 0 Einträge"
        step("Suche ohne Treffer zeigt den leeren Zustand", check_empty)

        # 4. Sortierung
        def check_sort(page):
            open_forum(page)
            before = page.evaluate(
                "() => [...document.querySelectorAll('.fm-item-title')]"
                ".map(e => (e.textContent || '').trim())")
            changed = None
            for mode in ("unanswered", "active", "latest"):
                page.click(f'[data-fm-sort="{mode}"]')
                page.wait_for_timeout(500)
                after = page.evaluate(
                    "() => [...document.querySelectorAll('.fm-item-title')]"
                    ".map(e => (e.textContent || '').trim())")
                if after != before:
                    changed = mode
                    break
            if not changed:
                raise Failed("keine Sortierung änderte die Reihenfolge")
            return f"gewechselt über '{changed}'"
        step("Sortierung ändert die Reihenfolge", check_sort)

        # 5. Kategoriefilter
        def check_cat(page):
            open_forum(page)
            total = page.evaluate("() => document.querySelectorAll('.fm-item').length")
            page.evaluate("""() => {
              const chips = [...document.querySelectorAll('.fm-cat')];
              const hit = chips.find(c => !c.classList.contains('is-on'));
              if (hit) hit.click();
            }""")
            page.wait_for_timeout(600)
            state = page.evaluate("""() => {
              const on = document.querySelector('.fm-cat.is-on');
              return {label: on ? (on.textContent || '').trim().slice(0, 40) : null,
                      items: document.querySelectorAll('.fm-item').length};
            }""")
            if not state["label"] or state["label"].startswith("Alle"):
                raise Failed(json.dumps(state, ensure_ascii=False))
            if state["items"] < 1 or state["items"] > total:
                raise Failed(json.dumps(state, ensure_ascii=False))
            return f"{state['label']}: {state['items']} von {total}"
        step("Kategoriefilter wirkt", check_cat)

        # 6. Gast wird zur Anmeldung geführt
        def check_guest(page):
            open_forum(page)
            page.evaluate("() => document.querySelector('[data-fm-new]').click()")
            page.wait_for_timeout(1700)
            state = page.evaluate("""() => {
              const d = document.getElementById('fm-composer');
              return {open: d ? d.hasAttribute('open') : null,
                      dialog: d ? d.open : null,
                      url: location.pathname};
            }""")
            if state["open"] or state["dialog"]:
                raise Failed("Dialog öffnete sich ohne Konto")
            if "login" not in state["url"]:
                raise Failed(f"keine Weiterleitung zur Anmeldung: {state['url']}")
            return "Weiterleitung zu login.html"
        step("Thema eröffnen verlangt ein Konto", check_guest)

        # 7–9. Konto, Thread, Antwort — ein Zusammenhang, ein Browser.
        def account_flow(page):
            email = f"pruefung-{int(time.time())}-{os.getpid()}@example.com"
            password = "Pruefung-2026!x"
            page.goto(f"{args.base}/register.html", wait_until="domcontentloaded",
                      timeout=45000)
            page.fill("#name", "Prüfung")
            page.fill("#email", email)
            page.fill("#password", password)
            page.fill("#confirm", password)
            page.check("#terms")
            page.click("#reg-submit")
            page.wait_for_timeout(2500)
            if "register" in page.url:
                err = page.evaluate("""() => {
                  const e = document.querySelector('.auth-error, [role=alert]');
                  return e ? (e.textContent || '').trim().slice(0, 120) : '';
                }""")
                raise Failed(f"Registrierung blieb auf register.html: {err}")

            page.goto(f"{args.base}/forum.html", wait_until="domcontentloaded",
                      timeout=45000)
            page.wait_for_selector(".fm-item", timeout=25000)
            page.wait_for_timeout(500)
            page.click("[data-fm-new]")
            page.wait_for_selector("#fm-f-title", state="visible", timeout=10000)
            page.fill("#fm-f-title", TITLE)
            page.fill("#fm-f-body", BODY)
            page.wait_for_timeout(200)
            page.click("#fm-f-submit")
            page.wait_for_timeout(1600)

            state = page.evaluate(
                "() => ({url: location.hash, body: document.body.textContent || ''})")
            if "#/t/" not in state["url"]:
                err = page.evaluate("""() => {
                  const e = document.getElementById('fm-form-error');
                  return e && !e.hidden ? (e.textContent || '').trim() : '';
                }""")
                raise Failed(f"kein Thread angelegt: {err or state['url']}")
            if TITLE not in state["body"]:
                raise Failed("Detailseite zeigt den Titel nicht")

            # Neuladen: der Thread muss aus dem Speicher kommen, nicht aus dem DOM.
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
            if TITLE not in (page.evaluate("() => document.body.textContent || ''")):
                raise Failed("Thread ist nach dem Neuladen weg")
            note("Thread anlegen speichert dauerhaft", True, page.url.split("/")[-1])

            # Antwort schreiben — nur mit Konto möglich. Zwischen zwei
            # Beiträgen liegen laut forum.js 20 Sekunden Sperre; die wird
            # erst geprüft (sie muss greifen), dann abgewartet.
            page.wait_for_selector("#fm-reply-form textarea", timeout=15000)
            page.fill("#fm-reply-form textarea", REPLY)
            page.click("#fm-reply-form button[type=submit]")
            page.wait_for_timeout(700)
            blocked = page.evaluate("""() => {
              const e = document.querySelector('#fm-reply-form .fm-form-error');
              return e && !e.hidden ? (e.textContent || '').trim() : '';
            }""")
            if not blocked:
                raise Failed("Sofortantwort wurde nicht gebremst")
            note("Antwort direkt nach dem Thema wird gebremst", True,
                 blocked[:80])

            page.wait_for_timeout(21000)
            page.fill("#fm-reply-form textarea", REPLY)
            page.click("#fm-reply-form button[type=submit]")
            page.wait_for_timeout(1200)
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
            body = page.evaluate("() => document.body.textContent || ''")
            if REPLY not in body:
                raise Failed("Antwort fehlt nach dem Neuladen")
            return "Antwort nach Neuladen vorhanden"
        step("Konto, Thread und Antwort funktionieren", account_flow)

    findings = [c for c in checks if not c["ok"]]
    summary = {"checks": len(checks), "findings": len(findings),
               "passed": len(checks) - len(findings)}
    (outdir / "forum.json").write_text(
        json.dumps({"summary": summary, "checks": checks}, indent=2,
                   ensure_ascii=False),
        encoding="utf-8")
    for c in checks:
        print(f"  {'ok  ' if c['ok'] else 'FEHL'} {c['check']:44} {c['detail']}")
    print("FORUM", json.dumps(summary, ensure_ascii=False))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
