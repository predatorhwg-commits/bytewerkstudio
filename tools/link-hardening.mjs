// Haengt die Haertungsschicht als letztes Stylesheet in jede Seite.
// Idempotent: mehrfaches Ausfuehren aendert nichts.
// usage: node tools/link-hardening.mjs [siteDir]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const TAG = '<link rel="stylesheet" href="styles-hardening.css">';
const files = readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('google')).sort();

let added = 0;
let present = 0;

for (const file of files) {
  const path = join(dir, file);
  const html = readFileSync(path, 'utf8');
  if (html.includes('styles-hardening.css')) { present++; continue; }
  if (!html.includes('</head>')) { console.log(`${file}: kein </head>`); continue; }
  writeFileSync(path, html.replace('</head>', `${TAG}\n</head>`), 'utf8');
  added++;
}

console.log(`Seiten: ${files.length} · neu verlinkt: ${added} · schon vorhanden: ${present}`);
