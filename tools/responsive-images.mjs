// Add srcset/sizes to screenshots that have 800w/1200w WebP siblings and
// correct the width/height attributes to the real intrinsic size.
// Idempotent.
// usage: node responsive-images.mjs <siteRoot>
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: node responsive-images.mjs <siteRoot>'); process.exit(1); }

const SIZES = '(max-width: 900px) 94vw, 48vw';
const files = readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('google'));

/* every WebP that has a -800w sibling */
const variants = new Map();
for (const f of readdirSync(join(root, 'media'))) {
  const m = f.match(/^(.+)-800w\.webp$/);
  if (!m) continue;
  const base = m[1];
  const full = join(root, 'media', base + '.webp');
  if (!existsSync(full)) continue;
  const list = [];
  for (const w of [800, 1200]) {
    const p = join(root, 'media', `${base}-${w}w.webp`);
    if (existsSync(p)) list.push({ w, href: `media/${base}-${w}w.webp` });
  }
  list.push({ w: null, href: `media/${base}.webp` });
  variants.set(`media/${base}.webp`, list);
}

/* read intrinsic sizes from the file names' source of truth: the HTML already
   carries width/height for most, so take them from the image header instead */
import { readFileSync as rfs } from 'node:fs';
function webpSize(file) {
  const buf = rfs(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3FFF, h: buf.readUInt16LE(28) & 0x3FFF };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3FFF) + 1, h: ((b >> 14) & 0x3FFF) + 1 };
  }
  return null;
}

let images = 0, sets = 0, fixedDims = 0;
for (const page of files) {
  const path = join(root, page);
  let html = readFileSync(path, 'utf8');
  const before = html;

  html = html.replace(/<img\b([^>]*?)>/g, (m, attrs) => {
    const src = (attrs.match(/\bsrc="([^"]+)"/) || [])[1];
    if (!src || !variants.has(src)) return m;
    images++;
    let out = attrs;

    const real = webpSize(join(root, src));
    if (real) {
      const wAttr = (out.match(/\bwidth="(\d+)"/) || [])[1];
      const hAttr = (out.match(/\bheight="(\d+)"/) || [])[1];
      if (Number(wAttr) !== real.w || Number(hAttr) !== real.h) {
        out = out.replace(/\s*\bwidth="\d+"/, '').replace(/\s*\bheight="\d+"/, '');
        out += ` width="${real.w}" height="${real.h}"`;
        fixedDims++;
      }
    }

    if (!/\bsrcset=/.test(out)) {
      const list = variants.get(src).map(v => `${v.href} ${v.w ? v.w + 'w' : (real ? real.w + 'w' : '')}`).join(', ');
      out += ` srcset="${list}"`;
      sets++;
    }
    if (!/\bsizes=/.test(out)) out += ` sizes="${SIZES}"`;
    return `<img${out}>`;
  });

  if (html !== before) writeFileSync(path, html);
}
console.log(JSON.stringify({ pages: files.length, images, srcsetAdded: sets, dimensionsFixed: fixedDims }, null, 1));
