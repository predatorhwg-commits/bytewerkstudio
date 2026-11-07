// Static checks for the Bytewerk site. No browser, no dependencies.
//
//   node tools/verify-site.mjs            # run all checks
//   node tools/verify-site.mjs --quiet    # only failures + summary
//
// Exit code 0 = everything passed, 1 = at least one finding.
//
// What it checks
//   1  every inline <script> has its SHA-256 in that page's CSP
//   2  no script-src / style-src with 'unsafe-inline'
//   3  no style="" attributes in the markup
//   4  every si-* class used in HTML exists in styles-inline.css
//   5  no third-party hosts in HTML, CSS or JS
//   6  every local href/src/url() target exists
//   7  every in-page anchor target exists
//   8  no duplicate id per page
//   9  every <img> has alt, width and height
//  10  exactly one <h1> per page, a skip link and #main exist
//  11  every page links fonts/fonts.css and styles-inline.css
//  12  security.txt exists and declares Contact + Expires
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');

const PAGES = readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('google'));
const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module', 'text/ecmascript', 'application/ecmascript']);
const problems = [];
const fail = (check, file, detail) => problems.push({ check, file, detail });
const read = (f) => readFileSync(join(root, f), 'utf8');
// structural checks look at markup only: inline JS contains template strings
// like "' + p.img + '" that would otherwise look like broken links
const markup = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

/* ---------- 1-2. CSP ---------- */
let inlineScripts = 0;
for (const page of PAGES) {
  const html = read(page);
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  if (!meta) { fail('csp-missing', page, 'no CSP meta tag'); continue; }
  const csp = meta[1];
  if (/script-src[^;]*'unsafe-inline'/.test(csp)) fail('csp-unsafe-inline', page, 'script-src allows unsafe-inline');
  if (/style-src[^;]*'unsafe-inline'/.test(csp)) fail('csp-unsafe-inline', page, 'style-src allows unsafe-inline');
  for (const d of ['object-src', 'base-uri', 'form-action', 'frame-src', 'connect-src', 'font-src']) {
    if (!new RegExp(`(^|;)\\s*${d}\\s`).test(csp)) fail('csp-directive', page, `missing ${d}`);
  }
  const listed = new Set(csp.match(/'sha256-[^']+'/g) || []);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const type = (m[1].match(/\btype\s*=\s*"([^"]*)"/i) || [])[1] || '';
    if (!JS_TYPES.has(type.trim().toLowerCase())) continue;
    inlineScripts++;
    const hash = "'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'";
    if (!listed.has(hash)) fail('csp-hash', page, 'inline script hash missing: ' + hash.slice(0, 22) + '…');
  }
}

/* ---------- 3-4. inline styles ---------- */
const inlineCss = existsSync(join(root, 'styles-inline.css')) ? read('styles-inline.css') : '';
const definedSi = new Set((inlineCss.match(/^\.(si-[\w-]+)/gm) || []).map(s => s.slice(1)));
for (const page of PAGES) {
  const html = read(page);
  if (/\sstyle\s*=\s*"/.test(html)) fail('inline-style', page, 'style attribute left in markup');
  for (const m of html.matchAll(/\bclass="([^"]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls.startsWith('si-') && !definedSi.has(cls)) fail('style-class', page, 'undefined class ' + cls);
    }
  }
}

