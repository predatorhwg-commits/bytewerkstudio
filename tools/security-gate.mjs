// Ein Eingang fuer alle Pruefungen vor dem Push.
//
//   node tools/security-gate.mjs            # statische Pruefungen
//   node tools/security-gate.mjs --live     # zusaetzlich Links gegen den Server
//   node tools/security-gate.mjs --live http://127.0.0.1:9500
//
// Exit 0 = alles gruen, Exit 1 = mindestens eine Pruefung rot.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : join(dirname(fileURLToPath(import.meta.url)), '..');
const live = process.argv.includes('--live');
const baseArg = process.argv.slice(2).find((a) => a.startsWith('http'));
const base = baseArg || 'http://127.0.0.1:9500';

const htmlFiles = readdirSync(siteDir).filter((f) => f.endsWith('.html')).sort();
const jsFiles = readdirSync(siteDir).filter((f) => f.endsWith('.js') && !f.startsWith('vendor-'));

const results = [];
const fail = (name, detail) => results.push({ name, ok: false, detail });
const pass = (name, detail) => results.push({ name, ok: true, detail });

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === 'vendor' || entry === 'node_modules' || entry === '.git') continue;
      walk(p, out);
    } else if (entry.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

/* 1. JavaScript-Syntax */
{
  const files = walk(siteDir);
  const broken = [];
  for (const f of files) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      broken.push(f.replace(siteDir + '/', '') + ': ' + String(e.stderr || '').split('\n')[0]);
    }
  }
  broken.length ? fail('Syntax (node --check)', broken.slice(0, 5).join(' | '))
    : pass('Syntax (node --check)', files.length + ' Dateien');
}

/* 2. CSP-Hashes */
{
  try {
    execFileSync(process.execPath, [join(siteDir, 'tools/csp-hash.mjs'), siteDir, '--check'], { stdio: 'pipe' });
    pass('CSP-Hashes', 'alle Seiten aktuell');
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const stale = out.split('\n').filter((l) => /abweichend/.test(l));
    fail('CSP-Hashes', stale.length + ' Seite(n) veraltet: ' + stale.slice(0, 4).map((l) => l.trim().split(/\s+/)[0]).join(', '));
  }
}

