// Ersetzt 'unsafe-inline' in script-src durch SHA-256-Hashes aller
// Inline-Skripte je Seite. Damit kann injizierter Code nicht ausgefuehrt
// werden, auch wenn er in den HTML-Baum gelangt.
//
// usage: node csp-hash.mjs <siteDir> [--check]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const checkOnly = process.argv.includes('--check');
const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);

const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
const report = [];

function scriptsOf(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : '';
    if (!JS_TYPES.has(type)) continue; // ld+json und andere Datenbloecke
    out.push({ body: m[2], attrs });
  }
  return out;
}

const hashesOf = (html) => [...new Set(scriptsOf(html)
  .map((s) => "'sha256-" + createHash('sha256').update(s.body, 'utf8').digest('base64') + "'"))];

let changed = 0;
let stale = 0;

for (const file of files) {
  const path = join(dir, file);
  const html = readFileSync(path, 'utf8');
  const hashes = hashesOf(html);

  const cspRe = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/i;
  const cspMatch = html.match(cspRe);
  if (!cspMatch) { report.push([file, 'keine CSP', 0]); continue; }

  const csp = cspMatch[1];
  const directive = csp.match(/(^|;)\s*script-src\s+([^;]*)/);
  if (!directive) { report.push([file, 'kein script-src', 0]); continue; }

  const nextScriptSrc = "script-src 'self'" + (hashes.length ? ' ' + hashes.join(' ') : '');
  const nextCsp = csp.replace(/(^|;)(\s*)script-src\s+([^;]*)/, (all, sep, space) => `${sep}${space}${nextScriptSrc}`);

  if (nextCsp === csp) { report.push([file, 'unveraendert', hashes.length]); continue; }

  if (checkOnly) {
    stale++;
    report.push([file, 'abweichend', hashes.length]);
    continue;
  }

  writeFileSync(path, html.replace(cspRe, `<meta http-equiv="Content-Security-Policy" content="${nextCsp}">`), 'utf8');
  changed++;
  report.push([file, 'aktualisiert', hashes.length]);
}

for (const [file, state, n] of report) {
  if (state !== 'unveraendert') console.log(`${file.padEnd(34)} ${state.padEnd(14)} ${n} Hash(es)`);
}
console.log(`\nSeiten: ${files.length} · geaendert: ${changed} · abweichend: ${stale}`);
process.exit(checkOnly && stale ? 1 : 0);
