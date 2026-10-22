// DRE da farmácia: resultado do mês por competência (vendas, CMV e despesas pelo vencimento) e, lado a lado, o fluxo
// de caixa (o que entrou e o que foi pago). Os números vêm do Trier pela ponte (rota /dre); a linha de cada despesa
// segue o tipo do Trier, a não ser que o administrador a classifique (coleção dre_regras). Lançamentos que não estão
// no sistema (ex.: taxa de cartão) entram à mão (coleção dre_ajustes). Só administradores.
// Endereços: dre.html (#mes=AAAA-MM) · #aba=ano&ano=AAAA · #aba=classificar
import { db } from '../../js/db.js';
import { NOME_FARMACIA, NOME_APP } from '../../js/config.js';
import { ehAdmin } from '../../js/perm.js';
import { $, $$, esc, html, icone, fmtData, fmtMoeda, fmtNum, hoje, toast, mensagemErro, normalizar, abrirDialogo } from '../../js/util.js';
import { iniciar, api as apiPonte, telaErro } from './comum.js';

const api = (caminho) => apiPonte(caminho, 'dre');
const COL_REGRAS = 'dre_regras';
const COL_AJUSTES = 'dre_ajustes';

// Linhas onde uma despesa pode cair. tipos = tipos de despesa do Trier (cadtdesp) que caem nela por padrão.
const CLASSES = [
  { id: 'impostos', nome: 'Impostos sobre vendas', tipos: [7] },
  { id: 'pessoal', nome: 'Pessoal', tipos: [1] },
  { id: 'ocupacao', nome: 'Ocupação (aluguel, energia, água)', tipos: [12] },
  { id: 'operacionais', nome: 'Despesas operacionais', tipos: [3, 11] },
  { id: 'servicos', nome: 'Serviços e sistemas', tipos: [2, 4] },
  { id: 'marketing', nome: 'Marketing', tipos: [10] },
  { id: 'taxas', nome: 'Taxas de cartão e bancárias', tipos: [6] },
  { id: 'outras', nome: 'Outras despesas', tipos: [9] },
  { id: 'financeiras', nome: 'Despesas financeiras e juros', tipos: [] },
  { id: 'prolabore', nome: 'Pró-labore', tipos: [] },
  { id: 'fora', nome: 'Não entra no DRE (retirada, investimento, empréstimo)', tipos: [] },
];
const NOME_CLASSE = Object.fromEntries(CLASSES.map((c) => [c.id, c.nome]));
const PADRAO_TIPO = Object.fromEntries(CLASSES.flatMap((c) => c.tipos.map((t) => [t, c.id])));
// Lançamentos manuais podem ir em qualquer despesa ou em "outras receitas"
const LINHAS_AJUSTE = [{ id: 'outrasReceitas', nome: 'Outras receitas (bonificação, verba etc.)' }, ...CLASSES.filter((c) => c.id !== 'fora')];
NOME_CLASSE.outrasReceitas = 'Outras receitas';

// Estrutura do DRE: l = linha (valor positivo; sinal −1 subtrai), t = total calculado
const ESTRUTURA = [
  { id: 'receita', nome: 'Receita bruta de vendas' },
  { id: 'devolucoes', nome: '(−) Devoluções de clientes', sinal: -1 },
  { id: 'impostos', nome: '(−) Impostos sobre vendas', sinal: -1 },
  { id: 'receitaLiquida', nome: '= Receita líquida', total: true },
  { id: 'cmv', nome: '(−) Custo das mercadorias vendidas (CMV)', sinal: -1 },
  { id: 'lucroBruto', nome: '= Lucro bruto', total: true },
  ...['pessoal', 'ocupacao', 'operacionais', 'servicos', 'marketing', 'taxas', 'outras'].map((id) => ({ id, nome: `(−) ${NOME_CLASSE[id]}`, sinal: -1 })),
  { id: 'resultadoOperacional', nome: '= Resultado operacional', total: true },
  { id: 'outrasReceitas', nome: '(+) Outras receitas' },
  { id: 'financeiras', nome: `(−) ${NOME_CLASSE.financeiras}`, sinal: -1 },
  { id: 'prolabore', nome: '(−) Pró-labore', sinal: -1 },
  { id: 'lucroLiquido', nome: '= Lucro líquido', total: true },
];

const cent = (n) => Math.round((Number(n) || 0) * 100) / 100;
const moeda = (n) => fmtMoeda(cent(n));
const pct = (n) => (Number.isFinite(n) ? `${fmtNum(n, 1)}%` : '—');
const numero = (s) => {
  let t = String(s ?? '').trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m, longo = false) => `${(longo ? MESES_LONGOS : MESES)[Number(m.slice(5)) - 1]}${longo ? ' de ' : '/'}${longo ? m.slice(0, 4) : m.slice(2, 4)}`;
