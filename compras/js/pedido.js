// Revisão do pedido de compras: carrega o relatório do Trier, aplica regras e exporta o pedido_site.csv.
import { iniciar, db, lerPlanilha, baixarArquivo } from './comum.js';
import { CONFIG_PADRAO, mesclarConfig, lerRelatorio, montarLista, normMarca, idMarca } from './motor-pedido.js';
import { $, $$, esc, html, icone, toast, mensagemErro, normalizar, abrirDialogo, agoraLocal, fmtDataHora } from '../../js/util.js';

const GUARDADO = 'farmarotina-pedido-em-revisao'; // revisão em andamento, só neste aparelho

let config = mesclarConfig(null);
let regras = new Map();      // ean -> regra
let regrasMarca = new Map(); // MARCA -> regra
let itens = [];
let arquivoNome = '';

async function carregarRegras() {
  const [cfg, rs, rm] = await Promise.all([
    db.obter('pedido_config', 'geral').catch(() => null),
    db.listar('pedido_regras', { ordem: 'ean', desc: false, limite: 10000 }),
    db.listar('pedido_regras_marca', { ordem: 'marca', desc: false, limite: 2000 }),
  ]);
  config = mesclarConfig(cfg);
  regras = new Map(rs.map((r) => [r.ean, r]));
  regrasMarca = new Map(rm.map((r) => [normMarca(r.marca), r]));
}

function guardar() {
  try { localStorage.setItem(GUARDADO, JSON.stringify({ arquivoNome, itens, quando: agoraLocal() })); } catch { /* sem espaço */ }
}
function recuperar() {
  try { return JSON.parse(localStorage.getItem(GUARDADO)); } catch { return null; }
}

iniciar({
  modulo: 'pedido',
  titulo: 'Pedido de compras',
  async montar(main) {
    main.append(html(`<div class="pagina larga">
      <div class="pagina-topo">
        <div><h1>${icone('shopping-cart')} Revisão de pedido</h1><div class="mudo" data-arquivo></div></div>
        <div class="botoes">
          <button type="button" class="btn" data-regras>${icone('settings')} Gerenciar regras</button>
          <label class="btn pri">${icone('upload')} Carregar relatório do Trier
            <input type="file" accept=".xls,.xlsx" hidden data-arquivo-input></label>
        </div>
      </div>
      <div class="vazio cartao" data-vazio>Carregue o relatório <b>Sugestão de Compras</b> do Trier (.xls) para começar.</div>
      <div data-dados hidden>
        <div class="metricas">
          <div class="metrica"><div class="metrica-rotulo">Produtos no relatório</div><div class="metrica-valor" data-total>0</div></div>
          <div class="metrica destaque"><div class="metrica-rotulo">No pedido (site)</div><div class="metrica-valor" data-incluidos>0</div></div>
          <div class="metrica"><div class="metrica-rotulo">Excluídos</div><div class="metrica-valor" data-excluidos>0</div></div>
        </div>
        <div class="filtros">
          <div class="busca">${icone('search')}<input type="search" placeholder="Buscar produto, marca ou EAN" data-f-busca></div>
          <select data-f-curva><option value="">Todas as curvas</option><option>A</option><option>B</option><option>C</option><option>D</option></select>
          <select data-f-status><option value="">Todos os status</option><option value="incluidos">Só incluídos</option>
            <option value="excluidos">Só excluídos</option><option value="editado">Só com regra salva</option></select>
          <div class="filtros-acoes">
            <button type="button" class="btn" data-limpar title="Descartar a revisão">${icone('x')}<span class="some-celular"> Descartar</span></button>
            <button type="button" class="btn pri" data-exportar>${icone('download')} Exportar pedido_site.csv</button>
          </div>
        </div>
        <div class="tabela-rolagem"><table class="tabela-pedido">
          <thead><tr><th class="col-check" title="Incluir no pedido">✓</th><th>Produto</th><th>Marca</th><th>Curva</th><th>Saldo</th><th>Mín.</th><th>Dem.</th><th>Fat</th><th>Qtd.</th><th>Motivo / observação</th><th class="col-check" title="Salvar essa decisão para as próximas vezes">Lembrar</th></tr></thead>
          <tbody></tbody>
        </table></div>
      </div>
    </div>`));

    try { await carregarRegras(); } catch (e) { toast(mensagemErro(e), 'erro'); }

    const guardado = recuperar();
    if (guardado?.itens?.length) {
      itens = guardado.itens;
      arquivoNome = guardado.arquivoNome;
      mostrar(main, `Revisão em andamento recuperada (${fmtDataHora(guardado.quando)}).`);
    }

    $('[data-arquivo-input]', main).onchange = async (e) => {
      const arq = e.target.files[0];
      e.target.value = '';
      if (!arq) return;
      toast('Lendo relatório…');
      try {
        await carregarRegras();
        itens = montarLista(lerRelatorio(await lerPlanilha(arq)), config, regras, regrasMarca).map((i) => ({ ...i, lembrar: false }));
        arquivoNome = arq.name;
        guardar();
        mostrar(main);
        toast(`${itens.length} produtos carregados`, 'ok');
      } catch (err) {
        console.error(err);
        toast(`Erro: ${err.message}`, 'erro');
      }
    };
    for (const f of $$('[data-f-busca], [data-f-curva], [data-f-status]', main)) f.addEventListener('input', () => renderizar(main));
    $('[data-exportar]', main).onclick = exportar;
    $('[data-limpar]', main).onclick = () => {
      if (!confirm('Descartar a revisão atual? As regras salvas ("Lembrar") continuam.')) return;
      itens = [];
      try { localStorage.removeItem(GUARDADO); } catch { /* ignora */ }
      $('[data-dados]', main).hidden = true;
      $('[data-vazio]', main).hidden = false;
      $('[data-arquivo]', main).textContent = '';
    };
    $('[data-regras]', main).onclick = () => abrirRegras();
    ligarTabela(main);
  },
});

