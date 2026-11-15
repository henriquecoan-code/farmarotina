// Pedido de compras: lê os produtos do Trier pela ponte local (ou o Excel "Sugestão de Compras") e monta o pedido
// em cinco abas: Sugestão (o diário), Pedido curto (zerados), Indústria (compra direta por laboratório/fornecedor),
// Parados e Cobertura de estoque. Exporta o pedido_site.csv, TXT ("1 NOME DO PRODUTO" por linha), Excel e impressão.
//
// Faturação (Fat): quantas unidades vêm na embalagem do fornecedor (ex.: Benegripe 25). No pedido, 1 = 1 caixa;
// todo produto com Fat > 1 vai como 1 e é conferido antes de mandar. O Fat vem da última compra (do fornecedor
// filtrado, quando há filtro) e pode ser fixado por produto ("Fat fixo", salvo nas regras do EAN).
import { iniciar, db, lerPlanilha, baixarArquivo } from './comum.js';
import { api, telaErro } from '../../consultas/js/comum.js';
import { CONFIG_PADRAO, mesclarConfig, lerRelatorio, montarLista, normMarca, idMarca } from './motor-pedido.js';
import { $, $$, esc, html, icone, toast, mensagemErro, normalizar, abrirDialogo, agoraLocal, fmtDataHora, fmtData, fmtMoeda, hoje } from '../../js/util.js';

const ABAS = [
  { id: 'sugestao', nome: 'Sugestão', icone: 'list-check', pedido: true },
  { id: 'curto', nome: 'Pedido curto', icone: 'bolt', pedido: true },
  { id: 'industria', nome: 'Indústria', icone: 'building-factory-2', pedido: true },
  { id: 'parados', nome: 'Parados', icone: 'zzz' },
  { id: 'cobertura', nome: 'Cobertura', icone: 'gauge' },
];
const FAIXAS = [
  { id: 'zerado', nome: 'Sem estoque', cor: 'perigo' },
  { id: 'critica', nome: 'Até 7 dias', cor: 'perigo' },
  { id: 'baixa', nome: '7 a 15 dias', cor: 'atencao' },
  { id: 'ok', nome: '15 a 90 dias', cor: 'ok' },
  { id: 'excesso', nome: 'Mais de 90 dias', cor: 'info' },
];
const LIMITE_TELA = 800; // linhas desenhadas na tabela (exportações levam todas)

const GUARDADO = 'farmarotina-pedido-v2';           // filtros, parâmetros e ajustes, só neste aparelho
const GUARDADO_EXCEL = 'farmarotina-pedido-em-revisao'; // revisão do Excel em andamento (formato antigo)

let config = mesclarConfig(null);
let regras = new Map();      // ean -> regra
let regrasMarca = new Map(); // MARCA -> regra
let industrias = new Map();  // chave (f<fornecedor> / l<laboratório>) -> { minimo, desconto, dias }

let base = null;    // resposta da ponte
let carregando = null;
let excel = null;   // { arquivoNome, itens, quando } quando a Sugestão vem do Excel
let main = null;

const estado = {
  aba: 'sugestao',
  de: hoje(), ate: hoje(), // Sugestão: vendas do próprio dia (pode mudar na tela)
  f: { busca: '', lab: '', forn: '', grupo: '', depto: '', cat: '', curva: '' },
  sugMinimo: false, curtoDias: 30, indDias: 30, indBase: 90, indTodos: false, paradosDias: 90, cobBase: 90, cobFaixa: '',
  ajustes: {}, // { aba: { chave: { qtd, incluir, obs } } }
};

function guardar() {
  try { localStorage.setItem(GUARDADO, JSON.stringify({ ...estado, dia: hoje() })); } catch { /* sem espaço */ }
  try { if (excel) localStorage.setItem(GUARDADO_EXCEL, JSON.stringify(excel)); else localStorage.removeItem(GUARDADO_EXCEL); } catch { /* ignora */ }
}
function recuperar() {
  try {
    const g = JSON.parse(localStorage.getItem(GUARDADO) || 'null');
    if (g) {
      Object.assign(estado, g, { f: { ...estado.f, ...g.f } });
      // Período da sugestão e ajustes valem para o dia; no dia seguinte começa do zero
      if (g.dia !== hoje()) Object.assign(estado, { de: hoje(), ate: hoje(), ajustes: {} });
    }
  } catch { /* ignora */ }
  try {
    const e = JSON.parse(localStorage.getItem(GUARDADO_EXCEL) || 'null');
    if (e?.itens?.length) excel = e;
  } catch { /* ignora */ }
  if (!ABAS.some((a) => a.id === estado.aba)) estado.aba = 'sugestao';
}

async function carregarRegras() {
  const [cfg, rs, rm, ind] = await Promise.all([
    db.obter('pedido_config', 'geral').catch(() => null),
    db.listar('pedido_regras', { ordem: 'ean', desc: false, limite: 10000 }),
    db.listar('pedido_regras_marca', { ordem: 'marca', desc: false, limite: 2000 }),
    db.listar('pedido_industrias', { ordem: 'nome', desc: false, limite: 2000 }).catch(() => []),
  ]);
  config = mesclarConfig(cfg);
  regras = new Map(rs.map((r) => [r.ean, r]));
  regrasMarca = new Map(rm.map((r) => [normMarca(r.marca), r]));
  industrias = new Map(ind.map((r) => [r.id, r]));
}

async function carregarBase() {
  carregando = api(`/compras/produtos?de=${estado.de}&ate=${estado.ate}`, 'pedido');
  try {
    base = await carregando;
    base.carregadoEm = agoraLocal();
    base.produtos.forEach((p) => { p.chave = p.ean || `id${p.id}`; });
  } finally { carregando = null; }
}

// ---------- página ----------
iniciar({
  modulo: 'pedido',
  titulo: 'Pedido de compras',
  async montar(elemento) {
    main = elemento;
    recuperar();
    const abaHash = new URLSearchParams(location.hash.slice(1)).get('aba');
    if (ABAS.some((a) => a.id === abaHash)) estado.aba = abaHash;
    main.append(html(`<div class="pagina larga pedido">
      <div class="pagina-topo">
        <div><h1>${icone('shopping-cart')} Pedido de compras</h1><div class="mudo pequeno" data-fonte></div></div>
        <div class="botoes">
          <button type="button" class="btn" data-atualizar title="Ler de novo o sistema">${icone('refresh')}<span class="some-celular"> Atualizar</span></button>
          <button type="button" class="btn" data-regras>${icone('settings')}<span class="some-celular"> Regras</span></button>
        </div>
      </div>
      <nav class="abas-pedido" role="tablist">${ABAS.map((a) => `<button type="button" role="tab" data-aba="${a.id}">${icone(a.icone)} ${esc(a.nome)}</button>`).join('')}</nav>
      <div data-conteudo><div class="vazio cartao">${icone('loader-2 girar')} Lendo os produtos do sistema…</div></div>
    </div>`));

    $('[data-regras]', main).onclick = () => abrirRegras();
    $('[data-atualizar]', main).onclick = () => recarregar();
    $$('[data-aba]', main).forEach((b) => { b.onclick = () => irPara(b.dataset.aba); });
    window.addEventListener('hashchange', () => {
      const a = new URLSearchParams(location.hash.slice(1)).get('aba');
      if (a && a !== estado.aba && ABAS.some((x) => x.id === a)) { estado.aba = a; desenhar(); }
      else if (!base && !carregando) recarregar(); // botão "Tentar de novo" da tela de erro
    });

    try { await carregarRegras(); } catch (e) { toast(mensagemErro(e), 'erro'); }
    await recarregar();
  },
});

