// Verify that every inline script's SHA-256 is listed in its own page's CSP.
// usage: node verify-csp.mjs <siteRoot>
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.argv[2];
const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module', 'text/ecmascript', 'application/ecmascript']);
let pages = 0, scripts = 0, bad = 0;

for (const file of readdirSync(root).filter(f => f.endsWith('.html'))) {
  const html = readFileSync(join(root, file), 'utf8');
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  if (!meta) continue;
  pages++;
  const listed = new Set(meta[1].match(/'sha256-[^']+'/g) || []);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const type = (m[1].match(/\btype\s*=\s*"([^"]*)"/i) || [])[1] || '';
    if (!JS_TYPES.has(type.trim().toLowerCase())) continue;
    scripts++;
    const hash = "'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'";
    if (!listed.has(hash)) { console.log('MISSING', file, hash); bad++; }
  }
}

/* second pass: no page may reference a third-party host in a fetch directive */
const FILES = readdirSync(root).filter(f => f.endsWith('.html') || f.endsWith('.css'));
const external = [];
for (const file of FILES) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const m of text.matchAll(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.[a-z.]+|unpkg\.com|jsdelivr\.net)/g)) {
    external.push(file + ' → ' + m[1]);
  }
}
console.log(JSON.stringify({ pages, inlineScripts: scripts, wrongHashes: bad, externalHosts: [...new Set(external)] }, null, 1));
