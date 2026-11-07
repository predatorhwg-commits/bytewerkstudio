// Ergaenzt width/height an lokalen <img>-Tags, damit der Browser das
// Seitenverhaeltnis vor dem Laden kennt (kein Layoutsprung, bessere CLS).
// Die Werte sind die echten Bildmasse; CSS-Groessen bleiben unberuehrt.
//
// usage: node tools/img-dims.mjs <siteDir> [--check]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const checkOnly = process.argv.includes('--check');

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpgSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  return null;
}
function svgSize(text) {
  const w = text.match(/<svg[^>]*\bwidth="([\d.]+)(?:px)?"/i);
  const h = text.match(/<svg[^>]*\bheight="([\d.]+)(?:px)?"/i);
  if (w && h) return { w: Math.round(+w[1]), h: Math.round(+h[1]) };
  const vb = text.match(/<svg[^>]*\bviewBox="([^"]+)"/i);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: Math.round(p[2]), h: Math.round(p[3]) };
  }
  return null;
}

function sizeOf(path) {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  if (path.endsWith('.png')) return pngSize(buf);
  if (/\.jpe?g$/i.test(path)) return jpgSize(buf);
  if (path.endsWith('.svg')) return svgSize(buf.toString('utf8'));
  return null;
}

const files = readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('google')).sort();
const report = [];
let changed = 0;

for (const file of files) {
  const path = join(dir, file);
  let html = readFileSync(path, 'utf8');
  let count = 0;

  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (/\bwidth\s*=/.test(tag) && /\bheight\s*=/.test(tag)) return tag;
    const src = (tag.match(/\bsrc="([^"]+)"/i) || [])[1];
    if (!src || /^(https?:|data:|\/\/)/i.test(src)) return tag;
    const clean = src.split('?')[0];
    const size = sizeOf(join(dir, clean));
    if (!size || !size.w || !size.h) return tag;
    count++;
    return tag.replace(/\s*\/?>$/, ` width="${size.w}" height="${size.h}">`);
  });

  if (!count) continue;
  if (checkOnly) { report.push([file, count]); continue; }
  writeFileSync(path, html, 'utf8');
  changed += count;
  report.push([file, count]);
}

for (const [f, n] of report) console.log(`${f.padEnd(34)} ${n} Bild(er)`);
console.log(`\nSeiten: ${files.length} · ergaenzt: ${checkOnly ? report.reduce((s, r) => s + r[1], 0) + ' offen' : changed}`);
process.exit(checkOnly && report.length ? 1 : 0);