function irPara(aba) {
  estado.aba = aba;
  history.replaceState(null, '', `#aba=${aba}`);
  guardar();
  desenhar();
}

async function recarregar() {
  const conteudo = $('[data-conteudo]', main);
  conteudo.innerHTML = `<div class="vazio cartao">${icone('loader-2 girar')} Lendo os produtos do sistema…</div>`;
  try {
    await carregarBase();
  } catch (e) {
    console.error(e);
    base = null;
    // Sem ponte, a Sugestão ainda funciona com o Excel do Trier
    if (!excel) { conteudo.innerHTML = telaErro(e) + blocoExcel(true); ligarExcel(conteudo); desenharAbas(); return; }
    toast('Não consegui ler o sistema; mostrando o Excel carregado', 'erro');
  }
  desenhar();
}

function desenharAbas() {
  $$('[data-aba]', main).forEach((b) => {
    const ativa = b.dataset.aba === estado.aba;
    b.classList.toggle('ativa', ativa);
    b.setAttribute('aria-selected', ativa);
  });
  $('[data-fonte]', main).textContent = base
    ? `Sistema lido às ${fmtDataHora(base.carregadoEm).slice(-5)} · ${base.produtos.length.toLocaleString('pt-BR')} produtos com estoque ou venda no último ano`
    : excel ? `Excel: ${excel.arquivoNome}` : '';
}

// ---------- nomes e filtros ----------
const nome = (tabela, id) => (id === null || id === undefined ? '' : base?.[tabela]?.[id] || '');
const nomeLab = (p) => nome('laboratorios', p.lab);

// Faturação do produto: Fat fixo da regra > última compra do fornecedor filtrado > última compra de qualquer fornecedor
function fatDe(p) {
  const fixo = Number(regras.get(p.ean)?.fat_fixo);
  if (fixo > 0) return { fat: fixo, origem: 'Fat fixo (regra do produto)' };
  const forn = p.forn || [];
  if (estado.f.forn) {
    const doForn = forn.find((x) => String(x[0]) === String(estado.f.forn));
    if (doForn) return { fat: Number(doForn[1]) || 1, origem: `última compra de ${nome('fornecedores', doForn[0])} (${fmtData(doForn[2])})` };
  }
  if (forn.length) return { fat: Number(forn[0][1]) || 1, origem: `última compra: ${nome('fornecedores', forn[0][0])} (${fmtData(forn[0][2])})` };
  return { fat: 1, origem: 'sem compra nos últimos 3 anos' };
}

function passaFiltros(p) {
  const f = estado.f;
  if (f.lab && String(p.lab) !== f.lab) return false;
  if (f.forn && !(p.forn || []).some((x) => String(x[0]) === f.forn) && String(p.ultFornec) !== f.forn) return false;
  if (f.grupo && String(p.grupo) !== f.grupo) return false;
  if (f.depto && String(p.depto) !== f.depto) return false;
  if (f.cat && String(p.cat) !== f.cat) return false;
  if (f.curva && (p.curva || '') !== (f.curva === '-' ? '' : f.curva)) return false;
  return true;
}
const passaBusca = (texto) => { const t = normalizar(estado.f.busca.trim()); return !t || normalizar(texto).includes(t); };

const vendaBase = (p, dias) => Number({ 7: p.v7, 30: p.v30, 90: p.v90, 180: p.v180, 365: p.v365 }[dias] || 0);
const diasSemVenda = (p) => (p.ultVenda ? Math.floor((Date.parse(hoje()) - Date.parse(String(p.ultVenda).slice(0, 10))) / 864e5) : null);
const fmtQ = (n) => (Math.round(Number(n) * 10) / 10).toLocaleString('pt-BR');

// ---------- itens de cada aba ----------
// Regras do produto e da marca (as mesmas do relatório): excluir sempre, quantidade fixa, sempre incluir
function aplicarRegras(item, { marca = true } = {}) {
  const regra = regras.get(item.ean) || {};
  const regraMarca = marca ? regrasMarca.get(normMarca(item.lab)) : null;
  if (regraMarca?.acao === 'excluir_sempre') { item.incluir = false; item.origem = `marca ${item.lab}: sempre excluir`; item.obs = regraMarca.observacao || ''; }
  if (regra.excluir_sempre) { item.incluir = false; item.origem = 'regra: sempre excluir'; }
  else if (regra.quantidade_fixa !== null && regra.quantidade_fixa !== undefined) { item.incluir = true; item.qtd = Math.trunc(regra.quantidade_fixa); item.origem = 'regra: quantidade fixa'; }
  else if (regra.incluir_sempre) { item.incluir = true; item.qtd = item.qtd > 0 ? item.qtd : 1; item.origem = 'regra: sempre incluir'; }
  if (regra.observacao) item.obs = regra.observacao;
  return item;
}

function itemBase(p, extra) {
  const { fat, origem } = fatDe(p);
  return {
    chave: p.chave, id: p.id, ean: p.ean || '', produto: p.nome, lab: nomeLab(p), curva: p.curva, saldo: Number(p.saldo),
    minimo: Number(p.minimo), demanda: Number(p.demanda), fat, fatOrigem: origem, custo: Number(p.custo) || 0,
    v7: Number(p.v7), v30: Number(p.v30), v90: Number(p.v90), periodo: Number(p.periodo), forn: p.forn,
    incluir: true, qtd: 0, motivo: '', origem: '', obs: '', ...extra,
  };
}

function itensSugestao() {
  if (excel) {
    return excel.itens.map((i) => ({
      chave: i.ean, ean: i.ean, produto: i.produto, lab: i.marca, curva: i.curva, saldo: i.saldo, minimo: i.estoque_minimo,
      demanda: i.demanda, fat: i.fat, fatOrigem: i.fat_fixo ? 'Fat fixo (regra do produto)' : 'relatório do Trier', custo: 0,
      periodo: null, incluir: i.incluir, qtd: i.quantidade_final, qtdSugerida: i.quantidade_sugerida,
      motivo: i.motivo_sugestao, origem: i.origem_decisao === 'automatico' ? '' : i.origem_decisao, obs: i.observacao || '',
    })).filter((i) => passaBusca(`${i.produto} ${i.lab} ${i.ean}`));
  }
  // Venderam no período ou (opção) estão abaixo do estoque mínimo do Trier mesmo sem venda no período
  const entra = (p) => Number(p.periodo) > 0 || (estado.sugMinimo && Number(p.saldo) < Number(p.minimo));
  const prods = base.produtos.filter((p) => entra(p) && passaFiltros(p) && passaBusca(`${p.nome} ${nomeLab(p)} ${p.ean}`));
  const linhas = prods.map((p) => ({
    id: p.id, ean: p.chave, produto: p.nome, marca: nomeLab(p), curva: p.curva, saldo: Number(p.saldo),
    estoque_minimo: Number(p.minimo), demanda: Number(p.demanda), qtd_comp_sistema: Number(p.periodo), fat: fatDe(p).fat,
  }));
  const porId = new Map(prods.map((p) => [p.id, p]));
  return montarLista(linhas, config, regras, regrasMarca).map((m) => {
    const p = porId.get(m.id);
    return itemBase(p, {
      incluir: m.incluir, qtd: m.quantidade_final, qtdSugerida: m.quantidade_sugerida, motivo: m.motivo_sugestao,
      origem: m.origem_decisao === 'automatico' ? '' : m.origem_decisao, obs: m.observacao || '',
    });
  });
}

