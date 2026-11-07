(function () {
  'use strict';

  const user = BWAuth.requireAuth();
  if (!user) return;

  const L = document.documentElement.lang === 'en' ? 'en' : 'de';
  const tr = (de, en) => (L === 'en' ? en : de);

  const PRODUCTS = [
    { id: 'lernreich-pro', name: 'Lernreich Pro', price: '9,99 €', img: 'media/lernreich-pro-icon.svg', href: 'lernreich-pro.html', free: false, cat: 'Windows · Fokus' },
    { id: 'keyforge-vault', name: 'KeyForge Vault', price: '12,99 €', img: 'media/keyforge-vault-icon.svg', href: 'keyforge-vault.html', free: false, cat: 'Windows · Security' },
    { id: 'lumaweek', name: 'LumaWeek Planner', price: '5,99 €', img: 'media/lumaweek-icon.svg', href: 'lumaweek-planner.html', free: false, cat: 'Windows · Planung' },
    { id: 'updatepilot', name: 'UpdatePilot', price: '12,99 €', img: 'media/updatepilot-icon.svg', href: 'updatepilot.html', free: false, cat: 'Windows · Updates' },
    { id: 'pdf-text-pro', name: 'Bytewerk PDF Text Pro', price: '59,00 €', img: 'media/bytewerk-pdf-text-pro-icon.svg', href: 'bytewerk-pdf-text-pro.html', free: false, cat: 'Windows · PDF/OCR' },
    { id: 'neon-dominion', name: 'Neon Dominion', price: '20,00 €', img: 'media/neon-dominion-icon.svg', href: 'neon-dominion.html', free: false, cat: 'Windows · Spiel' },
    { id: 'lernreich', name: 'Lernreich', price: tr('Kostenlos', 'Free'), img: 'media/lernreich-logo-256.webp', href: 'produkt.html', free: true, cat: 'Windows · Lernen' },
    { id: 'pruefungs-countdown', name: 'Prüfungs-Countdown', price: tr('Kostenlos', 'Free'), img: 'media/pruefungs-countdown-logo-220.webp', href: 'pruefungs-countdown.html', free: true, cat: 'Windows · Prüfung' },
    { id: 'neon-horde', name: 'NEON HORDE', price: tr('Kostenlos', 'Free'), img: 'media/neon-horde-icon.svg', href: 'neon-horde/', free: true, cat: 'Web · Spiel' },
    { id: 'burgenwerk', name: 'BURGENWERK', price: tr('Kostenlos', 'Free'), img: 'media/burgenwerk-logo.png', href: 'burgenwerk.html', free: true, cat: 'Web · Spiel' },
    { id: 'mastil', name: 'MASTIL', price: tr('Demo frei', 'Free demo'), img: 'media/mastil-logo-360.webp', href: 'mastil.html', free: true, cat: 'Web · Windows' }
  ];

  let state = user;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function initials(name, email) {
    const parts = String(name || email || '?').trim().split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(name || email || '?').slice(0, 2)).toUpperCase();
  }

  /* ---------- Header ---------- */
  document.getElementById('dash-avatar').textContent = initials(state.name, state.email);
  document.getElementById('dash-greet').textContent = tr('Hallo, ', 'Hi, ') + (state.name || state.email.split('@')[0]);
  document.getElementById('dash-email').textContent = state.email;
  document.getElementById('stat-since').textContent = BWAuth.prettyDate(state.createdAt);

  /* ---------- Tabs ---------- */
  const tabs = document.querySelectorAll('[data-tab]');
  const panels = document.querySelectorAll('[data-panel]');
  const allowed = ['overview', 'bibliothek', 'bestellungen', 'profil', 'sicherheit'];

  function activate(tab) {
    if (!allowed.includes(tab)) tab = 'overview';
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));
  window.addEventListener('hashchange', () => activate(location.hash.replace('#', '')));
  activate(location.hash.replace('#', '') || 'overview');

  /* ---------- Render stats ---------- */
  function renderStats() {
    document.getElementById('stat-library').textContent = state.library.length;
    document.getElementById('stat-orders').textContent = state.orders.length;
  }

  function renderActivity() {
    const map = {
      'account.created': tr('Konto erstellt', 'Account created'),
      'account.login': tr('Angemeldet', 'Signed in'),
      'profile.updated': tr('Profil aktualisiert', 'Profile updated'),
      'password.changed': tr('Passwort geändert', 'Password changed'),
      'library.added': tr('Produkt zur Bibliothek hinzugefügt', 'Product added to library'),
      'library.removed': tr('Produkt aus Bibliothek entfernt', 'Product removed from library')
    };
    const list = document.getElementById('activity-list');
    if (!state.activity || !state.activity.length) {
      list.innerHTML = '<div class="act-row"><span class="act-dot"></span><div><div class="act-t">' + tr('Noch keine Aktivität.', 'No activity yet.') + '</div></div></div>';
      return;
    }
    list.innerHTML = state.activity.slice(0, 6).map(a =>
      '<div class="act-row"><span class="act-dot"></span><div><div class="act-t">' + esc(map[a.t] || a.t) + '</div><div class="act-d">' + esc(BWAuth.prettyDate(a.at)) + '</div></div></div>'
    ).join('');
  }

  /* ---------- Library ---------- */
  function isOwned(p) {
    return state.library.includes(p.id) || state.orders.some(o => o.productId === p.id);
  }

  function renderLibrary() {
    const grid = document.getElementById('lib-grid');
    grid.innerHTML = PRODUCTS.map(p => {
      const owned = isOwned(p);
      const stateText = owned
        ? (p.free ? tr('In Bibliothek', 'In library') : tr('Lizenz aktiv', 'License active'))
        : (p.free ? tr('Kostenlos', 'Free') : tr('Kauf erforderlich', 'Purchase required'));
      let action;
      if (owned) {
        action = '<a class="btn btn-ghost" href="' + p.href + '">' + tr('Öffnen', 'Open') + '</a>';
      } else if (p.free) {
        action = '<button class="btn btn-primary" type="button" data-add="' + p.id + '">' + tr('Hinzufügen', 'Add') + '</button>';
      } else {
        action = '<a class="btn btn-ghost" href="' + p.href + '">' + tr('Im Shop ansehen', 'View in shop') + '</a>';
      }
      return '<article class="lib-item">' +
        '<div class="li-head"><img src="' + p.img + '" alt="" loading="lazy"><div><div class="li-t">' + esc(p.name) + '</div><div class="li-s">' + esc(p.cat) + '</div></div></div>' +
        '<div class="li-body"><span class="li-state ' + (owned ? 'owned' : '') + '">' + stateText + ' · ' + esc(p.price) + '</span>' + action + '</div>' +
        '</article>';
    }).join('');

    grid.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          state = await BWAuth.toggleLibrary(btn.dataset.add, true);
          renderAll();
          BWAuth.toast(tr('Zur Bibliothek hinzugefügt.', 'Added to your library.'), 'ok');
        } catch (e) {
          BWAuth.toast(e.message, 'err');
          btn.disabled = false;
        }
      });
    });
  }

  function renderOrders() {
    const card = document.getElementById('orders-card');
    if (!state.orders.length) return;
    card.innerHTML = '<table class="orders"><thead><tr><th>' + tr('Bestellung', 'Order') + '</th><th>' + tr('Datum', 'Date') + '</th><th>' + tr('Produkt', 'Product') + '</th><th class="o-num">' + tr('Betrag', 'Amount') + '</th></tr></thead><tbody>' +
      state.orders.map(o => '<tr><td class="o-id">' + esc(o.id) + '</td><td>' + esc(BWAuth.prettyDate(o.date)) + '</td><td>' + esc(o.product) + '</td><td class="o-amount">' + esc(o.amount) + '</td></tr>').join('') +
      '</tbody></table>';
  }

  function renderAll() {
    renderStats();
    renderActivity();
    renderLibrary();
    renderOrders();
  }
  renderAll();

  if (window.BWAuth && BWAuth.backend === 'local') document.getElementById('mode-note').hidden = false;
  if (new URLSearchParams(location.search).get('welcome') === '1') {
    BWAuth.toast(tr('Willkommen bei Bytewerk. Dein Konto ist bereit.', 'Welcome to Bytewerk. Your account is ready.'), 'ok', 5200);
  }

  /* ---------- Profile ---------- */
  const pfName = document.getElementById('pf-name');
  const pfEmail = document.getElementById('pf-email');
  const pfLang = document.getElementById('pf-lang');
  const pfMarketing = document.getElementById('pf-marketing');
  const pfNote = document.getElementById('profile-note');

  pfName.value = state.name || '';
  pfEmail.value = state.email;
  pfLang.value = L;
  pfMarketing.checked = !!state.marketing;

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    pfNote.textContent = '';
    try {
      state = await BWAuth.updateProfile({ name: pfName.value, marketing: pfMarketing.checked });
      localStorage.setItem('bw-lang', pfLang.value);
      renderAll();
      pfNote.textContent = tr('Gespeichert.', 'Saved.');
      BWAuth.toast(tr('Profil gespeichert.', 'Profile saved.'), 'ok');
      if (pfLang.value !== L) setTimeout(() => location.reload(), 700);
    } catch (err) {
      pfNote.textContent = err.message;
      BWAuth.toast(err.message, 'err');
    }
  });

  document.getElementById('export-data').addEventListener('click', () => {
    const data = BWAuth.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bytewerk-konto.json';
    a.click();
    URL.revokeObjectURL(a.href);
    BWAuth.toast(tr('Export gestartet.', 'Export started.'), 'ok');
  });

  /* ---------- Password ---------- */
  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = document.getElementById('pw-current').value;
    const next = document.getElementById('pw-new').value;
    const conf = document.getElementById('pw-confirm').value;
    const note = document.getElementById('pw-note');
    note.textContent = '';
    if (next !== conf) { note.textContent = tr('Die Passwörter stimmen nicht überein.', 'Passwords do not match.'); return; }
    try {
      await BWAuth.changePassword(cur, next);
      e.target.reset();
      note.textContent = tr('Passwort geändert.', 'Password updated.');
      BWAuth.toast(tr('Passwort geändert.', 'Password updated.'), 'ok');
      state = BWAuth.getUser() || state;
      renderAll();
    } catch (err) {
      note.textContent = err.message;
      BWAuth.toast(err.message, 'err');
    }
  });

  /* ---------- Delete ---------- */
  document.getElementById('delete-account').addEventListener('click', async () => {
    const typed = document.getElementById('del-confirm').value.trim().toUpperCase();
    const pw = document.getElementById('del-password').value;
    if (typed !== 'LÖSCHEN' && typed !== 'LOESCHEN' && typed !== 'DELETE') {
      BWAuth.toast(tr('Bitte LÖSCHEN eintippen.', 'Please type DELETE.'), 'err');
      return;
    }
    if (!pw) { BWAuth.toast(tr('Bitte das Passwort eingeben.', 'Please enter your password.'), 'err'); return; }
    if (!confirm(tr('Konto wirklich löschen? Alle Daten in diesem Browser werden entfernt.', 'Really delete the account? All data in this browser will be removed.'))) return;
    try {
      await BWAuth.deleteAccount(pw);
      location.replace('index.html');
    } catch (err) {
      BWAuth.toast(err.message, 'err');
    }
  });

  /* ---------- Sign out ---------- */
  document.querySelectorAll('[data-logout]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await BWAuth.logout();
      location.replace('index.html');
    });
  });
})();
