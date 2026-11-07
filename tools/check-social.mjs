// Prueft Social-Metadaten: og:image vorhanden, Datei existiert, Masse stimmen,
// twitter:image gesetzt, og:url = kanonische Adresse.
//
//   node tools/check-social.mjs <siteDir>
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const files = readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('google')).sort();

const problems = [];
const seen = new Map();

function meta(html, attr, name) {
  const re = new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

function pngSize(path) {
  try {
    const buf = readFileSync(path);
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch (e) { return null; }
}

let checked = 0;

for (const file of files) {
  const html = readFileSync(join(dir, file), 'utf8');
  const isNoindex = /<meta\s+name="robots"[^>]*noindex/i.test(html);
  const image = meta(html, 'property', 'og:image');
  const title = meta(html, 'property', 'og:title');
  const url = meta(html, 'property', 'og:url');
  const card = meta(html, 'name', 'twitter:card');
  const twImage = meta(html, 'name', 'twitter:image');

  if (!image) {
    // Konto-, Rechts- und Fehlerseiten brauchen keine Social-Card.
    if (!isNoindex) problems.push([file, 'kein og:image']);
    continue;
  }

  checked++;

  if (image.endsWith('.svg')) problems.push([file, 'og:image ist SVG (wird nicht angezeigt)']);

  const local = image.replace(/^https?:\/\/[^/]+\//, '');
  if (!existsSync(join(dir, local))) {
    problems.push([file, 'og:image fehlt: ' + local]);
  } else if (local.endsWith('.png')) {
    const size = pngSize(join(dir, local));
    if (size) {
      const kw = meta(html, 'property', 'og:image:width');
      const kh = meta(html, 'property', 'og:image:height');
      if (kw && +kw !== size.w) problems.push([file, `og:image:width ${kw} != ${size.w}`]);
      if (kh && +kh !== size.h) problems.push([file, `og:image:height ${kh} != ${size.h}`]);
      if (size.w < 600 || size.h < 315) problems.push([file, `Bild zu klein: ${size.w}x${size.h}`]);
      if (size.w / size.h < 1.7 || size.w / size.h > 2.0) problems.push([file, `Seitenverhaeltnis ${(size.w / size.h).toFixed(2)} (erwartet ~1.91)`]);
    }
  }

  if (!title) problems.push([file, 'kein og:title']);
  if (card && !twImage) problems.push([file, 'twitter:card ohne twitter:image']);
  if (card && twImage && twImage !== image) problems.push([file, 'twitter:image != og:image']);
  if (url) {
    const canonical = (html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) || [])[1];
    if (canonical && canonical !== url) problems.push([file, `og:url != canonical (${url} vs ${canonical})`]);
    if (!url.startsWith('https://')) problems.push([file, 'og:url ohne https']);
  } else if (!isNoindex) {
    problems.push([file, 'kein og:url']);
  }

  const key = image;
  if (seen.has(key)) seen.get(key).push(file); else seen.set(key, [file]);
}

for (const [file, why] of problems) console.log(`${file.padEnd(38)} ${why}`);

const shared = [...seen.entries()].filter(([, list]) => list.length > 1);
console.log(`\nSeiten: ${files.length} · mit og:image: ${checked} · Probleme: ${problems.length}`);
if (shared.length) {
  console.log('Geteilte Bilder (bewusst, z. B. community/forum und checkout/produkt):');
  for (const [img, list] of shared) console.log('  ' + img.split('/').pop() + ' → ' + list.join(', '));
}
process.exit(problems.length ? 1 : 0);
