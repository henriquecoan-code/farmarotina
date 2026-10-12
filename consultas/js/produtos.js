// Produtos: consulta ao cadastro do Trier pela ponte local (somente leitura).
// Busca → produto (PMC, desconto, preço, custo, margem, estoque) → tabela com os produtos do mesmo DCB.
// Compras e vendas de cada produto abrem num modal pelo botão "Inf.".
// Navegação pelo endereço: produtos.html#produto=123
import { $, $$, esc, html, icone, fmtData, fmtMoeda, fmtNum, abrirDialogo } from '../../js/util.js';
import { iniciar, api as apiPonte, telaErro } from './comum.js';

const api = (caminho) => apiPonte(caminho, 'produtos');
// Lembra a busca e os filtros dos equivalentes enquanto a página está aberta
const estado = { busca: '', inativos: false, mesmaConc: false, mesmaApres: false, comEstoque: false, dias: 90 };

const moeda = (n) => (n === null || n === undefined ? '—' : fmtMoeda(n));
const pct = (n) => (n === null || n === undefined ? '—' : `${fmtNum(n, 1)}%`);
const qtd = (n) => fmtNum(n || 0, 2);
const classeMargem = (m) => (m === null || m === undefined ? '' : m < 15 ? 'negativo' : m >= 40 ? 'positivo' : '');
let FORMAS = {};
// Apresentação = forma do produto (cadprodu.tip_apresenta): comprimido, injetável, gotas, líquido, pomada/creme, outros
const apresentacao = (p) => FORMAS[p.forma] || 'Não informada';

// Preço como no balcão: final em destaque, com o PMC riscado e o % de desconto
const precoTexto = (p) => (p.desconto > 0
  ? `<s class="mudo">${moeda(p.pmc)}</s> <span class="prod-desc">-${pct(p.desconto)}</span>`
  : `<span class="mudo">PMC ${moeda(p.pmc)}</span>`);

async function pagina(main) {
  const query = new URLSearchParams(location.hash.slice(1));
  const id = Number(query.get('produto'));
  main.innerHTML = '';
  main.append(html(`<div class="pagina produtos">
    <div class="pagina-topo">
      <h1>${icone('pill')} Produtos</h1>
      <div class="botoes"><button type="button" class="btn" data-imprimir title="Imprimir">${icone('printer')}<span class="some-celular"> Imprimir</span></button></div>
    </div>
    <div class="prod-corpo"><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
  </div>`));
  $('[data-imprimir]', main).onclick = () => window.print();
  const corpo = $('.prod-corpo', main);
  try {
    if (id) await abaProduto(corpo, id);
    else abaBusca(corpo);
  } catch (e) {
    console.error(e);
    corpo.innerHTML = telaErro(e);
  }
}

// ---------- busca ----------
// Uma linha por produto: código e nome à esquerda; laboratório, estoque, PMC/desconto e preço alinhados à direita
function linhaBusca(p) {
  return `<a class="prod-linha ${p.ativo ? '' : 'inativo'}" href="#produto=${p.id}">
    <span class="prod-cod">${p.id}</span>
    <span class="prod-nome">${esc(p.nome)}${p.ativo ? '' : ' <span class="selo-texto">Inativo</span>'}</span>
    <span class="prod-lab">${esc(p.laboratorio || '—')}</span>
    <span class="prod-est ${p.estoque > 0 ? 'prod-tem' : 'prod-zero'}">${qtd(p.estoque)} <small>est.</small></span>
    <span class="prod-pmc">${precoTexto(p)}</span>
    <b class="prod-venda">${moeda(p.venda)}</b></a>`;
}