/* ---------- 5. third-party hosts ---------- */
// Only resource loads count: a link to LinkedIn or lernreich.pro is ordinary
// navigation and does not touch this page's origin policy.
const ASSET_FILES = readdirSync(root).filter(f => /\.(html|css)$/.test(f));
const RESOURCE_RE = [
  /<(?:script|img|iframe|source)\b[^>]*\bsrc="(https?:\/\/[^"]+)"/gi,
  /<link\b[^>]*\bhref="(https?:\/\/[^"]+)"/gi,
  /@import\s+(?:url\()?["']?(https?:\/\/[^"')]+)/gi,
  /url\(\s*["']?(https?:\/\/[^"')]+)/gi,
];
const ALLOWED = new Set(['schema.org', 'www.w3.org']);
for (const file of ASSET_FILES) {
  const text = read(file);
  for (const re of RESOURCE_RE) {
    for (const m of text.matchAll(re)) {
      let host = '';
      try { host = new URL(m[1]).hostname; } catch { continue; }
      if (host === 'bytewerkstudio.com' || ALLOWED.has(host)) continue;
      fail('third-party', file, 'loads from ' + host);
    }
  }
}

/* ---------- 6-7. links and anchors ---------- */
const idsOf = new Map();
for (const page of PAGES) {
  const html = read(page);
  idsOf.set(page, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])));
}
let links = 0;
for (const page of PAGES) {
  const html = markup(read(page));
  const refs = [
    ...[...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(m => m[1]),
  ];
  for (const raw of refs) {
    const ref = raw.trim();
    if (!ref || /' \+|\$\{/.test(ref)) continue; // template fragment, not a URL
    if (ref.startsWith('#') === false && /^(https?:|mailto:|tel:|data:|javascript:)/.test(ref)) continue;
    links++;
    if (ref.startsWith('#')) {
      if (ref.length > 1 && !idsOf.get(page).has(ref.slice(1))) fail('anchor', page, 'missing ' + ref);
      continue;
    }
    const [pathPart, hash] = ref.split('#');
    const clean = pathPart.split('?')[0];
    if (!clean) { if (hash && !idsOf.get(page).has(hash)) fail('anchor', page, 'missing #' + hash); continue; }
    const target = join(dirname(join(root, page)), clean);
    const asFile = existsSync(target) && statSync(target).isFile();
    const asDir = existsSync(target) && statSync(target).isDirectory() && existsSync(join(target, 'index.html'));
    if (!asFile && !asDir) { fail('link', page, 'missing ' + clean); continue; }
    if (hash && clean.endsWith('.html')) {
      const set = idsOf.get(clean.replace(/^.*\//, ''));
      if (set && !set.has(hash)) fail('anchor', page, `missing ${clean}#${hash}`);
    }
  }
}

/* ---------- 8. duplicate ids ---------- */
for (const page of PAGES) {
  const html = markup(read(page));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) fail('duplicate-id', page, [...new Set(dup)].join(','));
}

/* ---------- 9-11. structure ---------- */
let images = 0;
for (const page of PAGES) {
  const html = markup(read(page));
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    images++;
    const tag = m[0];
    if (!/\balt=/.test(tag)) fail('img-alt', page, 'missing alt: ' + tag.slice(0, 60));
    if (!/\bwidth=/.test(tag) || !/\bheight=/.test(tag)) fail('img-size', page, 'missing width/height: ' + tag.slice(0, 60));
    const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1];
    if (src && !/^(data:|https?:)/.test(src) && !existsSync(join(root, src.split('?')[0]))) {
      fail('img-file', page, 'missing ' + src);
    }
  }
  const h1 = (html.match(/<h1\b/g) || []).length;
  if (h1 !== 1) fail('h1', page, h1 + ' h1 elements');
  if (!/class="skip-link"/.test(html)) fail('skip-link', page, 'missing skip link');
  if (!/id="main"/.test(html)) fail('main', page, 'missing #main');
  if (!/href="fonts\/fonts\.css"/.test(html)) fail('fonts', page, 'does not link fonts/fonts.css');
  if (!/href="styles-inline\.css"/.test(html)) fail('styles-inline', page, 'does not link styles-inline.css');
}

/* ---------- 12. security.txt ---------- */
const secTxt = join(root, '.well-known', 'security.txt');
if (!existsSync(secTxt)) fail('security-txt', '.well-known/security.txt', 'missing');
else {
  const t = readFileSync(secTxt, 'utf8');
  if (!/^Contact:/m.test(t)) fail('security-txt', 'security.txt', 'no Contact field');
  if (!/^Expires:/m.test(t)) fail('security-txt', 'security.txt', 'no Expires field');
}

/* ---------- report ---------- */
const byCheck = {};
for (const p of problems) (byCheck[p.check] = byCheck[p.check] || []).push(p);

if (!quiet) {
  console.log('pages        ' + PAGES.length);
  console.log('inline JS    ' + inlineScripts);
  console.log('images       ' + images);
  console.log('local links  ' + links);
  console.log('si-classes   ' + definedSi.size);
  console.log('');
}
for (const [check, list] of Object.entries(byCheck)) {
  console.log('FAIL ' + check + ' (' + list.length + ')');
  for (const p of list.slice(0, 8)) console.log('     ' + p.file + ': ' + p.detail);
  if (list.length > 8) console.log('     … ' + (list.length - 8) + ' more');
}
console.log((problems.length ? 'FAILED' : 'OK') + ' — ' + problems.length + ' finding(s)');
process.exit(problems.length ? 1 : 0);