function mostrar(main, nota = '') {
  $('[data-vazio]', main).hidden = true;
  $('[data-dados]', main).hidden = false;
  $('[data-arquivo]', main).textContent = [arquivoNome, nota].filter(Boolean).join(' · ');
  renderizar(main);
}

// ---------- tabela ----------
function renderizar(main) {
  const busca = normalizar($('[data-f-busca]', main).value.trim());
  const curva = $('[data-f-curva]', main).value;
  const status = $('[data-f-status]', main).value;
  const lista = itens.filter((i) => {
    if (busca && !normalizar(`${i.produto} ${i.marca} ${i.ean}`).includes(busca)) return false;
    if (curva && i.curva !== curva) return false;
    if (status === 'incluidos' && !i.incluir) return false;
    if (status === 'excluidos' && i.incluir) return false;
    if (status === 'editado' && i.origem_decisao === 'automatico') return false;
    return true;
  });
  $('tbody', main).innerHTML = lista.map((i) => `<tr data-ean="${esc(i.ean)}" class="${i.incluir ? '' : 'excluido'}">
    <td class="col-check"><input type="checkbox" data-acao="incluir" ${i.incluir ? 'checked' : ''} aria-label="Incluir ${esc(i.produto)}"></td>
    <td><div class="nome-produto">${esc(i.produto)}</div>
      <div class="linha-ean"><span>${esc(i.ean)}</span><button type="button" class="btn-copiar" data-copiar="${esc(i.ean)}" title="Copiar código de barras">${icone('copy')} copiar</button></div></td>
    <td>${esc(i.marca)}</td>
    <td><span class="curva curva-${esc(i.curva || 'x')}">${esc(i.curva || '?')}</span></td>
    <td>${i.saldo}</td><td>${i.estoque_minimo}</td><td>${i.demanda}</td><td>${i.fat}</td>
    <td><input type="number" min="0" class="qtd" data-acao="quantidade" value="${i.quantidade_final}" aria-label="Quantidade"></td>
    <td><div class="motivo">${esc(i.motivo_sugestao)}${i.origem_decisao !== 'automatico' ? ` · <b>${esc(i.origem_decisao)}</b>` : ''}</div>
      <input type="text" class="obs" data-acao="observacao" placeholder="observação…" value="${esc(i.observacao || '')}"></td>
    <td class="col-check"><input type="checkbox" data-acao="lembrar" ${i.lembrar ? 'checked' : ''} title="Salvar essa decisão para as próximas vezes"></td>
  </tr>`).join('') || '<tr><td colspan="11" class="vazio">Nada encontrado com esses filtros.</td></tr>';

  $('[data-total]', main).textContent = itens.length;
  $('[data-incluidos]', main).textContent = itens.filter((i) => i.incluir).length;
  $('[data-excluidos]', main).textContent = itens.filter((i) => !i.incluir).length;
}

function ligarTabela(main) {
  const corpo = $('tbody', main);
  const item = (el) => itens.find((i) => i.ean === el.closest('tr')?.dataset.ean);

  corpo.addEventListener('change', async (e) => {
    const i = item(e.target);
    if (!i) return;
    const acao = e.target.dataset.acao;
    if (acao === 'incluir') { i.incluir = e.target.checked; guardar(); renderizar(main); }
    if (acao === 'quantidade') { i.quantidade_final = Math.max(0, parseInt(e.target.value || '0', 10)); guardar(); }
    if (acao === 'observacao') { i.observacao = e.target.value; guardar(); }
    if (acao === 'lembrar') {
      i.lembrar = e.target.checked;
      guardar();
      if (i.lembrar) {
        try {
          await salvarRegraProduto(i);
          toast(`Regra salva para "${i.produto}"`, 'ok');
        } catch (err) { toast(mensagemErro(err), 'erro'); }
      }
    }
  });
  corpo.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar]');
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copiar);
      toast(`Código ${b.dataset.copiar} copiado`, 'ok');
    } catch { toast('Não consegui copiar; selecione o código manualmente', 'erro'); }
  });
}

