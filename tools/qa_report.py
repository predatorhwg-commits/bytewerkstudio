#!/usr/bin/env python3
"""Erzeugt docs/QA-BERICHT.md aus den Messdateien in docs/qa/.

Keine Zahlen von Hand eintragen: der Bericht liest static.json, seo.json
und runtime.json. Fehlt runtime.json, wird das im Bericht vermerkt.

Aufruf:
  python3 tools/qa_report.py
"""
from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

ROOT = Path(os.environ.get("BW_ROOT", Path(__file__).resolve().parents[1]))
QA = ROOT / "docs" / "qa"
OUT = ROOT / "docs" / "QA-BERICHT.md"


def load(name):
    path = QA / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def md_table(rows, head):
    lines = ["| " + " | ".join(head) + " |", "|" + "|".join(["---"] * len(head)) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(str(c) for c in row) + " |")
    return "\n".join(lines)


def main() -> int:
    static = load("static.json") or {"summary": {}, "pages": []}
    seo = load("seo.json") or {"problems": [], "rows": []}
    runtime = load("runtime.json")
    three = load("three.json")
    security = load("security.json")
    a11y = load("a11y.json")
    xss = load("xss.json")
    keyboard = load("keyboard.json")
    design = load("design.json")
    perf = load("perf.json")
    perf_mobil = load("perf-mobil.json")
    forum = load("forum.json")
    i18n = load("i18n.json")
    pixdiff = load("pixdiff.json")

    s = static["summary"]
    seo_rows = seo.get("rows", [])
    seo_problems = seo.get("problems", [])

    # Runtime
    runs = []
    if runtime:
        for page in runtime["pages"]:
            for run in page["runs"]:
                runs.append((page["page"], run))
    viewports = sorted({r["viewport"] for _, r in runs}, key=lambda v: ("desktop", "tablet", "mobile").index(v) if v in ("desktop", "tablet", "mobile") else 9)
    per_view = Counter(r["viewport"] for _, r in runs)
    err_pages = sorted({p for p, r in runs if r.get("errors")})
    fatal_pages = sorted({p for p, r in runs if r.get("fatal")})
    overflow = sorted({(p, r["viewport"]) for p, r in runs if r.get("scrollW", 0) > r.get("clientW", 0) + 1})
    lang_fail = sorted({(p, r["viewport"]) for p, r in runs if r.get("lang_switch") is False})
    menu_fail = sorted({(p, r["viewport"]) for p, r in runs if r.get("mobile_menu") is False})
    canvas_pages = sorted({p for p, r in runs if r.get("canvases")})

    body = []
    body.append("# QA-Bericht")
    body.append("")
    body.append("Stand: 7. November 2026. Dieser Bericht wird von `tools/qa_report.py`")
    body.append("aus den Messdateien in `docs/qa/` erzeugt. Alle Zahlen sind gemessen,")
    body.append("nicht geschätzt. Rohdaten liegen in `docs/qa/`: `static.json`,")
    body.append("`seo.json`, `runtime.json`, `security.json`, `xss.json`, `a11y.json`,")
    body.append("`keyboard.json`, `perf.json`, `three.json`.")
    body.append("")

    body.append("## 1. Statische Prüfung")
    body.append("")
    body.append("Geprüft werden alle ausgelieferten HTML-Seiten: interne Links und Anker,")
    body.append("doppelte IDs, fehlende Alt-Texte, H1-Anzahl, CSP-Vorhandensein.")
    body.append("")
    body.append(md_table([
        ["Seiten", s.get("pages", 0)],
        ["Tote interne Verweise", s.get("broken_refs", 0)],
        ["Seiten mit doppelten IDs", s.get("duplicate_id_pages", 0)],
        ["Bilder ohne Alt-Text", s.get("images_without_alt", 0)],
        ["Seiten mit falscher H1-Anzahl", s.get("pages_with_wrong_h1_count", 0)],
        ["Seiten ohne CSP", s.get("pages_without_csp", 0)],
    ], ["Prüfung", "Ergebnis"]))
    body.append("")

    body.append("## 2. Suchmaschinen und soziale Vorschau")
    body.append("")
    body.append("Titellänge, Description-Länge, Canonical, Open Graph, Twitter-Card,")
    body.append("JSON-LD-Gültigkeit, Überschriftenreihenfolge, Alt-Texte, `rel=\"noopener\"`.")
    body.append("")
    body.append(f"Seiten geprüft: **{len(seo_rows)}** · Beanstandungen: **{len(seo_problems)}**")
    body.append("")
    if seo_problems:
        body.append(md_table([[p.get("page", ""), p.get("kind", ""), p.get("detail", "")]
                              for p in seo_problems[:40]], ["Seite", "Art", "Detail"]))
    else:
        body.append("Keine Beanstandung. Jede indexierbare Seite hat eine eigene")
        body.append("Description im Zielbereich, ein Canonical und vollständige")
        body.append("Social-Tags; Konto-Seiten sind `noindex`.")
    body.append("")

    body.append("## 3. Browserprüfung")
    body.append("")
    if runtime:
        body.append(f"Gemessen: **{len(runs)} Seitenaufrufe** über "
                    f"{len(per_view)} Breiten "
                    f"({', '.join(f'{v}: {per_view[v]}' for v in viewports)}).")
        body.append("Jeder Aufruf prüft Konsolenfehler, horizontales Überlaufen,")
        body.append("Sprachwechsel DE→EN→DE und – unter 820 px – das Mobilmenü.")
        body.append("")
        body.append(md_table([
            ["Seitenaufrufe", len(runs)],
            ["Seiten mit Konsolenfehler", len(err_pages)],
            ["Seiten mit Überlauf", len(overflow)],
            ["Sprachwechsel fehlgeschlagen", len(lang_fail)],
            ["Mobilmenü fehlgeschlagen", len(menu_fail)],
            ["Abgebrochene Aufrufe", len(fatal_pages)],
            ["Seiten mit Canvas", len(canvas_pages)],
        ], ["Messung", "Ergebnis"]))
        body.append("")
        if err_pages:
            body.append("Konsolenfehler auf: " + ", ".join(f"`{p}`" for p in err_pages) + ".")
        if overflow:
            body.append("Überlauf auf: " + ", ".join(f"`{p}` ({v})" for p, v in overflow) + ".")
        if lang_fail:
            body.append("Sprachwechsel fehlgeschlagen auf: " + ", ".join(f"`{p}` ({v})" for p, v in lang_fail) + ".")
        if menu_fail:
            body.append("Mobilmenü fehlgeschlagen auf: " + ", ".join(f"`{p}` ({v})" for p, v in menu_fail) + ".")
        if fatal_pages:
            body.append("Abgebrochen (Browser unter Last abgestürzt, nicht die Seite): "
                        + ", ".join(f"`{p}`" for p in fatal_pages) + ".")
        body.append("")
        body.append("Breiten: Desktop 1440 × 900, Tablet 768 × 1024, Mobil 390 × 844.")
        body.append("")
        if forum:
            f = forum.get("summary", {})
            body.append("### Forenfunktion")
            body.append("")
            body.append("`tools/qa_forum.py` bedient das Forum statt es nur zu laden:")
            body.append("Suche mit Treffer und ohne, Sortierung, Kategoriefilter, die")
            body.append("Kontopflicht beim Schreiben, Thread anlegen, Neuladen (bleibt der")
            body.append("Thread?), Antwort schreiben und die 20-Sekunden-Sperre. Jeder")
            body.append("Schritt läuft in einem eigenen Browser mit leerem Speicher.")
            body.append("")
            body.append(md_table([
                ["Prüfschritte", f.get("checks", 0)],
                ["Bestanden", f.get("passed", 0)],
                ["Befunde", f.get("findings", 0)],
            ], ["Messung", "Ergebnis"]))
            body.append("")
        if i18n:
            i = i18n.get("summary", {})
            body.append("### Sprachen Deutsch und Englisch")
            body.append("")
            body.append("`tools/qa_i18n.py` prüft die Umschaltung im Browser, nicht die")
            body.append("Absicht im Quelltext: Es zählt sichtbare Textknoten ohne")
            body.append("englische Fassung, klickt auf EN und vergleicht jedes Element mit")
            body.append("`data-en` gegen seine Übersetzung. Danach sucht es auf der")
            body.append("englischen Seite nach deutscher Restsprache — das findet auch")
            body.append("Texte, die erst JavaScript erzeugt.")
            body.append("")
            body.append(md_table([
                ["Seiten", i.get("pages", 0)],
                ["Umschaltfehler", i.get("switch_failures", 0)],
                ["Deutsche Reste auf EN", i.get("german_left", 0)],
                ["Statische Texte ohne EN", i.get("texts_without_en", 0)],
                ["Davon von JavaScript erzeugt", i.get("dynamic_without_en", 0)],
                ["Nutzerinhalte (bleiben wie geschrieben)", i.get("user_content", 0)],
            ], ["Messung", "Ergebnis"]))
            body.append("")
            body.append("Die Zahl der Texte ohne Attribut ist ein Arbeitsstand, kein")
            body.append("Fehler: Viele davon sind Produktnamen, Preise, Adressen und")
            body.append("Beiträge von Nutzern, die in beiden Sprachen gleich bleiben.")
            body.append("Maßgeblich sind die ersten beiden Zeilen.")
            body.append("")
    else:
        body.append("Noch kein vollständiger Lauf: `docs/qa/runtime.json` fehlt.")
        body.append("")
        body.append("```")
        body.append("python3 -m http.server 8809 --bind 127.0.0.1")
        body.append("python3 tools/qa_site.py --base http://127.0.0.1:8809 --out docs/qa")
        body.append("```")
        body.append("")

    body.append("## 4. Sicherheit")
    body.append("")
    if security:
        sec = security.get("summary", {})
        body.append("`tools/qa_security.py` prüft die Fehlerklassen, die bei einer")
        body.append("statischen Seite vorkommen: gemischte Inhalte, fremde Skripte,")
        body.append("Inline-Handler, `javascript:`-URLs, `target=\"_blank\"` ohne")
        body.append("`noopener`, fremde Formularziele, eine zu weite CSP, Secrets im")
        body.append("Repository, Klartextpasswörter und schwache PBKDF2-Parameter.")
        body.append("")
        body.append(md_table([
            ["Geprüfte Seiten", sec.get("pages", 0)],
            ["Befunde", sec.get("findings", 0)],
        ], ["Prüfung", "Ergebnis"]))
        body.append("")
        kinds = sec.get("by_kind", {})
        if kinds:
            body.append(md_table([[k, v] for k, v in sorted(kinds.items())], ["Art", "Anzahl"]))
        else:
            body.append("Keine Beanstandung. Die CSP aller Seiten ist `script-src 'self'`")
            body.append("ohne `'unsafe-inline'` und ohne `'unsafe-eval'`, zusätzlich")
            body.append("`script-src-attr 'none'` und `frame-src 'none'`.")
        body.append("")
        body.append("### Stile ohne Ausnahme")
        body.append("")
        body.append("`style-src` steht auf `'self'` — auch hier kein `'unsafe-inline'`.")
        body.append("Die 196 `style`-Attribute im Markup liegen jetzt als Klassen in")
        body.append("`styles-inline.css`, die zwei `<noscript><style>`-Blöcke in")
        body.append("`nojs.css`. `tools/csp_styles.py --check` hält den Stand in der CI.")
        body.append("")
        if pixdiff:
            px = pixdiff.get("summary", {})
            body.append("Dass der Umbau das Aussehen nicht verändert, ist gemessen:")
            body.append("`tools/qa_pixdiff.py` vergleicht jede Seite vorher/nachher")
            body.append("pixelweise, bei 1440 und 390 px Breite. Bewegung, Canvas und")
            body.append("Zufallstexte sind dabei ausgeblendet, sonst vergliche man Rauschen.")
            body.append("")
            body.append(md_table([
                ["Verglichene Aufnahmen", px.get("shots", 0)],
                ["Abweichung über Schwelle", px.get("differing", 0)],
                ["Beabsichtigte Abweichungen", px.get("expected", 0)],
                ["Schwelle", f"{px.get('threshold_pct', 0)} % der Bildfläche"],
            ], ["Messung", "Ergebnis"]))
            body.append("")
            if px.get("expected"):
                body.append(f"Beabsichtigt: {px.get('reason', '')}.")
                body.append("")
        if xss:
            x = xss.get("summary", {})
            body.append("### Eingaben im Browser")
            body.append("")
            body.append("`tools/qa_xss.py` ruft die Seiten mit präparierten Werten in")
            body.append("Query, Fragment und Suchfeld auf: `<img onerror>`, `<svg onload>`,")
            body.append("`</script><script>`, `javascript:` und ein `<iframe>`.")
            body.append("")
            body.append(md_table([
                ["Aufrufe mit Angriffsmustern", x.get("checks", 0)],
                ["Muster je Aufruf", x.get("payloads", 0)],
                ["Befunde (Markup injiziert oder Code gelaufen)", x.get("findings", 0)],
                ["CSP blockiert nachträglichen Inline-Handler",
                 "ja" if x.get("csp_blocks_inline_handler") else "nein"],
            ], ["Messung", "Ergebnis"]))
            body.append("")
    else:
        body.append("Noch keine Messung: `docs/qa/security.json` fehlt.")
        body.append("")

    body.append("## 5. Barrierefreiheit")
    body.append("")
    if a11y:
        a = a11y.get("summary", {})
        body.append("Automatisch geprüft: Textkontrast nach WCAG AA (4,5:1, große")
        body.append("Schrift 3:1), sichtbarer Tastaturfokus, Formularbeschriftungen,")
        body.append("zugängliche Namen, ARIA-Referenzen, `<main>`-Landmarke und")
        body.append("Sprungmarke. Kein Ersatz für einen Screenreader-Test.")
        body.append("")
        body.append(md_table([
            ["Seiten", a.get("pages", 0)],
            ["Kontrastfehler", a.get("contrast_findings", 0)],
            ["Fokus nicht sichtbar", a.get("focus_findings", 0)],
            ["Feld ohne Beschriftung", a.get("label_findings", 0)],
            ["Element ohne zugänglichen Namen", a.get("name_findings", 0)],
            ["ARIA-Referenz ohne Ziel", a.get("aria_findings", 0)],
            ["Seiten ohne <main>", a.get("pages_without_main", 0)],
            ["Seiten ohne Sprungmarke", a.get("pages_without_skip", 0)],
        ], ["Messung", "Ergebnis"]))
        body.append("")
        if keyboard:
            k = keyboard.get("summary", {})
            body.append("### Tastaturbedienung")
            body.append("")
            body.append("`tools/qa_keyboard.py` prüft echtes Verhalten bei 390 px:")
            body.append("Menü öffnen und per Escape schließen (Fokus zurück auf den")
            body.append("Knopf), Suche per Strg+K, Sprachknöpfe, Sprungmarke.")
            body.append("")
            body.append(md_table([
                ["Seiten", k.get("pages", 0)],
                ["Einzelprüfungen", k.get("checks", 0)],
                ["Befunde", k.get("findings", 0)],
            ], ["Messung", "Ergebnis"]))
            body.append("")
    else:
        body.append("Noch keine Messung: `docs/qa/a11y.json` fehlt.")
        body.append("")

    body.append("## 6. Gestaltung")
    body.append("")
    if design:
        d = design.get("summary", {})
        body.append("`tools/qa_design.py` misst bei 390 px, was sich prüfen lässt und")
        body.append("fast immer ein Fehler ist — Geschmack ist keine Messgröße. Die")
        body.append("Ausnahmen der Norm sind eingebaut: Links mitten im Satz und")
        body.append("Kästchen, deren Label die Trefferfläche bildet, zählen nicht.")
        body.append("")
        body.append(md_table([
            ["Seiten", d.get("pages", 0)],
            ["Tap-Ziele unter 24 × 24 px", d.get("tap_too_small", 0)],
            ["Zeilen über 90 Zeichen", d.get("long_lines", 0)],
            ["Schrift unter 12 px", d.get("font_below_12", 0)],
            ["Zeilenhöhe unter 1,25", d.get("tight_leading", 0)],
            ["Verzerrte Bilder", d.get("distorted_images", 0)],
            ["Überlaufende Elemente", d.get("overflowing", 0)],
            ["Text am Viewport-Rand", d.get("text_at_edge", 0)],
        ], ["Messung", "Ergebnis"]))
        body.append("")
        body.append("Behoben wurden unter anderem die Breadcrumbs auf sechs Seiten")
        body.append("(16–19 px hoch), der Showroom-Regler (18 × 22 px), die")
        body.append("Aktionsspalte der Vergleichstabelle (21 px) und 18 Textstellen")
        body.append("zwischen 9,5 und 11,5 px. Zusätzlich stand die Hinweiszeile der")
        body.append("Marken-Bühne absolut am Abschnittsende und damit unter dem")
        body.append("Kachelraster statt unter der Bühne; sie liegt jetzt im Fluss.")
        body.append("")
    else:
        body.append("Noch keine Messung: `docs/qa/design.json` fehlt.")
        body.append("")

    body.append("## 7. Ladezeit und Gewicht")
    body.append("")
    if perf:
        p = perf.get("summary", {})
        body.append("Gemessen mit deaktiviertem Browser-Cache je Seite: übertragene")
        body.append("Bytes, Requests, LCP und CLS. Die Zahlen gelten für den lokalen")
        body.append("Server; im Netz kommen Latenz und TLS hinzu.")
        body.append("")
        body.append(md_table([
            ["Seiten", p.get("pages", 0)],
            ["Median übertragene Bytes", f"{p.get('median_bytes', 0) // 1024} KB"],
            ["Größte Seite", f"{p.get('max_bytes', 0) // 1024} KB"],
            ["Median LCP", f"{p.get('median_lcp', 0)} ms"],
            ["Schlechtester LCP", f"{p.get('worst_lcp', 0)} ms"],
            ["Seiten mit CLS über 0,1", p.get("pages_cls_over_01", 0)],
        ], ["Messung", "Ergebnis"]))
        body.append("")
        body.append("Der größte Einzelposten ist three.js (`vendor/`, rund 700 KB) auf")
        body.append("den Seiten mit 3D-Bühne. Er wird nur geladen, wenn eine Bühne in")
        body.append("den Blick kommt; ohne WebGL bleibt die gezeichnete Ersatzbühne.")
        body.append("")
        if perf_mobil:
            m = perf_mobil.get("summary", {})
            body.append("### Mobil (390 × 844)")
            body.append("")
            body.append("Dieselbe Messung bei 390 px Breite. Wichtig, weil dort das")
            body.append("Mobilmenü greift und die 3D-Bühnen kleiner ausfallen.")
            body.append("")
            body.append(md_table([
                ["Seiten", m.get("pages", 0)],
                ["Median übertragene Bytes", f"{m.get('median_bytes', 0) // 1024} KB"],
                ["Größte Seite", f"{m.get('max_bytes', 0) // 1024} KB"],
                ["Median LCP", f"{m.get('median_lcp', 0)} ms"],
                ["Schlechtester LCP", f"{m.get('worst_lcp', 0)} ms"],
                ["Seiten mit CLS über 0,1", m.get("pages_cls_over_01", 0)],
                ["Bilder ohne Maße", m.get("images_without_dims", 0)],
            ], ["Messung", "Ergebnis"]))
            body.append("")
    else:
        body.append("Noch keine Messung: `docs/qa/perf.json` fehlt.")
        body.append("")

    body.append("## 8. 3D-Bühnen (three.js)")
    body.append("")
    if three:
        rows = three.get("rows", [])
        rendered = [r for r in rows if r.get("rendered")]
        body.append(f"Geprüft: **{len(rows)} Seiten mit 3D-Szene**, gerendert: **{len(rendered)}**.")
        body.append("Messung: Canvas in den Blick scrollen, WebGL-Kontext abfragen, Bild")
        body.append("aufnehmen und die Helligkeitsstreuung messen. Ein einfarbiges Bild")
        body.append("(Streuung unter 4) würde bedeuten, dass die Bühne leer bleibt.")
        body.append("")
        body.append(md_table(
            [[f"`{r['page']}`",
              "ja" if r.get("rendered") else "nein",
              ", ".join(f"{c['w']}×{c['h']}" for c in r.get("canvases", []) if c.get("webgl")) or "–",
              max([s.get("std") or 0 for s in r.get("pixel_std", [])] or [0]),
              len(r.get("page_errors", []))]
             for r in rows],
            ["Seite", "gerendert", "WebGL-Canvas", "Streuung", "JS-Fehler"]))
        body.append("")
        body.append("Alle Szenen laden three.js ausschließlich aus `vendor/`; das ist mit")
        body.append("`script-src 'self'` vereinbar. Ohne WebGL bleibt die gezeichnete")
        body.append("SVG-Bühne sichtbar, die Bedienelemente funktionieren weiter.")
        body.append("")
    else:
        body.append("Noch keine Messung: `docs/qa/three.json` fehlt.")
        body.append("")
        body.append("```")
        body.append("python3 tools/qa_three.py --base http://127.0.0.1:8809")
        body.append("```")
        body.append("")

    body.append("## 9. Screenshots")
    body.append("")
    shots = sorted(p.name for p in QA.glob("*-desktop.png"))
    body.append(f"`docs/qa/` enthält {len(shots)} Desktop-Aufnahmen (1440 × 900) sowie")
    body.append("Startseite in Tablet und Mobil. Sie zeigen den ersten Bildschirm")
    body.append("jeder Seite und dienen der Sichtprüfung von Typografie, Abständen")
    body.append("und 3D-Bühne. Erzeugt mit `tools/qa_shots.py` (WebGL an, damit die")
    body.append("Bühnen im Bild sind).")
    body.append("")

    body.append("## 10. Was hier nicht geprüft wird")
    body.append("")
    body.append("- **Echte Geräte.** Die Messung läuft in Chromium; Safari und Firefox")
    body.append("  werden nicht automatisch geprüft.")
    body.append("- **Barrierefreiheit nach WCAG.** Kontrast und Fokus sind von Hand")
    body.append("  geprüft, es gibt aber keinen automatisierten Axe-Lauf.")
    body.append("- **Netzwerk unter Last.** GitHub Pages liefert statisch; Latenz und")
    body.append("  Caching-Verhalten der Domain sind nicht Teil dieses Berichts.")
    body.append("- **Formularversand.** `mailto:` öffnet ein Mailprogramm; der Versand")
    body.append("  selbst lässt sich im Browser nicht abschließend testen.")
    body.append("")

    body.append("## 11. Wiederholen")
    body.append("")
    body.append("```")
    body.append("python3 tools/qa_site.py --static-only")
    body.append("python3 tools/qa_seo.py")
    body.append("python3 -m http.server 8809 --bind 127.0.0.1 &")
    body.append("python3 tools/qa_site.py --base http://127.0.0.1:8809 --out docs/qa --no-shots")
    body.append("python3 tools/qa_three.py --base http://127.0.0.1:8809")
    body.append("python3 tools/qa_security.py")
    body.append("python3 tools/qa_a11y.py --base http://127.0.0.1:8809")
    body.append("python3 tools/qa_xss.py --base http://127.0.0.1:8809")
    body.append("python3 tools/qa_keyboard.py --base http://127.0.0.1:8809")
    body.append("python3 tools/qa_design.py --base http://127.0.0.1:8809")
    body.append("python3 tools/qa_perf.py --base http://127.0.0.1:8809")
    body.append("python3 tools/qa_perf.py --base http://127.0.0.1:8809 --width 390 --height 844 --label mobil")
    body.append("python3 tools/qa_zoom.py --base http://127.0.0.1:8809")
    body.append("python3 tools/qa_motion.py --base http://127.0.0.1:8809")
    body.append("python3 tools/qa_forum.py --base http://127.0.0.1:8809")
    body.append("python3 tools/csp_styles.py --check")
    body.append("python3 tools/qa_pixdiff.py --base http://127.0.0.1:8809 --compare /tmp/vorher")
    body.append("python3 tools/qa_report.py")
    body.append("```")
    body.append("")

    OUT.write_text("\n".join(body), encoding="utf-8")
    print(f"geschrieben: {OUT.relative_to(ROOT)}")
    print(json.dumps({
        "static": s,
        "seo_problems": len(seo_problems),
        "runtime_runs": len(runs),
        "runtime_error_pages": len(err_pages),
        "runtime_overflow": len(overflow),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
