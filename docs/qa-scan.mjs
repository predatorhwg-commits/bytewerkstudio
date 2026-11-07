/* Bytewerk — statischer Prüflauf.
   Aufruf: node docs/qa-scan.mjs            (im Repo-Wurzelverzeichnis)
   Prüft: doppelte IDs, interne Links und Anker, Assets, h1, Titel,
   Beschreibung, CSP, Alt-Texte, target=_blank ohne rel, Inline-Handler. */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pages = readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('google'));
const read = f => readFileSync(join(root, f), 'utf8');

const ids = new Map();
const anchors = new Map();
const html = new Map();
for (const p of pages) {
  const s = read(p);
  html.set(p, s);
  const set = new Set();
  for (const m of s.matchAll(/\bid="([^"]+)"/g)) set.add(m[1]);
  ids.set(p, set);
  anchors.set(p, new Set([...s.matchAll(/<a[^>]+name="([^"]+)"/g)].map(m => m[1])));
}

const problems = [];
const add = (kind, page, detail) => problems.push({ kind, page, detail });

for (const p of pages) {
  const s = html.get(p);
  const seen = new Set(), dup = [];
  for (const m of s.matchAll(/\bid="([^"]+)"/g)) {
    if (seen.has(m[1])) dup.push(m[1]);
    seen.add(m[1]);
  }
  if (dup.length) add('dup-id', p, dup.join(', '));

  const h1 = (s.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) add('h1-count', p, String(h1));
  if (!/<title>[^<]{5,}<\/title>/.test(s)) add('title', p, 'fehlt');
  if (!/name="description"\s+content="[^"]{20,}"/.test(s)) add('description', p, 'fehlt oder zu kurz');
  if (!/Content-Security-Policy/.test(s)) add('csp', p, 'fehlt');
  if (!/<html lang="(de|en)"/.test(s)) add('lang', p, 'fehlt');

  for (const m of s.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) add('img-alt', p, m[0].slice(0, 80));
    if (!/\bwidth=/.test(m[0]) || !/\bheight=/.test(m[0])) add('img-size', p, m[0].slice(0, 80));
    if (!/\bloading=/.test(m[0]) && !/\bfetchpriority=/.test(m[0])) add('img-lazy', p, m[0].slice(0, 80));
  }
  for (const m of s.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) add('blank-rel', p, m[0].slice(0, 80));
  }
  for (const m of s.matchAll(/<[a-z]+\b[^>]*\bon[a-z]+="/g)) add('inline-handler', p, m[0].slice(0, 80));
  if (!/name="viewport"/.test(s)) add('viewport', p, 'fehlt');

  for (const m of s.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(#|mailto:|tel:|javascript:|data:|https?:)/.test(url)) {
      if (url.startsWith('#')) {
        const id = decodeURIComponent(url.slice(1));
        if (id && !ids.get(p).has(id) && !anchors.get(p).has(id)) add('anchor', p, url);
      }
      continue;
    }
    const [pathRaw, hash] = url.split('#');
    const path = decodeURIComponent(pathRaw.split('?')[0]);
    if (!path) continue;
    if (!existsSync(join(root, path))) { add('link', p, url); continue; }
    if (hash && path.endsWith('.html')) {
      const target = ids.get(path);
      if (target && !target.has(decodeURIComponent(hash))) add('anchor-other', p, url);
    }
  }
}

const byKind = {};
for (const p of problems) (byKind[p.kind] ||= []).push(p);

const list = Object.entries(byKind).sort((a, b) => b[1].length - a[1].length);
if (!list.length) console.log('Keine Befunde.');
for (const [kind, items] of list) {
  console.log(`\n## ${kind} (${items.length})`);
  for (const i of items.slice(0, 40)) console.log(`- ${i.page}: ${i.detail}`);
  if (items.length > 40) console.log(`- … ${items.length - 40} weitere`);
}
console.log(`\nSeiten: ${pages.length} · Befunde: ${problems.length}`);
const summary = Object.fromEntries(list.map(([k, v]) => [k, v.length]));
console.log(JSON.stringify(summary));
