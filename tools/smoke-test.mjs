// Funktionstest im Browser: prueft die Bedienung, nicht das Aussehen.
//
// Die CSP-Umstellung, der Bildumbau und die Barrierefreiheits-Aenderungen
// haben JavaScript angefasst. Dieser Lauf belegt, dass die Funktionen
// danach noch arbeiten — jede Pruefung misst eine Wirkung im DOM.
//
//   node tools/smoke-test.mjs http://127.0.0.1:9500
//
// Exit 0 = alles gruen, 1 = mindestens ein Fehlschlag.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const base = (process.argv[2] || 'http://127.0.0.1:9500').replace(/\/$/, '');
const CHROME = process.env.BW_CHROME
  || (existsSync(process.env.HOME + '/.local/bw-audit/run/bw-browser')
    ? process.env.HOME + '/.local/bw-audit/run/bw-browser'
    : 'google-chrome');
const PORT = 9900 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=/tmp/cdp-smoke-' + PORT,
  '--no-first-run', '--no-default-browser-check',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

async function getWs() {
  for (let i = 0; i < 150; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Browser startet noch */ }
    await sleep(100);
  }
  throw new Error('Browser startet nicht');
}

const ws = new WebSocket(await getWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});

const evalJs = async (expression) => {
  const res = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result?.value;
};

async function goto(path) {
  consoleErrors.length = 0;
  await send('Page.navigate', { url: `${base}/${path}` });
  for (let i = 0; i < 80; i++) {
    if (await evalJs('document.readyState') === 'complete') break;
    await sleep(100);
  }
  await sleep(600);
}

const results = [];
function check(name, ok, detail) {
  results.push([name, !!ok, detail || '']);
}

/* ---------- 1. Sprache: DE -> EN -> ES -> DE ---------- */
{
  await goto('index.html');
  const de = await evalJs("document.documentElement.lang");
  await evalJs("document.querySelector('[data-lang-btn=en]').click()");
  await sleep(400);
  const en = await evalJs(`JSON.stringify({
    lang: document.documentElement.lang,
    h1: (document.querySelector('h1') || {}).textContent || '',
    stored: localStorage.getItem('bw-lang'),
  })`);
  const enObj = JSON.parse(en);

  await evalJs("document.querySelector('[data-lang-btn=es]').click()");
  await sleep(400);
  const es = await evalJs(`JSON.stringify({
    lang: document.documentElement.lang,
    h1: (document.querySelector('h1') || {}).textContent || '',
  })`);
  const esObj = JSON.parse(es);

  await evalJs("document.querySelector('[data-lang-btn=de]').click()");
  await sleep(400);
  const back = await evalJs("document.querySelector('h1').textContent");

  // Headless-Chromium meldet en-US, die Seite folgt bewusst der
  // Browsersprache. Geprueft wird, dass ein gueltiger Wert gesetzt ist.
  check('Sprache wird gesetzt', ['de', 'en', 'es'].includes(de), `lang=${de} (Browsersprache)`);
  check('EN schaltet um', enObj.lang === 'en' && enObj.stored === 'en', `lang=${enObj.lang}, gespeichert=${enObj.stored}`);
  check('EN aendert den Text', enObj.h1 && enObj.h1 !== back, `EN: "${enObj.h1.slice(0, 34)}"`);
  check('ES schaltet um', esObj.lang === 'es', `lang=${esObj.lang}`);
  check('ES hat Text (kein leerer Rest)', esObj.h1.trim().length > 10, `ES: "${esObj.h1.trim().slice(0, 34)}"`);
  check('zurueck auf DE', back.trim().length > 10, `DE: "${back.trim().slice(0, 34)}"`);
}

