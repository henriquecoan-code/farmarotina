// Pedidos da loja online: fila por situação e página do pedido (separar, avançar o status, imprimir).
// Rotas: #/ (fila) e #/p/<id> (pedido). Os dados vêm do Supabase da loja (js/loja.js).
import { iniciarSubsite } from '../../js/subsite.js';
import { NOME_FARMACIA } from '../../js/config.js';
import { linkWhatsapp } from '../../js/agenda.js';
import { esc, html, icone, toast, fmtMoeda, fmtDataHora } from '../../js/util.js';
import {
  ABERTOS, PAGAMENTO, ENTREGA, LojaDesconectada, rotuloStatus, nivelStatus, proximosStatus, horaLocal,
  lojaConectada, entrarLoja, sairLoja, contaLoja, listarPedidos, resumoPedidos, obterPedido, mudarStatus,
} from '../../js/loja.js';

const PAGINAS = [{ id: 'pedidos', modulo: 'loja', href: 'pedidos.html', icone: 'building-store', nome: 'Pedidos da loja' }];
const FILTROS = [
  { id: 'abertos', nome: 'Em aberto', status: ABERTOS },
  { id: 'novos', nome: 'Recebidos', status: ['aguardando_pagamento', 'pago'] },
  { id: 'separando', nome: 'Em separação', status: ['separando'] },
  { id: 'saida', nome: 'Saiu / pronto', status: ['enviado', 'pronto_retirada'] },
  { id: 'entregue', nome: 'Entregues', status: ['entregue'] },
  { id: 'cancelado', nome: 'Cancelados', status: ['cancelado'] },
];
const ATUALIZAR = 60_000;

let main = null;
let filtro = 'abertos';
let relogio = null;

const selo = (p) => `<span class="selo-texto ${nivelStatus(p)}">${esc(rotuloStatus(p))}</span>`;
const receita = '<span class="selo-texto atencao">receita</span>';

// ---------- login da loja ----------
function telaLogin(msg = '') {
  main.innerHTML = '';
  const tela = html(`<div class="pagina estreita"><div class="cartao entrada" style="margin: 24px auto">
    <h1>${icone('building-store')} Pedidos da loja online</h1>
    <p class="mudo">Os pedidos ficam no sistema do site da farmácia. Entre <b>uma vez neste aparelho</b> com uma conta
      do site que tenha acesso de equipe (a mesma do painel do site).</p>
    <form class="form" novalidate>
      <div class="campo"><label class="rotulo" for="lj-email">E-mail da conta do site</label><input id="lj-email" type="email" autocomplete="username"></div>
      <div class="campo"><label class="rotulo" for="lj-senha">Senha</label><input id="lj-senha" type="password" autocomplete="current-password"></div>
      <div class="erro-form">${esc(msg)}</div>
      <button type="submit" class="btn pri largo">Conectar à loja</button>
    </form></div></div>`);
  main.append(tela);
  const erro = tela.querySelector('.erro-form');
  tela.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = tela.querySelector('#lj-email').value.trim();
    const senha = tela.querySelector('#lj-senha').value;
    if (!email || !senha) { erro.textContent = 'Preencha o e-mail e a senha.'; return; }
    const b = tela.querySelector('button[type=submit]');
    b.disabled = true;
    erro.textContent = '';
    try {
      await entrarLoja(email, senha);
      rota();
    } catch (err) {
      b.disabled = false;
      erro.textContent = err.message || 'Não foi possível entrar.';
    }
  });
}

function telaErro(e) {
  if (e instanceof LojaDesconectada) return telaLogin(lojaConectada() ? e.message : '');
  console.error(e);
  main.innerHTML = `<div class="pagina"><div class="alerta perigo">${icone('alert-triangle')}<span>${esc(e.message || 'Algo deu errado.')}</span>
    <button type="button" class="btn" data-recarregar>${icone('refresh')} Tentar de novo</button></div></div>`;
}