function itensCurto() {
  // Qualquer número de dias: vale a data da última venda (só vendas do último ano; acima disso, a última saída do Trier)
  const dias = Number(estado.curtoDias) || 30;
  return base.produtos
    .filter((p) => {
      if (Number(p.saldo) > 0 || !passaFiltros(p) || !passaBusca(`${p.nome} ${nomeLab(p)} ${p.ean}`)) return false;
      const d = diasSemVenda(p);
      return d !== null && d < dias && (Number(p.v365) > 0 || dias > 365);
    })
    .map((p) => aplicarRegras(itemBase(p, {
      qtd: 1, qtdSugerida: 1,
      motivo: `Zerado (saldo ${Number(p.saldo)}) · última venda há ${diasSemVenda(p)} dia(s) · ${fmtQ(Number(p.v30) / 30 * 7)}/semana`,
    })));
}

function chaveIndustria() {
  if (estado.f.forn) return { chave: `f${estado.f.forn}`, nome: nome('fornecedores', estado.f.forn) };
  if (estado.f.lab) return { chave: `l${estado.f.lab}`, nome: nome('laboratorios', estado.f.lab) };
  return null;
}

function itensIndustria() {
  if (!chaveIndustria()) return [];
  const dias = Number(estado.indDias) || 30;
  const baseDias = estado.indBase;
  return base.produtos.filter((p) => passaFiltros(p) && passaBusca(`${p.nome} ${nomeLab(p)} ${p.ean}`)).map((p) => {
    const porDia = vendaBase(p, baseDias) / baseDias;
    const alvo = porDia * dias;
    const precisa = Math.ceil(alvo - Number(p.saldo));
    const item = itemBase(p, {});
    const vende = `vende ${fmtQ(porDia * 30)}/mês`;
    if (precisa <= 0) Object.assign(item, { incluir: false, qtd: 0, qtdSugerida: 0, motivo: `${vende} · saldo ${Number(p.saldo)} cobre ${dias} dias` });
    else if (item.fat > 1) Object.assign(item, { qtd: 1, qtdSugerida: 1, motivo: `${vende} · precisa de ${precisa} un para ${dias} dias · vende por caixa (Fat=${item.fat}): pede 1` });
    else Object.assign(item, { qtd: precisa, qtdSugerida: precisa, motivo: `${vende} · ${fmtQ(alvo)} para ${dias} dias − saldo ${Number(p.saldo)}` });
    // Regras do produto valem (excluir, quantidade fixa); a exclusão por marca não, porque aqui a compra é direta da indústria
    if (precisa > 0) aplicarRegras(item, { marca: false });
    return item;
  }).filter((i) => estado.indTodos || i.qtdSugerida > 0 || i.origem);
}

function itensParados() {
  const n = estado.paradosDias;
  return base.produtos.filter((p) => {
    if (!(Number(p.saldo) > 0) || !passaFiltros(p) || !passaBusca(`${p.nome} ${nomeLab(p)} ${p.ean}`)) return false;
    const d = diasSemVenda(p);
    return d === null || d >= n;
  }).map((p) => itemBase(p, { semVenda: diasSemVenda(p), valor: Number(p.saldo) * (Number(p.custo) || 0), ultVenda: p.ultVenda, ultEntrada: p.ultEntrada, v365: Number(p.v365) }))
    .sort((a, b) => b.valor - a.valor);
}

function faixaDe(saldo, cob) {
  if (saldo <= 0) return 'zerado';
  if (cob < 7) return 'critica';
  if (cob < 15) return 'baixa';
  if (cob <= 90) return 'ok';
  return 'excesso';
}
function itensCobertura() {
  const b = estado.cobBase;
  return base.produtos.filter((p) => (Number(p.saldo) > 0 || vendaBase(p, b) > 0) && passaFiltros(p) && passaBusca(`${p.nome} ${nomeLab(p)} ${p.ean}`)).map((p) => {
    const porDia = vendaBase(p, b) / b;
    const saldo = Number(p.saldo);
    const cob = porDia > 0 ? Math.max(0, saldo) / porDia : (saldo > 0 ? Infinity : 0);
    return itemBase(p, { porDia, cob, faixa: faixaDe(saldo, cob), valor: Math.max(0, saldo) * (Number(p.custo) || 0) });
  }).sort((x, y) => x.cob - y.cob || y.v30 - x.v30);
}

// Itens da aba com os ajustes feitos na tela (quantidade, incluir, observação)
function itensDaAba(aba = estado.aba) {
  const lista = { sugestao: itensSugestao, curto: itensCurto, industria: itensIndustria, parados: itensParados, cobertura: itensCobertura }[aba]();
  const aj = estado.ajustes[chaveAjustes(aba)] || {};
  for (const i of lista) {
    const a = aj[i.chave];
    if (!a) continue;
    if (a.qtd !== undefined) i.qtd = a.qtd;
    if (a.incluir !== undefined) i.incluir = a.incluir;
    if (a.obs !== undefined) i.obs = a.obs;
    i.ajustado = true;
  }
  return lista;
}
const chaveAjustes = (aba) => (aba === 'sugestao' && excel ? 'excel' : aba === 'industria' ? `industria-${chaveIndustria()?.chave || ''}` : aba);
function ajustar(chave, campo, valor) {
  const k = chaveAjustes(estado.aba);
  ((estado.ajustes[k] ??= {})[chave] ??= {})[campo] = valor;
  guardar();
}

// ---------- desenho ----------
let itensAtuais = [];

function desenhar() {
  desenharAbas();
  const conteudo = $('[data-conteudo]', main);
  if (!base && !(estado.aba === 'sugestao' && excel)) {
    if (!conteudo.querySelector('.alerta')) conteudo.innerHTML = `<div class="vazio cartao">Não foi possível ler o sistema. ${estado.aba === 'sugestao' ? '' : 'Esta aba precisa da ponte.'}</div>`;
    if (estado.aba === 'sugestao') { conteudo.innerHTML = telaErro(new Error('Não foi possível ler o sistema.')) + blocoExcel(true); ligarExcel(conteudo); }
    return;
  }
  const aba = ABAS.find((a) => a.id === estado.aba);
  conteudo.innerHTML = `${painelParametros()}
    ${excel && aba.id === 'sugestao' ? '' : barraFiltros()}
    <div class="metricas" data-metricas></div>
    <div data-aviso></div>
    <div class="filtros barra-acoes">
      ${aba.pedido ? `<button type="button" class="btn pri" data-exp="csv">${icone('download')} pedido_site.csv</button>
        <button type="button" class="btn" data-exp="txt">${icone('file-text')} TXT</button>` : ''}
      <button type="button" class="btn" data-exp="xlsx">${icone('file-spreadsheet')} Excel</button>
      <button type="button" class="btn" data-exp="imprimir">${icone('printer')}<span class="some-celular"> Imprimir</span></button>
      <span class="filtros-acoes">${aba.pedido ? `<button type="button" class="btn" data-descartar title="Voltar as quantidades e marcações para a sugestão">${icone('arrow-back-up')}<span class="some-celular"> Desfazer ajustes</span></button>` : ''}</span>
    </div>
    <div class="mudo pequeno" data-info></div>
    <div class="tabela-rolagem"><table class="tabela-pedido"><thead></thead><tbody></tbody></table></div>`;
  ligarParametros(conteudo);
  ligarFiltros(conteudo);
  ligarTabela(conteudo);
  $$('[data-exp]', conteudo).forEach((b) => { b.onclick = () => exportar(b.dataset.exp); });
  const desc = $('[data-descartar]', conteudo);
  if (desc) desc.onclick = () => {
    if (!confirm('Desfazer os ajustes desta aba (quantidades, marcações e observações)? As regras salvas continuam.')) return;
    delete estado.ajustes[chaveAjustes(estado.aba)];
    if (estado.aba === 'sugestao' && excel) excel.itens.forEach((i) => { i.incluir = i.quantidade_sugerida > 0; i.quantidade_final = i.quantidade_sugerida; });
    guardar();
    desenharTabela();
  };
  desenharTabela();
}

