// Prueft alle internen Links und Anker ueber die gebaute Seite.
// Aufruf: node tools/check-links.mjs <siteDir> <baseUrl>
// Exit 1, wenn ein Ziel fehlt oder ein Anker nicht existiert.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const base = process.argv[3] || 'http://127.0.0.1:9500';

const pages = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
const cache = new Map();

async function status(url) {
  if (cache.has(url)) return cache.get(url);
  let code = 0;
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' });
    code = res.status;
  } catch (e) { code = -1; }
  cache.set(url, code);
  return code;
}

function anchorsOf(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]);
  for (const m of html.matchAll(/\bname="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

async function offers(url) {
  // GitHub Pages liefert bei /ordner ein 301 auf /ordner/; lokal nicht.
  const res = await fetch(url, { method: 'GET', redirect: 'manual' });
  return res.status;
}

const problems = [];
let checked = 0;

for (const page of pages) {
  if (page.startsWith('google')) continue;
  const html = readFileSync(join(dir, page), 'utf8');
  const refs = [];
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    // Bausteine aus JS-Strings (' + p.href + ') sind keine Links.
    if (/['`]\s*\+|\$\{/.test(m[1])) continue;
    refs.push(m[1]);
  }

  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(ref)) continue;
    if (ref.startsWith('#')) continue;
    const [pathPart, hash] = ref.split('#');
    const clean = pathPart.split('?')[0];
    if (!clean) continue;

    checked++;
    const url = new URL(clean, base + '/' + page).href;
    const code = await status(url);
    if (code !== 200) {
      problems.push({ page, ref, code, kind: 'ziel' });
      continue;
    }
    if (hash) {
      let target = clean;
      if (!/\.html?$/i.test(clean)) target = clean.endsWith('/') ? clean + 'index.html' : clean + '/index.html';
      const file = target.replace(/^\//, '').split('/').pop();
      const local = join(dir, target.replace(/^\//, '').split('/').slice(0, -1).join('/'), file);
      if (existsSync(local)) {
        const ids = anchorsOf(readFileSync(local, 'utf8'));
        if (!ids.has(hash)) problems.push({ page, ref, code: 200, kind: 'anker' });
      }
    }
  }
}

const seen = new Set();
const unique = problems.filter((p) => {
  const k = p.page + '|' + p.ref;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

for (const p of unique) console.log(`${p.page.padEnd(34)} ${p.kind.padEnd(6)} ${String(p.code).padEnd(4)} ${p.ref}`);
console.log(`\nSeiten: ${pages.length} · geprüfte interne Ziele: ${checked} · Probleme: ${unique.length}`);
process.exit(unique.length ? 1 : 0);
