/* ============================================================
 * NEON HORDE — Bytewerk Studio
 * ui.js — Theme-CSS, HUD, Screens/Overlays, Toasts, Modals,
 *         Daily/Meta-Screens, Sprachwechsel-Rerender
 * Vertrag: api.js (UI). Zahlen ausschließlich balance.* (SSOT).
 *
 * Ladezeit: nur CSS + NH-Registrierung (kein Canvas/DOM-Zugriff,
 * keine Eventlistener auf Dokument). DOM entsteht erst in init()
 * (main.boot ruft NH.ui.init()), Menü via showScreen.
 * Overlay-Modularität: shop.js bekommt seinen Container über
 * NH.ui.overlayOpen() und räumt selbst auf; eigene Wrapper ohne
 * dataset.name werden von renderAll() nicht angefasst (shop
 * rendert sich bei 'lang' selbst neu).
 * Koordinaten: volle Seite (CSS-skaliert), Logik bleibt 1280x720
 * in den Engine-Modulen — ui zeichnet nur DOM.
 * ============================================================ */
(function () {
  'use strict';
  const NH = (window.NH = window.NH || {});

  /* ---------- Runtime-Zustand (erst init() nutzt DOM) ---------- */
  const el = {};               // hud, overlays, toasts, banner
  const screenBuilder = {};    // name -> (wrap, opts) => void
  let bannerTimer = null;
  let inited = false;            // init()-Idempotenz (kein Doppel-Root/-Listener)
  let lastToastKey = 0;
  let offlineShown = false;    // Offline-Banner-Flag für Menü-Seite
  let runStartBest = 0;        // lifetime.maxWave bei Run-Start (für "NEUER REKORD")
  let building = false;        // Screen-Build läuft (verhindert Mid-Build-Rerender)
  let boostUntil = 0;          // Timestamp aus 'nh:boost'
  const hudCache = { hp: -1, maxHP: -1, regen: -1, scrap: -1, scrapPrev: -1, combo: -1, comboTimer: -1, comboDur: -1,
    wave: -1, time: -1, boss: -1, bossHp: -1, bossMax: -1, weapons: '', op: -1, warn: -1, boost: -1 };

  const L = (p) => (NH.t ? NH.t(p) : p);
  const fmtPath = (p, v) => String(L(p)).replace('%s', v === undefined ? '' : String(v));
  const fmtPath2 = (p, a, b) => {
    const parts = String(L(p)).split('%s');
    let out = parts[0] + a;
    if (parts.length > 1) out += parts.slice(1).join('%s').replace('%s', b);
    return out;
  };

  /* ---------- Audio (optional, nie werfen) ---------- */
  function sfx(name) {
    try { if (NH.audio && typeof NH.audio.sfx === 'function') NH.audio.sfx(name); } catch (e) { /* optional */ }
  }

  function fmtNum(n) {
    const neg = n < 0;
    const abs = Math.abs(Math.round(n));
    return neg ? '-' + String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function fmtClock(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), ss = s % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  /* ---------- Rang-Titel (Prestige-Charme, keine Balance) ---------- */
  function rankName(p) {
    const n = Math.max(0, p | 0);
    if (n === 0) return L('ui.rank0');
    if (n === 1) return L('ui.rankInit');
    if (n === 2) return L('ui.rankAdept');
    if (n === 3) return L('ui.rankAdeptII');
    return fmtPath('ui.rankPrefix', n);
  }

  /* Ausgebbares Shard-Guthaben: je Prestige +1 Nexus-Shard, ausgegeben =
     Summe der Track-Level. meta.js hat keinen Shard-Kauf im Vertrag —
     diese Ableitung ist die einzige konsistente Quelle (Report!). */
  function shardPool() {
    const sh = (NH.meta && typeof NH.meta.shards === 'function') ? (NH.meta.shards() || {}) : {};
    const spent = (sh.hp || 0) + (sh.dmg || 0) + (sh.speed || 0) + (sh.startscrap || 0) + (sh.wlevel || 0);
    const p = (NH.meta && typeof NH.meta.prestige === 'function') ? (NH.meta.prestige() || 0) : 0;
    return Math.max(0, p - spent);
  }

  /* ============================================================
   * THEME-CSS — dunkles Neon, System-UI-Font
   * ============================================================ */
  function css() {
    const c = { bg: '#0a0f16', panel: '#101a26', amber: '#E8A45C', cyan: '#35D2E8', text: '#e8eef6', gray: '#8ba0b8' };
    NH.css.add(
      /* Root: fixed inset 0, pointer-events none; Kinder bei Bedarf auto */
      '#nh-app{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50;font-family:Segoe UI,system-ui,-apple-system,Roboto,sans-serif;}' +
      '#nh-app *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}' +
      '#nh-app .nh-po-auto{pointer-events:auto;}' +
      /* Screens/Overlays */
      '.nh-screen{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:22px;background:radial-gradient(ellipse at 50% 35%,rgba(16,26,38,.93) 0%,rgba(5,9,15,.98) 72%);pointer-events:auto;overflow:auto;text-align:center;}' +
      '.nh-overlay{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,8,14,.82);pointer-events:auto;overflow:auto;padding:18px;}' +
      '.nh-ov-wrap{width:min(1120px,96vw);max-height:100%;display:flex;flex-direction:column;gap:10px;padding:14px;overflow:auto;color:#cfe3f5;font-family:monospace;}' +
      '.nh-ov-head{display:flex;align-items:center;gap:12px;width:100%;}' +
      '.nh-ov-title{font-size:22px;font-weight:800;letter-spacing:3px;color:' + c.cyan + ';text-shadow:0 0 14px rgba(53,210,232,.5);}' +
      /* Karten / Panels */
      '.nh-card{background:rgba(13,22,34,.9);border:1px solid rgba(53,210,232,.24);border-radius:12px;padding:12px;}' +
      '.nh-card-title{font-weight:800;letter-spacing:1px;color:' + c.text + ';}' +
      '.nh-card-sub{font-size:12px;color:' + c.gray + ';letter-spacing:1px;}' +
      '.nh-panel{background:' + c.panel + ';border:1px solid rgba(53,210,232,.25);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.45);}' +
      /* Buttons */
      '.nh-btn{display:inline-block;background:rgba(53,210,232,.12);border:1px solid rgba(232,164,92,.75);color:' + c.amber + ';border-radius:9px;padding:8px 18px;font-family:monospace;font-size:14px;letter-spacing:1px;cursor:pointer;text-transform:uppercase;box-shadow:0 0 10px rgba(232,164,92,.12);user-select:none;}' +
      '.nh-btn:hover{background:rgba(232,164,92,.22);box-shadow:0 0 18px rgba(232,164,92,.35);}' +
      '.nh-btn:active{transform:translateY(1px);}' +
      '.nh-btn.nh-primary{color:' + c.cyan + ';border-color:rgba(53,210,232,.8);box-shadow:0 0 14px rgba(53,210,232,.25);}' +
      '.nh-btn.nh-primary:hover{background:rgba(53,210,232,.2);box-shadow:0 0 22px rgba(53,210,232,.45);}' +
      '.nh-btn.nh-danger{color:#ff6b6b;border-color:rgba(255,107,107,.8);}' +
      '.nh-btn.nh-ghost{background:transparent;border-color:rgba(139,160,184,.4);color:' + c.gray + ';}' +
      '.nh-btn.nh-sm{font-size:12px;padding:5px 12px;}' +
      '.nh-btn[disabled]{opacity:.35;pointer-events:none;}' +
      '.nh-dim{opacity:.45;}' +
      '.nh-hidden{display:none !important;}' +
      '.nh-muted{color:' + c.gray + ';font-size:12px;}' +
      '.nh-flexrow{display:flex;gap:10px;align-items:center;justify-content:center;}' +
      '.nh-rows{display:flex;flex-direction:column;gap:8px;align-items:center;}' +
      /* Titel / Glow / Sektionen */
      '.nh-title{font-family:monospace;font-size:clamp(30px,6vw,58px);font-weight:800;letter-spacing:8px;color:' + c.cyan + ';text-shadow:0 0 18px rgba(53,210,232,.65),0 0 40px rgba(53,210,232,.25);}' +
      '.nh-tagline{font-size:15px;letter-spacing:2px;color:' + c.gray + ';}' +
      '.nh-section{font-family:monospace;font-size:14px;letter-spacing:3px;color:' + c.amber + ';text-transform:uppercase;text-shadow:0 0 10px rgba(232,164,92,.45);margin:8px 0 4px;}' +
      /* Progressbalken */
      '.nh-bar{position:relative;width:220px;height:14px;border:1px solid rgba(53,210,232,.4);border-radius:7px;background:rgba(5,10,16,.7);overflow:hidden;}' +
      '.nh-bar > .nh-bar-fill{position:absolute;inset:0;transform-origin:left;background:linear-gradient(90deg,' + c.cyan + ',rgba(53,210,232,.55));}' +
      '.nh-bar.nh-bar-hp > .nh-bar-fill{background:linear-gradient(90deg,#ff6b6b,rgba(255,107,107,.55));}' +
      '.nh-bar.nh-bar-boss > .nh-bar-fill{background:linear-gradient(90deg,#ff6b6b,rgba(232,164,92,.65));}' +
      '.nh-bar.nh-bar-combo > .nh-bar-fill{background:linear-gradient(90deg,' + c.amber + ',rgba(232,164,92,.5));}' +
      /* HUD */
      '#nh-hud{position:fixed;inset:0;pointer-events:none;z-index:60;font-family:monospace;}' +
      '#nh-hud .nh-hud-cell{position:absolute;}' +
      '#nh-hud .nh-hud-cap{font-size:10px;letter-spacing:2px;color:' + c.gray + ';text-transform:uppercase;}' +
      '#nh-hud .nh-hud-val{font-size:20px;font-weight:800;letter-spacing:1px;}' +
      '#nh-hud .nh-hud-topmid{left:50%;top:8px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px;}' +
      '#nh-hud .nh-hud-wavetext{font-size:16px;font-weight:800;letter-spacing:2px;color:#e8f4ff;text-shadow:0 0 10px rgba(53,210,232,.35);}' +
      '#nh-hud .nh-hud-timer{font-size:12px;color:' + c.gray + ';letter-spacing:1px;}' +
      '#nh-hud .nh-hud-bosswarn{font-size:17px;font-weight:900;letter-spacing:3px;color:#ff6b6b;text-shadow:0 0 16px rgba(255,107,107,.8);animation:nh-blink .55s ease-in-out infinite;}' +
      '@keyframes nh-blink{0%,100%{opacity:.45}50%{opacity:1}}' +
      '#nh-hud .nh-hud-hpwrap{left:14px;top:10px;display:flex;flex-direction:column;gap:5px;}' +
      '#nh-hud .nh-hud-hprow{display:flex;align-items:center;gap:8px;}' +
      '#nh-hud .nh-hud-hpval{font-size:17px;font-weight:800;color:#ffe8e8;}' +
      '#nh-hud .nh-hud-hpbar{width:210px;height:16px;}' +
      '#nh-hud .nh-hud-regen{font-size:11px;font-weight:700;color:#7CFC00;letter-spacing:1px;}' +
      '#nh-hud .nh-hud-scrapwrap{right:16px;top:10px;display:flex;flex-direction:column;gap:1px;align-items:flex-end;text-align:right;}' +
      '#nh-hud .nh-hud-scrapval{font-size:30px;font-weight:900;color:#7CFC00;text-shadow:0 0 12px rgba(124,252,0,.5);}' +
      '#nh-hud .nh-hud-combowrap{left:14px;top:66px;display:flex;flex-direction:column;gap:2px;}' +
      '#nh-hud .nh-hud-combo{font-size:22px;font-weight:900;color:' + c.amber + ';text-shadow:0 0 12px rgba(232,164,92,.5);}' +
      '#nh-hud .nh-hud-combo.nh-gold{color:#ffd700;text-shadow:0 0 14px rgba(255,215,0,.6);}' +
      '#nh-hud .nh-hud-combo.nh-red{color:#ff6b6b;text-shadow:0 0 14px rgba(255,107,107,.7);}' +
      '#nh-hud .nh-hud-combobar{width:150px;height:7px;}' +
      '#nh-hud .nh-hud-boost{font-size:11px;letter-spacing:1px;color:#ff9d4d;text-shadow:0 0 8px rgba(255,157,77,.5);}' +
      '#nh-hud .nh-hud-pipwrap{left:10px;bottom:8px;display:flex;flex-direction:column;gap:5px;align-items:flex-start;}' +
      '#nh-hud .nh-hud-piprow{display:flex;align-items:center;gap:7px;}' +
      '#nh-hud .nh-hud-piplabel{font-size:11px;color:' + c.gray + ';min-width:22px;}' +
      '#nh-hud .nh-hud-pip{width:13px;height:13px;border-radius:3px;border:1px solid rgba(139,160,184,.55);background:rgba(5,10,16,.85);}' +
      '#nh-hud .nh-hud-pip.on{background:rgba(53,210,232,.85);box-shadow:0 0 7px rgba(53,210,232,.8);}' +
      '#nh-hud .nh-hud-pip.max{background:rgba(232,164,92,.9);box-shadow:0 0 8px rgba(232,164,92,.9);}' +
      '#nh-hud .nh-hud-op{position:absolute;right:12px;bottom:9px;font-size:13px;letter-spacing:1px;color:' + c.gray + ';}' +
      '#nh-hud .nh-hud-bossbarwrap{left:50%;top:64px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;}' +
      '#nh-hud .nh-hud-bossname{font-size:13px;font-weight:800;letter-spacing:2px;color:#ff6b6b;text-shadow:0 0 8px rgba(255,107,107,.5);}' +
      '#nh-hud .nh-hud-bossbar{width:min(560px,70vw);height:13px;}' +
      '@keyframes nh-pulse{0%{transform:scale(1)}30%{transform:scale(1.14)}100%{transform:scale(1)}}' +
      '.nh-pulse{animation:nh-pulse .3s ease-out;}' +
      /* Toasts */
      '#nh-toasts{position:fixed;top:72px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;z-index:400;pointer-events:none;}' +
      '.nh-toast{font-family:monospace;font-size:15px;font-weight:700;letter-spacing:1px;color:' + c.text + ';background:rgba(12,20,30,.92);border:1px solid rgba(53,210,232,.5);border-left:4px solid rgba(53,210,232,.85);border-radius:9px;padding:9px 18px;box-shadow:0 5px 24px rgba(0,0,0,.5);max-width:min(640px,92vw);text-align:center;animation:nh-toastIn .22s ease-out;pointer-events:auto;cursor:pointer;}' +
      '@keyframes nh-toastIn{0%{opacity:0;transform:translateY(-12px)}100%{opacity:1;transform:none}}' +
      '.nh-toast.nh-fading{opacity:0;transform:translateY(-12px);transition:opacity .45s,transform .45s;}' +
      /* Banner (großes Center) */
      '#nh-banner{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;z-index:350;pointer-events:none;background:radial-gradient(ellipse at 50% 42%,rgba(53,210,232,.12),rgba(0,0,0,0) 62%);animation:nh-bannerIn .3s ease-out;}' +
      '#nh-banner.nh-out{opacity:0;transition:opacity .6s;}' +
      '.nh-banner-title{font-family:monospace;font-size:clamp(28px,5.5vw,52px);font-weight:900;letter-spacing:6px;color:#ff6b6b;text-shadow:0 0 22px rgba(255,107,107,.7),0 0 60px rgba(255,107,107,.35);}' +
      '.nh-banner-sub{font-size:17px;letter-spacing:2px;color:#e8f4ff;text-shadow:0 0 10px rgba(53,210,232,.4);}' +
      '@keyframes nh-bannerIn{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:none}}' +
      /* Menü */
      '.nh-menu{display:flex;flex-direction:column;align-items:center;gap:12px;}' +
      '.nh-menu-buttons{display:flex;flex-direction:column;gap:10px;align-items:center;}' +
      '.nh-menu-btn{width:230px;font-size:16px;letter-spacing:2px;}' +
      '.nh-menu-resume{color:#7CFC00;border-color:rgba(124,252,0,.75);box-shadow:0 0 14px rgba(124,252,0,.3);}' +
      '.nh-menu-side{position:absolute;right:18px;top:14px;display:flex;flex-direction:column;align-items:flex-end;gap:5px;text-align:right;}' +
      '.nh-menu-foot{position:absolute;left:18px;bottom:12px;font-size:11px;color:#5b6b80;letter-spacing:1px;}' +
      '@keyframes nh-glowpulse{0%,100%{opacity:1;}50%{opacity:.8;}}' +
      '.nh-menu .nh-title{animation:nh-glowpulse 3.2s ease-in-out infinite;}' +
      '.nh-menu-flag{font-size:13px;letter-spacing:1px;}' +
      '.nh-menu-flag.nh-flag-bank{color:#7CFC00;}' +
      '.nh-menu-flag.nh-flag-streak{color:#ff9d4d;}' +
      '.nh-menu-flag.nh-flag-offline{color:' + c.cyan + ';}' +
      /* GameOver */
      '.nh-go-stats{display:grid;grid-template-columns:auto 1fr;gap:5px 16px;text-align:left;font-size:15px;line-height:1.6;}' +
      '.nh-go-stats b{color:#e8f4ff;font-weight:800;}' +
      '.nh-go-newbest{color:#ffd700;font-weight:900;font-size:20px;letter-spacing:2px;text-shadow:0 0 14px rgba(255,215,0,.6);animation:nh-blink 1s ease-in-out infinite;}' +
      /* Achievements */
      '.nh-ach-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;width:min(920px,94vw);}' +
      '.nh-ach-card{border:1px solid rgba(53,210,232,.22);border-radius:11px;background:rgba(13,22,34,.88);padding:10px 12px;display:flex;flex-direction:column;gap:5px;min-height:116px;}' +
      '.nh-ach-card.nh-ach-claimed{border-color:rgba(124,252,0,.35);opacity:.72;}' +
      '.nh-ach-card.nh-ach-unlocked{border-color:rgba(53,210,232,.7);box-shadow:0 0 14px rgba(53,210,232,.25);}' +
      '.nh-ach-reward{font-size:12px;color:#ffd700;}' +
      '.nh-ach-progress{font-size:12px;color:' + c.gray + ';}' +
      '.nh-ach-bar{width:100%;height:7px;margin:2px 0;}' +
      /* Metashop / Prestige */
      '.nh-track-row{display:flex;align-items:center;gap:12px;width:min(720px,94vw);padding:10px;border:1px solid rgba(53,210,232,.2);border-radius:10px;background:rgba(13,22,34,.85);}' +
      '.nh-track-pips{letter-spacing:3px;font-size:16px;color:' + c.gray + ';}' +
      '.nh-track-state{font-size:12px;color:' + c.gray + ';margin-left:auto;}' +
      '.nh-bank-big{font-size:24px;font-weight:900;color:#7CFC00;text-shadow:0 0 12px rgba(124,252,0,.4);}' +
      '.nh-shard-big{font-size:24px;font-weight:900;color:' + c.cyan + ';text-shadow:0 0 12px rgba(53,210,232,.4);}' +
      /* Daily */
      '.nh-daily-grid{display:grid;grid-template-columns:repeat(7,minmax(64px,1fr));gap:8px;width:min(860px,94vw);}' +
      '.nh-daily-day{border:1px solid rgba(53,210,232,.22);border-radius:11px;background:rgba(13,22,34,.85);padding:10px 4px;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:78px;}' +
      '.nh-daily-day.nh-daily-today{border-color:' + c.amber + ';box-shadow:0 0 14px rgba(232,164,92,.35);}' +
      '.nh-daily-day.nh-daily-past{border-color:rgba(124,252,0,.4);opacity:.75;}' +
      '.nh-daily-reward{font-weight:800;color:#7CFC00;}' +
      /* Tutorial */
      '.nh-tut-slide{max-width:600px;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;}' +
      '.nh-tut-dots{display:flex;gap:8px;}' +
      '.nh-tut-dot{width:10px;height:10px;border-radius:50%;border:1px solid ' + c.gray + ';}' +
      '.nh-tut-dot.on{background:' + c.cyan + ';box-shadow:0 0 8px rgba(53,210,232,.7);}' +
      /* Settings */
      '.nh-settings-row{display:flex;align-items:center;gap:14px;width:min(560px,92vw);justify-content:space-between;flex-wrap:wrap;}' +
      '.nh-yesno{display:flex;gap:8px;}' +
      /* Touch-Mobile: größere Touch-Toleranz (Anzeige bleibt identisch) */
      '@media (pointer:coarse){' +
      '.nh-btn{padding:12px 22px;min-height:46px;font-size:15px;}' +
      '.nh-menu-btn{width:260px;}' +
      '.nh-toast{font-size:16px;padding:11px 20px;}' +
      '.nh-close-hit{min-width:44px;min-height:44px;}' +
      '}' +
      /* Mobile-Kompaktheit */
      '@media (max-width:820px), (max-height:560px){' +
      '#nh-hud .nh-hud-hpbar{width:140px;height:12px;}' +
      '#nh-hud .nh-hud-scrapval{font-size:22px;}' +
      '#nh-hud .nh-hud-combo{font-size:17px;}' +
      '#nh-hud .nh-hud-bossbar{width:min(420px,80vw);}' +
      '.nh-title{font-size:clamp(24px,5vw,42px);letter-spacing:4px;}' +
      '.nh-menu-btn{width:200px;font-size:14px;}' +
      '.nh-ach-grid{grid-template-columns:repeat(2,minmax(140px,1fr));}' +
      '.nh-daily-grid{grid-template-columns:repeat(4,minmax(64px,1fr));}' +
      '}'
    );
  }

  /* ============================================================
   * ROOT + Overlay-Basis
   * ============================================================ */
  function buildRoot() {
    if (document.getElementById('nh-app')) return;
    const app = NH.dom.el('div', { id: 'nh-app' });
    el.hud = NH.dom.el('div', { id: 'nh-hud' });
    el.overlays = NH.dom.el('div', { id: 'nh-overlays', class: 'nh-pe-none' });
    el.toasts = NH.dom.el('div', { id: 'nh-toasts' });
    el.banner = NH.dom.el('div', { id: 'nh-banner' });
    app.appendChild(el.hud);
    app.appendChild(el.overlays);
    app.appendChild(el.toasts);
    app.appendChild(el.banner);
    document.body.insertBefore(app, document.body.firstChild);
  }

  function ovShell(title) {
    const ov = NH.dom.div(null, 'nh-overlay');
    const head = NH.dom.div([
      NH.dom.el('div', { class: 'nh-ov-title', text: title || '' }),
      NH.dom.button(L('ui.close'), 'nh-btn nh-ghost nh-sm', closeTop),
    ], 'nh-ov-head');
    const wrap = NH.dom.div([head], 'nh-ov-wrap');
    ov.appendChild(wrap);
    return { ov, wrap };
  }

  /* Overlay-Ebene nur dann klickbar, wenn ein Fenster offen ist. */
  function overlaysIdle() {
    el.overlays.classList.remove('nh-pe-auto');
    el.overlays.classList.add('nh-pe-none');
  }

  function pushOverlay(title) {
    el.overlays.classList.remove('nh-pe-none');
    el.overlays.classList.add('nh-pe-auto');
    const s = ovShell(title);
    el.overlays.appendChild(s.ov);
    return s;
  }

  function closeTop() {
    // oberstes Overlay schließen (Kinder-Array statt firstElementChild:
    // Stub- und Browser-sicher, Reihenfolge = Stack-Reihenfolge)
    const kids = el.overlays && el.overlays.children;
    if (kids && kids.length) el.overlays.removeChild(kids[kids.length - 1]);
    if (el.overlays && (!kids || !kids.length)) overlaysIdle();
  }

  function closeAll() {
    const kids = el.overlays && el.overlays.children;
    while (kids && kids.length) el.overlays.removeChild(kids[0]);
    if (el.overlays) overlaysIdle();
  }

  function openScreen(name, opts) {
    if (name === 'menu') closeAll(); // Vollbild-Menü ersetzt alles
    const s = pushOverlay(null);
    const fn = screenBuilder[name];
    if (!fn) { closeTop(); return; }
    s.wrap.dataset.name = name;
    building = true;
    try { fn(s.wrap, opts || {}); } catch (e) { console.error('[NH:ui:' + name + ']', e); }
    building = false;
  }

  /* ============================================================
   * SCREENS
   * ============================================================ */
  /* ---------- MENÜ ---------- */
  function buildMenu(wrap) {
    const d = NH.save && NH.save.data;
    const haveSave = !!(d && d.runSave);
    const bank = NH.meta ? NH.meta.bank() : 0;
    const sh = NH.meta ? NH.meta.shards() : { hp: 0, dmg: 0, speed: 0, startscrap: 0, wlevel: 0 };
    const shSum = sh.hp + sh.dmg + sh.speed + sh.startscrap + sh.wlevel;
    const rank = NH.meta ? rankName(NH.meta.prestige()) : L('ui.rank0');
    const streak = NH.meta ? (NH.meta.dailyInfo().streak || 0) : 0;
    const op = NH.meta ? NH.meta.operatorLevel() : 0;

    const menu = NH.dom.div(null, 'nh-menu');
    menu.appendChild(NH.dom.el('div', { class: 'nh-title', text: 'NEON HORDE' }));
    menu.appendChild(NH.dom.el('div', { class: 'nh-tagline', text: 'BYTEWERK STUDIO' }));

    if (haveSave) {
      menu.appendChild(NH.dom.button(L('ui.resume'), 'nh-btn nh-menu-btn nh-menu-resume', function () {
        closeAll();
        if (NH.game && typeof NH.game.resumeRun === 'function') NH.game.resumeRun();
      }));
    }
    menu.appendChild(NH.dom.button(L('ui.play'), 'nh-btn nh-menu-btn nh-primary', function () {
      const go = function () {
        closeAll();
        if (NH.game && typeof NH.game.startRun === 'function') NH.game.startRun(true);
      };
      if (haveSave) {
        NH.ui.confirm({ title: L('ui.newGamePrompt'), body: '', okText: L('ui.confirmYes'), tone: 'warn' }).then(function (yes) { if (yes) go(); });
      } else {
        go();
      }
    }));
    const list = [
      ['ui.achievements', 'achievements'],
      ['ui.metashop', 'metashop'],
      ['ui.prestige', 'prestige'],
      ['ui.daily', 'daily'],
      ['ui.settings', 'settings'],
      ['ui.tutorial', 'tutorial'],
    ];
    for (let i = 0; i < list.length; i++) {
      (function (b) {
        menu.appendChild(NH.dom.button(L(b[0]), 'nh-btn nh-menu-btn nh-ghost', function () { openScreen(b[1]); }));
      })(list[i]);
    }

    const side = NH.dom.div(null, 'nh-menu-side');
    side.appendChild(NH.dom.el('div', { class: 'nh-menu-flag nh-flag-bank', text: NH.t('meta.bank') + ': ' + fmtNum(bank) + ' Scrap' }));
    side.appendChild(NH.dom.el('div', { class: 'nh-menu-flag nh-flag-bank', text: NH.t('meta.shards') + ': ' + fmtNum(shardPool()) }));
    side.appendChild(NH.dom.el('div', { class: 'nh-menu-flag nh-flag-bank', text: NH.t('meta.rank') + ': ' + rank }));
    if (streak >= 2) side.appendChild(NH.dom.el('div', { class: 'nh-menu-flag nh-flag-streak', text: '🔥 ' + fmtPath('meta.streak', streak) }));
    const offlineInfo = (NH.meta && NH.meta.offlineRewardInfo) || NH.ui.offlineRewardInfo || null;
    if (offlineInfo || offlineShown) {
      const offText = offlineInfo
        ? fmtPath('meta.offlineFor', offlineInfo.minutes) + ' → ' + fmtNum(offlineInfo.scrap) + ' Scrap'
        : NH.t('meta.offlineTitle');
      side.appendChild(NH.dom.el('div', { class: 'nh-menu-flag nh-flag-offline', text: offText }));
    }
    menu.appendChild(side);

    if (op > 0) menu.appendChild(NH.dom.el('div', { class: 'nh-muted', text: fmtPath('hud.operatorLv', op) }));
    menu.appendChild(NH.dom.el('div', { class: 'nh-menu-foot', text: fmtPath('ui.footer', new Date().getFullYear()) }));
    wrap.appendChild(menu);
  }

  /* ---------- GAMEOVER ---------- */
  function buildGameOver(wrap, opts) {
    if (opts && opts.data) NH.ui._lastGameover = opts.data;
    const st = NH.ui._lastGameover || (NH.game && NH.game.run && NH.game.run.stats) || {};
    const wave = st.wave || st.maxWave || 0;
    const kills = st.kills || 0;
    const killsByWeapon = st.killsByWeapon || {};
    const scrapEarned = st.scrapEarned || 0;
    const ratio = NH.balance.economy.bankSafeRatio;
    const banked = (st.banked !== undefined) ? st.banked : Math.floor(scrapEarned * ratio);
    const lost = (st.lost !== undefined) ? st.lost : Math.max(0, scrapEarned - banked);
    const bestCombo = st.bestCombo || (NH.game && NH.game.run && NH.game.run.bestCombo) || 0;
    const bosses = st.bossesKilled || 0;
    const time = st.time || st.runTime || 0;
    const best = (st.maxWaveBest !== undefined) ? st.maxWaveBest : runStartBest;
    const newRecord = (wave > best) || !!NH.ui.newBestFlag;

    const top = Object.keys(killsByWeapon).map(function (id) {
      return { id: id, n: killsByWeapon[id] || 0 };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 3);

    wrap.appendChild(NH.dom.el('div', { class: 'nh-title', text: L('gameover.title') }));
    if (newRecord) wrap.appendChild(NH.dom.el('div', { class: 'nh-go-newbest', text: L('gameover.newBest') }));

    const stats = NH.dom.div(null, 'nh-go-stats');
    const row = (label, val) => {
      stats.appendChild(NH.dom.el('div', { text: label }));
      stats.appendChild(NH.dom.el('b', { text: val }));
    };
    row(L('gameover.wave'), String(wave));
    row(L('gameover.kills'), fmtNum(kills));
    if (top.length) {
      row(L('gameover.killsByWeapon'), top.map(function (r) { return NH.disp('w', r.id, r.id) + ' ×' + r.n; }).join(' · '));
    }
    row(L('gameover.scrapEarned'), fmtNum(scrapEarned));
    row(L('gameover.banked'), fmtNum(banked));
    row(L('gameover.lost'), fmtNum(lost));
    row(L('gameover.combo'), '×' + bestCombo);
    row(L('gameover.boss'), fmtNum(bosses));
    row(L('gameover.time'), fmtClock(time));
    wrap.appendChild(stats);
    wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: L('gameover.nothingLost') }));

    const btns = NH.dom.div(null, 'nh-flexrow');
    btns.appendChild(NH.dom.button(L('gameover.retry'), 'nh-btn nh-primary', function () {
      closeAll();
      if (NH.game && typeof NH.game.startRun === 'function') NH.game.startRun(true);
    }));
    btns.appendChild(NH.dom.button(L('gameover.menu'), 'nh-btn', function () {
      closeAll();
      openScreen('menu');
    }));
    wrap.appendChild(btns);
  }

  /* ---------- ACHIEVEMENTS (Grid 4x6) ---------- */
  function buildAchievements(wrap) {
    const defs = NH.balance.achievements || [];
    const grid = NH.dom.div(null, 'nh-ach-grid');
    for (let i = 0; i < defs.length; i++) {
      (function (a) {
        const pr = NH.meta.achProgress(a.id);
        const pct = pr.unlocked ? 100 : Math.min(100, Math.round((pr.cur / Math.max(1, pr.target)) * 100));
        const card = NH.dom.div(null, 'nh-ach-card' + (pr.claimed ? ' nh-ach-claimed' : (pr.unlocked ? ' nh-ach-unlocked' : '')));
        card.appendChild(NH.dom.el('div', { class: 'nh-card-title', text: NH.disp('a', a.id, a.name) }));
        card.appendChild(NH.dom.el('div', { class: 'nh-muted', text: NH.disp('ad', a.id, a.desc) || '' }));
        const fill = NH.dom.el('div', { class: 'nh-bar-fill' });
        NH.css.width(fill, pct);
        const bar = NH.dom.div([fill], 'nh-bar nh-ach-bar');
        card.appendChild(bar);
        card.appendChild(NH.dom.el('div', { class: 'nh-ach-progress', text: fmtPath2('ach.progress', fmtNum(pr.cur), fmtNum(pr.target)) }));
        card.appendChild(NH.dom.el('div', { class: 'nh-ach-reward', text: fmtPath('ach.reward', fmtNum(a.reward) + ' Scrap') }));
        if (pr.unlocked && !pr.claimed) {
          card.appendChild(NH.dom.button(L('ach.claim'), 'nh-btn nh-sm nh-primary', function () {
            if (NH.meta.claimAchievement(a.id)) {
              sfx('achievement');
              NH.ui.toast(fmtPath('ach.reward', fmtNum(a.reward) + ' Scrap'), '#ffd700');
              NH.ui.renderAll();
            }
          }));
        } else if (pr.claimed) {
          card.appendChild(NH.dom.el('div', { class: 'nh-muted', text: L('ach.claimed') }));
        } else {
          card.appendChild(NH.dom.el('div', { class: 'nh-ach-progress', text: L('ach.locked') }));
        }
        grid.appendChild(card);
      })(defs[i]);
    }
    wrap.appendChild(grid);
    wrap.appendChild(NH.dom.button(L('ui.close'), 'nh-btn nh-ghost', closeTop));
  }

  /* ---------- METASHOP (5 Shard-Tracks) ---------- */
  /* Kauf: meta.js stellt keinen Shard-Kauf zur Verfügung (Vertrag hat
     nur bank/shards/doPrestige), daher direkter save.data-Zugriff —
     Währung sind NEXUS-SHARDS (Guthaben = prestige − Σ Levels, s.
     shardPool), nicht Bank. Bank-Buchung bleibt komplett außen vor. */
  function buyShard(id, cost) {
    const d = NH.save && NH.save.data;
    const def = (NH.balance.shards || []).find(function (x) { return x.id === id; });
    if (!d || !def) return false;
    const lvl = d.shards[id] || 0;
    if (lvl >= (def.max || 5)) return false;
    if (shardPool() < cost) return false;
    d.shards[id] = lvl + 1; // Guthaben sinkt implizit (Pool = prestige − Σ)
    if (NH.save.save) NH.save.save();
    NH.events.emit('nh:meta', { type: 'shard', id: id, cost: cost });
    return true;
  }

  function buildMetashop(wrap) {
    const bank = NH.meta ? NH.meta.bank() : 0;
    const sh = (NH.meta && NH.meta.shards()) || { hp: 0, dmg: 0, speed: 0, startscrap: 0, wlevel: 0 };
    wrap.appendChild(NH.dom.el('div', { class: 'nh-bank-big', text: NH.t('meta.bank') + ': ' + fmtNum(bank) + ' Scrap' }));
    wrap.appendChild(NH.dom.el('div', { class: 'nh-shard-big', text: NH.t('meta.shards') + ': ' + fmtNum(shardPool()) }));

    const defs = NH.balance.shards || [];
    for (let i = 0; i < defs.length; i++) {
      (function (d) {
        const lvl = sh[d.id] || 0;
        const max = d.max || 5;
        const cost = (d.costs && d.costs[lvl] !== undefined) ? d.costs[lvl] : null;
        const can = cost !== null && shardPool() >= cost;
        const row = NH.dom.div(null, 'nh-track-row');
        row.appendChild(NH.dom.el('div', { class: 'nh-card-title', text: NH.disp('s', d.id, d.name) }));
        row.appendChild(NH.dom.el('div', { class: 'nh-track-pips', text: pipsText(lvl, max) }));
        row.appendChild(NH.dom.el('div', { class: 'nh-track-state', text: fmtPath('ui.level', lvl + '/' + max) }));
        if (cost === null) {
          row.appendChild(NH.dom.button(L('meta.shardMax'), 'nh-btn nh-ghost nh-sm', function () {}));
        } else {
          const btn = NH.dom.button(L('meta.shardBuy'), 'nh-btn nh-sm' + (can ? ' nh-primary' : ' nh-dim'), function () {
            if (!can) { sfx('error'); NH.ui.toast(L('shop.notEnough'), '#ff6b6b'); return; }
            if (buyShard(d.id, cost)) {
              sfx('buy');
              NH.ui.toast('+1 ' + NH.disp('s', d.id, d.name), '#7CFC00');
            } else {
              sfx('error');
              NH.ui.toast(L('shop.notEnough'), '#ff6b6b');
            }
          });
          if (!can) btn.disabled = true; // Buy-Button: disabled statt nur gedimmt
          row.appendChild(btn);
        }
        wrap.appendChild(row);
      })(defs[i]);
    }
    wrap.appendChild(NH.dom.button(L('ui.close'), 'nh-btn nh-ghost', closeTop));
  }

  function pipsText(lvl, max) {
    let s = '';
    for (let i = 0; i < max; i++) s += (i < lvl ? '■' : '□');
    return s;
  }

  /* ---------- PRESTIGE ---------- */
  function shardPreview() {
    const sh = NH.meta ? NH.meta.shardBonus() : null;
    if (!sh) return '';
    const parts = [];
    if (sh.hpMult > 1.001) parts.push('HP ×' + sh.hpMult.toFixed(2).replace(/\.?0+$/, ''));
    if (sh.dmgMult > 1.001) parts.push('DMG ×' + sh.dmgMult.toFixed(2).replace(/\.?0+$/, ''));
    if (sh.speedMult > 1.001) parts.push('SPD ×' + sh.speedMult.toFixed(2).replace(/\.?0+$/, ''));
    return parts.join(' · ');
  }

  function buildPrestige(wrap) {
    const bank = NH.meta ? NH.meta.bank() : 0;
    const cost = NH.meta ? NH.meta.prestigeCost() : 0;
    const can = bank >= cost;
    wrap.appendChild(NH.dom.el('div', { class: 'nh-title', text: L('meta.prestigeTitle') }));
    wrap.appendChild(NH.dom.el('div', { class: 'nh-bank-big', text: NH.t('meta.bank') + ': ' + fmtNum(bank) + ' Scrap' }));
    wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: fmtPath('meta.prestigeCost', fmtNum(cost)) }));
    wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: NH.t('meta.rank') + ': ' + rankName(NH.meta ? NH.meta.prestige() : 0) }));
    wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: NH.t('meta.prestigeReset') }));
    wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: NH.t('meta.prestigeGet') }));
    const preview = shardPreview();
    if (preview) wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: NH.t('meta.shards') + ': ' + preview }));

    wrap.appendChild(NH.dom.button(L('meta.prestigeTitle'), 'nh-btn nh-danger' + (can ? '' : ' nh-dim'), function () {
      if (!can) { sfx('error'); NH.ui.toast(L('shop.notEnough'), '#ff6b6b'); return; }
      NH.ui.confirm({
        title: L('meta.prestigeTitle'),
        body: NH.t('meta.prestigeReset') + ' · ' + NH.t('meta.prestigeGet'),
        okText: L('meta.prestigeGet'),
        tone: 'danger',
      }).then(function (yes) {
        if (!yes) return;
        if (NH.meta.doPrestige()) {
          sfx('prestige');
          NH.ui.toast(NH.t('meta.prestigeTitle'), '#ffd700');
        }
      });
    }));
    wrap.appendChild(NH.dom.button(L('ui.close'), 'nh-btn nh-ghost', closeTop));
  }

  /* ---------- DAILY ---------- */
  function nextIn() {
    // Countdown bis zur nächsten Belohnung aus lastDaily + 24 h (Task-Vorgabe)
    const last = (NH.save && NH.save.data && NH.save.data.lastDaily) || 0;
    if (!last) return null;
    const diff = (last + 24 * 3600000) - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function buildDaily(wrap) {
    const d = NH.meta ? NH.meta.dailyInfo() : { dayIndex: 0, reward: 0, claimed: true, streak: 0, double: false };
    const rewards = NH.balance.economy.dailyRewards || [];
    wrap.appendChild(NH.dom.el('div', { class: 'nh-title', text: L('meta.dailyTitle') }));
    wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: fmtPath('meta.streak', d.streak) + (d.double ? ' — ×2' : '') }));

    const grid = NH.dom.div(null, 'nh-daily-grid');
    for (let i = 0; i < rewards.length; i++) {
      (function (i2) {
        const day = NH.dom.div(null, 'nh-daily-day');
        if (i2 === d.dayIndex) day.classList.add('nh-daily-today');
        if (i2 < d.dayIndex) day.classList.add('nh-daily-past');
        const dayLabel = L('ui.day');
        day.appendChild(NH.dom.el('div', { class: 'nh-muted', text: dayLabel + ' ' + (i2 + 1) }));
        const shownReward = (d.double && i2 === d.dayIndex) ? rewards[i2] * 2 : rewards[i2];
        day.appendChild(NH.dom.el('div', { class: 'nh-daily-reward', text: fmtNum(shownReward) }));
        if (d.double && i2 === d.dayIndex) day.appendChild(NH.dom.el('div', { class: 'nh-muted', text: '×2' }));
        grid.appendChild(day);
      })(i);
    }
    wrap.appendChild(grid);

    if (d.claimed) {
      const ni = nextIn();
      if (ni) wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: fmtPath('meta.nextIn', ni) }));
      else wrap.appendChild(NH.dom.el('div', { class: 'nh-muted', text: L('meta.claimed') }));
    } else {
      wrap.appendChild(NH.dom.button(L('meta.claim'), 'nh-btn nh-primary', function () {
        if (NH.meta.claimDaily()) {
          sfx('fanfare');
          NH.ui.toast('+' + fmtNum(d.reward) + ' Scrap', '#ffd700');
        }
      }));
    }
    wrap.appendChild(NH.dom.button(L('ui.close'), 'nh-btn nh-ghost', closeTop));
  }

  /* ---------- SETTINGS ---------- */
  function buildSettings(wrap) {
    const s = (NH.save && NH.save.data && NH.save.data.settings) || {};
    const lang = s.lang || NH.lang.current || 'de';
    const sound = s.sound !== false;
    const shake = s.shake !== false;

    wrap.appendChild(NH.dom.el('div', { class: 'nh-section', text: L('ui.language') }));
    wrap.appendChild(NH.dom.div([
      NH.dom.button(L('ui.langDe'), 'nh-btn nh-sm' + (lang === 'de' ? ' nh-primary' : ''), function () { setLang('de'); }),
      NH.dom.button(L('ui.langEn'), 'nh-btn nh-sm' + (lang === 'en' ? ' nh-primary' : ''), function () { setLang('en'); }),
    ], 'nh-flexrow'));

    wrap.appendChild(NH.dom.el('div', { class: 'nh-section', text: L('ui.sound') }));
    wrap.appendChild(NH.dom.div([
      NH.dom.button(sound ? L('ui.shakeOn') : L('ui.shakeOff'), 'nh-btn nh-sm' + (sound ? ' nh-primary' : ''), function () {
        const nv = !sound;
        try { if (NH.audio && NH.audio.enabled !== undefined) NH.audio.enabled = nv; } catch (e) {}
        if (NH.save && NH.save.data && NH.save.data.settings) NH.save.data.settings.sound = nv;
        if (NH.save && NH.save.save) NH.save.save();
        if (nv) sfx('click');
      }),
    ], 'nh-settings-row'));

    wrap.appendChild(NH.dom.el('div', { class: 'nh-section', text: L('ui.shake') }));
    wrap.appendChild(NH.dom.div([
      NH.dom.button(shake ? L('ui.shakeOn') : L('ui.shakeOff'), 'nh-btn nh-sm' + (shake ? ' nh-primary' : ''), function () {
        if (NH.save && NH.save.data && NH.save.data.settings) {
          NH.save.data.settings.shake = !shake;
          if (NH.save.save) NH.save.save();
        }
      }),
    ], 'nh-settings-row'));

    wrap.appendChild(NH.dom.el('div', { class: 'nh-section', text: L('ui.resetSave') }));
    wrap.appendChild(NH.dom.div([
      NH.dom.button(L('ui.resetSave'), 'nh-btn nh-danger nh-sm', function () {
        const doReset = () => {
          if (NH.save && NH.save.reset) {
            NH.save.reset();
            NH.ui.toast(L('ui.resetDone'), '#ff6b6b');
            NH.ui.renderAll();
          }
        };
        NH.ui.confirm({ title: L('ui.resetSave'), body: L('ui.resetConfirm'), okText: L('ui.confirmYes'), tone: 'danger' })
          .then(function (yes) {
            if (!yes) return;
            NH.ui.confirm({ title: L('ui.resetSave'), body: L('ui.resetConfirm'), okText: L('ui.confirmYes'), tone: 'danger' })
              .then(function (yes2) { if (yes2) doReset(); });
          });
      }),
    ], 'nh-settings-row'));

    wrap.appendChild(NH.dom.button(L('ui.close'), 'nh-btn nh-ghost', closeTop));
  }

  function setLang(l) {
    try {
      if (NH.lang && typeof NH.lang.set === 'function') NH.lang.set(l);
      if (NH.save && NH.save.data && NH.save.data.settings) {
        NH.save.data.settings.lang = l;
        if (NH.save.save) NH.save.save();
      }
      sfx('click');
      NH.ui.renderAll();
    } catch (e) { /* i18n optional */ }
  }

  /* ---------- TUTORIAL (3 Slides) ---------- */
  const TUT = [['tut.slide1T', 'tut.slide1B'], ['tut.slide2T', 'tut.slide2B'], ['tut.slide3T', 'tut.slide3B']];

  function buildTutorial(wrap) {
    let idx = 0;
    const titleEl = NH.dom.el('div', { class: 'nh-title', text: L(TUT[0][0]) });
    const bodyEl = NH.dom.el('div', { class: 'nh-muted', class: 'nh-muted nh-fs-15', text: L(TUT[0][1]) });
    const dots = NH.dom.div(null, 'nh-tut-dots');
    const dotArr = [];
    for (let i = 0; i < TUT.length; i++) {
      const dd = NH.dom.el('div', { class: 'nh-tut-dot' + (i === 0 ? ' on' : '') });
      dotArr.push(dd);
      dots.appendChild(dd);
    }
    const prevB = NH.dom.button(L('ui.back'), 'nh-btn nh-ghost', function () {
      if (idx > 0) { idx--; render(); }
    });
    const nextB = NH.dom.button(L('ui.next'), 'nh-btn nh-primary', function () {
      if (idx < TUT.length - 1) { idx++; render(); } else startRun();
    });
    const skipB = NH.dom.button(L('ui.skip'), 'nh-btn nh-ghost', function () { startRun(); });
    function startRun() {
      closeAll();
      if (NH.game && typeof NH.game.startRun === 'function') NH.game.startRun(true);
    }
    function render() {
      titleEl.textContent = L(TUT[idx][0]);
      bodyEl.textContent = L(TUT[idx][1]);
      for (let i = 0; i < dotArr.length; i++) dotArr[i].classList.toggle('on', i === idx);
      prevB.disabled = idx === 0;
    }
    wrap.appendChild(NH.dom.div([titleEl, bodyEl, dots, NH.dom.div([prevB, nextB], 'nh-flexrow')], 'nh-tut-slide'));
    wrap.appendChild(NH.dom.div([skipB], 'nh-flexrow'));
  }

  /* ---------- PAUSE ---------- */
  function buildPause(wrap) {
    wrap.appendChild(NH.dom.el('div', { class: 'nh-title', text: L('pause.title') }));
    wrap.appendChild(NH.dom.button(L('pause.resume'), 'nh-btn nh-primary', function () {
      closeAll();
      // game.js hört auf den Pause-Toggle (KeyP) und setzt state zurück
      NH.events.emit('nh:key', { code: 'KeyP' });
    }));
    wrap.appendChild(NH.dom.button(L('pause.restart'), 'nh-btn nh-danger', function () {
      NH.ui.confirm({ title: L('pause.restart'), body: '', okText: L('ui.confirmYes'), tone: 'warn' }).then(function (yes) {
        if (yes) {
          closeAll();
          if (NH.game && typeof NH.game.startRun === 'function') NH.game.startRun(true);
        }
      });
    }));
    wrap.appendChild(NH.dom.button(L('pause.menu'), 'nh-btn nh-ghost', function () {
      if (NH.game && typeof NH.game.toMenu === 'function') { closeAll(); NH.game.toMenu(); }
      else { closeAll(); openScreen('menu'); }
    }));
    wrap.appendChild(NH.dom.button(L('ui.settings'), 'nh-btn nh-ghost nh-sm', function () {
      openScreen('settings'); // stapelt über der Pause
    }));
  }

  screenBuilder.menu = buildMenu;
  screenBuilder.gameover = buildGameOver;
  screenBuilder.achievements = buildAchievements;
  screenBuilder.metashop = buildMetashop;
  screenBuilder.prestige = buildPrestige;
  screenBuilder.daily = buildDaily;
  screenBuilder.settings = buildSettings;
  screenBuilder.tutorial = buildTutorial;
  screenBuilder.pause = buildPause;

  /* ============================================================
   * HUD
   * ============================================================ */
  function buildHUD() {
    const hpWrap = NH.dom.div([], 'nh-hud-cell nh-hud-hpwrap');
    hpWrap.appendChild(NH.dom.el('div', { class: 'nh-hud-cap', text: L('hud.hp') }));
    hpWrap.appendChild(NH.dom.el('div', { id: 'nh-hud-hpbar', class: 'nh-bar nh-bar-hp nh-hud-hpbar' }, [NH.dom.el('div', { class: 'nh-bar-fill' })]));
    hpWrap.appendChild(NH.dom.el('div', { id: 'nh-hud-hpval', class: 'nh-hud-hpval' }));
    hpWrap.appendChild(NH.dom.el('div', { id: 'nh-hud-regen', class: 'nh-hud-regen nh-hidden' }));
    el.hud.appendChild(hpWrap);

    const sw = NH.dom.div([], 'nh-hud-cell nh-hud-scrapwrap');
    sw.appendChild(NH.dom.el('div', { id: 'nh-hud-scrap', class: 'nh-hud-scrapval' }));
    sw.appendChild(NH.dom.el('div', { class: 'nh-hud-cap', text: L('hud.scrap') }));
    el.hud.appendChild(sw);

    const cw = NH.dom.div([], 'nh-hud-cell nh-hud-combowrap');
    cw.appendChild(NH.dom.el('div', { id: 'nh-hud-combo', class: 'nh-hud-combo' }));
    cw.appendChild(NH.dom.el('div', { id: 'nh-hud-combobar', class: 'nh-bar nh-bar-combo nh-hud-combobar' }, [NH.dom.el('div', { class: 'nh-bar-fill' })]));
    cw.appendChild(NH.dom.el('div', { id: 'nh-hud-boost', class: 'nh-hud-boost nh-hidden' }));
    el.hud.appendChild(cw);

    const tm = NH.dom.div([], 'nh-hud-cell nh-hud-topmid');
    tm.appendChild(NH.dom.el('div', { id: 'nh-hud-wave', class: 'nh-hud-wavetext' }));
    tm.appendChild(NH.dom.el('div', { id: 'nh-hud-timer', class: 'nh-hud-timer' }));
    tm.appendChild(NH.dom.el('div', { id: 'nh-hud-bosswarn', class: 'nh-hud-bosswarn nh-hidden' }));
    el.hud.appendChild(tm);

    const pw = NH.dom.div([], 'nh-hud-cell nh-hud-pipwrap');
    pw.appendChild(NH.dom.el('div', { id: 'nh-hud-pips' }));
    el.hud.appendChild(pw);
    el.hud.appendChild(NH.dom.el('div', { id: 'nh-hud-op', class: 'nh-hud-op' }));

    const bw = NH.dom.el('div', { id: 'nh-hud-bossbarwrap', class: 'nh-hud-cell nh-hud-bossbarwrap nh-hidden' });
    bw.appendChild(NH.dom.el('div', { id: 'nh-hud-bossname', class: 'nh-hud-bossname' }));
    bw.appendChild(NH.dom.el('div', { id: 'nh-hud-bossbar', class: 'nh-bar nh-bar-boss nh-hud-bossbar' }, [NH.dom.el('div', { class: 'nh-bar-fill' })]));
    el.hud.appendChild(bw);
  }

  function weaponsKey(run) {
    const arr = (run && Array.isArray(run.weapons)) ? run.weapons : [];
    let s = '';
    for (let i = 0; i < arr.length; i++) s += (arr[i].id || '?') + ':' + (arr[i].level | 0) + ',';
    return s;
  }

  function updateWeaponPips(run) {
    const box = document.getElementById('nh-hud-pips');
    if (!box) return;
    NH.dom.clear(box);
    const src = (run && Array.isArray(run.weapons)) ? run.weapons : [];
    // Blaster immer anzeigen (Starter-Waffe), falls nicht im Run-Arsenal
    const hasBlaster = src.some(function (x) { return x && x.id === 'blaster'; });
    const arr = hasBlaster ? src.slice() : [{ id: 'blaster', level: 1 }].concat(src);
    const seen = {};
    for (let i = 0; i < arr.length; i++) {
      const w = arr[i];
      if (!w || seen[w.id]) continue;
      seen[w.id] = true;
      const def = (NH.balance.weapons || []).find(function (x) { return x.id === w.id; }) || null;
      const max = def ? (def.maxLevel || 1) : 1;
      const label = def ? (def.icon || (w.id || '?').slice(0, 2)) : (w.id || '?').slice(0, 2);
      const row = NH.dom.div(null, 'nh-hud-piprow');
      row.appendChild(NH.dom.el('span', { class: 'nh-hud-piplabel', text: label }));
      for (let l = 1; l <= max; l++) {
        row.appendChild(NH.dom.el('div', { class: 'nh-hud-pip' + (l <= w.level ? (l === max ? ' max' : ' on') : '') }));
      }
      box.appendChild(row);
    }
  }

  function bossDefHP(bossId, wave) {
    try {
      if (typeof NH.waves.recomputeBoss === 'function') {
        const def = NH.waves.recomputeBoss(bossId, wave);
        if (def && def.hp) return def.hp;
      }
    } catch (e) { /* Fallback */ }
    const bd = (NH.balance.bosses || []).find(function (x) { return x.id === bossId; });
    return bd ? bd.hp : 0;
  }

  function updateHUD(run) {
    if (!el.hud || !run) return;

    /* HP */
    const maxHP = run.maxHP || 1;
    const hp = Math.max(0, Math.min(maxHP, run.hp || 0));
    if (hp !== hudCache.hp || maxHP !== hudCache.maxHP) {
      hudCache.hp = hp; hudCache.maxHP = maxHP;
      const fill = document.querySelector('#nh-hud-hpbar .nh-bar-fill');
      if (fill) NH.css.width(fill, (hp / maxHP) * 100);
      const v = document.getElementById('nh-hud-hpval');
      if (v) v.textContent = Math.round(hp) + ' / ' + Math.round(maxHP);
    }

    /* Regenerations-Modifikator (nur sichtbar bei > 0) */
    const regen = Math.max(0, run.regen || 0);
    if (regen !== hudCache.regen) {
      hudCache.regen = regen;
      const rg = document.getElementById('nh-hud-regen');
      if (rg) { rg.classList.toggle('nh-hidden', !(regen > 0)); if (regen > 0) rg.textContent = '+' + (Math.round(regen * 10) / 10) + '/s'; }
    }

    /* Scrap (pulsiert nur bei Zuwachs) */
    const scrap = run.scrap | 0;
    if (scrap !== hudCache.scrap) {
      const gained = scrap > hudCache.scrapPrev;
      hudCache.scrap = scrap;
      hudCache.scrapPrev = scrap;
      const s = document.getElementById('nh-hud-scrap');
      if (s) {
        s.textContent = fmtNum(scrap);
        if (gained) { s.classList.remove('nh-pulse'); void s.offsetWidth; s.classList.add('nh-pulse'); }
      }
    }

    /* Combo */
    const combo = run.combo || 0;
    const comboTimer = run.comboTimer || 0;
    const comboDur = run.comboDuration || NH.balance.economy.comboWindow || 2;
    if (combo !== hudCache.combo) {
      hudCache.combo = combo;
      const c = document.getElementById('nh-hud-combo');
      if (c) {
        c.textContent = combo > 0 ? ('×' + combo) : (NH.t ? NH.t('hud.combo') : 'Combo');
        const econ = NH.balance.economy || {};
        c.className = 'nh-hud-combo' + (combo >= (econ.comboDmgAt || 7) ? ' nh-red' : (combo >= (econ.comboMultiplierAt || 5) ? ' nh-gold' : ''));
      }
    }
    if (Math.abs(comboTimer - hudCache.comboTimer) > 0.02 || comboDur !== hudCache.comboDur) {
      hudCache.comboTimer = comboTimer; hudCache.comboDur = comboDur;
      const fill = document.querySelector('#nh-hud-combobar .nh-bar-fill');
      if (fill) NH.css.width(fill, (comboDur > 0 ? Math.min(1, Math.max(0, comboTimer / comboDur)) : 0) * 100);
    }

    /* Combo-Boost-Flag: nur solange der ×-Dauerboost aktiv ist — balance.SSOT über
       run.comboBoostUntil; kein reiner combo-Schwellen-Term, dpsMultiplier ist
       zeitbasiert und läuft ab, auch wenn die Combo stehen bleibt */
    const boostOn = !!(run.comboBoostUntil && Date.now() < run.comboBoostUntil);
    const b = document.getElementById('nh-hud-boost');
    if (b && (boostOn !== (hudCache.boost === 1))) {
      hudCache.boost = boostOn ? 1 : 0;
      b.classList.toggle('nh-hidden', !boostOn);
      if (boostOn) b.textContent = L('hud.dmgBoost');
    }

    /* Welle + Timer */
    const wave = run.wave || 0;
    if (wave !== hudCache.wave) {
      hudCache.wave = wave;
      const w = document.getElementById('nh-hud-wave');
      if (w) { w.textContent = L('hud.wave') + ' ' + wave; w.classList.toggle('nh-tone-red', !!run.waveBoss); }
    }
    const time = Math.max(0, run.waveTime | 0);
    if (time !== hudCache.time) {
      hudCache.time = time;
      const t = document.getElementById('nh-hud-timer');
      if (t && run.waveDuration > 0) t.textContent = fmtClock(run.waveDuration - time);
    }

    /* Boss-Warnung: prefers run.bossWarn, fallback NH.game.bossWarn (Vertrag) */
    const warnRemain = run.bossWarn || (NH.game && NH.game.bossWarn) || 0;
    const warnKey = warnRemain > 0 ? Math.ceil(warnRemain) : 0;
    if (warnKey !== hudCache.warn) {
      hudCache.warn = warnKey;
      const warn = document.getElementById('nh-hud-bosswarn');
      if (warn) {
        warn.classList.toggle('nh-hidden', !(warnKey > 0));
        if (warnKey > 0) warn.textContent = L('hud.bossWarn') + ' · ' + warnKey + 's';
      }
    }

    /* Boss-Leiste: run.waveBoss && state==RUN && Boss lebt
      (activeBoss liefert ent; vor Spawn nutzen wir die skalierten Def-Werte) */
    const inRun = !!(NH.game && NH.game.state === NH.gameState.RUN);
    let entBoss = null;
    try { if (NH.ents && typeof NH.ents.activeBoss === 'function') entBoss = NH.ents.activeBoss(); } catch (e) {}
    const showBoss = inRun && !!run.waveBoss && !!(entBoss || run.waveBoss);
    const bossWrap = document.getElementById('nh-hud-bossbarwrap');
    if (bossWrap) bossWrap.classList.toggle('nh-hidden', !showBoss);
    if (showBoss) {
      const bossId = (entBoss && (entBoss.bossId || entBoss.typeId)) || run.waveBoss;
      const bossMax = entBoss && entBoss.maxHP ? entBoss.maxHP : bossDefHP(bossId, wave);
      const bossHp = entBoss && entBoss.hp !== undefined ? entBoss.hp : bossMax;
      const bossChanged = (bossId || '') !== hudCache.boss;
      const nm = document.getElementById('nh-hud-bossname');
      if (bossChanged && nm) {
        const bd = (NH.balance.bosses || []).find(function (x) { return x.id === bossId; });
        nm.textContent = bd ? NH.disp('b', bossId, bd.name) : String(bossId || 'BOSS');
      }
      const mg = bossMax || 1;
      if (bossChanged || Math.round(bossHp) !== hudCache.bossHp || Math.round(mg) !== hudCache.bossMax) {
        hudCache.boss = bossId || ''; hudCache.bossHp = Math.round(bossHp); hudCache.bossMax = Math.round(mg);
        const fill = document.querySelector('#nh-hud-bossbar .nh-bar-fill');
        if (fill) NH.css.width(fill, Math.max(0, Math.min(1, bossHp / mg)) * 100);
      }
    } else if (hudCache.boss !== -1) {
      hudCache.boss = -1; hudCache.bossHp = -1; hudCache.bossMax = -1;
    }

    /* Waffen-Pips + Operator-Level */
    const wk = weaponsKey(run);
    if (wk !== hudCache.weapons) {
      hudCache.weapons = wk;
      updateWeaponPips(run);
    }
    const op = (NH.meta && typeof NH.meta.operatorLevel === 'function') ? NH.meta.operatorLevel() : 0;
    if (op !== hudCache.op) {
      hudCache.op = op;
      const o = document.getElementById('nh-hud-op');
      if (o) o.textContent = fmtPath('hud.operatorLv', op);
    }
  }

  /* ---------- HUD-Events ---------- */
  function onCombo(d) { if (d) hudCache.combo = -1; }
  function onScrap() { hudCache.scrap = -1; }
  function onWaveStart(d) {
    if (!el.hud) return;
    hudCache.wave = -1; hudCache.time = -1; hudCache.warn = -1;
    // Rekord-Basis beim ersten Kampf-Well des Runs festhalten
    if (d && (d.wave || 0) === 1) {
      runStartBest = (NH.save && NH.save.data && NH.save.data.lifetime && NH.save.data.lifetime.maxWave) || 0;
    }
    if (d && d.boss) {
      const bd = (NH.balance.bosses || []).find(function (x) { return x.id === d.boss; });
      if (NH.ui && typeof NH.ui.banner === 'function') {
        NH.ui.banner(bd ? NH.disp('b', d.boss, bd.name) : String(d.boss), L('boss.incomming'), '#ff6b6b', 2600);
      }
      sfx('bossSiren');
    }
  }
  function onWaveEnd() { hudCache.time = -1; hudCache.warn = -1; }
  function onBossDie() { hudCache.boss = -1; hudCache.bossHp = -1; hudCache.bossMax = -1; }
  function onGameover(d) {
    if (d && d.stats) NH.ui._lastGameover = d.stats;
    hudCache.combo = -1; hudCache.scrap = -1; hudCache.wave = -1; hudCache.time = -1;
    hudCache.weapons = ''; hudCache.boss = -1; hudCache.warn = -1;
  }
  function onAch(d) {
    sfx('achievement');
    if (d && d.id) NH.ui.toast(NH.t('ach.title') + ' · ' + NH.disp('a', d.id, d.id), '#ffd700');
  }
  function onToastEvt(d) {
    if (!d || !d.text) return;
    if (d.text.indexOf(NH.t('meta.offlineTitle')) === 0) {
      offlineShown = true;
      // Info dauerhaft merken -> Menü-Chipp; main kann sie hier eintragen
      try { NH.ui.offlineRewardInfo = NH.ui.offlineRewardInfo || { minutes: 0, scrap: 0 }; } catch (e) {}
    }
    NH.ui.toast(d.text, d.color);
  }
  function onBoost(d) { boostUntil = (d && d.until) ? d.until : 0; }
  function onMeta() { NH.ui.renderAll(); }

  /* Sprachwechsel (nh:lang): HUD neu aufbauen (übersetzte Caps/Werte), Cache
     invalidieren und Boost-Flag zurücksetzen — updateHUD schreibt dann im
     nächsten Frame alle Elemente frisch. */
  function resetHudCache() {
    for (const k in hudCache) { hudCache[k] = (k === 'weapons') ? '' : -1; }
  }
  function onLang() {
    try { if (el.hud) { NH.dom.clear(el.hud); buildHUD(); } } catch (e) { /* HUD optional */ }
    resetHudCache();
    boostUntil = 0;
    renderAll();
  }

  /* ============================================================
   * PUBLIC API (Vertrag api.js UI)
   * ============================================================ */
  function toast(text, color) {
    if (!el.toasts) return;
    const t = NH.dom.el('div', { class: 'nh-toast', text: String(text || '') });
    NH.css.tone(t, color);
    el.toasts.appendChild(t);
    lastToastKey++;
    const key = lastToastKey;
    const fade = function () {
      if (key !== lastToastKey) return;
      t.classList.add('nh-fading');
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 500);
    };
    const timer = setTimeout(fade, 2600);
    t.addEventListener('click', function () { clearTimeout(timer); fade(); });
  }

  function banner(title, sub, color, ms) {
    if (!el.banner) return;
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    NH.dom.clear(el.banner);
    el.banner.classList.remove('nh-out');
    const t = NH.dom.el('div', { class: 'nh-banner-title', text: String(title || '') });
    NH.css.tone(t, color);
    el.banner.appendChild(t);
    if (sub) el.banner.appendChild(NH.dom.el('div', { class: 'nh-banner-sub', text: String(sub) }));
    bannerTimer = setTimeout(function () {
      el.banner.classList.add('nh-out');
      setTimeout(function () { NH.dom.clear(el.banner); }, 700);
    }, (ms && ms > 0) ? ms : 3000);
  }

  function confirm(opts) {
    opts = opts || {};
    const s = pushOverlay(opts.title || '');
    return new Promise(function (resolve) {
      if (opts.body) s.wrap.appendChild(NH.dom.el('div', { class: 'nh-muted nh-fs-14', text: opts.body }));
      const row = NH.dom.div(null, 'nh-flexrow');
      const ok = NH.dom.button(opts.okText || L('ui.confirmYes'), 'nh-btn nh-primary' + (opts.tone === 'danger' ? ' nh-danger' : ''), function () {
        closeTop();
        sfx('click');
        resolve(true);
      });
      const no = NH.dom.button(L('ui.confirmNo'), 'nh-btn nh-ghost', function () {
        closeTop();
        resolve(false);
      });
      row.appendChild(ok);
      row.appendChild(no);
      s.wrap.appendChild(row);
    });
  }

  function modal(html) {
    const s = pushOverlay('');
    if (html && html.nodeType) s.wrap.appendChild(html);
    else s.wrap.innerHTML = html || '';
    s.wrap.appendChild(NH.dom.button(L('ui.close'), 'nh-btn nh-ghost nh-sm', closeTop));
    return s.wrap;
  }

  function overlayOpen(title) {
    const s = pushOverlay(title || '');
    return s.wrap;
  }
  function overlayClose() { closeTop(); }

  function showScreen(name, opts) {
    if (!el.overlays) return;
    openScreen(name, opts);
  }
  function hideScreens() { closeAll(); }

  /* Nach Sprachwechsel/Meta-Änderung offene Screens neu rendern.
     Fremde Overlays (shop: kein dataset.name) werden NICHT angefasst —
     shop rendert sich bei 'lang' selbst. Stapel bleibt erhalten. */
  function renderAll() {
    // Während eines Screen-Builds nicht erneut rendern (z.B. synchrone
    // nh:meta-Emitites aus meta.init beim allerersten meta-Zugriff).
    if (building || !el.overlays) return;
    // Stapel-Reihenfolge bewahren: jeden eigenen Screen durch eine frische
    // Shell ersetzen. Fremde Overlays (z.B. Shop ohne dataset.name) bleiben
    // unangetastet — sie rendern sich bei 'lang' selbst neu.
    // Stub-/Browser-sicher: kein Element.querySelector/replaceChild (fehlt
    // in DOM-Stubs), nur Kinder-Array + DOM-Helfer.
    const shells = Array.prototype.slice.call(el.overlays.children);
    for (let i = 0; i < shells.length; i++) {
      const shell = shells[i];
      let wrap = null;
      const kids = shell && shell.children;
      if (kids && kids.length) wrap = kids[0]; // ovShell-Bau: Shell hat genau ein Kind (wrap)
      if (!wrap || !wrap.dataset || !wrap.dataset.name) continue;
      const fn = screenBuilder[wrap.dataset.name];
      if (!fn) continue;
      const s = ovShell('');
      s.wrap.dataset.name = wrap.dataset.name;
      try { fn(s.wrap, {}); } catch (e) { console.error('[NH:ui:renderAll]', e); }
      try { shell.parentNode && shell.parentNode.removeChild(shell); } catch (e) { /* detached */ }
      try { el.overlays.insertBefore(s.ov, null); } catch (e) { /* position optional */ }
    }
  }

  /* Touch-Doppel-Klicks bricht der Browser; Menü-Buttons feuern direkt */

  /* ---------- i18n-Anzeigenamen (NH.disp) ---------- */
  // Reihenfolge: lang-Tabelle -> Balance-Name -> id
  NH.disp = function (ns, id, fallback) {
    try {
      const table = (NH.lang && NH.lang[NH.lang.current] && NH.lang[NH.lang.current][ns]) || {};
      if (table[id] !== undefined) return table[id];
    } catch (e) { /* Fallback */ }
    return (fallback !== undefined ? fallback : id);
  };

  /* ---------- Registrierung (Vertrag) ---------- */
  NH.ui = NH.ui || {};
  NH.ui.init = function () {
    if (inited) return;
    inited = true;
    css();
    buildRoot();
    buildHUD();
    NH.events.on('nh:lang', onLang);
    NH.events.on('lang', renderAll);
    NH.events.on('nh:meta', onMeta);
    NH.events.on('nh:toast', onToastEvt);
    NH.events.on('nh:combo', onCombo);
    NH.events.on('nh:scrap', onScrap);
    NH.events.on('nh:waveStart', onWaveStart);
    NH.events.on('nh:waveEnd', onWaveEnd);
    NH.events.on('nh:bossDie', onBossDie);
    NH.events.on('nh:gameover', onGameover);
    NH.events.on('nh:ach', onAch);
    NH.events.on('nh:boost', onBoost);
  };
  NH.ui.updateHUD = updateHUD;
  NH.ui.showScreen = showScreen;
  NH.ui.hideScreens = hideScreens;
  NH.ui.toast = toast;
  NH.ui.banner = banner;
  NH.ui.overlayOpen = overlayOpen;
  NH.ui.overlayClose = overlayClose;
  NH.ui.confirm = confirm;
  NH.ui.modal = modal;
  NH.ui.renderAll = renderAll;
  NH.ui._lastGameover = null;
  NH.ui.offlineRewardInfo = null; // main kann hier die Offline-Info fürs Menü eintragen
  NH.ui.newBestFlag = false;      // main/game kann hier den "NEUER REKORD"-Flag setzen
})();