function painelParametros() {
  const e = estado;
  const sel = (k, opcoes, sufixo = ' dias') => `<select data-p="${k}">${opcoes.map((o) => `<option value="${o}" ${String(e[k]) === String(o) ? 'selected' : ''}>${o}${sufixo}</option>`).join('')}</select>`;
  switch (e.aba) {
    case 'sugestao':
      if (excel) return `<div class="parametros cartao"><span>${icone('file-spreadsheet')} Usando o Excel <b>${esc(excel.arquivoNome)}</b> (${fmtDataHora(excel.quando)}).</span>
        <button type="button" class="btn" data-usar-banco ${base ? '' : 'disabled'}>${icone('database')} Usar os dados do sistema</button></div>`;
      return `<div class="parametros cartao">
        <span class="mudo">Vendas de</span><input type="date" data-p="de" value="${e.de}" max="${hoje()}"><span class="mudo">até</span><input type="date" data-p="ate" value="${e.ate}" max="${hoje()}">
        <button type="button" class="btn" data-ler-periodo>${icone('refresh')} Aplicar período</button>
        <label class="check pequeno"><input type="checkbox" data-p="sugMinimo" ${e.sugMinimo ? 'checked' : ''}><span>Incluir também os abaixo do estoque mínimo que não venderam no período</span></label>
        <span class="mudo pequeno">Quantidade = o maior entre o mínimo da curva, o estoque mínimo do Trier e as vendas do período, menos o saldo (com as regras de Fat).</span>
        ${blocoExcel(false)}</div>`;
    case 'curto':
      return `<div class="parametros cartao"><span>Zerados (saldo ≤ 0) que venderam nos últimos</span>
        <input type="number" min="1" max="3650" data-p="curtoDias" value="${e.curtoDias}" class="num-curto"><span>dias</span>
        ${chipsDias('curtoDias', [7, 30, 90, 180])}
        <span class="mudo pequeno">Tudo entra com 1; ajuste olhando a venda da semana.</span></div>`;
    case 'industria': {
      const ind = chaveIndustria();
      const cfg = ind ? industrias.get(ind.chave) || {} : {};
      return `<div class="parametros cartao">
        <span>Demanda para</span><input type="number" min="1" max="365" data-p="indDias" value="${e.indDias}" class="num-curto"><span>dias</span>
        ${chipsDias('indDias', [30, 45, 60, 90])}
        <span class="mudo">venda média dos últimos</span>${sel('indBase', [30, 90, 180])}
        <label class="check pequeno"><input type="checkbox" data-p="indTodos" ${e.indTodos ? 'checked' : ''}><span>Mostrar também os que não precisam</span></label>
        ${ind ? `<span class="separador"></span>
          <span>Pedido mínimo R$</span><input type="number" min="0" step="0.01" data-ind="minimo" value="${cfg.minimo ?? ''}" class="num-medio">
          <span>Desconto %</span><input type="number" min="0" max="100" step="0.1" data-ind="desconto" value="${cfg.desconto ?? ''}" class="num-curto">
          <button type="button" class="btn" data-salvar-ind>${icone('device-floppy')} Salvar p/ ${esc(ind.nome)}</button>` : ''}
      </div>`;
    }
    case 'parados':
      return `<div class="parametros cartao"><span>Com estoque e sem venda há pelo menos</span>${sel('paradosDias', [30, 60, 90, 180, 365])}</div>`;
    case 'cobertura':
      return `<div class="parametros cartao"><span>Venda média dos últimos</span>${sel('cobBase', [30, 90, 180])}
        <span class="mudo pequeno">Cobertura = saldo ÷ venda por dia. Clique numa faixa para filtrar.</span></div>`;
    default: return '';
  }
}

// Atalhos de dias (o campo ao lado aceita qualquer número)
const chipsDias = (k, dias) => `<span class="chips">${dias.map((d) => `<button type="button" class="chip-dia ${Number(estado[k]) === d ? 'ativo' : ''}" data-alvo="${k}" data-dias="${d}">${d}</button>`).join('')}</span>`;

function blocoExcel(sozinho) {
  return `<label class="btn ${sozinho ? 'pri' : ''}">${icone('upload')} ${sozinho ? 'Carregar o Excel "Sugestão de Compras" do Trier' : 'Usar Excel do Trier'}
    <input type="file" accept=".xls,.xlsx" hidden data-arquivo-input></label>`;
}
function ligarExcel(raiz) {
  const input = $('[data-arquivo-input]', raiz);
  if (!input) return;
  input.onchange = async (e) => {
    const arq = e.target.files[0];
    e.target.value = '';
    if (!arq) return;
    toast('Lendo relatório…');
    try {
      await carregarRegras();
      const itens = montarLista(lerRelatorio(await lerPlanilha(arq)), config, regras, regrasMarca);
      excel = { arquivoNome: arq.name, itens, quando: agoraLocal() };
      delete estado.ajustes.excel;
      estado.aba = 'sugestao';
      guardar();
      desenhar();
      toast(`${itens.length} produtos carregados do Excel`, 'ok');
    } catch (err) {
      console.error(err);
      toast(`Erro: ${err.message}`, 'erro');
    }
  };
}

function ligarParametros(raiz) {
  ligarExcel(raiz);
  $$('[data-p]', raiz).forEach((el) => {
    el.addEventListener('change', () => {
      const k = el.dataset.p;
      if (k === 'de' || k === 'ate') { estado[k] = el.value; return; } // aplica no botão
      estado[k] = el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' || el.type === 'number' ? Number(el.value) : el.value);
      guardar();
      if (k === 'indDias' || k === 'curtoDias') {
        if (!(estado[k] >= 1)) { estado[k] = 1; el.value = 1; }
        $$(`[data-alvo="${k}"]`, raiz).forEach((c) => c.classList.toggle('ativo', Number(c.dataset.dias) === estado[k]));
      }
      desenharTabela();
    });
  });
  $$('[data-dias]', raiz).forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.alvo;
      estado[k] = Number(b.dataset.dias);
      $(`[data-p="${k}"]`, raiz).value = estado[k];
      guardar();
      $$(`[data-alvo="${k}"]`, raiz).forEach((c) => c.classList.toggle('ativo', c === b));
      desenharTabela();
    };
  });
  const lerPeriodo = $('[data-ler-periodo]', raiz);
  if (lerPeriodo) lerPeriodo.onclick = async () => {
    if (!estado.de || !estado.ate || estado.ate < estado.de) { toast('Confira as datas do período', 'erro'); return; }
    guardar();
    await recarregar();
  };
  const usarBanco = $('[data-usar-banco]', raiz);
  if (usarBanco) usarBanco.onclick = () => { excel = null; guardar(); desenhar(); };
  const salvarInd = $('[data-salvar-ind]', raiz);
  if (salvarInd) salvarInd.onclick = async () => {
    const ind = chaveIndustria();
    const dados = {
      nome: ind.nome, minimo: Number($('[data-ind="minimo"]', raiz).value) || 0,
      desconto: Number($('[data-ind="desconto"]', raiz).value) || 0, dias: Number(estado.indDias) || 30,
    };
    try {
      await db.definir('pedido_industrias', ind.chave, dados);
      industrias.set(ind.chave, { id: ind.chave, ...dados });
      toast(`Mínimo e desconto salvos para ${ind.nome}`, 'ok');
      desenharTabela();
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };
  $$('[data-ind]', raiz).forEach((el) => el.addEventListener('input', () => desenharMetricas(itensAtuais)));
}

