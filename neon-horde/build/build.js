#!/usr/bin/env node
/* ============================================================
 * NEON HORDE — Build: verkettet src/*.js in EINE index.html
 * (Single-File-Verkaufsargument: keine externen Runtime-Assets)
 * Aufruf: node build/build.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'index.html');
const ORDER = [
  'loader.js', 'balance.js', 'api.js', 'lang.js',
  'audio.js', 'input.js', 'save.js', 'meta.js',
  'entities.js', 'weapons.js', 'waves.js', 'shop.js',
  'ui.js', 'game.js', 'main.js',
];

function main() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const missing = [];
  const scripts = ORDER.map((f) => {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) { missing.push(f); return ''; }
    const code = fs.readFileSync(p, 'utf8');
    return `/* ==== src/${f} (${(code.length / 1024).toFixed(1)} KB) ==== */\n${code}\n`;
  }).join('\n');

  if (missing.length) {
    console.error('FEHLENDE MODULE (werden noch geschrieben): ' + missing.join(', '));
  }

  // WICHTIG: Die Skripte NICHT via .replace('</body>', ...) einfügen — String.replace
  // interpretiert im Replacement $$, $&, $', $` als Sonderzeichen und verfälscht z.B.
  // NH.dom.$$(sel) zu NH.dom.$(sel) (Root-Cause des schwarzen Screens). Split-basiert:
  let stripped = html.replace(/<script src="src\/[^"]+"><\/script>\s*/g, '');

  // boot.css mit einbetten: dist ist ein Einzeldatei-Artefakt und darf
  // keine externen Dateien nachladen. Nur dieser Build nutzt Inline-CSS;
  // die Website selbst bleibt bei style-src 'self'.
  const bootCss = fs.readFileSync(path.join(ROOT, 'boot.css'), 'utf8');
  stripped = stripped
    .replace(/[ \t]*<link rel="stylesheet" href="boot\.css">\n/, '')
    .replace('</head>', '  <style>\n' + bootCss + '  </style>\n</head>');

  const parts = stripped.split('</body>');
  let single = parts[0] + '  <script>\n' + scripts + '\n  </script>\n</body>' + parts.slice(1).join('</body>');

  if (!single.includes('$all(sel)')) {
    throw new Error('BUILD-FEHLER: NH.dom.$all fehlt im Output — moeglicher $$-Transform aktiv');
  }

  // CSP fuer die Einzeldatei: statt 'unsafe-inline' bekommt genau dieser
  // <style>- und <script>-Block einen SHA-256-Hash. Alles andere bleibt
  // verboten, auch spaeter eingeschleuster Code.
  const crypto = require('crypto');
  const sha = (s) => "'sha256-" + crypto.createHash('sha256').update(s, 'utf8').digest('base64') + "'";
  const styleBody = (single.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
  const scriptBody = (single.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
  if (styleBody === undefined || scriptBody === undefined) {
    throw new Error('BUILD-FEHLER: style- oder script-Block nicht gefunden');
  }
  single = single.replace(
    /style-src [^;]*;/,
    'style-src ' + sha(styleBody) + ';'
  ).replace(
    /script-src [^;]*;/,
    'script-src ' + sha(scriptBody) + ';'
  );
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, single);
  const kb = (single.length / 1024).toFixed(1);
  console.log(`OK: dist/index.html (${kb} KB)` + (missing.length ? ` — FEHLEND: ${missing.join(', ')}` : ''));
}

main();