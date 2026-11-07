/* Ausgelagert aus 404.html fuer CSP ohne unsafe-inline. */
/* GitHub Pages serves this document under the requested URL, so every
   relative link would point into the path that does not exist. Header,
   footer and the account menu are injected by scripts, so rewrite as
   they appear rather than once. */
(function () {
  var ABS = /^([a-z][a-z0-9+.-]*:|\/|#)/i;
  function fix(root) {
    var nodes = (root || document).querySelectorAll('a[href], link[href], img[src]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var attr = el.hasAttribute('href') ? 'href' : 'src';
      var v = el.getAttribute(attr);
      if (!v || ABS.test(v)) continue;
      el.setAttribute(attr, '/' + v.replace(/^\.\//, ''));
    }
  }
  fix();
  if ('MutationObserver' in window) {
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          fix(n);
          if (n.hasAttribute && n.hasAttribute('href')) fix(n.parentNode || document);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
