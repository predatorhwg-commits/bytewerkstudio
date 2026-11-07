// Setzt loading="lazy" und decoding="async" nur an Bildern, die auf beiden
// getesteten Breiten deutlich unter dem ersten Bildschirm liegen. Die
// Positionen kommen aus probe-img-pos.js (Browser), damit nichts ueber dem
// Fold versehentlich verzoegert wird.
//
//   node tools/lazy-images.mjs <siteDir> <positions.jsonl> [--apply]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const posFile = process.argv[3];
const apply = process.argv.includes('--apply');
if (!posFile) {
  console.error('usage: node tools/lazy-images.mjs <siteDir> <positions.jsonl> [--apply]');
  process.exit(2);
}

const rows = readFileSync(posFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const byPage = new Map();
for (const r of rows) {
  if (!byPage.has(r.file)) byPage.set(r.file, {});
  byPage.get(r.file)[r.w] = r;
}

// Nur Bilder, die auf 1440 UND 390 mindestens 1.5 Bildschirme unterhalb
// der Oberkante beginnen. So bleibt der erste Bildschirm unberuehrt.
const MARGIN = 1.5;
const planned = new Map();

for (const [file, widths] of byPage) {
  const wide = widths[1440];
  const narrow = widths[390];
  if (!wide || !narrow || wide.list.length !== narrow.list.length) continue;
  const index = [];
  for (let i = 0; i < wide.list.length; i++) {
    const a = wide.list[i];
    const b = narrow.list[i];
    if (a.eager || b.eager) continue;
    if (a.top <= wide.vh * MARGIN) continue;
    if (b.top <= narrow.vh * MARGIN) continue;
    index.push(i);
  }
  if (index.length) planned.set(file, index);
}

let touched = 0;
let count = 0;
for (const [file, indexes] of planned) {
  const path = join(dir, file);
  let html = readFileSync(path, 'utf8');
  let n = 0;
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const i = n++;
    if (!indexes.includes(i)) return tag;
    if (/\bloading\s*=/.test(tag)) return tag;
    let next = tag;
    if (!/\bdecoding\s*=/.test(next)) next = next.replace(/\s*\/?>$/, ' decoding="async">');
    next = next.replace(/\s*\/?>$/, ' loading="lazy">');
    return next;
  });
  if (apply) writeFileSync(path, html, 'utf8');
  touched++;
  count += indexes.length;
  console.log(`${file.padEnd(40)} ${indexes.length} Bild(er)`);
}

console.log(`\n${apply ? 'gesetzt' : 'geplant'}: ${count} Bilder auf ${touched} Seiten`);
