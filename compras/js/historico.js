// Histórico de vendas mensais: importa o relatório "Totais por Produto" do Trier (um mês por vez)
// e mostra receita, custo, margem, gráficos e top produtos com filtros.
// Cada mês é um documento em vendas_mensais/{AAAA-MM} com a lista de produtos (campos curtos para caber no limite).
import { iniciar, db, lerPlanilha, numero } from './comum.js';
import { ehAdmin } from '../../js/perm.js';
import { $, $$, esc, html, icone, toast, mensagemErro, normalizar, agoraLocal, fmtMoeda } from '../../js/util.js';

const GRUPOS = { 10000: 'Conveniência', 4000: 'Genérico', 9000: 'Correlatos', 3000: 'Referência', 2000: 'Similar', 8000: 'Perfumaria' };
const nomeGrupo = (g) => GRUPOS[g] || 'Outros';
const SEM_GRUPO = 'sem';

// Cabeçalhos aceitos no export do Trier (sem acento, minúsculo, só letras e números) -> campo interno
const ALIASES = {
  codigo: 'c', descrproduto: 'd', descricaoproduto: 'd', produto: 'd', laboratorio: 'l', grupo: 'g',
  qtdvend: 'q', qtdvendida: 'q', custounitario: 'cu', totalvlrbruto: 'vb', valordescacres: 'vd', valordesconto: 'vd',
  totalvlrvend: 'vl', totalvlrvenda: 'vl',
};
const OBRIGATORIAS = { c: 'código', d: 'descrição', q: 'qtd vendida', vl: 'valor líquido' };
const cabecalho = (t) => String(t ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

let meses = [];   // [{ id: 'AAAA-MM', itens: [...] }]

// O relatório do Trier termina com uma linha "Total Geral:" — ela não é produto e dobraria os totais.
// (O sistema antigo gravava essa linha; aqui ela é descartada na importação e ignorada nos dados já salvos.)
const ehLinhaDeTotal = (i) => /total/i.test(String(i.c)) || /^total/i.test(String(i.d));
let graficos = {};

// ---------- importação ----------
function lerTotaisPorProduto(linhas) {
  // O cabeçalho costuma ser a 1ª linha; procura nas primeiras 30 para tolerar títulos acima
  let iCab = -1;
  let mapa = null;
  for (let i = 0; i < Math.min(30, linhas.length); i++) {
    const m = {};
    (linhas[i] || []).forEach((t, col) => { const k = ALIASES[cabecalho(t)]; if (k && m[k] === undefined) m[k] = col; });
    if (m.c !== undefined && Object.keys(m).length >= 3) { iCab = i; mapa = m; break; }
  }
  const faltando = Object.entries(OBRIGATORIAS).filter(([k]) => !mapa || mapa[k] === undefined).map(([, n]) => n);
  if (faltando.length) throw new Error(`Não encontrei estas colunas no arquivo (confira o cabeçalho do export do Trier): ${faltando.join(', ')}`);

  const itens = [];
  for (const l of linhas.slice(iCab + 1)) {
    const v = (k) => (mapa[k] === undefined ? null : l?.[mapa[k]]);
    const codigo = String(v('c') ?? '').trim();
    if (!codigo || codigo.toLowerCase() === 'nan' || /total/i.test(codigo)) continue;
    const g = parseInt(numero(v('g')), 10);
    itens.push({
      c: codigo, d: String(v('d') ?? '').trim(), l: String(v('l') ?? '').trim(), g: Number.isFinite(g) && g ? g : null,
      q: numero(v('q')), cu: numero(v('cu')), vb: numero(v('vb')), vd: numero(v('vd')), vl: numero(v('vl')),
    });
  }
  return itens;
}

async function gravarMes(mes, itens) {
  await db.definir('vendas_mensais', mes, { mes, itens, total: itens.length, importadoEm: agoraLocal() });
}

// ---------- agregações (mesmas contas do sistema antigo) ----------
function filtrarItens(f) {
  const out = [];
  for (const m of meses) {
    if (!f.meses.has(m.id)) continue;
    for (const i of m.itens) {
      if (!f.grupos.has(i.g ?? SEM_GRUPO)) continue;
      if (f.labs.size && !f.labs.has(i.l)) continue;
      out.push({ ...i, mes: m.id });
    }
  }
  return out;
}

function somar(lista, chave) {
  const mapa = new Map();
  for (const i of lista) {
    const k = chave(i);
    const a = mapa.get(k) || { chave: k, q: 0, vb: 0, vd: 0, vl: 0, custo: 0, amostra: i };
    a.q += i.q; a.vb += i.vb; a.vd += i.vd; a.vl += i.vl; a.custo += i.cu * i.q;
    mapa.set(k, a);
  }
  return [...mapa.values()];
}

// ---------- tela ----------
iniciar({
  modulo: 'historico',
  titulo: 'Histórico de vendas',
  async montar(main) {
    main.append(html(`<div class="pagina larga">
      <div class="pagina-topo">
        <h1>${icone('chart-line')} Histórico de vendas</h1>
        <button type="button" class="btn pri" data-abrir-importar>${icone('upload')} Importar mês</button>
      </div>
      <section class="cartao" data-importar hidden>
        <div class="cartao-topo"><h2>Importar relatório mensal do Trier</h2></div>
        <p class="mudo pequeno">Envie o export <b>Totais por Produto</b> (.xlsx, .xls ou .csv) de um único mês. Reenviar o mesmo mês substitui os dados.</p>
        <div class="grade">
          <div class="campo lg-m"><label class="rotulo">Mês de referência</label><input type="month" data-mes></div>
          <div class="campo lg-m"><label class="rotulo">Arquivo do Trier</label><input type="file" accept=".xlsx,.xls,.csv" data-arquivo></div>
        </div>
        <div class="acoes"><button type="button" class="btn pri" data-importar-mes>${icone('check')} Importar</button></div>
        <details class="importar-backup"><summary>Trazer dados do sistema antigo (arquivo .json)</summary>
          <p class="mudo pequeno">Use uma vez, com o arquivo <code>historico_migracao.json</code> gerado do banco antigo.</p>
          <input type="file" accept=".json,application/json" data-backup>
        </details>
      </section>
      <div class="vazio cartao" data-sem-dados hidden>Nenhum mês importado ainda. Use <b>Importar mês</b>.</div>
      <div class="historico" data-painel hidden>
        <aside class="cartao filtros-historico">
          <div class="filtro-bloco"><h3>Mês</h3><div data-f-meses></div></div>
          <div class="filtro-bloco"><h3>Grupo</h3><div data-f-grupos></div></div>
          <div class="filtro-bloco"><h3>Laboratório <span class="mudo" data-labs-sel></span></h3>
            <div class="busca">${icone('search')}<input type="search" placeholder="Buscar laboratório" data-busca-lab></div>
            <div class="lista-labs" data-f-labs></div>
            <p class="mudo pequeno">Nenhum marcado = todos.</p></div>
          <button type="button" class="btn largo" data-limpar>${icone('filter-off')} Limpar filtros</button>
        </aside>
        <div class="historico-conteudo">
          <div class="metricas" data-cartoes></div>
          <section class="cartao"><h2>Receita líquida por mês</h2><div class="grafico alto"><canvas data-g-mes></canvas></div></section>
          <div class="lado-a-lado">
            <section class="cartao"><h2>Receita por grupo</h2><div class="grafico"><canvas data-g-grupo></canvas></div></section>
            <section class="cartao"><h2>Top 10 laboratórios</h2><div class="grafico"><canvas data-g-lab></canvas></div></section>
          </div>
          <section class="cartao"><h2>Top 20 produtos <span class="mudo pequeno">por receita líquida, no período e filtros</span></h2>
            <div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Código</th><th>Produto</th><th>Laboratório</th><th>Grupo</th>
              <th class="num">Qtd</th><th class="num">Receita líquida</th><th class="num">Rentabilidade</th><th class="num">%</th></tr></thead>
              <tbody data-top></tbody></table></div>
          </section>
        </div>
      </div>
    </div>`));

    ligarImportacao(main);
    await carregarMeses(main);
  },
});

async function carregarMeses(main) {
  try {
    const docs = await db.listar('vendas_mensais', { ordem: 'mes', desc: false, limite: 240 });
    meses = docs.map((d) => ({ id: d.mes, itens: (d.itens || []).filter((i) => !ehLinhaDeTotal(i)), importadoEm: d.importadoEm }));
  } catch (e) {
    toast(mensagemErro(e), 'erro');
    meses = [];
  }
  $('[data-sem-dados]', main).hidden = meses.length > 0;
  $('[data-painel]', main).hidden = meses.length === 0;
  if (!meses.length) { $('[data-importar]', main).hidden = false; return; }
  montarFiltros(main);
  atualizar(main);
}

function montarFiltros(main) {
  const admin = ehAdmin();
  $('[data-f-meses]', main).innerHTML = meses.map((m) => `<label class="check pequeno"><input type="checkbox" value="${m.id}" checked>
    <span>${rotuloMes(m.id)} <small class="mudo">${m.itens.length} itens</small></span>
    ${admin ? `<button type="button" class="link-apagar" data-apagar-mes="${m.id}" title="Apagar este mês">${icone('trash')}</button>` : ''}</label>`).join('');

  const grupos = new Map();
  for (const m of meses) for (const i of m.itens) grupos.set(i.g ?? SEM_GRUPO, i.g ? nomeGrupo(i.g) : 'Sem grupo');
  $('[data-f-grupos]', main).innerHTML = [...grupos.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
    .map(([k, n]) => `<label class="check pequeno"><input type="checkbox" value="${k}" checked><span>${esc(n)}</span></label>`).join('');

  const labs = new Set();
  for (const m of meses) for (const i of m.itens) if (i.l) labs.add(i.l);
  $('[data-f-labs]', main).innerHTML = [...labs].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((l) => `<label class="check pequeno" data-lab="${esc(normalizar(l))}"><input type="checkbox" value="${esc(l)}"><span>${esc(l)}</span></label>`).join('');

  const aside = $('.filtros-historico', main);
  if (!aside.dataset.ligado) {
    aside.dataset.ligado = '1';
    aside.addEventListener('change', () => atualizar(main));
    $('[data-busca-lab]', main).addEventListener('input', (e) => {
      const t = normalizar(e.target.value);
      for (const el of $$('[data-lab]', main)) el.hidden = t && !el.dataset.lab.includes(t);
    });
    $('[data-limpar]', main).onclick = () => {
      for (const c of $$('[data-f-meses] input, [data-f-grupos] input', main)) c.checked = true;
      for (const c of $$('[data-f-labs] input', main)) c.checked = false;
      atualizar(main);
    };
    aside.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-apagar-mes]');
      if (!b) return;
      e.preventDefault();
      if (!confirm(`Apagar as vendas de ${rotuloMes(b.dataset.apagarMes)}? Dá para importar de novo depois.`)) return;
      try {
        await db.apagar('vendas_mensais', b.dataset.apagarMes);
        toast('Mês apagado');
        await carregarMeses(main);
      } catch (err) { toast(mensagemErro(err), 'erro'); }
    });
  }
}

