/* Navegação de apresentação exclusiva da Império. Não altera dados nem permissões. */
(function () {
  var nav = document.getElementById('imperioMenu');
  var abrir = document.getElementById('imperioAbrirMenu');
  var fundo = document.getElementById('imperioFundoMenu');
  if (!nav || !abrir || !fundo) return;
  var telaPequena = window.matchMedia('(max-width: 899px)');
  function definirMenu(aberto, devolverFoco) {
    aberto = !!aberto && telaPequena.matches;
    document.body.classList.toggle('imperio-menu-aberto', aberto);
    abrir.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    fundo.hidden = !aberto;
    if (telaPequena.matches && !aberto) { nav.setAttribute('inert', ''); nav.setAttribute('aria-hidden', 'true'); }
    else { nav.removeAttribute('inert'); nav.removeAttribute('aria-hidden'); }
    if (aberto) {
      var ativo = nav.querySelector('button.on:not(.oculto)');
      if (ativo && ativo.offsetParent !== null) ativo.focus();
    } else if (devolverFoco && telaPequena.matches) abrir.focus();
  }
  abrir.addEventListener('click', function () { definirMenu(abrir.getAttribute('aria-expanded') !== 'true'); });
  fundo.addEventListener('click', function () { definirMenu(false, true); });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('button[data-tab]') && telaPequena.matches) definirMenu(false, true);
  });
  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('imperio-menu-aberto')) return;
    if (e.key === 'Escape') { e.preventDefault(); definirMenu(false, true); return; }
    if (e.key !== 'Tab') return;
    var botoes = Array.prototype.filter.call(nav.querySelectorAll('button[data-tab]'), function (b) { return b.offsetParent !== null && !b.disabled; });
    if (!botoes.length) return;
    if (e.shiftKey && document.activeElement === botoes[0]) { e.preventDefault(); botoes[botoes.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === botoes[botoes.length - 1]) { e.preventDefault(); botoes[0].focus(); }
  });
  if (telaPequena.addEventListener) telaPequena.addEventListener('change', function () { definirMenu(false); });
  else telaPequena.addListener(function () { definirMenu(false); });
  definirMenu(false);
})();
/* A instalação do painel continua disponível pelo navegador, sem cartão na tela inicial. */
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/l/imperio-barber/imperio-painel-sw.js', { scope: '/l/imperio-barber/admin', updateViaCache: 'none' }).catch(function () {});
}