// ---------- fila ----------
async function telaFila() {
  const [resumo, pedidos, conta] = await Promise.all([
    resumoPedidos(), listarPedidos(FILTROS.find((f) => f.id === filtro).status), contaLoja(),
  ]);
  const total = (f) => f.status.reduce((n, s) => n + (resumo[s] || 0), 0);
  const linhas = pedidos.length ? pedidos.map((p) => {
    const itens = (p.pedido_itens || []).reduce((n, i) => n + i.quantidade, 0);
    return `<tr data-href="#/p/${esc(p.id)}" tabindex="0">
      <td><b>${esc(p.numero)}</b></td>
      <td>${esc(fmtDataHora(horaLocal(p.criado_em)))}</td>
      <td>${esc(p.cliente_nome || '—')}<br><small>${esc(p.cliente_telefone || '')}</small></td>
      <td>${esc(ENTREGA[p.entrega] || p.entrega)}${p.endereco?.cidade ? `<br><small>${esc(p.endereco.cidade)}</small>` : ''}</td>
      <td>${esc(PAGAMENTO[p.pagamento] || p.pagamento)}</td>
      <td>${itens}${p.tem_prescricao ? ` ${receita}` : ''}</td>
      <td class="num"><b>${esc(fmtMoeda(p.total))}</b></td>
      <td>${selo(p)}</td></tr>`;
  }).join('') : '<tr><td colspan="8" class="vazio">Nenhum pedido aqui.</td></tr>';

  main.innerHTML = '';
  main.append(html(`<div class="pagina larga">
    <div class="pagina-topo">
      <div><h1>Pedidos da loja</h1>
        <div class="mudo pequeno">Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · atualiza sozinho a cada minuto</div></div>
      <div class="loja-conta mudo">${icone('plug-connected')} ${esc(conta)}
        <button type="button" class="btn" data-sair-loja>Desconectar</button></div>
    </div>
    <div class="chips">${FILTROS.map((f) => `<label class="chip"><input type="radio" name="filtro" value="${f.id}" ${f.id === filtro ? 'checked' : ''}>
      <span>${esc(f.nome)}${total(f) ? ` <b>${total(f)}</b>` : ''}</span></label>`).join('')}</div>
    <div class="tabela-rolagem"><table class="tabela-loja">
      <thead><tr><th>Nº</th><th>Feito em</th><th>Cliente</th><th>Entrega</th><th>Pagamento</th><th>Itens</th><th class="num">Total</th><th>Situação</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
  </div>`));
}

// ---------- pedido ----------
async function telaPedido(id) {
  const p = await obterPedido(id);
  if (!p) {
    main.innerHTML = `<div class="pagina"><p><a href="#/">${icone('arrow-left')} Pedidos</a></p><div class="vazio">Pedido não encontrado.</div></div>`;
    return;
  }
  const e = p.endereco;
  const endereco = e?.logradouro
    ? `${e.logradouro}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ''} · ${e.bairro} · ${e.cidade}/${e.uf} · CEP ${e.cep}`
    : (e?.cidade ? `${e.cidade}/${e.uf}` : '—');
  const whats = linkWhatsapp(p.cliente_telefone,
    `Olá! Aqui é da ${NOME_FARMACIA || 'farmácia'}, sobre o seu pedido nº ${p.numero}.`);
  const acoes = proximosStatus(p);
  const historico = [...(p.pedido_status_log || [])].sort((a, b) => String(a.em).localeCompare(String(b.em)));

  document.title = `Pedido ${p.numero} · FarmaRotina`;
  main.innerHTML = '';
  main.append(html(`<div class="pagina larga">
    <p class="nao-imprimir"><a href="#/">${icone('arrow-left')} Pedidos</a></p>
    <div class="pagina-topo"><h1>Pedido nº ${esc(p.numero)}</h1>${selo(p)}</div>
    ${p.tem_prescricao ? `<div class="alerta atencao">${icone('file-text')}<span><b>Conferir receita:</b> o pedido tem medicamento de venda sob prescrição.</span></div>` : ''}
    <div class="pedido-grade">
      <section class="cartao">
        <div class="cartao-topo"><h2>Itens para separar</h2></div>
        <div class="tabela-rolagem"><table class="tabela-loja">
          <thead><tr><th>Cód.</th><th>Produto</th><th>Qtd</th><th class="num">Unit.</th><th class="num">Total</th></tr></thead>
          <tbody>${(p.pedido_itens || []).map((i) => `<tr><td>${esc(i.cod_red)}</td>
            <td>${esc(i.nome)}${i.tipo_venda === 'prescricao' ? ` ${receita}` : ''}</td>
            <td><b>${esc(i.quantidade)}</b></td><td class="num">${esc(fmtMoeda(i.preco_unit))}</td><td class="num">${esc(fmtMoeda(i.total))}</td></tr>`).join('')}</tbody>
        </table></div>
        <dl class="pedido-totais">
          <dt>Subtotal</dt><dd>${esc(fmtMoeda(p.subtotal))}</dd>
          <dt>Frete</dt><dd>${Number(p.frete) ? esc(fmtMoeda(p.frete)) : 'Grátis'}</dd>
          <dt class="total">Total</dt><dd class="total">${esc(fmtMoeda(p.total))}</dd>
        </dl>
      </section>
      <div class="pedido-lado">
        <section class="cartao">
          <div class="cartao-topo"><h2>Cliente e entrega</h2></div>
          <dl class="pedido-ficha">
            <dt>Cliente</dt><dd>${esc(p.cliente_nome || (p.anonimizado ? '(conta excluída)' : '—'))}</dd>
            <dt>Telefone</dt><dd>${esc(p.cliente_telefone || '—')}</dd>
            <dt>E-mail</dt><dd>${esc(p.cliente_email || '—')}</dd>
            <dt>Feito em</dt><dd>${esc(fmtDataHora(horaLocal(p.criado_em)))}</dd>
            <dt>Entrega</dt><dd>${esc(ENTREGA[p.entrega] || p.entrega)}</dd>
            <dt>Endereço</dt><dd>${esc(endereco)}</dd>
            <dt>Pagamento</dt><dd>${esc(PAGAMENTO[p.pagamento] || p.pagamento)}${p.pago_em ? ` · pago em ${esc(fmtDataHora(horaLocal(p.pago_em)))}` : ''}</dd>
            <dt>Observação</dt><dd>${esc(p.observacao || '—')}</dd>
          </dl>
        </section>
        <section class="cartao nao-imprimir">
          <div class="cartao-topo"><h2>Ações</h2></div>
          <div class="pedido-acoes">${acoes.length
            ? acoes.map((a) => `<button type="button" class="btn ${a.perigo ? 'perigo' : 'pri'}" data-para="${a.para}">${esc(a.rotulo)}</button>`).join('')
            : '<span class="mudo">Pedido finalizado.</span>'}</div>
          <div class="pedido-acoes">
            <button type="button" class="btn" data-imprimir>${icone('printer')} Imprimir separação</button>
            ${whats ? `<a class="btn whats" href="${esc(whats)}" target="_blank" rel="noopener">${icone('brand-whatsapp')} WhatsApp do cliente</a>` : ''}
          </div>
        </section>
        <section class="cartao nao-imprimir">
          <div class="cartao-topo"><h2>Histórico</h2></div>
          <ol class="pedido-historico">${historico.map((h) => `<li><b>${esc(rotuloStatus({ status: h.para, pagamento: p.pagamento }))}</b>
            <span>${esc(fmtDataHora(horaLocal(h.em)))}</span></li>`).join('')}</ol>
        </section>
      </div>
    </div>
    <p class="pedido-rodape">${esc(NOME_FARMACIA)} · pedido nº ${esc(p.numero)} · separado por: ____________________</p>
  </div>`));
}

