/* ============================================================
   BYTEWERK STUDIO — community.js
   ------------------------------------------------------------
   Forum engine for community.html.

   Principles
   - No innerHTML for user content, ever. Posts are built from
     DOM nodes and textContent; the markdown renderer only
     creates allowlisted elements.
   - State is untrusted input: parsed, validated and clamped on
     every load.
   - Honest preview: data lives in localStorage, there is no
     server and no fake "live" number.

   Sections
   1  Constants, seeds, helpers
   2  State: load, validate, save
   3  Data: merge, filter, stats
   4  Markdown renderer (safe)
   5  Forum list
   6  Thread view
   7  Composer
   8  Membership and pricing
   9  Sidebar
   10 Security self-test
   11 Wiring
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 1. Constants, seeds, helpers ---------- */
  const STORE_KEY = 'bw-community-v1';
  const MAX_THREADS = 200;
  const MAX_REPLIES = 80;
  const MAX_TITLE = 120;
  const MAX_BODY = 4000;
  const MIN_TITLE = 8;
  const MIN_BODY = 20;
  const POST_COOLDOWN = 30 * 1000;
  const POSTS_PER_DAY = 40;

  const CATS = [
    { id: 'fragen',    de: 'Fragen & Hilfe', en: 'Questions & Help', color: '#b04f31', descDe: 'Konkret fragen, gemeinsam lösen.', descEn: 'Ask precisely, solve together.' },
    { id: 'code',      de: 'Code & Review',  en: 'Code & Review',    color: '#4f7a63', descDe: 'Snippets, Fehler, zweite Augen.', descEn: 'Snippets, bugs, second pair of eyes.' },
    { id: 'produkte',  de: 'Produkte',       en: 'Products',         color: '#8a6a3f', descDe: 'Lernreich, Vault, Pilot und mehr.', descEn: 'Lernreich, Vault, Pilot and more.' },
    { id: 'werkstatt', de: 'Werkstatt',      en: 'Workshop',         color: '#5b6b8a', descDe: 'Nur für Developer- und Studio-Abos.', descEn: 'Developer and Studio members only.', membersOnly: true },
    { id: 'meta',      de: 'Studio & Meta',  en: 'Studio & Meta',    color: '#7a5c6a', descDe: 'Wie wir arbeiten, was als Nächstes kommt.', descEn: 'How we work, what comes next.' }
  ];

  const AUTHORS = {
    studio: { name: 'Bytewerk Studio', handle: 'studio', role: 'studio' },
    mira:   { name: 'Mira K.', handle: 'mira', role: 'member' },
    jonas:  { name: 'Jonas W.', handle: 'jonas', role: 'member' },
    ela:    { name: 'Ela D.', handle: 'ela', role: 'member' },
    tobias: { name: 'Tobias R.', handle: 'tobias', role: 'member' },
    nora:   { name: 'Nora S.', handle: 'nora', role: 'member' }
  };

  const md = (...lines) => lines.join('\n');
  const HOUR = 3600 * 1000;
  const now = Date.now();
  const BASE_VOTES = { s1: 34, s2: 21, s3: 17, s4: 9, s5: 6, s6: 18, s7: 12, s8: 4, s9: 8 };

  const SEED = [
    {
      id: 's1', cat: 'meta', pinned: true,
      author: AUTHORS.studio, at: now - 6 * HOUR, views: 412,
      tags: ['start', 'regeln'], solved: false,
      title: {
        de: 'So stellst du eine Frage, die eine Antwort bekommt',
        en: 'How to ask a question that gets an answer'
      },
      body: {
        de: md(
          'Willkommen im Forum. Drei Dinge sparen allen Zeit:',
          '',
          '- **Kontext**: Was baust du, mit welcher Version, auf welchem System?',
          '- **Versuch**: Was hast du probiert — und was ist stattdessen passiert?',
          '- **Ziel**: Was soll am Ende herauskommen?',
          '',
          'Code gehört in einen Block, keine Screenshots von Text. Und niemals Keys, Tokens oder Kundendaten einfügen.'
        ),
        en: md(
          'Welcome to the forum. Three things save everyone time:',
          '',
          '- **Context**: what are you building, which version, which system?',
          '- **Attempt**: what did you try — and what happened instead?',
          '- **Goal**: what should the result be?',
          '',
          'Put code in a block, not in a screenshot. And never paste keys, tokens or customer data.'
        )
      },
      replies: [
        {
          author: AUTHORS.mira, at: now - 4.5 * HOUR, body: {
            de: 'Ergänzung: Markiere die Antwort, die geholfen hat. Dann findet sie die nächste Person in zwei Minuten statt in zwanzig.',
            en: 'One addition: mark the answer that helped. The next person then finds it in two minutes instead of twenty.'
          }
        }
      ]
    },
    {
      id: 's2', cat: 'code',
      author: AUTHORS.mira, at: now - 26 * HOUR, views: 268,
      tags: ['three.js', 'performance'], solved: true,
      title: {
        de: 'Three.js: Szene pausiert im Hintergrund-Tab nicht',
        en: 'Three.js: scene does not pause in a background tab'
      },
      body: {
        de: md(
          'Ich rendere eine kleine Szene mit `requestAnimationFrame` und merke, dass der Lüfter weiterläuft, sobald der Tab im Hintergrund ist.',
          '',
          '```js',
          'function loop(t) {',
          '  renderer.render(scene, camera);',
          '  requestAnimationFrame(loop);',
          '}',
          'requestAnimationFrame(loop);',
          '```',
          '',
          'Wie pausiert ihr sauber, ohne den Loop neu zu verdrahten?'
        ),
        en: md(
          'I render a small scene with `requestAnimationFrame` and notice the fan keeps going when the tab is in the background.',
          '',
          '```js',
          'function loop(t) {',
          '  renderer.render(scene, camera);',
          '  requestAnimationFrame(loop);',
          '}',
          'requestAnimationFrame(loop);',
          '```',
          '',
          'How do you pause cleanly without rewiring the loop?'
        )
      },
      replies: [
        {
          author: AUTHORS.jonas, at: now - 24 * HOUR, body: {
            de: md(
              'Bei mir hängt der Loop an einem Flag und an `visibilitychange`:',
              '',
              '```js',
              'let frame = 0;',
              'function loop(t) {',
              '  if (document.hidden) return;',
              '  renderer.render(scene, camera);',
              '  frame = requestAnimationFrame(loop);',
              '}',
              'document.addEventListener("visibilitychange", () => {',
              '  if (document.hidden) cancelAnimationFrame(frame);',
              '  else frame = requestAnimationFrame(loop);',
              '});',
              '```'
            ),
            en: md(
              'Mine runs on a flag plus `visibilitychange`:',
              '',
              '```js',
              'let frame = 0;',
              'function loop(t) {',
              '  if (document.hidden) return;',
              '  renderer.render(scene, camera);',
              '  frame = requestAnimationFrame(loop);',
              '}',
              'document.addEventListener("visibilitychange", () => {',
              '  if (document.hidden) cancelAnimationFrame(frame);',
              '  else frame = requestAnimationFrame(loop);',
              '});',
              '```'
            )
          }
        },
        {
          author: AUTHORS.studio, at: now - 22 * HOUR, body: {
            de: md(
              'Zwei Ergänzungen: Der Tab kann sichtbar sein und die Bühne trotzdem außerhalb des Viewports liegen. Dafür lohnt ein `IntersectionObserver`, der den Loop startet und stoppt.',
              '',
              'Und beim Start `Math.min(devicePixelRatio, 2)` setzen. Auf einem 3-fach-Display rendert ihr sonst die neunfache Pixelmenge für ein Bild, das niemand sieht.'
            ),
            en: md(
              'Two additions: the tab can be visible while the stage is off-screen. An `IntersectionObserver` that starts and stops the loop is worth it.',
              '',
              'And clamp to `Math.min(devicePixelRatio, 2)` at start. On a 3x display you otherwise render nine times the pixels for an image nobody sees.'
            )
          }
        },
        {
          author: AUTHORS.mira, at: now - 20 * HOUR, body: {
            de: 'Danke, beides eingebaut. Der Lüfter bleibt jetzt ruhig, auch wenn ich nur den Tab wechsle.',
            en: 'Thanks, both are in. The fan stays quiet now, even when I just switch tabs.'
          }
        }
      ]
    },
    {
      id: 's3', cat: 'fragen',
      author: AUTHORS.jonas, at: now - 50 * HOUR, views: 197,
      tags: ['csp', 'javascript'], solved: true,
      title: {
        de: 'CSP blockt mein Inline-Script — was ist der saubere Weg?',
        en: 'CSP blocks my inline script — what is the clean way?'
      },
      body: {
        de: md(
          'Meine Seite setzt `script-src \'self\'`. Ein kleiner Inline-Handler an einem Button wird blockiert, in der Konsole steht eine CSP-Warnung.',
          '',
          'Ich will die Policy nicht mit `unsafe-inline` aufweichen. Wie löst ihr so etwas?'
        ),
        en: md(
          'My page sets `script-src \'self\'`. A small inline handler on a button is blocked and the console shows a CSP warning.',
          '',
          'I do not want to weaken the policy with `unsafe-inline`. How do you solve this?'
        )
      },
      replies: [
        {
          author: AUTHORS.mira, at: now - 48 * HOUR, body: {
            de: md(
              'Handler in eine eigene Datei, dann `addEventListener`:',
              '',
              '```js',
              'document.querySelectorAll("[data-open]").forEach((btn) => {',
              '  btn.addEventListener("click", () => open(btn.dataset.open));',
              '});',
              '```',
              '',
              'Damit bleibt die CSP strikt und der Code ist testbar.'
            ),
            en: md(
              'Move the handler into a file, then `addEventListener`:',
              '',
              '```js',
              'document.querySelectorAll("[data-open]").forEach((btn) => {',
              '  btn.addEventListener("click", () => open(btn.dataset.open));',
              '});',
              '```',
              '',
              'The CSP stays strict and the code becomes testable.'
            )
          }
        },
        {
          author: AUTHORS.studio, at: now - 46 * HOUR, body: {
            de: 'Genau so machen wir es auf dieser Seite: ein delegierter Listener am Dokument, Daten kommen aus `data-*`. Kein Inline-Handler, kein `eval`, keine Ausnahme in der Policy.',
            en: 'That is exactly what we do on this site: one delegated listener on the document, data from `data-*`. No inline handler, no `eval`, no exception in the policy.'
          }
        }
      ]
    },
    {
      id: 's4', cat: 'produkte',
      author: AUTHORS.ela, at: now - 8 * HOUR, views: 143,
      tags: ['lernreich', 'import'], solved: false,
      title: {
        de: 'Lernreich Pro: CSV mit Semikolon importieren',
        en: 'Lernreich Pro: importing a CSV with semicolons'
      },
      body: {
        de: 'Meine Excel-Exporte kommen mit Semikolon als Trennzeichen. Der Import erwartet offenbar ein Komma und macht aus jeder Zeile eine Spalte. Gibt es dafür eine Einstellung, oder muss ich vorher umspeichern?',
        en: 'My Excel exports use semicolons as the separator. The import seems to expect a comma and turns every row into a single column. Is there a setting, or do I have to convert first?'
      },
      replies: [
        {
          author: AUTHORS.studio, at: now - 7 * HOUR, body: {
            de: 'Aktuell liest der Import Komma. Der schnellste Weg: in Excel „CSV UTF-8 (Komma-getrennt)“ speichern. Eine Trennzeichen-Auswahl steht auf der Liste für das nächste Update — ich notiere deinen Fall mit Semikolon dazu.',
            en: 'Right now the importer reads commas. Fastest route: save as “CSV UTF-8 (comma delimited)” in Excel. A separator picker is on the list for the next update — I have noted your semicolon case.'
          }
        },
        {
          author: AUTHORS.ela, at: now - 6.5 * HOUR, body: {
            de: 'Mit Komma-Export hat es sofort funktioniert, danke. Ich lasse das Thema offen, bis die Auswahl da ist.',
            en: 'The comma export worked immediately, thank you. I will leave this open until the picker ships.'
          }
        }
      ]
    },
    {
      id: 's5', cat: 'werkstatt', membersOnly: true,
      author: AUTHORS.tobias, at: now - 3 * HOUR, views: 88,
      tags: ['react', 'review'], solved: false,
      title: {
        de: 'Code-Review: Undo/Redo-Hook für React',
        en: 'Code review: undo/redo hook for React'
      },
      body: {
        de: md(
          'Ich habe einen kleinen Hook für Undo/Redo gebaut. Der Reducer hält Vergangenheit, Gegenwart und Zukunft. Rückgängig machen fühlt sich richtig an, aber nach einem neuen Schritt ist die Zukunft nicht immer leer.',
          '',
          '```js',
          'function reducer(state, action) {',
          '  if (action.type === "undo") {',
          '    const prev = state.past.at(-1);',
          '    if (!prev) return state;',
          '    return {',
          '      past: state.past.slice(0, -1),',
          '      present: prev,',
          '      future: [state.present, ...state.future],',
          '    };',
          '  }',
          '  return {',
          '    past: [...state.past, state.present],',
          '    present: action.value,',
          '    future: [],',
          '  };',
          '}',
          '```',
          '',
          'Wo würdet ihr ansetzen?'
        ),
        en: md(
          'I built a small undo/redo hook. The reducer keeps past, present and future. Undo feels right, but after a new step the future is not always empty.',
          '',
          '```js',
          'function reducer(state, action) {',
          '  if (action.type === "undo") {',
          '    const prev = state.past.at(-1);',
          '    if (!prev) return state;',
          '    return {',
          '      past: state.past.slice(0, -1),',
          '      present: prev,',
          '      future: [state.present, ...state.future],',
          '    };',
          '  }',
          '  return {',
          '    past: [...state.past, state.present],',
          '    present: action.value,',
          '    future: [],',
          '  };',
          '}',
          '```',
          '',
          'Where would you start?'
        )
      },
      replies: [
        {
          author: AUTHORS.studio, at: now - 2 * HOUR, body: {
            de: md(
              'Der Zustand sieht sauber aus. Drei Punkte für das Review:',
              '',
              '1. **Grenze die Historie**: `past.slice(-50)` verhindert, dass ein langer Abend den Speicher füllt.',
              '2. **Gruppiere Tippschritte**: sonst kostet ein Satz 40 Undos. Ein Zeitfenster von 500 ms pro Gruppe reicht meist.',
              '3. **Teste die Zukunft**: nach undo → neuem Schritt muss `future` leer sein. Das ist dein wichtigster Fall.',
              '',
              'Der Code ist nah dran. Schick gern die nächste Version.'
            ),
            en: md(
              'The state looks clean. Three review points:',
              '',
              '1. **Bound the history**: `past.slice(-50)` keeps a long evening from filling memory.',
              '2. **Group typing steps**: otherwise one sentence costs 40 undos. A 500 ms window per group is usually enough.',
              '3. **Test the future**: after undo → new step, `future` must be empty. That is your most important case.',
              '',
              'The code is close. Send the next version any time.'
            )
          }
        },
        {
          author: AUTHORS.tobias, at: now - 1.2 * HOUR, body: {
            de: 'Punkt 3 war tatsächlich der Fehler: Ich habe den Verlauf beim Tippen nicht gruppiert und dann doppelt geleert. Danke, ich baue es um.',
            en: 'Point 3 was the actual bug: I did not group while typing and then cleared twice. Thanks, rebuilding it.'
          }
        }
      ]
    },
    {
      id: 's6', cat: 'code',
      author: AUTHORS.mira, at: now - 74 * HOUR, views: 231,
      tags: ['supabase', 'rls'], solved: true,
      title: {
        de: 'Supabase RLS: Policy greift bei UPDATE nicht',
        en: 'Supabase RLS: policy does not apply on UPDATE'
      },
      body: {
        de: md(
          'Meine Policy funktioniert für `select`, aber ein `update` auf die eigene Zeile liefert null Zeilen zurück. Die Zeile gehört sicher dem eingeloggten Nutzer.',
          '',
          '```sql',
          'create policy "own rows" on notes',
          '  for select using (auth.uid() = user_id);',
          '```',
          '',
          'Was fehlt?'
        ),
        en: md(
          'My policy works for `select`, but an `update` on my own row returns zero rows. The row definitely belongs to the signed-in user.',
          '',
          '```sql',
          'create policy "own rows" on notes',
          '  for select using (auth.uid() = user_id);',
          '```',
          '',
          'What is missing?'
        )
      },
      replies: [
        {
          author: AUTHORS.studio, at: now - 72 * HOUR, body: {
            de: md(
              'Für `update` braucht es `using` **und** `with check`. `using` wählt die Zeilen, `with check` prüft das Ergebnis — sonst könnte man `user_id` auf eine fremde ID schreiben.',
              '',
              '```sql',
              'create policy "own rows update" on notes',
              '  for update',
              '  using (auth.uid() = user_id)',
              '  with check (auth.uid() = user_id);',
              '```'
            ),
            en: md(
              '`update` needs `using` **and** `with check`. `using` selects the rows, `with check` validates the result — otherwise someone could write `user_id` to a foreign ID.',
              '',
              '```sql',
              'create policy "own rows update" on notes',
              '  for update',
              '  using (auth.uid() = user_id)',
              '  with check (auth.uid() = user_id);',
              '```'
            )
          }
        },
        {
          author: AUTHORS.jonas, at: now - 70 * HOUR, body: {
            de: 'Kleine Ergänzung: Im Supabase-SQL-Editor siehst du das Ergebnis nicht, weil dort die `service_role` läuft und RLS umgeht. Teste mit dem anon key über den Client.',
            en: 'Small addition: the Supabase SQL editor runs as `service_role` and bypasses RLS, so you will not see the effect there. Test with the anon key through the client.'
          }
        }
      ]
    },
    {
      id: 's7', cat: 'fragen',
      author: AUTHORS.jonas, at: now - 5 * HOUR, views: 176,
      tags: ['git', 'security'], solved: false,
      title: {
        de: 'Git: Key versehentlich committet — was jetzt?',
        en: 'Git: accidentally committed a key — what now?'
      },
      body: {
        de: 'Ein API-Key ist in einem Commit gelandet und der Branch ist bereits gepusht. Reicht ein neuer Commit, der die Zeile löscht, oder muss die Historie neu geschrieben werden?',
        en: 'An API key ended up in a commit and the branch is already pushed. Is a new commit that removes the line enough, or does the history need rewriting?'
      },
      replies: [
        {
          author: AUTHORS.studio, at: now - 4.7 * HOUR, body: {
            de: md(
              'Zuerst: **Key widerrufen und neu erzeugen.** Alles andere ist Aufräumen, kein Schutz — ein gepushter Key gilt als öffentlich.',
              '',
              'Danach die Historie bereinigen (`git filter-repo` oder BFG), Force-Push nur nach Absprache im Team, und alle Klone neu aufsetzen. Prüfe auch Forken, CI-Logs und Caches: Dort bleibt der Key oft länger sichtbar als im Branch.'
            ),
            en: md(
              'First: **revoke and rotate the key.** Everything else is cleanup, not protection — a pushed key is public.',
              '',
              'Then clean the history (`git filter-repo` or BFG), force-push only after coordinating with the team, and re-clone everywhere. Also check forks, CI logs and caches: the key often stays visible there longer than in the branch.'
            )
          }
        },
        {
          author: AUTHORS.mira, at: now - 4 * HOUR, body: {
            de: 'Und für die Zukunft: `.env` in `.gitignore`, ein Secret-Scan im CI und ein Pre-Commit-Hook. Der Hook ist keine Garantie, aber er fängt die einfachen Fälle.',
            en: 'And for next time: `.env` in `.gitignore`, a secret scan in CI and a pre-commit hook. The hook is not a guarantee, but it catches the simple cases.'
          }
        }
      ]
    },
    {
      id: 's8', cat: 'produkte',
      author: AUTHORS.ela, at: now - 30 * HOUR, views: 64,
      tags: ['countdown', 'windows'], solved: true,
      title: {
        de: 'Prüfungs-Countdown auf Windows 11 ARM?',
        en: 'Exam Countdown on Windows 11 ARM?'
      },
      body: {
        de: 'Läuft die App auf einem Snapdragon-Notebook? Der Installer startet, aber ich bin unsicher, ob die Erinnerungen zuverlässig kommen, wenn das Gerät im Standby war.',
        en: 'Does the app run on a Snapdragon laptop? The installer starts, but I am unsure whether reminders arrive reliably after the device has been in standby.'
      },
      replies: [
        {
          author: AUTHORS.studio, at: now - 28 * HOUR, body: {
            de: 'Die App läuft über die x64-Emulation von Windows 11 ARM; für Erinnerungen nutzen wir die Aufgabenplanung, nicht einen Timer im Speicher. Das funktioniert auch nach Standby. Ein natives ARM-Build steht auf der Liste, hat aber keinen Termin.',
            en: 'The app runs through Windows 11 ARM’s x64 emulation; reminders use Task Scheduler rather than an in-memory timer, so they survive standby. A native ARM build is on the list but has no date.'
          }
        },
        {
          author: AUTHORS.ela, at: now - 27 * HOUR, body: {
            de: 'Danke, dann teste ich es eine Woche und melde mich, falls eine Erinnerung ausbleibt.',
            en: 'Thanks, I will test it for a week and report back if a reminder is missed.'
          }
        }
      ]
    },
    {
      id: 's9', cat: 'werkstatt', membersOnly: true,
      author: AUTHORS.studio, at: now - 12 * HOUR, views: 95,
      tags: ['three.js', 'architektur'], solved: false,
      title: {
        de: 'Wie strukturiert ihr eure Three.js-Szenen?',
        en: 'How do you structure your three.js scenes?'
      },
      body: {
        de: md(
          'Ich sammle gerade Muster für die nächste Produktseite. Aktuell: eine Datei pro Szene, ein gemeinsamer Renderer, Budgets für DPR und Pixel, Pause außerhalb des Viewports.',
          '',
          'Was hat sich bei euch bewährt — und was würdet ihr heute anders machen?'
        ),
        en: md(
          'I am collecting patterns for the next product page. Current setup: one file per scene, a shared renderer, budgets for DPR and pixels, pause outside the viewport.',
          '',
          'What has worked for you — and what would you do differently today?'
        )
      },
      replies: [
        {
          author: AUTHORS.tobias, at: now - 10 * HOUR, body: {
            de: 'Ein gemeinsamer Renderer ist Gold wert. Was ich anders machen würde: die Szenen nicht über eine globale Registry verbinden, sondern jede Seite ihr Modul importieren lassen. Weniger Kopplung, einfacheres Entfernen.',
            en: 'A shared renderer is worth a lot. What I would change: do not wire scenes through a global registry; let each page import its module. Less coupling, easier removal.'
          }
        },
        {
          author: AUTHORS.nora, at: now - 9 * HOUR, body: {
            de: 'Bei mir hat ein hartes Budget geholfen: maximal 2,6 Millionen Pixel und 60 Draw Calls. Sobald eine Szene darüber liegt, wird sie vereinfacht — nicht optimiert. Das spart Diskussionen.',
            en: 'A hard budget helped me: at most 2.6 million pixels and 60 draw calls. Once a scene goes over, it gets simplified — not optimised. That saves discussions.'
          }
        }
      ]
    }
  ];

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };

  const lang = () => (document.documentElement.lang === 'de' ? 'de' : 'en');
  const t = (de, en) => (lang() === 'en' ? en : de);

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value; // trusted constants only
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'style') node.style.cssText = value;
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, String(value));
      }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const icon = (name) => h('span', { class: 'cm-ico', 'aria-hidden': 'true', html: ICONS[name] || '' });

  const num = (value) => new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'de-DE').format(value);

  function relTime(ts) {
    if (!Number.isFinite(ts)) return '';
    const diff = ts - Date.now();
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(lang() === 'en' ? 'en' : 'de', { numeric: 'auto' });
    if (abs < 60 * 1000) return t('gerade eben', 'just now');
    if (abs < HOUR) return rtf.format(Math.round(diff / 60000), 'minute');
    if (abs < 24 * HOUR) return rtf.format(Math.round(diff / HOUR), 'hour');
    if (abs < 7 * 24 * HOUR) return rtf.format(Math.round(diff / (24 * HOUR)), 'day');
    return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: 'short' }).format(new Date(ts));
  }

  function fullDate(ts) {
    return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(ts));
  }

  function hash(text) {
    let out = 2166136261;
    for (let i = 0; i < text.length; i++) {
      out ^= text.charCodeAt(i);
      out = Math.imul(out, 16777619);
    }
    return Math.abs(out);
  }

  /* Second stop stays dark enough for white initials (>= 4.5:1). */
  const AVATARS = [
    ['#a8482c', '#b05a3d'], ['#446b56', '#50775f'], ['#4e5c78', '#66769a'],
    ['#785c36', '#8a6a42'], ['#6a4f5c', '#8a6b79'], ['#37616b', '#4a7682']
  ];

  const catOf = (id) => CATS.find((c) => c.id === id) || CATS[0];
  const catName = (cat) => (lang() === 'en' ? cat.en : cat.de);

  function toast(message) {
    const box = document.getElementById('cm-toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-on');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => box.classList.remove('is-on'), 3200);
  }

  /* ---------- 2. State ---------- */
  function blankState() {
    return {
      v: 1,
      threads: [],
      replies: {},
      votes: {},
      saved: [],
      solved: {},
      hidden: [],
      hiddenPosts: [],
      member: null,
      profile: { name: '', handle: '' },
      draft: null,
      rate: { last: 0, count: 0, day: '' }
    };
  }

  const idOk = (value) => typeof value === 'string' && /^[a-z0-9_-]{2,40}$/i.test(value);
  /* Keys that would reach Object.prototype instead of the map. */
  const keyOk = (value) => idOk(value) && value !== '__proto__' && value !== 'constructor' && value !== 'prototype';
  const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');

  function validAuthor(author) {
    if (!author || typeof author !== 'object') return null;
    const name = clean(author.name, 40);
    if (name.length < 2) return null;
    const handle = clean(author.handle, 24).replace(/[^a-z0-9_.-]/gi, '').toLowerCase() || 'gast';
    return { name, handle, role: author.role === 'studio' ? 'studio' : 'member' };
  }

  function validPost(post, own) {
    if (!post || typeof post !== 'object') return null;
    const body = clean(post.body, MAX_BODY);
    if (body.length < 2) return null;
    const author = validAuthor(post.author);
    if (!author) return null;
    return {
      author,
      at: Number.isFinite(post.at) && post.at > 0 ? Math.min(post.at, Date.now() + HOUR) : Date.now(),
      body,
      own: Boolean(own)
    };
  }

  function loadState() {
    let raw;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (err) {
      return blankState();
    }
    if (!raw) return blankState();

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return blankState();
    }
    if (!data || typeof data !== 'object' || data.v !== 1) return blankState();

    const state = blankState();

    if (Array.isArray(data.threads)) {
      for (const item of data.threads.slice(0, MAX_THREADS)) {
        if (!item || typeof item !== 'object' || !idOk(item.id)) continue;
        const cat = CATS.find((c) => c.id === item.cat);
        if (!cat) continue;
        const title = clean(item.title, MAX_TITLE);
        const body = clean(item.body, MAX_BODY);
        if (title.length < MIN_TITLE || body.length < MIN_BODY) continue;
        const author = validAuthor(item.author);
        if (!author) continue;
        const tags = Array.isArray(item.tags)
          ? item.tags.slice(0, 3).map((tag) => clean(tag, 18)).filter(Boolean)
          : [];
        state.threads.push({
          id: item.id,
          cat: cat.id,
          title,
          body,
          tags,
          author,
          at: Number.isFinite(item.at) && item.at > 0 ? Math.min(item.at, Date.now() + HOUR) : Date.now(),
          views: 0,
          solved: Boolean(item.solved),
          user: true,
          replies: []
        });
      }
    }

    if (data.replies && typeof data.replies === 'object') {
      for (const key of Object.keys(data.replies)) {
        if (!keyOk(key)) continue;
        const list = data.replies[key];
        if (!Array.isArray(list)) continue;
        const posts = [];
        for (const item of list.slice(0, MAX_REPLIES)) {
          const post = validPost(item, true);
          if (post) posts.push(post);
        }
        if (posts.length) state.replies[key] = posts;
      }
    }

    if (data.votes && typeof data.votes === 'object') {
      for (const key of Object.keys(data.votes)) {
        if (keyOk(key) && (data.votes[key] === 1 || data.votes[key] === true)) state.votes[key] = 1;
      }
    }

    if (Array.isArray(data.saved)) {
      state.saved = data.saved.filter(idOk).slice(0, 100);
    }
    if (data.solved && typeof data.solved === 'object') {
      for (const key of Object.keys(data.solved)) {
        if (keyOk(key) && typeof data.solved[key] === 'boolean') state.solved[key] = data.solved[key];
      }
    }
    if (Array.isArray(data.hidden)) state.hidden = data.hidden.filter(idOk).slice(0, 100);
    if (Array.isArray(data.hiddenPosts)) {
      state.hiddenPosts = data.hiddenPosts.filter((key) => typeof key === 'string' && /^[a-z0-9_-]{2,40}#\d{1,3}$/i.test(key)).slice(0, 200);
    }

    if (data.member && typeof data.member === 'object' && (data.member.plan === 'developer' || data.member.plan === 'studio')) {
      state.member = {
        plan: data.member.plan,
        cycle: data.member.cycle === 'year' ? 'year' : 'month',
        since: Number.isFinite(data.member.since) ? data.member.since : Date.now(),
        renew: Number.isFinite(data.member.renew) ? data.member.renew : Date.now() + 30 * 24 * HOUR,
        name: clean(data.member.name, 60),
        email: clean(data.member.email, 120)
      };
    }

    if (data.profile && typeof data.profile === 'object') {
      state.profile.name = clean(data.profile.name, 40);
      state.profile.handle = clean(data.profile.handle, 24).replace(/[^a-z0-9_.-]/gi, '').toLowerCase();
    }

    if (data.draft && typeof data.draft === 'object') {
      const cat = CATS.find((c) => c.id === data.draft.cat);
      state.draft = {
        cat: cat ? cat.id : 'fragen',
        title: clean(data.draft.title, MAX_TITLE),
        tags: clean(data.draft.tags, 80),
        body: clean(data.draft.body, MAX_BODY),
        at: Number.isFinite(data.draft.at) ? data.draft.at : Date.now()
      };
    }

    if (data.rate && typeof data.rate === 'object') {
      state.rate.last = Number.isFinite(data.rate.last) ? data.rate.last : 0;
      state.rate.count = Number.isFinite(data.rate.count) ? Math.max(0, Math.min(999, data.rate.count)) : 0;
      state.rate.day = clean(data.rate.day, 10);
    }

    return state;
  }

  let state = loadState();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      toast(t('Speicher voll — Beitrag bleibt nur in dieser Sitzung.', 'Storage full — this post only lasts for this session.'));
    }
  }

  /* A tampered or outdated store is replaced once by its cleaned form, so a
     poisoned localStorage cannot feed junk into every later page load. */
  (function repairStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw && raw !== JSON.stringify(state)) save();
    } catch (err) { /* private mode: nothing to repair */ }
  })();

  /* ---------- 3. Data ---------- */
  function isMember() {
    return Boolean(state.member);
  }

  function canSee(thread) {
    return !thread.membersOnly || isMember();
  }

  function allThreads() {
    const list = [];
    for (const seed of SEED) {
      const replies = seed.replies.map((reply, index) => ({ ...reply, key: seed.id + '#' + (index + 1), floor: index + 2 }));
      const extra = (state.replies[seed.id] || []).map((reply, index) => ({
        ...reply, key: seed.id + '#' + (seed.replies.length + index + 1), floor: seed.replies.length + index + 2, own: true
      }));
      list.push({
        ...seed,
        replies: replies.concat(extra),
        solved: seed.id in state.solved ? state.solved[seed.id] : seed.solved,
        votes: (BASE_VOTES[seed.id] || 0) + (state.votes[seed.id] ? 1 : 0)
      });
    }
    for (const thread of state.threads) {
      const extra = (state.replies[thread.id] || []).map((reply, index) => ({
        ...reply, key: thread.id + '#' + (index + 1), floor: index + 2, own: true
      }));
      list.push({
        ...thread,
        title: { de: thread.title, en: thread.title },
        body: { de: thread.body, en: thread.body },
        replies: extra,
        solved: thread.id in state.solved ? state.solved[thread.id] : thread.solved,
        votes: state.votes[thread.id] ? 1 : 0
      });
    }
    return list.filter((thread) => !state.hidden.includes(thread.id));
  }

  const lastAt = (thread) => Math.max(thread.at, ...thread.replies.map((reply) => reply.at));

  function stats() {
    const threads = allThreads().filter(canSee);
    const replies = threads.reduce((sum, thread) => sum + thread.replies.length, 0);
    const solved = threads.filter((thread) => thread.solved).length;
    const people = new Set();
    for (const thread of threads) {
      if (thread.author.role !== 'studio') people.add(thread.author.handle);
      for (const reply of thread.replies) {
        if (reply.author.role !== 'studio') people.add(reply.author.handle);
      }
    }
    return { topics: threads.length, replies, solved, members: people.size };
  }

  const filter = { cat: 'all', q: '', sort: 'active', saved: false };

  function visibleThreads() {
    const query = filter.q.trim().toLowerCase();
    let list = allThreads();

    if (filter.cat !== 'all') list = list.filter((thread) => thread.cat === filter.cat);
    if (filter.saved) list = list.filter((thread) => state.saved.includes(thread.id));

    if (query) {
      list = list.filter((thread) => {
        const cat = catOf(thread.cat);
        const hay = [
          thread.title.de, thread.title.en, thread.body.de, thread.body.en,
          thread.author.name, thread.author.handle, cat.de, cat.en,
          ...(thread.tags || [])
        ].join(' ').toLowerCase();
        return hay.includes(query);
      });
    }

    if (filter.sort === 'new') list.sort((a, b) => b.at - a.at);
    else if (filter.sort === 'replies') list.sort((a, b) => b.replies.length - a.replies.length);
    else if (filter.sort === 'unsolved') list.sort((a, b) => Number(a.solved) - Number(b.solved) || lastAt(b) - lastAt(a));
    else list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (b.pinned && !a.pinned) return 1;
      return lastAt(b) - lastAt(a);
    });

    return list;
  }

  /* ---------- 4. Safe markdown ---------- */
  const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))/g;
  const SAFE_PROTOCOL = /^(?:https?:\/\/|mailto:)/i;

  function inlineInto(text, target) {
    let last = 0;
    let match;
    INLINE.lastIndex = 0;
    while ((match = INLINE.exec(text)) !== null) {
      if (match.index > last) target.append(document.createTextNode(text.slice(last, match.index)));
      const token = match[0];

      if (token.startsWith('**')) {
        target.append(h('strong', { text: token.slice(2, -2) }));
      } else if (token.startsWith('*')) {
        target.append(h('em', { text: token.slice(1, -1) }));
      } else if (token.startsWith('`')) {
        target.append(h('code', { text: token.slice(1, -1) }));
      } else {
        const split = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
        if (split && SAFE_PROTOCOL.test(split[2])) {
          target.append(h('a', {
            href: split[2],
            target: '_blank',
            rel: 'noopener noreferrer nofollow ugc',
            text: split[1]
          }));
        } else {
          target.append(document.createTextNode(token));
        }
      }
      last = match.index + token.length;
    }
    if (last < text.length) target.append(document.createTextNode(text.slice(last)));
  }

  function renderRich(text) {
    const frag = document.createDocumentFragment();
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) { i++; continue; }

      if (line.trim().startsWith('```')) {
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++;
        const pre = h('pre');
        const code = h('code', { text: codeLines.join('\n') });
        const copy = h('button', {
          type: 'button', class: 'cm-copy', text: t('Kopieren', 'Copy'), 'aria-label': t('Code kopieren', 'Copy code')
        });
        copy.addEventListener('click', () => {
          const value = code.textContent;
          const done = () => toast(t('Code kopiert.', 'Code copied.'));
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(done).catch(() => toast(t('Kopieren nicht erlaubt.', 'Copy not allowed.')));
          } else {
            toast(t('Kopieren nicht erlaubt.', 'Copy not allowed.'));
          }
        });
        pre.append(code, copy);
        frag.append(pre);
        continue;
      }

      if (/^###\s+/.test(line)) {
        frag.append(h('h4', { text: line.replace(/^###\s+/, '') }));
        i++;
        continue;
      }

      if (/^\s*[-*]\s+/.test(line)) {
        const ul = h('ul');
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          const li = h('li');
          inlineInto(lines[i].replace(/^\s*[-*]\s+/, ''), li);
          ul.append(li);
          i++;
        }
        frag.append(ul);
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const ol = h('ol');
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const li = h('li');
          inlineInto(lines[i].replace(/^\s*\d+\.\s+/, ''), li);
          ol.append(li);
          i++;
        }
        frag.append(ol);
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        const quote = h('blockquote');
        const inner = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          inner.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        inlineInto(inner.join(' '), quote);
        frag.append(quote);
        continue;
      }

      const para = h('p');
      const chunk = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('```') && !/^\s*(?:[-*]|\d+\.|>)\s+/.test(lines[i]) && !/^###\s+/.test(lines[i])) {
        chunk.push(lines[i]);
        i++;
      }
      chunk.forEach((part, index) => {
        if (index) para.append(h('br'));
        inlineInto(part, para);
      });
      frag.append(para);
    }

    return frag;
  }

  /* ---------- 5. List ---------- */
  const listEl = document.getElementById('cm-list');
  const threadEl = document.getElementById('cm-thread');

  function renderStats() {
    const data = stats();
    document.querySelectorAll('[data-cm-stat]').forEach((node) => {
      const key = node.dataset.cmStat;
      node.textContent = num(data[key] || 0);
    });
  }

  function renderChips() {
    const box = document.getElementById('cm-cat-chips');
    if (!box) return;
    box.replaceChildren();
    box.append(h('button', {
      type: 'button', class: 'cm-chip' + (filter.cat === 'all' ? ' is-active' : ''),
      'aria-pressed': filter.cat === 'all' ? 'true' : 'false',
      dataset: { cmCatFilter: 'all' },
      text: t('Alle', 'All')
    }));
    for (const cat of CATS) {
      const locked = cat.membersOnly && !isMember();
      const button = h('button', {
        type: 'button',
        class: 'cm-chip' + (filter.cat === cat.id ? ' is-active' : '') + (locked ? ' is-locked' : ''),
        'aria-pressed': filter.cat === cat.id ? 'true' : 'false',
        dataset: { cmCatFilter: cat.id },
        title: locked ? t('Nur mit Developer-Abo', 'Developer subscription only') : ''
      });
      button.append(h('i', { style: `--c:${cat.color}` }), document.createTextNode(catName(cat)));
      if (locked) button.append(icon('lock'));
      box.append(button);
    }
    document.querySelectorAll('.cm-stage-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.cmCat === filter.cat);
    });
  }

  function threadCard(thread) {
    const cat = catOf(thread.cat);
    const card = h('a', {
      class: 'cm-card',
      href: '#thread-' + encodeURIComponent(thread.id),
      style: `--c:${cat.color}`,
      dataset: { thread: thread.id }
    });

    const body = h('div', { class: 'cm-card-body' });
    const catLine = h('span', { class: 'cm-card-cat' }, h('i'), document.createTextNode(catName(cat)));
    if (thread.pinned) catLine.append(h('span', { class: 'cm-pin', text: t('ANGEPINNT', 'PINNED') }));

    const title = h('h3', { class: 'cm-card-title', text: lang() === 'en' ? thread.title.en : thread.title.de });
    const excerpt = h('p', {
      class: 'cm-card-ex',
      text: (lang() === 'en' ? thread.body.en : thread.body.de).replace(/```[\s\S]*?```/g, ' ').replace(/[#*`>-]/g, ' ').replace(/\s+/g, ' ').trim()
    });

    const tags = h('div', { class: 'cm-card-tags' });
    for (const tag of (thread.tags || []).slice(0, 3)) tags.append(h('span', { class: 'cm-tag', text: tag }));

    if (thread.membersOnly && !isMember()) {
      tags.append(h('span', { class: 'cm-tag cm-tag-lock' }, icon('lock'), document.createTextNode(t('Abo', 'Members'))));
    }

    body.append(catLine, title, excerpt, tags);

    const meta = h('div', { class: 'cm-card-meta' });
    meta.append(h('span', { class: 'cm-card-time', text: relTime(lastAt(thread)) }));
    const statsRow = h('div', { class: 'cm-card-stats' });
    statsRow.append(h('span', {}, icon('reply'), document.createTextNode(num(thread.replies.length))));
    statsRow.append(h('span', {}, icon('up'), document.createTextNode(num(thread.votes || 0))));
    if (thread.solved) statsRow.append(h('span', { class: 'cm-solved' }, icon('check'), document.createTextNode(t('gelöst', 'solved'))));
    meta.append(statsRow);

    card.append(h('span', { class: 'cm-ava' + (thread.author.role === 'studio' ? ' is-studio' : ''), style: avatarStyle(thread.author), 'aria-hidden': 'true', text: initials(thread.author) }), body, meta);
    return card;
  }

  function avatarStyle(author) {
    const pair = AVATARS[hash(author.handle) % AVATARS.length];
    return `--a1:${pair[0]};--a2:${pair[1]}`;
  }
  function initials(author) {
    return author.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }
  function avatar(author, size) {
    return h('span', {
      class: 'cm-ava' + (size ? ' is-' + size : '') + (author.role === 'studio' ? ' is-studio' : ''),
      style: avatarStyle(author),
      'aria-hidden': 'true',
      text: initials(author)
    });
  }

  function renderList() {
    if (!listEl) return;
    const list = visibleThreads();
    listEl.replaceChildren();

    if (!list.length) {
      const empty = h('div', { class: 'cm-empty' });
      empty.append(
        h('b', { text: filter.saved ? t('Noch nichts gemerkt.', 'Nothing saved yet.') : t('Kein Thema gefunden.', 'No topic found.') }),
        h('p', { text: filter.q ? t('Andere Suche oder Filter löschen — vielleicht ist die Frage schon beantwortet.', 'Try another search or clear the filters — the question may already be answered.') : t('Starte das erste Thema in dieser Kategorie.', 'Start the first topic in this category.') })
      );
      if (filter.cat === 'werkstatt' && !isMember()) {
        empty.append(h('button', { type: 'button', class: 'btn btn-primary btn-sm', dataset: { cmBuy: 'developer' }, text: t('Developer werden', 'Become a Developer') }));
      } else {
        empty.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', dataset: { cmNew: '' }, text: t('Frage stellen', 'Ask a question') }));
      }
      listEl.append(empty);
    } else {
      for (const thread of list) listEl.append(threadCard(thread));
    }

    const replies = list.reduce((sum, thread) => sum + thread.replies.length, 0);
    const count = document.getElementById('cm-count');
    if (count) count.textContent = t(
      `${num(list.length)} Themen · ${num(replies)} Antworten`,
      `${num(list.length)} topics · ${num(replies)} answers`
    );

    const clear = document.getElementById('cm-clear');
    if (clear) clear.hidden = filter.cat === 'all' && !filter.q && !filter.saved;

    const savedCount = document.querySelector('[data-cm-saved-count]');
    if (savedCount) savedCount.textContent = String(state.saved.length);

    renderStats();
  }

  /* ---------- 6. Thread ---------- */
  let currentThread = null;

  function postKey(threadId, index) {
    return threadId + '#' + index;
  }

  function openThread(id, opts) {
    const thread = allThreads().find((item) => item.id === id);
    if (!thread) {
      closeThread();
      toast(t('Dieses Thema gibt es nicht (mehr).', 'This topic does not exist (any more).'));
      return;
    }
    if (!canSee(thread)) {
      currentThread = thread;
      renderThread(thread);
      return;
    }
    currentThread = thread;
    if (listEl) listEl.hidden = true;
    if (threadEl) threadEl.hidden = false;
    renderThread(thread);
    if (!opts || !opts.silent) {
      const target = document.getElementById('forum');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function closeThread() {
    currentThread = null;
    if (threadEl) {
      threadEl.hidden = true;
      threadEl.replaceChildren();
    }
    if (listEl) listEl.hidden = false;
    renderList();
  }

  function postNode(thread, post, index) {
    const key = postKey(thread.id, index);
    if (state.hiddenPosts.includes(key)) {
      return h('p', { class: 'cm-deleted', text: t('Dieser Beitrag wurde gemeldet und lokal ausgeblendet.', 'This post was reported and is hidden locally.') });
    }
    const wrap = h('article', { class: 'cm-post' + (index > 1 ? ' is-answer' : ''), dataset: { post: key } });
    const head = h('header', { class: 'cm-post-head' });
    head.append(avatar(post.author, index === 1 ? 'is-large' : ''));

    const who = h('div', { class: 'cm-post-who' });
    const nameRow = h('div', { class: 'cm-post-name', text: post.author.name });
    if (post.author.role === 'studio') nameRow.append(h('span', { class: 'cm-badge is-studio', text: 'STUDIO' }));
    if (post.own && isMember()) nameRow.append(h('span', { class: 'cm-badge is-dev', text: state.member.plan === 'studio' ? 'STUDIO' : 'DEV' }));
    const meta = h('div', { class: 'cm-post-meta' });
    meta.append(document.createTextNode('@' + post.author.handle + ' · ' + relTime(post.at)));
    who.append(nameRow, meta);
    head.append(who, h('span', { class: 'cm-post-floor', text: '#' + (index + 1) }));

    const body = h('div', { class: 'cm-prose' });
    body.append(renderRich(post.body));

    const foot = h('div', { class: 'cm-post-foot' });
    if (index === 1) {
      const vote = h('button', {
        type: 'button',
        class: 'cm-vote' + (state.votes[thread.id] ? ' is-on' : ''),
        'aria-pressed': state.votes[thread.id] ? 'true' : 'false',
        dataset: { cmVote: thread.id }
      });
      vote.append(icon('up'), document.createTextNode(num(thread.votes || 0) + ' ' + t('hilfreich', 'helpful')));
      foot.append(vote);
    }

    if (thread.solved && index === 1) {
      foot.append(h('span', { class: 'cm-solved' }, icon('check'), document.createTextNode(t('als gelöst markiert', 'marked solved'))));
    }

    const own = post.own;
    if (own) {
      const del = h('button', { type: 'button', class: 'cm-icon-btn', dataset: { cmDeletePost: key }, 'aria-label': t('Beitrag löschen', 'Delete post') });
      del.append(icon('trash'), document.createTextNode(t('Löschen', 'Delete')));
      foot.append(del);
    } else if (index > 0) {
      const report = h('button', { type: 'button', class: 'cm-icon-btn', dataset: { cmReportPost: key }, 'aria-label': t('Beitrag melden', 'Report post') });
      report.append(icon('flag'), document.createTextNode(t('Melden', 'Report')));
      foot.append(report);
    }

    wrap.append(head, body, foot);
    return wrap;
  }

  function renderThread(thread) {
    if (!threadEl) return;
    threadEl.replaceChildren();
    const cat = catOf(thread.cat);

    const bar = h('div', { class: 'cm-thread-bar' });
    const back = h('button', { type: 'button', class: 'cm-back', dataset: { cmBack: '' } });
    back.append(icon('back'), document.createTextNode(t('Zurück zum Forum', 'Back to the forum')));
    const actions = h('div', { class: 'cm-thread-actions' });

    const saved = state.saved.includes(thread.id);
    const saveBtn = h('button', {
      type: 'button', class: 'cm-icon-btn' + (saved ? ' is-on' : ''),
      'aria-pressed': saved ? 'true' : 'false', dataset: { cmSave: thread.id }
    });
    saveBtn.append(icon('bookmark'), h('span', { text: t('Merken', 'Save') }));

    const solvedBtn = h('button', {
      type: 'button', class: 'cm-icon-btn' + (thread.solved ? ' is-on' : ''),
      'aria-pressed': thread.solved ? 'true' : 'false', dataset: { cmSolve: thread.id }
    });
    solvedBtn.append(icon('check'), h('span', { text: thread.solved ? t('Gelöst', 'Solved') : t('Lösen', 'Solve') }));

    actions.append(saveBtn, solvedBtn);
    if (!thread.pinned && thread.user) {
      const del = h('button', { type: 'button', class: 'cm-icon-btn', dataset: { cmDeleteThread: thread.id } });
      del.append(icon('trash'), h('span', { text: t('Löschen', 'Delete') }));
      actions.append(del);
    }
    bar.append(back, actions);

    const head = h('header', { class: 'cm-thread-head' });
    head.append(h('span', { class: 'cm-thread-cat' }, h('i', { style: `background:${cat.color}` }), document.createTextNode(catName(cat))));
    head.append(h('h2', { text: lang() === 'en' ? thread.title.en : thread.title.de }));

    const sub = h('div', { class: 'cm-thread-sub' });
    const author = h('span', { class: 'cm-author' });
    author.append(avatar(thread.author, 'is-small'), document.createTextNode(thread.author.name));
    sub.append(author);
    if (thread.author.role === 'studio') sub.append(h('span', { class: 'cm-badge is-studio', text: 'STUDIO' }));
    sub.append(h('span', { text: fullDate(thread.at) }));
    sub.append(h('span', { text: num(thread.views || 0) + ' ' + t('Aufrufe', 'views') }));
    sub.append(h('span', { text: num(thread.replies.length) + ' ' + t('Antworten', 'answers') }));
    for (const tag of (thread.tags || [])) sub.append(h('span', { class: 'cm-tag', text: tag }));
    head.append(sub);

    threadEl.append(bar, head);

    if (thread.membersOnly && !isMember()) {
      const lock = h('div', { class: 'cm-locked' });
      lock.append(
        h('span', { class: 'cm-locked-ico', html: ICONS.lock }),
        h('h3', { text: t('Dieses Brett gehört zur Werkstatt.', 'This board belongs to the workshop.') }),
        h('p', { text: t('Mit dem Developer-Abo siehst du alle Werkstatt-Themen, stellst eigene Fragen und bekommst ein Code-Review im Monat.', 'With the Developer subscription you see every workshop topic, can ask your own questions and get one code review a month.') })
      );
      const cta = h('div', { class: 'cm-locked-actions' });
      cta.append(
        h('button', { type: 'button', class: 'btn btn-primary', dataset: { cmBuy: 'developer' }, text: t('Developer werden', 'Become a Developer') }),
        h('a', { class: 'btn btn-ghost', href: '#abo', text: t('Pläne vergleichen', 'Compare plans') })
      );
      lock.append(cta);
      threadEl.append(lock);
      return;
    }

    threadEl.append(postNode(thread, { ...thread, body: lang() === 'en' ? thread.body.en : thread.body.de }, 0));
    let index = 1;
    for (const reply of thread.replies) {
      threadEl.append(postNode(thread, reply, index));
      index++;
    }

    if (thread.solved) {
      const banner = h('p', { class: 'cm-solved-banner' });
      banner.append(icon('check'), document.createTextNode(t('Dieses Thema ist als gelöst markiert.', 'This topic is marked as solved.')));
      threadEl.append(banner);
    }

    const composer = h('section', { class: 'cm-answer-composer' });
    composer.append(h('h3', { text: t('Antworten', 'Answer') }));

    if (!state.profile.name) {
      const nameField = h('label', { class: 'cm-field cm-answer-name' });
      nameField.append(h('span', { text: t('Dein Name', 'Your name') }), h('input', {
        type: 'text', id: 'cm-reply-name', maxlength: '40', autocomplete: 'nickname', placeholder: t('Wie sollen wir dich nennen?', 'What should we call you?')
      }));
      composer.append(nameField);
    }

    const area = h('textarea', {
      id: 'cm-reply-body', maxlength: String(MAX_BODY), rows: '4',
      placeholder: t('Was hast du probiert? Was hat geholfen?', 'What did you try? What helped?'),
      'aria-label': t('Antwort schreiben', 'Write an answer')
    });
    const foot = h('div', { class: 'cm-answer-foot' });
    const counter = h('small', { text: '0 / ' + MAX_BODY });
    area.addEventListener('input', () => { counter.textContent = area.value.length + ' / ' + MAX_BODY; });
    const send = h('button', { type: 'button', class: 'btn btn-primary', dataset: { cmReply: thread.id }, text: t('Antwort senden', 'Send answer') });
    foot.append(counter, send);
    composer.append(area, foot);
    threadEl.append(composer);

    if (state.profile.name) {
      const hint = h('p', { class: 'cm-reply-as' });
      hint.append(document.createTextNode(t('Du antwortest als ', 'You are answering as ') + state.profile.name + '.'));
      const change = h('button', { type: 'button', class: 'cm-clear', dataset: { cmChangeName: '' }, text: t('Ändern', 'Change') });
      hint.append(change);
      threadEl.insertBefore(hint, composer);
    }
  }

  /* ---------- 7. Composer ---------- */
  const composer = document.getElementById('cm-composer');
  const composerForm = document.getElementById('cm-composer-form');
  let lastFocus = null;

  function populateCatSelect() {
    const select = document.getElementById('cm-cat');
    if (!select) return;
    const current = select.value || (filter.cat !== 'all' ? filter.cat : 'fragen');
    select.replaceChildren();
    for (const cat of CATS) {
      const locked = cat.membersOnly && !isMember();
      select.append(h('option', {
        value: cat.id,
        text: catName(cat) + (locked ? ' · ' + t('Abo nötig', 'subscription') : '')
      }));
    }
    select.value = CATS.some((cat) => cat.id === current) ? current : 'fragen';
  }

  function counterFor(input, target) {
    const out = document.querySelector(`.cm-counter[data-for="${target}"]`);
    if (!out) return;
    const max = Number(input.getAttribute('maxlength')) || 0;
    const update = () => {
      out.textContent = input.value.length + ' / ' + max;
      out.classList.toggle('is-warn', input.value.length > max * 0.9);
    };
    input.addEventListener('input', update);
    update();
  }

  function openComposer() {
    if (!composer) return;
    lastFocus = document.activeElement;
    populateCatSelect();

    const hp = document.getElementById('cm-hp');
    if (hp) hp.value = '';

    const nameInput = document.getElementById('cm-name');
    if (nameInput) nameInput.value = state.profile.name || (state.member && state.member.name) || '';

    if (state.draft) {
      const cat = document.getElementById('cm-cat');
      const title = document.getElementById('cm-title');
      const tags = document.getElementById('cm-tags');
      const body = document.getElementById('cm-body');
      if (cat) cat.value = state.draft.cat;
      if (title && !title.value) title.value = state.draft.title;
      if (tags && !tags.value) tags.value = state.draft.tags;
      if (body && !body.value) body.value = state.draft.body;
    }

    const err = document.getElementById('cm-err');
    if (err) err.textContent = '';
    const preview = document.getElementById('cm-preview');
    if (preview) { preview.hidden = true; preview.replaceChildren(); }
    const toggle = document.querySelector('[data-cm-preview-toggle]');
    if (toggle) toggle.setAttribute('aria-pressed', 'false');
    const bodyEl = document.getElementById('cm-body');
    if (bodyEl) bodyEl.hidden = false;

    if (!composer.open) composer.showModal();
    const title = document.getElementById('cm-title');
    if (title) setTimeout(() => title.focus(), 60);
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function collectDraft() {
    return {
      cat: (document.getElementById('cm-cat') || {}).value || 'fragen',
      title: clean((document.getElementById('cm-title') || {}).value, MAX_TITLE),
      tags: clean((document.getElementById('cm-tags') || {}).value, 80),
      body: clean((document.getElementById('cm-body') || {}).value, MAX_BODY),
      at: Date.now()
    };
  }

  function parseTags(raw) {
    return raw.split(/[,\s]+/).map((tag) => clean(tag.replace(/^#/, ''), 18)).filter(Boolean).slice(0, 3);
  }

  function canPost() {
    const today = new Date().toISOString().slice(0, 10);
    if (state.rate.day !== today) {
      state.rate.day = today;
      state.rate.count = 0;
    }
    if (state.rate.count >= POSTS_PER_DAY) {
      return { ok: false, message: t('Tageslimit erreicht. Morgen wieder — oder im echten Forum nach dem Login.', 'Daily limit reached. Come back tomorrow — or use the real forum after signing in.') };
    }
    const wait = POST_COOLDOWN - (Date.now() - state.rate.last);
    if (wait > 0) {
      return { ok: false, message: t(`Bitte ${Math.ceil(wait / 1000)} Sekunden warten.`, `Please wait ${Math.ceil(wait / 1000)} seconds.`) };
    }
    return { ok: true };
  }

  function markPosted() {
    state.rate.last = Date.now();
    state.rate.count += 1;
    state.rate.day = new Date().toISOString().slice(0, 10);
  }

  function submitThread(event) {
    event.preventDefault();
    const err = document.getElementById('cm-err');
    const honeypot = document.getElementById('cm-hp');
    if (honeypot && honeypot.value.trim()) {
      honeypot.value = '';
      closeDialog(composer);
      toast(t('Danke, Thema veröffentlicht.', 'Thanks, topic published.'));
      return;
    }

    const draft = collectDraft();
    const nameInput = document.getElementById('cm-name');
    const name = clean(nameInput ? nameInput.value : '', 40);
    const cat = CATS.find((item) => item.id === draft.cat);
    const tags = parseTags(draft.tags);

    let problem = '';
    if (name.length < 2) problem = t('Bitte einen Namen mit mindestens 2 Zeichen angeben.', 'Please enter a name with at least 2 characters.');
    else if (!cat) problem = t('Bitte eine Kategorie wählen.', 'Please choose a category.');
    else if (cat.membersOnly && !isMember()) problem = t('Die Werkstatt ist dem Developer-Abo vorbehalten.', 'The workshop is reserved for Developer subscribers.');
    else if (draft.title.length < MIN_TITLE) problem = t('Der Titel braucht mindestens 8 Zeichen.', 'The title needs at least 8 characters.');
    else if (draft.body.length < MIN_BODY) problem = t('Der Beitrag braucht mindestens 20 Zeichen.', 'The post needs at least 20 characters.');

    const limit = canPost();
    if (!problem && !limit.ok) problem = limit.message;

    if (problem) {
      if (err) err.textContent = problem;
      return;
    }

    const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.profile.name = name;
    if (!state.profile.handle) {
      state.profile.handle = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 20) || 'gast';
    }

    state.threads.unshift({
      id,
      cat: cat.id,
      title: draft.title,
      body: draft.body,
      tags,
      author: { name: state.profile.name, handle: state.profile.handle, role: 'member' },
      at: Date.now(),
      views: 0,
      solved: false,
      user: true
    });

    state.draft = null;
    markPosted();
    save();
    closeDialog(composer);
    composerForm.reset();
    filter.cat = cat.id;
    filter.q = '';
    filter.saved = false;
    renderChips();
    renderList();
    location.hash = 'thread-' + id;
    toast(t('Thema veröffentlicht.', 'Topic published.'));
  }

  function submitReply(threadId) {
    const thread = allThreads().find((item) => item.id === threadId);
    if (!thread) return;
    if (thread.membersOnly && !isMember()) {
      toast(t('Die Werkstatt braucht das Developer-Abo.', 'The workshop requires the Developer subscription.'));
      return;
    }
    const area = document.getElementById('cm-reply-body');
    const nameField = document.getElementById('cm-reply-name');
    const body = clean(area ? area.value : '', MAX_BODY);
    const name = clean(nameField ? nameField.value : state.profile.name, 40);

    let problem = '';
    if (body.length < 5) problem = t('Eine Antwort braucht mindestens 5 Zeichen.', 'An answer needs at least 5 characters.');
    else if (name.length < 2 && !state.profile.name) problem = t('Bitte einen Namen angeben.', 'Please enter a name.');

    const limit = canPost();
    if (!problem && !limit.ok) problem = limit.message;
    if (problem) { toast(problem); return; }

    if (name.length >= 2) {
      state.profile.name = name;
      if (!state.profile.handle) {
        state.profile.handle = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 20) || 'gast';
      }
    }

    if (!state.replies[threadId]) state.replies[threadId] = [];
    if (state.replies[threadId].length >= MAX_REPLIES) {
      toast(t('Dieses Thema hat das Antwortlimit erreicht.', 'This topic has reached its answer limit.'));
      return;
    }

    state.replies[threadId].push({
      author: { name: state.profile.name, handle: state.profile.handle || 'gast', role: 'member' },
      at: Date.now(),
      body
    });

    markPosted();
    save();
    const refreshed = allThreads().find((item) => item.id === threadId);
    if (refreshed) renderThread(refreshed);
    renderList();
    renderSidebar();
    toast(t('Antwort veröffentlicht.', 'Answer published.'));
  }

  function deleteOwn(kind, data) {
    if (kind === 'thread') {
      const thread = state.threads.find((item) => item.id === data);
      if (!thread) return;
      if (!window.confirm(t('Dieses Thema wirklich löschen?', 'Really delete this topic?'))) return;
      state.threads = state.threads.filter((item) => item.id !== data);
      delete state.replies[data];
      save();
      history.replaceState(null, '', location.pathname + location.search);
      closeThread();
      renderSidebar();
      toast(t('Thema gelöscht.', 'Topic deleted.'));
    } else {
      const [threadId, indexRaw] = String(data).split('#');
      const index = Number(indexRaw);
      const list = state.replies[threadId] || [];
      if (!Array.isArray(list) || !Number.isInteger(index)) return;
      if (!window.confirm(t('Diese Antwort wirklich löschen?', 'Really delete this answer?'))) return;
      const offset = index - 1 - (SEED.find((item) => item.id === threadId) || { replies: [] }).replies.length;
      if (offset >= 0 && offset < list.length) list.splice(offset, 1);
      save();
      const thread = allThreads().find((item) => item.id === threadId);
      if (thread) renderThread(thread);
      renderList();
      toast(t('Antwort gelöscht.', 'Answer deleted.'));
    }
  }

  /* ---------- 8. Membership ---------- */
  const checkout = document.getElementById('cm-checkout');
  let pendingPlan = null;
  let billingCycle = 'month';
  const PRICES = { developer: { month: 19, year: 190 }, studio: { month: 49, year: 490 } };

  function priceLabel(plan) {
    return num(PRICES[plan][billingCycle]) + '\u00A0€';
  }

  function updatePrices() {
    document.querySelectorAll('.cm-plan').forEach((card, index) => {
      const plan = index === 1 ? 'developer' : index === 2 ? 'studio' : null;
      if (!plan) return;
      const value = card.querySelector('[data-price-month]');
      if (value) value.textContent = priceLabel(plan);
    });
    document.querySelectorAll('[data-cycle-label]').forEach((node) => {
      node.textContent = billingCycle === 'year' ? t('pro Jahr', 'per year') : t('pro Monat', 'per month');
    });
  }

  function openCheckout(plan) {
    if (!checkout || !PRICES[plan]) return;
    pendingPlan = plan;
    const planName = plan === 'developer' ? 'Developer' : 'Studio';
    const planEl = document.getElementById('cm-co-plan');
    const priceEl = document.getElementById('cm-co-price');
    const cycleEl = document.getElementById('cm-co-cycle');
    if (planEl) planEl.textContent = planName;
    if (priceEl) priceEl.textContent = priceLabel(plan);
    if (cycleEl) cycleEl.textContent = billingCycle === 'year' ? t('jährlich, jederzeit kündbar', 'yearly, cancel anytime') : t('monatlich, jederzeit kündbar', 'monthly, cancel anytime');
    const err = document.getElementById('cm-co-err');
    if (err) err.textContent = '';
    lastFocus = document.activeElement;
    if (checkout.open) checkout.close();
    checkout.showModal();
    const name = document.getElementById('cm-co-name');
    if (name) {
      name.value = state.profile.name || '';
      setTimeout(() => name.focus(), 60);
    }
  }

  function activateMembership(event) {
    event.preventDefault();
    const err = document.getElementById('cm-co-err');
    const name = clean((document.getElementById('cm-co-name') || {}).value, 60);
    const email = clean((document.getElementById('cm-co-mail') || {}).value, 120);
    const terms = document.getElementById('cm-co-terms');

    let problem = '';
    if (name.length < 2) problem = t('Bitte einen Namen angeben.', 'Please enter a name.');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problem = t('Bitte eine gültige E-Mail-Adresse angeben.', 'Please enter a valid e-mail address.');
    else if (!terms || !terms.checked) problem = t('Bitte AGB und Datenschutz bestätigen.', 'Please accept the terms and privacy policy.');
    if (problem) { if (err) err.textContent = problem; return; }

    const days = billingCycle === 'year' ? 365 : 30;
    state.member = {
      plan: pendingPlan,
      cycle: billingCycle,
      since: Date.now(),
      renew: Date.now() + days * 24 * HOUR,
      name,
      email
    };
    state.profile.name = state.profile.name || name;
    save();
    closeDialog(checkout);
    renderAll();
    const planName = pendingPlan === 'developer' ? 'Developer' : 'Studio';
    toast(t(`${planName}-Abo aktiviert. Die Werkstatt ist offen.`, `${planName} subscription active. The workshop is open.`));
  }

  function renderMemberWidget() {
    const box = document.getElementById('cm-member-body');
    if (!box) return;
    box.replaceChildren();

    if (state.member) {
      const planName = state.member.plan === 'developer' ? 'Developer' : 'Studio';
      const plan = h('div', { class: 'cm-member-plan' });
      plan.append(h('b', { text: planName }), h('span', { class: 'cm-badge is-dev', text: 'DEV' }));
      box.append(plan);
      box.append(h('p', { text: t('Werkstatt offen, Abzeichen aktiv. Danke für die Unterstützung.', 'Workshop open, badge active. Thanks for the support.') }));
      const manage = h('button', { type: 'button', class: 'btn btn-ghost', dataset: { cmManage: '' }, text: t('Abo verwalten', 'Manage subscription') });
      box.append(manage);
      box.append(h('span', { class: 'cm-member-since', text: t('Verlängert am ', 'Renews on ') + fullDate(state.member.renew) }));
    } else {
      const plan = h('div', { class: 'cm-member-plan' });
      plan.append(h('b', { text: 'Gast' }));
      box.append(plan);
      box.append(h('p', { text: t('Das offene Brett ist frei. Die Werkstatt und Code-Reviews öffnen mit dem Developer-Abo.', 'The open board is free. The workshop and code reviews open with the Developer subscription.') }));
      box.append(h('button', { type: 'button', class: 'btn btn-primary', dataset: { cmBuy: 'developer' }, text: t('Developer werden · ', 'Become a Developer · ') + priceLabel('developer') }));
      box.append(h('a', { class: 'cm-textlink', href: '#abo', text: t('Alle Pläne ansehen →', 'See all plans →') }));
    }
  }

  function openManage() {
    const dialog = document.getElementById('cm-manage');
    const body = document.getElementById('cm-manage-body');
    if (!dialog || !body) return;
    body.replaceChildren();
    if (!state.member) {
      body.append(h('p', { text: t('Kein Abo aktiv.', 'No active subscription.') }));
      dialog.showModal();
      return;
    }
    const planName = state.member.plan === 'developer' ? 'Developer' : 'Studio';
    const card = h('div', { class: 'cm-manage-plan' });
    card.append(h('b', { text: planName }), h('p', { text: t('Aktiv seit ', 'Active since ') + fullDate(state.member.since) }));
    body.append(card);

    const rows = [
      [t('Abrechnung', 'Billing'), billingCycle === 'year' ? t('jährlich', 'yearly') : t('monatlich', 'monthly')],
      [t('Nächste Verlängerung', 'Next renewal'), fullDate(state.member.renew)],
      [t('Preis', 'Price'), priceLabel(state.member.plan) + (state.member.cycle === 'year' ? t(' / Jahr', ' / year') : t(' / Monat', ' / month'))],
      [t('E-Mail', 'E-mail'), state.member.email || '—']
    ];
    for (const [label, value] of rows) {
      body.append(h('div', { class: 'cm-manage-row' }, h('span', { text: label }), h('span', { text: value })));
    }

    const actions = h('div', { class: 'cm-manage-actions' });
    if (state.member.plan === 'developer') {
      actions.append(h('button', { type: 'button', class: 'btn btn-ghost', dataset: { cmSwitch: 'studio' }, text: t('Auf Studio wechseln', 'Switch to Studio') }));
    } else {
      actions.append(h('button', { type: 'button', class: 'btn btn-ghost', dataset: { cmSwitch: 'developer' }, text: t('Auf Developer wechseln', 'Switch to Developer') }));
    }
    actions.append(h('button', { type: 'button', class: 'btn btn-ghost cm-danger', dataset: { cmCancel: '' }, text: t('Abo beenden', 'Cancel subscription') }));
    body.append(actions, h('p', { class: 'cm-fineprint', text: t('Vorschau: Änderungen gelten sofort und nur in diesem Browser.', 'Preview: changes apply immediately and only in this browser.') }));

    if (!dialog.open) dialog.showModal();
  }

  function switchPlan(plan) {
    if (!state.member || !PRICES[plan]) return;
    state.member.plan = plan;
    state.member.cycle = billingCycle;
    state.member.renew = Date.now() + (billingCycle === 'year' ? 365 : 30) * 24 * HOUR;
    save();
    const dialog = document.getElementById('cm-manage');
    if (dialog && dialog.open) dialog.close();
    renderAll();
    toast(t('Plan gewechselt.', 'Plan changed.'));
  }

  function cancelMembership() {
    if (!state.member) return;
    if (!window.confirm(t('Abo wirklich beenden? Die Werkstatt wird wieder gesperrt.', 'Really cancel? The workshop will be locked again.'))) return;
    state.member = null;
    save();
    const dialog = document.getElementById('cm-manage');
    if (dialog && dialog.open) dialog.close();
    if (currentThread && currentThread.membersOnly) {
      history.replaceState(null, '', location.pathname + location.search);
      closeThread();
    }
    renderAll();
    toast(t('Abo beendet. Das offene Forum bleibt offen.', 'Subscription ended. The open forum stays open.'));
  }

  /* ---------- 9. Sidebar ---------- */
  function renderSidebar() {
    renderMemberWidget();

    const data = stats();
    const heatNote = document.getElementById('cm-heat-note');
    if (heatNote) heatNote.textContent = t(`${num(data.replies + data.topics)} Beiträge in 12 Wochen`, `${num(data.replies + data.topics)} posts in 12 weeks`);

    const heat = document.getElementById('cm-heat');
    if (heat) {
      heat.replaceChildren();
      const days = 12 * 7;
      const counts = new Array(days).fill(0);
      const stamp = (ts) => {
        const diff = Math.floor((Date.now() - ts) / (24 * HOUR));
        return diff >= 0 && diff < days ? days - 1 - diff : -1;
      };
      for (const thread of allThreads().filter(canSee)) {
        const d1 = stamp(thread.at);
        if (d1 >= 0) counts[d1]++;
        for (const reply of thread.replies) {
          const d2 = stamp(reply.at);
          if (d2 >= 0) counts[d2]++;
        }
      }
      const max = Math.max(1, ...counts);
      for (let w = 0; w < 12; w++) {
        for (let d = 0; d < 7; d++) {
          const value = counts[w * 7 + d] || 0;
          const level = value === 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4));
          heat.append(h('i', { class: level ? 'l' + level : '', title: `${value} ${t('Beiträge', 'posts')}` }));
        }
      }
    }

    const people = document.getElementById('cm-people');
    if (people) {
      people.replaceChildren();
      const scores = new Map();
      for (const thread of allThreads().filter(canSee)) {
        for (const post of [thread, ...thread.replies]) {
          if (post.author.role === 'studio') continue;
          const key = post.author.handle;
          const entry = scores.get(key) || { author: post.author, count: 0 };
          entry.count++;
          scores.set(key, entry);
        }
      }
      const top = [...scores.values()].sort((a, b) => b.count - a.count).slice(0, 3);
      for (const entry of top) {
        const li = h('li');
        const text = h('span', {}, h('b', { text: entry.author.name }));
        li.append(avatar(entry.author, 'is-small'), text, h('small', { text: num(entry.count) + ' ' + t('Beiträge', 'posts') }));
        people.append(li);
      }
    }

    const savedCount = document.querySelector('[data-cm-saved-count]');
    if (savedCount) savedCount.textContent = String(state.saved.length);

    renderStats();
  }

  /* ---------- 10. Self-test ---------- */
  const PAYLOADS = [
    { name: 'IMG onerror', value: '<img src=x onerror=alert(1)>' },
    { name: 'SCRIPT tag', value: '<script>alert(1)</script>' },
    { name: 'javascript: link', value: '[Klick](javascript:alert(1))' },
    { name: 'IFRAME', value: '<iframe src="https://example.com"></iframe>' },
    { name: 'data: link', value: '<a href="data:text/html,<script>alert(1)</script>">x</a>' },
    { name: 'SVG onload', value: '<svg onload=alert(1)></svg>' },
    { name: 'STYLE injection', value: '<style>*{display:none}</style>' }
  ];

  function runSelfTest() {
    const list = document.getElementById('cm-st-list');
    if (!list) return;
    list.replaceChildren();
    let passed = 0;

    for (const payload of PAYLOADS) {
      const root = document.createElement('div');
      root.append(renderRich(payload.value));

      const dangerous = root.querySelector('script, iframe, img, svg, style, object, embed, link, meta');
      const handlers = [...root.querySelectorAll('*')].some((node) =>
        [...node.attributes].some((attr) => /^on/i.test(attr.name))
      );
      const badHref = [...root.querySelectorAll('a')].some((a) => {
        const href = (a.getAttribute('href') || '').trim();
        return /^javascript:/i.test(href) || /^data:/i.test(href);
      });
      const preserved = root.textContent.length > 0;
      const ok = !dangerous && !handlers && !badHref && preserved;
      if (ok) passed++;

      const row = h('li');
      row.append(
        h('span', { class: 'cm-st-dot' + (ok ? '' : ' fail'), text: ok ? '✓' : '!' }),
        h('span', { class: 'cm-st-name', text: payload.name }),
        h('code', { class: 'cm-st-payload', text: payload.value }),
        h('span', { class: 'cm-st-verdict' + (ok ? '' : ' fail'), text: ok ? t('abgewehrt', 'blocked') : t('offen', 'open') })
      );
      list.append(row);
    }

    const summary = h('li', { class: 'cm-st-idle' });
    summary.textContent = t(
      `${passed} von ${PAYLOADS.length} Angriffen abgewehrt.`,
      `${passed} of ${PAYLOADS.length} attacks blocked.`
    );
    summary.style.fontWeight = '600';
    summary.style.color = passed === PAYLOADS.length ? '#3f6451' : '#963f2a';
    list.append(summary);
  }

  /* ---------- 11. Wiring ---------- */
  function renderAll() {
    populateCatSelect();
    renderChips();
    renderList();
    renderSidebar();
    if (currentThread) {
      const fresh = allThreads().find((item) => item.id === currentThread.id);
      if (fresh) renderThread(fresh);
      else closeThread();
    }
  }

  function route() {
    const match = location.hash.match(/^#thread-([a-z0-9_-]{2,40})$/i);
    if (match) {
      openThread(decodeURIComponent(match[1]), { silent: false });
    } else if (currentThread) {
      closeThread();
    }
  }

  function debounce(fn, wait) {
    let timer = 0;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const saveDraft = debounce(() => {
    const draft = collectDraft();
    if (!draft.title && !draft.body) return;
    state.draft = draft;
    save();
    const note = document.getElementById('cm-draft');
    if (note) note.textContent = t('Entwurf gespeichert · ', 'Draft saved · ') + new Date().toLocaleTimeString(lang() === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
  }, 500);

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-cm-cat], [data-cm-new], [data-cm-close], [data-cm-back], [data-cm-save], [data-cm-vote], [data-cm-solve], [data-cm-save], [data-cm-buy], [data-cm-manage], [data-cm-cancel], [data-cm-switch], [data-cm-reply], [data-cm-cat-filter], [data-cm-join-free], [data-cm-report-post], [data-cm-delete-post], [data-cm-delete-thread], [data-cm-change-name], [data-cycle], [data-cm-selftest-btn], [data-md], [data-cm-share]');
    if (!target) return;

    if (target.matches('[data-cm-cat]')) {
      const cat = target.dataset.cmCat;
      filter.cat = cat === filter.cat ? 'all' : cat;
      filter.q = '';
      const input = document.getElementById('cm-q');
      if (input) input.value = '';
      renderChips();
      renderList();
      document.querySelectorAll('.cm-stage-chip').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.cmCat === filter.cat));
      document.getElementById('forum').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (target.matches('[data-cm-cat-filter]')) {
      filter.cat = target.dataset.cmCatFilter;
      filter.saved = false;
      document.getElementById('cm-saved-filter').setAttribute('aria-pressed', 'false');
      renderChips();
      renderList();
      return;
    }

    if (target.matches('[data-cm-new]')) {
      openComposer();
      return;
    }

    if (target.matches('[data-cm-close]')) {
      closeDialog(target.closest('dialog'));
      return;
    }

    if (target.matches('[data-cm-back]')) {
      history.pushState(null, '', location.pathname + location.search);
      closeThread();
      document.getElementById('forum').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (target.matches('[data-cm-save]')) {
      const id = target.dataset.cmSave;
      const index = state.saved.indexOf(id);
      if (index >= 0) state.saved.splice(index, 1);
      else state.saved.push(id);
      save();
      const saved = state.saved.includes(id);
      target.classList.toggle('is-on', saved);
      target.setAttribute('aria-pressed', saved ? 'true' : 'false');
      renderSidebar();
      const badge = document.querySelector('[data-cm-saved-count]');
      if (badge) badge.textContent = String(state.saved.length);
      toast(saved ? t('Thema gemerkt.', 'Topic saved.') : t('Lesezeichen entfernt.', 'Bookmark removed.'));
      return;
    }

    if (target.matches('[data-cm-vote]')) {
      const id = target.dataset.cmVote;
      if (state.votes[id]) delete state.votes[id];
      else state.votes[id] = 1;
      save();
      const thread = allThreads().find((item) => item.id === id);
      if (thread) renderThread(thread);
      renderList();
      toast(state.votes[id] ? t('Danke für das Signal.', 'Thanks for the signal.') : t('Stimme zurückgenommen.', 'Vote withdrawn.'));
      return;
    }

    if (target.matches('[data-cm-solve]')) {
      const id = target.dataset.cmSolve;
      const thread = allThreads().find((item) => item.id === id);
      if (!thread) return;
      state.solved[id] = !thread.solved;
      save();
      renderThread({ ...thread, solved: state.solved[id] });
      renderList();
      toast(state.solved[id] ? t('Als gelöst markiert.', 'Marked as solved.') : t('Gelöst-Marke entfernt.', 'Solved mark removed.'));
      return;
    }

    if (target.matches('[data-cm-buy]')) {
      openCheckout(target.dataset.cmBuy);
      return;
    }

    if (target.matches('[data-cm-manage]')) {
      openManage();
      return;
    }

    if (target.matches('[data-cm-cancel]')) {
      cancelMembership();
      return;
    }

    if (target.matches('[data-cm-switch]')) {
      switchPlan(target.dataset.cmSwitch);
      return;
    }

    if (target.matches('[data-cm-reply]')) {
      submitReply(target.dataset.cmReply);
      return;
    }

    if (target.matches('[data-cm-join-free]')) {
      openComposer();
      return;
    }

    if (target.matches('[data-cm-report-post]')) {
      const key = target.dataset.cmReportPost;
      if (!state.hiddenPosts.includes(key)) state.hiddenPosts.push(key);
      save();
      const thread = allThreads().find((item) => item.id === currentThread.id);
      if (thread) renderThread(thread);
      toast(t('Danke, der Beitrag ist lokal ausgeblendet.', 'Thanks, the post is hidden locally.'));
      return;
    }

    if (target.matches('[data-cm-delete-post]')) {
      deleteOwn('post', target.dataset.cmDeletePost);
      return;
    }

    if (target.matches('[data-cm-delete-thread]')) {
      deleteOwn('thread', target.dataset.cmDeleteThread);
      return;
    }

    if (target.matches('[data-cm-change-name]')) {
      state.profile.name = '';
      save();
      if (currentThread) renderThread(currentThread);
      return;
    }

    if (target.matches('[data-cycle]')) {
      billingCycle = target.dataset.cycle === 'year' ? 'year' : 'month';
      document.querySelectorAll('[data-cycle]').forEach((button) => {
        button.setAttribute('aria-pressed', button.dataset.cycle === billingCycle ? 'true' : 'false');
      });
      updatePrices();
      return;
    }

    if (target.matches('[data-cm-selftest-btn]')) {
      runSelfTest();
      return;
    }

    if (target.matches('[data-cm-share="copy"]')) {
      const url = 'https://bytewerkstudio.com/community.html';
      const done = () => {
        target.classList.add('is-done');
        const label = target.querySelector('span');
        if (label) label.textContent = t('Link kopiert', 'Link copied');
        const note = document.querySelector('[data-cm-share-note]');
        if (note) note.textContent = t('Der Link liegt in der Zwischenablage.', 'The link is on your clipboard.');
        setTimeout(() => {
          target.classList.remove('is-done');
          if (label) label.textContent = t('Link kopieren', 'Copy link');
          if (note) note.textContent = t('Nur der Seitenlink wird geteilt. Keine Tracking-Parameter.', 'Only the page link is shared. No tracking parameters.');
        }, 2600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => {
          toast(t('Kopieren nicht erlaubt — Link: ', 'Copy not allowed — link: ') + url);
        });
      } else {
        toast(t('Kopieren nicht erlaubt — Link: ', 'Copy not allowed — link: ') + url);
      }
      return;
    }

    if (target.matches('[data-md]')) {
      const area = document.getElementById('cm-body');
      if (!area) return;
      const mode = target.dataset.md;
      const start = area.selectionStart;
      const end = area.selectionEnd;
      const value = area.value;
      const selected = value.slice(start, end) || t('Text', 'text');
      let insert = selected;
      if (mode === 'bold') insert = '**' + selected + '**';
      if (mode === 'italic') insert = '*' + selected + '*';
      if (mode === 'code') insert = selected.includes('\n') ? '```\n' + selected + '\n```' : '`' + selected + '`';
      if (mode === 'link') insert = '[' + selected + '](https://)';
      area.value = value.slice(0, start) + insert + value.slice(end);
      area.focus();
      area.selectionStart = area.selectionEnd = start + insert.length;
      area.dispatchEvent(new Event('input'));
      return;
    }
  });

  if (composerForm) {
    composerForm.addEventListener('submit', submitThread);
    ['cm-title', 'cm-tags', 'cm-body'].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('input', saveDraft);
      counterFor(input, id);
    });
  }

  const previewToggle = document.querySelector('[data-cm-preview-toggle]');
  if (previewToggle) {
    previewToggle.addEventListener('click', () => {
      const area = document.getElementById('cm-body');
      const preview = document.getElementById('cm-preview');
      if (!area || !preview) return;
      const open = previewToggle.getAttribute('aria-pressed') !== 'true';
      previewToggle.setAttribute('aria-pressed', open ? 'true' : 'false');
      preview.hidden = !open;
      area.hidden = open;
      if (open) {
        preview.replaceChildren(renderRich(area.value || t('Nichts zu zeigen.', 'Nothing to preview.')));
      }
    });
  }

  const searchInput = document.getElementById('cm-q');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      filter.q = searchInput.value;
      filter.saved = false;
      document.getElementById('cm-saved-filter').setAttribute('aria-pressed', 'false');
      renderList();
    }, 140));
  }

  const sortSelect = document.getElementById('cm-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      filter.sort = sortSelect.value;
      renderList();
    });
  }

  const savedFilter = document.getElementById('cm-saved-filter');
  if (savedFilter) {
    savedFilter.addEventListener('click', () => {
      filter.saved = !filter.saved;
      savedFilter.setAttribute('aria-pressed', filter.saved ? 'true' : 'false');
      renderList();
    });
  }

  const clear = document.getElementById('cm-clear');
  if (clear) {
    clear.addEventListener('click', () => {
      filter.cat = 'all';
      filter.q = '';
      filter.saved = false;
      if (searchInput) searchInput.value = '';
      if (savedFilter) savedFilter.setAttribute('aria-pressed', 'false');
      renderChips();
      renderList();
    });
  }

  const checkoutForm = document.getElementById('cm-checkout-form');
  if (checkoutForm) checkoutForm.addEventListener('submit', activateMembership);

  const styleBtn = document.getElementById('cm-selftest-btn');
  if (styleBtn) styleBtn.addEventListener('click', runSelfTest);

  window.addEventListener('hashchange', route);
  document.addEventListener('bw:lang', () => {
    document.title = t('Community & Forum — Bytewerk Studio', 'Community & Forum — Bytewerk Studio');
    const title = document.querySelector('meta[name="description"]');
    if (title) title.setAttribute('content', t(
      'Das Bytewerk Forum: Fragen zu Code, Produkten und Werkzeugen, Antworten aus dem Studio und eine Werkstatt für Entwickler mit Abo.',
      'The Bytewerk forum: questions about code, products and tools, answers from the studio, and a workshop for developers with a subscription.'
    ));
    renderAll();
    updatePrices();
    if (composer && composer.open) populateCatSelect();
    if (checkout && checkout.open) {
      const planEl = document.getElementById('cm-co-cycle');
      if (planEl) planEl.textContent = billingCycle === 'year' ? t('jährlich, jederzeit kündbar', 'yearly, cancel anytime') : t('monatlich, jederzeit kündbar', 'monthly, cancel anytime');
    }
    const stageChips = document.querySelectorAll('.cm-stage-chip');
    stageChips.forEach((chip) => chip.classList.toggle('is-active', chip.dataset.cmCat === filter.cat));
  });

  // initial paint
  renderAll();
  updatePrices();
  route();
})();
