(function () {
  const links = document.querySelectorAll('a[href^="mailto:"]');
  const toast = document.getElementById('toast');
  let timer;
  if (links.length && toast) {
    links.forEach(link => link.addEventListener('click', () => {
      toast.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => toast.classList.remove('show'), 2600);
    }));
  }
})();
