// Angriffsprobe im Browser: fuehrt die klassischen Injektionen gegen die
// geladene Seite aus und prueft, ob der Browser sie blockiert.
//
// Warum nach dem Laden: CSP schuetzt nicht davor, dass Markup in den Baum
// gelangt — sie schuetzt davor, dass es ausgefuehrt oder geladen wird. Genau
// das wird hier gemessen: jede Technik bekommt eine eigene Sonde, die bei
// Erfolg `window.__pwned` setzt bzw. eine Markierung im DOM hinterlaesst.
//
//   node tools/csp-attack.mjs http://127.0.0.1:9500 [--all]
//
// Ohne --all werden fuenf repraesentative Seiten geprueft.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || 'http://127.0.0.1:9500').replace(/\/$/, '');
const all = process.argv.includes('--all');

const sample = ['index.html', 'community.html', 'shop.html', 'login.html', 'forum.html'];
const pages = all
  ? readFileSync(join(root, 'tools', 'a11y-pages.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : sample;

const CHROME = process.env.BW_CHROME
  || (existsSync(process.env.HOME + '/.local/bw-audit/run/bw-browser')
    ? process.env.HOME + '/.local/bw-audit/run/bw-browser'
    : 'google-chrome');
const PORT = 9800 + Math.floor(Math.random() * 150);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=/tmp/cdp-atk-' + PORT,
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
const violations = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    return;
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    violations.push(m.params.entry.text);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});

/* Die Probe laeuft im Dokument und liefert je Angriff ein Ergebnis.
   Erwartung: jeder Angriff wird blockiert. */
const probe = `(() => new Promise((resolve) => {
  // CSP-Verstoesse sind der verlaessliche Nachweis: ein blockierter Abruf
  // erzeugt einen Eintrag im Resource Timing mit transferSize 0 und
  // responseStatus 0 — er sieht dort aus wie ein Abruf, der stattgefunden
  // hat. Erst transferSize > 0 belegt echten Datenverkehr.
  const vio = [];
  document.addEventListener('securitypolicyviolation', function (e) {
    vio.push({ dir: e.effectiveDirective, uri: (e.blockedURI || '').slice(0, 60) });
  });
  const results = [];
  const blocked = (dir) => vio.some(function (v) { return v.dir === dir; });

  function record(name, verdict) { results.push([name, verdict]); }

  // 1. Inline-Skript
  const s1 = document.createElement('script');
  s1.textContent = 'window.__pwnedInline = true';
  document.body.appendChild(s1);

  // 2. Ereignis-Attribut
  const i2 = document.createElement('img');
  i2.setAttribute('src', '/media/gibt-es-nicht.png');
  i2.setAttribute('onerror', 'window.__pwnedHandler = true');
  document.body.appendChild(i2);

  // 3. Fremdes Skript
  const s3 = document.createElement('script');
  s3.src = 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js';
  document.body.appendChild(s3);

  // 4. Inline-Stil
  const d4 = document.createElement('div');
  d4.setAttribute('style', 'outline:7px solid rgb(255,0,0)');
  d4.id = 'atk-style';
  d4.textContent = 'x';
  document.body.appendChild(d4);

  // 5. Fremdes Stylesheet
  const l5 = document.createElement('link');
  l5.rel = 'stylesheet';
  l5.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
  document.head.appendChild(l5);

  // 6. iframe
  const f6 = document.createElement('iframe');
  f6.src = 'https://example.com/';
  document.body.appendChild(f6);

  // 7. Datenabfluss. Der Zustand des Abrufs ist das verlaessliche Signal:
  // ein blockierter Abruf wird abgelehnt, ein durchgelassener loest auf
  // (opaque Antwort). transferSize taugt hier nicht — fremde Herkuenfte
  // melden ohne Timing-Allow-Origin immer 0.
  window.__leak = 'offen';
  fetch('https://example.com/leak', { mode: 'no-cors' })
    .then(function () { window.__leak = 'raus'; })
    .catch(function () { window.__leak = 'abgelehnt'; });
  const beacon = document.createElement('img');
  beacon.src = 'https://www.google-analytics.com/collect?v=1&t=atk';
  document.body.appendChild(beacon);

  setTimeout(function () {
    record('Inline-Skript', window.__pwnedInline ? 'AUSGEFUEHRT' : 'blockiert');
    record('Ereignis-Attribut (img onerror)', window.__pwnedHandler ? 'AUSGEFUEHRT' : 'blockiert');
    record('Fremdes Skript', typeof window._ === 'function' ? 'GELADEN' : 'blockiert');
    record('Inline-Stil', blocked('style-src-attr') ? 'blockiert'
      : (getComputedStyle(d4).outlineStyle !== 'none' ? 'ANGEWENDET' : 'blockiert'));
    record('Fremdes Stylesheet', getComputedStyle(document.documentElement).getPropertyValue('--bs-blue').trim()
      ? 'GELADEN' : 'blockiert');
    // Ein blockierter Frame bleibt bei about:blank stehen (lesbar).
    // Ein geladener Frame ist fremde Herkunft — das Lesen wirft.
    var frameState;
    if (blocked('frame-src')) frameState = 'blockiert';
    else {
      try {
        var href = f6.contentWindow.location.href;
        frameState = href === 'about:blank' ? 'blockiert' : 'GELADEN';
      } catch (e) { frameState = 'GELADEN'; }
    }
    record('iframe', frameState);

    var leak;
    if (blocked('connect-src') && blocked('img-src')) leak = 'blockiert';
    else if (window.__leak === 'raus' || beacon.naturalWidth > 0) leak = 'RAUSGEGANGEN';
    else leak = 'blockiert';
    record('Datenabfluss (fetch/img)', leak);
    resolve(JSON.stringify({ results, violations: vio.length, directives: vio.map(function (v) { return v.dir; }) }));
  }, 1500);
}))()`;

const findings = [];
let checked = 0;
let attacksPerPage = 0;

for (const page of pages) {
  violations.length = 0;
  let data = null;
  // Drei Versuche: Seiten wie konto.html leiten ohne Anmeldung weiter und
  // bauen dabei den Ausfuehrungskontext neu auf — die erste Messung
  // landet dann im alten Dokument.
  for (let attempt = 1; attempt <= 3 && !data; attempt++) {
    try {
      await send('Page.navigate', { url: `${base}/${page}` });
      for (let i = 0; i < 60; i++) {
        const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
        if (r.result?.value === 'complete') break;
        await sleep(100);
      }
      await sleep(700);
      const res = await send('Runtime.evaluate', { expression: probe, awaitPromise: true, returnByValue: true });
      if (res.result?.value) data = JSON.parse(res.result.value);
    } catch { await sleep(600); }
  }
  if (!data) { findings.push([page, 'nicht messbar', '']); continue; }
  checked++;
  attacksPerPage = Math.max(attacksPerPage, data.results.length);
  for (const [name, verdict] of data.results) {
    if (!/blockiert|offen$/.test(verdict) || verdict === 'offen') {
      findings.push([page, name, verdict]);
    }
  }
}

console.log(`\nGeprueft: ${checked}/${pages.length} Seiten · ${attacksPerPage} Angriffe je Seite`);
if (!findings.length) {
  console.log('Alle Angriffe blockiert.');
} else {
  console.log(`Durchgelassen: ${findings.length}`);
  for (const [page, name, verdict] of findings) console.log(`  ${page.padEnd(28)} ${name.padEnd(34)} ${verdict}`);
}

ws.close();
chrome.kill('SIGKILL');
process.exit(findings.length ? 1 : 0);