const marcados = (main, sel) => new Set($$(`${sel} input:checked`, main).map((c) => c.value));
const rotuloMes = (id) => { const [a, m] = id.split('-'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1]}/${a}`; };
const pct = (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function atualizar(main) {
  const grupos = new Set([...marcados(main, '[data-f-grupos]')].map((g) => (g === SEM_GRUPO ? g : Number(g))));
  const f = { meses: marcados(main, '[data-f-meses]'), grupos, labs: marcados(main, '[data-f-labs]') };
  $('[data-labs-sel]', main).textContent = f.labs.size ? `(${f.labs.size})` : '';
  const lista = filtrarItens(f);

  // Cartões
  const t = somar(lista, () => 'total')[0] || { q: 0, vb: 0, vd: 0, vl: 0, custo: 0 };
  const rent = t.vl - t.custo;
  const margem = t.vl > 0 ? (rent / t.vl) * 100 : 0;
  const cartao = (rot, val, cls = '') => `<div class="metrica"><div class="metrica-rotulo">${rot}</div><div class="metrica-valor ${cls}">${val}</div></div>`;
  $('[data-cartoes]', main).innerHTML = [
    cartao('Receita líquida', fmtMoeda(t.vl)),
    cartao('Receita bruta', fmtMoeda(t.vb)),
    cartao('Desconto médio', t.vb > 0 ? pct(Math.abs(t.vd / t.vb) * 100) : '—'),
    cartao('Custo total', fmtMoeda(t.custo)),
    cartao('Rentabilidade', fmtMoeda(rent), rent < 0 ? 'negativo' : 'positivo'),
    cartao('Margem', pct(margem), margem < 0 ? 'negativo' : 'positivo'),
    cartao('Itens vendidos', Math.round(t.q).toLocaleString('pt-BR')),
  ].join('');

  // Gráficos
  const porMes = somar(lista, (i) => i.mes).sort((a, b) => a.chave.localeCompare(b.chave));
  const porGrupo = somar(lista, (i) => (i.g ? nomeGrupo(i.g) : 'Sem grupo')).sort((a, b) => b.vl - a.vl);
  const porLab = somar(lista, (i) => i.l || '(sem laboratório)').sort((a, b) => b.vl - a.vl).slice(0, 10);
  desenharGraficos(main, porMes, porGrupo, porLab);

  // Top 20 produtos
  const top = somar(lista, (i) => `${i.c}|${i.d}|${i.l}|${i.g}`).sort((a, b) => b.vl - a.vl).slice(0, 20);
  $('[data-top]', main).innerHTML = top.map((p) => {
    const r = p.vl - p.custo;
    const cls = r < 0 ? 'negativo' : 'positivo';
    return `<tr><td>${esc(p.amostra.c)}</td><td>${esc(p.amostra.d)}</td><td>${esc(p.amostra.l)}</td><td>${esc(p.amostra.g ? nomeGrupo(p.amostra.g) : '')}</td>
      <td class="num">${Math.round(p.q).toLocaleString('pt-BR')}</td><td class="num">${fmtMoeda(p.vl)}</td>
      <td class="num ${cls}">${fmtMoeda(r)}</td><td class="num ${cls}">${pct(p.vl ? (r / p.vl) * 100 : 0)}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="vazio">Nenhum dado para os filtros selecionados.</td></tr>';
}