function abaBusca(corpo) {
  corpo.innerHTML = `<div class="filtros"><div class="busca">${icone('search')}
      <input type="search" placeholder="Nome, código ou código de barras" value="${esc(estado.busca)}" data-busca autocomplete="off" enterkeyhint="search"></div>
      <label class="check pequeno"><input type="checkbox" data-inativos ${estado.inativos ? 'checked' : ''}><span>Incluir inativos</span></label></div>
    <div class="lista" data-resultado></div>`;
  const input = $('[data-busca]', corpo);
  const resultado = $('[data-resultado]', corpo);
  let timer, pedido = 0;

  async function buscar() {
    estado.busca = input.value;
    const termo = input.value.trim();
    if (termo.length < 2) {
      resultado.innerHTML = `<div class="vazio">${icone('search')} Digite pelo menos 2 letras do nome, o código ou bipe o código de barras.</div>`;
      return;
    }
    const meu = ++pedido;
    resultado.innerHTML = `<div class="vazio">${icone('loader-2 girar')} Buscando…</div>`;
    try {
      const lista = await api(`/produtos?busca=${encodeURIComponent(termo)}${estado.inativos ? '&inativos=1' : ''}`);
      if (meu !== pedido) return;
      // Código de barras bipado com um único resultado: abre direto
      if (lista.length === 1 && /^\d{8,14}$/.test(termo)) { location.hash = `produto=${lista[0].id}`; return; }
      resultado.innerHTML = lista.length
        ? lista.map(linhaBusca).join('') + (lista.length >= 40 ? '<div class="vazio mudo">Mostrando os 40 primeiros. Digite mais do nome para filtrar.</div>' : '')
        : '<div class="vazio">Nenhum produto encontrado.</div>';
    } catch (e) {
      if (meu === pedido) resultado.innerHTML = telaErro(e);
    }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(buscar, 350); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const primeiro = $('a.prod-linha', resultado); if (primeiro) location.hash = primeiro.getAttribute('href'); }
  });
  $('[data-inativos]', corpo).onchange = (e) => { estado.inativos = e.target.checked; buscar(); };
  input.focus();
  buscar();
}

// ---------- produto + mesmo DCB ----------
const metrica = (rotulo, valor, sub = '', classe = '') =>
  `<div class="metrica ${classe}"><div class="metrica-rotulo">${rotulo}</div><div class="metrica-valor">${valor}</div>${sub ? `<div class="mudo pequeno">${sub}</div>` : ''}</div>`;

async function abaProduto(corpo, id) {
  const { produto: p, similares, formas } = await api(`/produtos/${id}`);
  FORMAS = formas || {};
  const info = [
    p.laboratorio && `<b>${esc(p.laboratorio)}</b>`, `Cód. ${p.id}`, p.ean && `EAN ${esc(p.ean)}`, p.local && `local ${esc(p.local)}`,
    p.alteracaoPreco && `preço alterado ${fmtData(p.alteracaoPreco)}`,
  ].filter(Boolean).join(' · ');
  corpo.innerHTML = `<a class="voltar so-tela" href="#">${icone('arrow-left')} Buscar outro produto</a>
    <section class="cartao prod-cartao">
      <div class="prod-topo">
        <div><h2>${esc(p.nome)}${p.ativo ? '' : ' <span class="selo-texto">Inativo</span>'}</h2>
          <div class="mudo">${info}</div>
          <div class="prod-tags">
            ${p.nomeDcb ? `<span class="etiqueta">${icone('flask')} ${esc(p.nomeDcb)}</span>` : '<span class="etiqueta">Sem DCB</span>'}
            ${p.concentracao ? `<span class="etiqueta">${esc(p.concentracao)}</span>` : ''}
            <span class="etiqueta">${esc(apresentacao(p))}</span>
          </div></div>
        <button type="button" class="btn so-tela" data-inf="${p.id}" data-nome="${esc(p.nome)}">${icone('info-circle')} Inf.</button>
      </div>
      <div class="metricas prod-metricas">
        ${metrica('PMC', moeda(p.pmc))}
        ${metrica('Desconto', p.desconto > 0 ? pct(p.desconto) : '—', p.descontoMaximo ? `máx. ${pct(p.descontoMaximo)}` : '')}
        ${metrica('Preço de venda', moeda(p.venda), '', 'destaque')}
        ${metrica('Custo', moeda(p.custo), p.custoCadastro && Math.abs(p.custoCadastro - p.custo) > 0.01 ? `cadastro ${moeda(p.custoCadastro)}` : '')}
        ${metrica('Margem', `<span class="${classeMargem(p.margem)}">${pct(p.margem)}</span>`)}
        ${metrica('Estoque', qtd(p.estoque), [p.minimo ? `mín. ${qtd(p.minimo)}` : '', p.curva ? `curva ${esc(p.curva)}` : ''].filter(Boolean).join(' · '), p.estoque > 0 ? '' : 'perigo')}
      </div>
    </section>
    <section class="temp-dia prod-similares">
      <div class="temp-dia-titulo"><b>Mesmo DCB</b> <span class="mudo">${p.nomeDcb ? esc(p.nomeDcb) : ''}</span> <span class="mudo" data-contagem></span></div>
      ${similares.length ? `<div class="prod-chips">
          <label class="chip"><input type="checkbox" data-f="mesmaConc"><span>Mesma concentração${p.concentracao ? ` <small>(${esc(p.concentracao)})</small>` : ''}</span></label>
          <label class="chip"><input type="checkbox" data-f="mesmaApres"><span>Mesma apresentação <small>(${esc(apresentacao(p))})</small></span></label>
          <label class="chip"><input type="checkbox" data-f="comEstoque"><span>Com estoque</span></label>
        </div>
        <div class="tabela-rolagem"><table class="mini-tabela">
          <thead><tr><th>Produto</th><th>Conc.</th><th class="some-celular">Apresentação</th><th class="num">Est.</th>
            <th class="num some-celular">PMC</th><th class="num">Desc.</th><th class="num">Venda</th><th class="num some-celular">Custo</th><th class="num">Margem</th><th class="so-tela"></th></tr></thead>
          <tbody data-similares></tbody></table></div>`
        : `<div class="vazio">${p.dcb ? 'Nenhum outro produto ativo com esse DCB.' : 'Este produto não tem DCB no cadastro do Trier, então não dá para listar os equivalentes.'}</div>`}
    </section>`;
  if (similares.length) montarSimilares(corpo, similares, p);
}