/* 3. Kein 'unsafe-inline' in script-src */
{
  const bad = [];
  for (const file of htmlFiles) {
    const html = readFileSync(join(siteDir, file), 'utf8');
    for (const m of html.matchAll(/(?:content="[^"]*|;\s*)script-src([^;"]*)/gi)) {
      if (m[1].includes("'unsafe-inline'")) bad.push(file);
    }
  }
  bad.length ? fail('script-src ohne unsafe-inline', bad.slice(0, 6).join(', '))
    : pass('script-src ohne unsafe-inline', htmlFiles.length + ' Seiten geprueft');
}

/* 4. Inline-Event-Handler */
{
  const bad = [];
  for (const file of htmlFiles) {
    const html = readFileSync(join(siteDir, file), 'utf8');
    const hits = [...html.matchAll(/\son(?:click|change|submit|input|load|error|mouseover|focus|blur|keydown|keyup)\s*=/gi)];
    if (hits.length) bad.push(file + ' (' + hits.length + ')');
  }
  bad.length ? fail('keine Inline-Handler', bad.slice(0, 6).join(', '))
    : pass('keine Inline-Handler', '0 Treffer');
}

/* 5. javascript:-Links */
{
  const bad = [];
  for (const file of htmlFiles) {
    const html = readFileSync(join(siteDir, file), 'utf8');
    if (/href\s*=\s*["']\s*javascript:/i.test(html)) bad.push(file);
  }
  bad.length ? fail('keine javascript:-Links', bad.join(', '))
    : pass('keine javascript:-Links', '0 Treffer');
}

/* 6. target="_blank" nur mit noopener */
{
  const bad = [];
  for (const file of htmlFiles) {
    const html = readFileSync(join(siteDir, file), 'utf8');
    for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
      if (!/\bnoopener\b/i.test(m[0])) bad.push(file + ': ' + m[0].slice(0, 60));
    }
  }
  bad.length ? fail('target=_blank mit noopener', bad.slice(0, 4).join(' | '))
    : pass('target=_blank mit noopener', '0 Treffer');
}

/* 7. Keine Secret-Muster */
{
  const patterns = [
    { name: 'service_role', re: /service_role\s*[:=]\s*['"][A-Za-z0-9._-]{20,}/ },
    { name: 'OpenAI/Anthropic-Key', re: /\b(?:sk|sk-ant)-[A-Za-z0-9_-]{20,}/ },
    { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
    { name: 'privater Schluessel', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: 'GitHub-Token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ }
  ];
  const bad = [];
  for (const f of walk(siteDir)) {
    const text = readFileSync(f, 'utf8');
    for (const p of patterns) {
      if (p.re.test(text)) bad.push(p.name + ' in ' + f.replace(siteDir + '/', ''));
    }
  }
  bad.length ? fail('keine Secrets', bad.slice(0, 5).join(' | '))
    : pass('keine Secrets', patterns.length + ' Muster, 0 Treffer');
}

/* 8. security.txt an beiden Pfaden gleich */
{
  const a = join(siteDir, 'security.txt');
  const b = join(siteDir, '.well-known/security.txt');
  if (!existsSync(a) || !existsSync(b)) {
    fail('security.txt', 'eine der beiden Dateien fehlt');
  } else {
    const same = readFileSync(a, 'utf8').trim() === readFileSync(b, 'utf8').trim();
    same ? pass('security.txt', 'Wurzel und .well-known gleich') : fail('security.txt', 'Inhalt weicht ab');
  }
}

/* 9. Referrer-Policy auf allen Seiten */
{
  const bad = htmlFiles.filter((f) => !/name="referrer"/i.test(readFileSync(join(siteDir, f), 'utf8')) && !f.startsWith('google'));
  bad.length ? fail('Referrer-Policy', bad.join(', '))
    : pass('Referrer-Policy', htmlFiles.length + ' Seiten');
}

/* 10. Keine Inline-Stile — sonst waere 'unsafe-inline' in style-src noetig. */
{
  const offenders = [];
  let attrs = 0;
  for (const file of htmlFiles) {
    if (file.startsWith('google')) continue;
    const html = readFileSync(join(siteDir, file), 'utf8');
    const inlineAttrs = (html.match(/\sstyle\s*=\s*"/g) || []).length;
    const styleBlocks = (html.match(/<style[\s>]/gi) || []).length;
    if (inlineAttrs) { attrs += inlineAttrs; offenders.push(`${file}: ${inlineAttrs} style-Attribut(e)`); }
    if (styleBlocks) offenders.push(`${file}: ${styleBlocks} <style>-Block/oeffnender Tag`);
  }
  offenders.length
    ? fail('keine Inline-Stile', offenders.slice(0, 4).join(', '))
    : pass('keine Inline-Stile', attrs === 0 ? '0 style-Attribute, 0 <style>-Bloecke' : '');
}

/* 11. style-src ohne 'unsafe-inline' */
{
  const bad = htmlFiles.filter((file) => {
    if (file.startsWith('google')) return false;
    const html = readFileSync(join(siteDir, file), 'utf8');
    const m = html.match(/style-src\s+([^;"]*)/i);
    if (!m) return true;
    return m[1].includes("'unsafe-inline'");
  });
  bad.length
    ? fail("style-src ohne 'unsafe-inline'", bad.slice(0, 4).join(', '))
    : pass("style-src ohne 'unsafe-inline'", htmlFiles.filter((f) => !f.startsWith('google')).length + ' Seiten');
}

/* 12. Links und Anker (nur mit --live) */
if (live) {
  try {
    const out = execFileSync(process.execPath, [join(siteDir, 'tools/check-links.mjs'), siteDir, base], { stdio: 'pipe' });
    const last = String(out).trim().split('\n').pop();
    pass('Links und Anker', last);
  } catch (e) {
    const out = String(e.stdout || '');
    const lines = out.trim().split('\n');
    fail('Links und Anker', lines.slice(-4).join(' | '));
  }
} else {
  results.push({ name: 'Links und Anker', ok: null, detail: 'uebersprungen (--live fuer vollen Lauf)' });
}

/* Ausgabe */
const width = Math.max(...results.map((r) => r.name.length));
console.log('');
for (const r of results) {
  const mark = r.ok === true ? 'OK  ' : r.ok === false ? 'FAIL' : '--  ';
  console.log(`${mark} ${r.name.padEnd(width)}  ${r.detail}`);
}
const fails = results.filter((r) => r.ok === false).length;
console.log(`\n${results.length} Pruefungen · ${fails ? fails + ' rot' : 'alles gruen'}\n`);
process.exit(fails ? 1 : 0);
