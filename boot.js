/* Bytewerk Studio — setzt den JS-Zustand und die Sprache, bevor gerendert wird.
   Extern geladen, damit die CSP ohne 'unsafe-inline' auskommt. */
document.documentElement.classList.add('js');
try {
  var lang = localStorage.getItem('bw-lang');
  if (lang === 'de' || lang === 'en') document.documentElement.lang = lang;
} catch (e) { /* storage blocked: deutsche Standardsprache */ }