function montarSimilares(corpo, lista, atual) {
  const desenhar = () => {
    const vis = lista.filter((p) => (!estado.mesmaConc || p.concentracao === atual.concentracao)
      && (!estado.mesmaApres || apresentacao(p) === apresentacao(atual))
      && (!estado.comEstoque || p.estoque > 0));
    $('[data-contagem]', corpo).textContent = `· ${vis.length} de ${lista.length}`;
    $('[data-similares]', corpo).innerHTML = vis.length ? vis.map((p) => `<tr data-href="#produto=${p.id}" class="${p.id === atual.id ? 'prod-atual' : ''} ${p.estoque > 0 ? '' : 'prod-sem'}">
        <td><a href="#produto=${p.id}">${esc(p.nome)}</a><small>${esc(p.laboratorio || '')}${p.curva ? ` · curva ${esc(p.curva)}` : ''}</small></td>
        <td>${esc(p.concentracao || '—')}</td>
        <td class="some-celular">${esc(apresentacao(p))}</td>
        <td class="num"><b>${qtd(p.estoque)}</b></td>
        <td class="num some-celular">${moeda(p.pmc)}</td>
        <td class="num">${p.desconto > 0 ? pct(p.desconto) : '—'}</td>
        <td class="num"><b>${moeda(p.venda)}</b></td>
        <td class="num some-celular">${moeda(p.custo)}</td>
        <td class="num ${classeMargem(p.margem)}">${pct(p.margem)}</td>
        <td class="so-tela"><button type="button" class="btn pequeno" data-inf="${p.id}" data-nome="${esc(p.nome)}" title="Compras e vendas">Inf.</button></td></tr>`).join('')
      : '<tr><td colspan="10" class="vazio-cel">Nenhum produto com esses filtros.</td></tr>';
  };
  $$('[data-f]', corpo).forEach((c) => {
    c.checked = estado[c.dataset.f];
    c.onchange = () => { estado[c.dataset.f] = c.checked; desenhar(); };
  });
  desenhar();
}

// ---------- modal Inf.: resumo do período e compras/vendas lado a lado ----------
const ddmm = (d) => fmtData(d).slice(0, 5) + '/' + String(d).slice(2, 4);
const resumo = (rotulo, valor, sub) => `<div class="inf-resumo"><span>${rotulo}</span><b>${valor}</b><small>${sub}</small></div>`;

