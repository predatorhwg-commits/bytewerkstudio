/* ============================================================
 * NEON HORDE — Bytewerk Studio
 * loader.js — NH Namespace, Utilities, Event-Bus, i18n, DOM, CSS
 * Lade-Reihenfolge: loader -> balance -> lang -> audio -> input
 *                   -> meta -> save -> entities -> weapons
 *                   -> waves -> shop -> ui -> game -> main
 * ============================================================ */
(function () {
  'use strict';
  const NH = (window.NH = window.NH || {});

  /* ---------- Utilities ---------- */
  NH.u = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(NH.u.rand(a, b + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist2: (ax, ay, bx, by) => {
      const dx = ax - bx, dy = ay - by;
      return dx * dx + dy * dy;
    },
    dist: (ax, ay, bx, by) => Math.sqrt(NH.u.dist2(ax, ay, bx, by)),
    angleTo: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    fmt: (n) => {
      n = Math.round(n);
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
      return String(n);
    },
    fmtClock: (s) => {
      s = Math.max(0, Math.ceil(s));
      const m = Math.floor(s / 60), ss = s % 60;
      return m + ':' + (ss < 10 ? '0' : '') + ss;
    },
    keyOf: (o) => Object.keys(o)[0],
  };

  /* ---------- Event Bus ---------- */
  NH.events = {
    _m: Object.create(null),
    on(evt, fn) {
      (this._m[evt] = this._m[evt] || []).push(fn);
      return fn;
    },
    off(evt, fn) {
      const a = this._m[evt];
      if (a) {
        const i = a.indexOf(fn);
        if (i >= 0) a.splice(i, 1);
      }
    },
    emit(evt, data) {
      const a = this._m[evt];
      if (a) for (let i = 0; i < a.length; i++) { try { a[i](data); } catch (e) { console.error('[NH:events:' + evt + ']', e); } }
    },
  };

  /* ---------- i18n ---------- */
  NH.lang = {
    current: (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().indexOf('de') === 0) ? 'de' : 'en',
    de: {},
    en: {},
    set(l) {
      this.current = l === 'de' ? 'de' : 'en';
      NH.events.emit('lang', l);
      NH.events.emit('nh:lang', l); // Vertragskanal; 'lang' bleibt Legacy
    },
    t(path) {
      const parts = path.split('.');
      const ns = parts[0];
      const key = parts.slice(1).join('.');
      const table = (this[this.current] && this[this.current][ns]) || {};
      let v = table[key];
      if (v === undefined) {
        const enTable = (this.en && this.en[ns]) || {};
        v = enTable[key];
        if (v === undefined) return path;
      }
      return v;
    },
  };
  NH.t = (p) => NH.lang.t(p);

  /* ---------- DOM helpers ---------- */
  NH.dom = {
    el(tag, attrs, children) {
      const n = document.createElement(tag);
      if (attrs) {
        for (const k in attrs) {
          const v = attrs[k];
          if (v === undefined || v === null) continue;
          if (k === 'class') n.className = v;
          else if (k === 'text') n.textContent = v;
          else if (k === 'html') n.innerHTML = v;
          else if (k === 'style') {
            // Bewusst nicht unterstuetzt: die CSP verbietet style-Attribute.
            // Stattdessen Klassen in boot.css verwenden.
            console.warn('[NH:dom] style-Option ignoriert (CSP). Bitte Klasse verwenden.');
          }
          else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
          else if (k === 'dataset') Object.assign(n.dataset, v);
          else n.setAttribute(k, v);
        }
      }
      if (children !== undefined && children !== null) {
        if (typeof children === 'string' || typeof children === 'number') {
          n.textContent = String(children);
        } else if (Array.isArray(children)) {
          // Geschweifte Klammern sind hier Pflicht: ohne sie bindet das
          // folgende else an `if (c)` und nicht an den Array-Zweig.
          for (const c of children) if (c) n.appendChild(c);
        } else {
          n.appendChild(children);
        }
      }
      return n;
    },
    div(children, cls) {
      return NH.dom.el('div', cls ? { class: cls } : null, children);
    },
    button(label, cls, onClick) {
      const b = NH.dom.el('button', { class: cls || 'nh-btn' }, label);
      if (onClick) b.addEventListener('click', onClick);
      return b;
    },
    clear(node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    },
    show(node) { node.classList.remove('nh-hidden'); },
    hide(node) { node.classList.add('nh-hidden'); },
    $(sel) { return document.querySelector(sel); },
    $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); },
  };

  /* ---------- CSS injection ----------
     Frueher ein <style>-Tag, das die CSP (style-src 'self') blockt.
     Jetzt ein konstruiertes Stylesheet (adoptedStyleSheets): das ist
     kein Inline-Style und bleibt unter strikter CSP erlaubt. Aeltere
     Browser ohne CSSStyleSheet-Konstruktor fallen auf ein <style>-Tag
     zurueck — dort greift die CSP dann nicht, die Seite funktioniert
     aber weiter. */
  NH.css = {
    _styles: [],
    _sheet: null,
    _rules: {},
    _apply() {
      const text = this._styles.join('\n');
      if (this._sheet) { this._sheet.replaceSync(text); return; }
      const tag = document.getElementById('nh-styles');
      if (tag) { tag.textContent = text; return; }
      const t = document.createElement('style');
      t.id = 'nh-styles';
      t.textContent = text;
      (document.head || document.documentElement).appendChild(t);
    },
    add(cssText) {
      this._styles.push(cssText);
      if (!this._sheet && typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in document) {
        try {
          this._sheet = new CSSStyleSheet();
          document.adoptedStyleSheets = document.adoptedStyleSheets.concat([this._sheet]);
        } catch (e) { this._sheet = null; }
      }
      this._apply();
    },
    /* Einmalige Regel anlegen (fuer dynamische Werte wie Balkenbreiten). */
    rule(selector, decl) {
      if (this._rules[selector]) return;
      this._rules[selector] = true;
      this._styles.push(selector + '{' + decl + '}');
      this._apply();
    },
    /* Breite eines HUD-Balkens in Prozent, ohne style-Attribut. */
    width(el, pct) {
      if (!el) return;
      const n = Math.max(0, Math.min(100, Math.round(pct)));
      const cls = 'nh-w' + n;
      if (el.nhWidthClass === cls) return;
      this.rule('.nh-bar > .nh-bar-fill.' + cls, 'width:' + n + '%');
      if (el.nhWidthClass) el.classList.remove(el.nhWidthClass);
      el.classList.add(cls);
      el.nhWidthClass = cls;
    },
    /* Farbton setzen: ersetzt style.color / style.borderColor. */
    tone(el, color) {
      if (!el) return;
      const map = {
        '#35d2e8': 'nh-tone-cyan',
        '#ff6b6b': 'nh-tone-red',
        '#ffd700': 'nh-tone-gold',
        '#7cfc00': 'nh-tone-green'
      };
      const cls = map[String(color || '').toLowerCase()];
      el.classList.remove('nh-tone-cyan', 'nh-tone-red', 'nh-tone-gold', 'nh-tone-green');
      if (cls) el.classList.add(cls);
    },
    all() { return this._styles.join('\n'); },
  };

  /* ---------- Log ---------- */
  NH.log = (...a) => console.log('[NH]', ...a);
})();