function barraFiltros() {
  const f = estado.f;
  const usados = (campo) => [...new Set(base.produtos.map((p) => p[campo]).filter((x) => x !== null && x !== undefined))];
  const opcoes = (tabela, campo, atual, todos) => `<option value="">${todos}</option>` + usados(campo)
    .map((id) => [String(id), nome(tabela, id) || `#${id}`]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
    .map(([id, n]) => `<option value="${esc(id)}" ${id === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const fornecedores = Object.entries(base.fornecedores).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const laboratorios = usados('lab').map((id) => [String(id), nome('laboratorios', id)]).filter((x) => x[1]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  return `<div class="filtros filtros-pedido">
    <div class="busca">${icone('search')}<input type="search" placeholder="Buscar produto, laboratório ou EAN" value="${esc(f.busca)}" data-f="busca"></div>
    <label class="filtro-texto">${icone('flask')}<input list="lista-labs" placeholder="Laboratório" value="${esc(nome('laboratorios', f.lab))}" data-f-nome="lab"></label>
    <datalist id="lista-labs">${laboratorios.map(([, n]) => `<option value="${esc(n)}">`).join('')}</datalist>
    <label class="filtro-texto">${icone('truck')}<input list="lista-forn" placeholder="Fornecedor" value="${esc(nome('fornecedores', f.forn))}" data-f-nome="forn"></label>
    <datalist id="lista-forn">${fornecedores.map(([, n]) => `<option value="${esc(n)}">`).join('')}</datalist>
    <select data-f="grupo">${opcoes('grupos', 'grupo', f.grupo, 'Todos os grupos')}</select>
    <select data-f="depto">${opcoes('departamentos', 'depto', f.depto, 'Todos os departamentos')}</select>
    <select data-f="cat">${opcoes('categorias', 'cat', f.cat, 'Todas as categorias')}</select>
    <select data-f="curva"><option value="">Todas as curvas</option>${['A', 'B', 'C', 'D'].map((c) => `<option ${f.curva === c ? 'selected' : ''}>${c}</option>`).join('')}<option value="-" ${f.curva === '-' ? 'selected' : ''}>Sem curva</option></select>
    ${Object.entries(f).some(([k, v]) => v && k !== 'busca') ? `<button type="button" class="btn" data-limpar-filtros>${icone('filter-off')}<span class="some-celular"> Limpar</span></button>` : ''}
  </div>`;
}

function ligarFiltros(raiz) {
  $$('[data-f]', raiz).forEach((el) => el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
    estado.f[el.dataset.f] = el.value;
    guardar();
    if (el.type === 'search') desenharTabela(); else desenhar();
  }));
  $$('[data-f-nome]', raiz).forEach((el) => el.addEventListener('change', () => {
    const tabela = el.dataset.fNome === 'lab' ? 'laboratorios' : 'fornecedores';
    const alvo = normalizar(el.value.trim());
    const achado = alvo ? Object.entries(base[tabela]).find(([, n]) => normalizar(n.trim()) === alvo) : null;
    if (alvo && !achado) { toast('Escolha um nome da lista', 'erro'); return; }
    estado.f[el.dataset.fNome] = achado ? achado[0] : '';
    guardar();
    desenhar();
  }));
  const limpar = $('[data-limpar-filtros]', raiz);
  if (limpar) limpar.onclick = () => { estado.f = { busca: estado.f.busca, lab: '', forn: '', grupo: '', depto: '', cat: '', curva: '' }; estado.cobFaixa = ''; guardar(); desenhar(); };
}

// Colunas de cada aba: [título, função(item) → html da célula, classe]
const celFat = (i) => `<button type="button" class="fat ${i.fat > 1 ? 'caixa' : ''}" data-fat="${esc(i.chave)}" title="${esc(i.fatOrigem)} · clique para fixar">${i.fat}${i.fatOrigem.startsWith('Fat fixo') ? '*' : ''}</button>`;
const celProduto = (i) => `<div class="nome-produto">${esc(i.produto)}</div>
  <div class="linha-ean">${i.ean ? `<span>${esc(i.ean)}</span><button type="button" class="btn-copiar" data-copiar="${esc(i.ean)}" title="Copiar código de barras">${icone('copy')}</button>` : '<span>sem código de barras</span>'}${i.lab ? ` · ${esc(i.lab)}` : ''}</div>`;
const celCurva = (i) => `<span class="curva curva-${esc(i.curva || 'x')}">${esc(i.curva || '–')}</span>`;
const num = (v) => (v === null || v === undefined ? '' : fmtQ(v));
const COLUNAS = {
  pedido: () => [
    ['✓', (i) => `<input type="checkbox" data-acao="incluir" ${i.incluir ? 'checked' : ''} aria-label="Incluir">`, 'col-check'],
    ['Produto', celProduto], ['Curva', celCurva], ['Saldo', (i) => num(i.saldo), 'num'], ['Mín.', (i) => num(i.minimo), 'num'],
    ...(estado.aba === 'sugestao' ? [['Dem.', (i) => num(i.demanda), 'num'], ...(excel ? [] : [['Vend. período', (i) => num(i.periodo), 'num']])]
      : [['7 dias', (i) => num(i.v7), 'num'], ['30 dias', (i) => num(i.v30), 'num'], ['90 dias', (i) => num(i.v90), 'num']]),
    ['Fat', celFat, 'num'],
    ['Qtd.', (i) => `<input type="number" min="0" class="qtd" data-acao="qtd" value="${i.qtd}" aria-label="Quantidade">${i.fat > 1 && i.qtd > 0 ? `<div class="mudo pequeno">${i.qtd * i.fat} un</div>` : ''}`],
    ...(estado.aba === 'industria' ? [['Custo', (i) => (i.custo ? fmtMoeda(i.qtd * (i.fat > 1 ? i.fat : 1) * i.custo) : '–'), 'num']] : []),
    ['Motivo / observação', (i) => `<div class="motivo">${esc(i.motivo)}${i.origem ? ` · <b>${esc(i.origem)}</b>` : ''}</div>
      <input type="text" class="obs" data-acao="obs" placeholder="observação…" value="${esc(i.obs || '')}">`],
    ...(estado.aba !== 'industria' ? [['Lembrar', (i) => (i.ean ? `<input type="checkbox" data-acao="lembrar" title="Salvar essa decisão (incluir com esta quantidade ou excluir) para as próximas vezes">` : ''), 'col-check']] : []),
  ],
  parados: () => [
    ['Produto', celProduto], ['Curva', celCurva], ['Saldo', (i) => num(i.saldo), 'num'], ['Custo un.', (i) => fmtMoeda(i.custo), 'num'],
    ['Valor parado', (i) => `<b>${fmtMoeda(i.valor)}</b>`, 'num'],
    ['Última venda', (i) => (i.ultVenda ? `${fmtData(i.ultVenda)}<div class="mudo pequeno">há ${i.semVenda} dias</div>` : 'nunca (no último ano)')],
    ['Última entrada', (i) => (i.ultEntrada ? fmtData(i.ultEntrada) : '–')], ['Vendeu em 1 ano', (i) => num(i.v365), 'num'],
  ],
  cobertura: () => [
    ['Produto', celProduto], ['Curva', celCurva], ['Saldo', (i) => num(i.saldo), 'num'], ['Venda/mês', (i) => num(i.porDia * 30), 'num'],
    ['Cobertura', (i) => `<span class="faixa faixa-${i.faixa}">${i.saldo <= 0 ? 'sem estoque' : i.cob === Infinity ? 'sem venda' : `${Math.round(i.cob)} dias`}</span>`, 'num'],
    ['Valor em estoque', (i) => fmtMoeda(i.valor), 'num'], ['Fat', celFat, 'num'],
  ],
};
const colunasDaAba = () => (ABAS.find((a) => a.id === estado.aba).pedido ? COLUNAS.pedido() : COLUNAS[estado.aba]());

function desenharTabela() {
  const conteudo = $('[data-conteudo]', main);
  if (!$('tbody', conteudo)) return;
  const aviso = $('[data-aviso]', conteudo);
  aviso.innerHTML = '';
  if (estado.aba === 'industria' && !chaveIndustria()) {
    itensAtuais = [];
    aviso.innerHTML = `<div class="alerta info">${icone('info-circle')}<span>Escolha um <b>laboratório</b> ou um <b>fornecedor</b> nos filtros acima para montar o pedido direto da indústria.</span></div>`;
  } else {
    itensAtuais = itensDaAba();
  }
  let lista = itensAtuais;
  if (estado.aba === 'cobertura' && estado.cobFaixa) lista = lista.filter((i) => i.faixa === estado.cobFaixa);
  const cols = colunasDaAba();
  $('thead', conteudo).innerHTML = `<tr>${cols.map(([t, , c]) => `<th class="${c || ''}">${esc(t)}</th>`).join('')}</tr>`;
  const mostrar = lista.slice(0, LIMITE_TELA);
  $('tbody', conteudo).innerHTML = mostrar.map((i) => `<tr data-chave="${esc(i.chave)}" class="${i.incluir === false && ABAS.find((a) => a.id === estado.aba).pedido ? 'excluido' : ''}">
    ${cols.map(([, f, c]) => `<td class="${c || ''}">${f(i)}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${cols.length}" class="vazio">${estado.aba === 'industria' && !chaveIndustria() ? 'Escolha um laboratório ou fornecedor.' : 'Nenhum produto com esses filtros.'}</td></tr>`;
  $('[data-info]', conteudo).textContent = lista.length > LIMITE_TELA
    ? `Mostrando ${LIMITE_TELA} de ${lista.length.toLocaleString('pt-BR')} produtos. Use os filtros para ver os outros (as exportações levam todos).`
    : `${lista.length.toLocaleString('pt-BR')} produto(s)`;
  desenharMetricas(itensAtuais);
}

function metrica(rotulo, valor, extra = '') {
  return `<div class="metrica ${extra}"><div class="metrica-rotulo">${rotulo}</div><div class="metrica-valor">${valor}</div></div>`;
}
const valorItem = (i) => i.qtd * (i.fat > 1 ? i.fat : 1) * (i.custo || 0);

function desenharMetricas(itens) {
  const el = $('[data-metricas]', main);
  if (!el) return;
  const incl = itens.filter((i) => i.incluir && i.qtd > 0);
  switch (estado.aba) {
    case 'sugestao': case 'curto':
      el.innerHTML = metrica('Produtos na lista', itens.length) + metrica('No pedido', incl.length, 'destaque')
        + metrica('Unidades (caixas contam 1)', incl.reduce((s, i) => s + i.qtd, 0))
        + (excel ? '' : metrica('Custo estimado', fmtMoeda(incl.reduce((s, i) => s + valorItem(i), 0))));
      break;
    case 'industria': {
      const ind = chaveIndustria();
      if (!ind) { el.innerHTML = ''; break; }
      const minimo = Number($('[data-ind="minimo"]', main)?.value) || 0;
      const desconto = Number($('[data-ind="desconto"]', main)?.value) || 0;
      const bruto = incl.reduce((s, i) => s + valorItem(i), 0);
      const liquido = bruto * (1 - desconto / 100);
      const falta = minimo - liquido;
      el.innerHTML = metrica('No pedido', `${incl.length} itens`, 'destaque') + metrica('Total a custo', fmtMoeda(bruto))
        + (desconto ? metrica(`Com ${desconto.toLocaleString('pt-BR')}% de desconto`, fmtMoeda(liquido)) : '')
        + (minimo ? metrica('Pedido mínimo', `${fmtMoeda(minimo)}<div class="metrica-sub ${falta > 0 ? 'negativo' : 'positivo'}">${falta > 0 ? `faltam ${fmtMoeda(falta)}` : 'mínimo atingido'}</div>`) : '');
      break;
    }
    case 'parados':
      el.innerHTML = metrica('Produtos parados', itens.length.toLocaleString('pt-BR'), 'destaque')
        + metrica('Valor parado (custo)', fmtMoeda(itens.reduce((s, i) => s + i.valor, 0)))
        + metrica('Unidades', itens.reduce((s, i) => s + i.saldo, 0).toLocaleString('pt-BR'));
      break;
    case 'cobertura':
      el.innerHTML = FAIXAS.map((f) => {
        const da = itens.filter((i) => i.faixa === f.id);
        return `<button type="button" class="metrica faixa-card ${f.cor} ${estado.cobFaixa === f.id ? 'ativa' : ''}" data-faixa="${f.id}">
          <div class="metrica-rotulo">${esc(f.nome)}</div><div class="metrica-valor">${da.length.toLocaleString('pt-BR')}</div>
          <div class="metrica-sub">${fmtMoeda(da.reduce((s, i) => s + i.valor, 0))} em estoque</div></button>`;
      }).join('');
      $$('[data-faixa]', el).forEach((b) => { b.onclick = () => { estado.cobFaixa = estado.cobFaixa === b.dataset.faixa ? '' : b.dataset.faixa; guardar(); desenharTabela(); }; });
      break;
    default: el.innerHTML = '';
  }
}

// ---------- tabela: edições ----------
function ligarTabela(raiz) {
  const corpo = $('tbody', raiz);
  const item = (el) => itensAtuais.find((i) => i.chave === el.closest('tr')?.dataset.chave);

  corpo.addEventListener('change', async (e) => {
    const i = item(e.target);
    if (!i) return;
    const acao = e.target.dataset.acao;
    if (acao === 'incluir') { i.incluir = e.target.checked; gravarAjuste(i, 'incluir', i.incluir); e.target.closest('tr').classList.toggle('excluido', !i.incluir); }
    if (acao === 'qtd') {
      i.qtd = Math.max(0, parseInt(e.target.value || '0', 10));
      gravarAjuste(i, 'qtd', i.qtd);
      if (i.qtd > 0 && !i.incluir) { i.incluir = true; gravarAjuste(i, 'incluir', true); desenharTabela(); return; }
    }
    if (acao === 'obs') gravarAjuste(i, 'obs', e.target.value);
    if (acao === 'lembrar' && e.target.checked) {
      try {
        await salvarRegraProduto(i);
        toast(`Regra salva para "${i.produto}"`, 'ok');
      } catch (err) { e.target.checked = false; toast(mensagemErro(err), 'erro'); }
    }
    desenharMetricas(itensAtuais);
  });
  corpo.addEventListener('click', async (e) => {
    const copiar = e.target.closest('[data-copiar]');
    if (copiar) {
      try { await navigator.clipboard.writeText(copiar.dataset.copiar); toast(`Código ${copiar.dataset.copiar} copiado`, 'ok'); }
      catch { toast('Não consegui copiar; selecione o código manualmente', 'erro'); }
      return;
    }
    const fat = e.target.closest('[data-fat]');
    if (fat) { const i = item(fat); if (i) abrirFat(i); }
  });
}

// No Excel o ajuste fica no próprio item (como antes); nos dados do sistema, no mapa de ajustes do dia
function gravarAjuste(i, campo, valor) {
  if (estado.aba === 'sugestao' && excel) {
    const x = excel.itens.find((y) => y.ean === i.chave);
    if (x) { if (campo === 'qtd') x.quantidade_final = valor; else if (campo === 'incluir') x.incluir = valor; else x.observacao = valor; }
    guardar();
    return;
  }
  ajustar(i.chave, campo, valor);
}

async function salvarRegraProduto(i) {
  const regra = {
    ...(regras.get(i.ean) || {}), ean: i.ean, produto: i.produto,
    incluir_sempre: i.incluir, excluir_sempre: !i.incluir,
    quantidade_fixa: i.incluir ? i.qtd : null,
    observacao: i.obs || '',
  };
  delete regra.id;
  await db.definir('pedido_regras', i.ean, regra);
  regras.set(i.ean, regra);
  i.origem = i.incluir ? 'regra: quantidade fixa' : 'regra: sempre excluir';
}

function abrirFat(i) {
  if (!i.ean) { toast('Produto sem código de barras: não dá para salvar regra', 'erro'); return; }
  const regra = regras.get(i.ean) || {};
  const forn = (i.forn || []);
  const corpo = html(`<div class="regras-pedido">
    <p><b>${esc(i.produto)}</b><br><span class="mudo pequeno">Fat atual: <b>${i.fat}</b> (${esc(i.fatOrigem)})</span></p>
    ${forn.length ? `<div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Fornecedor</th><th class="num">Fat</th><th>Última compra</th></tr></thead>
      <tbody>${forn.map((f) => `<tr><td>${esc(nome('fornecedores', f[0]) || `#${f[0]}`)}</td><td class="num">${Number(f[1]) || 1}</td><td>${fmtData(f[2])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mudo pequeno">Sem compras nos últimos 3 anos.</p>'}
    <p class="mudo pequeno">Fat é quantas unidades vêm na embalagem do fornecedor. Com Fat maior que 1, o pedido sai com 1 (uma caixa).
      Fixe um valor quando o da última compra não servir; ele vale em todas as abas até ser removido.</p>
    <div class="linha-form"><input type="number" min="1" data-novo-fat placeholder="Fat fixo" value="${regra.fat_fixo || ''}">
      <button type="button" class="btn pri" data-salvar>${icone('check')} Fixar Fat</button>
      ${regra.fat_fixo ? `<button type="button" class="btn perigo" data-remover>${icone('trash')} Remover Fat fixo</button>` : ''}</div>
  </div>`);
  const { fechar } = abrirDialogo('Faturação (Fat)', corpo);
  const salvar = async (fatFixo) => {
    const nova = { ...regra, ean: i.ean, produto: i.produto, fat_fixo: fatFixo };
    delete nova.id;
    try {
      await db.definir('pedido_regras', i.ean, nova);
      regras.set(i.ean, nova);
      if (excel) excel.itens.forEach((x) => { if (x.ean === i.ean && fatFixo) { x.fat = fatFixo; x.fat_fixo = true; } });
      guardar();
      fechar();
      toast(fatFixo ? `Fat ${fatFixo} fixado para "${i.produto}"` : 'Fat fixo removido', 'ok');
      desenharTabela();
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };
  $('[data-salvar]', corpo).onclick = () => {
    const v = parseInt($('[data-novo-fat]', corpo).value || '0', 10);
    if (!(v >= 1)) { toast('Digite um Fat de 1 ou mais', 'erro'); return; }
    salvar(v);
  };
  const remover = $('[data-remover]', corpo);
  if (remover) remover.onclick = () => salvar(null);
}

// ---------- exportação ----------
const nomeArquivo = (prefixo, ext) => `${prefixo}_${agoraLocal().replace('T', '_').replace(':', '').slice(0, 15)}.${ext}`;
function listaExportar() {
  let lista = itensAtuais;
  if (estado.aba === 'cobertura' && estado.cobFaixa) lista = lista.filter((i) => i.faixa === estado.cobFaixa);
  return lista;
}

function exportar(tipo) {
  const aba = ABAS.find((a) => a.id === estado.aba);
  const lista = listaExportar();
  const pedido = lista.filter((i) => i.incluir && i.qtd > 0);
  if (tipo === 'csv') {
    const comEan = pedido.filter((i) => /^\d{8,14}$/.test(i.ean));
    if (!comEan.length) { toast('Nenhum produto marcado para o pedido', 'erro'); return; }
    baixarArquivo(nomeArquivo('pedido_site', 'csv'), comEan.map((i) => `${i.ean};${Math.trunc(i.qtd)}`).join('\r\n') + '\r\n');
    const semEan = pedido.length - comEan.length;
    toast(`pedido_site.csv exportado (${comEan.length} produtos)${semEan ? ` · ${semEan} sem código de barras ficaram de fora` : ''}`, 'ok');
  } else if (tipo === 'txt') {
    if (!pedido.length) { toast('Nenhum produto marcado para o pedido', 'erro'); return; }
    baixarArquivo(nomeArquivo(`pedido_${aba.id}`, 'txt'), pedido.map((i) => `${Math.trunc(i.qtd)} ${i.produto}`).join('\r\n') + '\r\n', 'text/plain;charset=utf-8');
    toast(`TXT exportado (${pedido.length} produtos)`, 'ok');
  } else if (tipo === 'xlsx') {
    exportarExcel(aba, aba.pedido ? pedido : lista);
  } else if (tipo === 'imprimir') {
    imprimir(aba, aba.pedido ? pedido : lista);
  }
}

function linhasPlanilha(aba, lista) {
  if (aba.pedido) {
    return [['EAN', 'Produto', 'Laboratório', 'Curva', 'Saldo', 'Fat', 'Quantidade', 'Unidades', 'Custo estimado', 'Motivo', 'Observação'],
      ...lista.map((i) => [i.ean, i.produto, i.lab, i.curva, i.saldo, i.fat, i.qtd, i.qtd * (i.fat > 1 ? i.fat : 1), i.custo ? Math.round(valorItem(i) * 100) / 100 : '', i.motivo, i.obs || ''])];
  }
  if (aba.id === 'parados') {
    return [['EAN', 'Produto', 'Laboratório', 'Curva', 'Saldo', 'Custo unitário', 'Valor parado', 'Última venda', 'Dias sem venda', 'Última entrada', 'Vendeu em 1 ano'],
      ...lista.map((i) => [i.ean, i.produto, i.lab, i.curva, i.saldo, i.custo, Math.round(i.valor * 100) / 100, i.ultVenda ? fmtData(i.ultVenda) : '', i.semVenda ?? '', i.ultEntrada ? fmtData(i.ultEntrada) : '', i.v365])];
  }
  return [['EAN', 'Produto', 'Laboratório', 'Curva', 'Saldo', 'Venda por mês', 'Cobertura (dias)', 'Faixa', 'Valor em estoque'],
    ...lista.map((i) => [i.ean, i.produto, i.lab, i.curva, i.saldo, Math.round(i.porDia * 300) / 10, i.cob === Infinity ? 'sem venda' : Math.round(i.cob),
      FAIXAS.find((f) => f.id === i.faixa)?.nome || '', Math.round(i.valor * 100) / 100])];
}

function exportarExcel(aba, lista) {
  const XLSX = window.XLSX;
  if (!XLSX) { toast('O gerador de planilhas não carregou. Confira a internet e recarregue.', 'erro'); return; }
  if (!lista.length) { toast('Nada para exportar', 'erro'); return; }
  const ws = XLSX.utils.aoa_to_sheet(linhasPlanilha(aba, lista));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31));
  XLSX.writeFile(wb, nomeArquivo(`pedido_${aba.id}`, 'xlsx'));
}

function imprimir(aba, lista) {
  if (!lista.length) { toast('Nada para imprimir', 'erro'); return; }
  const [cab, ...linhas] = linhasPlanilha(aba, lista);
  const filtros = [nome('laboratorios', estado.f.lab), nome('fornecedores', estado.f.forn), estado.f.curva && `curva ${estado.f.curva}`].filter(Boolean).join(' · ');
  const w = window.open('', '_blank');
  if (!w) { toast('O navegador bloqueou a janela de impressão', 'erro'); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(aba.nome)}</title>
    <style>body{font:12px system-ui,sans-serif;margin:16px}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#555}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}</style></head>
    <body><h1>${esc(aba.nome)} · Pedido de compras</h1><p>${esc(fmtDataHora(agoraLocal()))}${filtros ? ` · ${esc(filtros)}` : ''} · ${lista.length} produto(s)</p>
    <table><thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(typeof c === 'number' ? c.toLocaleString('pt-BR') : c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ---------- gerenciar regras ----------
async function abrirRegras() {
  try { await carregarRegras(); } catch (e) { toast(mensagemErro(e), 'erro'); }
  const corpo = html(`<div class="regras-pedido">
    <section>
      <h3>Regras gerais de compra (aba Sugestão)</h3>
      <p class="mudo pequeno">Parâmetros do cálculo automático, antes de qualquer exceção.</p>
      <div class="grade">
        ${['A', 'B', 'C'].map((c) => `<div class="campo lg-t"><label class="rotulo">Mínimo curva ${c}</label><input type="number" min="0" data-curva="${c}" value="${config.curva_minimo[c]}"></div>`).join('')}
        <div class="campo lg-m"><label class="rotulo">Fat mínimo p/ "encartelado"</label><input type="number" min="1" data-fat value="${config.fator_encartelado}"></div>
      </div>
      <p class="mudo pequeno">Curva D continua sempre descontinuada (nunca compra). Encartelado só pede quando o saldo chega ao mínimo.
        Os outros produtos com Fat maior que 1 pedem 1 caixa quando precisam. Padrão: A=${CONFIG_PADRAO.curva_minimo.A}, B=${CONFIG_PADRAO.curva_minimo.B}, C=${CONFIG_PADRAO.curva_minimo.C}, Fat=${CONFIG_PADRAO.fator_encartelado}.</p>
      <div class="acoes"><button type="button" class="btn pri" data-salvar-config>${icone('check')} Salvar regras gerais</button></div>
    </section>
    <section>
      <h3>Excluir por marca (laboratório)</h3>
      <p class="mudo pequeno">Vale para todos os produtos da marca nas abas Sugestão e Pedido curto (não na Indústria). Uma regra de um produto específico continua podendo sobrepor esta.</p>
      <div class="linha-form"><input data-nova-marca placeholder="Nome da marca (ex.: EMS)"><input data-nova-marca-obs placeholder="Observação (opcional)">
        <button type="button" class="btn" data-add-marca>${icone('plus')} Excluir marca</button></div>
      <div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Marca</th><th>Observação</th><th></th></tr></thead><tbody data-marcas></tbody></table></div>
    </section>
    <section>
      <h3>Regras salvas por produto</h3>
      <p class="mudo pequeno">Criadas ao marcar "Lembrar" na tabela ou ao fixar o Fat. Apague se não fizer mais sentido.</p>
      <div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Produto</th><th>EAN</th><th>Decisão</th><th>Observação</th><th></th></tr></thead><tbody data-produtos></tbody></table></div>
    </section>
  </div>`);
  abrirDialogo('Gerenciar regras', corpo);

  const desenharMarcas = () => {
    $('[data-marcas]', corpo).innerHTML = [...regrasMarca.values()].map((r) => `<tr><td>${esc(r.marca)}</td><td>${esc(r.observacao || '')}</td>
      <td><button type="button" class="btn pequeno perigo" data-rm-marca="${esc(r.marca)}">remover</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="vazio">Nenhuma marca excluída ainda.</td></tr>';
  };
  const decisao = (r) => [r.excluir_sempre ? 'Sempre excluir' : r.quantidade_fixa !== null && r.quantidade_fixa !== undefined
    ? `Quantidade fixa: ${r.quantidade_fixa}` : r.incluir_sempre ? 'Sempre incluir' : '', r.fat_fixo ? `Fat fixo: ${r.fat_fixo}` : ''].filter(Boolean).join(' · ') || '—';
  const desenharProdutos = () => {
    $('[data-produtos]', corpo).innerHTML = [...regras.values()].map((r) => `<tr><td>${esc(r.produto || '')}</td><td>${esc(r.ean)}</td>
      <td>${esc(decisao(r))}</td><td>${esc(r.observacao || '')}</td>
      <td><button type="button" class="btn pequeno perigo" data-rm-ean="${esc(r.ean)}">remover</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="vazio">Nenhuma regra por produto salva ainda.</td></tr>';
  };
  desenharMarcas();
  desenharProdutos();

  $('[data-salvar-config]', corpo).onclick = async () => {
    const novo = {
      fator_encartelado: Math.max(1, parseInt($('[data-fat]', corpo).value || '20', 10)),
      curva_minimo: Object.fromEntries(['A', 'B', 'C'].map((c) => [c, Math.max(0, parseInt($(`[data-curva="${c}"]`, corpo).value || '0', 10))])),
    };
    try {
      await db.definir('pedido_config', 'geral', novo);
      config = mesclarConfig(novo);
      toast('Regras gerais salvas', 'ok');
      if (!excel) desenharTabela();
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };
  $('[data-add-marca]', corpo).onclick = async () => {
    const marca = $('[data-nova-marca]', corpo).value.trim();
    const observacao = $('[data-nova-marca-obs]', corpo).value.trim();
    if (!marca) { toast('Digite o nome da marca', 'erro'); return; }
    const regra = { marca: normMarca(marca), acao: 'excluir_sempre', observacao };
    try {
      await db.definir('pedido_regras_marca', idMarca(marca), regra);
      regrasMarca.set(regra.marca, regra);
      $('[data-nova-marca]', corpo).value = '';
      $('[data-nova-marca-obs]', corpo).value = '';
      desenharMarcas();
      desenharTabela();
      toast(`A marca "${regra.marca}" será sempre excluída`, 'ok');
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };
  corpo.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-rm-marca]');
    const p = e.target.closest('[data-rm-ean]');
    try {
      if (m) {
        await db.apagar('pedido_regras_marca', idMarca(m.dataset.rmMarca));
        regrasMarca.delete(normMarca(m.dataset.rmMarca));
        desenharMarcas();
        toast('Regra da marca removida');
      } else if (p) {
        await db.apagar('pedido_regras', p.dataset.rmEan);
        regras.delete(p.dataset.rmEan);
        desenharProdutos();
        toast('Regra removida');
      } else return;
      desenharTabela();
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  });
}
