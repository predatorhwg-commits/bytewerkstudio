/* App finder — page specific */
(function () {
  'use strict';
  const root = document.getElementById('app-finder');
  if (!root) return;
  const result = document.getElementById('finder-result');
  const grid = document.getElementById('fr-grid');
  const title = document.getElementById('fr-title');
  const count = document.getElementById('fr-count');
  const reset = document.getElementById('fr-reset');

  const lang = () => (document.documentElement.lang || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';
  const T = (de, en) => lang() === 'en' ? en : de;

  const PRODUCTS = [
    { name: 'Lernreich', url: 'produkt.html', icon: 'media/lernreich-logo.png', price: 0, label: { de: 'Kostenlos', en: 'Free' }, platform: ['windows'], goals: ['learn'], why: { de: 'Fokus-Timer, XP, Streaks und Heatmap', en: 'Focus timer, XP, streaks and heatmap' } },
    { name: 'Prüfungs-Countdown', url: 'pruefungs-countdown.html', icon: 'media/pruefungs-countdown-logo.png', price: 0, label: { de: 'Kostenlos', en: 'Free' }, platform: ['windows'], goals: ['learn', 'plan'], why: { de: 'Prüfungstermine, Lernziele und Countdown', en: 'Exam dates, learning goals and countdown' } },
    { name: 'Lernreich Pro', url: 'lernreich-pro.html', icon: 'media/lernreich-pro-icon.svg', price: 9.99, label: { de: '9,99 €', en: '€9.99' }, platform: ['windows'], goals: ['learn'], why: { de: 'Fokus plus Lernstadt, Journal und SQLite', en: 'Focus plus learning city, journal and SQLite' } },
    { name: 'LumaWeek Planner', url: 'lumaweek-planner.html', icon: 'media/lumaweek-icon.svg', price: 5.99, label: { de: '5,99 €', en: '€5.99' }, platform: ['windows'], goals: ['plan'], why: { de: 'Wochen- und Jahresplanung mit PDF-Export', en: 'Weekly and yearly planning with PDF export' } },
    { name: 'KeyForge Vault', url: 'keyforge-vault.html', icon: 'media/keyforge-vault-icon.svg', price: 12.99, label: { de: '12,99 €', en: '€12.99' }, platform: ['windows'], goals: ['security'], why: { de: 'Passwörter offline, AES-256-GCM, Auto-Lock', en: 'Offline passwords, AES-256-GCM, auto-lock' } },
    { name: 'UpdatePilot', url: 'updatepilot.html', icon: 'media/updatepilot-icon.svg', price: 12.99, label: { de: '12,99 €', en: '€12.99' }, platform: ['windows'], goals: ['pc'], why: { de: 'Windows-Updates per winget, Blocklisten, Reports', en: 'Windows updates via winget, blocklists, reports' } },
    { name: 'Bytewerk PDF Text Pro', url: 'bytewerk-pdf-text-pro.html', icon: 'media/bytewerk-pdf-text-pro-icon.svg', price: 59, label: { de: '59,00 €', en: '€59.00' }, platform: ['windows'], goals: ['pc'], why: { de: 'PDF und OCR für gescannte Dokumente', en: 'PDF and OCR for scanned documents' } },
    { name: 'MASTIL', url: 'mastil.html', icon: 'media/mastil-logo.jpg', price: 0, label: { de: 'Demo frei', en: 'Free demo' }, platform: ['windows', 'browser'], goals: ['game'], why: { de: 'Strategie und Tower-Defense, Welle 1–5 frei', en: 'Strategy and tower defense, waves 1–5 free' } },
    { name: 'NEON HORDE', url: 'neon-horde/', icon: 'media/neon-horde-icon.svg', price: 0, label: { de: 'Kostenlos', en: 'Free' }, platform: ['browser'], goals: ['game'], why: { de: 'Schneller Wave-Shooter direkt im Browser', en: 'Fast wave shooter right in the browser' } },
    { name: 'BURGENWERK', url: 'burgenwerk.html', icon: 'media/burgenwerk-logo.png', price: 0, label: { de: 'Kostenlos', en: 'Free' }, platform: ['browser'], goals: ['game'], why: { de: 'Burg bauen und Wellen verteidigen', en: 'Build a castle and defend waves' } },
    { name: 'Neon Dominion', url: 'neon-dominion.html', icon: 'media/neon-dominion-icon.svg', price: 20, label: { de: '20,00 €', en: '€20.00' }, platform: ['windows'], goals: ['game'], why: { de: '30 Missionen, Achievements, Upgrade Lab', en: '30 missions, achievements, Upgrade Lab' } }
  ];

  const state = { goal: null, platform: 'windows', budget: 'any' };

  function paint() {
    if (!state.goal) { result.hidden = true; return; }
    const list = PRODUCTS.filter(p => {
      if (!p.goals.includes(state.goal)) return false;
      if (state.platform !== 'any' && !p.platform.includes(state.platform)) return false;
      if (state.budget === 'free' && p.price !== 0) return false;
      if (state.budget === 'low' && p.price > 15) return false;
      return true;
    }).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'de'));

    result.hidden = false;
    title.textContent = list.length
      ? T('Das passt zu deiner Auswahl', 'This matches your selection')
      : T('Dafür gibt es keine fertige App', 'No ready-made app for that');
    count.textContent = list.length === 1
      ? T('1 Produkt', '1 product')
      : (lang() === 'en' ? list.length + ' products' : list.length + ' Produkte');

    grid.innerHTML = '';
    if (!list.length) {
      const box = document.createElement('div');
      box.className = 'pick';
      box.innerHTML = '<div><div class="pk-t"></div><div class="pk-s"></div></div><a class="pk-p" href="kontakt.html"></a>';
      box.querySelector('.pk-t').textContent = T('Individuelle Lösung', 'Custom solution');
      box.querySelector('.pk-s').textContent = T('Beschreib kurz, was du brauchst — wir melden uns mit einer ehrlichen Einschätzung.', 'Describe what you need and we will reply with an honest assessment.');
      const link = box.querySelector('.pk-p');
      link.textContent = T('Anfragen →', 'Ask →');
      grid.appendChild(box);
      return;
    }

    for (const p of list) {
      const a = document.createElement('a');
      a.className = 'pick';
      a.href = p.url;
      a.innerHTML = '<img alt=""><span><span class="pk-t"></span><span class="pk-s"></span></span><span class="pk-p"></span>';
      a.querySelector('img').src = p.icon;
      a.querySelector('.pk-t').textContent = p.name;
      a.querySelector('.pk-s').textContent = p.why[lang()];
      a.querySelector('.pk-p').textContent = p.label[lang()];
      grid.appendChild(a);
    }
  }

  root.querySelectorAll('.fq-opts').forEach(group => {
    group.querySelectorAll('.fq-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.fq-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        state[group.dataset.group] = btn.dataset.val;
        paint();
      });
    });
  });

  reset.addEventListener('click', () => {
    state.goal = null;
    state.platform = 'windows';
    state.budget = 'any';
    root.querySelectorAll('.fq-opts').forEach(group => {
      group.querySelectorAll('.fq-opt').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
    });
    root.querySelector('[data-group="platform"] [data-val="windows"]').setAttribute('aria-pressed', 'true');
    root.querySelector('[data-group="budget"] [data-val="any"]').setAttribute('aria-pressed', 'true');
    result.hidden = true;
  });

  document.addEventListener('bw:lang', paint);
})();