function cores() {
  const css = getComputedStyle(document.documentElement);
  const v = (n, padrao) => css.getPropertyValue(n).trim() || padrao;
  return {
    pri: v('--pri', '#0f6e56'), texto: v('--texto-2', '#4f5c57'), borda: v('--borda', '#dfe5e2'),
    serie: [v('--pri', '#0f6e56'), v('--c-azul', '#185fa5'), v('--c-ambar', '#854f0b'), v('--c-roxo', '#534ab7'), v('--perigo', '#a32d2d'), v('--c-verde', '#3b6d11'), '#888780'],
  };
}

function desenharGraficos(main, porMes, porGrupo, porLab) {
  const Chart = window.Chart;
  if (!Chart) return;
  const c = cores();
  Chart.defaults.color = c.texto;
  Chart.defaults.borderColor = c.borda;
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const dica = { callbacks: { label: (ctx) => ` ${moeda(ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed)}` } };
  for (const g of Object.values(graficos)) g.destroy();

  graficos.mes = new Chart($('[data-g-mes]', main), {
    type: 'line',
    data: { labels: porMes.map((m) => rotuloMes(m.chave)), datasets: [{ data: porMes.map((m) => m.vl), borderColor: c.pri, backgroundColor: `${c.pri}22`, fill: true, tension: 0.25, pointRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: dica }, scales: { y: { beginAtZero: true, ticks: { callback: moeda } } } },
  });
  graficos.grupo = new Chart($('[data-g-grupo]', main), {
    type: 'doughnut',
    data: { labels: porGrupo.map((g) => g.chave), datasets: [{ data: porGrupo.map((g) => g.vl), backgroundColor: c.serie, borderWidth: 1 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${moeda(ctx.parsed)}` } } } },
  });
  graficos.lab = new Chart($('[data-g-lab]', main), {
    type: 'bar',
    data: { labels: porLab.map((l) => l.chave), datasets: [{ data: porLab.map((l) => l.vl), backgroundColor: c.pri, borderRadius: 4 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: dica }, scales: { x: { ticks: { callback: moeda } } } },
  });
}

function ligarImportacao(main) {
  const painel = $('[data-importar]', main);
  $('[data-abrir-importar]', main).onclick = () => { painel.hidden = !painel.hidden; };
  const agora = new Date();
  agora.setMonth(agora.getMonth() - 1); // padrão: mês passado
  $('[data-mes]', main).value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

  $('[data-importar-mes]', main).onclick = async (ev) => {
    const mes = $('[data-mes]', main).value;
    const arq = $('[data-arquivo]', main).files[0];
    if (!/^\d{4}-\d{2}$/.test(mes)) { toast('Informe o mês de referência', 'erro'); return; }
    if (!arq) { toast('Selecione o arquivo do Trier', 'erro'); return; }
    if (meses.some((m) => m.id === mes) && !confirm(`${rotuloMes(mes)} já foi importado. Substituir pelos dados deste arquivo?`)) return;
    ev.target.disabled = true;
    try {
      const itens = lerTotaisPorProduto(await lerPlanilha(arq));
      if (!itens.length) throw new Error('Nenhum registro válido encontrado no arquivo.');
      await gravarMes(mes, itens);
      toast(`${rotuloMes(mes)} importado: ${itens.length} produtos`, 'ok');
      $('[data-arquivo]', main).value = '';
      painel.hidden = true;
      await carregarMeses(main);
    } catch (e) {
      console.error(e);
      toast(e.code ? mensagemErro(e) : `Erro ao processar o arquivo: ${e.message}`, 'erro');
    } finally { ev.target.disabled = false; }
  };

  $('[data-backup]', main).onchange = async (ev) => {
    const arq = ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    try {
      const dados = JSON.parse(await arq.text());
      if (dados?.tipo !== 'farmarotina-historico-vendas' || typeof dados.meses !== 'object') throw new Error('Este não é o arquivo de migração do histórico.');
      const lista = Object.entries(dados.meses).filter(([m]) => /^\d{4}-\d{2}$/.test(m));
      const repetidos = lista.filter(([m]) => meses.some((x) => x.id === m)).map(([m]) => rotuloMes(m));
      if (!confirm(`Importar ${lista.length} mês(es): ${lista.map(([m]) => rotuloMes(m)).join(', ')}?${repetidos.length ? `\n\nJá existem e serão substituídos: ${repetidos.join(', ')}.` : ''}`)) return;
      for (const [i, [mes, itens]] of lista.entries()) {
        toast(`Importando ${rotuloMes(mes)} (${i + 1}/${lista.length})…`);
        await gravarMes(mes, itens.filter((x) => !ehLinhaDeTotal(x)));
      }
      toast(`${lista.length} mês(es) trazidos do sistema antigo`, 'ok');
      painel.hidden = true;
      await carregarMeses(main);
    } catch (e) {
      console.error(e);
      toast(e.code ? mensagemErro(e) : e.message, 'erro');
    }
  };
}

