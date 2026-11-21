/* ============================================================================
 * RÓTULOS POR LOJA — "como o sistema chama as pessoas e o lugar"
 *
 * Uma barbearia fala "barbeiro" e "barbearia". Um estúdio de estética fala
 * "profissional" e "estúdio". Este arquivo troca as palavras já escritas na
 * tela pela palavra DA LOJA, sem mexer em nomes de campo, ids ou classes.
 *
 * Uso:
 *   Rotulos.carregar('/l/minha-loja/api/admin');   // painel (sessão da loja)
 *   Rotulos.carregar('/api/master');               // master (lista de lojas)
 *   Rotulos.aplicar(document.body);                // traduz o que já está na tela
 *   Rotulos.servir(rotulosDoServidor);             // palavras de uma loja (master)
 *
 * Sem nada carregado, tudo continua escrevendo barbeiro/barbearia — igual antes.
 * ========================================================================== */
(function () {
  'use strict';

  var PADRAO = {
    profissional: 'barbeiro',
    profissionais: 'barbeiros',
    Profissional: 'Barbeiro',
    Profissionais: 'Barbeiros',
    artigo: 'o',
    oProfissional: 'o barbeiro',
    osProfissionais: 'os barbeiros',
    sobreProfissional: 'sobre o',
    doProfissional: 'do',
    local: 'barbearia',
    Local: 'Barbearia',
    artigoLocal: 'a',
    noLocal: 'na barbearia',
    doLocal: 'da barbearia',
    aoLocal: 'à barbearia',
    ehBarbearia: true,
  };

  var atual = null; // null = texto original (padrão)
  var original = new WeakMap();

  /** Aceita o objeto pronto do servidor (mesmos campos de src/rotulos.js). */
  function servir(rotulos) {
    if (!rotulos || !rotulos.profissional) {
      atual = null;
      return atual;
    }
    var r = {};
    for (var k in PADRAO) r[k] = rotulos[k] !== undefined ? rotulos[k] : PADRAO[k];
    atual = r;
    return atual;
  }

  function palavras() {
    return atual || PADRAO;
  }

  function preset(nome) {
    // atalhos usados no seletor do painel: nome = id da palavra do profissional
    var P = {
      barbeiro: ['barbeiro', 'barbeiros', 'o', 'barbearia'],
      profissional: ['profissional', 'profissionais', 'o', 'estúdio'],
      esteticista: ['esteticista', 'esteticistas', 'a', 'estúdio'],
      cabeleireiro: ['cabeleireiro', 'cabeleireiros', 'o', 'salão de beleza'],
      manicure: ['manicure', 'manicures', 'a', 'estúdio'],
      massagista: ['massagista', 'massagistas', 'o', 'espaço'],
      terapeuta: ['terapeuta', 'terapeutas', 'o', 'clínica'],
      tatuador: ['tatuador', 'tatuadores', 'o', 'estúdio'],
      veterinario: ['veterinário', 'veterinários', 'o', 'clínica'],
      atendente: ['atendente', 'atendentes', 'o', 'loja'],
    }[nome];
    if (!P) return null;
    var art = P[2];
    var local = P[3];
    var artLocal = /^(estúdio|salão|espaço|consultório|domicílio)$/.test(local) ? 'o' : 'a';
    var fem = art === 'a';
    return {
      profissional: P[0],
      profissionais: P[1],
      Profissional: P[0].charAt(0).toUpperCase() + P[0].slice(1),
      Profissionais: P[1].charAt(0).toUpperCase() + P[1].slice(1),
      artigo: art,
      oProfissional: art + ' ' + P[0],
      osProfissionais: (fem ? 'as ' : 'os ') + P[1],
      sobreProfissional: fem ? 'sobre a' : 'sobre o',
      doProfissional: fem ? 'da' : 'do',
      local: local,
      Local: local.charAt(0).toUpperCase() + local.slice(1),
      artigoLocal: artLocal,
      noLocal: (artLocal === 'a' ? 'na ' : 'no ') + local,
      doLocal: artLocal === 'a' ? 'da ' + local : 'do ' + local,
      aoLocal: artLocal === 'a' ? 'à ' + local : 'ao ' + local,
      ehBarbearia: nome === 'barbeiro' && local === 'barbearia',
    };
  }

  /* ------------------------------------------------------------------------
   * Substituições. Só valem quando a loja NÃO é barbearia (então a Império
   * Barber, que já existe, continua vendo exatamente o mesmo texto).
   * ---------------------------------------------------------------------- */
  function tabela() {
    var p = palavras();
    if (p.ehBarbearia) return null; // nada a traduzir
    var fem = p.artigo === 'a';
    var L = p.local;
    var lMin = L.charAt(0).toLowerCase() + L.slice(1);
    return [
      // frases inteiras primeiro (mais específicas)
      [/barbeiro\(s\)/gi, p.profissional + '(s)'],
      [/Cortes e barba/gi, p.Profissionais + ' e horários'],
      [/Toda terça o corte sai mais barato/gi, 'toda terça tem desconto'],
      [/Todos os barbeiros/gi, (fem ? 'Todas as ' : 'Todos os ') + p.profissionais],
      [/os barbeiros\b/gi, p.osProfissionais],
      [/Nenhum barbeiro/gi, (fem ? 'Nenhuma ' : 'Nenhum ') + p.profissional],
      [/Novo barbeiro/gi, (fem ? 'Nova ' : 'Novo ') + p.profissional],
      [/um barbeiro\b/gi, (fem ? 'uma ' : 'um ') + p.profissional],
      [/Barbeiro desativado/gi, (fem ? 'Profissional desativada' : 'Profissional desativado')],
      [/Barbeiro ativado/gi, (fem ? 'Profissional ativada' : 'Profissional ativado')],
      [/este barbeiro/gi, (fem ? 'esta ' : 'este ') + p.profissional],
      [/deste barbeiro/gi, (fem ? 'desta ' : 'deste ') + p.profissional],
      [/Acompanhar a agenda dos barbeiros/gi, 'Acompanhar a agenda ' + (fem ? 'das ' : 'dos ') + p.profissionais],
      [/foto do barbeiro/gi, 'foto ' + p.doProfissional + ' ' + p.profissional],
      [/Agenda por barbeiro/gi, 'Agenda por ' + p.profissional],
      [/Números por barbeiro/gi, 'Números por ' + p.profissional],
      [/Comissões por barbeiro/gi, 'Comissões por ' + p.profissional],
      [/Desempenho por barbeiro/gi, 'Desempenho por ' + p.profissional],
      [/Profissional desativad[ao]/gi, p.Profissional + (fem ? ' desativada' : ' desativado')],
      [/Profissional ativad[ao]/gi, p.Profissional + (fem ? ' ativada' : ' ativado')],
      [/\bBarbeiros\b/g, p.Profissionais],
      [/\bbarbeiross\b/g, p.profissionais], // nunca deve acontecer; proteção
      [/\bbarbeiros\b/g, p.profissionais],
      [/\bBarbeiro\b/g, p.Profissional],
      [/\bbarbeiro\b/g, p.profissional],
      [/Terça do corte/gi, 'Terça promocional'],
      [/do corte sai mais barato/gi, 'sai mais barato'],
      [/\bcortes\b/gi, 'serviços'],
      [/\bCortes\b/g, 'Serviços'],
      [/\bna barbearia\b/gi, p.noLocal],
      [/\bda barbearia\b/gi, p.doLocal],
      [/\bà barbearia\b/gi, p.aoLocal],
      [/\bBarbearia\b/g, p.Local],
      [/\bbarbearia\b/g, lMin],
      // concordância no fim (só quando a palavra da loja é feminina)
      [/(Nenhum) /g, fem ? 'Nenhuma ' : '$1 '],
      [/cadastrados\b/gi, fem ? 'cadastradas' : 'cadastrados'],
      [/cadastrado\b/gi, fem ? 'cadastrada' : 'cadastrado'],
    ];
  }

  function traduzir(texto) {
    var tab = tabela();
    if (!tab || !texto) return texto;
    var out = texto;
    for (var i = 0; i < tab.length; i += 1) out = out.replace(tab[i][0], tab[i][1]);
    return out;
  }

  /** Traduz os nós de texto do container (sem tocar em tags, ids ou código). */
  function aplicar(raiz) {
    if (!tabela()) return;
    raiz = raiz || document.body;
    if (!raiz) return;
    var doc = raiz.ownerDocument || document;
    var walker = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
      acceptNode: function (no) {
        var pai = no.parentNode;
        if (!pai) return NodeFilter.FILTER_REJECT;
        // trechos marcados com data-rotulo-fixo não são traduzidos (textos de ajuda,
        // exemplos com as duas palavras, avisos legais)
        if (pai.closest && pai.closest('[data-rotulo-fixo]')) return NodeFilter.FILTER_REJECT;
        var tag = (pai.nodeName || '').toUpperCase();
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE') return NodeFilter.FILTER_REJECT;
        return /\bbarbeir|\bbarbearia|cortes?\b|Terça do corte/i.test(no.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    var nos = [];
    while (walker.nextNode()) nos.push(walker.currentNode);
    nos.forEach(function (no) {
      var antes = no.nodeValue;
      var depois = traduzir(antes);
      if (depois !== antes) no.nodeValue = depois;
    });
    // atributos que aparecem para o usuário (placeholder, title, aria-label)
    Array.prototype.forEach.call(raiz.querySelectorAll('[placeholder],[title],[aria-label]'), function (el) {
      ['placeholder', 'title', 'aria-label'].forEach(function (at) {
        var v = el.getAttribute(at);
        if (!v || !/barbeir|barbearia|cortes?\b|Terça do corte/i.test(v)) return;
        el.setAttribute(at, traduzir(v));
      });
    });
  }

  /** Observa o painel e traduz o que for aparecendo (listas, modais, avisos). */
  function observar() {
    if (!tabela() || typeof MutationObserver === 'undefined' || !document.body) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i += 1) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j += 1) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) aplicar(n);
            else if (n.nodeType === 3 && /\bbarbeir|\bbarbearia|cortes?\b/i.test(n.nodeValue || '')) n.nodeValue = traduzir(n.nodeValue);
          }
        } else if (m.type === 'characterData' && /\bbarbeir|\bbarbearia|cortes?\b/i.test(m.target.nodeValue || '')) {
          m.target.nodeValue = traduzir(m.target.nodeValue);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  var observer = null;

  /** Carrega as palavras da loja e aplica na tela. */
  function carregar(url) {
    if (!url) return Promise.resolve(palavras());
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (dados) {
        if (!dados) return palavras();
        if (dados.rotulos) return servir(dados.rotulos); // lista de lojas do master
        return servir(dados);
      })
      .then(function (p) {
        aplicar(document.body);
        observar();
        if (document.documentElement) document.documentElement.setAttribute('data-rotulo-profissional', p.profissional);
        return p;
      })
      .catch(function () {
        return palavras();
      });
  }

  /** Texto pronto para usar em mensagens montadas por JS. */
  function texto(chave) {
    return palavras()[chave] || PADRAO[chave] || '';
  }

  window.Rotulos = {
    carregar: carregar,
    aplicar: aplicar,
    servir: servir,
    observar: observar,
    preset: preset,
    texto: texto,
    palavras: palavras,
    traduzir: traduzir,
    ehBarbearia: function () {
      return !!palavras().ehBarbearia;
    },
  };
})();
