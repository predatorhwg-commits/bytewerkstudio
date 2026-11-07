/* ============================================================
   BYTEWERK STUDIO — PROJEKTBRIEF
   ------------------------------------------------------------
   Geführter Brief in drei Schritten + ruhige 3D-Papierbühne.
   three.js liegt lokal unter vendor/, weil die CSP der Seiten
   nur script-src 'self' erlaubt. Kein Build, kein Netzwerk.

   Ohne JavaScript bleibt das Formular normal absendbar.
   Ohne WebGL oder bei einem Fehler bleibt die CSS-Collage.
   prefers-reduced-motion: Standbild, Bewegung optional wieder an.
   ============================================================ */

(function () {
  'use strict';

  const doc = document.documentElement;
  const form = document.getElementById('brief-form');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll('.brf-step'));
  const tabs = Array.from(form.querySelectorAll('.brf-prog'));
  const fills = Array.from(form.querySelectorAll('.brf-prog-line i'));
  const backBtn = document.getElementById('brf-back');
  const nextBtn = document.getElementById('brf-next');
  const sendBtn = document.getElementById('brf-send');
  const live = document.getElementById('brf-live');
  const success = document.getElementById('brf-success');
  const restoreBar = document.getElementById('brf-restore');

  const stageNo = document.getElementById('brf-stage-no');
  const stageName = document.getElementById('brf-stage-name');
  const stageNote = document.getElementById('brf-stage-note');
  const motionBtn = document.getElementById('brf-motion');
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const DRAFT_KEY = 'bw-brief-v1';
  const MAX_STEP = 2;
  let current = 0;
  let dirty = false;

  const TEXT = {
    de: {
      names: ['Das Projekt', 'Der Umfang', 'Der Kontakt'],
      pause: 'Bewegung anhalten',
      play: 'Bewegung starten',
      copied: 'Zusammenfassung kopiert.',
      copyFail: 'Kopieren nicht möglich — bitte die Felder direkt markieren.',
      restored: 'Entwurf wiederhergestellt.',
      discarded: 'Entwurf verworfen.',
      step: 'Schritt',
      error: 'Bitte die markierten Felder prüfen.',
      saved: 'Entwurf gespeichert.',
      dragging: 'Ziehen dreht den Brief.'
    },
    en: {
      names: ['The project', 'The scope', 'The contact'],
      pause: 'Pause motion',
      play: 'Start motion',
      copied: 'Summary copied.',
      copyFail: 'Copying is not available — please select the fields directly.',
      restored: 'Draft restored.',
      discarded: 'Draft discarded.',
      step: 'Step',
      error: 'Please check the marked fields.',
      saved: 'Draft saved.',
      dragging: 'Drag to turn the letter.'
    }
  };
  const lang = () => (document.documentElement.lang || 'de').slice(0, 2) === 'en' ? 'en' : 'de';
  const t = (key) => TEXT[lang()][key];

  /* ---------- Schritte ---------- */

  function setStage(index) {
    if (stageNo) stageNo.textContent = String(index + 1).padStart(2, '0');
    if (stageName) stageName.textContent = TEXT[lang()].names[index];
    if (scene) scene.setStep(index);
  }

  function setProgress(index) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      tab.classList.toggle('is-done', i < index);
    });
    fills.forEach((fill, i) => {
      fill.style.width = i < index ? '100%' : '0%';
    });
  }

  function focusStep(index) {
    const step = steps[index];
    if (!step) return;
    const target = step.querySelector('input:not([type="hidden"]), textarea, select');
    if (target) target.focus({ preventScroll: false });
    else step.focus?.();
  }

  function showStep(index, focus) {
    const next = Math.max(0, Math.min(MAX_STEP, index));
    current = next;
    steps.forEach((s, i) => { s.hidden = i !== next; });
    setProgress(next);
    setStage(next);
    backBtn.hidden = next === 0;
    nextBtn.hidden = next === MAX_STEP;
    sendBtn.hidden = next !== MAX_STEP;
    if (live) live.textContent = `${t('step')} ${next + 1} / 3`;
    if (focus) focusStep(next);
  }

  /* ---------- Prüfung ---------- */

  function fieldError(field, errEl, invalid) {
    const wrap = field ? field.closest('.brf-field') : null;
    if (wrap) wrap.classList.toggle('is-invalid', invalid);
    if (errEl) errEl.hidden = !invalid;
    if (field) field.setAttribute('aria-invalid', String(invalid));
    return !invalid;
  }

  const goal = form.querySelector('#goal');
  const typeInputs = Array.from(form.querySelectorAll('input[name="type"]'));
  const typeErr = document.getElementById('brf-type-err');
  const goalErr = document.getElementById('brf-goal-err');
  const name = form.querySelector('#name');
  const email = form.querySelector('#email');
  const consent = form.querySelector('#consent');
  const nameErr = document.getElementById('brf-name-err');
  const emailErr = document.getElementById('brf-email-err');
  const consentErr = document.getElementById('brf-consent-err');

  function validateStep(index) {
    if (index === 0) {
      const hasType = typeInputs.some((i) => i.checked);
      if (typeErr) typeErr.hidden = hasType;
      const goalOk = String(goal.value || '').trim().length >= 12;
      fieldError(goal, goalErr, !goalOk);
      return hasType && goalOk;
    }
    if (index === 2) {
      const nameOk = String(name.value || '').trim().length >= 2;
      fieldError(name, nameErr, !nameOk);
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email.value || '').trim());
      fieldError(email, emailErr, !emailOk);
      const consentOk = !!consent.checked;
      if (consentErr) consentErr.hidden = consentOk;
      return nameOk && emailOk && consentOk;
    }
    return true;
  }

  function validateAll() {
    let ok = validateStep(0);
    if (!ok) {
      showStep(0, true);
      return false;
    }
    ok = validateStep(2);
    if (!ok) {
      showStep(2, true);
      return false;
    }
    return true;
  }

  /* ---------- Zusammenfassung ---------- */

  const sumType = document.getElementById('sum-type');
  const sumBudget = document.getElementById('sum-budget');
  const sumTimeline = document.getElementById('sum-timeline');
  const sumContact = document.getElementById('sum-contact');
  const budget = form.querySelector('#budget');
  const timeline = form.querySelector('#timeline');

  function setValue(el, value) {
    if (!el) return;
    if (value) {
      el.textContent = value;
      el.removeAttribute('data-empty');
    } else {
      el.textContent = '—';
      el.setAttribute('data-empty', '');
    }
  }

  function typeLabel() {
    const checked = typeInputs.find((i) => i.checked);
    if (!checked) return '';
    const b = checked.closest('.brf-type')?.querySelector('b');
    return b ? b.textContent.trim() : checked.value;
  }

  function updateSummary() {
    setValue(sumType, typeLabel());
    setValue(sumBudget, budget.value);
    setValue(sumTimeline, timeline.value);
    const contact = [String(name.value || '').trim(), String(email.value || '').trim()].filter(Boolean).join(' · ');
    setValue(sumContact, contact);
  }

  function extras() {
    return Array.from(form.querySelectorAll('input[name="extras"]:checked')).map((i) => i.value);
  }

  function buildBody() {
    const lines = [
      'Projektbrief — bytewerkstudio.com',
      '',
      'Projektart: ' + (typeLabel() || '—'),
      'Ziel: ' + String(goal.value || '').trim(),
      '',
      'Budget: ' + (budget.value || 'noch offen'),
      'Start: ' + (timeline.value || 'noch offen'),
      'Vorhanden: ' + (extras().join(', ') || '—')
    ];
    const notes = String(form.querySelector('#notes').value || '').trim();
    if (notes) lines.push('Rahmenbedingungen: ' + notes);
    lines.push(
      '',
      'Name: ' + String(name.value || '').trim(),
      'E-Mail: ' + String(email.value || '').trim()
    );
    const company = String(form.querySelector('#company').value || '').trim();
    if (company) lines.push('Firma / Projekt: ' + company);
    const message = String(form.querySelector('#message').value || '').trim();
    if (message) lines.push('', 'Weiteres:', message);
    return lines.join('\n');
  }

  function buildSummaryText() {
    return [
      'Projektbrief',
      'Projekt: ' + (typeLabel() || '—'),
      'Budget: ' + (budget.value || 'noch offen'),
      'Start: ' + (timeline.value || 'noch offen'),
      'Kontakt: ' + [String(name.value || '').trim(), String(email.value || '').trim()].filter(Boolean).join(' · ')
    ].join('\n');
  }

  async function copySummary() {
    const text = buildSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      if (live) live.textContent = t('copied');
    } catch (err) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      area.remove();
      if (live) live.textContent = ok ? t('copied') : t('copyFail');
    }
    setTimeout(() => { if (live && live.textContent && !live.textContent.includes('/')) live.textContent = ''; }, 3200);
  }

  form.querySelector('#brf-copy').addEventListener('click', copySummary);
  const copy2 = form.querySelector('#brf-copy-2');
  if (copy2) copy2.addEventListener('click', copySummary);

  /* ---------- Entwurf ---------- */

  function serialize() {
    const data = {};
    new FormData(form).forEach((value, key) => {
      if (key === 'consent') return;
      if (key === 'extras') {
        data.extras = data.extras || [];
        data.extras.push(value);
      } else {
        data[key] = value;
      }
    });
    return { data, step: current, savedAt: Date.now() };
  }

  let saveTimer = 0;
  function saveDraft() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(serialize()));
      } catch (err) { /* Speicher voll oder gesperrt: kein Problem. */ }
    }, 450);
  }

  function applyDraft(draft) {
    if (!draft || !draft.data) return;
    const d = draft.data;
    typeInputs.forEach((input) => {
      input.checked = input.value === d.type;
      input.closest('.brf-type')?.classList.toggle('is-on', input.checked);
    });
    if (d.goal) goal.value = d.goal;
    if (d.notes) form.querySelector('#notes').value = d.notes;
    if (d.budget) budget.value = d.budget;
    if (d.timeline) timeline.value = d.timeline;
    if (d.name) name.value = d.name;
    if (d.email) email.value = d.email;
    if (d.company) form.querySelector('#company').value = d.company;
    if (d.message) form.querySelector('#message').value = d.message;
    form.querySelectorAll('input[name="extras"]').forEach((box) => {
      box.checked = Array.isArray(d.extras) && d.extras.includes(box.value);
    });
    updateSummary();
    showStep(Number.isInteger(draft.step) ? draft.step : 0, false);
    if (live) live.textContent = t('restored');
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || !draft.data) return null;
      const d = draft.data;
      const hasContent = ['goal', 'name', 'email', 'company', 'message', 'notes'].some((k) => String(d[k] || '').trim());
      return hasContent ? draft : null;
    } catch (err) {
      return null;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* egal */ }
  }

  const draft = readDraft();
  if (draft && restoreBar) {
    restoreBar.hidden = false;
    const yes = document.getElementById('brf-restore-yes');
    const no = document.getElementById('brf-restore-no');
    yes.addEventListener('click', () => {
      applyDraft(draft);
      restoreBar.hidden = true;
    });
    no.addEventListener('click', () => {
      clearDraft();
      restoreBar.hidden = true;
      if (live) live.textContent = t('discarded');
    });
  }

  /* ---------- Ereignisse ---------- */

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      if (i === current) return;
      if (i > current && !validateStep(current)) {
        if (live) live.textContent = t('error');
        return;
      }
      showStep(i, true);
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const target = Math.max(0, Math.min(MAX_STEP, current + dir));
        if (target > current && !validateStep(current)) return;
        showStep(target, true);
      }
    });
  });

  nextBtn.addEventListener('click', () => {
    if (!validateStep(current)) {
      if (live) live.textContent = t('error');
      return;
    }
    showStep(current + 1, true);
    saveDraft();
  });

  backBtn.addEventListener('click', () => showStep(current - 1, true));

  typeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      typeInputs.forEach((i) => i.closest('.brf-type')?.classList.toggle('is-on', i.checked));
      if (typeErr) typeErr.hidden = true;
      updateSummary();
      saveDraft();
      if (scene) scene.setType(input.value);
    });
  });

  form.addEventListener('input', (e) => {
    if (e.target === name || e.target === email) updateSummary();
    if (e.target.id === 'goal' && goalErr) {
      goalErr.hidden = true;
      goal.closest('.brf-field')?.classList.remove('is-invalid');
    }
    saveDraft();
  });
  form.addEventListener('change', (e) => {
    if (e.target === budget || e.target === timeline) updateSummary();
    saveDraft();
  });

  // Enter in einer Zeile = weiter; im Textfeld = neue Zeile.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const tag = e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || e.target.type === 'checkbox') return;
    e.preventDefault();
    if (current < MAX_STEP) nextBtn.click();
    else form.requestSubmit ? form.requestSubmit() : sendBtn.click();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateAll()) {
      if (live) live.textContent = t('error');
      return;
    }
    const subject = 'Projektanfrage — ' + (typeLabel() || 'Bytewerk Studio');
    const body = buildBody();
    form.action = 'mailto:Haqmalh@icloud.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    try {
      window.location.href = form.action;
    } catch (err) { /* Mailprogramm fehlt: Erfolgskarte bleibt sichtbar. */ }
    form.classList.add('is-sent');
    if (success) {
      success.hidden = false;
      success.scrollIntoView({ behavior: reduceQuery.matches ? 'auto' : 'smooth', block: 'center' });
    }
    clearDraft();
    if (scene) scene.setSealed(true);
  });

  const reset = document.getElementById('brf-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      form.reset();
      form.classList.remove('is-sent');
      if (success) success.hidden = true;
      typeInputs.forEach((i) => i.closest('.brf-type')?.classList.remove('is-on'));
      updateSummary();
      showStep(0, true);
      if (scene) { scene.setSealed(false); scene.setType(''); }
      clearDraft();
      if (live) live.textContent = '';
    });
  }

  document.addEventListener('bw:lang', () => {
    setStage(current);
    if (scene) scene.setType(typeInputs.find((i) => i.checked)?.value || '');
    setMotionLabel();
  });

  /* ---------- Bühne: UI ohne WebGL ---------- */

  let motionPaused = reduceQuery.matches;

  function setMotionLabel() {
    if (!motionBtn) return;
    motionBtn.textContent = motionPaused ? t('play') : t('pause');
    motionBtn.setAttribute('aria-pressed', String(motionPaused));
  }
  setMotionLabel();

  motionBtn.addEventListener('click', () => {
    motionPaused = !motionPaused;
    setMotionLabel();
    if (scene) scene.setPaused(motionPaused);
  });

  reduceQuery.addEventListener?.('change', (e) => {
    motionPaused = e.matches;
    setMotionLabel();
    if (scene) scene.setPaused(motionPaused);
  });

  /* ---------- three.js ---------- */

  const canvas = document.getElementById('brief-canvas');
  const stage = document.getElementById('brief-stage');
  let scene = null;

  function makeScene(THREE) {
    const C = {
      paper: 0xfaf9f5,
      cream: 0xf1e9db,
      cream2: 0xe3d7c2,
      ink: 0x2b2722,
      accent: 0xb04f31,
      accent2: 0xc97a5c,
      sage: 0x4f7a63
    };

    const reduced = () => motionPaused;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    // Blickpunkt liegt auf halber Höhe des Motivs (Stapel + Brief + Lesezeichen).
    const originBase = new THREE.Vector3(0.02, 1.16, 0);
    const origin = originBase.clone();
    let dist = 5.6;
    // Kamera steht leicht über dem Blickpunkt -> sanfter Blick von oben auf den Tisch.
    let camLift = 0.26;

    const world = new THREE.Scene();
    world.fog = new THREE.Fog(0x2a2018, 10, 30);

    const root = new THREE.Group();
    world.add(root);

    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({
      color, roughness: 0.93, metalness: 0.02
    }, extra || {}));

    const M = {
      paper: std(0xfdfaf2),
      cream: std(0xf3e8d2),
      cream2: std(0xe2d2b4),
      accent: std(0x9c4227, { roughness: 0.66 }),
      crease: std(0xc3ad8a, { roughness: 0.95 }),
      accent2: std(C.accent2, { roughness: 0.72 }),
      sealIn: std(0xd9a07e, { roughness: 0.6 }),
      sage: std(C.sage, { roughness: 0.8 }),
      ink: std(C.ink),
      line: new THREE.LineBasicMaterial({ color: C.accent, transparent: true, opacity: 0.55 }),
      thread: std(C.accent, { roughness: 0.55 })
    };

    function rounded(w, h, r) {
      const s = new THREE.Shape();
      const x = -w / 2, y = -h / 2;
      const rr = Math.min(r, w / 2, h / 2);
      s.moveTo(x + rr, y);
      s.lineTo(x + w - rr, y);
      s.quadraticCurveTo(x + w, y, x + w, y + rr);
      s.lineTo(x + w, y + h - rr);
      s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      s.lineTo(x + rr, y + h);
      s.quadraticCurveTo(x, y + h, x, y + h - rr);
      s.lineTo(x, y + rr);
      s.quadraticCurveTo(x, y, x + rr, y);
      return s;
    }

    function plate(w, h, d, r, mat) {
      const geo = new THREE.ExtrudeGeometry(rounded(w, h, r), {
        depth: d,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.008,
        bevelSegments: 2,
        curveSegments: 8
      });
      geo.center();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    // Boden
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      std(0x3d3024, { roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    world.add(floor);

    (function dots() {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(255,236,206,0.5)';
      x.beginPath();
      x.arc(32, 32, 1.15, 0, Math.PI * 2);
      x.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(40, 40);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.3, depthWrite: false })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.014;
      world.add(mesh);
    })();

    // Weicher Kontaktschatten
    (function contactShadow() {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(128, 128, 6, 128, 128, 126);
      g.addColorStop(0, 'rgba(0,0,0,0.62)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.26)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(5.0, 5.6),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.001, 0.1);
      world.add(mesh);
    })();

    // Sockel: flacher Papierstapel, auf dem der Brief steht.
    const stack = new THREE.Group();
    stack.position.set(-0.06, 0, 0.16);
    stack.rotation.y = -0.18;
    root.add(stack);

    for (let i = 0; i < 3; i++) {
      const sheet = plate(2.18, 1.46, 0.045, 0.03, i === 1 ? M.cream : M.paper);
      sheet.rotation.x = -Math.PI / 2;
      sheet.rotation.z = (i - 1) * 0.045;
      sheet.position.set((i - 1) * 0.06, 0.03 + i * 0.05, (i - 1) * 0.045);
      stack.add(sheet);

      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          rounded(2.1, 1.38, 0.028).getPoints(56).map((v) => new THREE.Vector3(v.x, v.y, 0.0315))
        ),
        new THREE.LineBasicMaterial({ color: 0x9c855e, transparent: true, opacity: 0.55 })
      );
      sheet.add(edge);
    }

    // Terrakotta-Streifen auf der obersten Lage
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.24, 0.014), M.accent);
    stripe.position.set(0, -0.48, 0.0335);
    stripe.castShadow = true;
    stack.children[2].add(stripe);

    // Hauptmotiv: aufrecht stehender Brief, deutlich gedreht und nach hinten gelehnt.
    const letter = new THREE.Group();
    letter.position.set(0.12, 0.18, 0.0);
    letter.rotation.set(-0.16, -0.34, 0.012);
    root.add(letter);

    // Zweites Blatt dahinter, klar versetzt (der Brief hat einen Entwurf).
    const backSheet = plate(1.5, 1.98, 0.03, 0.03, M.cream);
    backSheet.position.set(-0.11, 1.01, -0.12);
    backSheet.rotation.set(0, 0, 0.045);
    letter.add(backSheet);

    const card = plate(1.54, 2.02, 0.05, 0.03, M.paper);
    card.position.set(0, 1.02, 0);
    letter.add(card);

    // Falzlinie oben: der Brief ist einmal geknickt — als weiche Kerbe, nicht als Strich.
    const fold = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.011, 0.008), M.crease);
    fold.position.set(0, 1.63, 0.0345);
    card.add(fold);

    // Kopfregel und Zeilen.
    const rule = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.022, 0.006), M.accent);
    rule.position.set(-0.46, 1.72, 0.0348);
    card.add(rule);

    const inkLine = new THREE.MeshBasicMaterial({ color: 0x6f5f47 });
    for (let i = 0; i < 6; i++) {
      const w = i === 0 ? 0.7 : 1.0 - (i % 3) * 0.16;
      const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.024, 0.006), inkLine);
      line.position.set(-0.66 + w / 2 + 0.1, 1.55 - i * 0.15, 0.0348);
      card.add(line);
    }

    // Terrakotta-Band am linken Rand.
    const margin = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.9, 0.006), M.accent2);
    margin.position.set(-0.7, 1.02, 0.0348);
    card.add(margin);

    // Siegel unten rechts.
    const sealGroup = new THREE.Group();
    sealGroup.position.set(0.46, 0.34, 0.0355);
    card.add(sealGroup);

    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.045, 64), M.accent);
    seal.rotation.x = Math.PI / 2;
    seal.castShadow = true;
    sealGroup.add(seal);

    const emboss = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.155, 0.018), M.sealIn);
    emboss.position.z = 0.024;
    emboss.rotation.z = Math.PI / 4;
    sealGroup.add(emboss);

    const sealRing = new THREE.Mesh(new THREE.TorusGeometry(0.178, 0.008, 6, 56), M.sealIn);
    sealRing.position.z = 0.0245;
    sealGroup.add(sealRing);

    // Salbei-Lesezeichen, das oben aus dem Brief schaut.
    const tab = plate(0.22, 0.42, 0.014, 0.02, M.sage);
    tab.position.set(0.58, 1.92, -0.05);
    tab.rotation.set(-0.1, 0, 0.12);
    // Die schmale Fahne darf oben in den Rand ragen; sie zählt nicht fürs Einpassen.
    tab.userData.noFit = true;
    letter.add(tab);

    // Kleine Akzente auf der Tischfläche.
    const tokenA = plate(0.4, 0.4, 0.025, 0.045, M.sage);
    tokenA.position.set(-1.06, 0.16, 0.58);
    tokenA.rotation.set(-0.3, 0.55, 0.1);
    root.add(tokenA);

    const tokenB = plate(0.3, 0.3, 0.025, 0.045, M.accent2);
    tokenB.position.set(1.1, 0.12, 0.46);
    tokenB.rotation.set(-0.45, -0.5, -0.12);
    root.add(tokenB);

    // Faden über die Bühne
    const threadPts = [
      [-1.62, 0.14, 1.05], [-0.94, 0.6, 0.28], [0.0, 0.42, -0.5],
      [0.94, 0.8, -0.98], [1.62, 0.4, -1.5]
    ].map((a) => new THREE.Vector3(a[0], a[1], a[2]));
    const thread = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(threadPts), 96, 0.0065, 5, false),
      M.thread
    );
    world.add(thread);

    // Licht
    world.add(new THREE.HemisphereLight(0xfff3dc, 0x1a1410, 0.34));
    world.add(new THREE.AmbientLight(0xfff0d8, 0.05));
    const key = new THREE.DirectionalLight(0xffedc8, 2.6);
    key.position.set(3.6, 6.2, 4.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0007;
    key.shadow.normalBias = 0.02;
    world.add(key);
    const fill = new THREE.DirectionalLight(0xc4633c, 0.55);
    fill.position.set(-4.5, 2.4, -2.4);
    world.add(fill);

    // Zustand
    const state = {
      step: 0,
      type: '',
      sealed: false,
      dragX: 0,
      dragY: 0,
      targetDragX: 0,
      pointerX: 0,
      pointerY: 0,
      hover: false,
      paused: motionPaused,
      inView: true,
      raf: 0,
      t: 0,
      last: 0
    };

    function resize() {
      const w = stage.clientWidth || 1;
      const h = stage.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.fov = 34;
      cam.updateProjectionMatrix();

      // Freie Fläche zwischen Kopfzeile (Titel) und Fußzeile (Hinweis) ermitteln.
      const headEl = stage.querySelector('.brf-stage-head');
      const noteEl = stage.querySelector('.brf-stage-note');
      const sr = stage.getBoundingClientRect();
      let top = 96;
      let bottom = h - 46;
      if (headEl && headEl.offsetParent !== null) {
        const hb = headEl.getBoundingClientRect();
        if (hb.height) top = hb.bottom - sr.top + 8;
      }
      if (noteEl && noteEl.offsetParent !== null && getComputedStyle(noteEl).display !== 'none') {
        const nb = noteEl.getBoundingClientRect();
        if (nb.height) bottom = nb.top - sr.top - 8;
      }
      top = Math.max(top, 10);
      bottom = Math.min(bottom, h - 10);
      if (bottom - top < 120) { top = 10; bottom = h - 10; }

      const targetH = (bottom - top) * 0.9;
      const targetCy = (top + bottom) / 2;
      const maxW = w * 0.86;
      origin.copy(originBase);
      // Kamerahöhe VOR dem Fit festlegen — sie verändert die Projektion.
      camLift = h > 430 ? 0.26 : 0.17;

      // Modell einmal vermessen: alle Eckpunkte der Geometrie in Weltkoordinaten.
      root.updateMatrixWorld(true);
      const pts = [];
      const v = new THREE.Vector3();
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry || o.userData.noFit) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        for (const x of [bb.min.x, bb.max.x])
          for (const y of [bb.min.y, bb.max.y])
            for (const z of [bb.min.z, bb.max.z])
              pts.push(new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld));
      });

      const measure = () => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const p = new THREE.Vector3();
        for (const q of pts) {
          p.copy(q).project(cam);
          const px = (p.x * 0.5 + 0.5) * w;
          const py = (-p.y * 0.5 + 0.5) * h;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
        return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, cy: (minY + maxY) / 2 };
      };

      dist = 6;
      const aim = () => {
        cam.position.set(0, origin.y + camLift, dist);
        cam.lookAt(origin.x, origin.y, origin.z);
        cam.updateMatrixWorld(true);
        // project() rechnet mit matrixWorldInverse — die muss von Hand nachgezogen werden.
        cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      };
      for (let i = 0; i < 8; i++) {
        aim();
        const m = measure();
        const sH = m.h / targetH;
        const sW = m.w / maxW;
        const s = Math.max(sH, sW);
        dist *= s;
      }

      // Vertikal in die freie Fläche zentrieren (Kamera verschiebt das Bild).
      for (let i = 0; i < 6; i++) {
        aim();
        const m = measure();
        const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / h;
        origin.y -= (m.cy - targetCy) * worldPerPx;
      }
    }

    function placeCamera(snap) {
      const px = state.hover ? state.pointerX * 0.12 : 0;
      const py = state.hover ? state.pointerY * 0.06 : 0;
      const tx = px;
      const ty = origin.y + camLift + py;
      const k = snap ? 1 : 0.08;
      cam.position.x += (tx - cam.position.x) * k;
      cam.position.y += (ty - cam.position.y) * k;
      cam.position.z = dist;
      cam.lookAt(origin.x, origin.y, origin.z);
    }

    function goalPositions() {
      const k = state.paused ? 1 : 0.1;
      const lift = 1.02 + state.step * 0.016;
      card.position.y += (lift - card.position.y) * k;
      backSheet.position.y += ((lift + 0.02) - backSheet.position.y) * k;
      letter.rotation.y += (((state.sealed ? -0.08 : -0.22) + state.step * 0.03) - letter.rotation.y) * k;
      stack.rotation.y += (((state.sealed ? -0.12 : -0.22) - state.step * 0.03) - stack.rotation.y) * k;
      stack.children.forEach((sheet, i) => {
        if (!sheet.userData.baseY) sheet.userData.baseY = sheet.position.y;
        const spread = i === state.step ? 0.03 : 0;
        sheet.position.y += ((sheet.userData.baseY + spread) - sheet.position.y) * k;
      });
      tab.rotation.z += (((state.sealed ? 0.3 : 0.12)) - tab.rotation.z) * k;
    }

    function render() {
      renderer.render(world, cam);
    }

    function frame(now) {
      state.raf = 0;
      if (!state.inView || document.hidden) return;
      const dt = state.last ? Math.min(0.05, (now - state.last) / 1000) : 0.016;
      state.last = now;
      if (!state.paused) state.t += dt;

      const t = state.t;
      root.position.y = Math.sin(t * 0.42) * 0.012;
      sealGroup.rotation.z = Math.sin(t * 0.24) * 0.05;
      tokenA.position.y = 0.16 + Math.sin(t * 0.6 + 1.2) * 0.012;
      tokenB.position.y = 0.12 + Math.sin(t * 0.5 + 2.4) * 0.01;

      const target = state.sealed ? 0 : state.targetDragX;
      state.dragX += (target - state.dragX) * 0.08;
      root.rotation.y = state.dragX * 0.7;

      goalPositions();
      placeCamera(false);
      render();

      if (!state.paused) state.raf = requestAnimationFrame(frame);
    }

    function kick() {
      if (!state.raf && state.inView && !document.hidden) {
        state.last = 0;
        state.raf = requestAnimationFrame(frame);
      }
    }

    // Zeiger
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      state.pointerX = ((e.clientX - r.left) / r.width) * 2 - 1;
      state.pointerY = ((e.clientY - r.top) / r.height) * 2 - 1;
      state.hover = true;
      if (state.paused) { placeCamera(true); render(); }
      else kick();
    }, { passive: true });
    stage.addEventListener('pointerleave', () => {
      state.hover = false;
      state.pointerX = state.pointerY = 0;
    });

    let dragging = false;
    let startX = 0;
    let startDrag = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      startDrag = state.targetDragX;
      canvas.setPointerCapture?.(e.pointerId);
      stageNote?.classList.add('is-off');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      state.targetDragX = Math.max(-0.5, Math.min(0.5, startDrag + (e.clientX - startX) / 420));
      if (state.paused) { root.rotation.y = state.targetDragX * 0.7; render(); }
      else kick();
    });
    const endDrag = () => { dragging = false; };
    window.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          state.inView = entry.isIntersecting;
          if (state.inView) kick();
        });
      }, { rootMargin: '12% 0px' }).observe(stage);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { resize(); placeCamera(true); render(); }, 140);
    }, { passive: true });

    resize();
    placeCamera(true);
    render();
    if (!state.paused) kick();
    if (window.__BRF_DEBUG__) window.__brf = { cam, world, root, renderer, state, card, letter, stack, seal, dist: () => dist };

    return {
      setStep(i) { state.step = i; if (state.paused) { goalPositions(); render(); } else kick(); },
      setType(value) {
        state.type = value || '';
        const mat = state.type ? M.accent2 : M.accent;
        seal.material = mat;
        if (state.paused) render();
      },
      setSealed(value) { state.sealed = !!value; if (state.paused) render(); else kick(); },
      setPaused(value) {
        state.paused = !!value;
        if (state.paused) {
          state.last = 0;
          cancelAnimationFrame(state.raf);
          state.raf = 0;
          render();
        } else {
          kick();
        }
      }
    };
  }

  async function init3D() {
    if (!window.WebGLRenderingContext) { doc.classList.add('brf-no3d'); return; }
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) { doc.classList.add('brf-no3d'); return; }
      const THREE = await import('./vendor/three.module.min.js');
      scene = makeScene(THREE);
      scene.setStep(current);
      scene.setType(typeInputs.find((i) => i.checked)?.value || '');
      if (motionBtn) motionBtn.hidden = false;
      if (stageNote) stageNote.textContent = t('dragging');
    } catch (err) {
      doc.classList.add('brf-no3d');
      if (window.console && console.warn) console.warn('Projektbrief: 3D nicht verfügbar, Fallback aktiv.', err);
    }
  }

  /* ---------- Start ---------- */

  // Übernahme aus dem Projekt-Konfigurator (kontakt.html?typ=…&briefing=…)
  // und aus den Abo-Stufen der Entwickler-Seite (?thema=api|api-pro|api-team).
  (function prefill() {
    const params = new URLSearchParams(location.search);
    const wantType = params.get('typ');
    const briefing = params.get('briefing');
    const thema = params.get('thema') || '';

    // Was die Abo-Knöpfe bedeuten. Der Text landet in den Rahmen-
    // bedingungen, weil es dort um den Auftrag geht; die Projektart
    // steht als eigene Auswahl zur Verfügung.
    const THEMEN = {
      'api': {
        type: 'API / Abo',
        note: 'Ich interessiere mich für die Bytewerk-API.',
        noteEn: 'I am interested in the Bytewerk API.',
        source: 'Aus der Entwickler-Seite übernommen.',
        sourceEn: 'Prefilled from the developer page.'
      },
      'api-pro': {
        type: 'API / Abo',
        note: 'Ich möchte die API-Stufe Pro nutzen (29 €/Monat, 50.000 Anfragen).',
        noteEn: 'I would like the API Pro plan (€29/month, 50,000 requests).',
        source: 'Stufe Pro aus der Entwickler-Seite übernommen.',
        sourceEn: 'Pro plan prefilled from the developer page.'
      },
      'api-team': {
        type: 'API / Abo',
        note: 'Ich möchte die API-Stufe Team nutzen (99 €/Monat, 500.000 Anfragen).',
        noteEn: 'I would like the API Team plan (€99/month, 500,000 requests).',
        source: 'Stufe Team aus der Entwickler-Seite übernommen.',
        sourceEn: 'Team plan prefilled from the developer page.'
      }
    };
    const themaHit = THEMEN[thema];

    if (!wantType && !briefing && !themaHit) return;
    let applied = false;
    const pickType = (value) => {
      const hit = typeInputs.find((i) => i.value === value);
      if (hit && !hit.checked) { hit.checked = true; applied = true; }
    };
    if (wantType) pickType(wantType);
    if (themaHit) pickType(themaHit.type);

    const notesField = form.querySelector('#notes');
    const note = themaHit
      ? (document.documentElement.lang === 'en' ? themaHit.noteEn : themaHit.note)
      : briefing;
    if (note && notesField && !notesField.value.trim()) {
      notesField.value = note;
      applied = true;
    }
    if (!applied) return;

    typeInputs.forEach((i) => i.closest('.brf-type')?.classList.toggle('is-on', i.checked));
    if (restoreBar) restoreBar.hidden = true;
    const bar = document.getElementById('brf-prefill');
    const barNote = document.getElementById('brf-prefill-note');
    if (barNote && themaHit) {
      barNote.textContent = document.documentElement.lang === 'en'
        ? themaHit.sourceEn : themaHit.source;
    }
    if (bar) {
      bar.hidden = false;
      const ok = document.getElementById('brf-prefill-ok');
      if (ok) ok.addEventListener('click', () => { bar.hidden = true; });
    }
    saveDraft();
  })();

  typeInputs.forEach((input) => {
    input.closest('.brf-type')?.classList.toggle('is-on', input.checked);
  });
  updateSummary();
  showStep(0, false);
  if (motionBtn) motionBtn.hidden = true;

  if (canvas) {
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      doc.classList.add('brf-no3d');
    }, false);
  }

  init3D();
})();