function desenharInf(alvo, { dias, totais: t, compras, vendas }) {
  const porMes = t.qtdVendida / dias * 30;
  alvo.innerHTML = `
    <div class="inf-resumos">
      ${resumo('Comprado', `${qtd(t.qtdComprada)} un.`, `${t.compras} entrada(s) · ${moeda(t.valorComprado)}`)}
      ${resumo('Vendido', `${qtd(t.qtdVendida)} un.`, `${t.vendas} venda(s) · ${moeda(t.valorVendido)}`)}
      ${resumo('Média de venda', `${qtd(porMes)} un./mês`, `${qtd(t.qtdVendida / dias)} por dia`)}
    </div>
    <div class="inf-colunas">
      <section><h3>${icone('truck-delivery')} Compras <span class="mudo">(${compras.length})</span></h3>
        ${compras.length ? `<div class="inf-rolagem"><table class="mini-tabela compacta">
          <thead><tr><th>Data</th><th>Fornecedor</th><th class="num">Qtd.</th><th class="num">Desc.</th><th class="num">Custo</th></tr></thead>
          <tbody>${compras.map((c) => `<tr title="NF ${esc(c.nf ?? '')} · unitário ${moeda(c.unitario)} · total ${moeda(c.total)}">
            <td>${ddmm(c.data)}</td><td class="inf-nome">${esc(c.fornecedor || '—')}</td><td class="num">${qtd(c.quantidade)}</td>
            <td class="num">${c.desconto ? pct(c.desconto) : '—'}</td><td class="num"><b>${moeda(c.custo)}</b></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="vazio">Nenhuma compra no período.</div>'}
      </section>
      <section><h3>${icone('receipt')} Vendas <span class="mudo">(${vendas.length})</span></h3>
        ${vendas.length ? `<div class="inf-rolagem"><table class="mini-tabela compacta">
          <thead><tr><th>Data</th><th>Cliente</th><th class="num">Qtd.</th><th class="num">Desc.</th><th class="num">Total</th></tr></thead>
          <tbody>${vendas.map((v) => `<tr title="${esc(String(v.hora || '').slice(0, 5))} · unitário ${moeda(v.unitario)}">
            <td>${ddmm(v.data)}</td>
            <td class="inf-nome">${v.cliente ? `<a href="crediario.html#cliente=${v.clienteId}" title="Abrir no Crediário">${esc(v.cliente)}</a>` : '<span class="mudo">Consumidor</span>'}</td>
            <td class="num">${qtd(v.quantidade)}</td><td class="num">${v.desconto ? pct(v.desconto) : '—'}</td><td class="num"><b>${moeda(v.total)}</b></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="vazio">Nenhuma venda no período.</div>'}
      </section>
    </div>
    ${compras.length >= 200 || vendas.length >= 200 ? '<p class="mudo pequeno">As listas mostram as 200 mais recentes; os totais acima consideram o período inteiro.</p>' : ''}`;
}

async function abrirInf(id, nome) {
  const conteudo = html(`<div class="prod-inf">
    <div class="inf-periodo">Últimos <input type="number" min="1" max="3650" value="${estado.dias}" data-dias aria-label="Dias"> dias
      ${[30, 90, 180, 365].map((d) => `<button type="button" class="btn pequeno" data-dias-rapido="${d}">${d}</button>`).join('')}</div>
    <div data-inf-dados><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div></div>`);
  abrirDialogo(nome || 'Produto', conteudo);
  const dados = $('[data-inf-dados]', conteudo);
  const campo = $('[data-dias]', conteudo);
  let pedido = 0;
  const carregar = async () => {
    const dias = Math.max(1, Math.min(3650, Number(campo.value) || 90));
    estado.dias = dias;
    const meu = ++pedido;
    dados.innerHTML = `<div class="vazio">${icone('loader-2 girar')} Carregando…</div>`;
    try {
      const r = await api(`/produtos/${id}/info?dias=${dias}`);
      if (meu === pedido) desenharInf(dados, r);
    } catch (e) {
      if (meu === pedido) dados.innerHTML = telaErro(e);
    }
  };
  let timer;
  campo.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(carregar, 500); });
  $$('[data-dias-rapido]', conteudo).forEach((b) => { b.onclick = () => { campo.value = b.dataset.diasRapido; carregar(); }; });
  await carregar();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-inf]');
  if (b) abrirInf(b.dataset.inf, b.dataset.nome);
});

iniciar({
  atual: 'produtos',
  modulos: ['produtos'],
  titulo: 'a consulta de Produtos',
  montar: async (main) => {
    window.addEventListener('hashchange', () => { window.scrollTo(0, 0); pagina(main); });
    await pagina(main);
  },
});
