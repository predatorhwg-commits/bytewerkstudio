// Replace inline style="" attributes with utility classes so the CSP can
// drop 'unsafe-inline' from style-src as well.
//
//  - collects every unique declaration string across all pages
//  - writes styles-inline.css with one class per string, marked !important
//    (a class must beat element selectors exactly like the inline style did)
//  - rewrites the tags, keeping existing class attributes
//  - links the sheet last in <head>
//
// usage: node inline-styles-to-classes.mjs <siteRoot>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: node inline-styles-to-classes.mjs <siteRoot>'); process.exit(1); }

const files = readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('google'));

/* ---------- 1. collect ---------- */
const decls = new Map(); // normalized declarations -> className
function normalize(value) {
  return value
    .split(';')
    .map(d => d.trim())
    .filter(Boolean)
    .map(d => {
      const i = d.indexOf(':');
      if (i === -1) return d;
      const prop = d.slice(0, i).trim();
      const val = d.slice(i + 1).trim().replace(/,\s+/g, ',');
      return prop + ':' + val;
    })
    .join(';');
}
function slug(normalized) {
  return 'si-' + normalized
    .replace(/var\(--([a-z0-9-]+)\)/gi, 'var-$1')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

for (const file of files) {
  const html = readFileSync(join(root, file), 'utf8');
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/g)) {
    const n = normalize(m[1]);
    if (!n) continue;
    if (!decls.has(n)) decls.set(n, slug(n));
  }
}

/* ---------- 2. write the sheet ---------- */
const sheet = [
  '/* Utility classes generated from former inline style attributes.',
  '   tools/inline-styles-to-classes.mjs keeps this file in sync.',
  '   Each rule is !important for the same reason the attribute was:',
  '   it has to win over element selectors in the page layers. */',
  '',
];
for (const [n, cls] of decls) {
  const decl = n.split(';').filter(Boolean).map(d => d.trim() + ' !important').join('; ');
  sheet.push(`.${cls} { ${decl}; }`);
}
writeFileSync(join(root, 'styles-inline.css'), sheet.join('\n') + '\n');

/* ---------- 3. rewrite tags ---------- */
function rewriteTag(tag) {
  const styleMatch = tag.match(/\sstyle\s*=\s*"([^"]*)"/);
  if (!styleMatch) return tag;
  const n = normalize(styleMatch[1]);
  const cls = decls.get(n);
  if (!cls) return tag;

  let out = tag.replace(styleMatch[0], '');
  const classMatch = out.match(/\sclass\s*=\s*"([^"]*)"/);
  if (classMatch) {
    const classes = classMatch[1].split(/\s+/).filter(Boolean);
    if (!classes.includes(cls)) classes.push(cls);
    out = out.replace(classMatch[0], ` class="${classes.join(' ')}"`);
  } else {
    // insert the new attribute right after the tag name
    out = out.replace(/^<([a-zA-Z][a-zA-Z0-9-]*)/, `<$1 class="${cls}"`);
  }
  return out;
}

function rewriteHtml(html) {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { out += html.slice(i); break; }
    out += html.slice(i, lt);
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      if (end === -1) { out += html.slice(lt); break; }
      out += html.slice(lt, end + 3);
      i = end + 3;
      continue;
    }
    // find the closing > while respecting quoted attribute values
    let j = lt + 1, quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      j++;
    }
    if (j >= html.length) { out += html.slice(lt); break; }
    out += rewriteTag(html.slice(lt, j + 1));
    i = j + 1;
  }
  return out;
}

let pages = 0, replaced = 0;
for (const file of files) {
  const path = join(root, file);
  let html = readFileSync(path, 'utf8');
  const before = html;
  const count = (before.match(/\sstyle\s*=\s*"/g) || []).length;
  html = rewriteHtml(html);
  replaced += count;

  if (!html.includes('href="styles-inline.css"')) {
    html = html.replace(/<\/head>/, '<link rel="stylesheet" href="styles-inline.css">\n</head>');
  }
  if (html !== before) { writeFileSync(path, html); pages++; }
}

/* ---------- 4. close style-src ---------- */
let cspPages = 0;
for (const file of files) {
  const path = join(root, file);
  let html = readFileSync(path, 'utf8');
  const before = html;
  html = html.replace(/style-src 'self' 'unsafe-inline'/g, "style-src 'self'");
  if (html !== before) { writeFileSync(path, html); cspPages++; }
}

console.log(JSON.stringify({ uniqueDeclarations: decls.size, styleAttributes: replaced, pagesTouched: pages, cspPages }, null, 1));
