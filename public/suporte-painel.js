(() => {
  'use strict';
  const app = document.getElementById('app');
  const area = document.getElementById('suporte-area');
  const form = document.getElementById('suporte-form');
  if (!app || !area || !form) return;

  const prefix = (location.pathname.match(/^\/l\/([a-z0-9-]+)/i) || [])[0] || '';
  const base = prefix + '/api/admin/suporte';
  const btns = [...document.querySelectorAll('.suporte-nav')];
  const feedback = document.getElementById('suporte-feedback');
  const lista = document.getElementById('suporte-lista');
  const enviar = document.getElementById('suporte-enviar');
  const habilitado = document.getElementById('suporte-habilitado');
  const indisponivel = document.getElementById('suporte-indisponivel');
  const carregando = document.getElementById('suporte-carregando');
  let verificando = null;
  let disponivel = false;
  let verificado = false;

  const get = async (url, op = {}) => {
    const r = await fetch(base + url, { ...op, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Não foi possível concluir agora.');
    return j;
  };

  const mostrarNavegacao = (mostrar) => btns.forEach((b) => { b.hidden = !mostrar; });
  function mostrarEstado(ativo, mensagem) {
    disponivel = ativo;
    if (carregando) carregando.hidden = true;
    if (habilitado) habilitado.hidden = !ativo;
    if (indisponivel) {
      indisponivel.hidden = ativo;
      if (mensagem) indisponivel.querySelector('strong').textContent = mensagem;
    }
  }

  function verificar() {
    if (verificando) return verificando;
    verificando = (async () => {
      try {
        const cfg = await get('/config');
        verificado = true;
        mostrarEstado(!!cfg.disponivel, cfg.disponivel ? '' : 'Atendimento pelo painel indisponível no momento.');
      } catch {
        verificado = true;
        mostrarEstado(false, 'Não foi possível verificar o atendimento agora. Tente atualizar a página.');
      } finally {
        verificando = null;
      }
    })();
    return verificando;
  }

  const visivel = () => !app.hidden && !app.classList.contains('oculto');
  new MutationObserver(() => {
    mostrarNavegacao(visivel());
    if (visivel()) verificar();
  }).observe(app, { attributes: true, attributeFilter: ['hidden', 'class'] });
  mostrarNavegacao(visivel());
  if (visivel()) verificar();

  async function listar() {
    if (!verificado) await verificar();
    if (!disponivel) return;
    lista.textContent = 'Carregando pedidos…';
    try {
      const pedidos = await get('/pedidos');
      lista.replaceChildren();
      if (!pedidos.length) {
        lista.textContent = 'Você ainda não tem pedidos.';
        return;
      }
      const nomes = { aberta: 'Enviado', em_analise: 'Em análise', aguardando_cliente: 'Aguardando você', concluida: 'Concluído', cancelada: 'Cancelado' };
      pedidos.forEach((p) => {
        const item = document.createElement('article');
        item.className = 'suporte-pedido';
        const titulo = document.createElement('strong');
        titulo.textContent = String(p.titulo || 'Pedido');
        item.append(titulo);
        const estado = document.createElement('p');
        estado.textContent = 'Situação: ' + (nomes[p.status] || 'Em atualização');
        item.append(estado);
        if (p.criado_em) {
          const data = new Date(p.criado_em);
          if (!Number.isNaN(data.getTime())) {
            const d = document.createElement('small');
            d.textContent = data.toLocaleString('pt-BR');
            item.append(d);
          }
        }
        if (p.resposta_admin) {
          const resposta = document.createElement('p');
          resposta.textContent = 'Resposta: ' + String(p.resposta_admin);
          item.append(resposta);
        }
        lista.append(item);
      });
    } catch (e) {
      lista.textContent = e instanceof TypeError ? 'Não foi possível carregar seus pedidos agora.' : e.message;
    }
  }

  btns.forEach((b) => b.addEventListener('click', async () => {
    if (!verificado) await verificar();
    if (disponivel) listar();
  }));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!disponivel) return;
    if (enviar.disabled) return;
    const titulo = document.getElementById('suporte-titulo').value.trim();
    const descricao = document.getElementById('suporte-descricao').value.trim();
    const files = document.getElementById('suporte-fotos').files;
    if ([...titulo].length < 3 || [...titulo].length > 120 || [...descricao].length > 2000) {
      feedback.textContent = 'Informe um título de 3 a 120 caracteres e um relato de até 2000 caracteres.';
      return;
    }
    if (files.length > 3) {
      feedback.textContent = 'Envie no máximo 3 fotos.';
      return;
    }
    const data = new FormData();
    data.append('titulo', titulo);
    data.append('descricao', descricao);
    for (const f of files) data.append('fotos', f);
    enviar.disabled = true;
    feedback.textContent = 'Enviando…';
    try {
      await get('/pedidos', { method: 'POST', body: data });
      form.reset();
      feedback.textContent = 'Pedido enviado.';
      await listar();
    } catch (e) {
      feedback.textContent = e instanceof TypeError ? 'Não foi possível confirmar o envio. Confira seus pedidos antes de tentar novamente.' : e.message;
    } finally {
      enviar.disabled = false;
    }
  });
})();
