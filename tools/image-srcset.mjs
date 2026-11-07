// Setzt srcset/sizes fuer Bilder, die WebP-Geschwister haben.
// Die sizes-Werte kommen aus echten Messungen (probe-img-display.js):
// Anzeigebreite bei 1440 und 390 Pixeln, in vw umgerechnet und aufgerundet.
// Lieber etwas zu gross als unscharf.
//
//   node tools/image-srcset.mjs <siteDir> <sizes.json> [--apply]
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const sizesFile = process.argv[3];
const apply = process.argv.includes('--apply');
if (!sizesFile) {
  console.error('usage: node tools/image-srcset.mjs <siteDir> <sizes.json> [--apply]');
  process.exit(2);
}

// { "index.html": { "media/x.jpg": "(max-width: 900px) 82vw, 39vw" } }
const sizes = JSON.parse(readFileSync(sizesFile, 'utf8'));

const webpWidth = (file) => {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  return null;
};

let images = 0;
let sets = 0;
const skipped = [];

for (const [page, map] of Object.entries(sizes)) {
  const path = join(dir, page);
  if (!existsSync(path)) { skipped.push(page + ' (fehlt)'); continue; }
  let html = readFileSync(path, 'utf8');
  const before = html;

  for (const [src, sizesAttr] of Object.entries(map)) {
    const base = src.replace(/\.[^.]+$/, '');
    const variants = ['800', '1200']
      .map((w) => `media/${base.replace('media/', '')}-${w}w.webp`)
      .filter((f) => existsSync(join(dir, f)));
    const full = `${base}.webp`;
    if (!existsSync(join(dir, full))) { skipped.push(full + ' (kein WebP)'); continue; }
    const real = webpWidth(join(dir, full));

    const list = [
      ...variants.map((f) => {
        const w = f.match(/-(\d+)w\.webp$/)[1];
        return `${f} ${w}w`;
      }),
      real ? `${full} ${real.w}w` : full,
    ].join(', ');

    // Nur <img>-Tags mit genau diesem src ersetzen.
    html = html.replace(/<img\b[^>]*>/g, (tag) => {
      if (!tag.includes(`src="${src}"`)) return tag;
      images++;
      let out = tag;
      if (!/\bsrcset=/.test(out)) { out = out.replace(/\s*\/?>$/, ` srcset="${list}">`); sets++; }
      if (!/\bsizes=/.test(out)) out = out.replace(/\s*\/?>$/, ` sizes="${sizesAttr}">`);
      return out;
    });
  }

  if (html !== before && apply) writeFileSync(path, html);
}

console.log(JSON.stringify({
  images,
  srcsetAdded: sets,
  pages: Object.keys(sizes).length,
  skipped,
  applied: apply,
}, null, 1));