const somarMeses = (m, n) => {
  const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const mesAtual = () => hoje().slice(0, 7);

// ---------- classificação das despesas ----------
// Descrição sem números, datas e pontuação: "ALUGUEL 09/2026" e "Aluguel 10/2026" viram a mesma regra
const normDesc = (s) => normalizar(s).toUpperCase().replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const chaveFornecedor = (d) => `f${d.fornecedorId ?? 0}`;
const chaveDescricao = (d) => `${chaveFornecedor(d)}|${normDesc(d.obs) || '-'}`;

let regras = new Map();
let ajustesCache = new Map(); // ano → lista
let avisoRegras = '';

async function carregarRegras() {
  try {
    const lista = await db.listar(COL_REGRAS, { ordem: 'criadoLocal', limite: 2000 });
    regras = new Map(lista.map((r) => [r.id, r]));
    avisoRegras = '';
  } catch (e) {
    console.error(e);
    avisoRegras = `Não consegui ler as classificações salvas (${mensagemErro(e)}). Confira se as regras do Firestore foram publicadas.`;
  }
}

// Guarda a promessa (e não a lista) para o mês e o mês anterior do mesmo ano não lerem duas vezes
function ajustesDoAno(ano) {
  if (!ajustesCache.has(ano)) {
    ajustesCache.set(ano, db.listar(COL_AJUSTES, { ordem: 'mes', de: `${ano}-01`, ate: `${ano}-12`, desc: false, limite: 1000 }).catch((e) => {
      console.error(e);
      ajustesCache.delete(ano);
      avisoRegras ||= `Não consegui ler os lançamentos manuais (${mensagemErro(e)}). Confira se as regras do Firestore foram publicadas.`;
      return [];
    }));
  }
  return ajustesCache.get(ano);
}

function classe(d) {
  const porDesc = regras.get(chaveDescricao(d));
  if (porDesc) return { linha: porDesc.linha, origem: 'descricao' };
  const porForn = regras.get(chaveFornecedor(d));
  if (porForn) return { linha: porForn.linha, origem: 'fornecedor' };
  return { linha: PADRAO_TIPO[d.tipo] || 'outras', origem: 'padrao' };
}

// ---------- dados da ponte ----------
const cacheDados = new Map();
async function dados(de, ate) {
  const ch = `${de}_${ate}`;
  if (!cacheDados.has(ch)) cacheDados.set(ch, api(`/dre?de=${de}&ate=${ate}`).catch((e) => { cacheDados.delete(ch); throw e; }));
  return cacheDados.get(ch);
}

// Calcula o DRE e o caixa de um mês a partir da resposta da ponte e dos lançamentos manuais
function calcular(r, mes, ajustes) {
  const v = r.vendas.find((x) => x.mes === mes) || { notas: 0, bruto: 0, liquido: 0, devolucoes: 0 };
  const c = r.cmv.find((x) => x.mes === mes) || { valor: 0, itens: 0, ultimaCompra: 0, custoAtual: 0, semCusto: 0 };
  const val = Object.fromEntries(ESTRUTURA.map((e) => [e.id, 0]));
  const itens = Object.fromEntries([...ESTRUTURA.map((e) => e.id), 'fora'].map((id) => [id, []]));
  val.fora = 0;
  val.receita = v.liquido;
  val.devolucoes = v.devolucoes;
  val.cmv = c.valor;
  for (const d of r.despesas) {
    if (d.vencimento?.slice(0, 7) !== mes) continue;
    const { linha, origem } = classe(d);
    val[linha] += d.valor;
    itens[linha].push({ ...d, origem });
  }
  for (const a of ajustes.filter((x) => x.mes === mes)) {
    val[a.linha] = (val[a.linha] || 0) + a.valor;
    (itens[a.linha] ||= []).push({ ajuste: true, ...a });
  }
  val.receitaLiquida = val.receita - val.devolucoes - val.impostos;
  val.lucroBruto = val.receitaLiquida - val.cmv;
  val.resultadoOperacional = val.lucroBruto - ['pessoal', 'ocupacao', 'operacionais', 'servicos', 'marketing', 'taxas', 'outras'].reduce((s, id) => s + val[id], 0);
  val.lucroLiquido = val.resultadoOperacional + val.outrasReceitas - val.financeiras - val.prolabore;
  for (const k of Object.keys(val)) val[k] = cent(val[k]);

  // Caixa: entradas baixadas no financeiro do Trier; saídas pelo dia do pagamento
  const entradas = r.entradas.filter((e) => e.mes === mes);
  const fornecedores = r.fornecedores.find((f) => f.mes === mes) || { valor: 0, titulos: 0 };
  const pagas = {};
  const pagasItens = {};
  for (const d of r.despesas) {
    if (d.pagamento?.slice(0, 7) !== mes) continue;
    const { linha, origem } = classe(d);
    pagas[linha] = (pagas[linha] || 0) + (d.pago || 0);
    (pagasItens[linha] ||= []).push({ ...d, origem });
  }
  const totalEntradas = cent(entradas.reduce((s, e) => s + e.valor, 0));
  const totalPagas = cent(Object.values(pagas).reduce((s, x) => s + x, 0));
  const caixa = { entradas, totalEntradas, fornecedores, pagas, pagasItens, totalPagas, saldo: cent(totalEntradas - fornecedores.valor - totalPagas) };
  const pendentes = r.despesas.filter((d) => d.vencimento?.slice(0, 7) === mes && d.tipo === 9 && classe(d).origem === 'padrao').length;
  return { mes, val, itens, vendas: v, cmv: c, caixa, pendentes };
}

// ---------- página ----------
const ABAS = [
  { id: 'mes', rot: 'Mês', icone: 'calendar-month' },
  { id: 'ano', rot: 'Ano', icone: 'calendar-stats' },
  { id: 'classificar', rot: 'Classificar despesas', icone: 'tags' },
];

async function pagina(main) {
  const q = new URLSearchParams(location.hash.slice(1));
  const aba = ABAS.some((a) => a.id === q.get('aba')) ? q.get('aba') : 'mes';
  main.innerHTML = '';
  if (!ehAdmin()) {
    main.append(html(`<div class="pagina"><div class="alerta atencao">${icone('lock')}<span>O DRE é só para administradores.</span></div></div>`));
    return;
  }
  main.append(html(`<div class="pagina dre">
    <div class="pagina-topo">
      <h1>${icone('report-money')} DRE</h1>
      <div class="botoes dre-botoes"></div>
    </div>
    <div class="seg abas dre-abas" role="tablist">${ABAS.map((a) => `<label><input type="radio" name="dre-aba" value="${a.id}" ${a.id === aba ? 'checked' : ''}>
      <span>${icone(a.icone)} ${esc(a.rot)}</span></label>`).join('')}</div>
    <div class="dre-corpo"><div class="vazio">${icone('loader-2 girar')} Lendo o sistema…</div></div>
  </div>`));
  $$('input[name="dre-aba"]', main).forEach((r) => {
    r.onchange = () => { location.hash = r.value === 'mes' ? '' : `aba=${r.value}`; };
  });
  const corpo = $('.dre-corpo', main);
  const botoes = $('.dre-botoes', main);
  try {
    if (!regras.size && !avisoRegras) await carregarRegras();
    if (aba === 'ano') await abaAno(corpo, botoes, Number(q.get('ano')) || Number(mesAtual().slice(0, 4)));
    else if (aba === 'classificar') await abaClassificar(corpo);
    else await abaMes(corpo, botoes, /^\d{4}-\d{2}$/.test(q.get('mes') || '') ? q.get('mes') : somarMeses(mesAtual(), -1));
  } catch (e) {
    console.error(e);
    corpo.innerHTML = telaErro(e);
  }
}

const avisoTopo = () => (avisoRegras ? `<div class="alerta atencao">${icone('alert-triangle')}<span>${esc(avisoRegras)}</span></div>` : '');
const classeValor = (n) => (n < 0 ? 'negativo' : '');

// ---------- aba Mês ----------
async function abaMes(corpo, botoes, mes) {
  const anterior = somarMeses(mes, -1);
  const [r, ajA, ajB] = await Promise.all([dados(anterior, mes), ajustesDoAno(anterior.slice(0, 4)), ajustesDoAno(mes.slice(0, 4))]);
  const ajustes = [...new Map([...ajA, ...ajB].map((x) => [x.id, x])).values()];
  const m = calcular(r, mes, ajustes);
  const a = calcular(r, anterior, ajustes);
  const base = m.val.receitaLiquida;
  const parcial = mes >= mesAtual();

  botoes.innerHTML = `<input type="month" class="dre-mes" value="${mes}" max="${mesAtual()}" aria-label="Mês">
    <button type="button" class="btn" data-csv title="Planilha (CSV)">${icone('file-spreadsheet')}<span class="some-celular"> CSV</span></button>
    <button type="button" class="btn" data-imprimir title="Imprimir">${icone('printer')}<span class="some-celular"> Imprimir</span></button>`;
  $('.dre-mes', botoes).onchange = (e) => { if (e.target.value) location.hash = `mes=${e.target.value}`; };
  $('[data-imprimir]', botoes).onclick = () => window.print();
  $('[data-csv]', botoes).onclick = () => baixarCSV(`dre_${mes}`, [
    ['Linha', nomeMes(mes, true), '% receita líquida', nomeMes(anterior, true)],
    ...ESTRUTURA.map((e) => [e.nome, fmtNum(m.val[e.id]), base ? fmtNum(m.val[e.id] / base * 100, 1) : '', fmtNum(a.val[e.id])]),
    ['Não entra no DRE', fmtNum(m.val.fora), '', fmtNum(a.val.fora)],
    [], ['Fluxo de caixa', nomeMes(mes, true)],
    ...m.caixa.entradas.map((e) => [`(+) ${e.nome}`, fmtNum(e.valor)]),
    ['(−) Fornecedores de mercadoria', fmtNum(m.caixa.fornecedores.valor)],
    ...Object.entries(m.caixa.pagas).map(([l, v]) => [`(−) ${NOME_CLASSE[l]}`, fmtNum(v)]),
    ['= Saldo do mês', fmtNum(m.caixa.saldo)],
  ]);

  const c = m.cmv;
  const variacao = (atual, ant) => (ant ? `${atual >= ant ? '▲' : '▼'} ${fmtNum(Math.abs((atual - ant) / Math.abs(ant)) * 100, 0)}%` : '');
  const linhaDre = (e) => {
    const v = m.val[e.id];
    const temItens = !e.total && (m.itens[e.id] || []).length;
    const sub = e.id === 'receita' && m.vendas.bruto > v
      ? `<small class="mudo">${fmtNum(m.vendas.notas, 0)} vendas · preço cheio ${moeda(m.vendas.bruto)} (desconto médio ${pct((1 - v / m.vendas.bruto) * 100)})</small>`
      : e.id === 'cmv' && c.itens ? `<small class="mudo">${pct(base ? v / base * 100 : NaN)} da receita líquida</small>` : '';
    return `<tr class="${e.total ? 'dre-total' : ''} ${temItens ? 'dre-abre' : ''}" ${temItens ? `data-linha="${e.id}"` : ''}>
      <td>${temItens ? icone('chevron-right') : ''}${esc(e.nome)}${sub}</td>
      <td class="num ${e.total ? classeValor(v) : ''}">${moeda(v)}</td>
      <td class="num mudo">${base ? pct(v / base * 100) : '—'}</td>
      <td class="num some-celular mudo">${moeda(a.val[e.id])}<small>${e.total ? variacao(v, a.val[e.id]) : ''}</small></td></tr>
      ${temItens ? `<tr class="dre-itens" data-itens="${e.id}" hidden><td colspan="4">${tabelaItens(m.itens[e.id], 'valor', 'vencimento')}</td></tr>` : ''}`;
  };
  const linhaCaixa = (rot, v, { total = false, linha = '' } = {}) => `<tr class="${total ? 'dre-total' : ''} ${linha ? 'dre-abre' : ''}" ${linha ? `data-linha="cx-${linha}"` : ''}>
      <td>${linha ? icone('chevron-right') : ''}${esc(rot)}</td><td class="num ${total ? classeValor(v) : ''}">${moeda(v)}</td></tr>
      ${linha ? `<tr class="dre-itens" data-itens="cx-${linha}" hidden><td colspan="2">${tabelaItens(m.caixa.pagasItens[linha], 'pago', 'pagamento')}</td></tr>` : ''}`;

  corpo.innerHTML = `${avisoTopo()}
    <p class="mudo dre-titulo-mes">${esc(NOME_FARMACIA || NOME_APP)} · <b>${esc(nomeMes(mes, true))}</b>${parcial ? ' · <span class="selo-texto atencao">mês em andamento</span>' : ''}</p>
    ${m.pendentes ? `<div class="alerta info">${icone('tags')}<span>${m.pendentes} ${m.pendentes === 1 ? 'despesa' : 'despesas'} do tipo "Despesas diversas" ainda ${m.pendentes === 1 ? 'está' : 'estão'} em "Outras despesas".</span>
      <a class="btn pequeno" href="#aba=classificar">Classificar</a></div>` : ''}
    <div class="metricas dre-metricas">
      <div class="metrica"><div class="metrica-rotulo">Receita líquida</div><div class="metrica-valor">${moeda(base)}</div></div>
      <div class="metrica"><div class="metrica-rotulo">Lucro bruto</div><div class="metrica-valor">${moeda(m.val.lucroBruto)}</div>
        <div class="mudo pequeno">margem ${base ? pct(m.val.lucroBruto / base * 100) : '—'}</div></div>
      <div class="metrica ${m.val.lucroLiquido < 0 ? 'perigo' : 'destaque'}"><div class="metrica-rotulo">Lucro líquido</div><div class="metrica-valor">${moeda(m.val.lucroLiquido)}</div>
        <div class="mudo pequeno">${base ? pct(m.val.lucroLiquido / base * 100) : '—'} da receita</div></div>
      <div class="metrica ${m.caixa.saldo < 0 ? 'perigo' : ''}"><div class="metrica-rotulo">Saldo do caixa</div><div class="metrica-valor">${moeda(m.caixa.saldo)}</div>
        <div class="mudo pequeno">entradas − pagamentos</div></div>
    </div>
    <div class="dre-grade">
      <section class="cartao dre-cartao">
        <h2>${icone('report-money')} Resultado (competência)</h2>
        <p class="mudo pequeno">Vendas e custo do mês; despesas pelo vencimento.</p>
        <table class="mini-tabela dre-tabela"><thead><tr><th>Linha</th><th class="num">${esc(nomeMes(mes))}</th><th class="num">%</th><th class="num some-celular">${esc(nomeMes(anterior))}</th></tr></thead>
          <tbody>${ESTRUTURA.map(linhaDre).join('')}</tbody></table>
        ${m.val.fora ? `<p class="mudo pequeno">Fora do DRE (retiradas, investimentos, empréstimos): <b>${moeda(m.val.fora)}</b>
          <button type="button" class="btn pequeno" data-ver-fora>Ver</button></p>
          <div data-fora hidden>${tabelaItens(m.itens.fora, 'valor', 'vencimento')}</div>` : ''}
      </section>
      <section class="cartao dre-cartao">
        <h2>${icone('cash')} Fluxo de caixa</h2>
        <p class="mudo pequeno">O que entrou e o que foi pago no mês.</p>
        <table class="mini-tabela dre-tabela"><thead><tr><th>Movimento</th><th class="num">${esc(nomeMes(mes))}</th></tr></thead>
          <tbody>
            ${m.caixa.entradas.map((e) => linhaCaixa(`(+) ${e.nome}`, e.valor)).join('') || linhaCaixa('(+) Entradas', 0)}
            ${linhaCaixa('= Total de entradas', m.caixa.totalEntradas, { total: true })}
            ${linhaCaixa(`(−) Fornecedores de mercadoria (${m.caixa.fornecedores.titulos} títulos)`, m.caixa.fornecedores.valor)}
            ${CLASSES.filter((cl) => m.caixa.pagas[cl.id]).map((cl) => linhaCaixa(`(−) ${cl.nome}`, m.caixa.pagas[cl.id], { linha: cl.id })).join('')}
            ${linhaCaixa('= Saldo do mês', m.caixa.saldo, { total: true })}
          </tbody></table>
        <p class="mudo pequeno">Lançamentos manuais entram só no resultado.</p>
      </section>
    </div>
    <p class="mudo pequeno dre-nota">${icone('info-circle')} CMV pelo custo médio do mês no Trier${c.ultimaCompra ? `; ${fmtNum(c.ultimaCompra, 0)} de ${fmtNum(c.itens, 0)} itens vendidos usaram o custo da última compra antes da venda` : ''}${c.custoAtual ? `, ${fmtNum(c.custoAtual, 0)} o custo de aquisição atual` : ''}${c.semCusto ? ` e ${fmtNum(c.semCusto, 0)} ficaram sem custo` : ''}.
      Taxas de cartão não ficam no sistema: lance à mão abaixo.</p>
    <section class="cartao dre-ajustes">
      <div class="dre-ajustes-topo"><h2>${icone('pencil-plus')} Lançamentos manuais de ${esc(nomeMes(mes, true))}</h2>
        <button type="button" class="btn" data-novo-ajuste>${icone('plus')} Adicionar</button></div>
      ${ajustes.filter((x) => x.mes === mes).length ? `<table class="mini-tabela"><tbody>${ajustes.filter((x) => x.mes === mes).map((x) => `<tr>
        <td>${esc(x.descricao)}<small class="mudo">${esc(NOME_CLASSE[x.linha] || x.linha)}</small></td><td class="num">${moeda(x.valor)}</td>
        <td class="num"><button type="button" class="btn pequeno" data-apagar-ajuste="${esc(x.id)}" title="Apagar">${icone('trash')}</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="mudo pequeno">Nenhum. Use para taxas de cartão, pró-labore pago por fora, bonificações etc.</p>'}
    </section>`;

  $$('tr.dre-abre', corpo).forEach((tr) => {
    tr.onclick = () => {
      const alvo = $(`[data-itens="${tr.dataset.linha}"]`, corpo);
      alvo.hidden = !alvo.hidden;
      tr.classList.toggle('aberta', !alvo.hidden);
    };
  });
  const verFora = $('[data-ver-fora]', corpo);
  if (verFora) verFora.onclick = () => { const f = $('[data-fora]', corpo); f.hidden = !f.hidden; };
  ligarReclassificar(corpo, r.despesas);
  $('[data-novo-ajuste]', corpo).onclick = () => novoAjuste(mes);
  $$('[data-apagar-ajuste]', corpo).forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Apagar este lançamento manual?')) return;
      try {
        await db.apagar(COL_AJUSTES, b.dataset.apagarAjuste);
        ajustesCache.delete(mes.slice(0, 4));
        toast('Lançamento apagado');
        recarregar();
      } catch (e) { toast(mensagemErro(e), 'erro'); }
    };
  });
}

