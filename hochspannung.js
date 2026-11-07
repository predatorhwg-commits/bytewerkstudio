/* ============================================================
   BYTEWERK STUDIO — hochspannung.js
   ------------------------------------------------------------
   HOCHSPANNUNG: a one-button cable-swing game.

   You are a spark. Hold to grab the next power line, swing,
   and release while you are rising. Energy on the line pays.

   No libraries, no assets, no network. Canvas 2D + WebAudio.
   All tuning constants live at the top of this file.
   ============================================================ */

(function () {
  'use strict';

  const stage = document.getElementById('hs-stage');
  const canvas = document.getElementById('hs-canvas');
  if (!stage || !canvas) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    stage.classList.add('hs-no-canvas');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const el = {
    score: $('hs-score'),
    meters: $('hs-meters'),
    energy: $('hs-energy'),
    best: $('hs-best'),
    combo: $('hs-combo'),
    release: $('hs-release'),
    hint: $('hs-hint'),
    menu: $('hs-menu'),
    paused: $('hs-paused'),
    over: $('hs-over'),
    start: $('hs-start'),
    resume: $('hs-resume'),
    restartPaused: $('hs-restart-paused'),
    restart: $('hs-restart'),
    pauseBtn: $('hs-pause'),
    muteBtn: $('hs-mute'),
    overScore: $('hs-over-score'),
    overMeters: $('hs-over-meters'),
    overEnergy: $('hs-over-energy'),
    overBest: $('hs-over-best'),
    newBest: $('hs-newbest'),
    live: $('hs-live')
  };

  const required = Object.keys(el);
  for (let i = 0; i < required.length; i++) {
    if (!el[required[i]]) return;
  }

  /* ---------------------------------------------------------- */
  /* 1. Tuning                                                   */
  /* ---------------------------------------------------------- */

  const VIEW_H = 640;
  const GROUND = 600;
  const GRAVITY = 1650;
  const SWING_ACCEL = 980;
  const GRAB_RANGE = 330;
  const MAX_SPEED = 1380;
  const STEP = 1 / 120;
  const START_X = 110;
  const START_Y = 340;
  const METRE = 40; // world pixels per metre

  const BEST_KEY = 'bw-hochspannung-best-v1';
  const MUTE_KEY = 'bw-hochspannung-mute-v1';

  const C = {
    amber: '#e9a64b',
    amberSoft: '#ffd9a0',
    cyan: '#63c9dd',
    danger: '#e2604a',
    ink: '#f4efe5'
  };

  /* ---------------------------------------------------------- */
  /* 2. Small helpers                                            */
  /* ---------------------------------------------------------- */

  let seed = 1;

  function srand(n) { seed = (n >>> 0) || 1; }
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mod(v, n) { return ((v % n) + n) % n; }

  function readBest() {
    try {
      const n = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
      return (Number.isFinite(n) && n > 0 && n < 100000000) ? n : 0;
    } catch (e) { return 0; }
  }
  function writeBest(n) {
    try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* private mode */ }
  }
  function readMute() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function writeMute(m) {
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  /* ---------------------------------------------------------- */
  /* 3. Language                                                 */
  /* ---------------------------------------------------------- */

  const TEXT = {
    de: {
      liveStart: 'Spiel gestartet. Du hängst an der Leitung. Lass im richtigen Moment los.',
      livePause: 'Pause.',
      liveResume: 'Weiter.',
      liveOver: 'Lauf beendet: {score} Punkte, {meters} Meter, {energy} Energie. Rekord {best}.',
      liveNewBest: 'Neuer Rekord: {score} Punkte.',
      soundOn: 'Ton einschalten',
      soundOff: 'Ton ausschalten',
      perfect: 'PERFEKT',
      close: 'KNAPP'
    },
    en: {
      liveStart: 'Game started. You are on the line. Release at the right moment.',
      livePause: 'Paused.',
      liveResume: 'Continuing.',
      liveOver: 'Run over: {score} points, {meters} metres, {energy} energy. Record {best}.',
      liveNewBest: 'New record: {score} points.',
      soundOn: 'Turn sound on',
      soundOff: 'Turn sound off',
      perfect: 'PERFECT',
      close: 'CLOSE'
    }
  };

  function lang() {
    let raw = '';
    try {
      raw = (window.bwLang && window.bwLang()) || document.documentElement.lang || 'de';
    } catch (e) {
      raw = document.documentElement.lang || 'de';
    }
    raw = String(raw).toLowerCase().slice(0, 2);
    /* The game ships DE and EN. Spanish (and anything else) reads
       English — never German by accident. */
    return raw === 'de' ? 'de' : 'en';
  }
  function tr(key, vars) {
    const pack = TEXT[lang()] || TEXT.de;
    let s = pack[key] || TEXT.de[key] || '';
    if (vars) {
      Object.keys(vars).forEach((k) => { s = s.replace('{' + k + '}', String(vars[k])); });
    }
    return s;
  }

  /* The shared layer in this branch only knows DE/EN. If a stored
     Spanish preference reaches this page, use the English text rather
     than German — but never overwrite a real data-es translation. */
  function applyFallbackLang() {
    const raw = String(document.documentElement.lang || '').toLowerCase().slice(0, 2);
    if (!raw || raw === 'de' || raw === 'en') return;
    document.querySelectorAll('[data-en]').forEach((el) => {
      if (el.hasAttribute('data-es')) return;
      el.innerHTML = el.dataset.en;
    });
    document.querySelectorAll('[data-en-ph]').forEach((el) => {
      if (el.hasAttribute('data-es-ph')) return;
      el.setAttribute('placeholder', el.dataset.enPh);
    });
    document.querySelectorAll('[data-en-aria]').forEach((el) => {
      if (el.hasAttribute('data-es-aria')) return;
      el.setAttribute('aria-label', el.dataset.enAria);
    });
    /* Without a Spanish button in this header, show EN as the
       language that is actually being read. */
    if (!document.querySelector('[data-lang-btn="es"]')) {
      document.querySelectorAll('[data-lang-btn]').forEach((b) => {
        b.classList.toggle('active', b.dataset.langBtn === 'en');
      });
    }
  }

  /* ---------------------------------------------------------- */
  /* 4. State                                                    */
  /* ---------------------------------------------------------- */

  const G = {
    mode: 'menu',
    best: readBest(),
    muted: readMute(),
    clock: 0,
    time: 0,
    acc: 0,
    score: 0,
    meters: 0,
    energy: 0,
    energyScore: 0,
    bonus: 0,
    combo: 0,
    mult: 1,
    comboTimer: 0,
    startX: START_X,
    maxX: START_X,
    player: { x: START_X, y: START_Y, vx: 0, vy: 0, r: 12 },
    attach: null,
    anchors: [],
    orbs: [],
    hazards: [],
    particles: [],
    floaters: [],
    trail: [],
    trailAcc: 0,
    lastAnchor: null,
    anchorSeq: 0,
    orbSeq: 0,
    hazSeq: 0,
    camX: -40,
    view: { w: 800, h: VIEW_H },
    scale: 1,
    dpr: 1,
    shake: 0,
    flash: 0,
    lastGrabAt: -1,
    attachCount: 0,
    grabLock: 0,
    releasePending: false,
    overTimer: 0
  };

  const hud = {
    score: -1,
    meters: -1,
    energy: -1,
    mult: 0,
    best: -1,
    release: null
  };

  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduceMotion = !!(mqReduce && mqReduce.matches);

  /* ---------------------------------------------------------- */
  /* 5. Audio                                                    */
  /* ---------------------------------------------------------- */

  let ac = null;
  let master = null;
  let noiseBuf = null;

  function ensureAudio() {
    if (G.muted) return;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.55;
        master.connect(ac.destination);

        const len = Math.max(1, Math.floor(ac.sampleRate * 0.5));
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) {
      ac = null;
    }
  }

  function tone(freq, toFreq, dur, type, gain, delay) {
    if (!ac || G.muted) return;
    try {
      const t0 = ac.currentTime + (delay || 0);
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (toFreq && toFreq !== freq) {
        o.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t0 + dur);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    } catch (e) { /* audio is optional */ }
  }

  function noise(dur, gain, from, to) {
    if (!ac || !noiseBuf || G.muted) return;
    try {
      const t0 = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.8;
      f.frequency.setValueAtTime(Math.max(40, from), t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) { /* audio is optional */ }
  }

  function sfxStart() { tone(300, 470, 0.13, 'triangle', 0.035); }
  function sfxGrab() { tone(205, 320, 0.09, 'triangle', 0.05); }
  function sfxRelease() {
    noise(0.11, 0.035, 1500, 500);
    tone(340, 205, 0.1, 'sine', 0.024);
  }
  function sfxCollect() {
    const f = 620 + Math.min(9, G.combo) * 38;
    tone(f, f * 1.5, 0.09, 'sine', 0.04);
  }
  function sfxPerfect() {
    tone(880, 880, 0.08, 'triangle', 0.042);
    tone(1318, 1318, 0.14, 'triangle', 0.033, 0.07);
  }
  function sfxClose() { tone(520, 720, 0.055, 'sine', 0.018); }
  function sfxDeath() {
    tone(215, 55, 0.5, 'sawtooth', 0.05);
    noise(0.42, 0.05, 900, 110);
  }

  function syncMute() {
    el.muteBtn.setAttribute('aria-pressed', G.muted ? 'true' : 'false');
    el.muteBtn.setAttribute('aria-label', tr(G.muted ? 'soundOn' : 'soundOff'));
    el.muteBtn.classList.toggle('is-muted', G.muted);
  }

  function toggleMute() {
    G.muted = !G.muted;
    writeMute(G.muted);
    syncMute();
    if (!G.muted) {
      ensureAudio();
      sfxGrab();
    }
  }

  /* ---------------------------------------------------------- */
  /* 6. World generation                                         */
  /* ---------------------------------------------------------- */

  function generateUntil(worldX) {
    let guard = 0;
    while (G.lastAnchor && G.lastAnchor.x < worldX && guard++ < 500) {
      const last = G.lastAnchor;
      const diff = clamp((last.x - 800) / 14000, 0, 1);
      const gap = rr(280 - 70 * diff, 320 - 60 * diff);
      /* Keep the next grab point inside the 330 px reach even when the
         player releases at the height of the previous anchor. */
      const dyMax = Math.max(45, Math.min(110, Math.sqrt(Math.max(0, GRAB_RANGE * GRAB_RANGE - gap * gap)) - 24));
      const y = clamp(last.y + rr(-dyMax, dyMax), 60, 220);
      const a = { x: last.x + gap, y: y, id: ++G.anchorSeq };
      G.anchors.push(a);
      G.lastAnchor = a;

      /* Energy sits on the bottom of the swing arc. Three radii cover
         the rope lengths a player can realistically grab with. */
      const radii = [190, 225, 260];
      const count = rnd() < 0.5 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const rad = radii[i] + rr(-7, 7);
        G.orbs.push({
          x: a.x + rr(-8, 8),
          y: a.y + rad,
          r: 9,
          id: ++G.orbSeq,
          taken: false,
          phase: rr(0, Math.PI * 2)
        });
      }

      /* A high orb rewards a clean release instead of a low swing. */
      if (rnd() < 0.45) {
        G.orbs.push({
          x: a.x + gap * 0.5 + rr(-40, 40),
          y: Math.min(last.y, a.y) - rr(10, 90),
          r: 9,
          id: ++G.orbSeq,
          taken: false,
          phase: rr(0, Math.PI * 2)
        });
      }

      /* Hazards stay in the lower third. Anchors are above 220, so a
         hazard can never sit on a grab point. */
      if (a.x > 1200 && rnd() < 0.18 + 0.3 * diff) {
        const hx = last.x + gap * rr(0.35, 0.65);
        const hy = rr(430, 545);
        let clear = true;
        for (let j = 0; j < G.orbs.length; j++) {
          const o = G.orbs[j];
          if (!o.taken && Math.abs(o.x - hx) < 80 && Math.abs(o.y - hy) < 80) {
            clear = false;
            break;
          }
        }
        if (clear) {
          G.hazards.push({
            x: hx,
            y: hy,
            r: rr(20, 32),
            phase: rr(0, Math.PI * 2),
            spin: rr(-1.6, 1.6) || 0.8,
            id: ++G.hazSeq,
            missed: false
          });
        }
      }
    }
  }

  function reset() {
    srand((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    G.time = 0;
    G.acc = 0;
    G.score = 0;
    G.meters = 0;
    G.energy = 0;
    G.energyScore = 0;
    G.bonus = 0;
    G.combo = 0;
    G.mult = 1;
    G.comboTimer = 0;
    G.player = { x: START_X, y: START_Y, vx: 330, vy: -200, r: 12 };
    G.startX = START_X;
    G.maxX = START_X;
    G.anchors = [];
    G.orbs = [];
    G.hazards = [];
    G.particles = [];
    G.floaters = [];
    G.trail = [];
    G.trailAcc = 0;
    G.attach = null;
    G.lastGrabAt = -1;
    G.attachCount = 0;
    G.grabLock = 0;
    G.releasePending = false;
    G.anchorSeq = 0;
    G.orbSeq = 0;
    G.hazSeq = 0;
    G.shake = 0;
    G.flash = 0;
    el.hint.classList.remove('is-off');

    const first = { x: 330, y: 200, id: ++G.anchorSeq };
    G.anchors.push(first);
    G.lastAnchor = first;
    generateUntil(2600);

    /* The first run begins on the line, not in free fall. That gives a
       newcomer time to read the screen; the first release is the lesson. */
    const startLen = Math.hypot(G.player.x - first.x, G.player.y - first.y) || 1;
    let tx = (G.player.y - first.y) / startLen;
    let ty = -(G.player.x - first.x) / startLen;
    if (tx < 0) { tx = -tx; ty = -ty; }
    G.player.vx = tx * 250;
    G.player.vy = ty * 250;
    G.attach = { a: first, len: startLen };
    G.attachCount = 1;
    G.grabLock = 0.45;
    stage.classList.remove('is-holding');

    for (let i = 1; i <= 10; i++) {
      G.trail.push({ x: G.player.x - i * 8, y: G.player.y + i * 2 });
    }

    G.camX = Math.max(-50, G.player.x - G.view.w * 0.3);
    hud.score = -1;
    hud.meters = -1;
    hud.energy = -1;
    hud.mult = 0;
    hud.best = -1;
    hud.release = null;
    updateHUD(true);
  }

  /* ---------------------------------------------------------- */
  /* 7. HUD                                                      */
  /* ---------------------------------------------------------- */

  function speed() {
    return Math.hypot(G.player.vx, G.player.vy);
  }

  function releaseAngle() {
    return Math.atan2(-G.player.vy, Math.abs(G.player.vx) || 1) * 180 / Math.PI;
  }

  function canReleaseNow() {
    if (!G.attach) return false;
    const a = releaseAngle();
    return G.player.vy < 0 && a >= 12 && a <= 66 && speed() > 190;
  }

  function updateHUD(force) {
    G.score = G.meters + G.energyScore + G.bonus;

    if (force || G.score !== hud.score) {
      el.score.textContent = String(G.score);
      stage.dataset.score = String(G.score);
      hud.score = G.score;
    }
    if (force || G.meters !== hud.meters) {
      el.meters.textContent = String(G.meters);
      stage.dataset.meters = String(G.meters);
      hud.meters = G.meters;
    }
    if (force || G.energy !== hud.energy) {
      el.energy.textContent = String(G.energy);
      hud.energy = G.energy;
    }
    if (force || G.best !== hud.best) {
      el.best.textContent = String(G.best);
      hud.best = G.best;
    }

    const mult = G.mult > 1 ? G.mult : 0;
    if (force || mult !== hud.mult) {
      if (mult) {
        el.combo.hidden = false;
        el.combo.textContent = '×' + mult;
      } else {
        el.combo.hidden = true;
      }
      hud.mult = mult;
    }

    const showRelease = canReleaseNow();
    if (force || showRelease !== hud.release) {
      el.release.hidden = !showRelease;
      hud.release = showRelease;
    }
  }

  function announce(text) {
    el.live.textContent = '';
    window.setTimeout(() => { el.live.textContent = text; }, 40);
  }

  /* ---------------------------------------------------------- */
  /* 8. Effects                                                  */
  /* ---------------------------------------------------------- */

  function spawnBurst(x, y, n, color, power) {
    const p = power || 1;
    const amount = reduceMotion ? Math.max(2, Math.round(n * 0.45)) : n;
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (60 + Math.random() * 190) * p;
      G.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.3 + Math.random() * 0.45,
        max: 0.75,
        size: 1.2 + Math.random() * 2.6,
        color: color
      });
    }
    if (G.particles.length > 220) {
      G.particles.splice(0, G.particles.length - 220);
    }
  }

  function addFloater(x, y, text, color) {
    G.floaters.push({ x: x, y: y, text: text, color: color, life: 0.95, max: 0.95 });
    if (G.floaters.length > 12) G.floaters.shift();
  }

  function updateEffects(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const q = G.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        G.particles.splice(i, 1);
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 520 * dt;
      q.vx *= 0.988;
    }
    for (let i = G.floaters.length - 1; i >= 0; i--) {
      const f = G.floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        G.floaters.splice(i, 1);
        continue;
      }
      f.y -= 34 * dt;
    }
    G.shake = Math.max(0, G.shake - dt * 2.6);
    G.flash = Math.max(0, G.flash - dt * 2.4);
  }

  /* ---------------------------------------------------------- */
  /* 9. Game flow                                                */
  /* ---------------------------------------------------------- */

  let keyDown = false;
  let pointerDown = false;

  function hideOverlays() {
    el.menu.hidden = true;
    el.paused.hidden = true;
    el.over.hidden = true;
  }

  function startGame() {
    window.clearTimeout(G.overTimer);
    hideOverlays();
    reset();
    G.mode = 'playing';
    stage.dataset.state = 'playing';
    stage.classList.toggle('is-holding', !!G.attach);
    keyDown = false;
    pointerDown = false;
    ensureAudio();
    sfxStart();
    updateHUD(true);
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
    announce(tr('liveStart'));
  }

  function gameOver() {
    if (G.mode !== 'playing') return;
    updateHUD(true);
    G.mode = 'over';
    stage.dataset.state = 'over';
    stage.classList.remove('is-holding');
    G.attach = null;
    G.shake = reduceMotion ? 0 : 1;
    spawnBurst(G.player.x, G.player.y, 30, C.danger, 1.4);
    sfxDeath();

    const isBest = G.score > G.best;
    if (isBest) {
      G.best = G.score;
      writeBest(G.best);
    }

    el.overScore.textContent = String(G.score);
    el.overMeters.textContent = String(G.meters);
    el.overEnergy.textContent = String(G.energy);
    el.overBest.textContent = String(G.best);
    el.newBest.hidden = !isBest;
    el.best.textContent = String(G.best);
    hud.best = G.best;
    el.over.hidden = false;

    announce(isBest
      ? tr('liveNewBest', { score: G.score })
      : tr('liveOver', { score: G.score, meters: G.meters, energy: G.energy, best: G.best }));

    G.overTimer = window.setTimeout(() => {
      try { el.restart.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }, 90);
  }

  function pauseGame() {
    if (G.mode !== 'playing') return;
    G.mode = 'paused';
    stage.dataset.state = 'paused';
    stage.classList.remove('is-holding');
    el.paused.hidden = false;
    announce(tr('livePause'));
    /* Focus immediately: a delayed focus could land on the hidden
       resume button after a very quick resume. */
    try { el.resume.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function resumeGame() {
    if (G.mode !== 'paused') return;
    G.mode = 'playing';
    stage.dataset.state = 'playing';
    el.paused.hidden = true;
    keyDown = false;
    pointerDown = false;
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
    announce(tr('liveResume'));
  }

  /* ---------------------------------------------------------- */
  /* 10. Input                                                   */
  /* ---------------------------------------------------------- */

  function nearestAnchor() {
    const p = G.player;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < G.anchors.length; i++) {
      const a = G.anchors[i];
      if (a.x < p.x - 40 || a.x > p.x + GRAB_RANGE) continue;
      if (a.y > p.y + 30) continue;
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= GRAB_RANGE && d < bestDist) {
        bestDist = d;
        best = a;
      }
    }
    return best;
  }

  function press() {
    if (G.mode !== 'playing' || G.attach) return;
    ensureAudio();
    const a = nearestAnchor();
    if (!a) {
      G.flash = 0.22;
      sfxClose();
      return;
    }
    const p = G.player;
    let d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < 60) d = 60;
    G.attach = { a: a, len: d };
    G.lastGrabAt = G.time;
    G.attachCount++;
    if (G.attachCount >= 2) el.hint.classList.add('is-off');
    stage.classList.add('is-holding');
    sfxGrab();
    spawnBurst(p.x, p.y, 7, C.amber, 0.7);
  }

  function release() {
    if (!G.attach) return;
    const p = G.player;
    if (G.time < G.grabLock) {
      /* A quick tap during the intro must not be lost: remember it and
         let go as soon as the lock expires. */
      G.releasePending = true;
      return;
    }
    G.releasePending = false;
    const sp = speed();
    const ang = releaseAngle();
    const held = G.time - G.lastGrabAt;
    G.attach = null;
    stage.classList.remove('is-holding');
    sfxRelease();

    if (sp > 260 && ang >= 12 && ang <= 66 && held > 0.1) {
      G.bonus += 25;
      p.vx *= 1.05;
      p.vy *= 1.03;
      addFloater(p.x, p.y - 28, tr('perfect') + ' +25', C.amber);
      spawnBurst(p.x, p.y, 12, C.amberSoft, 0.9);
      sfxPerfect();
    }
    updateHUD();
  }

  function onDown(source) {
    if (source === 'key') keyDown = true;
    else pointerDown = true;
    if (G.mode === 'playing') press();
  }

  function onUp(source) {
    if (source === 'key') keyDown = false;
    else pointerDown = false;
    if (!keyDown && !pointerDown) release();
  }

  function isHoldCode(code) {
    return code === 'Space' || code === 'ArrowUp' || code === 'KeyW';
  }

  function isControlTarget(target) {
    return !!(target && target.closest && target.closest('button, a, input, textarea, select, [contenteditable="true"]'));
  }

  window.addEventListener('keydown', (e) => {
    if (isHoldCode(e.code)) {
      if (isControlTarget(e.target)) return;
      if (G.mode === 'menu') {
        e.preventDefault();
        startGame();
      } else if (G.mode === 'playing') {
        e.preventDefault();
        if (!keyDown) onDown('key');
      }
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      /* P and Esc belong to the game even when a dialog button has focus. */
      if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (G.mode === 'playing') {
        e.preventDefault();
        pauseGame();
      } else if (G.mode === 'paused') {
        e.preventDefault();
        resumeGame();
      }
      return;
    }
    if (e.code === 'KeyM') {
      if (isControlTarget(e.target)) return;
      toggleMute();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (isHoldCode(e.code) && keyDown) {
      onUp('key');
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    ensureAudio();
    if (G.mode !== 'playing') return;
    try { canvas.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* older Safari */ }
    onDown('pointer');
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    onUp('pointer');
  });

  canvas.addEventListener('pointercancel', () => onUp('pointer'));

  window.addEventListener('pointerup', () => {
    if (pointerDown) onUp('pointer');
  });

  window.addEventListener('blur', () => {
    if (G.mode === 'playing') pauseGame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'playing') pauseGame();
  });

  /* ---------------------------------------------------------- */
  /* 11. Simulation                                              */
  /* ---------------------------------------------------------- */

  function collect(o) {
    G.energy++;
    G.combo++;
    G.comboTimer = 3.4;
    G.mult = 1 + Math.min(4, Math.floor(G.combo / 4));
    G.energyScore += 10 * G.mult;
    spawnBurst(o.x, o.y, 8, C.cyan, 0.7);
    addFloater(o.x, o.y - 18, '+' + (10 * G.mult), C.cyan);
    sfxCollect();
    updateHUD();
  }

  function step(dt) {
    G.time += dt;

    if (G.releasePending && G.time >= G.grabLock && !keyDown && !pointerDown) {
      G.releasePending = false;
      release();
    }

    const p = G.player;

    if (G.combo > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) {
        G.combo = 0;
        G.mult = 1;
      }
    }

    p.vy += GRAVITY * dt;

    if (G.attach) {
      const a = G.attach.a;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      /* Assist only in the lower half of the arc. Above the anchor,
         gravity alone rules, so a missed release cannot power a loop. */
      if (dy > -60) {
        const d = Math.hypot(dx, dy) || 1;
        let tx;
        let ty;
        if (dy >= 0) {
          tx = dy / d;
          ty = -dx / d;
        } else {
          tx = -dy / d;
          ty = dx / d;
        }
        if (tx < 0) { tx = -tx; ty = -ty; }
        p.vx += tx * SWING_ACCEL * dt;
        p.vy += ty * SWING_ACCEL * dt;
      }
    }

    const drag = Math.exp(-0.045 * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (G.attach) {
      const a = G.attach.a;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > G.attach.len) {
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        p.x = a.x + nx * G.attach.len;
        p.y = a.y + ny * G.attach.len;
        const radial = p.vx * nx + p.vy * ny;
        if (radial > 0) {
          p.vx -= nx * radial;
          p.vy -= ny * radial;
        }
      }
    }

    const sp = Math.hypot(p.vx, p.vy);
    if (sp > MAX_SPEED) {
      const k = MAX_SPEED / sp;
      p.vx *= k;
      p.vy *= k;
    }

    if (p.y < 10) {
      p.y = 10;
      if (p.vy < 0) p.vy *= -0.25;
    }
    if (p.y > GROUND - p.r) {
      p.y = GROUND - p.r;
      gameOver();
      return;
    }

    if (p.x > G.maxX) G.maxX = p.x;
    const m = Math.max(0, Math.floor((G.maxX - G.startX) / METRE));
    if (m > G.meters) G.meters = m;

    G.trailAcc += dt;
    if (G.trailAcc >= 0.03) {
      G.trailAcc = 0;
      G.trail.push({ x: p.x, y: p.y });
      if (G.trail.length > 26) G.trail.shift();
    }

    for (let i = 0; i < G.orbs.length; i++) {
      const o = G.orbs[i];
      if (o.taken) continue;
      if (o.x < G.camX - 300) {
        o.taken = true;
        continue;
      }
      const dx = o.x - p.x;
      const dy = o.y - p.y;
      const reach = o.r + p.r + 12;
      if (dx * dx + dy * dy < reach * reach) {
        o.taken = true;
        collect(o);
      }
    }

    for (let i = 0; i < G.hazards.length; i++) {
      const h = G.hazards[i];
      const dx = h.x - p.x;
      const dy = h.y - p.y;
      const d = Math.hypot(dx, dy);
      const hitR = h.r * 0.72 + p.r;
      if (d < hitR) {
        gameOver();
        return;
      }
      if (!h.missed && d < hitR + 46) {
        h.missed = true;
        G.bonus += 10;
        addFloater(h.x, h.y - h.r - 16, tr('close') + ' +10', C.cyan);
        spawnBurst(h.x, h.y, 5, C.cyan, 0.5);
        sfxClose();
      }
    }

    if (G.lastAnchor && G.lastAnchor.x < G.camX + G.view.w + 700) {
      generateUntil(G.camX + G.view.w + 700);
    }

    const target = Math.max(-60, p.x - G.view.w * 0.3);
    G.camX += (target - G.camX) * Math.min(1, dt * 7);

    updateHUD();
  }

  /* ---------------------------------------------------------- */
  /* 12. Drawing                                                 */
  /* ---------------------------------------------------------- */

  const stars = [];
  const buildings = [];

  (function buildBackdrop() {
    for (let i = 0; i < 90; i++) {
      stars.push({
        x: (i * 397.13) % 2400,
        y: 14 + ((i * 173.7) % 520),
        s: 0.7 + ((i * 37) % 10) / 10,
        a: 0.18 + ((i * 53) % 40) / 100
      });
    }
    for (let i = 0; i < 46; i++) {
      const w = 26 + ((i * 71) % 62);
      const h = 36 + ((i * 97) % 150);
      buildings.push({
        x: (i * 263.4) % 2600,
        w: w,
        h: h,
        lit: i % 3 === 0
      });
    }
  })();

  let bgGrad = null;

  function makeGradient() {
    bgGrad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    bgGrad.addColorStop(0, '#070a11');
    bgGrad.addColorStop(0.58, '#0a0f19');
    bgGrad.addColorStop(0.86, '#0d111a');
    bgGrad.addColorStop(1, '#17121a');
  }

  function drawBackground(cam, vw) {
    ctx.fillStyle = bgGrad || '#080b12';
    ctx.fillRect(cam - 60, -60, vw + 120, VIEW_H + 120);

    /* Stars, slow parallax. */
    const span = 2400;
    const ox = cam * 0.12;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const x = mod(s.x - ox, span);
      if (x > vw) continue;
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#dbe9ff';
      ctx.fillRect(cam + x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    /* Skyline. */
    const bspan = 2600;
    const bx = cam * 0.24;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const x = mod(b.x - bx, bspan);
      if (x > vw + 90) continue;
      ctx.fillStyle = '#0a101a';
      ctx.fillRect(cam + x, GROUND - b.h, b.w, b.h);
      if (b.lit) {
        ctx.fillStyle = 'rgba(233,166,75,0.18)';
        ctx.fillRect(cam + x + b.w - 6, GROUND - b.h + 10, 2, 2);
        ctx.fillRect(cam + x + b.w - 6, GROUND - b.h + 18, 2, 2);
      }
    }

    /* Grid, faster parallax. */
    const gx = 90;
    const off = mod(cam * 0.55, gx);
    ctx.strokeStyle = 'rgba(99,201,221,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -off; x <= vw; x += gx) {
      ctx.moveTo(cam + x, 0);
      ctx.lineTo(cam + x, GROUND);
    }
    for (let y = 80; y < GROUND; y += 80) {
      ctx.moveTo(cam, y);
      ctx.lineTo(cam + vw, y);
    }
    ctx.stroke();
  }

  function drawGround(cam, vw) {
    ctx.fillStyle = '#05070c';
    ctx.fillRect(cam - 60, GROUND, vw + 120, VIEW_H - GROUND + 60);

    ctx.strokeStyle = 'rgba(233,166,75,0.12)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cam, GROUND);
    ctx.lineTo(cam + vw, GROUND);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(233,166,75,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cam, GROUND);
    ctx.lineTo(cam + vw, GROUND);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(cam, GROUND + 3, vw, 11);
    ctx.clip();
    ctx.strokeStyle = 'rgba(233,166,75,0.10)';
    ctx.lineWidth = 5;
    for (let x = cam - 30; x < cam + vw + 30; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND + 16);
      ctx.lineTo(x + 14, GROUND + 2);
      ctx.stroke();
    }
    ctx.restore();

    const step = 200;
    const first = Math.floor(cam / step) * step;
    ctx.fillStyle = 'rgba(244,239,229,0.16)';
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    for (let x = first; x < cam + vw; x += step) {
      ctx.fillRect(x, GROUND + 17, 1, 5);
      if (x > G.startX) {
        ctx.fillText(String(Math.round((x - G.startX) / METRE)) + ' m', x + 4, GROUND + 28);
      }
    }
  }

  function drawCables(cam, vw) {
    for (let i = 0; i < G.anchors.length - 1; i++) {
      const a = G.anchors[i];
      const b = G.anchors[i + 1];
      if (b.x < cam - 140 || a.x > cam + vw + 140) continue;
      const mx = (a.x + b.x) / 2;
      const sag = 34;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, Math.max(a.y, b.y) + sag, b.x, b.y);
      ctx.strokeStyle = 'rgba(233,166,75,0.14)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(233,166,75,0.09)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    for (let i = 0; i < G.anchors.length; i++) {
      const a = G.anchors[i];
      if (a.x < cam - 60 || a.x > cam + vw + 60) continue;
      const d = Math.hypot(a.x - G.player.x, a.y - G.player.y);
      const near = d < GRAB_RANGE;

      ctx.strokeStyle = 'rgba(233,166,75,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, 0);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(233,166,75,0.32)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x - 9, a.y);
      ctx.lineTo(a.x + 9, a.y);
      ctx.stroke();

      ctx.fillStyle = near ? 'rgba(233,166,75,0.95)' : 'rgba(233,166,75,0.55)';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3.6, 0, Math.PI * 2);
      ctx.fill();

      if (near) {
        const r = 8 + Math.sin(G.clock * 5 + a.id) * 2;
        ctx.strokeStyle = 'rgba(233,166,75,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (G.attach) {
      const a = G.attach.a;
      const p = G.player;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      ctx.save();
      ctx.strokeStyle = 'rgba(233,166,75,0.9)';
      ctx.lineWidth = 1.7;
      ctx.shadowColor = 'rgba(233,166,75,0.8)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const segs = 10;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const j = i === segs ? 0 : Math.sin(i * 9.7 + G.clock * 40) * 1.7;
        ctx.lineTo(a.x + dx * t + nx * j, a.y + dy * t + ny * j);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHazards(cam, vw) {
    for (let i = 0; i < G.hazards.length; i++) {
      const h = G.hazards[i];
      if (h.x < cam - 80 || h.x > cam + vw + 80) continue;
      const rot = G.clock * h.spin + h.phase;

      ctx.strokeStyle = 'rgba(226,96,74,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r + 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(226,96,74,0.88)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, h.r, k * 2.094 + 0.18, k * 2.094 + 1.02);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(226,96,74,0.95)';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawOrbs(cam, vw) {
    for (let i = 0; i < G.orbs.length; i++) {
      const o = G.orbs[i];
      if (o.taken) continue;
      if (o.x < cam - 40 || o.x > cam + vw + 40) continue;

      const pulse = 1 + Math.sin(G.clock * 4 + o.phase) * 0.08;
      const s = 7 * pulse;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(99,201,221,0.88)';
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = 'rgba(225,251,255,0.92)';
      ctx.fillRect(-s / 5, -s / 5, s * 0.4, s * 0.4);
      ctx.restore();

      ctx.strokeStyle = 'rgba(99,201,221,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 13 + Math.sin(G.clock * 2 + o.phase) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const p = G.player;
    const trail = G.trail;
    if (trail.length > 2) {
      for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length;
        ctx.strokeStyle = 'rgba(233,166,75,' + (0.3 * t).toFixed(3) + ')';
        ctx.lineWidth = 0.6 + 6 * t;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    }

    const r = p.r + 34;
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r);
    g.addColorStop(0, 'rgba(255,217,160,0.55)');
    g.addColorStop(0.34, 'rgba(233,166,75,0.24)');
    g.addColorStop(1, 'rgba(233,166,75,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (G.attach) {
      ctx.strokeStyle = 'rgba(233,166,75,0.36)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = C.amberSoft;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.arc(p.x - 1, p.y - 2, p.r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    if (G.flash > 0) {
      const a = Math.min(0.8, G.flash * 3.2);
      const rr = p.r + 10 + (0.22 - G.flash) * 40;
      ctx.strokeStyle = 'rgba(226,96,74,' + a.toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawParticles() {
    for (let i = 0; i < G.particles.length; i++) {
      const q = G.particles[i];
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = Math.min(1, a * 1.4);
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * (0.5 + a * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.textAlign = 'center';
    ctx.font = '600 17px "JetBrains Mono", ui-monospace, monospace';
    for (let i = 0; i < G.floaters.length; i++) {
      const f = G.floaters[i];
      const a = Math.min(1, f.life / 0.28);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function render() {
    if (!G.scale) return;

    const vw = G.view.w;
    const cam = G.camX;

    ctx.setTransform(G.dpr * G.scale, 0, 0, G.dpr * G.scale, 0, 0);

    let sx = 0;
    let sy = 0;
    if (G.shake > 0) {
      const s = G.shake * 8;
      sx = (Math.random() * 2 - 1) * s;
      sy = (Math.random() * 2 - 1) * s;
    }
    ctx.translate(-cam + sx, sy);

    drawBackground(cam, vw);
    drawGround(cam, vw);
    drawCables(cam, vw);
    drawHazards(cam, vw);
    drawOrbs(cam, vw);
    drawPlayer();
    drawParticles();
    drawFloaters();
  }

  /* ---------------------------------------------------------- */
  /* 13. Size and loop                                           */
  /* ---------------------------------------------------------- */

  function resize() {
    const rect = stage.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(3, window.devicePixelRatio || 1);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    G.dpr = dpr;
    G.scale = cssH / VIEW_H;
    G.view.h = VIEW_H;
    G.view.w = cssW / G.scale;

    makeGradient();
    render();
  }

  let lastTs = 0;

  function frame(now) {
    const dt = lastTs ? Math.min(0.05, (now - lastTs) / 1000) : 0;
    lastTs = now;
    G.clock += dt;

    if (G.mode === 'playing') {
      G.acc += dt;
      let guard = 0;
      while (G.acc >= STEP && guard++ < 10) {
        step(STEP);
        G.acc -= STEP;
      }
      if (guard >= 10) G.acc = 0;
    }

    updateEffects(dt);
    render();
    window.requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- */
  /* 14. Wiring                                                  */
  /* ---------------------------------------------------------- */

  const startButtons = document.querySelectorAll('[data-hs-start]');
  for (let i = 0; i < startButtons.length; i++) {
    startButtons[i].addEventListener('click', startGame);
  }

  el.resume.addEventListener('click', resumeGame);
  el.restartPaused.addEventListener('click', startGame);
  el.pauseBtn.addEventListener('click', () => {
    if (G.mode === 'playing') pauseGame();
    else if (G.mode === 'paused') resumeGame();
  });
  el.muteBtn.addEventListener('click', () => {
    toggleMute();
    /* Keep the keyboard on the play field: otherwise Space would toggle
       the button again instead of grabbing the next line. */
    if (G.mode === 'playing') {
      try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
    }
  });

  const jumpLinks = document.querySelectorAll('[data-hs-jump]');
  for (let i = 0; i < jumpLinks.length; i++) {
    jumpLinks[i].addEventListener('click', (e) => {
      e.preventDefault();
      try {
        stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      } catch (err) {
        stage.scrollIntoView();
      }
      window.setTimeout(() => {
        if (G.mode !== 'menu' || el.menu.hidden) return;
        try { el.start.focus({ preventScroll: true }); } catch (err) { el.start.focus(); }
      }, 380);
    });
  }

  document.addEventListener('bw:lang', () => {
    applyFallbackLang();
    syncMute();
    updateHUD(true);
  });

  if (mqReduce) {
    const onChange = (ev) => { reduceMotion = ev.matches; };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onChange);
    else if (mqReduce.addListener) mqReduce.addListener(onChange);
  }

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
  }
  window.addEventListener('resize', resize);

  applyFallbackLang();
  resize();
  reset();
  G.mode = 'menu';
  stage.dataset.state = 'menu';
  syncMute();
  updateHUD(true);
  window.requestAnimationFrame(frame);

  /* Read-only state for automated checks. No setters on purpose. */
  window.BWHS = {
    version: '1.0',
    getState: function () {
      const p = G.player;
      return {
        mode: G.mode,
        score: G.score,
        meters: G.meters,
        energy: G.energy,
        best: G.best,
        attached: !!G.attach,
        attachCount: G.attachCount,
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        x: Math.round(p.x),
        y: Math.round(p.y),
        speed: Math.round(speed()),
        angle: Math.round(releaseAngle()),
        anchors: G.anchors.filter((a) => Math.abs(a.x - p.x) < 520).map((a) => ({ x: Math.round(a.x), y: Math.round(a.y) })),
        hazards: G.hazards.filter((h) => Math.abs(h.x - p.x) < 520).map((h) => ({ x: Math.round(h.x), y: Math.round(h.y), r: Math.round(h.r) })),
        view: { w: Math.round(G.view.w), h: G.view.h },
        reduceMotion: reduceMotion
      };
    }
  };
})();
