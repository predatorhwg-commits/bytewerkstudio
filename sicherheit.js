/* ============================================================
   BYTEWERK STUDIO — SICHERHEIT (06.11.2026)
   ------------------------------------------------------------
   Selbsttest, Maßnahmen-Tabs, Kopieren. Kein Framework, keine
   externen Anfragen, kein innerHTML für berechnete Inhalte.

   Speicher: localStorage['bw.security.check.v1']
   Nur die acht Antworten (0/1/2) und ein Zeitstempel.
   ============================================================ */

(function () {
  'use strict';

  const LANG_KEY = 'bw-lang';
  const STORE_KEY = 'bw.security.check.v1';
  const QUESTIONS = 8;
  const MAX_POINTS = QUESTIONS * 2;
  const RING = 2 * Math.PI * 52;

  const lang = function () {
    const stored = document.documentElement.lang;
    if (stored === 'en') return 'en';
    return 'de';
  };
  const t = function (de, en) { return lang() === 'en' ? en : de; };

  /* ---------- storage (defensive) ---------- */
  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.answers) || data.answers.length !== QUESTIONS) return null;
      const answers = data.answers.map(function (v) {
        return (v === 0 || v === 1 || v === 2) ? v : null;
      });
      return { answers: answers, at: typeof data.at === 'number' ? data.at : 0 };
    } catch (err) {
      return null;
    }
  }

  function writeStore(answers) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ answers: answers, at: Date.now() }));
    } catch (err) { /* storage full or blocked: the check still works */ }
  }

  function clearStore() {
    try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
  }

  /* ---------- copy ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  /* ---------- toast ---------- */
  const toastEl = document.querySelector('[data-toast]');
  let toastTimer = 0;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('is-on');
    }, 2400);
  }

  /* ============================================================
     1. Selbsttest
     ============================================================ */

  const form = document.querySelector('[data-check]');
  const resultBox = document.querySelector('[data-result]');
  const scoreEl = document.querySelector('[data-score]');
  const answeredEl = document.querySelector('[data-answered]');
  const ringEl = document.querySelector('[data-ring]');
  const levelEl = document.querySelector('[data-level-label]');
  const adviceEl = document.querySelector('[data-advice]');

  const ADVICE = [
    {
      de: 'Validierung gehört auf den Server. Der Browser ist Bedienkomfort, keine Kontrolle.',
      en: 'Validation belongs on the server. The browser is convenience, not control.'
    },
    {
      de: 'Nimm fremde Skripte aus der Seite. Eine CSP mit nur der eigenen Origin ist der schnellste Gewinn.',
      en: 'Remove third-party scripts. A CSP limited to your own origin is the fastest win.'
    },
    {
      de: 'Aktiviere Passkeys oder TOTP. Ein zweiter Faktor fängt die meisten Kontoübernahmen ab.',
      en: 'Turn on passkeys or TOTP. A second factor stops most account takeovers.'
    },
    {
      de: 'Prüfe jede Tabelle mit zwei Testkonten. Row Level Security ist keine UI-Frage.',
      en: 'Test every table with two accounts. Row level security is not a UI concern.'
    },
    {
      de: 'Teste einen Restore, nicht nur das Backup. Notiere die Dauer und wer ihn ausführt.',
      en: 'Test a restore, not just the backup. Write down how long it takes and who runs it.'
    },
    {
      de: 'Lege ein Patch-Fenster fest. Kritische Updates brauchen einen Termin, nicht nur eine Absicht.',
      en: 'Set a patch window. Critical updates need a date, not just an intention.'
    },
    {
      de: 'Entferne Token und personenbezogene Daten aus Logs. Ein Log ist eine zweite Kopie der Daten.',
      en: 'Remove tokens and personal data from logs. A log is a second copy of your data.'
    },
    {
      de: 'Veröffentliche security.txt und eine kurze Melde-Seite. Das kostet eine Stunde und spart Tage.',
      en: 'Publish security.txt and a short reporting page. One hour now saves days later.'
    }
  ];

  function answersFromForm() {
    const answers = [];
    for (let i = 0; i < QUESTIONS; i += 1) {
      const checked = form ? form.querySelector('input[name="sich-q' + i + '"]:checked') : null;
      answers.push(checked ? Number(checked.value) : null);
    }
    return answers;
  }

  function levelFor(score) {
    if (score < 50) {
      return {
        key: 'low',
        de: 'Offen. Eine Woche Arbeit entscheidet hier über viel.',
        en: 'Exposed. One week of work changes a lot here.'
      };
    }
    if (score < 80) {
      return {
        key: 'mid',
        de: 'Im Aufbau. Die Basis steht, aber es gibt offene Flanken.',
        en: 'In progress. The base holds, but the flanks are open.'
      };
    }
    return {
      key: 'high',
      de: 'Belastbar. Die Grundlagen sitzen — jetzt die Details.',
      en: 'Solid. The basics hold — now the details.'
    };
  }

  function render() {
    if (!form || !resultBox) return;

    const answers = answersFromForm();
    const answered = answers.filter(function (v) { return v !== null; }).length;
    const points = answers.reduce(function (sum, v) { return sum + (v === null ? 0 : v); }, 0);
    const provisional = answered < 4;
    const score = provisional ? 0 : Math.round((points / (answered * 2)) * 100);
    const level = levelFor(score);

    if (answeredEl) answeredEl.textContent = String(answered);

    if (scoreEl) scoreEl.textContent = provisional ? '—' : String(score);
    if (ringEl) {
      const shown = provisional ? 0 : score;
      ringEl.style.strokeDashoffset = String(RING * (1 - shown / 100));
    }

    resultBox.dataset.level = provisional ? 'none' : level.key;

    if (levelEl) {
      if (answered === 0) {
        levelEl.textContent = t(
          'Beantworte die Fragen, um deine Stufe zu sehen.',
          'Answer the questions to see your level.'
        );
      } else if (provisional) {
        levelEl.textContent = t(
          'Noch ' + (4 - answered) + ' Antworten für eine Einordnung.',
          (4 - answered) + ' more answers for a first reading.'
        );
      } else {
        levelEl.textContent = lang() === 'en' ? level.en : level.de;
      }
    }

    if (!adviceEl) return;
    adviceEl.textContent = '';

    if (answered === 0) {
      const p = document.createElement('p');
      p.className = 'sich-advice-empty';
      p.textContent = t(
        'Empfehlungen erscheinen hier, sobald du antwortest.',
        'Recommendations appear here as soon as you answer.'
      );
      adviceEl.appendChild(p);
      return;
    }

    const open = [];
    for (let i = 0; i < answers.length; i += 1) {
      if (answers[i] !== null && answers[i] < 2) {
        open.push({ index: i, weight: answers[i] });
      }
    }
    open.sort(function (a, b) { return a.weight - b.weight; });

    if (open.length === 0) {
      const p = document.createElement('p');
      p.className = 'sich-advice-empty';
      p.textContent = t(
        'Alles beantwortet und grün. Halte den Stand: Updates, Restore-Test, Meldeweg.',
        'Everything answered and green. Keep it there: updates, restore test, reporting path.'
      );
      adviceEl.appendChild(p);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'sich-advice-list';
    open.slice(0, 3).forEach(function (item) {
      const li = document.createElement('li');
      const advice = ADVICE[item.index];
      li.textContent = lang() === 'en' ? advice.en : advice.de;
      list.appendChild(li);
    });
    adviceEl.appendChild(list);

    if (open.length > 3) {
      const more = document.createElement('p');
      more.className = 'sich-advice-more';
      more.textContent = t(
        'und ' + (open.length - 3) + ' weitere offene Punkte',
        'and ' + (open.length - 3) + ' more open items'
      );
      adviceEl.appendChild(more);
    }

    if (answered < QUESTIONS) {
      const more = document.createElement('p');
      more.className = 'sich-advice-more';
      more.textContent = t(
        answered + ' von 8 beantwortet · Ergebnis auf dieser Basis',
        answered + ' of 8 answered · result on this basis'
      );
      adviceEl.appendChild(more);
    }
  }

  function applyStored() {
    const stored = readStore();
    if (!stored || !form) return;
    stored.answers.forEach(function (value, i) {
      if (value === null) return;
      const input = form.querySelector('input[name="sich-q' + i + '"][value="' + value + '"]');
      if (input) input.checked = true;
    });
  }

  function syncFieldsets() {
    if (!form) return;
    for (let i = 0; i < QUESTIONS; i += 1) {
      const fieldset = form.querySelector('[data-q="' + i + '"]');
      if (!fieldset) continue;
      const checked = form.querySelector('input[name="sich-q' + i + '"]:checked');
      fieldset.dataset.done = checked ? 'true' : 'false';
    }
  }

  if (form) {
    applyStored();
    syncFieldsets();
    render();

    form.addEventListener('change', function (event) {
      if (!event.target || event.target.type !== 'radio') return;
      syncFieldsets();
      writeStore(answersFromForm());
      render();
    });

    form.addEventListener('submit', function (event) { event.preventDefault(); });

    const resetBtn = form.querySelector('[data-check-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        const inputs = form.querySelectorAll('input[type="radio"]');
        for (let i = 0; i < inputs.length; i += 1) inputs[i].checked = false;
        clearStore();
        syncFieldsets();
        render();
        const first = form.querySelector('input[type="radio"]');
        if (first) first.focus({ preventScroll: true });
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast(t('Zurückgesetzt.', 'Reset done.'));
      });
    }

    const copyBtn = form.querySelector('[data-check-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        const answers = answersFromForm();
        const answered = answers.filter(function (v) { return v !== null; }).length;
        const points = answers.reduce(function (sum, v) { return sum + (v === null ? 0 : v); }, 0);
        const provisional = answered < 4;
        const score = provisional ? 0 : Math.round((points / (answered * 2)) * 100);
        const level = levelFor(score);

        const lines = [];
        lines.push(t('Sicherheits-Check — Bytewerk Studio', 'Security check — Bytewerk Studio'));
        lines.push(new Date().toLocaleDateString(lang() === 'en' ? 'en-GB' : 'de-DE'));
        lines.push('');

        if (provisional) {
          lines.push(t(
            'Ergebnis: noch keine Einordnung (' + answered + ' von 8 Fragen beantwortet).',
            'Result: not enough answers yet (' + answered + ' of 8 answered).'
          ));
        } else {
          lines.push(t(
            'Ergebnis: ' + score + ' von 100 — ' + level.de + ' (' + answered + ' von 8 beantwortet).',
            'Result: ' + score + ' out of 100 — ' + level.en + ' (' + answered + ' of 8 answered).'
          ));
        }

        const open = [];
        for (let i = 0; i < answers.length; i += 1) {
          if (answers[i] !== null && answers[i] < 2) open.push(i);
        }
        if (open.length) {
          lines.push('');
          lines.push(t('Offene Punkte:', 'Open items:'));
          open.forEach(function (i) {
            lines.push('- ' + (lang() === 'en' ? ADVICE[i].en : ADVICE[i].de));
          });
        }

        lines.push('');
        lines.push(t('Gespeichert nur in diesem Browser. Kein Upload.', 'Stored in this browser only. No upload.'));

        copyText(lines.join('\n')).then(function (ok) {
          toast(ok
            ? t('Ergebnis kopiert.', 'Result copied.')
            : t('Kopieren nicht möglich — bitte Text markieren.', 'Copy failed — please select the text.'));
        });
      });
    }
  }

  /* ============================================================
     2. Maßnahmen-Tabs
     ============================================================ */

  document.querySelectorAll('[data-sich-tabs]').forEach(function (shell) {
    const tabs = Array.prototype.slice.call(shell.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    function select(index, focus) {
      tabs.forEach(function (tab, i) {
        const selected = i === index;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      if (focus) {
        tabs[index].focus();
        tabs[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (event) {
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next > -1) {
          event.preventDefault();
          select(next, true);
        }
      });
    });
  });

  /* ============================================================
     3. Code kopieren
     ============================================================ */

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      const target = document.getElementById(button.getAttribute('data-copy'));
      if (!target) return;
      const text = target.textContent.replace(/\u00a0/g, ' ').trimEnd();
      const original = button.textContent;
      copyText(text).then(function (ok) {
        button.textContent = ok
          ? t('Kopiert', 'Copied')
          : t('Fehlgeschlagen', 'Failed');
        window.setTimeout(function () { button.textContent = original; }, 1600);
      });
    });
  });

  /* ============================================================
     4. Sprache wechseln: dynamische Texte neu zeichnen
     ============================================================ */

  document.addEventListener('bw:lang', function () {
    render();
  });

  // The toggle writes bw-lang; keep the module honest if another
  // script changes the attribute without firing the event.
  let lastLang = lang();
  window.setInterval(function () {
    const current = lang();
    if (current !== lastLang) {
      lastLang = current;
      render();
    }
  }, 1200);
})();
