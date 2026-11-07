/* ============================================================
   BYTEWERK STUDIO — ui-v5.js (06.11.2026)
   ------------------------------------------------------------
   Grafik- und Funktionsschicht:
   - Produkt-Fenster als reine DOM-/CSS-Grafik
   - Schnellansicht (Dialog mit Fokusfalle)
   - Vergleichs-Ablage mit Vorauswahl auf vergleich.html
   - Tastatur-Hilfe und Sprungtasten
   - Abschnitts-Register auf der Startseite

   Keine Abhaengigkeiten, keine Netzwerkzugriffe. Wird nach
   ui-v4.js geladen. Alle eingefuegten Elemente sind dekorativ
   (aria-hidden) oder echte Bedienelemente mit Beschriftung.
   ============================================================ */

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const lang = () => (document.documentElement.lang || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';
  const T = (de, en) => (lang() === 'en' ? en : de);
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }
  };

  const CMP_KEY = 'bw-compare-v5';
  const MAX_CMP = 3;

  /* ------------------------------------------------------------
     Produktkatalog: Szene, Farbton, Etikett
     ------------------------------------------------------------ */
  const PRODUCTS = {
    'produkt.html':               { scene: 'focus',   accent: 'sc-terra', tag: 'Fokus' },
    'pruefungs-countdown.html':   { scene: 'exam',    accent: 'sc-terra', tag: 'Tage' },
    'lernreich-pro.html':         { scene: 'focus',   accent: 'sc-terra', tag: 'XP' },
    'keyforge-vault.html':        { scene: 'vault',   accent: 'sc-sage',  tag: 'AES-256' },
    'lumaweek-planner.html':      { scene: 'planner', accent: 'sc-ochre', tag: 'KW 45' },
    'updatepilot.html':           { scene: 'updates', accent: 'sc-slate', tag: 'winget' },
    'bytewerk-pdf-text-pro.html': { scene: 'pdf',     accent: 'sc-plum',  tag: 'OCR' },
    'mastil.html':                { scene: 'tower',   accent: 'sc-sage',  tag: 'Welle 3' },
    'neon-dominion.html':         { scene: 'neon',    accent: 'sc-ink',   tag: 'Sektor 4' },
    'burgenwerk.html':            { scene: 'castle',  accent: 'sc-ochre', tag: 'Burg' },
    'neon-horde/':                { scene: 'horde',   accent: 'sc-terra', tag: 'Welle 12' }
  };

  function slugOf(href) {
    return String(href || '')
      .split('#')[0]
      .split('?')[0]
      .replace(/^\.\//, '')
      .replace(/^\/+/, '') || 'index.html';
  }

  function metaFor(slug) {
    return PRODUCTS[slug] || { scene: 'default', accent: 'sc-terra', tag: '' };
  }

  /* ------------------------------------------------------------
     Szenen: statisches Markup, ausschliesslich div/i/b/em
     ------------------------------------------------------------ */
  function sceneHTML(type) {
    switch (type) {
      case 'vault':
        return '<div class="v5-scene v5-vault">' +
          '<div class="v5-vside"><i class="on"></i><i></i><i></i><i></i></div>' +
          '<div class="v5-vmain">' +
            '<div class="v5-row"><i class="v5-dot"></i><div class="v5-l strong w60"></div><div class="v5-pill">AES</div></div>' +
            '<div class="v5-row"><i class="v5-sq"></i><div class="v5-l w80"></div></div>' +
            '<div class="v5-row"><i class="v5-sq"></i><div class="v5-l w50"></div></div>' +
            '<div class="v5-row"><i class="v5-sq"></i><div class="v5-l w70"></div></div>' +
            '<div class="v5-key">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</div>' +
          '</div>' +
        '</div>';

      case 'focus':
        return '<div class="v5-scene v5-focus">' +
          '<div class="v5-ring"><b>68</b><small>MIN</small></div>' +
          '<div class="v5-fmain">' +
            '<div class="v5-row"><div class="v5-l strong w50"></div><div class="v5-pill">+120 XP</div></div>' +
            '<div class="v5-bars"><i></i><i></i><i></i><i></i><i></i></div>' +
            '<div class="v5-streak"><i></i><i></i><i></i><i class="off"></i><i></i><i></i><i class="off"></i></div>' +
          '</div>' +
        '</div>';

      case 'exam':
        return '<div class="v5-scene v5-exam">' +
          '<div class="v5-big">42<small>Tage</small></div>' +
          '<div class="v5-cal"><i class="done"></i><i class="done"></i><i></i><i class="today"></i><i></i><i></i><i></i></div>' +
          '<div class="v5-row"><div class="v5-l w70"></div><div class="v5-pill">Plan B</div></div>' +
        '</div>';

      case 'planner':
        return '<div class="v5-scene v5-plan"><div class="v5-week">' +
          '<div class="v5-day"><i></i><i></i></div>' +
          '<div class="v5-day"><i></i><i></i><i></i></div>' +
          '<div class="v5-day on"><i></i><i></i></div>' +
          '<div class="v5-day"><i></i></div>' +
          '<div class="v5-day"><i></i><i></i><i></i></div>' +
          '<div class="v5-day"><i></i><i></i></div>' +
          '<div class="v5-day"><i></i></div>' +
        '</div></div>';

      case 'updates':
        return '<div class="v5-scene v5-upd">' +
          '<div class="v5-uprow"><i class="ok"></i><div class="v5-l w60"></div><div class="v5-pill">ok</div></div>' +
          '<div class="v5-uprow"><i class="ok"></i><div class="v5-l w80"></div><div class="v5-pill">ok</div></div>' +
          '<div class="v5-uprow"><i class="ok"></i><div class="v5-l w50"></div><div class="v5-pill">neu</div></div>' +
          '<div class="v5-prog"><i></i></div>' +
        '</div>';

      case 'pdf':
        return '<div class="v5-scene v5-pdf">' +
          '<div class="v5-doc">' +
            '<div class="v5-l strong w60"></div>' +
            '<div class="v5-l w100"></div><div class="v5-l w90"></div><div class="v5-l w100"></div>' +
            '<div class="v5-l w70"></div><div class="v5-l w100"></div><div class="v5-l w40"></div>' +
            '<div class="v5-scan"></div>' +
          '</div>' +
          '<div class="v5-side"><i></i><i></i><i></i></div>' +
        '</div>';

      case 'tower': {
        const cells = [];
        const path = { 4: 1, 5: 1, 6: 1, 13: 1, 14: 1, 21: 1 };
        const towers = { 2: 1, 11: 1, 19: 1 };
        for (let i = 0; i < 24; i += 1) {
          cells.push('<i class="' + (towers[i] ? 'tower' : path[i] ? 'path' : '') + '"></i>');
        }
        return '<div class="v5-scene v5-tower">' +
          '<div class="v5-tgrid">' + cells.join('') + '</div>' +
          '<div class="v5-hud"><div class="v5-l w30"></div><div class="v5-pill">Welle 3</div></div>' +
        '</div>';
      }

      case 'neon':
        return '<div class="v5-scene v5-neon">' +
          '<div class="v5-nodes"><i class="a"></i><i class="b"></i><i class="c"></i></div>' +
          '<div class="v5-hud"><div class="v5-l w40"></div><div class="v5-pill">Sektor 4</div></div>' +
        '</div>';

      case 'castle':
        return '<div class="v5-scene v5-castle">' +
          '<div class="v5-sky"><div class="v5-build"><i></i><i></i><i></i></div></div>' +
          '<div class="v5-hud"><div class="v5-l w40"></div><div class="v5-pill">Welle 2</div></div>' +
        '</div>';

      case 'horde':
        return '<div class="v5-scene v5-horde">' +
          '<div class="v5-cross"></div>' +
          '<i class="v5-enemy e1"></i><i class="v5-enemy e2"></i><i class="v5-enemy e3"></i>' +
          '<div class="v5-hud"><div class="v5-l w40"></div><div class="v5-pill">Welle 12</div></div>' +
        '</div>';

      default:
        return '<div class="v5-scene v5-upd">' +
          '<div class="v5-uprow"><i class="ok"></i><div class="v5-l w60"></div></div>' +
          '<div class="v5-uprow"><i class="ok"></i><div class="v5-l w80"></div></div>' +
          '<div class="v5-uprow"><i class="ok"></i><div class="v5-l w50"></div></div>' +
          '<div class="v5-prog"><i></i></div>' +
        '</div>';
    }
  }

  /* Detailkacheln fuer die Thumbnails: abstrakte Ausschnitte. */
  function detailHTML(index) {
    switch (index % 4) {
      case 0:
        return '<div class="v5-scene v5-focus">' +
          '<div class="v5-ring"><b>72</b><small>%</small></div>' +
          '<div class="v5-fmain"><div class="v5-bars"><i></i><i></i><i></i><i></i><i></i></div></div>' +
        '</div>';
      case 1:
        return '<div class="v5-scene v5-upd">' +
          '<div class="v5-uprow"><i class="ok"></i><div class="v5-l w70"></div></div>' +
          '<div class="v5-uprow"><i class="ok"></i><div class="v5-l w50"></div></div>' +
          '<div class="v5-prog"><i></i></div>' +
        '</div>';
      case 2:
        return '<div class="v5-scene v5-plan"><div class="v5-week">' +
          '<div class="v5-day on"><i></i><i></i></div>' +
          '<div class="v5-day"><i></i></div>' +
          '<div class="v5-day"><i></i><i></i></div>' +
          '<div class="v5-day"><i></i></div>' +
          '<div class="v5-day"><i></i><i></i></div>' +
        '</div></div>';
      default:
        return '<div class="v5-scene v5-vault">' +
          '<div class="v5-vside"><i class="on"></i><i></i><i></i></div>' +
          '<div class="v5-vmain">' +
            '<div class="v5-row"><i class="v5-sq"></i><div class="v5-l w80"></div></div>' +
            '<div class="v5-row"><i class="v5-sq"></i><div class="v5-l w60"></div></div>' +
            '<div class="v5-key">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</div>' +
          '</div>' +
        '</div>';
    }
  }

  function buildWindow(options) {
    const meta = metaFor(options.slug);
    const size = options.size || '';
    const win = document.createElement('div');
    win.className = 'v5-win ' + meta.accent + (size ? ' v5-' + size : '');
    win.setAttribute('aria-hidden', 'true');

    const icon = options.icon
      ? '<img src="' + esc(options.icon) + '" alt="" loading="lazy" decoding="async">'
      : '';
    const title = options.title ? '<div class="v5-title">' + esc(options.title) + '</div>' : '';
    const tag = options.tag === false ? '' : '<div class="v5-tag">' + esc(meta.tag) + '</div>';
    const body = options.detail != null ? detailHTML(options.detail) : sceneHTML(meta.scene);

    win.innerHTML =
      '<div class="v5-bar">' + icon + title + tag + '</div>' +
      '<div class="v5-body">' + body + '</div>';
    return win;
  }

  /* ------------------------------------------------------------
     Karten: Fenster, Schnellansicht, Vergleich
     ------------------------------------------------------------ */
  const cards = $$('.prod').filter((card) => $('.ph', card) && $('h3', card));

  function cardInfo(card) {
    const link = card.matches('a') ? card : $('a', card);
    const href = card.getAttribute('href') || (link && link.getAttribute('href')) || '';
    const logo = $('.app-logo-mark', card);
    return {
      slug: slugOf(href),
      href: href,
      title: ($('h3', card) || {}).textContent || '',
      cat: ($('.cat', card) || {}).textContent || '',
      desc: ($('p', card) || {}).textContent || '',
      price: ($('.price', card) || {}).textContent || '',
      icon: logo ? logo.getAttribute('src') : ''
    };
  }

  cards.forEach((card) => {
    const info = cardInfo(card);
    if (!info.slug) return;
    const panel = $('.ph', card);

    if (!panel.classList.contains('has-win')) {
      panel.classList.add('has-win');
      panel.appendChild(buildWindow({ slug: info.slug, title: info.title, icon: info.icon }));
    }

    if (!$('.v5-act', card)) {
      const act = document.createElement('div');
      act.className = 'v5-act';
      act.innerHTML =
        '<button class="v5-ibtn" tabindex="0" data-v5-cmp aria-pressed="false" aria-label="' + esc(T('Zum Vergleich', 'Add to compare')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11"/><path d="M4 12h7"/><path d="M4 17h11"/><path d="m17 12 4 4-4 4"/></svg>' +
        '</button>' +
        '<button class="v5-ibtn" tabindex="0" data-v5-qv aria-label="' + esc(T('Schnellansicht', 'Quick view')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>' +
        '</button>';
      card.appendChild(act);

      const qvBtn = $('[data-v5-qv]', act);
      const cmpBtn = $('[data-v5-cmp]', act);

      qvBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openQuickView(card);
      });
      cmpBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCompare(info.slug, info.title);
      });
      [qvBtn, cmpBtn].forEach((btn) => {
        btn.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            btn.click();
          }
        });
      });
    }
  });

  /* Produktseiten: grosses Fenster und Detailkacheln.
     Echte Screenshots bleiben unangetastet. */
  (function productPage() {
    const slug = slugOf(location.pathname.split('/').pop() || '');
    if (!PRODUCTS[slug]) return;

    const titleEl = $('.pd-info h1');
    const title = titleEl ? titleEl.textContent.trim() : document.title.split('\u2014')[0].trim();
    const iconEl = $('.pd-thumbs img') || $('.pd-hero img');
    const icon = iconEl ? iconEl.getAttribute('src') : '';

    const hero = $('.pd-hero');
    if (hero && hero.classList.contains('app-mark-panel') && !hero.classList.contains('has-win')) {
      hero.classList.add('has-win');
      hero.appendChild(buildWindow({ slug: slug, title: title, icon: icon, size: 'lg' }));
    }

    $$('.pd-thumb').forEach((thumb, index) => {
      if (thumb.querySelector('img') || thumb.querySelector('.v5-win') || thumb.classList.contains('pd-screenshot')) return;
      thumb.classList.add('has-win');
      thumb.appendChild(buildWindow({ slug: slug, title: title, icon: icon, size: 'sm', detail: index }));
    });
  })();

  /* ------------------------------------------------------------
     Vergleichs-Ablage
     ------------------------------------------------------------ */
  function compareList() {
    const list = store.get(CMP_KEY, []);
    return Array.isArray(list) ? list.filter((item) => item && item.slug) : [];
  }

  let tray, trayList, trayLink, trayClear, trayAnnounce;

  function buildTray() {
    if (tray || !cards.length) return;
    tray = document.createElement('div');
    tray.className = 'v5-tray';
    tray.setAttribute('role', 'region');
    tray.setAttribute('aria-label', T('Vergleichs-Ablage', 'Comparison tray'));
    tray.innerHTML =
      '<div class="v5-tray-label">' + esc(T('Vergleich', 'Compare')) + '</div>' +
      '<div class="v5-tray-list"></div>' +
      '<div class="v5-tray-actions">' +
        '<a class="btn btn-primary btn-sm" aria-disabled="true" href="vergleich.html">' + esc(T('Vergleichen', 'Compare')) + '</a>' +
        '<button class="v5-tray-clear btn btn-ghost btn-sm" type="button">' + esc(T('Leeren', 'Clear')) + '</button>' +
      '</div>';
    document.body.appendChild(tray);

    trayList = $('.v5-tray-list', tray);
    trayLink = $('a', tray);
    trayClear = $('.v5-tray-clear', tray);
    trayAnnounce = document.createElement('div');
    trayAnnounce.className = 'sr-only';
    trayAnnounce.setAttribute('aria-live', 'polite');
    document.body.appendChild(trayAnnounce);

    trayClear.addEventListener('click', () => {
      store.set(CMP_KEY, []);
      paintCompare();
      trayAnnounce.textContent = T('Auswahl geleert.', 'Selection cleared.');
    });
  }

  function paintCompare() {
    const list = compareList();
    if (!tray) return;

    trayLink.setAttribute('aria-disabled', list.length ? 'false' : 'true');
    trayLink.href = 'vergleich.html?cmp=' + list.map((item) => encodeURIComponent(item.slug)).join(',');
    trayLink.textContent = list.length
      ? T('Vergleichen', 'Compare') + ' (' + list.length + ')'
      : T('Vergleichen', 'Compare');

    trayList.innerHTML = '';
    list.forEach((item) => {
      const chip = document.createElement('div');
      chip.className = 'v5-chip';
      chip.innerHTML = '<em>' + esc(item.title) + '</em>';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', T('Entfernen', 'Remove') + ': ' + item.title);
      remove.innerHTML = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>';
      remove.addEventListener('click', () => toggleCompare(item.slug, item.title, true));
      chip.appendChild(remove);
      trayList.appendChild(chip);
    });

    tray.classList.toggle('show', list.length > 0);
    $$('[data-v5-cmp]').forEach((button) => {
      const card = button.closest('.prod');
      if (!card) return;
      const on = list.some((item) => item.slug === cardInfo(card).slug);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function toggleCompare(slug, title, forceRemove) {
    let list = compareList();
    const exists = list.some((item) => item.slug === slug);
    if (exists || forceRemove) {
      list = list.filter((item) => item.slug !== slug);
    } else {
      if (list.length >= MAX_CMP) {
        if (window.bwFlash) window.bwFlash(T('Maximal drei Produkte vergleichen.', 'Compare up to three products.'));
        return;
      }
      list.push({ slug, title });
    }
    store.set(CMP_KEY, list);
    paintCompare();
    if (trayAnnounce) {
      trayAnnounce.textContent = exists || forceRemove
        ? T(title + ' entfernt.', title + ' removed.')
        : T(title + ' zur Ablage hinzugefuegt.', title + ' added to the tray.');
    }
    if (quickCmp) {
      const on = list.some((item) => item.slug === quickCmp.slug);
      quickCmp.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ------------------------------------------------------------
     Schnellansicht
     ------------------------------------------------------------ */
  let modal, dialog, qvMedia, qvKicker, qvTitle, qvDesc, qvPrice, qvBuy, quickCmp;
  let lastFocus = null;

  function buildModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'v5-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'v5-qv-title');
    modal.innerHTML =
      '<div class="v5-dialog">' +
        '<button class="v5-qv-close" type="button" aria-label="' + esc(T('Schliessen', 'Close')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
        '<div class="v5-qv-media"></div>' +
        '<div class="v5-qv-body">' +
          '<div class="v5-qv-kicker"></div>' +
          '<h3 id="v5-qv-title"></h3>' +
          '<p class="v5-qv-desc"></p>' +
          '<div class="v5-qv-price"></div>' +
          '<div class="v5-qv-actions">' +
            '<a class="btn btn-primary" data-v5-qv-buy href="#">' + esc(T('Details ansehen', 'View details')) + ' <span class="arr">&rarr;</span></a>' +
            '<button class="btn btn-ghost v5-qv-cmp" type="button" aria-pressed="false"></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    dialog = $('.v5-dialog', modal);
    qvMedia = $('.v5-qv-media', modal);
    qvKicker = $('.v5-qv-kicker', modal);
    qvTitle = $('#v5-qv-title', modal);
    qvDesc = $('.v5-qv-desc', modal);
    qvPrice = $('.v5-qv-price', modal);
    qvBuy = $('[data-v5-qv-buy]', modal);
    quickCmp = $('.v5-qv-cmp', modal);

    $('.v5-qv-close', modal).addEventListener('click', closeQuickView);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeQuickView();
    });
    modal.addEventListener('keydown', trapFocus);
  }

  function openQuickView(card) {
    buildModal();
    const info = cardInfo(card);
    lastFocus = document.activeElement;

    qvMedia.innerHTML = '';
    qvMedia.appendChild(buildWindow({ slug: info.slug, title: info.title, icon: info.icon }));
    qvKicker.textContent = info.cat;
    qvTitle.textContent = info.title;
    qvDesc.textContent = info.desc;
    qvPrice.textContent = info.price;
    qvBuy.href = info.href || '#';

    const on = compareList().some((item) => item.slug === info.slug);
    quickCmp.setAttribute('aria-pressed', on ? 'true' : 'false');
    quickCmp.textContent = on ? T('Aus Vergleich entfernen', 'Remove from compare') : T('In den Vergleich', 'Add to compare');
    quickCmp.onclick = () => {
      toggleCompare(info.slug, info.title);
      const now = compareList().some((item) => item.slug === info.slug);
      quickCmp.setAttribute('aria-pressed', now ? 'true' : 'false');
      quickCmp.textContent = now ? T('Aus Vergleich entfernen', 'Remove from compare') : T('In den Vergleich', 'Add to compare');
    };

    modal.classList.add('open');
    document.body.classList.add('v5-lock');
    window.setTimeout(() => $('.v5-qv-close', modal).focus(), 30);
  }

  function closeQuickView() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('v5-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function trapFocus(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickView();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = $$('a[href], button:not([disabled])', dialog)
      .filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------------------
     Tastatur-Hilfe und Sprungtasten
     ------------------------------------------------------------ */
  const SHORTCUTS = [
    { keys: 'Ctrl / Cmd + K', de: 'Suche oeffnen', en: 'Open search' },
    { keys: '/', de: 'Shop-Suche fokussieren', en: 'Focus shop search' },
    { keys: '?', de: 'Diese Uebersicht', en: 'This overview' },
    { keys: 'Esc', de: 'Schliessen', en: 'Close' },
    { keys: 'g dann h', de: 'Zur Startseite', en: 'Go to home' },
    { keys: 'g dann s', de: 'Zum Shop', en: 'Go to shop' },
    { keys: 'g dann v', de: 'Zum Vergleich', en: 'Go to comparison' },
    { keys: 'g dann k', de: 'Zum Kontakt', en: 'Go to contact' }
  ];
  const GOTO = { h: 'index.html', s: 'shop.html', v: 'vergleich.html', k: 'kontakt.html' };

  let keysEl;

  function buildKeys() {
    if (keysEl) return;
    keysEl = document.createElement('div');
    keysEl.className = 'v5-keys';
    keysEl.setAttribute('role', 'dialog');
    keysEl.setAttribute('aria-modal', 'true');
    keysEl.setAttribute('aria-labelledby', 'v5-keys-title');
    keysEl.innerHTML =
      '<div class="v5-keys-panel" tabindex="-1">' +
        '<h3 id="v5-keys-title">' + esc(T('Tastatur', 'Keyboard')) + '</h3>' +
        '<p class="v5-keys-sub">' + esc(T('Alle Wege ohne Maus.', 'Every route without a mouse.')) + '</p>' +
        '<div class="v5-keys-rows"></div>' +
        '<div class="v5-keys-foot">' + esc(T('Eingaben in Formularfeldern bleiben unberuehrt.', 'Typing in form fields is never intercepted.')) + '</div>' +
      '</div>';
    document.body.appendChild(keysEl);

    const rows = $('.v5-keys-rows', keysEl);
    SHORTCUTS.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'v5-keyrow';
      const label = document.createElement('div');
      label.textContent = T(item.de, item.en);
      const kbd = document.createElement('kbd');
      kbd.textContent = item.keys;
      row.appendChild(label);
      row.appendChild(kbd);
      rows.appendChild(row);
    });

    keysEl.addEventListener('click', (event) => {
      if (event.target === keysEl) closeKeys();
    });
    keysEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeKeys(); }
    });
  }

  function openKeys() {
    buildKeys();
    keysEl.classList.add('open');
    document.body.classList.add('v5-lock');
    window.setTimeout(() => { const panel = $('.v5-keys-panel', keysEl); if (panel) panel.focus(); }, 20);
  }

  function closeKeys() {
    if (!keysEl) return;
    keysEl.classList.remove('open');
    document.body.classList.remove('v5-lock');
  }

  function isTyping(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  let gBuffer = '';
  let gTimer = 0;

  document.addEventListener('keydown', (event) => {
    if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === '?') {
      event.preventDefault();
      openKeys();
      return;
    }

    if (gBuffer === 'g') {
      const target = GOTO[event.key.toLowerCase()];
      if (target) {
        event.preventDefault();
        gBuffer = '';
        window.clearTimeout(gTimer);
        location.href = target;
        return;
      }
    }

    if (event.key === 'g') {
      gBuffer = 'g';
      window.clearTimeout(gTimer);
      gTimer = window.setTimeout(() => { gBuffer = ''; }, 1100);
    }
  });

  /* Kleiner Einstieg in die Tastatur-Hilfe im Fussbereich. */
  (function footerKeys() {
    const bottom = $('.footer-bottom');
    if (!bottom) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v5-keys-open';
    button.textContent = T('Tastatur', 'Keyboard') + '  ?';
    button.setAttribute('aria-label', T('Tastaturkuerzel anzeigen', 'Show keyboard shortcuts'));
    button.addEventListener('click', openKeys);
    bottom.appendChild(button);
  })();

  /* ------------------------------------------------------------
     Abschnitts-Register auf der Startseite
     ------------------------------------------------------------ */
  const SECTION_LABELS = {
    leistungen: ['Leistungen', 'Services'],
    arbeiten: ['Arbeiten', 'Work'],
    shop: ['Shop', 'Shop'],
    prozess: ['Prozess', 'Process'],
    'studio-teaser': ['Studio', 'Studio'],
    preise: ['Preise', 'Pricing'],
    konfigurator: ['Briefing', 'Briefing'],
    faq: ['FAQ', 'FAQ']
  };

  function buildRail() {
    const main = $('#main');
    if (!main) return;
    const sections = $$(':scope > section[id]', main).filter((section) => section.id);
    if (sections.length < 3) return;

    const rail = document.createElement('nav');
    rail.className = 'v5-rail';
    rail.setAttribute('aria-label', T('Abschnitte', 'Sections'));

    sections.forEach((section) => {
      const label = SECTION_LABELS[section.id];
      if (!label) return;
      const link = document.createElement('a');
      link.href = '#' + section.id;
      const line = document.createElement('i');
      const text = document.createElement('span');
      text.textContent = T(label[0], label[1]);
      link.appendChild(line);
      link.appendChild(text);
      rail.appendChild(link);
    });

    if (rail.children.length < 3) return;
    document.body.appendChild(rail);

    const links = $$('a', rail);
    const setActive = (id) => {
      links.forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + id);
        if (link.classList.contains('active')) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) setActive(visible[0].target.id);
      }, { rootMargin: '-40% 0px -45% 0px', threshold: [0, 0.2, 0.6] });
      sections.forEach((section) => observer.observe(section));
    }
  }

  /* ------------------------------------------------------------
     Vergleichsseite: Vorauswahl aus der Ablage
     ------------------------------------------------------------ */
  function applyCompareParam() {
    const table = $('table.cmp');
    if (!table) return;
    const params = new URLSearchParams(location.search);
    const raw = params.get('cmp');
    if (!raw) return;

    const wanted = raw.split(',').map((value) => decodeURIComponent(value.trim())).filter(Boolean);
    if (!wanted.length) return;

    const rows = $$('tbody tr', table);
    const bySlug = new Map();
    rows.forEach((row) => {
      const link = $('a[href]', row);
      if (!link) return;
      bySlug.set(slugOf(link.getAttribute('href')), row);
    });

    const picked = wanted.map((slug) => bySlug.get(slug)).filter(Boolean);
    if (!picked.length) return;

    const tbody = $('tbody', table);
    picked.slice().reverse().forEach((row) => {
      row.classList.add('v5-picked');
      tbody.insertBefore(row, tbody.firstChild);
    });

    const wrap = $('.cmp-wrap', table.closest('.wrap') || document) || table.parentElement;
    const note = document.createElement('div');
    note.className = 'v5-cmp-note';
    note.innerHTML = '<div></div>';
    $('div', note).textContent = T(
      picked.length + (picked.length === 1 ? ' Produkt aus der Ablage markiert.' : ' Produkte aus der Ablage markiert.'),
      picked.length + (picked.length === 1 ? ' product marked from the tray.' : ' products marked from the tray.')
    );
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = T('Auswahl aufheben', 'Clear selection');
    clear.addEventListener('click', () => {
      store.set(CMP_KEY, []);
      const url = new URL(location.href);
      url.searchParams.delete('cmp');
      location.replace(url.toString());
    });
    note.appendChild(clear);
    wrap.parentNode.insertBefore(note, wrap);
  }

  /* ------------------------------------------------------------
     Start
     ------------------------------------------------------------ */
  function start() {
    buildTray();
    paintCompare();
    buildRail();
    applyCompareParam();

    if (cards.length) {
      buildModal();
    }

    document.addEventListener('bw:lang', () => {
      if (tray) {
        $('.v5-tray-label', tray).textContent = T('Vergleich', 'Compare');
        trayClear.textContent = T('Leeren', 'Clear');
      }
      paintCompare();
    });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
