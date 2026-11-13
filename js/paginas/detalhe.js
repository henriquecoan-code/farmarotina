import { db } from '../db.js';
import { podeEditar, podeExcluir, podeVer } from '../perm.js';
import { schemaPorId } from '../modulos/index.js';
import { fmtValor, campoVisivel, htmlAlerta, limparCacheRef } from '../form.js';
import { renderAnexos } from '../anexos.js';
import { linhaRegistro, botaoAcaoRapida } from './lista.js';
import { telefones, textoQuando, situacao, botaoWhatsapp, botaoRegistrar, encerrarAgenda } from '../agenda.js';
import { imprimirFolha } from '../export.js';
import { carregarRef } from '../form.js';
import { botoesHistorico } from './painel-clientes.js';
import { $, esc, html, icone, fmtData, fmtDataHora, toast, mensagemErro } from '../util.js';

export async function paginaDetalhe(main, schema, id) {
  const bruto = await db.obter(schema.id, id);
  const d = bruto && schema.normalizar ? schema.normalizar(bruto) : bruto;
  if (!d) {
    main.innerHTML = `<div class="pagina"><div class="vazio">Registro não encontrado. <a href="#/m/${schema.id}">Voltar</a></div></div>`;
    return;
  }

  const campos = schema.campos
    .filter((c) => campoVisivel(c, d))
    .map((c) => ({ c, v: fmtValor(c, d) }))
    .filter(({ v }) => v !== '');
  const longos = (c) => c.tipo === 'textarea';

  main.innerHTML = '';
  const pagina = html(`<div class="pagina">
    <a class="voltar" href="#/m/${schema.id}">${icone('arrow-left')} ${esc(schema.nome)}</a>
    <div class="pagina-topo">
      <div><h1>${esc(schema.titulo(d))}</h1><div class="mudo">${esc(schema.sub?.(d) || '')}</div></div>
      <div class="botoes">
        ${botaoAcaoRapida(schema, d, true)}
        ${schema.impressaoRegistro ? `<button type="button" class="btn" data-imprimir-registro>${icone('printer')} ${esc(schema.impressaoRegistro.rot)}</button>` : ''}
        ${podeEditar(schema) ? `<a class="btn" href="#/m/${schema.id}/${id}/editar">${icone('pencil')} Editar</a>` : ''}
        ${podeExcluir() ? `<button type="button" class="btn perigo" data-excluir>${icone('trash')} Excluir</button>` : ''}
      </div>
    </div>
    ${htmlAlerta(schema.alerta?.(d))}
    <div data-agenda></div>
    <section class="cartao">
      <dl class="campos">
        ${campos.map(({ c, v }) => `<div class="${longos(c) ? 'largo' : ''}"><dt>${esc(c.rotLongo || c.rot)}</dt><dd class="${longos(c) ? 'texto-longo' : ''}">${esc(v)}</dd></div>`).join('')}
      </dl>
      <div class="meta mudo">
        Registrado por ${esc(d.criadoPorNome || '—')} em ${fmtDataHora(d.criadoLocal)}
        ${d.atualizadoLocal && d.atualizadoLocal !== d.criadoLocal ? ` · Alterado por ${esc(d.atualizadoPorNome || '—')} em ${fmtDataHora(d.atualizadoLocal)}` : ''}
      </div>
    </section>
    <div data-extra></div>
    <div data-anexos></div>
  </div>`);
  main.append(pagina);

  // Impressão do próprio registro (ex.: declaração de aplicação do injetável), com os dados do cadastro do cliente
  const btnImprimir = $('[data-imprimir-registro]', pagina);
  if (btnImprimir) btnImprimir.onclick = async () => {
    const cliente = (await carregarRef('clientes')).find((c) => c.id === d.clienteId) || { nome: d.clienteNome };
    const f = schema.impressaoRegistro.gerar(d, cliente);
    imprimirFolha(f.titulo, f.descricao, f.corpo, f.assinatura);
  };

  const btnExcluir = $('[data-excluir]', pagina);
  if (btnExcluir) btnExcluir.onclick = async () => {
    if (!confirm('Excluir este registro e todos os anexos? Essa ação não pode ser desfeita.')) return;
    try {
      await db.excluir(schema.id, id);
      limparCacheRef(schema.id);
      toast('Registro excluído');
      location.hash = `#/m/${schema.id}`;
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };

  if (schema.agenda && d.agendaPendente) await blocoAgenda($('[data-agenda]', pagina), schema, d);
  if (schema.id === 'clientes') await historicoCliente($('[data-extra]', pagina), d);
  if (schema.id === 'parceiros') await historicoParceiro($('[data-extra]', pagina), d);
  if (schema.detalheExtra) $('[data-extra]', pagina).insertAdjacentHTML('beforeend', schema.detalheExtra(d));
  await renderAnexos($('[data-anexos]', pagina), schema.id, id, { podeAnexar: podeEditar(schema) });
}

// Próxima aplicação agendada: avisar pelo WhatsApp, registrar ou encerrar o agendamento.
async function blocoAgenda(el, schema, d) {
  const tels = await telefones().catch(() => new Map());
  const quando = textoQuando(d.proxima);
  const bloco = html(`<section class="agenda-detalhe ${situacao(d)}">
    <div class="agenda-detalhe-texto">${icone('calendar-event')}
      <span>Próxima aplicação: <b>${fmtData(d.proxima)}</b> (${esc(quando)})</span></div>
    <div class="botoes">
      ${botaoWhatsapp(d, tels.get(d.clienteId), true)}
      ${podeEditar(schema) ? `${botaoRegistrar(schema.id, d, true)}
      <button type="button" class="btn" data-encerrar>${icone('calendar-off')} Encerrar agendamento</button>` : ''}
    </div></section>`);
  el.append(bloco);
  const encerrar = $('[data-encerrar]', bloco);
  if (encerrar) encerrar.onclick = async () => {
    if (!confirm('Encerrar este agendamento? Ele sai da lista de aplicações agendadas.')) return;
    try {
      await encerrarAgenda(schema.id, d.id);
      toast('Agendamento encerrado');
      bloco.remove();
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };
}

// Trocas feitas com uma farmácia parceira (pendentes primeiro)
async function historicoParceiro(el, parceiro) {
  const s = schemaPorId('trocas');
  const q = `?parceiroId=${encodeURIComponent(parceiro.id)}&parceiroNome=${encodeURIComponent(parceiro.nome)}`
    + `${parceiro.contato ? `&contato=${encodeURIComponent(parceiro.contato)}` : ''}`
    + `${parceiro.telefone ? `&telefone=${encodeURIComponent(parceiro.telefone)}` : ''}`;
  const secao = html(`<section class="cartao">
    <div class="cartao-topo"><h2>${icone('arrows-exchange')} Trocas com esta farmácia <span class="mudo" data-resumo></span></h2>
    ${podeEditar(s) ? `<a class="btn pequeno" href="#/m/trocas/novo${q}">${icone('plus')} Nova troca</a>` : ''}</div>
    <div class="lista"><div class="vazio">Carregando…</div></div></section>`);
  el.append(secao);
  let itens = [];
  try {
    itens = await db.listar('trocas', { onde: ['parceiroId', parceiro.id], ordem: 'dataHora', desc: true });
  } catch { /* sem permissão ou offline */ }
  itens.sort((a, b) => Number(a.situacao !== 'Pendente') - Number(b.situacao !== 'Pendente'));
  const pendentes = itens.filter((t) => t.situacao === 'Pendente').length;
  $('[data-resumo]', secao).textContent = itens.length ? `(${itens.length}${pendentes ? `, ${pendentes} pendente(s)` : ''})` : '';
  $('.lista', secao).innerHTML = itens.length
    ? itens.map((t) => linhaRegistro(s, t)).join('')
    : '<div class="vazio">Nenhuma troca com esta farmácia ainda.</div>';
}

// Histórico do cliente: aferições, aplicações e atendimentos que o usuário pode ver.
async function historicoCliente(el, cliente) {
  const fontes = ['afericoes', 'injetaveis', 'atendimentos'].map(schemaPorId).filter((s) => podeVer(s.modulo));
  if (!fontes.length) return;
  const q = `?clienteId=${encodeURIComponent(cliente.id)}&clienteNome=${encodeURIComponent(cliente.nome)}`;
  const secao = html(`<section class="cartao">
    <div class="cartao-topo"><h2>${icone('history')} Histórico</h2>
    <div class="botoes">${fontes.filter(podeEditar).map((s) => `<a class="btn pequeno" href="#/m/${s.id}/novo${q}">${icone('plus')} ${esc(s.novo)}</a>`).join('')}</div></div>
    <div class="lista"><div class="vazio">Carregando…</div></div></section>`);
  el.append(secao);

  const resultados = await Promise.all(fontes.map(async (s) => {
    try {
      return (await db.listar(s.id, { onde: ['clienteId', cliente.id], ordem: 'dataHora', desc: true })).map((d) => ({ s, d }));
    } catch { return []; }
  }));
  const itens = resultados.flat().sort((a, b) => String(b.d.dataHora).localeCompare(String(a.d.dataHora)));

  // Aferições e aplicações do cliente: imprimir o histórico ou mandar pelo WhatsApp
  let depois = $('.cartao-topo', secao);
  for (const s of fontes.filter((x) => x.historico)) {
    const docs = itens.filter((i) => i.s.id === s.id).map((i) => i.d);
    if (!docs.length) continue;
    const barra = html(`<div class="historico-acoes"><span class="mudo">${icone(s.icone)} ${docs.length} ${docs.length === 1 ? s.historico.singular : s.historico.plural}</span></div>`);
    const botoes = botoesHistorico(s, cliente, docs);
    botoes.querySelectorAll('.btn').forEach((b) => b.classList.add('pequeno'));
    barra.append(...botoes.childNodes);
    depois.after(barra);
    depois = barra;
  }

  $('.lista', secao).innerHTML = itens.length
    ? itens.map(({ s, d }) => linhaRegistro(s, d).replace('<div class="linha-titulo">', `<div class="linha-titulo"><span class="etiqueta">${esc(s.nome)}</span> `)).join('')
    : '<div class="vazio">Nenhum registro para este cliente.</div>';
}
