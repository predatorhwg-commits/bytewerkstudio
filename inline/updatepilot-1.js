/* Ausgelagert aus updatepilot.html fuer CSP ohne unsafe-inline. */
(function () {
  const btn = document.getElementById('buy-btn');
  const toast = document.getElementById('toast');
  let timer;
  if (btn && toast) {
    btn.addEventListener('click', () => {
      toast.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => toast.classList.remove('show'), 2600);
    });
  }
})();
