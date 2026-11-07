#!/usr/bin/env python3
"""Funktionstest der Startseite und der wichtigsten Interaktionen.

Prüft Suche (Strg+K), FAQ-Akkordeon, Sprachumschaltung, mobiles Menü,
Formular-Methoden, Kontakt-Validierung und Shop-Filter.
Aufruf: python3 tools/qa-flow.py [base-url]
"""
from playwright.sync_api import sync_playwright
import json, sys

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8907").rstrip("/")
results = []


def check(name, ok, detail=""):
    results.append({"test": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (" — " + str(detail) if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-gpu"])

    # ---------- Desktop ----------
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, locale="de-DE")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:120]))
    page.goto(BASE + "/", wait_until="load")
    page.wait_for_timeout(400)

    page.keyboard.press("Control+k")
    page.wait_for_timeout(250)
    check("Suche öffnet mit Strg+K", page.locator(".bw-cmd.open").count() == 1)
    page.locator(".bw-cmd input").fill("shop")
    page.wait_for_timeout(250)
    hits = page.locator(".bw-cmd-item").count()
    check("Suche findet Treffer", hits > 0, f"{hits} Treffer")
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    check("Suche schließt mit Esc", page.locator(".bw-cmd.open").count() == 0)

    details = page.locator(".st-faq-list details")
    check("FAQ hat 6 Fragen", details.count() == 6, details.count())
    details.first.scroll_into_view_if_needed()
    details.nth(0).locator("summary").click()
    page.wait_for_timeout(250)
    check("FAQ öffnet erste Frage", details.nth(0).get_attribute("open") is not None)
    details.nth(1).locator("summary").click()
    page.wait_for_timeout(300)
    check("FAQ schließt die andere Frage",
          details.nth(0).get_attribute("open") is None and details.nth(1).get_attribute("open") is not None)

    page.locator('[data-lang-btn="en"]').first.click()
    page.wait_for_timeout(350)
    check("EN schaltet Fließtext", "We build software" in page.locator(".st-lead").first.inner_text())
    check("EN setzt html lang", page.evaluate("document.documentElement.lang") == "en")
    page.locator('[data-lang-btn="de"]').first.click()
    page.wait_for_timeout(350)
    check("DE schaltet zurück", "Wir entwickeln Software" in page.locator(".st-lead").first.inner_text())

    # Frisch laden, damit der Startpunkt der Tab-Reihenfolge am Dokumentanfang liegt
    page.goto(BASE + "/", wait_until="load")
    page.wait_for_timeout(300)
    page.keyboard.press("Tab")
    page.wait_for_timeout(120)
    first_tab = page.evaluate("()=>({tag:document.activeElement.tagName,txt:(document.activeElement.textContent||'').trim().slice(0,24)})")
    check("Erster Tab trifft den Skip-Link", first_tab["txt"].startswith("Zum Inhalt"), first_tab)

    page.locator('a[href="#arbeiten"]').first.click()
    page.wait_for_timeout(700)
    y = page.evaluate("window.scrollY")
    check("Anker #arbeiten scrollt", y > 500, f"scrollY={y}")
    check("Keine JS-Fehler auf der Startseite", not errors, errors[:2])
    page.close()

    # ---------- Mobil ----------
    mobile = browser.new_page(viewport={"width": 390, "height": 844}, locale="de-DE",
                              is_mobile=True, has_touch=True)
    mobile.goto(BASE + "/", wait_until="load")
    mobile.wait_for_timeout(400)
    mobile.locator(".nav-toggle").click()
    mobile.wait_for_timeout(300)
    check("Mobiles Menü öffnet", mobile.locator(".mobile-menu.open").count() == 1)
    check("Mobiles Menü ist sichtbar", mobile.locator(".mobile-menu.open a").first.is_visible())
    small = mobile.evaluate("""()=>[...document.querySelectorAll('.mobile-menu.open a')]
      .filter(a=>{const r=a.getBoundingClientRect();return r.height>0&&r.height<44})
      .map(a=>({t:a.textContent.trim().slice(0,20),h:Math.round(a.getBoundingClientRect().height)}))""")
    check("Menüpunkte sind mindestens 44 px hoch", not small, small[:3])
    mobile.keyboard.press("Escape")
    mobile.wait_for_timeout(300)
    check("Mobiles Menü schließt mit Esc", mobile.locator(".mobile-menu.open").count() == 0)
    mobile.close()

    # ---------- Formulare ----------
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, locale="de-DE")
    page.goto(BASE + "/login.html", wait_until="load")
    page.locator("#login-form button[type=submit]").click()
    page.wait_for_timeout(300)
    check("Login zeigt Validierung", page.locator(".auth-alert.show").count() == 1)
    check("Login-Formular nutzt POST",
          page.evaluate("document.getElementById('login-form').method") == "post")

    page.goto(BASE + "/kontakt.html", wait_until="load")
    check("Kontaktformular nutzt POST",
          page.evaluate("document.getElementById('contact-form').method") == "post")
    page.locator("#contact-form button[type=submit]").click()
    page.wait_for_timeout(300)
    check("Kontakt validiert Pflichtfelder", page.locator("#contact-form :invalid").count() > 0)

    page.goto(BASE + "/shop.html", wait_until="load")
    page.wait_for_timeout(300)
    cards = page.locator(".shop-page-grid .prod")
    before = cards.count()
    chips = page.locator(".shop-filter .chip, .shop-filters .chip")
    if chips.count() > 1:
        chips.nth(1).click()
        page.wait_for_timeout(500)
        after = page.locator(".shop-page-grid .prod:not(.hide)").count()
        check("Shop-Filter reagiert", after != before, f"{before} → {after}")
    else:
        check("Shop-Filter vorhanden", False, "keine Filter-Chips gefunden")
    page.close()
    browser.close()

failed = [r for r in results if not r["ok"]]
print(f"\n{len(results) - len(failed)}/{len(results)} Tests bestanden")
open("tools/qa-flow.json", "w").write(json.dumps(results, indent=2, ensure_ascii=False))
sys.exit(1 if failed else 0)
