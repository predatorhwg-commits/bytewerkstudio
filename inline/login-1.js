/* Ausgelagert aus login.html fuer CSP ohne unsafe-inline. */
(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const alertBox = document.getElementById('login-alert');
  const alertText = document.getElementById('login-alert-text');
  const submit = document.getElementById('login-submit');
  const modeNote = document.getElementById('mode-note');

  if (window.BWAuth && BWAuth.backend === 'local') modeNote.hidden = false;

  function showAlert(message, type) {
    alertText.textContent = message;
    alertBox.className = 'auth-alert show ' + (type || 'error');
  }
  function hideAlert() { alertBox.className = 'auth-alert'; }

  function safeNext(value) {
    if (!value) return null;
    try {
      const decoded = decodeURIComponent(value);
      if (/^[a-z0-9_-]+\.html(\?[a-z0-9_=&%.-]*)?$/i.test(decoded)) return decoded;
    } catch (e) {}
    return null;
  }

  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get('next'));

  if (params.get('reset') === '1') {
    showAlert('Wenn ein Konto existiert, wurde eine E-Mail zum Zurücksetzen verschickt. Prüfe dein Postfach.', 'ok');
  }
  if (params.get('registered') === '1') {
    showAlert('Konto erstellt. Bitte bestätige deine E-Mail-Adresse und melde dich an.', 'ok');
  }

  if (BWAuth.getUser()) location.replace(next || 'konto.html');

  /* Password visibility */
  document.querySelectorAll('[data-pw-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.pwToggle);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
    });
  });

  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const fEmail = document.getElementById('f-email');
  const fPassword = document.getElementById('f-password');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    let ok = true;
    fEmail.classList.toggle('invalid', !BWAuth.validateEmail(email.value));
    fPassword.classList.toggle('invalid', !password.value);
    ok = !fEmail.classList.contains('invalid') && !fPassword.classList.contains('invalid');
    if (!ok) return;

    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    const label = submit.innerHTML;
    submit.innerHTML = '<span>Anmelden …</span>';

    try {
      await BWAuth.login(email.value, password.value, document.getElementById('remember').checked);
      location.replace(next || 'konto.html');
    } catch (err) {
      showAlert(err.message || 'Anmeldung fehlgeschlagen.', 'error');
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      submit.innerHTML = label;
    }
  });

  [email, password].forEach(input => input.addEventListener('input', () => {
    input.closest('.auth-field').classList.remove('invalid');
    hideAlert();
  }));
})();
