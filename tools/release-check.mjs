// Freigabe-Lauf: alle Pruefungen in einer festen Reihenfolge.
//
// Warum: acht einzelne Werkzeuge mit eigenen Argumenten sind im Alltag
// fehleranfaellig — man vergisst eines, oder man ruft eines mit dem falschen
// Modus auf. Dieses Skript ruft alle auf, sammelt die Ergebnisse und gibt am
// Ende eine Tabelle aus. Exit 0 = freigabefaehig.
//
//   node tools/release-check.mjs http://127.0.0.1:9500
//   node tools/release-check.mjs http://127.0.0.1:9500 --fast   (ohne Browser)
//
// Voraussetzung: ein laufender Server im Wurzelverzeichnis. Fuer realistische
// Groessen `python3 tools/serve-gzip.py . 9503` verwenden.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const base = (arg || 'http://127.0.0.1:9500').replace(/\/$/, '');
const fast = process.argv.includes('--fast');
const node = process.execPath;
const rows = [];

function run(name, cmd) {
  process.stdout.write(`${name} … `);
  let ok = true;
  let detail = '';
  try {
    const out = execFileSync(node, cmd, {
      encoding: 'utf8', stdio: 'pipe', cwd: root, timeout: 40 * 60 * 1000,
    });
    const lines = String(out).trim().split('\n').filter(Boolean);
    detail = lines[lines.length - 1] || '';
  } catch (e) {
    ok = false;
    const lines = (String(e.stdout || '') + String(e.stderr || '')).trim().split('\n').filter(Boolean);
    detail = lines.slice(-2).join(' | ');
  }
  rows.push([name, ok ? 'OK' : 'FAIL', detail.slice(0, 80)]);
  console.log(ok ? 'OK' : 'FAIL');
}

/* ---------- Ohne Browser ---------- */
run('CSP-Hashes aktuell', [join(root, 'tools/csp-hash.mjs'), root, '--check']);
run('Seitenpruefung (verify-site)', [join(root, 'tools/verify-site.mjs')]);
run('Social-Vorschau', [join(root, 'tools/check-social.mjs'), root]);
run('Syntax aller Skripte', [join(root, 'tools/security-gate.mjs'), root]);
run('Sicherheit + Links (--live)', [join(root, 'tools/security-gate.mjs'), root, '--live', base]);

if (fast) {
  print();
} else {
  /* ---------- Mit Browser ---------- */
  run('Barrierefreiheit (a11y-audit)', [join(root, 'tools/a11y-audit.mjs'), base]);
  run('Funktionstest (smoke-test)', [join(root, 'tools/smoke-test.mjs'), base]);
  run('Angriffsprobe (csp-attack)', [join(root, 'tools/csp-attack.mjs'), base, '--all']);

  /* Seiten-Sweep. Das Werkzeug liegt im Projekt; fehlt es, wird das gesagt —
     nicht stillschweigend uebersprungen. */
  const sweep = join(root, 'tools', 'sweep-release.mjs');
  if (!existsSync(sweep)) {
    rows.push(['Seiten-Sweep', 'FAIL', 'tools/sweep-release.mjs fehlt']);
    console.log('Seiten-Sweep … FAIL (Werkzeug fehlt)');
  } else {
    process.stdout.write('Seiten-Sweep … ');
    const target = '/tmp/release-sweep.json';
    let ok = true;
    try {
      execFileSync(node, [sweep, base, root, target], {
        stdio: 'pipe', cwd: root, timeout: 60 * 60 * 1000,
      });
    } catch {
      ok = false;
    }
    let detail = 'kein Ergebnis';
    try {
      const data = JSON.parse(readFileSync(target, 'utf8'));
      const widths = Object.keys(data[0].widths);
      const sum = (fn) => data.reduce((a, p) => a + widths.reduce((b, w) => b + fn(p.widths[w]), 0), 0);
      const overflow = sum((w) => w.overflow);
      // Achtung: ein leeres Array ist in JavaScript wahr. Ohne die
      // Laengenpruefung zaehlt jede Seite als fehlerhaft.
      const errors = data.filter((p) => p.errors && p.errors.length).length;
      const dup = sum((w) => w.dup.length);
      // noAlt ist im Sweep eine Zahl, kein Array.
      const noalt = sum((w) => w.noAlt || 0);
      detail = `${data.length} Seiten × ${widths.length} Breiten · Überlauf ${overflow} · Fehler ${errors} · doppelte IDs ${dup} · ohne alt ${noalt}`;
      if (overflow || errors || dup || noalt) ok = false;
    } catch {
      ok = false;
    }
    rows.push(['Seiten-Sweep', ok ? 'OK' : 'FAIL', detail]);
    console.log(ok ? 'OK' : 'FAIL');
  }
  print();
}

function print() {
  console.log('\n' + '='.repeat(100));
  for (const [name, state, detail] of rows) {
    console.log(`${state.padEnd(5)} ${name.padEnd(42)} ${detail}`);
  }
  const failed = rows.filter((r) => r[1] === 'FAIL');
  console.log('='.repeat(100));
  console.log(failed.length
    ? `${failed.length} von ${rows.length} Pruefungen fehlgeschlagen`
    : `${rows.length} Pruefungen · alles gruen`);
  process.exit(failed.length ? 1 : 0);
}