function tabelaItens(lista = [], campoValor, campoData) {
  if (!lista.length) return '<p class="mudo pequeno">Nada.</p>';
  return `<table class="mini-tabela compacta"><tbody>${lista.map((d) => (d.ajuste
    ? `<tr><td>${icone('pencil')} ${esc(d.descricao)}<small class="mudo">lançamento manual</small></td><td class="num">${moeda(d.valor)}</td><td></td></tr>`
    : `<tr><td>${esc(d.fornecedor || 'Sem fornecedor')}${d.obs ? ` · ${esc(d.obs)}` : ''}
        <small class="mudo">${fmtData(d[campoData])} · ${esc(d.tipoNome || 'sem tipo')}${d.origem !== 'padrao' ? ' · classificada' : ''}</small></td>
      <td class="num">${moeda(d[campoValor])}</td>
      <td class="num"><button type="button" class="btn pequeno" data-reclassificar="${esc(d.id)}" title="Mudar a linha">${icone('tags')}</button></td></tr>`)).join('')}</tbody></table>`;
}

function ligarReclassificar(raiz, despesas) {
  $$('[data-reclassificar]', raiz).forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const d = despesas.find((x) => x.id === b.dataset.reclassificar);
      if (d) dialogoClassificar(d);
    };
  });
}

