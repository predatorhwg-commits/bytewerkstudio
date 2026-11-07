// Release-Sweep: jede Seite in jeder Breite, ein Browser nach dem anderen,
// Neustart wenn eine parallele Sitzung ihn abschiesst.
//
//   node tools/sweep-release.mjs <base> <root> <outJson>
//
// Prueft je Seite und Breite: horizontaler Ueberlauf, genau eine h1 und eine
// main-Landmarke, doppelte IDs, Bilder ohne alt, unbeschriftete Bedienelemente,
// Meta-Beschreibung, CSP vorhanden, Sprache. Seiten mit <meta refresh>
// (Weiterleitungen) werden uebersprungen — sonst wird die Zielseite unter
// fremdem Namen gemessen.
import { spawn } from 'node:child_process';
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:9500';
const ROOT = process.argv[3] || '.';
const OUT = process.argv[4] || '/tmp/sweep.json';
const CHROME = process.env.BW_CHROME || process.env.HOME + '/.local/bw-audit/run/bw-browser';
const WIDTHS = [1440, 1024, 768, 390];

/* Seiten mit <meta http-equiv="refresh"> springen sofort weiter
   (abo.html → entwickler.html#abo). Gemessen wuerde sonst die Zielseite
   unter dem Namen der Weiterleitung — ein falsches Zeugnis. */
const pages = readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && !f.startsWith('google'))
  .filter((f) => {
    try {
      const html = readFileSync(join(ROOT, f), 'utf8');
      if (/<meta[^>]+http-equiv=["']refresh["']/i.test(html)) {
        console.log(`Weiterleitung uebersprungen: ${f}`);
        return false;
      }
    } catch { /* nicht lesbar: spaeter als Fehler sichtbar */ }
    return true;
  })
  .sort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `(() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const ids = q('[id]').map((e) => e.id);
  const names = q('a,button,input,select,textarea').filter((e) => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('title') && !e.getAttribute('alt');
  }).length;
  return {
    lang: document.documentElement.lang,
    h1: q('h1').length,
    main: q('main').length,
    desc: (document.querySelector('meta[name="description"]') || {}).content || '',
    csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
    noAlt: q('img:not([alt])').length,
    nameless: names,
    dup: [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))],
    scrollW: document.documentElement.scrollWidth,
    vw: document.documentElement.clientWidth,
    canvas: q('canvas').length,
    links: q('a[href]').length
  };
})()`;

function launch() {
  const port = 9600 + Math.floor(Math.random() * 300);
  const child = spawn(CHROME, [
    '--headless', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/bw-sweep-${port}-${Date.now()}`,
    '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });
  return { child, port };
}

async function connect(port, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(120);
  }
  throw new Error('no devtools endpoint');
}

async function session() {
  const { child, port } = launch();
  const url = await connect(port);
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  let errors = [];
  let alive = true;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 240));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)).slice(0, 240));
    }
  };
  const failAll = () => {
    for (const [, p] of pending) p.reject(new Error('socket closed'));
    pending.clear();
  };
  ws.onclose = () => { alive = false; failAll(); };
  ws.onerror = () => { alive = false; failAll(); };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (!alive) return reject(new Error('socket closed'));
    const mid = ++id;
    const timer = setTimeout(() => {
      if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout ' + method)); }
    }, 15000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); }
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  return {
    send,
    isAlive: () => alive,
    takeErrors: () => { const e = errors; errors = []; return e; },
    close: () => { try { ws.close(); } catch {} try { child.kill('SIGKILL'); } catch {} }
  };
}

const results = [];
let s = null;

for (const page of pages) {
  const rec = { page, widths: {}, errors: [] };
  for (const w of WIDTHS) {
    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      try {
        if (!s || !s.isAlive()) { if (s) s.close(); s = await session(); }
        await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 });
        /* Die Ueberlagerung wirkt nicht sofort. Wird direkt danach navigiert,
           kann das neue Dokument noch mit der alten Fensterbreite gemessen
           werden — gemessen: 1440 statt 390, daraus wurde ein scheinbarer
           Ueberlauf von 1050 px auf shop.html. Erst warten, bis die Breite
           wirklich steht. */
        for (let i = 0; i < 25; i++) {
          const dim = await s.send('Runtime.evaluate', { expression: 'window.innerWidth', returnByValue: true });
          if (dim.result?.value === w) break;
          await sleep(100);
        }
        await s.send('Page.navigate', { url: `${BASE}/${page}` });
        await sleep(1100);
        const r = await s.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
        const v = r.result?.value || {};
        /* Zweite Kontrolle am Messpunkt: misst die Seite breiter als
           vorgegeben, ist der Wert unbrauchbar — neu messen statt melden. */
        if (v.vw !== w) throw new Error(`Viewport ${v.vw ?? '?'} statt ${w}`);
        rec.widths[w] = {
          overflow: (v.scrollW || w) - w,
          h1: v.h1, main: v.main, dup: v.dup, noAlt: v.noAlt,
          nameless: v.nameless, desc: (v.desc || '').length,
          csp: v.csp, canvas: v.canvas, links: v.links, lang: v.lang
        };
        break;
      } catch (e) {
        rec.errors.push(`${w}:${attempt}:${String(e.message).slice(0, 80)}`);
        if (s) s.close();
        s = null;
        await sleep(400);
      }
    }
  }
  results.push(rec);
  process.stderr.write(`${page} ${rec.errors.length ? 'RETRY' : 'ok'}\n`);
}

if (s) s.close();
writeFileSync(OUT, JSON.stringify(results, null, 2));

const overflowing = results.flatMap((r) => Object.entries(r.widths)
  .filter(([, v]) => v.overflow > 1).map(([w, v]) => `${r.page}@${w}:${v.overflow}`));
const missing = results.filter((r) => Object.keys(r.widths).length < WIDTHS.length)
  .map((r) => [r.page, Object.keys(r.widths).length]);
const noDesc = results.filter((r) => r.widths[1440] && r.widths[1440].desc < 50).map((r) => r.page);
const noCsp = results.filter((r) => r.widths[1440] && !r.widths[1440].csp).map((r) => r.page);
const badH1 = results.filter((r) => r.widths[1440] && r.widths[1440].h1 !== 1)
  .map((r) => [r.page, r.widths[1440].h1]);
const dupIds = results.filter((r) => r.widths[1440] && r.widths[1440].dup.length)
  .map((r) => [r.page, r.widths[1440].dup]);
const badAlt = results.filter((r) => r.widths[1440] && r.widths[1440].noAlt).map((r) => r.page);
const nameless = results.filter((r) => r.widths[1440] && r.widths[1440].nameless).map((r) => [r.page, r.widths[1440].nameless]);
const retried = results.filter((r) => r.errors.length).map((r) => [r.page, r.errors.length]);

console.log(JSON.stringify({
  pages: results.length, overflowing, missing, noDesc, noCsp, badH1, dupIds, badAlt, nameless, retried
}, null, 2));
