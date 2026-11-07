/* Ausgelagert aus checkout.html fuer CSP ohne unsafe-inline. */
(function () {
  const list = document.getElementById('cart-list');
  const base = [{ title: 'Lernreich', price: { de: 'Kostenlos', en: 'Free' }, qty: 1 }];

  function lang() {
    return document.documentElement.lang === 'en' ? 'en' : 'de';
  }

  function cart() {
    return base.map(item => ({ ...item, price: item.price[lang()] }));
  }

  function renderList() {
    if (!list) return;
    list.innerHTML = cart().map(item => `
      <div class="row">
        <span class="key">${item.qty || 1}x</span>
        <span class="val"><strong>${item.title}</strong><br>${item.price}</span>
      </div>
    `).join('');
  }

  renderList();
  document.addEventListener('bw:lang', renderList);

  const form = document.getElementById('checkout-form');
  if (!form) return;
  const success = document.getElementById('checkout-success');
  const fields = [...form.querySelectorAll('[required]')];
  const mark = (field) => {
    const wrap = field.closest('.field');
    const invalid = !field.checkValidity() || !String(field.value || '').trim();
    if (wrap) wrap.classList.toggle('invalid', invalid);
    return !invalid;
  };
  fields.forEach(field => field.addEventListener('input', () => mark(field)));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!fields.map(mark).every(Boolean)) return;
    const data = new FormData(form);
    // Die Bestellung geht per E-Mail an das Studio; sie bleibt deutsch,
    // damit sie im Postfach einheitlich ankommt.
    const body = [
      'Lernreich Anfrage Bytewerk Studio',
      '',
      ...cart().map(item => '- ' + (item.qty || 1) + 'x ' + item.title + ' / ' + item.price),
      '',
      'Name: ' + data.get('name'),
      'E-Mail: ' + data.get('email'),
      'Notiz: ' + (data.get('note') || '-')
    ].join('\n');
    form.classList.add('sent');
    if (success) success.classList.add('show');
    window.location.href = 'mailto:Haqmalh@icloud.com?subject=' + encodeURIComponent('Lernreich Anfrage') + '&body=' + encodeURIComponent(body);
  });
})();
