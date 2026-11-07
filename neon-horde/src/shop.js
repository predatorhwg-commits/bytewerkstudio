/* ============================================================
 * NEON HORDE — Bytewerk Studio
 * shop.js — Draft-Shop nach jeder Welle (Herzstück)
 * Waffen kaufen/upgraden/verkaufen, Hot Deals, Reroll,
 * Schnellstart-Bonus, Auto-Start-Countdown.
 * Vertrag: api.js (SHOP). Zahlen ausschließlich balance.* (SSOT).
 * Verbindliche Formeln (Zahlenspielregel):
 *   Upgrade-Karte cost = ceil(baseCost * grow^level)
 *   Verkaufswert     = floor((price + upgradeBase*(L-1)*L/2) * 0.5)
 * Beim Laden: nur CSS + Event-Registrierung (kein Canvas/DOM-Layout).
 * Overlay entsteht erst in open() (NH.ui.overlayOpen, Fallback DOM).
 * game.js ruft open() NACH state=SHOP + runSave; shop ruft zur
 * Laufzeit game.startNextWave(quick).
 * ============================================================ */
(function () {
  'use strict';
  const NH = (window.NH = window.NH || {});
  const BAL = NH.balance;
  const ec = BAL.economy;         // Wirtschaft
  const wv = BAL.waves;           // Wellen-/Shop-Timing

  let container = null;           // Overlay-Container (offen, wenn gesetzt)
  let openAt = 0;                 // Öffnungs-Zeitstempel (QuickStart-Fenster)
  let bought = null;              // {weapon:bool, upgrades:{id:true}}
  let dealTimers = null;          // hotDeal id -> setTimeout
  let autoTimer = null;           // Auto-Start nach shopDuration
  let tickTimer = null;           // 1-s-Tick (Timer, Deals, Quick-Highlight)

  /* ---------- Helfer ---------- */
  function run() { return (NH.game && NH.game.run) || null; }
  function scrapAmt() { const r = run(); return r ? r.scrap : 0; }
  function weaponDef(id) { return BAL.weapons.find((w) => w.id === id) || null; }
  function upgradeDef(id) { return BAL.upgrades.find((u) => u.id === id) || null; }
  function ownedLevel(id) { const r = run(); if (!r) return 0; const w = r.weapons.find((x) => x.id === id); return w ? w.level : 0; }
  function buffLevel(id) { const r = run(); return (r && r.buffs && r.buffs[id]) || 0; }

  /* Anzeigename: NH.disp (ui.js), sonst lang-Tabelle, sonst Balance-Name */
  function disp(id, ns, fallback) {
    if (NH.disp && typeof NH.disp === 'function') {
      try { return NH.disp(ns, id, fallback); } catch (e) { /* Fallback unten */ }
    }
    const l = NH.lang && NH.lang[NH.lang.current] && NH.lang[NH.lang.current][ns];
    return (l && l[id]) || fallback;
  }
  function wName(id) { const d = weaponDef(id); return disp(id, 'w', d ? d.name : id); }
  function uName(id) { const d = upgradeDef(id); return disp(id, 'u', d ? d.name : id); }

  function fmt(tpl, v) { return String(tpl).replace('%s', v); }
  function num(n) { return Math.round(n * 10) / 10; } // 1 Dezimalstelle

  function sfx(name) {
    try { if (NH.audio && typeof NH.audio.sfx === 'function') NH.audio.sfx(name); } catch (e) {}
  }
  function toast(text, color) {
    try {
      if (NH.ui && typeof NH.ui.toast === 'function') NH.ui.toast(text, color);
      else NH.events.emit('nh:toast', { text: text, color: color || '#35D2E8' });
    } catch (e) {}
  }
  function metaChanged(kind) {
    // Lose Kopplung: HUD/Pips/Statistik hören auf 'nh:meta'
    NH.events.emit('nh:meta', { src: 'shop', kind: kind || 'change' });
  }
  function trySpend(n) {
    // Laufzeit-Abhängigkeit auf game (lädt nach shop): robust prüfen
    return !!(NH.game && typeof NH.game.spendScrap === 'function' && NH.game.spendScrap(n));
  }

  function canQuick() {
    const r = run();
    return !!(r && r.wave >= wv.quickStartMinWave && (Date.now() - openAt) / 1000 <= wv.quickStartWindow);
  }

  /* ---------- Offer-Generierung (Kern) ---------- */
  // weapon:    zufällige nicht-besessene Waffe; Arsenal voll -> null
  // upgrades:  2 DISTINKTE balance.upgrades unterm Level-Cap;
  //            cost = ceil(baseCost * grow^Level) — Level = Buff-Level
  // weaponUpgrade: 1 besessene, nicht maximierte Waffe (Lv n->n+1);
  //            cost = upgradeBase * n (QA-Fix: Waffen-Upgrade-Pfad)
  // hotDeals:  bis 2 weitere nicht-besessene Waffen, -hotDealDiscount,
  //            Countdown hotDealDuration (Timer + Toast beim Ablauf)
  function regenOffers() {
    const r = run();
    const owned = new Set((r ? r.weapons : []).map((w) => w.id));
    const freePool = BAL.weapons.filter((w) => !owned.has(w.id));

    let weapon = null;
    if (freePool.length) {
      const wd = NH.u.pick(freePool);
      weapon = { id: wd.id, price: wd.price, discount: 0 };
    }

    const cands = BAL.upgrades.filter((u) => buffLevel(u.id) < u.max);
    const upgrades = [];
    const pool = cands.slice();
    while (upgrades.length < 2 && pool.length) {
      const i = NH.u.randi(0, pool.length - 1);
      const u = pool.splice(i, 1)[0];
      const lvl = buffLevel(u.id);
      upgrades.push({ id: u.id, cost: Math.ceil(u.baseCost * Math.pow(u.grow, lvl)), level: lvl });
    }

    const hotDeals = [];
    if (freePool.length) {
      const sack = freePool.filter((x) => !weapon || x.id !== weapon.id);
      for (let i = 0; i < ec.hotDealCount && sack.length; i++) {
        const k = NH.u.randi(0, sack.length - 1);
        const w = sack.splice(k, 1)[0];
        hotDeals.push({
          id: w.id,
          price: Math.round(w.price * (1 - ec.hotDealDiscount)),
          discount: ec.hotDealDiscount,
          _start: Date.now(), // Countdown-Basis (Timer-Start)
        });
      }
    }

    // Waffen-Upgrade-Karte: 1 zufällige BESESSENE, NICHT maximierte Waffe.
    // cost = balance.weapons.upgradeBase * level; Level steigt um 1 (n->n+1).
    let weaponUpgrade = null;
    if (r) {
      const upPool = r.weapons.filter((w) => {
        const d = weaponDef(w.id);
        return d && d.upgradeBase && w.level >= 1 && w.level < d.maxLevel;
      });
      if (upPool.length) {
        const w = NH.u.pick(upPool);
        const d = weaponDef(w.id);
        weaponUpgrade = { weaponId: w.id, level: w.level, cost: d.upgradeBase * w.level };
      }
    }

    NH.shop.offers = {
      weapon: weapon,
      upgrades: upgrades,
      weaponUpgrade: weaponUpgrade,
      hotDeals: hotDeals,
      rerollsLeft: ec.rerollMax,
      rerollCost: ec.rerollCost,
    };
    bought = { weapon: false, upgrades: {}, weaponUp: false };
  }

  /* ---------- Formeln (SSOT, Zahlenspielregel verbindlich) ---------- */
  function spentOn(id, level) { // gesamte Upgrade-Investition bis Lv L
    const d = weaponDef(id);
    if (!d || level <= 1) return 0;
    return d.upgradeBase * (level - 1) * level / 2;
  }
  function sellValue(id, level) {
    const d = weaponDef(id);
    if (!d) return 0;
    return Math.floor((d.price + spentOn(id, level)) * ec.sellRefundRatio);
  }

  /* ---------- Canvas-Icon (Mini-Canvas 64x64, gezeichnetes Symbol) ---------- */
  function drawIcon(canvas, def) {
    const S = canvas.width;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10,15,22,0.88)';
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(S, 0, S, S, r);
    ctx.arcTo(S, S, 0, S, r);
    ctx.arcTo(0, S, 0, 0, r);
    ctx.arcTo(0, 0, S, 0, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = '800 26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = def.color;
    ctx.fillText(def.icon, S / 2, S / 2 + 1);
    ctx.shadowBlur = 0;
    // Deko-Projektile (nur bei Mustern mit Projektilen)
    const n = def.pattern === 'orbit' ? 4 : (def.projectiles > 1 ? Math.min(def.projectiles, 5) : 0);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      ctx.beginPath();
      ctx.arc(S / 2 + Math.cos(a) * (S / 2 - 9), S / 2 + Math.sin(a) * (S / 2 - 9), 2.4, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
    }
  }
  function iconSpan(def) {
    const c = NH.dom.el('canvas', { width: 64, height: 64, class: 'nh-icon' });
    try { drawIcon(c, def); } catch (e) {}
    return c;
  }

  /* ---------- Effekt-Beschreibungen (konkrete Zahlen aus balance) ---------- */
  // Stat-Zeilen via lang.js-Keys (shop.statDmg/statRate/...), NH.t + %s.
  // Effektive Werte via NH.weapons.stats(id, level) (Laufzeit-Guard).
  function weaponLines(d) {
    if (!d) return [];
    const st = (NH.weapons && typeof NH.weapons.stats === 'function') ? NH.weapons.stats(d.id, 1) : null;
    const cfg = st || d;
    const lines = [];
    lines.push(fmt(NH.t('shop.statDmg'), cfg.dmg) + ' · ' + fmt(NH.t('shop.statRate'), num(cfg.fireRate)));
    switch (d.pattern) {
      case 'single': lines.push(fmt(NH.t('shop.statRange'), cfg.range)); break;
      case 'cone': {
        const cone = String(fmt(fmt(NH.t('shop.statCone'), cfg.spread), cfg.projectiles || 0));
        // Flamer feuert keinen Schrot: doppelte-Klausel-Rest entfernen (DE 'Schrot' / EN 'shells')
        lines.push(d.id === 'flamer' ? cone.replace(/\s*·\s*\d+\s*(Schrot|shells?)\s*$/, '') : cone);
        if (d.id === 'flamer') lines.push(fmt(NH.t('shop.statDot'), cfg.dotDmg) + ' · ' + cfg.dotDuration + 's · max ' + cfg.dotMaxStack + '×');
        break;
      }
      case 'pierce': lines.push(fmt(NH.t('shop.statPierce'), cfg.pierce + 1)); break;
      case 'chain': lines.push(fmt(fmt(NH.t('shop.statChain'), cfg.chainTargets), num(cfg.stun))); break;
      case 'fan': lines.push(fmt(NH.t('shop.statFan'), cfg.projectiles)); break;
      case 'aoe': lines.push(fmt(NH.t('shop.statAoe'), cfg.aoeRadius)); break;
      case 'turret': lines.push(fmt(NH.t('shop.statTurret'), cfg.turretDuration) + ' · max ' + cfg.turretMax); break;
      case 'orbit': lines.push(fmt(NH.t('shop.statOrbit'), cfg.mineAoe) + 'px AoE'); break;
      default: lines.push(fmt(NH.t('shop.statRange'), cfg.range));
    }
    lines.push(fmt(NH.t('shop.costPerLv'), d.upgradeBase) + ' · ' + NH.t('shop.maxed') + ' ' + d.maxLevel);
    return lines;
  }

  /* Upgrade-Karte: Stat-Delta current level -> level+1 (NH.weapons.stats) */
  function wupLines(offer) {
    if (!offer) return { title: '', lines: [] };
    const lvl = Math.max(1, (offer.level | 0) || 1);
    const title = fmt(NH.t('shop.upgradeTo'), lvl + 1);
    const d = weaponDef(offer.weaponId);
    if (!d || !NH.weapons || typeof NH.weapons.stats !== 'function') return { title: title, lines: [] };
    const from = NH.weapons.stats(offer.weaponId, lvl) || {};
    const to = NH.weapons.stats(offer.weaponId, lvl + 1) || {};
    const show = (a, b, path) => {
      if (a === undefined || b === undefined || a === b) return null;
      const dlt = num(b - a);
      if (dlt === 0) return null;
      return String(fmt(NH.t(path), '+ ' + dlt)).replace(/\s+$/, '').replace(/\.$/, '');
    };
    const lines = [];
    let x = show(from.dmg, to.dmg, 'shop.statDmg'); if (x) lines.push(x);
    x = show(from.fireRate, to.fireRate, 'shop.statRate'); if (x) lines.push(x);
    x = show(from.range, to.range, 'shop.statRange'); if (x) lines.push(x);
    x = show(from.pierce, to.pierce, 'shop.statPierce'); if (x) lines.push(x);
    if (from.chainTargets !== undefined && to.chainTargets !== undefined && from.chainTargets !== to.chainTargets) {
      const dC = num(to.chainTargets - from.chainTargets);
      const dS = num(to.stun - from.stun);
      if (dC !== 0) {
        lines.push(String(fmt(fmt(NH.t('shop.statChain'), '+ ' + dC), dS !== 0 ? ('+ ' + dS) : num(to.stun))).replace(/\s+$/, '').replace(/\.$/, ''));
      }
    }
    x = show(from.aoeRadius, to.aoeRadius, 'shop.statAoe'); if (x) lines.push(x);
    x = show(from.turretDuration, to.turretDuration, 'shop.statTurret'); if (x) lines.push(x);
    x = show(from.dotDmg, to.dotDmg, 'shop.statDot'); if (x) lines.push(x);
    lines.push(fmt(NH.t('shop.costPerLv'), offer.cost));
    return { title: title, lines: lines };
  }

  /* Effekt-Label über lang.ueff.<id> + %s (Wert = effectPerLevel als Zahl);
     Fallback auf balance.effectLabel (alte EN-Basis). */
  function roleName(id) {
    const d = weaponDef(id);
    try {
      const t = NH.t('role.' + id);
      if (t && t.indexOf('role.') !== 0) return t;
    } catch (e) { /* Fallback unten */ }
    return d ? d.role || '' : '';
  }
  function fmtEffect(d) {
    if (!d) return '';
    try {
      const t = NH.t('ueff.' + d.id);
      // %s-Wert einsetzen: Prozent-Stats (speed/magnet/dodge/crit) als ganze
      // Zahl wie balance.effectLabel ('+8 % Speed' statt '+0.08 % Speed');
      // lang.js escaped '%' als '%%' -> nach Substitution auflösen
      if (t && t.indexOf('ueff.') !== 0) {
        let val = d.effectPerLevel;
        if (d.id === 'speed' || d.id === 'magnet' || d.id === 'dodge' || d.id === 'crit') val = Math.round(d.effectPerLevel * 100);
        return String(t).replace('%s', val).replace(/%%/g, '%');
      }
    } catch (e) { /* Fallback unten */ }
    return d.effectLabel || '';
  }

  /* ---------- UI-Bausteine ---------- */
  function priceLine(price, buyable) {
    return NH.dom.div([
      NH.dom.el('span', { class: buyable ? 'nh-price' : 'nh-price nh-low', text: '-' + price + ' Scrap' }),
    ], 'nh-card-price');
  }
  function buyButton(label, buyable, fn) {
    return NH.dom.button(label, 'nh-btn nh-card-buy' + (buyable ? '' : ' nh-dim'), fn);
  }
  function boughtBadge() {
    return NH.dom.div(NH.t('shop.bought'), 'nh-bought-badge');
  }
  function cardShell(def, cls, body) {
    return NH.dom.div([
      NH.dom.div([
        iconSpan(def),
        NH.dom.div([
          NH.dom.el('div', { class: 'nh-card-title', text: def ? wName(def.id) : '' }),
          NH.dom.el('div', { class: 'nh-card-sub', text: def ? roleName(def.id) : '' }),
        ], 'nh-card-head-text'),
      ], 'nh-card-head'),
      body,
    ], cls);
  }

  /* ---------- Karten rendern (3: Waffe links groß, 2 Upgrade-Karten) ---------- */
  function renderCards() {
    const box = container ? container.querySelector('.nh-shop-cards') : null;
    if (!box) return;
    NH.dom.clear(box);
    const o = NH.shop.offers;
    const s = scrapAmt();
    const wep = o.weapon;

    // Karte 1: Waffe (oder 'Ausverkauft', wenn Arsenal voll / kein Angebot)
    if (!wep) {
      box.appendChild(NH.dom.div([
        NH.dom.el('div', { class: 'nh-card-empty', text: NH.t('shop.off') }),
      ], 'nh-card nh-card-weapon nh-card-empty'));
    } else {
      const d = weaponDef(wep.id);
      const buyable = s >= wep.price;
      const card = cardShell(d, 'nh-card nh-card-weapon' + (buyable ? ' nh-buyable' : ' nh-locked') + (bought.weapon ? ' nh-bought' : ''), NH.dom.div(weaponLines(d).map((t) => NH.dom.el('div', { class: 'nh-eff', text: t })), 'nh-card-eff'));
      card.appendChild(priceLine(wep.price, buyable));
      if (bought.weapon) card.appendChild(boughtBadge());
      else card.appendChild(buyButton(NH.t('shop.buy'), buyable, function () { NH.shop.buyWeapon(wep.id, wep.price); }));
      box.appendChild(card);
    }

    // Karten 2+3: Waffen-Upgrade (falls vorhanden) + Spieler-Upgrades.
    // Das Waffen-Upgrade ersetzt eine der 2 Spieler-Upgrade-Karten
    // (3-Spalten-Layout bleibt; Taste 2 = Waffen-Upgrade, 3 = Upgrade).
    if (o.weaponUpgrade) {
      renderWupCard(box, o.weaponUpgrade, s);
      renderUpCard(box, o.upgrades[0], s);
    } else {
      renderUpCard(box, o.upgrades[0], s);
      renderUpCard(box, o.upgrades[1], s);
    }
  }

  /* Waffen-Upgrade-Karte: 'Waffe auf Lv N+1' + Stat-Delta + Kosten */
  function renderWupCard(box, offer, s) {
    if (!box || !offer) return;
    const d = weaponDef(offer.weaponId);
    const cost = d ? d.upgradeBase * Math.max(1, offer.level | 0) : offer.cost;
    const buyable = s >= cost;
    const isBought = !!bought.weaponUp;
    const info = wupLines(offer);
    const card = NH.dom.div([
      NH.dom.div([
        iconSpan(d ? { id: d.id, icon: d.icon, color: d.color } : { id: offer.weaponId, icon: '?', color: '#35D2E8' }),
        NH.dom.div([
          NH.dom.el('div', { class: 'nh-card-title', text: d ? wName(d.id) : String(offer.weaponId) }),
          NH.dom.el('div', { class: 'nh-card-sub', text: (info && info.title) || fmt(NH.t('shop.upgradeTo'), (offer.level || 1) + 1) }),
        ], 'nh-card-head-text'),
      ], 'nh-card-head'),
      NH.dom.div((info && info.lines ? info.lines : []).map((t) => NH.dom.el('div', { class: 'nh-eff', text: t })), 'nh-card-eff'),
    ], 'nh-card nh-card-upgrade nh-card-wup' + (buyable ? ' nh-buyable' : ' nh-locked') + (isBought ? ' nh-bought' : ''));
    card.appendChild(priceLine(cost, buyable));
    if (isBought) card.appendChild(boughtBadge());
    else card.appendChild(buyButton(NH.t('shop.buy'), buyable, function () { NH.shop.buyWeaponUpgrade(); }));
    box.appendChild(card);
  }

  /* Spieler-Upgrade-Karte (balance.upgrades) */
  function renderUpCard(box, u, s) {
    if (!u) { box.appendChild(NH.dom.div(null, 'nh-card nh-card-upgrade nh-card-empty')); return; }
    const d = upgradeDef(u.id);
    const buyable = s >= u.cost;
    const isBought = !!bought.upgrades[u.id];
    const card = NH.dom.div([
      NH.dom.div([
        iconSpan({ id: d.id, icon: d.id === 'regen' ? '+' : d.id.substring(0, 1).toUpperCase(), color: '#35D2E8' }),
        NH.dom.div([
          NH.dom.el('div', { class: 'nh-card-title', text: uName(u.id) }),
          NH.dom.el('div', { class: 'nh-card-sub', text: fmt(NH.t('shop.upgradeTo'), u.level + 1) }),
        ], 'nh-card-head-text'),
      ], 'nh-card-head'),
      NH.dom.div([NH.dom.el('div', { class: 'nh-eff', text: fmtEffect(d) })], 'nh-card-eff'),
    ], 'nh-card nh-card-upgrade' + (buyable ? ' nh-buyable' : ' nh-locked') + (isBought ? ' nh-bought' : ''));
    card.appendChild(priceLine(u.cost, buyable));
    if (isBought) card.appendChild(boughtBadge());
    else card.appendChild(buyButton(NH.t('shop.buy'), buyable, function () { NH.shop.buyUpgrade(u.id); }));
    box.appendChild(card);
  }

  /* ---------- Hot Deals (Countdown 10 s, dann raus + Toast) ---------- */
  function renderDeals() {
    const box = container ? container.querySelector('.nh-shop-deals') : null;
    if (!box) return;
    NH.dom.clear(box);
    const deals = NH.shop.offers.hotDeals;
    if (!deals.length) {
      box.appendChild(NH.dom.div(NH.t('shop.off'), 'nh-shop-none'));
      return;
    }
    for (const hd of deals) {
      const d = weaponDef(hd.id);
      if (!d) continue;
      const buyable = scrapAmt() >= hd.price;
      const left = Math.max(0, ec.hotDealDuration - (Date.now() - (hd._start || openAt)) / 1000);
      const row = NH.dom.div([
        iconSpan(d),
        NH.dom.div([
          NH.dom.el('div', { class: 'nh-card-title', text: wName(hd.id) }),
          NH.dom.el('div', { class: 'nh-discount', text: fmt(NH.t('shop.discount'), Math.round(hd.discount * 100)) + ' — ' + NH.t('shop.buy') }),
          NH.dom.el('div', { class: 'nh-deal-price' + (buyable ? '' : ' nh-low'), text: '-' + hd.price + ' Scrap' }),
          NH.dom.el('div', { class: 'nh-deal-timer', dataset: { id: hd.id }, text: Math.ceil(left) + 's' }),
        ], 'nh-deal-info'),
        NH.dom.button(NH.t('shop.buy'), 'nh-btn nh-card-buy' + (buyable ? '' : ' nh-dim'), function () { NH.shop.buyWeapon(hd.id, hd.price); }),
      ], 'nh-deal-row' + (buyable ? ' nh-buyable' : ' nh-locked'));
      box.appendChild(row);
      armDealTimer(hd.id);
    }
  }
  function armDealTimer(id) {
    if (!dealTimers || dealTimers[id]) return;
    const o = NH.shop.offers;
    const hd = o.hotDeals.find((x) => x.id === id);
    const start = (hd && hd._start) || openAt;
    const ms = Math.max(50, (ec.hotDealDuration - (Date.now() - start) / 1000) * 1000);
    dealTimers[id] = setTimeout(function () {
      delete dealTimers[id];
      const i = o.hotDeals.findIndex((x) => x.id === id);
      if (i >= 0) o.hotDeals.splice(i, 1);
      toast(wName(id) + ' — ' + NH.t('shop.off'), '#9db4c8');
      if (container) { renderDeals(); updateFoot(); }
    }, ms);
  }
  function clearDealTimers() {
    if (!dealTimers) return;
    for (const k in dealTimers) { clearTimeout(dealTimers[k]); delete dealTimers[k]; }
  }

  /* ---------- Verkaufs-Liste (Arsenal, Blaster ausgenommen) ---------- */
  function renderSell() {
    const box = container ? container.querySelector('.nh-shop-sell') : null;
    if (!box) return;
    NH.dom.clear(box);
    box.appendChild(NH.dom.div(NH.t('shop.sellHint'), 'nh-shop-sechead'));
    const r = run();
    const list = r ? r.weapons.filter((w) => w.id !== 'blaster') : [];
    if (!list.length) {
      box.appendChild(NH.dom.div('—', 'nh-shop-none'));
      return;
    }
    for (const w of list) {
      const d = weaponDef(w.id);
      if (!d) continue;
      const val = sellValue(w.id, w.level);
      box.appendChild(NH.dom.div([
        NH.dom.el('span', { class: 'nh-sell-name', text: wName(w.id) + ' · ' + fmt(NH.t('shop.upgradeTo'), w.level) }),
        NH.dom.el('span', { class: 'nh-sell-val', text: '+' + val + ' Scrap' }),
        NH.dom.button(NH.t('shop.sell'), 'nh-btn nh-card-buy nh-dim', function () { NH.shop.sellWeapon(w.id); }),
      ], 'nh-sell-row'));
    }
  }

  /* ---------- Fuß: Bonus, QuickStart-Hint, Timer, Reroll, Start ---------- */
  function renderFoot() {
    const box = container ? container.querySelector('.nh-shop-foot') : null;
    if (!box) return;
    NH.dom.clear(box);
    const r = run();
    const nextWave = r ? r.wave : 1;
    const bonus = (NH.waves && typeof NH.waves.waveBonus === 'function') ? NH.waves.waveBonus(nextWave, false) : 0;
    const canQuickWave = nextWave >= wv.quickStartMinWave;
    const o = NH.shop.offers;
    const affordReroll = scrapAmt() >= o.rerollCost && o.rerollsLeft > 0;

    box.appendChild(NH.dom.div([
      NH.dom.el('span', { class: 'nh-wave-bonus', text: NH.t('shop.waveBonus') + ' +' + bonus + ' ' + NH.t('hud.scrap') }),
      canQuickWave ? NH.dom.el('span', { class: 'nh-quick-hint', text: NH.t('shop.quickStartHint') }) : null,
    ], 'nh-foot-info'));

    const timer = NH.dom.div([NH.dom.el('span', { class: 'nh-timer-val' })], 'nh-shop-timer nh-shop-timer-val');
    box.appendChild(timer);

    const rBtn = NH.dom.button(fmt(NH.t('shop.reroll'), o.rerollCost), 'nh-btn nh-btn-reroll' + (affordReroll ? '' : ' nh-dim'), function () { NH.shop.reroll(); });
    box.appendChild(NH.dom.div([
      rBtn,
      NH.dom.el('span', { class: 'nh-rerolls-left', text: fmt(NH.t('shop.rerollsLeft'), o.rerollsLeft) }),
    ], 'nh-reroll-wrap'));

    const sBtn = NH.dom.button(NH.t('shop.startWave'), 'nh-btn nh-btn-start', function () { NH.shop.startNextWave(); });
    box.appendChild(NH.dom.div([sBtn, NH.dom.el('span', { class: 'nh-early', text: NH.t('shop.early') })], 'nh-start-wrap'));
  }
  function updateFoot() {
    const box = container ? container.querySelector('.nh-shop-foot') : null;
    if (!box) return;
    const o = NH.shop.offers;
    const scrapline = container.querySelector('.nh-shop-scrap');
    if (scrapline) scrapline.textContent = NH.t('hud.scrap') + ': ' + NH.u.fmt(scrapAmt());
    const rBtn = box.querySelector('.nh-btn-reroll');
    if (rBtn) rBtn.classList.toggle('nh-dim', !(scrapAmt() >= o.rerollCost && o.rerollsLeft > 0));
    const left = box.querySelector('.nh-rerolls-left');
    if (left) left.textContent = fmt(NH.t('shop.rerollsLeft'), o.rerollsLeft);
    const sBtn = box.querySelector('.nh-btn-start');
    if (sBtn) sBtn.classList.toggle('nh-quick', canQuick());
    renderCards(); // Scrap-Affordance auf den Karten aktualisieren
  }

  /* ---------- 1-s-Tick: Countdown, Deal-Timer, Quick-Highlight ---------- */
  function tick() {
    if (!container) return;
    const remain = Math.max(0, wv.shopDuration - (Date.now() - openAt) / 1000);
    const tv = container.querySelector('.nh-shop-timer-val');
    if (tv) {
      tv.textContent = NH.u.fmtClock(remain);
      tv.classList.toggle('nh-timer-warn', remain <= 5);
    }
    const o = NH.shop.offers;
    for (const hd of o.hotDeals) armDealTimer(hd.id);
    const sBtn = container.querySelector('.nh-btn-start');
    if (sBtn) sBtn.classList.toggle('nh-quick', canQuick());
    for (const row of NH.dom.$all('.nh-deal-timer')) {
      const id = row.dataset ? row.dataset.id : null;
      const hd = id && o.hotDeals.find((x) => x.id === id);
      if (hd) {
        const left = Math.max(0, ec.hotDealDuration - (Date.now() - (hd._start || openAt)) / 1000);
        row.textContent = Math.ceil(left) + 's';
      }
    }
  }

  /* ---------- Kauf-Animation / Feedback (GEKAUFT-Flash + Partikel) ---------- */
  function grab(card) {
    if (!card) return;
    const b = NH.dom.div(null, 'nh-burst');
    // Richtung steckt in der Klasse (nh-dir-0..11), nicht im style-Attribut.
    for (let i = 0; i < 12; i++) {
      const p = NH.dom.el('span', { class: 'nh-part nh-dir-' + i });
      b.appendChild(p);
    }
    card.appendChild(b);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 700);
  }
  function boughtFlash(card) {
    if (!card) return;
    grab(card);
    const f = NH.dom.div(NH.t('shop.bought'), 'nh-bought-flash');
    card.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 900);
  }
  function findCardFor(id, isUpgrade) {
    const list = NH.dom.$all('.nh-card' + (isUpgrade ? '.nh-card-upgrade' : '.nh-card-weapon'));
    for (const c of list) {
      const t = c.querySelector('.nh-card-title');
      if (t && (isUpgrade ? t.textContent === uName(id) : t.textContent === wName(id))) return c;
    }
    return null;
  }
  function findWupCard() {
    const list = NH.dom.$all('.nh-card-wup');
    return list.length ? list[0] : null;
  }
  function markBoughtCard(card) {
    if (!card) return;
    card.classList.add('nh-bought');
    const btn = card.querySelector('.nh-card-buy');
    const priceBox = card.querySelector('.nh-card-price');
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    if (!card.querySelector('.nh-bought-badge')) {
      (priceBox || card).appendChild(boughtBadge());
    }
    boughtFlash(card); // zuletzt: Flash auf der frischen Karte (renderCards lief vorher)
  }
  function markBought(id, isUpgrade) {
    markBoughtCard(findCardFor(id, isUpgrade));
  }

  /* ---------- Events ---------- */
  function onKey(d) {
    if (!container || !d || !d.code || !NH.shop.offers) return;
    const o = NH.shop.offers;
    switch (d.code) {
      case 'Digit1':
        if (o.weapon) NH.shop.buyWeapon(o.weapon.id, o.weapon.price);
        break;
      case 'Digit2':
        // Waffen-Upgrade ersetzt die erste Upgrade-Karte (Taste 2)
        if (o.weaponUpgrade) NH.shop.buyWeaponUpgrade();
        else if (o.upgrades[0]) NH.shop.buyUpgrade(o.upgrades[0].id);
        break;
      case 'Digit3':
        if (o.weaponUpgrade) { if (o.upgrades[0]) NH.shop.buyUpgrade(o.upgrades[0].id); }
        else if (o.upgrades[1]) NH.shop.buyUpgrade(o.upgrades[1].id);
        break;
      case 'Space':
      case 'Enter':
      case 'KeyE': // E: früh weiterspielen (nach Clear)
        NH.shop.startNextWave();
        break;
    }
  }
  function onLang() {
    // Sprachwechsel bei offenem Shop: Overlay mit neuer Sprache neu aufbauen
    // (Offers + Kauf-Status bleiben erhalten, Timer laufen weiter)
    if (!container) return;
    closeOverlay();
    buildOverlay();
  }

  /* ---------- Overlay ---------- */
  function buildOverlay() {
    const ui = NH.ui && typeof NH.ui.overlayOpen === 'function' ? NH.ui.overlayOpen(NH.t('shop.title')) : null;
    container = ui || fallbackOverlay();
    const o = NH.shop.offers;
    container.appendChild(NH.dom.div([
      NH.dom.div(NH.t('hud.scrap') + ': ' + NH.u.fmt(scrapAmt()), 'nh-shop-scrap'),
      NH.dom.div(null, 'nh-shop-cards'),
      NH.dom.div(NH.t('shop.hotDeals'), 'nh-shop-sechead'),
      NH.dom.div(null, 'nh-shop-deals'),
      NH.dom.div(null, 'nh-shop-sell'),
      NH.dom.div(null, 'nh-shop-foot'),
    ], 'nh-shop'));
    renderCards();
    renderDeals();
    renderSell();
    renderFoot();
  }
  function fallbackOverlay() {
    const o = NH.dom.div(NH.t('shop.title'), 'nh-shop-fallback');
    if (document.body) document.body.appendChild(o);
    return o;
  }
  function closeOverlay() {
    if (container) {
      if (container.parentNode) container.parentNode.removeChild(container);
      container = null;
    }
    try { if (NH.ui && typeof NH.ui.overlayClose === 'function') NH.ui.overlayClose(); } catch (e) {}
  }

  /* ---------- Öffentliche API (Vertrag api.js) ---------- */
  NH.shop = {
    offers: { weapon: null, upgrades: [], weaponUpgrade: null, hotDeals: [], rerollsLeft: ec.rerollMax, rerollCost: ec.rerollCost },

    open: function () {
      if (container) return; // schon offen
      if (!run()) return;    // kein Run -> kein Shop
      openAt = Date.now();
      regenOffers();
      dealTimers = {};
      buildOverlay();
      autoTimer = setTimeout(function () { if (container) NH.shop.startNextWave(); }, wv.shopDuration * 1000);
      tickTimer = setInterval(tick, 1000);
      tick();
    },

    close: function () {
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      clearDealTimers();
      dealTimers = null;
      closeOverlay();
      // Rerolls werden bei der nächsten open() frisch gesetzt (regenOffers)
    },

    reroll: function () {
      if (!container || !NH.shop.offers) return;
      const o = NH.shop.offers;
      if (o.rerollsLeft <= 0) { sfx('error'); toast(NH.t('shop.off'), '#9db4c8'); return; }
      if (!trySpend(o.rerollCost)) { sfx('error'); toast(NH.t('shop.notEnough'), '#ff6b6b'); return; }
      const rerollsLeft = o.rerollsLeft - 1;
      clearDealTimers();
      regenOffers(); // komplett neu: weapon + upgrades + hotDeals
      NH.shop.offers.rerollsLeft = rerollsLeft; // Reroll-Rest bewahren
      sfx('click');
      toast(NH.t('shop.rerolled'), '#35D2E8');
      metaChanged('reroll');
      if (container) { renderCards(); renderDeals(); renderSell(); updateFoot(); }
    },

    buyWeapon: function (id, price) {
      if (!container || !NH.shop.offers) return;
      if (id === 'blaster') return;   // Starter nicht kaufbar
      if (ownedLevel(id) > 0) return; // keine Duplikate im Arsenal
      const o = NH.shop.offers;
      if (o.weapon && o.weapon.id === id && bought.weapon) return; // Angebot verbraucht
      if (typeof price !== 'number') {
        if (o.weapon && o.weapon.id === id) price = o.weapon.price;
        else {
          const hd = o.hotDeals.find((x) => x.id === id);
          if (!hd) return;
          price = hd.price;
        }
      }
      if (!trySpend(price)) { sfx('error'); toast(NH.t('shop.notEnough'), '#ff6b6b'); return; }
      run().weapons.push({ id: id, level: 1 });
      // Angebot konsumieren
      if (o.weapon && o.weapon.id === id) bought.weapon = true;
      const hi = o.hotDeals.findIndex((x) => x.id === id);
      if (hi >= 0) {
        o.hotDeals.splice(hi, 1);
        if (dealTimers && dealTimers[id]) { clearTimeout(dealTimers[id]); delete dealTimers[id]; }
      }
      sfx('buy');
      toast('+' + wName(id) + ' ' + fmt(NH.t('shop.upgradeTo'), 1) + ' — ' + NH.t('shop.bought'), '#7CFC00');
      metaChanged('buyWeapon'); // HUD-Pips (ui hört auf 'nh:meta'), Ach-Check via meta auto
      if (container) { renderSell(); updateFoot(); }
      markBought(id, false);
    },

    buyUpgrade: function (id) {
      if (!container || !NH.shop.offers) return;
      const o = NH.shop.offers;
      const u = o.upgrades.find((x) => x.id === id);
      if (!u || bought.upgrades[id]) return;
      const d = upgradeDef(id);
      if (!d || buffLevel(id) >= d.max) return;
      if (!trySpend(u.cost)) { sfx('error'); toast(NH.t('shop.notEnough'), '#ff6b6b'); return; }
      run().buffs[id] = (run().buffs[id] || 0) + 1;
      bought.upgrades[id] = true;
      sfx('buy');
      toast(uName(id) + ' → ' + fmt(NH.t('shop.upgradeTo'), u.level + 1) + ' — ' + NH.t('shop.bought'), '#7CFC00');
      metaChanged('buyUpgrade'); // game rekalkuliert Player-Statistik live
      if (container) updateFoot();
      markBought(id, true);
    },

    buyWeaponUpgrade: function () {
      if (!container || !NH.shop.offers) return;
      const o = NH.shop.offers;
      const offer = o.weaponUpgrade;
      if (!offer || bought.weaponUp) return;
      const d = weaponDef(offer.weaponId);
      const r = run();
      if (!r || !d) return;
      const cur = r.weapons.find(function (w) { return w.id === offer.weaponId; });
      if (!cur || cur.level >= d.maxLevel) return;
      const cost = d.upgradeBase * cur.level; // Formel SSOT: upgradeBase * level (n->n+1)
      if (cost !== offer.cost) offer.cost = cost; // Run-Daten geändert (z.B. nach Verkauf)
      if (!trySpend(offer.cost)) { sfx('error'); toast(NH.t('shop.notEnough'), '#ff6b6b'); return; }
      cur.level += 1; // w.level++ + 'nh:meta' (HUD/Statistik hören auf nh:meta)
      bought.weaponUp = true;
      sfx('buy');
      toast(wName(offer.weaponId) + ' → ' + fmt(NH.t('shop.upgradeTo'), cur.level) + ' — ' + NH.t('shop.bought'), '#7CFC00');
      metaChanged('buyWeaponUpgrade'); // Ach-Check weaponMax + HUD-Pips
      if (container) { renderSell(); updateFoot(); }
      markBoughtCard(findWupCard());
    },

    sellWeapon: function (id) {
      if (!container) return;
      if (id === 'blaster') { sfx('error'); return; } // Starter nicht verkaufbar
      const r = run();
      if (!r) return;
      const i = r.weapons.findIndex((w) => w.id === id);
      if (i < 0) return;
      const lvl = r.weapons[i].level;
      const val = sellValue(id, lvl);
      r.weapons.splice(i, 1);
      // Verkauftes Waffen-Upgrade-Angebot entfernen (Karte sonst tot)
      if (NH.shop.offers && NH.shop.offers.weaponUpgrade && NH.shop.offers.weaponUpgrade.weaponId === id) {
        NH.shop.offers.weaponUpgrade = null;
      }
      if (NH.game && typeof NH.game.addScrap === 'function') NH.game.addScrap(val, 'sell');
      sfx('sell');
      toast(fmt(NH.t('shop.soldFor'), val), '#FFD700');
      metaChanged('sellWeapon');
      if (container) { renderSell(); updateFoot(); }
    },

    startNextWave: function () {
      if (!container) return;
      const quick = canQuick();
      NH.shop.close();
      try {
        if (NH.game && typeof NH.game.startNextWave === 'function') NH.game.startNextWave(quick);
      } catch (e) { console.error('[NH:shop] startNextWave', e); }
    },
  };

  /* Partikelrichtungen: 12 feste Klassen statt --dx/--dy im style-Attribut. */
  NH.css.add('.nh-part.nh-dir-0{--dx:34.0px;--dy:0.0px;}.nh-part.nh-dir-1{--dx:29.4px;--dy:17.0px;}.nh-part.nh-dir-2{--dx:17.0px;--dy:29.4px;}.nh-part.nh-dir-3{--dx:0.0px;--dy:34.0px;}.nh-part.nh-dir-4{--dx:-17.0px;--dy:29.4px;}.nh-part.nh-dir-5{--dx:-29.4px;--dy:17.0px;}.nh-part.nh-dir-6{--dx:-34.0px;--dy:0.0px;}.nh-part.nh-dir-7{--dx:-29.4px;--dy:-17.0px;}.nh-part.nh-dir-8{--dx:-17.0px;--dy:-29.4px;}.nh-part.nh-dir-9{--dx:-0.0px;--dy:-34.0px;}.nh-part.nh-dir-10{--dx:17.0px;--dy:-29.4px;}.nh-part.nh-dir-11{--dx:29.4px;--dy:-17.0px;}');

  /* ---------- Eigenes CSS (Basis-Layout liefert ui.js) ---------- */
  NH.css.add(
    '.nh-shop{width:min(1120px,96vw);max-height:100%;display:flex;flex-direction:column;gap:10px;padding:14px;overflow:auto;color:#cfe3f5;font-family:monospace;}' +
    '.nh-shop-scrap{font-size:18px;color:#7CFC00;letter-spacing:1px;text-align:right;}' +
    '.nh-shop-cards{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px;align-items:stretch;}' +
    '.nh-shop-deals{display:flex;flex-direction:column;gap:6px;}' +
    '.nh-shop-sell{display:flex;flex-direction:column;gap:6px;}' +
    '.nh-shop-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:8px;border-top:1px solid rgba(53,210,232,.25);}' +
    '.nh-shop-sechead{font-size:13px;letter-spacing:2px;color:#35D2E8;text-transform:uppercase;margin-top:6px;}' +
    '.nh-shop-none{color:#5b6b80;font-size:14px;padding:6px 0;}' +
    /* Karten */
    '.nh-card{position:relative;border:1px solid rgba(53,210,232,.28);border-radius:12px;background:rgba(13,20,30,.92);padding:12px;display:flex;flex-direction:column;gap:8px;}' +
    '.nh-card-empty{justify-content:center;align-items:center;color:#5b6b80;font-size:15px;min-height:120px;}' +
    '.nh-card-head{display:flex;gap:10px;align-items:center;}' +
    '.nh-icon{width:64px;height:64px;border-radius:8px;flex:0 0 auto;}' +
    '.nh-card-title{font-size:19px;font-weight:800;color:#e8f4ff;letter-spacing:1px;}' +
    '.nh-card-sub{font-size:12px;color:#9db4c8;letter-spacing:1px;}' +
    '.nh-card-eff{font-size:13px;line-height:1.55;color:#9db4c8;flex:1;}' +
    '.nh-card-price{display:flex;align-items:center;justify-content:space-between;margin-top:auto;}' +
    '.nh-price{font-size:17px;font-weight:800;color:#35D2E8;}' +
    '.nh-price.nh-low{color:#ff6b6b;}' + // zu wenig Scrap: roter Preis
    '.nh-card.nh-buyable{border-color:rgba(53,210,232,.75);box-shadow:0 0 16px rgba(53,210,232,.22);}' +
    '.nh-card.nh-locked{opacity:.68;}' +
    '.nh-card.nh-bought{border-color:rgba(124,252,0,.6);box-shadow:0 0 18px rgba(124,252,0,.25);}' +
    '.nh-bought-badge{position:absolute;top:8px;right:10px;font-size:12px;font-weight:800;color:#7CFC00;letter-spacing:1px;text-shadow:0 0 8px rgba(124,252,0,.6);}' +
    '.nh-dim{opacity:.45;}' +
    /* Kauf-Animation: GEKAUFT-Flash + Partikel */
    '.nh-bought-flash{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(124,252,0,.16);border-radius:12px;font-size:22px;font-weight:800;color:#7CFC00;letter-spacing:3px;text-shadow:0 0 14px rgba(124,252,0,.8);animation:nh-flash .85s ease-out forwards;pointer-events:none;z-index:6;}' +
    '@keyframes nh-flash{0%{opacity:0;transform:scale(.92)}15%{opacity:1;transform:scale(1.02)}100%{opacity:0;transform:scale(1.06)}}' +
    '.nh-burst{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:5;}' +
    '.nh-part{position:absolute;left:50%;top:55%;width:5px;height:5px;border-radius:50%;background:#7CFC00;animation:nh-part .55s ease-out forwards;}' +
    '@keyframes nh-part{0%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(calc(-50% + var(--dx,0px)),calc(-50% + var(--dy,0px))) scale(.15);opacity:0}}' +
    /* Hot Deals */
    '.nh-deal-row{display:flex;align-items:center;gap:10px;border:1px solid rgba(232,164,92,.4);border-radius:10px;background:rgba(30,22,12,.85);padding:8px 10px;}' +
    '.nh-deal-row .nh-icon{width:42px;height:42px;}' +
    '.nh-deal-info{flex:1;line-height:1.4;}' +
    '.nh-deal-timer{font-size:13px;color:#E8A45C;}' +
    '.nh-discount{font-size:13px;color:#E8A45C;}' +
    '.nh-deal-price{font-size:14px;color:#35D2E8;}' +
    /* Verkauf */
    '.nh-sell-row{display:flex;align-items:center;gap:10px;padding:5px 8px;border-bottom:1px dashed rgba(53,210,232,.18);}' +
    '.nh-sell-name{flex:1;font-size:14px;}' +
    '.nh-sell-val{color:#FFD700;font-size:14px;}' +
    /* Fuß */
    '.nh-foot-info{display:flex;flex-direction:column;gap:2px;font-size:14px;}' +
    '.nh-wave-bonus{color:#7CFC00;}' +
    '.nh-quick-hint{color:#E8A45C;font-size:12px;animation:nh-blinkS 1s ease-in-out infinite;}' +
    '@keyframes nh-blinkS{0%,100%{opacity:.55}50%{opacity:1}}' +
    '.nh-shop-timer{font-size:15px;color:#9db4c8;}' +
    '.nh-shop-timer.nh-timer-warn{color:#ff6b6b;}' +
    '.nh-reroll-wrap{display:flex;align-items:center;gap:8px;}' +
    '.nh-rerolls-left{font-size:12px;color:#9db4c8;}' +
    '.nh-start-wrap{display:flex;align-items:center;gap:10px;}' +
    '.nh-early{font-size:12px;color:#9db4c8;}' +
    '.nh-btn{background:rgba(53,210,232,.14);border:1px solid rgba(53,210,232,.55);color:#35D2E8;border-radius:8px;padding:7px 14px;font-family:monospace;font-size:14px;letter-spacing:1px;cursor:pointer;}' +
    '.nh-btn:hover{background:rgba(53,210,232,.24);}' +
    '.nh-btn-start{font-size:16px;font-weight:800;padding:10px 20px;}' +
    '.nh-btn-start.nh-quick{color:#7CFC00;border-color:rgba(124,252,0,.75);box-shadow:0 0 16px rgba(124,252,0,.45);animation:nh-quickPulse 1s ease-in-out infinite;}' +
    '@keyframes nh-quickPulse{0%,100%{box-shadow:0 0 8px rgba(124,252,0,.2)}50%{box-shadow:0 0 20px rgba(124,252,0,.55)}}' +
    /* Mobile: vertikal stapeln, scrollbar */
    '@media (max-width:820px){' +
    '.nh-shop{width:100vw;padding:12px;gap:10px;}' +
    '.nh-shop-cards{grid-template-columns:1fr;}' +
    '.nh-shop-foot{flex-direction:column;align-items:stretch;}' +
    '.nh-start-wrap{justify-content:space-between;}' +
    '.nh-shop-deals,.nh-shop-sell{width:100%;}' +
    '}'
  );

  /* Lose Kopplung: Tasten nur bei offenem Shop, Sprachwechsel rendert neu */
  NH.events.on('nh:key', onKey);
  NH.events.on('nh:lang', onLang);
  NH.events.on('lang', onLang); // loader.lang.set emittiert 'lang'
})();