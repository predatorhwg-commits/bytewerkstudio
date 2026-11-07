/* Ausgelagert aus shop.html fuer CSP ohne unsafe-inline. */
/* Shop filtering */
(function () {
  const chips = document.querySelectorAll('.chip');
  const items = document.querySelectorAll('.shop-page-grid .prod');
  chips.forEach(chip => chip.addEventListener('click', () => {
    chips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const f = chip.dataset.filter;
    items.forEach(it => {
      const cats = (it.dataset.cat || '').split(' ');
      it.classList.toggle('hide', !(f === 'all' || cats.includes(f)));
    });
  }));
})();
