// Painel "Clientes" nas listas de Aferições e Injetáveis: busca e um cartão por cliente. Ao clicar,
// abre o histórico do cliente com Imprimir e Enviar pelo WhatsApp. O que imprimir e o texto da
// mensagem vêm de schema.historico (js/modulos/saude.js).
import { podeEditar } from '../perm.js';
import { schemaPorId } from '../modulos/index.js';
import { carregarRef } from '../form.js';
import { linkWhatsapp } from '../agenda.js';
import { imprimirFolha } from '../export.js';
import { NOME_FARMACIA } from '../config.js';
import { linhaRegistro } from './lista.js';
import { $, esc, icone, normalizar, fmtData } from '../util.js';

const estado = {}; // por módulo: cliente aberto e busca (continuam ao voltar para a tela)

function agrupar(docs) {
  const grupos = new Map();
  for (const d of docs) {
    const chave = d.clienteId || `nome:${normalizar(d.clienteNome || '')}`;
    if (!grupos.has(chave)) grupos.set(chave, { id: chave, clienteId: d.clienteId, nome: d.clienteNome || 'Sem cliente', docs: [] });
    grupos.get(chave).docs.push(d);
  }
  for (const g of grupos.values()) {
    g.docs.sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
    g.ultima = g.docs[0];
  }
  return [...grupos.values()];
}

// Barra de Imprimir/WhatsApp do histórico de um cliente (usada também na ficha do cliente)
export function botoesHistorico(schema, cliente, docs, textoPeriodo = '') {
  const h = schema.historico;
  const link = linkWhatsapp(cliente.telefone, h.mensagem(cliente, docs));
  const el = document.createElement('div');
  el.className = 'afc-botoes';
  el.innerHTML = `<button type="button" class="btn" data-hist-imprimir>${icone('printer')} ${esc(h.rotImprimir || 'Imprimir')}</button>
    ${link
      ? `<a class="btn whats" href="${esc(link)}" target="_blank" rel="noopener">${icone('brand-whatsapp')} Enviar pelo WhatsApp</a>`
      : `<button type="button" class="btn whats" disabled title="Cliente sem telefone cadastrado">${icone('brand-whatsapp')} Enviar pelo WhatsApp</button>`}`;
  $('[data-hist-imprimir]', el).onclick = () => imprimirFolha(h.tituloFolha,
    [NOME_FARMACIA, textoPeriodo && `Período: ${textoPeriodo}`].filter(Boolean).join(' · '), h.folha(cliente, docs));
  return el;
}

export function renderClientes(schemaId) {
  const e = (estado[schemaId] ??= { escolhido: null, busca: '' });
  return `<div class="afc">
    <div class="afc-busca busca">${icone('search')}<input type="search" placeholder="Buscar cliente pelo nome ou telefone" value="${esc(e.busca)}" data-afc-busca></div>
    <div class="afc-grade" data-afc-grade></div>
    <div data-afc-detalhe></div>
  </div>`;
}

// periodo: o De/Até da lista. Imprimir e WhatsApp levam só os registros desse período.
export async function ligarClientes(el, docs, { de, ate } = {}, schemaId) {
  const e = (estado[schemaId] ??= { escolhido: null, busca: '' });
  const schema = schemaPorId(schemaId);
  const h = schema.historico;
  const textoPeriodo = de || ate ? [de && `de ${fmtData(de)}`, ate && `até ${fmtData(ate)}`].filter(Boolean).join(' ') : '';
  // Dentro do cliente, a linha não repete o nome (já está no topo)
  const semNome = { ...schema, titulo: h.linhaTitulo, sub: h.linhaSub };
  const grupos = agrupar(docs);
  const clientes = new Map((await carregarRef('clientes')).map((c) => [c.id, c]));
  const grade = $('[data-afc-grade]', el);
  const detalhe = $('[data-afc-detalhe]', el);
  const qtd = (n) => `${n} ${n === 1 ? h.singular : h.plural}`;

  function desenharGrade() {
    const termo = normalizar(e.busca.trim());
    const digitos = e.busca.replace(/\D/g, '');
    const lista = grupos
      .filter((g) => !termo || normalizar(g.nome).includes(termo)
        || (digitos.length >= 3 && String(clientes.get(g.clienteId)?.telefone || '').replace(/\D/g, '').includes(digitos)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    grade.innerHTML = lista.length ? lista.map((g) => {
      const a = schema.alerta?.(g.ultima);
      return `<button type="button" class="afc-cliente ${g.id === e.escolhido ? 'ativo' : ''}" data-afc="${esc(g.id)}">
        <b>${esc(g.nome)}</b>
        <small>${qtd(g.docs.length)} · última ${fmtData(g.ultima.dataHora).slice(0, 5)}
          ${a ? `<span class="afc-alerta ${a.nivel}">${icone('alert-circle')}</span>` : ''}</small>
      </button>`;
    }).join('') : '<div class="vazio">Nenhum cliente encontrado.</div>';
  }

  function desenharDetalhe() {
    const g = grupos.find((x) => x.id === e.escolhido);
    if (!g) { detalhe.innerHTML = ''; return; }
    const cliente = (g.clienteId && clientes.get(g.clienteId)) || { id: g.clienteId, nome: g.nome };
    const q = g.clienteId ? `?clienteId=${encodeURIComponent(g.clienteId)}&clienteNome=${encodeURIComponent(g.nome)}` : '';
    detalhe.innerHTML = `<section class="afc-detalhe">
      <div class="afc-detalhe-topo">
        <div><h3>${esc(g.nome)}</h3><span class="mudo">${esc([cliente.telefone, (cliente.condicoes || []).join(', ')].filter(Boolean).join(' · '))}</span></div>
        <button type="button" class="btn icone" data-afc-fechar title="Fechar" aria-label="Fechar">${icone('x')}</button>
      </div>
      ${textoPeriodo ? `<div class="afc-periodo">${icone('calendar')} Período: ${esc(textoPeriodo)} · ${qtd(g.docs.length)}</div>` : ''}
      <div data-afc-botoes></div>
      <div class="lista">${g.docs.map((d) => linhaRegistro(semNome, d)).join('')}</div>
    </section>`;
    const botoes = botoesHistorico(schema, cliente, g.docs, textoPeriodo);
    if (podeEditar(schema) && q) botoes.insertAdjacentHTML('beforeend', `<a class="btn" href="#/m/${schema.id}/novo${q}">${icone('plus')} ${esc(schema.novo)}</a>`);
    if (g.clienteId) botoes.insertAdjacentHTML('beforeend', `<a class="btn" href="#/m/clientes/${esc(g.clienteId)}">${icone('user')} Ficha do cliente</a>`);
    $('[data-afc-botoes]', detalhe).replaceWith(botoes);
    $('[data-afc-fechar]', detalhe).onclick = () => { e.escolhido = null; desenharGrade(); desenharDetalhe(); };
  }

  grade.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-afc]');
    if (!b) return;
    e.escolhido = e.escolhido === b.dataset.afc ? null : b.dataset.afc;
    desenharGrade();
    desenharDetalhe();
    if (e.escolhido) detalhe.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('[data-afc-busca]', el).addEventListener('input', (ev) => { e.busca = ev.target.value; desenharGrade(); });
  const total = el.closest('.painel-topo')?.querySelector('[data-painel-total]');
  if (total) total.textContent = `(${grupos.length})`;
  desenharGrade();
  desenharDetalhe();
}
