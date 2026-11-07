// Barrierefreiheits-Pruefung im echten Browser.
//
// Warum im Browser: Ob ein Link einen Namen hat, ob der Sprunglink ein Ziel
// trifft und ob Formularfelder beschriftet sind, laesst sich statisch nur
// unvollstaendig beantworten — Beschriftungen koennen aus aria-labelledby,
// umschliessenden <label> oder sichtbarem Text kommen.
//
//   node tools/a11y-audit.mjs http://127.0.0.1:9500 [--verbose]
//
// Browser: $BW_CHROME, sonst ~/.local/bw-audit/run/bw-browser, sonst
// google-chrome / chromium im PATH.
//
// Exit 0 = keine Befunde, 1 = mindestens ein Befund.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || 'http://127.0.0.1:9500').replace(/\/$/, '');
const verbose = process.argv.includes('--verbose');

const probe = readFileSync(join(root, 'tools', 'probe-a11y-audit.js'), 'utf8');
const pages = readFileSync(join(root, 'tools', 'a11y-pages.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

const CHROME = process.env.BW_CHROME
  || (existsSync(process.env.HOME + '/.local/bw-audit/run/bw-browser')
    ? process.env.HOME + '/.local/bw-audit/run/bw-browser'
    : 'google-chrome');
const PORT = 9600 + Math.floor(Math.random() * 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=/tmp/cdp-a11y-' + PORT,
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
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

async function ready() {
  for (let i = 0; i < 60; i++) {
    const res = await send('Runtime.evaluate', {
      expression: 'document.readyState', returnByValue: true,
    });
    if (res.result?.value === 'complete') return true;
    await sleep(100);
  }
  return false;
}

const findings = [];
const redirects = [];
let checked = 0;

/* Seiten, die per <meta http-equiv="refresh"> sofort weiterspringen
   (abo.html → entwickler.html#abo). Sie zu messen hiesse, die Zielseite
   zu messen und das Ergebnis der Weiterleitung zuzuschreiben. */
function redirectTarget(file) {
  try {
    const html = readFileSync(join(root, file), 'utf8');
    const m = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"';]+)/i);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

for (const page of pages) {
  const declared = redirectTarget(page);
  if (declared) { redirects.push([page, declared, 'Weiterleitung']); continue; }
  let data = null;
  let landed = '';
  // Drei Versuche: Seiten wie konto.html leiten ohne Anmeldung weiter
  // (nach login.html). Beim Dokumentwechsel wird der Ausfuehrungskontext
  // zerstoert — die erste Messung kommt dann leer zurueck.
  for (let attempt = 1; attempt <= 3 && !data; attempt++) {
    try {
      await send('Page.navigate', { url: `${base}/${page}` });
      await ready();
      // Der Pfad muss zweimal gleich lauten: konto.html springt ohne
      // Anmeldung nach login.html, und mitten im Dokumentwechsel kommt
      // keine Messung zustande. Ohne dieses Warten haengt das Ergebnis
      // davon ab, wer schneller ist — genau das war sporadisch rot.
      let vorher = '';
      for (let i = 0; i < 16; i++) {
        const r = await send('Runtime.evaluate', {
          expression: 'location.pathname', returnByValue: true,
        });
        landed = r.result?.value || '';
        if (landed && landed === vorher) break;
        vorher = landed;
        await sleep(250);
      }
      // Umgeleitet: die Seite ist absichtlich gesperrt (Anmeldung noetig).
      // Gemessen wird dann nicht diese Seite, sondern ihr Ziel — das waere
      // ein falsches Zeugnis. Also getrennt ausweisen und ueberspringen.
      if (landed && !landed.endsWith('/' + page)) break;
      const res = await send('Runtime.evaluate', {
        expression: probe, awaitPromise: true, returnByValue: true,
      });
      if (res.result?.value) data = JSON.parse(res.result.value);
    } catch { await sleep(400); }
  }

  if (!data) {
    if (landed && !landed.endsWith('/' + page)) {
      redirects.push([page, landed]);
      continue;
    }
    findings.push([page, 'nicht messbar', landed]);
    continue;
  }
  checked++;
  if (data.problems.length) {
    for (const [what, detail] of data.problems) findings.push([page, what, detail]);
  } else if (verbose) {
    console.log(`${page.padEnd(34)} ok · ${data.counts.links} Links, ${data.counts.buttons} Buttons, ${data.counts.fields} Felder`);
  }
}

console.log(`\nGeprueft: ${checked}/${pages.length} Seiten`);
for (const [page, target] of redirects) {
  console.log(`Weiterleitung: ${page} → ${target} (nicht bewertet, zeigt auf eine andere Seite)`);
}
if (!findings.length) {
  console.log('Befunde: 0');
} else {
  console.log(`Befunde: ${findings.length}`);
  for (const [page, what, detail] of findings.slice(0, 40)) {
    console.log(`  ${page.padEnd(32)} ${what.padEnd(42)} ${detail}`);
  }
  if (findings.length > 40) console.log(`  … ${findings.length - 40} weitere`);
}

ws.close();
chrome.kill('SIGKILL');
process.exit(findings.length ? 1 : 0);
