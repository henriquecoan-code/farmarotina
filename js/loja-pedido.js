// Janela (modal) com o pedido da loja online, aberta pelos cartões da Agenda na tela inicial:
// itens para separar, cliente, entrega e os botões para avançar a situação, sem sair da tela.
// A página completa (com impressão) continua em loja/pedidos.html.
import { NOME_FARMACIA } from './config.js';
import { linkWhatsapp } from './agenda.js';
import { esc, html, icone, toast, fmtMoeda, fmtDataHora, abrirDialogo } from './util.js';
import {
  PAGAMENTO, ENTREGA, LojaDesconectada, rotuloStatus, nivelStatus, proximosStatus, horaLocal, obterPedido, mudarStatus,
} from './loja.js';

const URL_LOJA = 'loja/pedidos.html';

// Os estilos do pedido ficam em loja/loja.css (a tela inicial não carrega esse arquivo sozinha)
function carregarEstilo() {
  if (document.querySelector('link[data-loja-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'loja/loja.css';
  link.dataset.lojaCss = '';
  document.head.append(link);
}

function conteudo(p) {
  const e = p.endereco;
  const endereco = e?.logradouro
    ? `${e.logradouro}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ''} · ${e.bairro} · ${e.cidade}/${e.uf} · CEP ${e.cep}`
    : (e?.cidade ? `${e.cidade}/${e.uf}` : '—');
  const whats = linkWhatsapp(p.cliente_telefone, `Olá! Aqui é da ${NOME_FARMACIA || 'farmácia'}, sobre o seu pedido nº ${p.numero}.`);
  const acoes = proximosStatus(p);
  const receita = '<span class="selo-texto atencao">receita</span>';
  return `<div class="pedido-modal">
    <p><span class="selo-texto ${nivelStatus(p)}">${esc(rotuloStatus(p))}</span>
      <span class="mudo pequeno">feito em ${esc(fmtDataHora(horaLocal(p.criado_em)))}</span></p>
    ${p.tem_prescricao ? `<div class="alerta atencao">${icone('file-text')}<span><b>Conferir receita:</b> o pedido tem medicamento de venda sob prescrição.</span></div>` : ''}
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
    <dl class="pedido-ficha">
      <dt>Cliente</dt><dd>${esc(p.cliente_nome || (p.anonimizado ? '(conta excluída)' : '—'))}</dd>
      <dt>Telefone</dt><dd>${esc(p.cliente_telefone || '—')}</dd>
      <dt>Entrega</dt><dd>${esc(ENTREGA[p.entrega] || p.entrega)}</dd>
      <dt>Endereço</dt><dd>${esc(endereco)}</dd>
      <dt>Pagamento</dt><dd>${esc(PAGAMENTO[p.pagamento] || p.pagamento)}</dd>
      <dt>Observação</dt><dd>${esc(p.observacao || '—')}</dd>
    </dl>
    <div class="pedido-acoes">${acoes.length
      ? acoes.map((a) => `<button type="button" class="btn ${a.perigo ? 'perigo' : 'pri'}" data-para="${a.para}">${esc(a.rotulo)}</button>`).join('')
      : '<span class="mudo">Pedido finalizado.</span>'}</div>
    <div class="pedido-acoes">
      ${whats ? `<a class="btn whats" href="${esc(whats)}" target="_blank" rel="noopener">${icone('brand-whatsapp')} WhatsApp do cliente</a>` : ''}
      <a class="btn" href="${URL_LOJA}#/p/${encodeURIComponent(p.id)}">${icone('printer')} Página do pedido (imprimir)</a>
    </div>
  </div>`;
}

export async function abrirPedidoLoja(id) {
  carregarEstilo();
  const corpo = html(`<div><div class="carregando">${icone('loader-2 girar')} Carregando…</div></div>`);
  const { dlg, fechar } = abrirDialogo('Pedido da loja', corpo);
  dlg.style.width = 'min(720px, 96vw)';
  dlg.style.maxWidth = 'none';
  let mudou = false;

  async function desenhar() {
    try {
      const p = await obterPedido(id);
      if (!p) { corpo.innerHTML = '<div class="vazio">Pedido não encontrado.</div>'; return; }
      dlg.querySelector('h2').textContent = `Pedido nº ${p.numero}`;
      corpo.innerHTML = conteudo(p);
    } catch (e) {
      corpo.innerHTML = `<div class="alerta ${e instanceof LojaDesconectada ? 'info' : 'perigo'}">${icone('alert-triangle')}<span>${esc(e.message || 'Algo deu errado.')}</span>
        <a class="btn" href="${URL_LOJA}">Abrir Pedidos da loja</a></div>`;
    }
  }

  corpo.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-para]');
    if (!b) return;
    if (b.dataset.para === 'cancelado' && !confirm('Cancelar este pedido? O cliente verá o pedido como cancelado.')) return;
    b.disabled = true;
    try {
      await mudarStatus(id, b.dataset.para);
      mudou = true;
      toast('Situação atualizada.', 'ok');
      await desenhar();
    } catch (e) {
      b.disabled = false;
      toast(e.message || 'Não foi possível atualizar.', 'erro');
    }
  });
  // Ao fechar depois de mudar a situação, redesenha a tela (a Agenda e os números mudam)
  dlg.addEventListener('close', () => { if (mudou) window.dispatchEvent(new HashChangeEvent('hashchange')); });
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) fechar(); }); // clique fora fecha
  await desenhar();
}

// Cartões da Agenda (e qualquer link com data-pedido-loja) abrem a janela em vez de trocar de página
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-pedido-loja]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  abrirPedidoLoja(a.dataset.pedidoLoja);
});
