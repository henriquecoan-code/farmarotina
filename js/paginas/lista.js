import { db } from '../db.js';
import { podeEditar } from '../perm.js';
import { exportarCSV, imprimir } from '../export.js';
import { listarAgendadas, telefones, cartaoAgenda } from '../agenda.js';
import { $, esc, html, icone, normalizar, fmtData, mensagemErro } from '../util.js';

const filtrosSalvos = {}; // lembra o filtro de cada módulo enquanto o app está aberto

export function linhaRegistro(schema, d) {
  const a = schema.alerta?.(d);
  const valor = schema.valor?.(d) || '';
  return `<a class="linha ${a ? 'com-alerta ' + a.nivel : ''}" href="#/m/${schema.id}/${d.id}">
    <div class="linha-texto"><div class="linha-titulo">${esc(schema.titulo(d))}</div>
    <div class="linha-sub">${esc(schema.sub?.(d) || '')}</div></div>
    <div class="linha-valor">${valor ? `<span>${esc(valor)}</span>` : ''}
    ${a ? `<span class="selo ${a.nivel}">${icone(a.nivel === 'perigo' ? 'alert-triangle' : 'alert-circle')}</span>` : ''}
    ${d.nAnexos > 0 ? `<span class="mudo" title="${d.nAnexos} anexo(s)">${icone('paperclip')}${d.nAnexos}</span>` : ''}
    </div></a>`;
}

export async function paginaLista(main, schema) {
  const porData = schema.ordem === 'dataHora';
  const f = (filtrosSalvos[schema.id] ??= { de: '', ate: '', busca: '', soAlerta: false });

  main.innerHTML = '';
  main.append(html(`<div class="pagina">
    <div class="pagina-topo">
      <h1>${icone(schema.icone)} ${esc(schema.nome)}</h1>
      ${podeEditar(schema) ? `<a class="btn pri" href="#/m/${schema.id}/novo">${icone('plus')} ${esc(schema.novo)}</a>` : ''}
    </div>
    ${schema.agenda ? `<section class="agenda-secao">
      <h2>${icone('calendar-event')} Agendadas <span class="mudo" data-agenda-total></span></h2>
      <div class="agenda-lista"><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
    </section>
    <h2 class="subtitulo">${icone('history')} Aplicações realizadas</h2>` : ''}
    <div class="filtros">
      <div class="busca">${icone('search')}<input type="search" placeholder="Buscar" value="${esc(f.busca)}" data-f="busca"></div>
      ${porData ? `<label class="filtro-data">De <input type="date" value="${f.de}" data-f="de"></label>
      <label class="filtro-data">Até <input type="date" value="${f.ate}" data-f="ate"></label>` : ''}
      ${schema.alerta ? `<label class="check pequeno"><input type="checkbox" data-f="soAlerta" ${f.soAlerta ? 'checked' : ''}><span>Só alertas</span></label>` : ''}
      <div class="filtros-acoes">
        <button type="button" class="btn" data-csv title="Exportar planilha">${icone('file-spreadsheet')}<span class="some-celular"> CSV</span></button>
        <button type="button" class="btn" data-imprimir title="Imprimir">${icone('printer')}<span class="some-celular"> Imprimir</span></button>
      </div>
    </div>
    <div class="info-lista mudo"></div>
    <div class="lista"><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
  </div>`));

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
    const periodo = f.de || f.ate ? ` · ${f.de ? 'de ' + fmtData(f.de) : ''} ${f.ate ? 'até ' + fmtData(f.ate) : ''}` : '';
    info.textContent = `${lista.length} registro(s)${periodo}${!f.de && !f.ate && docs.length >= 300 ? ' · mostrando os 300 mais recentes' : ''}`;
    listaEl.innerHTML = lista.length
      ? lista.map((d) => linhaRegistro(schema, d)).join('')
      : `<div class="vazio">${docs.length ? 'Nada encontrado com esses filtros.' : 'Nenhum registro ainda.'}</div>`;
  }

  async function carregar() {
    try {
      docs = await db.listar(schema.id, { ordem: schema.ordem, desc: schema.desc, de: f.de, ate: f.ate });
      desenhar();
    } catch (e) {
      console.error(e);
      listaEl.innerHTML = `<div class="vazio">${esc(mensagemErro(e))}</div>`;
    }
  }

  main.querySelectorAll('[data-f]').forEach((el) => {
    el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
      const k = el.dataset.f;
      f[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'de' || k === 'ate') carregar();
      else desenhar();
    });
  });
  $('[data-csv]', main).onclick = () => exportarCSV(schema, filtrados(), [f.de, f.ate].filter(Boolean).join('_a_'));
  $('[data-imprimir]', main).onclick = () =>
    imprimir(schema, filtrados(), [f.de && `de ${fmtData(f.de)}`, f.ate && `até ${fmtData(f.ate)}`].filter(Boolean).join(' '));

  await Promise.all([carregar(), schema.agenda ? carregarAgenda(main, schema) : null]);
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
