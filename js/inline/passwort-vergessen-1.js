(function () {
  'use strict';
  const form = document.getElementById('reset-form');
  const alertBox = document.getElementById('reset-alert');
  const alertText = document.getElementById('reset-alert-text');
  const field = document.getElementById('f-email');
  const input = document.getElementById('email');

  if (BWAuth.backend === 'local') document.getElementById('local-note').hidden = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.className = 'auth-alert';
    if (!BWAuth.validateEmail(input.value)) {
      field.classList.add('invalid');
      return;
    }
    field.classList.remove('invalid');
    try {
      const result = await BWAuth.requestReset(input.value);
      alertText.textContent = result.local
        ? 'Vorschau-Modus: Es wurde keine E-Mail versendet. Dein Konto bleibt in diesem Browser gespeichert. Melde dich mit deinem Passwort an oder kontaktiere den Support.'
        : 'Wenn ein Konto mit dieser Adresse existiert, ist der Reset-Link unterwegs. Prüfe auch den Spam-Ordner.';
      alertBox.className = 'auth-alert show ok';
      form.querySelector('button[type="submit"]').disabled = true;
    } catch (err) {
      alertText.textContent = err.message || 'Anfrage fehlgeschlagen.';
      alertBox.className = 'auth-alert show error';
    }
  });

  input.addEventListener('input', () => field.classList.remove('invalid'));
})();