function novoAjuste(mes) {
  const form = html(`<form class="grade">
    <div class="campo"><label class="rotulo">Linha do DRE</label><select name="linha">${LINHAS_AJUSTE.map((l) => `<option value="${l.id}" ${l.id === 'taxas' ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></div>
    <div class="campo"><label class="rotulo">Descrição</label><input name="descricao" required placeholder="Ex.: taxas da maquininha"></div>
    <div class="campo"><label class="rotulo">Valor (R$)</label><input name="valor" inputmode="decimal" required placeholder="0,00"></div>
    <div class="acoes"><button type="submit" class="btn pri">${icone('check')} Salvar</button></div>
  </form>`);
  const { fechar } = abrirDialogo(`Lançamento manual · ${nomeMes(mes, true)}`, form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const valor = cent(numero(form.valor.value));
    if (!(valor > 0)) { toast('Informe um valor maior que zero.', 'erro'); return; }
    try {
      await db.criar(COL_AJUSTES, { mes, linha: form.linha.value, descricao: form.descricao.value.trim(), valor });
      ajustesCache.delete(mes.slice(0, 4));
      fechar();
      toast('Lançamento salvo');
      recarregar();
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  };
}

// Escolhe a linha de uma despesa e grava a regra: só para a descrição ou para todo o fornecedor
function dialogoClassificar(d, aoSalvar = recarregar) {
  const atual = classe(d);
  const desc = normDesc(d.obs);
  const temRegra = atual.origem !== 'padrao';
  const form = html(`<form class="grade dre-classificar-form">
    <p class="mudo">${esc(d.fornecedor || 'Sem fornecedor')}${d.obs ? ` · ${esc(d.obs)}` : ''}<br>Tipo no Trier: <b>${esc(d.tipoNome || '—')}</b> · padrão: ${esc(NOME_CLASSE[PADRAO_TIPO[d.tipo] || 'outras'])}</p>
    <div class="campo"><label class="rotulo">Linha do DRE</label><select name="linha">${CLASSES.map((c) => `<option value="${c.id}" ${c.id === atual.linha ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
    <div class="campo"><label class="rotulo">Aplicar a</label><select name="alcance">
      ${desc ? `<option value="descricao" ${atual.origem !== 'fornecedor' ? 'selected' : ''}>Só às despesas com a descrição "${esc(desc)}"</option>` : ''}
      <option value="fornecedor" ${atual.origem === 'fornecedor' || !desc ? 'selected' : ''}>Todas as despesas de ${esc(d.fornecedor || 'este fornecedor')}</option></select></div>
    <div class="acoes">${temRegra ? `<button type="button" class="btn" data-remover>${icone('arrow-back-up')} Voltar ao padrão</button>` : ''}
      <button type="submit" class="btn pri">${icone('check')} Salvar</button></div>
  </form>`);
  const { fechar } = abrirDialogo('Classificar despesa', form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const porDesc = form.alcance.value === 'descricao';
    const id = porDesc ? chaveDescricao(d) : chaveFornecedor(d);
    const dadosRegra = { linha: form.linha.value, fornecedorId: d.fornecedorId ?? 0, fornecedor: d.fornecedor || '', descricao: porDesc ? desc : '' };
    try {
      await db.definir(COL_REGRAS, id, dadosRegra);
      regras.set(id, { id, ...dadosRegra });
      // A regra da descrição vale mais que a do fornecedor: ao classificar o fornecedor inteiro, tira a desta descrição
      if (!porDesc && regras.has(chaveDescricao(d))) {
        await db.apagar(COL_REGRAS, chaveDescricao(d));
        regras.delete(chaveDescricao(d));
      }
      fechar();
      toast('Classificação salva');
      aoSalvar();
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  };
  const remover = $('[data-remover]', form);
  if (remover) remover.onclick = async () => {
    const id = atual.origem === 'descricao' ? chaveDescricao(d) : chaveFornecedor(d);
    try {
      await db.apagar(COL_REGRAS, id);
      regras.delete(id);
      fechar();
      toast('Voltou ao padrão do Trier');
      aoSalvar();
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  };
}

const recarregar = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// ---------- aba Ano ----------
async function abaAno(corpo, botoes, ano) {
  const ultimo = `${ano}-12` > mesAtual() ? mesAtual() : `${ano}-12`;
  const meses = [];
  for (let m = `${ano}-01`; m <= ultimo; m = somarMeses(m, 1)) meses.push(m);
  botoes.innerHTML = `<div class="seg dre-ano"><label><input type="radio" name="dre-ano" value="${ano - 1}"><span>${icone('chevron-left')} ${ano - 1}</span></label>
      <label><input type="radio" checked><span>${ano}</span></label>
      ${ano < Number(mesAtual().slice(0, 4)) ? `<label><input type="radio" name="dre-ano" value="${ano + 1}"><span>${ano + 1} ${icone('chevron-right')}</span></label>` : ''}</div>
    <button type="button" class="btn" data-csv title="Planilha (CSV)">${icone('file-spreadsheet')}<span class="some-celular"> CSV</span></button>
    <button type="button" class="btn" data-imprimir title="Imprimir">${icone('printer')}<span class="some-celular"> Imprimir</span></button>`;
  $$('input[name="dre-ano"]', botoes).forEach((r) => { r.onchange = () => { location.hash = `aba=ano&ano=${r.value}`; }; });
  $('[data-imprimir]', botoes).onclick = () => window.print();
  if (!meses.length) { corpo.innerHTML = '<div class="vazio cartao">Ano sem dados.</div>'; return; }

  const [r, ajustes] = await Promise.all([dados(meses[0], meses.at(-1)), ajustesDoAno(String(ano))]);
  const calc = meses.map((m) => calcular(r, m, ajustes));
  const total = (id) => cent(calc.reduce((s, c) => s + c.val[id], 0));
  const totalCaixa = cent(calc.reduce((s, c) => s + c.caixa.saldo, 0));
  const linhas = [
    ...ESTRUTURA.map((e) => ({ nome: e.nome, total: e.total, vals: calc.map((c) => c.val[e.id]), soma: total(e.id) })),
    { nome: 'Margem líquida', pct: true, vals: calc.map((c) => (c.val.receitaLiquida ? c.val.lucroLiquido / c.val.receitaLiquida * 100 : NaN)),
      soma: total('receitaLiquida') ? total('lucroLiquido') / total('receitaLiquida') * 100 : NaN },
    { nome: 'Saldo do caixa', total: true, caixa: true, vals: calc.map((c) => c.caixa.saldo), soma: totalCaixa },
  ];
  $('[data-csv]', botoes).onclick = () => baixarCSV(`dre_${ano}`, [
    ['Linha', ...meses.map((m) => nomeMes(m)), 'Total'],
    ...linhas.map((l) => [l.nome, ...l.vals.map((v) => (Number.isFinite(v) ? fmtNum(v, l.pct ? 1 : 2) : '')), Number.isFinite(l.soma) ? fmtNum(l.soma, l.pct ? 1 : 2) : '']),
  ]);
  corpo.innerHTML = `${avisoTopo()}
    <div class="metricas dre-metricas">
      <div class="metrica"><div class="metrica-rotulo">Receita líquida ${ano}</div><div class="metrica-valor">${moeda(total('receitaLiquida'))}</div></div>
      <div class="metrica"><div class="metrica-rotulo">Lucro bruto</div><div class="metrica-valor">${moeda(total('lucroBruto'))}</div></div>
      <div class="metrica ${total('lucroLiquido') < 0 ? 'perigo' : 'destaque'}"><div class="metrica-rotulo">Lucro líquido</div><div class="metrica-valor">${moeda(total('lucroLiquido'))}</div>
        <div class="mudo pequeno">${pct(linhas.at(-2).soma)} da receita</div></div>
      <div class="metrica"><div class="metrica-rotulo">Saldo do caixa</div><div class="metrica-valor">${moeda(totalCaixa)}</div></div>
    </div>
    <div class="cartao dre-rolagem"><table class="mini-tabela dre-tabela dre-anual">
      <thead><tr><th>Linha</th>${meses.map((m) => `<th class="num"><a href="#mes=${m}">${esc(nomeMes(m))}</a></th>`).join('')}<th class="num">Total</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr class="${l.total ? 'dre-total' : ''} ${l.caixa ? 'dre-caixa' : ''}"><td>${esc(l.nome)}</td>
        ${l.vals.map((v) => `<td class="num ${l.total ? classeValor(v) : ''}">${l.pct ? pct(v) : moeda(v)}</td>`).join('')}
        <td class="num"><b>${l.pct ? pct(l.soma) : moeda(l.soma)}</b></td></tr>`).join('')}</tbody></table></div>
    <p class="mudo pequeno">Clique no mês para ver o detalhe. Despesas pelo vencimento; o saldo do caixa é entradas − pagamentos.</p>`;
}

// ---------- aba Classificar ----------
const filtroClassificar = { texto: '', soPadrao: false };

async function abaClassificar(corpo) {
  const ate = mesAtual();
  const r = await dados(somarMeses(ate, -11), ate);
  // Agrupa por fornecedor + descrição normalizada (é o que a regra "só esta descrição" alcança)
  const grupos = new Map();
  for (const d of r.despesas) {
    const ch = chaveDescricao(d);
    const g = grupos.get(ch) || { ch, exemplo: d, n: 0, total: 0, ultimo: '' };
    g.n += 1;
    g.total += d.valor;
    if ((d.vencimento || '') > g.ultimo) { g.ultimo = d.vencimento; g.exemplo = d; }
    grupos.set(ch, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.total - a.total);

  corpo.innerHTML = `${avisoTopo()}
    <p class="mudo">Despesas dos últimos 12 meses agrupadas por fornecedor e descrição. Escolha em qual linha do DRE cada uma entra;
      o app lembra e aplica nos meses seguintes. Sem classificação, vale o tipo de despesa do Trier.</p>
    <div class="filtros"><div class="busca">${icone('search')}<input type="search" data-texto placeholder="Fornecedor ou descrição" value="${esc(filtroClassificar.texto)}"></div>
      <label class="check"><input type="checkbox" data-so-padrao ${filtroClassificar.soPadrao ? 'checked' : ''}> Só as que usam o padrão do Trier</label></div>
    <div data-lista></div>`;

  const desenhar = () => {
    const t = normalizar(filtroClassificar.texto);
    const vis = lista.filter((g) => (!t || normalizar(`${g.exemplo.fornecedor} ${g.exemplo.obs}`).includes(t))
      && (!filtroClassificar.soPadrao || classe(g.exemplo).origem === 'padrao'));
    $('[data-lista]', corpo).innerHTML = vis.length ? `<div class="cartao dre-rolagem"><table class="mini-tabela dre-class">
      <thead><tr><th>Fornecedor · descrição</th><th class="num some-celular">Lançamentos</th><th class="num">Total 12 meses</th><th>Linha do DRE</th></tr></thead>
      <tbody>${vis.map((g) => {
        const c = classe(g.exemplo);
        return `<tr><td>${esc(g.exemplo.fornecedor || 'Sem fornecedor')}${g.exemplo.obs ? ` · ${esc(g.exemplo.obs)}` : ''}
            <small class="mudo">${esc(g.exemplo.tipoNome || 'sem tipo')} · último ${fmtData(g.ultimo)}</small></td>
          <td class="num some-celular">${g.n}</td><td class="num">${moeda(g.total)}</td>
          <td><button type="button" class="btn pequeno dre-linha-btn" data-grupo="${esc(g.ch)}">${esc(NOME_CLASSE[c.linha])}</button>
            <small class="${c.origem === 'padrao' ? 'mudo' : 'dre-classificada'}">${c.origem === 'padrao' ? 'padrão do Trier' : c.origem === 'fornecedor' ? 'regra do fornecedor' : 'regra da descrição'}</small></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="vazio cartao">Nenhuma despesa encontrada.</div>';
    $$('[data-grupo]', corpo).forEach((b) => {
      b.onclick = () => dialogoClassificar(grupos.get(b.dataset.grupo).exemplo, desenhar);
    });
  };
  $('[data-texto]', corpo).oninput = (e) => { filtroClassificar.texto = e.target.value; desenhar(); };
  $('[data-so-padrao]', corpo).onchange = (e) => { filtroClassificar.soPadrao = e.target.checked; desenhar(); };
  desenhar();
}

// ---------- CSV ----------
function baixarCSV(nome, linhas) {
  const cel = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = html(`<a download="${esc(nome)}.csv"></a>`);
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

iniciar({
  atual: 'dre',
  modulos: ['dre'],
  titulo: 'o DRE',
  montar: async (main) => {
    window.addEventListener('hashchange', () => { window.scrollTo(0, 0); pagina(main); });
    await pagina(main);
  },
});