// ---------- rotas e cliques ----------
async function rota() {
  clearInterval(relogio);
  relogio = null;
  if (!lojaConectada()) return telaLogin();
  const m = location.hash.match(/^#\/p\/(.+)$/);
  try {
    if (m) {
      await telaPedido(decodeURIComponent(m[1]));
    } else {
      document.title = 'Pedidos da loja · FarmaRotina';
      await telaFila();
      // Só a fila se atualiza sozinha (o pedido aberto não muda embaixo de quem está separando)
      relogio = setInterval(() => { if (!document.hidden) telaFila().catch(telaErro); }, ATUALIZAR);
    }
  } catch (e) {
    telaErro(e);
  }
}

function ligarEventos() {
  window.addEventListener('hashchange', rota);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && relogio) telaFila().catch(telaErro); });
  main.addEventListener('change', (e) => {
    if (e.target.name !== 'filtro') return;
    filtro = e.target.value;
    rota();
  });
  main.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-href]');
    if (tr && e.key === 'Enter') location.hash = tr.dataset.href;
  });
  main.addEventListener('click', async (e) => {
    if (e.target.closest('[data-recarregar]')) return rota();
    if (e.target.closest('[data-imprimir]')) return window.print();
    if (e.target.closest('[data-sair-loja]')) {
      if (!confirm('Desconectar a loja neste aparelho? Os pedidos deixam de aparecer aqui e na Agenda até alguém entrar de novo.')) return;
      await sairLoja().catch(() => {});
      return rota();
    }
    const tr = e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a, button, input')) { location.hash = tr.dataset.href; return; }
    const b = e.target.closest('[data-para]');
    if (!b) return;
    if (b.dataset.para === 'cancelado' && !confirm('Cancelar este pedido? O cliente verá o pedido como cancelado.')) return;
    b.disabled = true;
    try {
      await mudarStatus(decodeURIComponent(location.hash.replace(/^#\/p\//, '')), b.dataset.para);
      toast('Situação atualizada.', 'ok');
      rota();
    } catch (err) {
      b.disabled = false;
      if (err instanceof LojaDesconectada) telaErro(err);
      else toast(err.message || 'Não foi possível atualizar.', 'erro');
    }
  });
}

iniciarSubsite({
  paginas: PAGINAS, atual: 'pedidos', modulos: ['loja'], titulo: 'os Pedidos da loja',
  montar: async (m) => { main = m; ligarEventos(); await rota(); },
});
