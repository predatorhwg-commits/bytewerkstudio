(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const success = document.getElementById('form-success');
  const fields = [...form.querySelectorAll('[required]')];

  function mark(field) {
    const wrap = field.closest('.field');
    const invalid = !field.checkValidity() || !String(field.value || '').trim();
    if (wrap) wrap.classList.toggle('invalid', invalid);
    return !invalid;
  }

  fields.forEach(field => field.addEventListener('input', () => mark(field)));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const ok = fields.map(mark).every(Boolean);
    if (!ok) return;
    const data = new FormData(form);
    const body = [
      'Name: ' + data.get('name'),
      'E-Mail: ' + data.get('email'),
      'Projektart: ' + data.get('type'),
      'Budget: ' + data.get('budget'),
      '',
      String(data.get('message') || '')
    ].join('\n');
    form.classList.add('sent');
    if (success) success.classList.add('show');
    window.location.href = 'mailto:Haqmalh@icloud.com?subject=' + encodeURIComponent('Projektanfrage an Bytewerk Studio') + '&body=' + encodeURIComponent(body);
  });
})();
