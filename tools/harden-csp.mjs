// Replace 'unsafe-inline' in script-src with per-page SHA-256 hashes.
// Recomputes from scratch, so the script is idempotent.
// usage: node harden-csp.mjs <siteRoot>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: node harden-csp.mjs <siteRoot>'); process.exit(1); }

const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module', 'text/ecmascript', 'application/ecmascript']);
const EXTRA = ["frame-src 'none'"];

const files = readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('google'));
const report = [];

for (const file of files) {
  const path = join(root, file);
  let html = readFileSync(path, 'utf8');
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  if (!meta) { report.push({ file, skipped: 'no CSP meta' }); continue; }

  const hashes = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
    const type = typeMatch ? typeMatch[1].trim().toLowerCase() : '';
    if (!JS_TYPES.has(type)) continue;
    hashes.push("'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'");
  }

  const directives = meta[1].split(';').map(d => d.trim()).filter(Boolean);
  const kept = directives
    .filter(d => !/^script-src(\s|$)/i.test(d))
    .filter(d => !/^frame-src(\s|$)/i.test(d))
    .map(d => d.replace(/\s+'sha256-[^']+'/g, ''));
  const scriptSrc = ["script-src 'self'", ...new Set(hashes)].join(' ');
  // keep frame-src next to the other fetch directives
  const out = [];
  let placed = false;
  for (const d of kept) {
    out.push(d);
    if (!placed && /^object-src(\s|$)/i.test(d)) {
      out.push(...EXTRA);
      placed = true;
    }
  }
  if (!placed) out.push(...EXTRA);
  out.push(scriptSrc);

  const csp = out.join('; ');
  html = html.replace(meta[0], `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  writeFileSync(path, html);
  report.push({ file, hashes: hashes.length });
}

const total = report.reduce((n, r) => n + (r.hashes || 0), 0);
console.log(JSON.stringify({ pages: report.length, inlineScripts: total, withoutCsp: report.filter(r => r.skipped).length }, null, 1));
for (const r of report.filter(r => r.skipped)) console.log('SKIP', r.file, r.skipped);