async function salvarRegraProduto(i) {
  const regra = {
    ean: i.ean, produto: i.produto,
    incluir_sempre: i.incluir, excluir_sempre: !i.incluir,
    quantidade_fixa: i.incluir ? i.quantidade_final : null,
    observacao: i.observacao || '',
  };
  await db.definir('pedido_regras', i.ean, regra);
  regras.set(i.ean, regra);
  i.origem_decisao = i.incluir ? 'regra: quantidade fixa' : 'regra: sempre excluir';
}

// ---------- exportação ----------
function exportar() {
  const incluidos = itens.filter((i) => i.incluir);
  if (!incluidos.length) { toast('Nenhum produto marcado para o pedido', 'erro'); return; }
  const linhas = incluidos.map((i) => `${i.ean};${Math.trunc(i.quantidade_final)}`).join('\r\n') + '\r\n';
  const agora = agoraLocal().replace('T', '_').replace(':', '');
  baixarArquivo(`pedido_site_${agora}.csv`, linhas);
  toast(`pedido_site.csv exportado (${incluidos.length} produtos)`, 'ok');
}

// ---------- gerenciar regras ----------
async function abrirRegras() {
  try { await carregarRegras(); } catch (e) { toast(mensagemErro(e), 'erro'); }
  const corpo = html(`<div class="regras-pedido">
    <section>
      <h3>Regras gerais de compra</h3>
      <p class="mudo pequeno">Parâmetros do cálculo automático, antes de qualquer exceção.</p>
      <div class="grade">
        ${['A', 'B', 'C'].map((c) => `<div class="campo lg-t"><label class="rotulo">Mínimo curva ${c}</label><input type="number" min="0" data-curva="${c}" value="${config.curva_minimo[c]}"></div>`).join('')}
        <div class="campo lg-m"><label class="rotulo">Fat mínimo p/ "encartelado"</label><input type="number" min="1" data-fat value="${config.fator_encartelado}"></div>
      </div>
      <p class="mudo pequeno">Curva D continua sempre descontinuada (nunca compra). Padrão: A=${CONFIG_PADRAO.curva_minimo.A}, B=${CONFIG_PADRAO.curva_minimo.B}, C=${CONFIG_PADRAO.curva_minimo.C}, Fat=${CONFIG_PADRAO.fator_encartelado}.</p>
      <div class="acoes"><button type="button" class="btn pri" data-salvar-config>${icone('check')} Salvar regras gerais</button></div>
    </section>
    <section>
      <h3>Excluir por marca (laboratório)</h3>
      <p class="mudo pequeno">Vale para todos os produtos da marca. Uma regra de um produto específico continua podendo sobrepor esta.</p>
      <div class="linha-form"><input data-nova-marca placeholder="Nome da marca (ex.: EMS)"><input data-nova-marca-obs placeholder="Observação (opcional)">
        <button type="button" class="btn" data-add-marca>${icone('plus')} Excluir marca</button></div>
      <div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Marca</th><th>Observação</th><th></th></tr></thead><tbody data-marcas></tbody></table></div>
    </section>
    <section>
      <h3>Regras salvas por produto</h3>
      <p class="mudo pequeno">Criadas ao marcar "Lembrar" na tabela. Apague se não fizer mais sentido.</p>
      <div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Produto</th><th>EAN</th><th>Decisão</th><th>Observação</th><th></th></tr></thead><tbody data-produtos></tbody></table></div>
    </section>
  </div>`);
  abrirDialogo('Gerenciar regras', corpo);

  const desenharMarcas = () => {
    $('[data-marcas]', corpo).innerHTML = [...regrasMarca.values()].map((r) => `<tr><td>${esc(r.marca)}</td><td>${esc(r.observacao || '')}</td>
      <td><button type="button" class="btn pequeno perigo" data-rm-marca="${esc(r.marca)}">remover</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="vazio">Nenhuma marca excluída ainda.</td></tr>';
  };
  const decisao = (r) => (r.excluir_sempre ? 'Sempre excluir' : r.quantidade_fixa !== null && r.quantidade_fixa !== undefined
    ? `Quantidade fixa: ${r.quantidade_fixa}` : r.incluir_sempre ? 'Sempre incluir' : '—');
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
      toast('Regras gerais salvas. Carregue o relatório de novo para aplicar.', 'ok');
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
      }
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  });
}
