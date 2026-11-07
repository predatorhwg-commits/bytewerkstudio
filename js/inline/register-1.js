(function () {
  'use strict';

  const form = document.getElementById('register-form');
  const alertBox = document.getElementById('reg-alert');
  const alertText = document.getElementById('reg-alert-text');
  const submit = document.getElementById('reg-submit');
  const modeNote = document.getElementById('mode-note');

  if (window.BWAuth && BWAuth.backend === 'local') modeNote.hidden = false;

  function showAlert(message, type) {
    alertText.textContent = message;
    alertBox.className = 'auth-alert show ' + (type || 'error');
    alertBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function hideAlert() { alertBox.className = 'auth-alert'; }

  document.querySelectorAll('[data-pw-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.pwToggle);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
    });
  });

  const name = document.getElementById('name');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const confirm = document.getElementById('confirm');
  const terms = document.getElementById('terms');
  const marketing = document.getElementById('marketing');
  const meter = document.getElementById('pw-meter');
  const meterLabel = document.getElementById('pw-label');
  const labels = ['Zu schwach', 'Schwach', 'Okay', 'Gut', 'Sehr stark'];
  const hints = [
    'Mindestens 10 Zeichen, Groß- und Kleinbuchstaben, Zahl oder Sonderzeichen.',
    'Noch zu kurz oder zu einfach.',
    'Fast gut — mehr Länge oder Zeichenvielfalt.',
    'Gute Passwortstärke.',
    'Sehr starkes Passwort.'
  ];

  password.addEventListener('input', () => {
    const score = BWAuth.passwordScore(password.value);
    meter.dataset.score = String(score);
    meterLabel.textContent = password.value ? labels[score] + ' · ' + hints[score] : hints[0];
  });

  function validate() {
    const checks = {
      name: name.value.trim().length >= 2,
      email: BWAuth.validateEmail(email.value),
      password: BWAuth.passwordOk(password.value),
      confirm: confirm.value === password.value && confirm.value.length > 0
    };
    document.getElementById('f-name').classList.toggle('invalid', !checks.name);
    document.getElementById('f-email').classList.toggle('invalid', !checks.email);
    document.getElementById('f-password').classList.toggle('invalid', !checks.password);
    document.getElementById('f-confirm').classList.toggle('invalid', !checks.confirm);
    document.getElementById('terms-line').classList.toggle('invalid', !terms.checked);
    return Object.values(checks).every(Boolean) && terms.checked;
  }

  [name, email, password, confirm].forEach(input => input.addEventListener('input', () => {
    input.closest('.auth-field').classList.remove('invalid');
    hideAlert();
  }));
  terms.addEventListener('change', () => {
    document.getElementById('terms-line').classList.remove('invalid');
    hideAlert();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    if (!validate()) {
      showAlert('Bitte prüfe die markierten Felder.', 'error');
      return;
    }

    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    const label = submit.innerHTML;
    submit.innerHTML = '<span>Konto wird erstellt …</span>';

    try {
      const result = await BWAuth.register({
        name: name.value,
        email: email.value,
        password: password.value,
        marketing: marketing.checked,
        remember: true
      });

      if (result.needsConfirmation) {
        form.innerHTML =
          '<div class="form-success show" style="display:flex">' +
          '<div class="check"><svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"/></svg></div>' +
          '<h3>Fast fertig</h3>' +
          '<p>Wir haben dir eine E-Mail an <strong>' + email.value + '</strong> geschickt. Bestätige die Adresse, dann kannst du dich anmelden.</p>' +
          '<a class="btn btn-primary" href="login.html">Zur Anmeldung <span class="arr">→</span></a>' +
          '</div>';
        return;
      }

      location.replace('konto.html?welcome=1');
    } catch (err) {
      showAlert(err.message || 'Konto konnte nicht erstellt werden.', 'error');
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      submit.innerHTML = label;
    }
  });
})();
