/* ============================================================
   BYTEWERK STUDIO — ui-v4.js (06.11.2026)
   Global search palette, shop tools, product sticky bar,
   project configurator, contact prefill, back-to-top.
   No dependencies. Loaded after components.js and ui-v3.js.
   ============================================================ */

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const lang = () => (document.documentElement.lang || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';
  const T = (de, en) => (lang() === 'en' ? en : de);
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }
  };
  const pageFile = () => (location.pathname.split('/').pop() || 'index.html');

  /* ---------- Toast ---------- */
  let flashEl, flashTimer;
  function flash(message) {
    if (!flashEl) {
      flashEl = document.createElement('div');
      flashEl.className = 'bw-flash';
      flashEl.setAttribute('role', 'status');
      flashEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(flashEl);
    }
    flashEl.textContent = message;
    flashEl.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('show'), 2600);
  }
  window.bwFlash = flash;

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (__) { return false; }
    }
  }

  /* ---------- Search index ---------- */
  const INDEX = [
    { url: 'index.html', group: 'page', title: { de: 'Startseite', en: 'Home' }, sub: { de: 'Leistungen, Arbeiten, Preise', en: 'Services, work, pricing' }, keywords: 'start home studio leistungen arbeiten preise' },
    { url: 'index.html#leistungen', group: 'page', title: { de: 'Leistungen', en: 'Services' }, sub: { de: 'Software, Web, Apps, IT', en: 'Software, web, apps, IT' }, keywords: 'software web app entwicklung it services' },
    { url: 'index.html#arbeiten', group: 'page', title: { de: 'Arbeiten', en: 'Work' }, sub: { de: 'Ausgewählte Projekte', en: 'Selected projects' }, keywords: 'arbeiten projekte work portfolio' },
    { url: 'index.html#konfigurator', group: 'page', title: { de: 'Projekt-Konfigurator', en: 'Project configurator' }, sub: { de: 'Umfang in drei Schritten klären', en: 'Scope in three steps' }, keywords: 'konfigurator anfrage projekt planung' },
    { url: 'index.html#preise', group: 'page', title: { de: 'Preise & Pakete', en: 'Pricing & packages' }, sub: { de: 'Starter, Studio, Betreuung', en: 'Starter, studio, care' }, keywords: 'preise pakete kosten pricing' },
    { url: 'softwareentwicklung-ludwigshafen.html', group: 'page', title: { de: 'Softwareentwicklung Ludwigshafen', en: 'Software development Ludwigshafen' }, sub: { de: 'Lokale Leistungsseite', en: 'Local services page' }, keywords: 'ludwigshafen mannheim region software webentwicklung' },
    { url: 'shop.html', group: 'page', title: { de: 'Shop', en: 'Shop' }, sub: { de: 'Alle Apps und Spiele', en: 'All apps and games' }, keywords: 'shop apps spiele produkte kaufen' },
    { url: 'vergleich.html', group: 'page', title: { de: 'Produktvergleich', en: 'Product comparison' }, sub: { de: 'Welche App passt zu dir?', en: 'Which app fits you?' }, keywords: 'vergleich vergleichen finder auswahl compare' },
    { url: 'studio.html', group: 'page', title: { de: 'Studio', en: 'Studio' }, sub: { de: 'Über Bytewerk Studio', en: 'About Bytewerk Studio' }, keywords: 'studio über uns about kontakt' },
    { url: 'kontakt.html', group: 'page', title: { de: 'Kontakt', en: 'Contact' }, sub: { de: 'Projektanfrage senden', en: 'Send a project request' }, keywords: 'kontakt contact anfrage email projekt' },
    { url: 'konto.html', group: 'page', title: { de: 'Mein Konto', en: 'My account' }, sub: { de: 'Bibliothek, Bestellungen, Profil', en: 'Library, orders, profile' }, keywords: 'konto account bibliothek lizenzen bestellungen' },
    { url: 'login.html', group: 'page', title: { de: 'Anmelden', en: 'Sign in' }, sub: { de: 'Zum Konto', en: 'To your account' }, keywords: 'login anmelden konto' },

    { url: 'produkt.html', group: 'product', title: { de: 'Lernreich', en: 'Lernreich' }, sub: { de: 'Kostenlos · Windows · Lernen', en: 'Free · Windows · Learning' }, keywords: 'lernreich lernen fokus xp streaks heatmap journal windows free', price: 'Kostenlos', icon: 'media/lernreich-logo.png' },
    { url: 'pruefungs-countdown.html', group: 'product', title: { de: 'Prüfungs-Countdown', en: 'Exam Countdown' }, sub: { de: 'Kostenlos · Windows · Prüfung', en: 'Free · Windows · Exams' }, keywords: 'prüfung pruefung countdown examen lernen timer windows free', price: 'Kostenlos', icon: 'media/pruefungs-countdown-logo.png' },
    { url: 'lernreich-pro.html', group: 'product', title: { de: 'Lernreich Pro', en: 'Lernreich Pro' }, sub: { de: '9,99 € · Windows · Fokus', en: '€9.99 · Windows · Focus' }, keywords: 'lernreich pro fokus lernstadt journal sqlite premium', price: '9,99 €', icon: 'media/lernreich-pro-icon.svg' },
    { url: 'keyforge-vault.html', group: 'product', title: { de: 'KeyForge Vault', en: 'KeyForge Vault' }, sub: { de: '12,99 € · Windows · Sicherheit', en: '€12.99 · Windows · Security' }, keywords: 'keyforge vault passwort passwörter sicherheit aes verschlüsselung security', price: '12,99 €', icon: 'media/keyforge-vault-icon.svg' },
    { url: 'lumaweek-planner.html', group: 'product', title: { de: 'LumaWeek Planner', en: 'LumaWeek Planner' }, sub: { de: '5,99 € · Windows · Planung', en: '€5.99 · Windows · Planning' }, keywords: 'lumaweek planner planer woche jahr kalender planning', price: '5,99 €', icon: 'media/lumaweek-icon.svg' },
    { url: 'updatepilot.html', group: 'product', title: { de: 'UpdatePilot', en: 'UpdatePilot' }, sub: { de: '12,99 € · Windows · Updates', en: '€12.99 · Windows · Updates' }, keywords: 'updatepilot updates winget windows verwaltung reports', price: '12,99 €', icon: 'media/updatepilot-icon.svg' },
    { url: 'bytewerk-pdf-text-pro.html', group: 'product', title: { de: 'Bytewerk PDF Text Pro', en: 'Bytewerk PDF Text Pro' }, sub: { de: '59,00 € · Windows · PDF/OCR', en: '€59.00 · Windows · PDF/OCR' }, keywords: 'pdf ocr text scan umwandeln konvertieren 59', price: '59,00 €', icon: 'media/bytewerk-pdf-text-pro-icon.svg' },
    { url: 'mastil.html', group: 'product', title: { de: 'MASTIL', en: 'MASTIL' }, sub: { de: 'Demo frei · Web & Windows · Strategie', en: 'Free demo · Web & Windows · Strategy' }, keywords: 'mastil spiel game strategie tower defense mittelalter', price: 'Demo frei', icon: 'media/mastil-logo.jpg' },
    { url: 'neon-dominion.html', group: 'product', title: { de: 'Neon Dominion', en: 'Neon Dominion' }, sub: { de: '20,00 € · Windows · Strategie', en: '€20.00 · Windows · Strategy' }, keywords: 'neon dominion spiel game strategie tower conquest premium', price: '20,00 €', icon: 'media/neon-dominion-icon.svg' },
    { url: 'burgenwerk.html', group: 'product', title: { de: 'BURGENWERK', en: 'BURGENWERK' }, sub: { de: 'Kostenlos · Browser · Strategie', en: 'Free · Browser · Strategy' }, keywords: 'burgenwerk burg spiel game browser strategie free', price: 'Kostenlos', icon: 'media/burgenwerk-logo.png' },
    { url: 'neon-horde/', group: 'product', title: { de: 'NEON HORDE', en: 'NEON HORDE' }, sub: { de: 'Kostenlos · Browser · Shooter', en: 'Free · Browser · Shooter' }, keywords: 'neon horde shooter browser spiel game free wellen', price: 'Kostenlos', icon: 'media/neon-horde-icon.svg' },

    { url: 'kontakt.html', group: 'action', title: { de: 'Projekt starten', en: 'Start a project' }, sub: { de: 'Zum Kontaktformular', en: 'Open the contact form' }, keywords: 'projekt starten anfrage start project' },
    { url: 'vergleich.html#finder', group: 'action', title: { de: 'App-Finder starten', en: 'Start app finder' }, sub: { de: 'In 30 Sekunden zur passenden App', en: 'Find the right app in 30 seconds' }, keywords: 'finder app auswahl empfehlung' },
    { url: 'konto.html', group: 'action', title: { de: 'Bibliothek öffnen', en: 'Open library' }, sub: { de: 'Lizenzen und Downloads', en: 'Licenses and downloads' }, keywords: 'bibliothek lizenzen downloads konto' }
  ];

  const RECENT_KEY = 'bw-recent-pages';

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss');
  }

  function itemText(item) {
    return normalize([
      item.title.de, item.title.en,
      item.sub ? item.sub.de : '', item.sub ? item.sub.en : '',
      item.keywords
    ].join(' '));
  }

  function scoreItem(item, query) {
    if (!query) return 1;
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    const hay = itemText(item);
    const title = normalize(item.title.de + ' ' + item.title.en);
    let score = 0;
    for (const token of tokens) {
      if (!hay.includes(token)) return 0;
      score += title.startsWith(token) ? 6 : title.includes(token) ? 4 : 1;
    }
    return score;
  }

  /* ---------- Command palette ---------- */
  (function palette() {
    let root, panel, input, list;
    let items = [];
    let selected = 0;

    function build() {
      root = document.createElement('div');
      root.className = 'bw-cmd';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', T('Seitensuche', 'Site search'));
      root.innerHTML = `
        <div class="bw-cmd-panel">
          <div class="bw-cmd-input">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
            <input type="search" autocomplete="off" spellcheck="false" placeholder="" aria-label="">
            <span class="bw-cmd-esc">Esc</span>
          </div>
          <div class="bw-cmd-list" role="listbox"></div>
          <div class="bw-cmd-foot">
            <div class="keys">
              <span><kbd>↑</kbd><kbd>↓</kbd> ${T('wählen', 'navigate')}</span>
              <span><kbd>↵</kbd> ${T('öffnen', 'open')}</span>
            </div>
            <span>${T('Bytewerk Suche', 'Bytewerk search')}</span>
          </div>
        </div>`;
      document.body.appendChild(root);
      panel = $('.bw-cmd-panel', root);
      input = $('input', root);
      list = $('.bw-cmd-list', root);

      input.placeholder = T('Suchen: Produkt, Seite, Leistung …', 'Search: product, page, service …');
      input.setAttribute('aria-label', T('Suche', 'Search'));

      root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
      input.addEventListener('input', () => render(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); follow(items[selected]); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
      });
      panel.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const focusables = [input, ...list.querySelectorAll('a')];
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }

    function recentItems() {
      return store.get(RECENT_KEY, []).filter(r => r && r.url && r.title);
    }

    function buildGroups(query) {
      const out = [];
      if (!query.trim()) {
        const recents = recentItems();
        if (recents.length) {
          out.push({ label: T('Zuletzt geöffnet', 'Recently opened'), items: recents.map(r => ({
            url: r.url, group: 'recent', title: { de: r.title, en: r.title }, sub: { de: T('Zuletzt geöffnet', 'Recently opened'), en: 'Recently opened' }, keywords: ''
          })) });
        }
      }
      const ranked = INDEX
        .map(item => ({ item, score: scoreItem(item, query) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.item);

      const limits = query.trim()
        ? { page: 5, product: 6, action: 3 }
        : { page: 6, product: 6, action: 3 };
      const groups = [
        ['page', T('Seiten', 'Pages')],
        ['product', T('Produkte', 'Products')],
        ['action', T('Aktionen', 'Actions')]
      ];
      for (const [key, label] of groups) {
        const groupItems = ranked.filter(i => i.group === key).slice(0, limits[key]);
        if (groupItems.length) out.push({ label, items: groupItems });
      }
      return out;
    }

    function render(query) {
      list.innerHTML = '';
      items = [];
      selected = 0;
      const groups = buildGroups(query);
      if (!groups.length) {
        const empty = document.createElement('div');
        empty.className = 'bw-cmd-empty';
        empty.innerHTML = '<b></b><span></span>';
        empty.querySelector('b').textContent = T('Nichts gefunden', 'Nothing found');
        empty.querySelector('span').textContent = T('Versuch es mit „App“, „PDF“ oder „Shop“.', 'Try “app”, “PDF” or “shop”.');
        list.appendChild(empty);
        return;
      }
      for (const group of groups) {
        const g = document.createElement('div');
        g.className = 'bw-cmd-group';
        g.textContent = group.label;
        list.appendChild(g);
        for (const item of group.items) {
          const a = document.createElement('a');
          a.className = 'bw-cmd-item';
          a.href = item.url;
          a.setAttribute('role', 'option');
          a.setAttribute('aria-selected', 'false');
          const ico = document.createElement('span');
          ico.className = 'ico';
          ico.textContent = item.group === 'product' ? T('App', 'App') : item.group === 'action' ? '→' : T('Seite', 'Page');
          const txt = document.createElement('span');
          txt.className = 'txt';
          const tt = document.createElement('span');
          tt.className = 'tt';
          tt.textContent = item.title[lang()];
          const dd = document.createElement('span');
          dd.className = 'dd';
          dd.textContent = item.sub ? item.sub[lang()] : '';
          txt.append(tt, dd);
          const go = document.createElement('span');
          go.className = 'go';
          go.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
          a.append(ico, txt, go);
          a.addEventListener('click', () => remember(item));
          list.appendChild(a);
          items.push({ el: a, data: item });
        }
      }
      paint();
    }

    function paint() {
      items.forEach((entry, i) => entry.el.setAttribute('aria-selected', i === selected ? 'true' : 'false'));
      const active = items[selected];
      if (active) active.el.scrollIntoView({ block: 'nearest' });
    }

    function move(delta) {
      if (!items.length) return;
      selected = (selected + delta + items.length) % items.length;
      paint();
    }

    function remember(item) {
      const list = recentItems().filter(r => r.url !== item.url);
      list.unshift({ url: item.url, title: item.title[lang()] });
      store.set(RECENT_KEY, list.slice(0, 5));
    }

    function follow(entry) {
      if (!entry) return;
      remember(entry.data);
      location.href = entry.data.url;
    }

    function open() {
      if (!root) build();
      root.classList.add('open');
      document.body.classList.add('bw-cmd-open');
      input.value = '';
      render('');
      requestAnimationFrame(() => input.focus());
    }

    function close() {
      if (!root) return;
      root.classList.remove('open');
      document.body.classList.remove('bw-cmd-open');
      const trigger = $('[data-search-open]');
      if (trigger) trigger.focus();
    }

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        root && root.classList.contains('open') ? close() : open();
      } else if (e.key === '/' && !typing && !(root && root.classList.contains('open'))) {
        e.preventDefault();
        open();
      } else if (e.key === 'Escape' && root && root.classList.contains('open')) {
        close();
      }
    });

    $$('[data-search-open]').forEach(btn => btn.addEventListener('click', open));
    document.addEventListener('bw:lang', () => {
      if (!root) return;
      input.placeholder = T('Suchen: Produkt, Seite, Leistung …', 'Search: product, page, service …');
      input.setAttribute('aria-label', T('Suche', 'Search'));
      if (root.classList.contains('open')) render(input.value);
    });

    // Show Ctrl on Windows/Linux instead of the command symbol.
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    $$('.nav-search kbd').forEach(k => { k.textContent = mac ? '⌘K' : 'Ctrl K'; });
  })();

  /* ---------- Back to top ---------- */
  (function backToTop() {
    const btn = document.createElement('button');
    btn.className = 'bw-top';
    btn.type = 'button';
    btn.setAttribute('aria-label', T('Nach oben', 'Back to top'));
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    document.body.appendChild(btn);
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    let ticking = false;
    const update = () => {
      btn.classList.toggle('show', window.scrollY > 700);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
    document.addEventListener('bw:lang', () => btn.setAttribute('aria-label', T('Nach oben', 'Back to top')));
  })();

  /* ---------- Scroll spy on the home page ---------- */
  (function scrollSpy() {
    if (pageFile() !== 'index.html' && pageFile() !== '') return;
    const links = $$('.nav-links a').filter(a => (a.getAttribute('href') || '').includes('#'));
    if (!links.length) return;
    const map = new Map();
    links.forEach(link => {
      const id = (link.getAttribute('href') || '').split('#')[1];
      const section = id ? document.getElementById(id) : null;
      if (section) map.set(section, link);
    });
    if (!map.size || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(l => l.classList.remove('active'));
        const link = map.get(entry.target);
        if (link) link.classList.add('active');
      });
    }, { rootMargin: '-40% 0px -52% 0px', threshold: 0 });
    map.forEach((_, section) => io.observe(section));
  })();

  /* ---------- Shop: search, sort, filters, state ---------- */
  (function shop() {
    const grid = $('.shop-page-grid');
    if (!grid) return;
    const items = $$('.prod', grid);
    if (!items.length) return;

    const search = $('#shop-search');
    const sort = $('#shop-sort');
    const count = $('#shop-count');
    const chips = $$('.shop-filters .chip');
    const original = new Map(items.map((el, i) => [el, i]));

    const state = { q: '', cat: 'all', sort: 'featured' };
    const params = new URLSearchParams(location.search);
    state.q = params.get('q') || '';
    state.cat = params.get('cat') || 'all';
    state.sort = params.get('sort') || 'featured';

    if (search) search.value = state.q;
    if (sort) sort.value = state.sort;
    chips.forEach(chip => {
      const on = chip.dataset.filter === state.cat;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    function priceOf(el) {
      const text = ($('.price', el) ? $('.price', el).textContent : '').replace(/\s+/g, ' ');
      const match = text.match(/(\d+)[.,](\d{2})/);
      return match ? parseFloat(match[1] + '.' + match[2]) : 0;
    }

    function hayOf(el) {
      return normalize([
        el.textContent,
        el.dataset.cat || '',
        el.getAttribute('href') || ''
      ].join(' '));
    }

    const empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.hidden = true;
    empty.innerHTML = '<b></b><p></p><button class="btn btn-ghost btn-sm" type="button"></button>';
    grid.insertAdjacentElement('afterend', empty);
    const emptyTitle = $('b', empty), emptyText = $('p', empty), emptyBtn = $('button', empty);

    function reset() {
      state.q = '';
      state.cat = 'all';
      state.sort = 'featured';
      if (search) search.value = '';
      if (sort) sort.value = 'featured';
      chips.forEach(c => {
        const on = c.dataset.filter === 'all';
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      apply();
    }
    emptyBtn.addEventListener('click', reset);

    function apply() {
      const query = normalize(state.q).trim();
      let visible = 0;
      for (const el of items) {
        const cats = (el.dataset.cat || '').split(/\s+/);
        const matchesCat = state.cat === 'all' || cats.includes(state.cat);
        const matchesText = !query || hayOf(el).includes(query);
        const show = matchesCat && matchesText;
        el.classList.toggle('hide', !show);
        if (show) visible++;
      }

      const nameOf = el => normalize((($('h3', el) || {}).textContent) || '');
      const rank = el => {
        const name = nameOf(el);
        if (name.startsWith(query)) return 0;
        if (name.includes(query)) return 1;
        return 2;
      };
      const sorted = items.slice().sort((a, b) => {
        if (query) {
          const diff = rank(a) - rank(b);
          if (diff) return diff;
        }
        if (state.sort === 'name') {
          return (($('h3', a) || {}).textContent || '').localeCompare(($('h3', b) || {}).textContent || '', 'de');
        }
        if (state.sort === 'price-asc') return priceOf(a) - priceOf(b) || original.get(a) - original.get(b);
        if (state.sort === 'price-desc') return priceOf(b) - priceOf(a) || original.get(a) - original.get(b);
        return original.get(a) - original.get(b);
      });
      sorted.forEach(el => grid.appendChild(el));

      if (count) {
        count.textContent = lang() === 'en'
          ? `${visible} of ${items.length} products`
          : `${visible} von ${items.length} Produkten`;
      }

      const none = visible === 0;
      empty.hidden = !none;
      emptyTitle.textContent = T('Keine Treffer', 'No matches');
      emptyText.textContent = T('Andere Suche oder Filter zurücksetzen.', 'Try another search or reset the filters.');
      emptyBtn.textContent = T('Filter zurücksetzen', 'Reset filters');

      const p = new URLSearchParams(location.search);
      state.q ? p.set('q', state.q) : p.delete('q');
      state.cat !== 'all' ? p.set('cat', state.cat) : p.delete('cat');
      state.sort !== 'featured' ? p.set('sort', state.sort) : p.delete('sort');
      const next = location.pathname + (p.toString() ? '?' + p.toString() : '') + location.hash;
      history.replaceState(null, '', next);

      document.dispatchEvent(new CustomEvent('bw:shop', { detail: { visible, total: items.length } }));
    }

    chips.forEach(chip => chip.addEventListener('click', () => {
      state.cat = chip.dataset.filter || 'all';
      chips.forEach(c => {
        c.classList.toggle('active', c === chip);
        c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
      });
      apply();
    }));

    let timer;
    if (search) search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = search.value; apply(); }, 90);
    });
    if (sort) sort.addEventListener('change', () => { state.sort = sort.value; apply(); });
    document.addEventListener('bw:lang', () => apply());

    /* Recently viewed */
    const recentWrap = $('#recent-wrap');
    const recentRow = $('#recent-row');
    if (recentWrap && recentRow) {
      const renderRecent = () => {
        const list = store.get('bw-recent-products', []).filter(p => p && p.url);
        recentRow.innerHTML = '';
        if (!list.length) { recentWrap.hidden = true; return; }
        recentWrap.hidden = false;
        for (const product of list.slice(0, 4)) {
          const a = document.createElement('a');
          a.className = 'mini-prod';
          a.href = product.url;
          a.innerHTML = `<img alt=""><span><span class="mp-t"></span><span class="mp-p"></span></span>`;
          const img = $('img', a);
          if (product.img) img.src = product.img; else img.remove();
          $('.mp-t', a).textContent = product.title || '';
          $('.mp-p', a).textContent = product.price || '';
          recentRow.appendChild(a);
        }
      };
      renderRecent();
      const clear = $('#recent-clear');
      if (clear) clear.addEventListener('click', () => {
        store.set('bw-recent-products', []);
        renderRecent();
      });
    }

    apply();
  })();

  /* ---------- Product detail: sticky buy bar + share + recently viewed ---------- */
  (function productDetail() {
    const info = $('.pd-info');
    if (!info) return;
    const titleEl = $('h1', info);
    const priceEl = $('.pd-price .amount', info);
    const buy = $('.pd-buy', info);
    const buyBtn = buy ? $('.btn-primary', buy) : null;
    if (!titleEl || !buy) return;

    const title = titleEl.textContent.trim();
    const price = priceEl ? priceEl.textContent.trim() : '';
    const imgEl = $('.pd-thumb img') || $('.pd-hero img');
    const img = imgEl ? imgEl.getAttribute('src') : '';

    // Remember this product for the shop page.
    try {
      const slug = location.pathname.split('/').pop();
      const list = store.get('bw-recent-products', []).filter(p => p && p.url !== slug);
      list.unshift({ url: slug, title, price, img });
      store.set('bw-recent-products', list.slice(0, 6));
    } catch (_) {}

    // Share / copy link
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn btn-ghost btn-lg pd-share';
    share.innerHTML = `<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg><span></span>`;
    $('span', share).textContent = T('Link kopieren', 'Copy link');
    share.addEventListener('click', async () => {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        try { await navigator.share({ title, url: location.href }); return; } catch (_) {}
      }
      const ok = await copyText(location.href);
      flash(ok ? T('Link kopiert.', 'Link copied.') : T('Link konnte nicht kopiert werden.', 'Could not copy the link.'));
    });
    buy.appendChild(share);

    // Sticky buy bar
    const bar = document.createElement('div');
    bar.className = 'pd-sticky';
    bar.innerHTML = `<div class="pds-txt"><span class="pds-t"></span><span class="pds-p"></span></div><a class="btn btn-primary"></a>`;
    const barTitle = $('.pds-t', bar), barPrice = $('.pds-p', bar), barBtn = $('a', bar);
    barTitle.textContent = title;
    barPrice.textContent = price;
    barBtn.href = buyBtn ? buyBtn.getAttribute('href') : '#';
    barBtn.textContent = T('Kaufen', 'Buy');
    document.body.appendChild(bar);

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = buy.getBoundingClientRect();
      const footer = $('.footer');
      const footerTop = footer ? footer.getBoundingClientRect().top : Infinity;
      const show = rect.bottom < 40 && footerTop > window.innerHeight * 0.7;
      bar.classList.toggle('show', show);
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();

    document.addEventListener('bw:lang', () => {
      // Der Preis stand beim Aufbau in der Landessprache fest. Nach dem
      // Umschalten wird er neu aus der Preiszeile gelesen — die hat ein
      // data-en und ist damit schon übersetzt.
      const current = $('.pd-price .amount', info);
      if (current) barPrice.textContent = current.textContent.trim();
      barBtn.textContent = T('Kaufen', 'Buy');
      $('span', share).textContent = T('Link kopieren', 'Copy link');
      share.setAttribute('aria-label', T('Link kopieren', 'Copy link'));
    });
  })();

  /* ---------- Project configurator ---------- */
  (function configurator() {
    const root = $('#configurator');
    if (!root) return;

    const steps = $$('.cfg-step', root);
    const dots = $$('.cfg-progress span', root);
    const next = $('[data-cfg-next]', root);
    const back = $('[data-cfg-back]', root);
    const done = $('.cfg-done', root);
    const progress = $('.cfg-progress', root);
    const nav = $('.cfg-nav', root);
    const mails = $$('[data-cfg-mail]', root);
    const contacts = $$('[data-cfg-contact]', root);
    const sum = $('.cfg-sum', root);
    const recName = $('#cfg-rec-name', root);
    const recSub = $('#cfg-rec-sub', root);
    const recK = $('#cfg-rec-k', root);

    const state = { type: 'website', scope: 'small', extras: [], timing: 'normal' };
    let step = 0;
    let completed = false;

    const TYPE = { website: ['Website & Auftritt', 'Website & presence', 'Web-Entwicklung'], webapp: ['Web-App', 'Web app', 'Web-Entwicklung'], app: ['App (Windows / Mobile)', 'App (Windows / mobile)', 'App-Entwicklung'], software: ['Software & Automatisierung', 'Software & automation', 'Softwareentwicklung'], game: ['Spiel / digitales Produkt', 'Game / digital product', 'Game / Digitales Produkt'], it: ['IT & Betrieb', 'IT & operations', 'IT-Dienstleistung'] };
    const SCOPE = { small: ['Klein', 'Small'], medium: ['Mittel', 'Medium'], large: ['Groß', 'Large'] };
    const TIMING = { flexible: ['Flexibel', 'Flexible'], normal: ['In 2–3 Monaten', 'Within 2–3 months'], soon: ['So bald wie möglich', 'As soon as possible'] };
    const EXTRA = { login: ['Login & Konten', 'Login & accounts'], payments: ['Zahlungen', 'Payments'], design: ['Design & Branding', 'Design & branding'], care: ['Betreuung nach Launch', 'Care after launch'] };

    function pick(key, value) {
      state[key] = value;
      $$(`.cfg-opt[data-key="${key}"]`, root).forEach(btn => {
        btn.setAttribute('aria-pressed', btn.dataset.val === value ? 'true' : 'false');
      });
      update();
    }

    function toggleExtra(value, pressed) {
      if (pressed && !state.extras.includes(value)) state.extras.push(value);
      if (!pressed) state.extras = state.extras.filter(v => v !== value);
      update();
    }

    $$('.cfg-opt', root).forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const value = btn.dataset.val;
        if (btn.dataset.multi !== undefined) {
          const pressed = btn.getAttribute('aria-pressed') !== 'true';
          btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
          toggleExtra(value, pressed);
        } else {
          pick(key, value);
        }
      });
    });

    function recommendation() {
      if (state.type === 'it') {
        return { pkg: T('IT & Betrieb', 'IT & operations'), name: T('Betreuung & Ausbau', 'Care & growth'), sub: T('Monatlich, Umfang nach Absprache', 'Monthly, scope agreed') };
      }
      if (state.type === 'website' && state.scope === 'small' && !state.extras.includes('login') && !state.extras.includes('payments')) {
        return { pkg: T('Paket 01', 'Package 01'), name: T('Website & Auftritt', 'Website & presence'), sub: T('Typisch 2–4 Wochen', 'Typically 2–4 weeks') };
      }
      const time = state.type === 'game' ? T('Typisch 8–12+ Wochen', 'Typically 8–12+ weeks') : T('Typisch 6–12 Wochen', 'Typically 6–12 weeks');
      return { pkg: T('Paket 02', 'Package 02'), name: T('Web-App & Software', 'Web app & software'), sub: time };
    }

    function rows() {
      return [
        [T('Projektart', 'Project type'), TYPE[state.type][lang() === 'en' ? 1 : 0]],
        [T('Umfang', 'Scope'), SCOPE[state.scope][lang() === 'en' ? 1 : 0]],
        [T('Extras', 'Extras'), state.extras.length ? state.extras.map(e => EXTRA[e][lang() === 'en' ? 1 : 0]).join(', ') : T('Keine', 'None')],
        [T('Zeitrahmen', 'Timing'), TIMING[state.timing][lang() === 'en' ? 1 : 0]]
      ];
    }

    function brief() {
      return rows().map(([k, v]) => `${k}: ${v}`).join('\n') + '\n' + T('Empfehlung', 'Recommendation') + ': ' + recommendation().name;
    }

    function update() {
      const rec = recommendation();
      if (sum) {
        sum.innerHTML = '';
        for (const [k, v] of rows()) {
          const row = document.createElement('div');
          row.className = 'cs-row';
          const kk = document.createElement('span'); kk.className = 'cs-k'; kk.textContent = k;
          const vv = document.createElement('span'); vv.className = 'cs-v'; vv.textContent = v;
          row.append(kk, vv);
          sum.appendChild(row);
        }
      }
      if (recK) recK.textContent = rec.pkg;
      if (recName) recName.textContent = rec.name;
      if (recSub) recSub.textContent = rec.sub;

      const subject = encodeURIComponent(T('Projektanfrage über den Konfigurator', 'Project request from the configurator'));
      const body = encodeURIComponent(T('Hallo Bytewerk Studio,\n\n', 'Hello Bytewerk Studio,\n\n') + brief() + T('\n\nViele Grüße', '\n\nBest regards'));
      mails.forEach(el => { el.href = 'mailto:Haqmalh@icloud.com?subject=' + subject + '&body=' + body; });

      const type = TYPE[state.type][2];
      const briefing = brief();
      contacts.forEach(el => { el.href = 'kontakt.html?typ=' + encodeURIComponent(type) + '&briefing=' + encodeURIComponent(briefing); });
    }

    function showStep(index) {
      step = Math.max(0, Math.min(steps.length - 1, index));
      steps.forEach((el, i) => el.classList.toggle('active', i === step));
      dots.forEach((dot, i) => dot.classList.toggle('done', i <= step));
      if (back) back.hidden = step === 0;
      if (next) {
        next.textContent = step === steps.length - 1
          ? T('Ergebnis ansehen', 'See result')
          : T('Weiter', 'Continue');
      }
    }

    const edit = $('[data-cfg-edit]', root);
    if (edit) edit.addEventListener('click', () => {
      completed = false;
      if (done) done.hidden = true;
      if (progress) progress.hidden = false;
      if (nav) nav.hidden = false;
      showStep(0);
      update();
    });

    if (next) next.addEventListener('click', () => {
      if (step < steps.length - 1) { showStep(step + 1); return; }
      completed = true;
      steps.forEach(el => el.classList.remove('active'));
      if (progress) progress.hidden = true;
      if (nav) nav.hidden = true;
      if (done) done.hidden = false;
      const target = $('#cfg-result', root);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (back) back.addEventListener('click', () => showStep(step - 1));

    document.addEventListener('bw:lang', () => { if (!completed) showStep(step); update(); });
    showStep(0);
    update();
  })();

  /* ---------- Contact prefill from the configurator ---------- */
  (function contactPrefill() {
    const form = $('#contact-form');
    if (!form) return;
    const params = new URLSearchParams(location.search);
    const type = params.get('typ');
    const briefing = params.get('briefing');
    if (!type && !briefing) return;

    const select = $('#type', form);
    const message = $('#message', form);
    if (select && type) {
      const option = Array.from(select.options).find(o => o.value === type || o.textContent.trim() === type);
      if (option) select.value = option.value;
    }
    if (message && briefing) message.value = briefing;

    const note = document.createElement('div');
    note.className = 'auth-mode-note';
    note.style.marginBottom = '18px';
    note.textContent = T('Aus dem Projekt-Konfigurator übernommen. Du kannst alles noch anpassen.', 'Prefilled from the project configurator. You can still adjust everything.');
    const grid = $('.form-grid', form);
    if (grid) grid.insertAdjacentElement('beforebegin', note);
  })();
})();
