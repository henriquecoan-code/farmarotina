import { db } from '../db.js';
import { podeEditar } from '../perm.js';
import { exportarCSV, imprimir } from '../export.js';
import { listarAgendadas, telefones, cartaoAgenda } from '../agenda.js';
import { $, esc, html, icone, normalizar, fmtData, mensagemErro, toast } from '../util.js';
import { schemaPorId } from '../modulos/index.js';

const filtrosSalvos = {}; // lembra o filtro de cada módulo enquanto o app está aberto

// Módulos com "porMes" (ex.: temperatura) mostram um mês por vez
const mesAtual = () => new Date().toLocaleDateString('sv-SE').slice(0, 7);
function somarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const nomeMes = (mes) => new Date(`${mes}-15T12:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

// Etiqueta colorida opcional na linha (ex.: tipo da troca), para reconhecer de relance
const etiquetaCor = (e) => (e ? `<span class="etiqueta cor-${e.cor}">${esc(e.texto)}</span> ` : '');

// Ação rápida na linha (ex.: "Concluir" troca), sem abrir o registro
export function botaoAcaoRapida(schema, d, comTexto = false) {
  const acao = schema.acaoRapida;
  if (!acao || !acao.quando(d) || !podeEditar(schema)) return '';
  return `<button type="button" class="btn ${comTexto ? '' : 'pequeno'} acao-rapida" data-acao-rapida data-schema="${schema.id}" data-id="${esc(d.id)}" title="${esc(acao.rot)}">${icone(acao.icone)} ${esc(acao.rot)}</button>`;
}

// Linhas de tabela clicáveis (ex.: mini tabela de temperatura)
document.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a, button')) location.hash = tr.dataset.href;
});

// Clique em qualquer botão de ação rápida (lista, histórico, página do registro): grava e recarrega a tela
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acao-rapida]');
  if (!b) return;
  e.preventDefault();
  const schema = schemaPorId(b.dataset.schema);
  b.disabled = true;
  try {
    const doc = await db.obter(schema.id, b.dataset.id);
    await db.atualizar(schema.id, b.dataset.id, schema.acaoRapida.dados(doc));
    toast(schema.acaoRapida.msg, 'ok');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (err) {
    b.disabled = false;
    toast(mensagemErro(err), 'erro');
  }
});

export function linhaRegistro(schema, d) {
  const a = schema.alerta?.(d);
  const valor = schema.valor?.(d) || '';
  const acao = botaoAcaoRapida(schema, d);
  const linha = `<a class="linha ${a ? 'com-alerta ' + a.nivel : ''}" href="#/m/${schema.id}/${d.id}">
    <div class="linha-texto"><div class="linha-titulo">${etiquetaCor(schema.etiqueta?.(d))}${esc(schema.titulo(d))}</div>
    <div class="linha-sub">${esc(schema.sub?.(d) || '')}</div></div>
    <div class="linha-valor">${valor ? `<span>${esc(valor)}</span>` : ''}
    ${a ? `<span class="selo ${a.nivel}">${icone(a.nivel === 'perigo' ? 'alert-triangle' : 'alert-circle')}</span>` : ''}
    ${d.nAnexos > 0 ? `<span class="mudo" title="${d.nAnexos} anexo(s)">${icone('paperclip')}${d.nAnexos}</span>` : ''}
    </div></a>`;
  return acao ? `<div class="linha-com-acao">${linha}${acao}</div>` : linha;
}

export async function paginaLista(main, schema) {
  const porMes = !!schema.porMes;
  const porData = schema.ordem === 'dataHora' && !porMes;
  const f = (filtrosSalvos[schema.id] ??= { de: '', ate: '', busca: '', soAlerta: false, mes: mesAtual() });
  if (porMes) { f.de = `${f.mes}-01`; f.ate = `${f.mes}-31T23:59`; f.busca = ''; f.soAlerta = false; }

  main.innerHTML = '';
  main.append(html(`<div class="pagina">
    ${schema.voltar ? `<a class="voltar" href="${schema.voltar.href}">${icone('arrow-left')} ${esc(schema.voltar.rot)}</a>` : ''}
    <div class="pagina-topo">
      <h1>${icone(schema.icone)} ${esc(schema.nome)}</h1>
      <div class="botoes">
        ${(schema.links || []).map((l) => `<a class="btn" href="${l.href}">${icone(l.icone)} ${esc(l.rot)}</a>`).join('')}
        ${podeEditar(schema) && !schema.novos ? `<a class="btn pri" href="#/m/${schema.id}/novo">${icone('plus')} ${esc(schema.novo)}</a>` : ''}
      </div>
    </div>
    ${podeEditar(schema) && schema.novos ? `<div class="novos">${schema.novos.map((n) => `<a class="novo cor-${n.cor}" href="#/m/${schema.id}/novo?${new URLSearchParams(n.query)}">${icone(n.icone)}<span>${esc(n.rot)}</span></a>`).join('')}</div>` : ''}
    ${schema.agenda ? `<section class="agenda-secao">
      <h2>${icone('calendar-event')} Agendadas <span class="mudo" data-agenda-total></span></h2>
      <div class="agenda-lista"><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
    </section>
    <h2 class="subtitulo">${icone('history')} Aplicações realizadas</h2>` : ''}
    ${schema.painel ? (() => {
      const titulo = schema.painel.depois ? `<h2 class="subtitulo">${icone('history')} ${esc(schema.painel.depois)}</h2>` : '';
      const painel = `<section class="painel-topo">
      <h2>${icone(schema.painel.icone)} ${esc(schema.painel.titulo)} <span class="mudo" data-painel-total></span></h2>
      <div data-painel><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
    </section>`;
      // abaixoDoTitulo: o painel fica entre o título "Todos os registros" e o histórico (ex.: clientes das aferições)
      return schema.painel.abaixoDoTitulo ? titulo + painel : painel + titulo;
    })() : ''}
    <div class="filtros">
      ${porMes ? `<div class="filtro-mes">
        <button type="button" class="btn icone" data-mes="-1" title="Mês anterior" aria-label="Mês anterior">${icone('chevron-left')}</button>
        <input type="month" value="${f.mes}" max="${mesAtual()}" data-f="mes" aria-label="Mês">
        <button type="button" class="btn icone" data-mes="1" title="Próximo mês" aria-label="Próximo mês" ${f.mes >= mesAtual() ? 'disabled' : ''}>${icone('chevron-right')}</button>
        ${f.mes !== mesAtual() ? `<button type="button" class="btn pequeno" data-mes="0">Mês atual</button>` : ''}
      </div>` : `<div class="busca">${icone('search')}<input type="search" placeholder="Buscar" value="${esc(f.busca)}" data-f="busca"></div>`}
      ${porData ? `<label class="filtro-data">De <input type="date" value="${f.de}" data-f="de"></label>
      <label class="filtro-data">Até <input type="date" value="${f.ate}" data-f="ate"></label>` : ''}
      ${schema.alerta && !porMes ? `<label class="check pequeno"><input type="checkbox" data-f="soAlerta" ${f.soAlerta ? 'checked' : ''}><span>Só alertas</span></label>` : ''}
      <div class="filtros-acoes">
        <button type="button" class="btn" data-csv title="Exportar planilha">${icone('file-spreadsheet')}<span class="some-celular"> CSV</span></button>
        <button type="button" class="btn" data-imprimir title="Imprimir">${icone('printer')}<span class="some-celular"> Imprimir</span></button>
      </div>
    </div>
    <div class="info-lista mudo"></div>
    <div class="lista"><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
  </div>`));

  // Painel entre o título e o histórico: a linha de busca/datas vai para cima dele
  if (schema.painel?.abaixoDoTitulo) $('.painel-topo', main).before($('.filtros', main));

  const listaEl = $('.lista', main);
  const info = $('.info-lista', main);
  let docs = [];

  const filtrados = () => {
    const termo = normalizar(f.busca);
    return docs.filter((d) => {
      if (f.soAlerta && !schema.alerta?.(d)) return false;
      if (!termo) return true;
      return normalizar(`${schema.titulo(d)} ${schema.sub?.(d) || ''} ${schema.valor?.(d) || ''}`).includes(termo);
    });
  };

  function desenhar() {
    const lista = filtrados();
    if (porMes) {
      info.textContent = `${lista.length} registro(s) em ${nomeMes(f.mes)}`;
      listaEl.classList.add('lista-propria');
      listaEl.innerHTML = schema.renderLista(lista, { mes: f.mes, editar: podeEditar(schema) });
      return;
    }
    const periodo = f.de || f.ate ? ` · ${f.de ? 'de ' + fmtData(f.de) : ''} ${f.ate ? 'até ' + fmtData(f.ate) : ''}` : '';
    info.textContent = `${lista.length} registro(s)${periodo}${!f.de && !f.ate && docs.length >= 300 ? ' · mostrando os 300 mais recentes' : ''}`;
    listaEl.classList.toggle('lista-propria', !!(schema.renderLista && lista.length));
    listaEl.innerHTML = lista.length
      ? (schema.renderLista ? schema.renderLista(lista) : lista.map((d) => linhaRegistro(schema, d)).join(''))
      : `<div class="vazio">${docs.length ? 'Nada encontrado com esses filtros.' : 'Nenhum registro ainda.'}</div>`;
  }

  async function carregar() {
    try {
      docs = await db.listar(schema.id, { ordem: schema.ordem, desc: schema.desc, de: f.de, ate: ateDia(f.ate), ...(porMes ? { limite: 1000 } : {}) });
      if (schema.normalizar) docs = docs.map(schema.normalizar);
      desenhar();
    } catch (e) {
      console.error(e);
      listaEl.innerHTML = `<div class="vazio">${esc(mensagemErro(e))}</div>`;
    }
  }

  main.querySelectorAll('[data-f]').forEach((el) => {
    el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
      const k = el.dataset.f;
      if (k === 'mes') { if (el.value) irParaMes(el.value); return; }
      f[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'de' || k === 'ate') {
        carregar();
        if (schema.painel?.usaPeriodo) carregarPainel(main, schema, f);
      }
      else desenhar();
    });
  });
  // Trocar de mês redesenha a página (botões e limites mudam junto)
  function irParaMes(mes) {
    f.mes = mes > mesAtual() ? mesAtual() : mes;
    paginaLista(main, schema);
  }
  main.querySelectorAll('[data-mes]').forEach((b) => {
    b.onclick = () => irParaMes(b.dataset.mes === '0' ? mesAtual() : somarMes(f.mes, Number(b.dataset.mes)));
  });

  $('[data-csv]', main).onclick = () => exportarCSV(schema, filtrados(), porMes ? f.mes : [f.de, f.ate].filter(Boolean).join('_a_'));
  $('[data-imprimir]', main).onclick = () => (porMes
    ? imprimir(schema, filtrados(), nomeMes(f.mes), schema.impressaoMes?.(filtrados(), { mes: f.mes }))
    : imprimir(schema, filtrados(), [f.de && `de ${fmtData(f.de)}`, f.ate && `até ${fmtData(f.ate)}`].filter(Boolean).join(' ')));

  await Promise.all([carregar(), schema.agenda ? carregarAgenda(main, schema) : null, schema.painel ? carregarPainel(main, schema, f) : null]);
}

// Painel opcional acima dos registros (ex.: trocas pendentes por farmácia)
// "Até" é um dia: inclui os registros até o fim dele (a data e hora "2026-11-13T15:00" é maior que "2026-11-13")
const ateDia = (ate) => (ate && ate.length === 10 ? `${ate}T23:59` : ate);

// Painel opcional acima dos registros. Com "usaPeriodo", segue o De/Até da lista (ex.: clientes das aferições)
async function carregarPainel(main, schema, f = {}) {
  const el = $('[data-painel]', main);
  try {
    const periodo = schema.painel.usaPeriodo ? { de: f.de, ate: ateDia(f.ate) } : {};
    const docs = await db.listar(schema.id, { ordem: schema.ordem, desc: schema.desc, ...schema.painel.consulta, ...periodo });
    $('[data-painel-total]', main).textContent = docs.length ? `(${docs.length})` : '';
    el.innerHTML = docs.length ? schema.painel.render(docs) : `<div class="vazio cartao">${esc(schema.painel.vazio)}</div>`;
    if (docs.length && schema.painel.ligar) await schema.painel.ligar(el, docs, { de: f.de, ate: f.ate }); // painel interativo (ex.: clientes das aferições)
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="vazio">${esc(mensagemErro(e))}</div>`;
  }
}

async function carregarAgenda(main, schema) {
  const el = $('.agenda-lista', main);
  try {
    const [agendadas, tels] = await Promise.all([listarAgendadas(schema.id), telefones()]);
    $('[data-agenda-total]', main).textContent = agendadas.length ? `(${agendadas.length})` : '';
    el.innerHTML = agendadas.length
      ? agendadas.map((d) => cartaoAgenda(schema.id, d, tels.get(d.clienteId))).join('')
      : '<div class="vazio">Nenhuma aplicação agendada. Ao registrar uma aplicação, escolha em "Repetir" o intervalo.</div>';
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="vazio">${esc(mensagemErro(e))}</div>`;
  }
}