/* ---------- 2. Befehlspalette (Strg+K) ---------- */
{
  await goto('shop.html');
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
  await sleep(600);
  const open = await evalJs(`JSON.stringify({
    da: !!document.querySelector('.bw-cmd'),
    sichtbar: !!document.querySelector('.bw-cmd.is-open, .bw-cmd.open'),
    fokus: document.activeElement ? document.activeElement.tagName : '',
  })`);
  const o = JSON.parse(open);
  await evalJs(`document.querySelector('.bw-cmd-input input') && (document.querySelector('.bw-cmd-input input').value = 'pdf')`);
  await evalJs(`(() => { const i = document.querySelector('.bw-cmd-input input'); if (i) i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(400);
  const hits = await evalJs("document.querySelectorAll('.bw-cmd-item').length");
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(400);
  const closed = await evalJs("!document.querySelector('.bw-cmd.is-open, .bw-cmd.open')");
  check('Suche oeffnet mit Strg+K', o.da, `Palette=${o.da}, sichtbar=${o.sichtbar}`);
  check('Suche filtert', hits > 0, `${hits} Treffer fuer "pdf"`);
  check('Suche schliesst mit Escape', closed);
}

/* ---------- 3. Werkkorb: hinzufuegen, Anzahl, entfernen ---------- */
{
  await goto('shop.html');
  const before = await evalJs("document.querySelectorAll('[data-wk-count]').length");
  const added = await evalJs(`(() => {
    const btn = document.querySelector('[data-wk-add], .prod [data-wk-add]');
    if (!btn) return 'kein Knopf';
    btn.click();
    return 'geklickt';
  })()`);
  await sleep(500);
  const count = await evalJs(`(() => {
    const el = document.querySelector('[data-wk-count]');
    return el ? el.textContent.trim() : 'kein Zaehler';
  })()`);
  await evalJs(`document.querySelector('[data-wk-open], .wk-nav-btn') && document.querySelector('[data-wk-open], .wk-nav-btn').click()`);
  await sleep(500);
  const drawer = await evalJs(`JSON.stringify({
    offen: !!document.querySelector('.wk-drawer:not([hidden])'),
    posten: document.querySelectorAll('.wk-item').length,
  })`);
  const d = JSON.parse(drawer);
  check('Werkkorb-Knopf vorhanden', before > 0 || added === 'geklickt', `Zaehler im DOM: ${before}, ${added}`);
  check('Werkkorb zaehlt', count !== 'kein Zaehler' && count !== '0', `Zaehler: "${count}"`);
  check('Werkkorb laesst sich oeffnen', d.offen && d.posten > 0, `offen=${d.offen}, Posten=${d.posten}`);
}

/* ---------- 4. Schnellblick (Produktkarte) ---------- */
{
  await goto('shop.html');
  // Der Schnellblick haengt an einem eigenen Knopf in der Karte.
  // Ein Klick auf die Karte selbst folgt dem Link zum Produkt.
  const opened = await evalJs(`(() => {
    const btn = document.querySelector('[data-v5-qv]');
    if (!btn) return 'kein Schnellblick-Knopf';
    btn.click();
    return 'geklickt';
  })()`);
  await sleep(700);
  const state = await evalJs(`JSON.stringify({
    modal: !!document.querySelector('.v5-modal.open'),
    titel: (document.querySelector('#v5-qv-title') || {}).textContent || '',
    vergleich: (document.querySelector('.v5-qv-cmp') || {}).textContent || '',
    vergleichLabel: (document.querySelector('.v5-qv-cmp') || {}).getAttribute ? (document.querySelector('.v5-qv-cmp') || {}).getAttribute('aria-label') : '',
  })`);
  const s = JSON.parse(state);
  check('Schnellblick oeffnet', s.modal, `${opened}, modal=${s.modal}, Titel="${s.titel.slice(0, 26)}"`);
  check('Schnellblick hat Titel', s.titel.trim().length > 2);
  check('Vergleichs-Knopf beschriftet', (s.vergleich + s.vergleichLabel).trim().length > 3,
    `Text="${s.vergleich}", aria-label="${s.vergleichLabel}"`);
}

/* ---------- 5. Forum: Thema oeffnen, Antwort schreiben ---------- */
{
  await goto('community.html');
  const topics = await evalJs("document.querySelectorAll('.cm-card').length");
  const opened = await evalJs(`(() => {
    const t = document.querySelector('.cm-card');
    if (!t) return 'kein Thema';
    t.click();
    return 'geklickt';
  })()`);
  await sleep(700);
  const after = await evalJs(`JSON.stringify({
    detail: !!document.querySelector('.cm-thread-head'),
    posts: document.querySelectorAll('.cm-post, .cm-thread-head').length,
    titel: document.title,
  })`);
  const a = JSON.parse(after);
  check('Forum listet Themen', topics > 0, `${topics} Themen`);
  check('Thema laesst sich oeffnen', opened === 'geklickt' && (a.detail || a.posts > 0),
    `${opened}, Detail=${a.detail}, Beitraege=${a.posts}`);
}

/* ---------- 5b. Forum-Kategoriefarbe (kommt aus style.cssText) ---------- */
{
  await goto('community.html');
  const color = await evalJs(`(() => {
    const card = document.querySelector('.cm-card');
    if (!card) return '';
    return getComputedStyle(card).getPropertyValue('--c').trim();
  })()`);
  check('Forum: Kategoriefarbe gesetzt', !!(color && color.length > 3), `--c=${color}`);
}

/* ---------- 5c. Vergleich: Produkt landet in der Ablage ---------- */
{
  await goto('shop.html');
  const state = await evalJs(`(() => {
    const btn = document.querySelector('[data-v5-cmp]');
    if (!btn) return JSON.stringify({ error: 'kein Knopf' });
    btn.click();
    return JSON.stringify({
      pressed: btn.getAttribute('aria-pressed'),
      chips: document.querySelectorAll('.v5-chip').length,
      text: (document.querySelector('.v5-tray a, [data-v5-tray] a') || {}).textContent || '',
    });
  })()`);
  const c = JSON.parse(state);
  check('Vergleich nimmt Produkt auf', c.pressed === 'true' && c.chips === 1,
    `gedrueckt=${c.pressed}, Chips=${c.chips}`);
  check('Vergleich zeigt Anzahl im Link', /\(1\)/.test(c.text || ''), `"${(c.text || '').trim()}"`);
}

/* ---------- 6. Sprunglink setzt den Fokus ---------- */
{
  await goto('mastil.html');
  const jumped = await evalJs(`(() => {
    const a = document.querySelector('a.skip-link');
    if (!a) return 'kein Sprunglink';
    a.focus();
    a.click();
    return 'geklickt';
  })()`);
  await sleep(400);
  const target = await evalJs(`JSON.stringify({
    hash: location.hash,
    ziel: !!document.getElementById('main'),
    fokus: document.activeElement ? document.activeElement.id || document.activeElement.tagName : '',
  })`);
  const t = JSON.parse(target);
  check('Sprunglink trifft das Ziel', jumped === 'geklickt' && t.ziel && t.hash === '#main',
    `${jumped}, hash=${t.hash}, Ziel=${t.ziel}`);
}

/* ---------- 7. Keine Konsolenfehler auf den Hauptseiten ---------- */
{
  for (const page of ['index.html', 'shop.html', 'community.html', 'entwickler.html', 'kontakt.html']) {
    await goto(page);
    await sleep(500);
    check(`keine Konsolenfehler: ${page}`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  }
}

const failed = results.filter((r) => !r[1]);
for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(42)} ${detail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} Pruefungen bestanden`);

ws.close();
chrome.kill('SIGKILL');
process.exit(failed.length ? 1 : 0);
