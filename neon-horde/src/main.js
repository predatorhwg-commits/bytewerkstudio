/* ============================================================
 * NEON HORDE — Bytewerk Studio
 * main.js — Boot-Sequenz & globaler Fehler-Handler
 * Vertrag: api.js (MAIN). KEINE Spiel-Logik.
 * Lade-Reihenfolge: ... -> ui -> game -> main
 *
 * Boot: save.load() -> offlineReward (einmalig) -> Audio-Geste nur
 * registrieren (kein unlock!) -> input/ui/game init -> Boot-Screen
 * 1,5 s (Enter/Space/Klick skippt) -> NH.ui.showScreen('menu').
 * ui.js baut das Menü und verdrahtet die Klick-Events auf
 * NH.game.* / NH.meta.* selbst; es entscheidet anhand von
 * NH.save.data.runSave, ob 'Weiterspielen' erscheint.
 * localStorage-Sperre: save.js tost selbst (err.saveBlocked),
 * das Spiel läuft dann im In-Memory-Modus weiter.
 * ============================================================ */
(function () {
  'use strict';
  const NH = (window.NH = window.NH || {});

  const BOOT_MS = 1500;          // Boot-Screen-Mindestanzeigedauer
  const BOOT_COLOR = '#35D2E8';  // Neon-Cyan für Offline-Banner/Toast

  let booted = false;
  let bootOverlay = null;
  let bootTimer = null;
  let offlineReward = null;      // meta.offlineReward() beim Boot; Anzeige nach Boot-Screen

  /* ============================================================
   * Globaler Fehler-Handler (#nh-error existiert in index.html)
   * ============================================================ */
  function fatal(err, source) {
    // IMMER zuerst loggen, damit die eigentliche Ursache nie verloren geht
    try { console.error('[NH] fatal:', source || '', err && err.message ? err.message : err); } catch (e) {}
    let el;
    try { el = NH.dom.$('#nh-error'); } catch (e) { el = null; }
    if (!el) return;
    const msg = (source ? source + ': ' : '') + (err && err.message ? err.message : String(err));
    try {
      const box = NH.dom.div(null, 'nh-error-box');
      box.appendChild(NH.dom.el('div', { class: 'nh-error-title', text: NH.t('err.title') }));
      box.appendChild(NH.dom.el('pre', { class: 'nh-error-msg' }, msg));
      box.appendChild(NH.dom.el('div', { class: 'nh-error-hint', text: NH.t('err.msg') }));
      box.appendChild(NH.dom.button(NH.t('err.reload'), 'nh-btn', function () { window.location.reload(); }));
      NH.dom.clear(el);
      el.appendChild(box);
    } catch (e2) {
      try { el.textContent = msg; } catch (e3) {} // Minimal-Fallback
    }
    try { el.classList.add('nh-error-open'); } catch (e4) {}
  }

  function bindFatalHandlers() {
    window.onerror = function (message, src, line, col, errObj) {
      let info = message;
      if (src) info += ' (' + String(src).split('/').pop() + ':' + line + ':' + (col || 0) + ')';
      fatal(errObj || info, 'runtime');
    };
    window.addEventListener('unhandledrejection', function (e) {
      fatal(e && e.reason ? e.reason : 'Unhandled promise rejection', 'promise');
    });
  }

  /* ============================================================
   * Boot-Screen-Overlay (DOM, skaliert mit der Seite; Spiel-Logik
   * ist weiterhin fest 1280x720 — Skalierung macht CSS/index.html)
   * ============================================================ */
  function injectCSS() {
    NH.css.add(
      '#nh-boot{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;cursor:pointer;user-select:none;' +
        'background:radial-gradient(ellipse at 50% 40%,#10202e 0%,#0a0f16 68%);text-align:center;padding:24px;}' +
      '#nh-boot .nh-boot-title{font-size:clamp(30px,7vw,64px);font-weight:800;letter-spacing:6px;' +
        'color:#35D2E8;text-shadow:0 0 26px rgba(53,210,232,.6);font-family:monospace;}' +
      '#nh-boot .nh-boot-line{margin-top:16px;font-size:17px;color:#9db4c8;letter-spacing:3px;font-family:monospace;}' +
      '#nh-boot .nh-boot-skip{margin-top:30px;font-size:13px;color:#5b6b80;letter-spacing:3px;' +
        'font-family:monospace;animation:nh-blink 1.2s ease-in-out infinite;}' +
      '@keyframes nh-blink{0%,100%{opacity:.3}50%{opacity:1}}' +
      '#nh-error .nh-error-box{max-width:560px;border:1px solid rgba(255,107,107,.45);border-radius:10px;' +
        'padding:22px 26px;background:rgba(24,8,8,.6);text-align:left;}' +
      '#nh-error .nh-error-title{font-size:22px;color:#ff6b6b;letter-spacing:2px;margin-bottom:10px;font-family:monospace;}' +
      '#nh-error .nh-error-msg{white-space:pre-wrap;word-break:break-word;color:#e8d5d5;font-size:13px;' +
        'margin:0 0 12px;max-height:220px;overflow:auto;font-family:monospace;}' +
      '#nh-error .nh-error-hint{color:#9db4c8;font-size:13px;margin-bottom:16px;}'
    );
  }

  function showBootOverlay(hasSave) {
    bootOverlay = NH.dom.el('div', { id: 'nh-boot' }, [
      NH.dom.el('div', { class: 'nh-boot-title', text: NH.t('ui.boot') }),
      NH.dom.el('div', { class: 'nh-boot-line', text: hasSave ? NH.t('ui.bootlineSave') : NH.t('ui.bootline') }),
      NH.dom.el('div', { class: 'nh-boot-skip', text: NH.t('ui.pressEnter') }),
    ]);
    document.body.appendChild(bootOverlay);
    bootOverlay.addEventListener('click', finishBoot);
    NH.events.on('nh:key', onBootKey);
    bootTimer = setTimeout(finishBoot, BOOT_MS);
  }

  function onBootKey(d) {
    if (d && (d.code === 'Enter' || d.code === 'Space')) finishBoot();
  }

  function finishBoot() {
    try {
      if (!bootOverlay) return;
      if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
      NH.events.off('nh:key', onBootKey);
      const o = bootOverlay;
      bootOverlay = null;
      if (o.parentNode) o.parentNode.removeChild(o);
      showOfflineReward(); // Banner/Toast nach Boot -> im Menü sichtbar
      if (NH.ui && typeof NH.ui.showScreen === 'function') NH.ui.showScreen('menu');
    } catch (e) {
      fatal(e, 'finishBoot');
    }
  }

  /* Offline-Reward: einmalig bei Boot via meta angewandt, hier nur Anzeige.
     meta.offlineFor hat zwei %s-Platzhalter (Minuten, Scrap). */
  function showOfflineReward() {
    if (!offlineReward || offlineReward.scrap <= 0 || !NH.ui) return;
    const mins = offlineReward.minutes >= 60
      ? Math.round(offlineReward.minutes / 60) + 'h'
      : offlineReward.minutes + 'min';
    const sub = String(NH.t('meta.offlineFor')).replace('%s', mins).replace('%s', offlineReward.scrap);
    try {
      if (typeof NH.ui.banner === 'function') NH.ui.banner(NH.t('meta.offlineTitle'), sub, BOOT_COLOR, 4500);
      if (typeof NH.ui.toast === 'function') NH.ui.toast(NH.t('meta.offlineTitle') + ' — ' + sub, BOOT_COLOR);
    } catch (e) { /* Banner/Toast sind optional — nie den Boot-Ablauf stoppen */ }
    /* Keine Doppelanzeige (QA-Fix): Banner+Toast gezeigt -> Menü-Chip
       unterdrücken. Der Chip in ui.js (buildMenu) hängt an
       NH.ui.offlineRewardInfo; null verhindert die zweite Anzeige. */
    try { NH.ui.offlineRewardInfo = null; } catch (e) { /* optional */ }
  }

  /* ============================================================
   * Boot-Sequenz (Vertrag api.js MAIN)
   * ============================================================ */
  function boot() {
    if (booted) return;
    booted = true;
    try {
      /* 1) Save laden — bei localStorage-Sperre tost save.js selbst
         (err.saveBlocked); alles läuft dann im In-Memory-Modus weiter. */
      NH.save.load();

      /* 1b) 'nh:init' beim Boot auslösen (Vertrag api.js: meta.init,
         ents.reset, weapons.init). Erst NACH save.load(), damit meta.init
         die Save-Daten vorfindet; vor ui/game.init reicht — alle Listener
         arbeiten rein intern (kein DOM/Canvas, keine Laufzeit-Abhängigkeit). */
      if (NH.events && typeof NH.events.emit === 'function') NH.events.emit('nh:init');

      /* 2) Offline-Reward genau einmal beim Boot anwenden (addBank in meta,
         setzt offlineTs zurück). Anzeige erst nach ui.init (Schritt 5). */
      if (NH.meta && typeof NH.meta.offlineReward === 'function') {
        offlineReward = NH.meta.offlineReward();
      }

      /* 3) Audio: unlock() braucht eine User-Geste (input.js ruft es beim
         ersten Key/Pointer); hier wird nur reagiert — siehe 'nh:audioUnlock'-
         Listener unten. Kein unlock in boot(). */

      /* 4) Canvas + Module initialisieren. Logik-Auflösung fest 1280x720
         (index.html setzt die Attribute bereits; hier explizit gecacht). */
      const canvas = NH.dom.$('#game-canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 1280;
      canvas.height = 720;
      if (NH.input && typeof NH.input.init === 'function') NH.input.init(canvas);
      if (NH.ui && typeof NH.ui.init === 'function') NH.ui.init();
      if (NH.game && typeof NH.game.init === 'function') NH.game.init(canvas, ctx);

      /* 5) Boot-Screen 1,5 s (Enter/Space/Klick skippt); danach Menü.
         ui zeigt 'Weiterspielen' selbst an, wenn runSave existiert. */
      injectCSS();
      showBootOverlay(!!(NH.save.data && NH.save.data.runSave));
    } catch (e) {
      fatal(e, 'boot');
      finishBoot(); // Overlay nicht hängen lassen; Menü wenn möglich
    }
  }

  /* ============================================================
   * Audio-Geste: nur registrieren — das eigentliche unlock macht
   * input.js bei der ersten Interaktion; hier startet der BGM-Drone
   * (audio.sfx('bgm') ist idempotent, Sound-Einstellung wird respektiert).
   * ============================================================ */
  NH.events.on('nh:audioUnlock', function () {
    try {
      if (NH.audio && NH.audio.enabled && typeof NH.audio.sfx === 'function') {
        NH.audio.sfx('bgm', { on: true });
      }
    } catch (e) { /* Audio ist optional — nie werfen */ }
  });

  /* ============================================================
   * Registration (Vertrag: nur NH-Objekte, kein return/export)
   * ============================================================ */
  NH.main = {
    boot: boot,
  };

  /* Globale Fehler möglichst früh installieren (vor boot) */
  bindFatalHandlers();

  /* Boot anstoßen, sobald DOM geparst ist. main.js ist das letzte
     Skript im <body>, daher läuft boot() direkt; nur bei früher
     Einbindung wird auf DOMContentLoaded gewartet. */
  function start() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { NH.main.boot(); });
    } else {
      NH.main.boot();
    }
  }
  start();
})();