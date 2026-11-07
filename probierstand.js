/* ============================================================
   BYTEWERK STUDIO — probierstand.js
   ------------------------------------------------------------
   Four working tools, no backend:
     01 password forge   — crypto.getRandomValues
     02 countdown        — localStorage
     03 text workshop    — local string repair
     04 week board       — localStorage

   The 3D bench (scene-probierstand.js) listens to `pb:tool`.
   Everything degrades to plain, usable markup.
   ============================================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* Dynamic strings live here so the DE/EN switch reaches them too. */
  const STRINGS = {
    de: {
      weak: 'schwach', solid: 'solide', strong: 'stark', veryStrong: 'sehr stark',
      unbreakable: 'länger als das Universum alt ist', underSecond: 'unter einer Sekunde',
      seconds: 'Sekunden', minutes: 'Minuten', hours: 'Stunden', days: 'Tage',
      years: 'Jahre', millennia: 'Jahrtausende', millionYears: 'Millionen Jahre', billionYears: 'Milliarden Jahre',
      roughly: 'rund ', remaining: ' Tage verbleibend', past: 'Termin vorbei', start: 'Start ',
      tasksOne: ' Aufgabe', tasksMany: ' Aufgaben', doneSuffix: ' · ', doneWord: ' erledigt',
      copied: 'Kopiert', copyFail: 'Kopieren nicht möglich', pwCopied: 'Passwort kopiert',
      needSet: 'Bitte mindestens einen Zeichensatz wählen', nothingToDo: 'Nichts zu ändern',
      cleaned: 'Aufgeräumt', cleared: 'Geleert', noText: 'Kein Text zum Kopieren',
      textCopied: 'Text kopiert', added: 'Aufgabe hinzugefügt', weekCleared: 'Woche geleert',
      daysSet: ' Tage gesetzt', newTask: 'Neue Aufgabe', taskPlaceholder: 'Aufgabe …',
      markOpen: 'Als offen markieren: ', markDone: 'Als erledigt markieren: ',
      deleteTask: 'Aufgabe löschen: ', addFor: 'Aufgabe für ', addLabel: ' hinzufügen'
    },
    en: {
      weak: 'weak', solid: 'solid', strong: 'strong', veryStrong: 'very strong',
      unbreakable: 'longer than the universe has existed', underSecond: 'under a second',
      seconds: 'seconds', minutes: 'minutes', hours: 'hours', days: 'days',
      years: 'years', millennia: 'millennia', millionYears: 'million years', billionYears: 'billion years',
      roughly: 'about ', remaining: ' days left', past: 'Date has passed', start: 'Started ',
      tasksOne: ' task', tasksMany: ' tasks', doneSuffix: ' · ', doneWord: ' done',
      copied: 'Copied', copyFail: 'Copy failed', pwCopied: 'Password copied',
      needSet: 'Pick at least one character set', nothingToDo: 'Nothing to change',
      cleaned: 'Cleaned up', cleared: 'Cleared', noText: 'No text to copy',
      textCopied: 'Text copied', added: 'Task added', weekCleared: 'Week cleared',
      daysSet: ' days set', newTask: 'New task', taskPlaceholder: 'Task …',
      markOpen: 'Mark as open: ', markDone: 'Mark as done: ',
      deleteTask: 'Delete task: ', addFor: 'Add task for ', addLabel: ''
    }
  };

  function t(key) {
    const lang = document.documentElement.lang === 'en' ? 'en' : 'de';
    return STRINGS[lang][key] || STRINGS.de[key] || key;
  }

  function locale() {
    return document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE';
  }

  /* ---------------- Toast ---------------- */
  const toastEl = $('[data-toast]');
  let toastTimer = 0;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
  }

  /* ---------------- Clipboard ---------------- */
  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(label || t('copied'));
      return true;
    } catch (err) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'pb-offscreen';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(area);
      toast(ok ? (label || t('copied')) : t('copyFail'));
      return ok;
    }
  }

  /* ============================================================
     01 — Password forge
     ============================================================ */
  const pwOut = $('[data-pw-out]');
  const SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!?@#$%&*+-=_'
  };
  const AMBIGUOUS = /[O0Il1|`'"]/g;

  function randomInt(max) {
    if (max <= 0) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    let value;
    do {
      crypto.getRandomValues(buf);
      value = buf[0];
    } while (value >= limit);
    return value % max;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function activeSets() {
    return $$('[data-pw-set]').filter(input => input.checked && SETS[input.dataset.pwSet])
      .map(input => SETS[input.dataset.pwSet]);
  }

  function clean(set) {
    const plain = $('[data-pw-set="plain"]');
    return plain && plain.checked ? set.replace(AMBIGUOUS, '') : set;
  }

  function entropyLabel(bits) {
    if (bits < 40) return { score: 1, label: t('weak') };
    if (bits < 60) return { score: 2, label: t('solid') };
    if (bits < 80) return { score: 3, label: t('strong') };
    return { score: 4, label: t('veryStrong') };
  }

  function crackTime(bits) {
    const seconds = Math.pow(2, bits - 1) / 1e12;
    if (!isFinite(seconds)) return t('unbreakable');
    const units = [
      [1, t('seconds'), 1],
      [60, t('minutes'), 60],
      [3600, t('hours'), 3600],
      [86400, t('days'), 86400],
      [31536000, t('years'), 31536000],
      [31536000 * 1000, t('millennia'), 31536000 * 1000],
      [31536000 * 1e6, t('millionYears'), 31536000 * 1e6],
      [31536000 * 1e9, t('billionYears'), 31536000 * 1e9]
    ];
    if (seconds < 1) return t('underSecond');
    let unit = units[0];
    for (const candidate of units) {
      if (seconds >= candidate[0]) unit = candidate;
    }
    let value = seconds / unit[2];
    let digits = 0;
    while (value >= 1000 && unit !== units[units.length - 1]) {
      unit = units[units.indexOf(unit) + 1];
      value = seconds / unit[2];
    }
    if (value >= 1e6) return t('unbreakable');
    digits = value >= 100 ? 0 : 1;
    const rounded = value.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    return t('roughly') + rounded + ' ' + unit[1];
  }

  function buildPassword() {
    if (!pwOut) return;

    const lengthInput = $('[data-pw-len]');
    const length = Number(lengthInput ? lengthInput.value : 20);
    const sets = activeSets().map(clean).filter(Boolean);

    if (!sets.length) {
      toast(t('needSet'));
      return;
    }

    const pool = sets.join('');
    const chars = [];

    /* One character from every selected set, so no set is decorative. */
    sets.forEach(set => {
      if (set.length) chars.push(set.charAt(randomInt(set.length)));
    });

    while (chars.length < length) {
      chars.push(pool.charAt(randomInt(pool.length)));
    }
    shuffle(chars);
    let password = chars.slice(0, length).join('');

    /* Grouped output is easier to read aloud and to type. */
    const grouped = $('[data-pw-set="words"]');
    if (grouped && grouped.checked) {
      password = password.replace(/(.{4})(?=.)/g, '$1-');
    }

    pwOut.textContent = password;
    pwOut.classList.remove('is-copied');

    /* Entropy from the raw pool, grouping does not add or remove bits. */
    const bits = Math.round(length * Math.log2(pool.length));
    const bitsEl = $('[data-pw-bits]');
    if (bitsEl) bitsEl.textContent = String(bits);
    const timeEl = $('[data-pw-time]');
    if (timeEl) timeEl.textContent = crackTime(bits);

    const strength = entropyLabel(bits);
    const labelEl = $('[data-pw-label]');
    if (labelEl) labelEl.textContent = strength.label;
    const bars = $('[data-pw-bars]');
    if (bars) bars.dataset.score = String(strength.score);

    const slider = $('[data-pw-len]');
    if (slider) slider.style.setProperty('--fill', ((length - 12) / 36) * 100 + '%');
  }

  const pwLength = $('[data-pw-len]');
  const pwLengthOut = $('[data-pw-len-out]');
  if (pwLength) {
    pwLength.addEventListener('input', () => {
      if (pwLengthOut) pwLengthOut.textContent = pwLength.value;
      pwLength.style.setProperty('--fill', ((Number(pwLength.value) - 12) / 36) * 100 + '%');
      buildPassword();
    });
  }
  $$('[data-pw-set]').forEach(input => input.addEventListener('change', buildPassword));

  const pwNew = $('[data-pw-new]');
  if (pwNew) pwNew.addEventListener('click', buildPassword);

  const pwCopy = $('[data-pw-copy]');
  if (pwCopy) {
    pwCopy.addEventListener('click', async () => {
      if (!pwOut || !pwOut.textContent || pwOut.textContent === '—') return;
      const ok = await copyText(pwOut.textContent, t('pwCopied'));
      if (ok) pwOut.classList.add('is-copied');
    });
  }

  if (pwOut) buildPassword();

  /* ============================================================
     02 — Countdown
     ============================================================ */
  const CD_KEY = 'bw-probier-countdown';
  const cdTitle = $('#pb-cd-title');
  const cdDate = $('[data-cd-date]');

  function toLocalInput(date) {
    const pad = n => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function defaultTarget() {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  const state = {
    title: 'Prüfung',
    target: defaultTarget(),
    created: new Date()
  };

  try {
    const saved = JSON.parse(localStorage.getItem(CD_KEY) || 'null');
    if (saved && saved.target) {
      state.title = saved.title || state.title;
      state.target = new Date(saved.target);
      state.created = saved.created ? new Date(saved.created) : new Date();
    }
  } catch (err) { /* first visit or blocked storage */ }

  if (cdTitle) cdTitle.value = state.title;
  if (cdDate) cdDate.value = toLocalInput(state.target);

  function saveCountdown() {
    try {
      localStorage.setItem(CD_KEY, JSON.stringify({
        title: state.title,
        target: state.target.toISOString(),
        created: state.created.toISOString()
      }));
    } catch (err) { /* private mode */ }
  }

  const cd = {
    d: $('[data-cd-d]'), h: $('[data-cd-h]'), m: $('[data-cd-m]'), s: $('[data-cd-s]'),
    bar: $('[data-cd-bar]'), since: $('[data-cd-since]'), left: $('[data-cd-left]')
  };

  function two(n) { return String(n).padStart(2, '0'); }

  function formatDate(d) {
    return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function tick() {
    const now = Date.now();
    const diff = state.target.getTime() - now;

    let days = 0, hours = 0, minutes = 0, seconds = 0;
    if (diff > 0) {
      days = Math.floor(diff / 86400000);
      hours = Math.floor(diff / 3600000) % 24;
      minutes = Math.floor(diff / 60000) % 60;
      seconds = Math.floor(diff / 1000) % 60;
    }

    if (cd.d) cd.d.textContent = String(days);
    if (cd.h) cd.h.textContent = two(hours);
    if (cd.m) cd.m.textContent = two(minutes);
    if (cd.s) cd.s.textContent = two(seconds);

    const span = state.target.getTime() - state.created.getTime();
    const done = span > 0 ? Math.min(1, Math.max(0, (now - state.created.getTime()) / span)) : 1;
    if (cd.bar) cd.bar.style.width = Math.max(2, done * 100).toFixed(1) + '%';
    if (cd.since) cd.since.textContent = t('start') + formatDate(state.created);
    if (cd.left) {
      cd.left.textContent = diff > 0 ? days + t('remaining') : t('past');
    }
  }

  if (cdDate) {
    cdDate.addEventListener('change', () => {
      const value = cdDate.value ? new Date(cdDate.value) : defaultTarget();
      if (isNaN(value.getTime())) return;
      state.target = value;
      state.created = new Date();
      saveCountdown();
      tick();
    });
  }

  if (cdTitle) {
    cdTitle.addEventListener('input', () => {
      state.title = cdTitle.value.slice(0, 60);
      saveCountdown();
    });
  }

  $$('[data-cd-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.cdPreset);
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(9, 0, 0, 0);
      state.target = d;
      state.created = new Date();
      if (cdDate) cdDate.value = toLocalInput(d);
      saveCountdown();
      tick();
      toast(days + t('daysSet'));
    });
  });

  const cdReset = $('[data-cd-reset]');
  if (cdReset) {
    cdReset.addEventListener('click', () => {
      state.target = defaultTarget();
      state.created = new Date();
      if (cdDate) cdDate.value = toLocalInput(state.target);
      saveCountdown();
      tick();
    });
  }

  if (cd.d) {
    tick();
    setInterval(tick, 1000);
  }

  /* ============================================================
     03 — Text workshop
     ============================================================ */
  const txArea = $('[data-tx-area]');

  function textStats(value) {
    const trimmed = value.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const paras = trimmed ? trimmed.split(/\n\s*\n/).filter(p => p.trim()).length : 0;
    const chars = value.length;
    const minutes = words ? Math.max(1, Math.round(words / 200)) : 0;
    return { words, chars, paras, minutes };
  }

  function updateStats() {
    if (!txArea) return;
    const stats = textStats(txArea.value);
    const w = $('[data-stat-words]');
    const c = $('[data-stat-chars]');
    const p = $('[data-stat-paras]');
    const t = $('[data-stat-time]');
    if (w) w.textContent = stats.words.toLocaleString(locale());
    if (c) c.textContent = stats.chars.toLocaleString(locale());
    if (p) p.textContent = String(stats.paras);
    if (t) t.textContent = stats.minutes ? stats.minutes + ' min' : '0 min';
  }

  const transforms = {
    hyphen(text) {
      return text
        .replace(/\u00AD/g, '')
        .replace(/([A-Za-zÄÖÜäöüß])-[ \t]*\n[ \t]*([a-zäöüß])/g, '$1$2')
        .replace(/([A-Za-zÄÖÜäöüß])-[ \t]*\n[ \t]*([A-Za-zÄÖÜäöüß])/g, '$1$2');
    },
    lines(text) {
      return text
        .replace(/\r\n?/g, '\n')
        .replace(/([^\n])\n(?!\n)/g, '$1 ')
        .replace(/[ \t]{2,}/g, ' ');
    },
    space(text) {
      return text
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  };

  function applyTransform(kind) {
    if (!txArea) return;

    if (kind === 'clear') {
      txArea.value = '';
      updateStats();
      toast(t('cleared'));
      return;
    }

    const before = txArea.value;
    let after = before;

    if (kind === 'all') {
      after = transforms.space(transforms.lines(transforms.hyphen(before)));
    } else if (transforms[kind]) {
      after = transforms[kind](before);
    }

    if (after === before) {
      toast(t('nothingToDo'));
      return;
    }

    txArea.value = after;
    updateStats();
    txArea.classList.add('is-flash');
    setTimeout(() => txArea.classList.remove('is-flash'), 700);
    toast(t('cleaned'));
  }

  $$('[data-tx]').forEach(btn => {
    btn.addEventListener('click', () => applyTransform(btn.dataset.tx));
  });

  if (txArea) {
    txArea.addEventListener('input', updateStats);
    updateStats();
  }

  const txCopy = $('[data-tx-copy]');
  if (txCopy) {
    txCopy.addEventListener('click', () => {
      if (!txArea || !txArea.value.trim()) {
        toast(t('noText'));
        return;
      }
      copyText(txArea.value, t('textCopied'));
    });
  }

  /* ============================================================
     04 — Week board
     ============================================================ */
  const WEEK_KEY = 'bw-probier-week';
  const weekEl = $('[data-week]');
  function dayNames() {
    return document.documentElement.lang === 'en'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  }

  function isoDay(date) {
    const pad = n => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function readWeek() {
    try {
      const raw = JSON.parse(localStorage.getItem(WEEK_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (err) {
      return {};
    }
  }

  function writeWeek(data) {
    try {
      localStorage.setItem(WEEK_KEY, JSON.stringify(data));
    } catch (err) { /* private mode */ }
  }

  const week = readWeek();
  const monday = startOfWeek(new Date());
  const todayIso = isoDay(new Date());

  function saveAndRender() {
    writeWeek(week);
    renderWeek();
  }

  function renderWeek() {
    if (!weekEl) return;
    const previousFocus = document.activeElement;
    const focusDay = previousFocus && previousFocus.dataset ? previousFocus.dataset.day : null;

    weekEl.textContent = '';
    let total = 0;
    let done = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const iso = isoDay(date);
      const tasks = Array.isArray(week[iso]) ? week[iso] : [];

      const day = document.createElement('div');
      day.className = 'pb-day' + (iso === todayIso ? ' is-today' : '');

      const head = document.createElement('div');
      head.className = 'pb-day-head';
      const name = document.createElement('b');
      name.textContent = dayNames()[i];
      const number = document.createElement('span');
      number.textContent = String(date.getDate()).padStart(2, '0');
      head.append(name, number);

      const list = document.createElement('ul');
      list.className = 'pb-day-list';

      tasks.forEach((task, index) => {
        total++;
        if (task.d) done++;

        const item = document.createElement('li');
        item.className = 'pb-task' + (task.d ? ' is-done' : '');

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = task.t;
        toggle.className = 'pb-task-toggle';
        toggle.setAttribute('aria-pressed', String(!!task.d));
        toggle.setAttribute('aria-label', (task.d ? t('markOpen') : t('markDone')) + task.t);
        toggle.addEventListener('click', () => {
          task.d = !task.d;
          saveAndRender();
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', t('deleteTask') + task.t);
        remove.addEventListener('click', () => {
          tasks.splice(index, 1);
          if (!tasks.length) delete week[iso];
          saveAndRender();
        });

        item.append(toggle, remove);
        list.appendChild(item);
      });

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'pb-day-add';
      add.textContent = '+';
      add.dataset.day = iso;
      add.setAttribute('aria-label', t('addFor') + dayNames()[i] + t('addLabel'));
      add.addEventListener('click', () => openForm(day, iso, add));

      day.append(head, list, add);
      weekEl.appendChild(day);
    }

    const summary = $('[data-week-summary]');
    if (summary) {
      summary.textContent = total + (total === 1 ? t('tasksOne') : t('tasksMany')) +
        (done ? t('doneSuffix') + done + t('doneWord') : '');
    }

    if (focusDay) {
      const again = weekEl.querySelector('[data-day="' + focusDay + '"]');
      if (again) again.focus();
    }
  }

  function openForm(day, iso, addButton) {
    const form = document.createElement('form');
    form.className = 'pb-day-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.setAttribute('aria-label', t('newTask'));
    input.placeholder = t('taskPlaceholder');

    form.appendChild(input);
    addButton.replaceWith(form);
    input.focus();

    let committed = false;

    const commit = () => {
      if (committed) return;
      committed = true;
      const value = input.value.trim();
      if (value) {
        if (!Array.isArray(week[iso])) week[iso] = [];
        week[iso].push({ t: value, d: false });
        saveAndRender();
        toast(t('added'));
      } else {
        renderWeek();
      }
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      commit();
    });
    input.addEventListener('blur', () => {
      if (!committed) commit();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        committed = true;
        renderWeek();
      }
    });
  }

  const weekClear = $('[data-week-clear]');
  if (weekClear) {
    weekClear.addEventListener('click', () => {
      Object.keys(week).forEach(key => delete week[key]);
      saveAndRender();
      toast(t('weekCleared'));
    });
  }

  if (weekEl) renderWeek();

  /* ============================================================
     Tabs + bench sync
     ============================================================ */
  const tablist = $('[data-pb-tabs]');
  const labels = {
    pw: 'Passwort-Schmiede',
    cd: 'Prüfungs-Countdown',
    text: 'Text-Werkstatt',
    week: 'Wochenbrett'
  };

  function selectTab(tool, focus) {
    if (!tablist) return;
    const tabs = $$('[role="tab"]', tablist);
    const target = tabs.find(tab => tab.id === 'pb-tab-' + tool) || tabs[0];
    if (!target) return;

    tabs.forEach(tab => {
      const active = tab === target;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) {
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
      }
    });

    $$('[data-bench-pick]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.benchPick === tool));
    });
    const label = $('[data-bench-label]');
    if (label) label.textContent = labels[tool] || '';

    document.dispatchEvent(new CustomEvent('pb:tool', { detail: { tool } }));
    if (focus) target.focus();
  }

  if (tablist) {
    const tabs = $$('[role="tab"]', tablist);

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab.id.replace('pb-tab-', ''), false));
      tab.addEventListener('keydown', (e) => {
        let next = -1;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === -1) return;
        e.preventDefault();
        selectTab(tabs[next].id.replace('pb-tab-', ''), true);
      });
    });
  }

  /* Bench picks and fallback cards jump to the workbench and select a tool. */
  $$('[data-goto]').forEach(el => {
    el.addEventListener('click', (e) => {
      const tool = el.dataset.goto;
      if (!tool) return;
      e.preventDefault();
      selectTab(tool, false);
      const work = document.getElementById('werkzeuge');
      if (work) {
        const top = work.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      const tab = document.getElementById('pb-tab-' + tool);
      if (tab) setTimeout(() => tab.focus({ preventScroll: true }), reduceMotion ? 0 : 420);
    });
  });

  /* Deep link: probierstand.html#pb-panel-week */
  const hash = (location.hash || '').replace('#', '');
  if (hash && hash.indexOf('pb-panel-') === 0) {
    selectTab(hash.replace('pb-panel-', ''), false);
  }

  /* Language switch swaps innerHTML; re-render dynamic bits afterwards. */
  document.addEventListener('bw:lang', () => {
    const selected = tablist ? tablist.querySelector('[role="tab"][aria-selected="true"]') : null;
    if (selected) {
      const tool = selected.id.replace('pb-tab-', '');
      document.dispatchEvent(new CustomEvent('pb:tool', { detail: { tool } }));
    }
    buildPassword();
    tick();
    renderWeek();
  });

  /* Expose a tiny hook for the 3D bench. */
  window.bwProbier = { selectTool: selectTab, labels };
})();
