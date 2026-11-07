// Move inline `data:image/...` URIs out of CSS files into real files under
// media/ui/ and rewrite the url() to point at them.
//
// Why: `img-src 'self' data:` lets an injection render arbitrary embedded
// images. With every decoration on disk, `img-src 'self'` is enough.
//
// Names are content hashes, so repeated runs are stable and identical icons
// collapse into one file.
//
// usage: node tools/externalize-data-uris.mjs <siteRoot> [--dry]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'));
const dry = process.argv.includes('--dry');
const outDir = join(root, 'media', 'ui');

const EXT = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function decode(uri) {
  // data:image/svg+xml[;utf8],<payload>  or  data:image/svg+xml,<percent-encoded>
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  const meta = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  const mime = meta.split(';')[0].toLowerCase();
  if (!EXT[mime]) return null;
  const isBase64 = /;base64/i.test(meta);
  const bytes = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');
  return { mime, ext: EXT[mime], bytes };
}

const files = readdirSync(root).filter(f => f.endsWith('.css'));
let rewritten = 0, created = 0;
const perFile = [];

for (const file of files) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  let count = 0;

  // SVG payloads contain literal single quotes, so the payload has to be
  // matched by its delimiter, not by "anything but a quote".
  const RE = /url\(\s*(?:"(data:image\/[^"]+)"|'(data:image\/[^']+)'|(data:image\/[^)"'\s]+))\s*\)/gi;
  const after = before.replace(RE, (m, dq, sq, bare) => {
    const uri = dq || sq || bare;
    const dec = decode(uri);
    if (!dec) return m;
    const hash = createHash('sha256').update(dec.bytes).digest('hex').slice(0, 10);
    const name = `data-${hash}.${dec.ext}`;
    const target = join(outDir, name);
    if (!existsSync(target)) {
      if (!dry) writeFileSync(target, dec.bytes);
      created++;
    }
    count++;
    return `url("media/ui/${name}")`;
  });

  if (after !== before) {
    rewritten++;
    count && perFile.push({ file, count });
    if (!dry) writeFileSync(path, after);
  }
}

if (!dry) mkdirSync(outDir, { recursive: true });
console.log(JSON.stringify({
  cssFiles: files.length,
  cssRewritten: rewritten,
  uris: perFile.reduce((n, f) => n + f.count, 0),
  files: perFile,
  out: 'media/ui/'
}, null, 1));
