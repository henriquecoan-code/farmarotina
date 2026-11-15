// Tela de "caderno" para as anotações (de clientes e de controle): um segundo painel ao lado do menu
// com a lista (busca, ordenação, nova anotação) e, ao lado, a anotação aberta direto para editar.
// Rotas: #/m/<id> (lista), #/m/<id>/novo, #/m/<id>/<registro> (abre para editar).
import { db } from '../db.js';
import { podeEditar, podeExcluir } from '../perm.js';
import { renderForm, limparCacheRef } from '../form.js';
import { renderAnexos } from '../anexos.js';
import { iniciarLembretes } from '../notificacoes.js';
import { $, esc, html, icone, normalizar, fmtData, fmtDataHora, hoje, toast, mensagemErro, agoraLocal } from '../util.js';

const ORDENS = {
  recentes: { rot: 'Mais recentes', fn: (a, b) => String(b.dataHora).localeCompare(String(a.dataHora)) },
  antigas: { rot: 'Mais antigas', fn: (a, b) => String(a.dataHora).localeCompare(String(b.dataHora)) },
  titulo: { rot: 'Título (A-Z)', fn: (a, b) => String(a.titulo).localeCompare(String(b.titulo), 'pt-BR') },
  categoria: { rot: 'Categoria', fn: (a, b) => String(a.categoria || '').localeCompare(String(b.categoria || ''), 'pt-BR') || ORDENS.recentes.fn(a, b) },
  lembrete: { rot: 'Lembretes primeiro', fn: (a, b) => pesoLembrete(a) - pesoLembrete(b) || String(a.lembrete || '').localeCompare(String(b.lembrete || '')) || ORDENS.recentes.fn(a, b) },
};
// Lembretes pendentes primeiro (atrasados/hoje antes dos futuros), depois o resto
const pesoLembrete = (d) => (d.lembrete && !d.resolvido ? (String(d.lembrete).slice(0, 10) <= hoje() ? 0 : 1) : 2);

const estado = {}; // por caderno: { docs, busca, ordem, categoria }
const CHAVE_ORDEM = 'farmarotina-caderno-ordem';
function ordemSalva(id) {
  try { return JSON.parse(localStorage.getItem(CHAVE_ORDEM) || '{}')[id]; } catch { return null; }
}
function salvarOrdem(id, ordem) {
  try {
    const t = JSON.parse(localStorage.getItem(CHAVE_ORDEM) || '{}');
    t[id] = ordem;
    localStorage.setItem(CHAVE_ORDEM, JSON.stringify(t));
  } catch { /* sem armazenamento */ }
}

export async function paginaCaderno(main, schema, registroId, query) {
  const e = (estado[schema.id] ??= { docs: null, busca: '', ordem: ordemSalva(schema.id) || 'recentes', categoria: '' });
  let raiz = $(`.caderno[data-caderno="${schema.id}"]`, main);

  // Ao trocar de anotação no mesmo caderno, só o lado da edição é redesenhado (a lista fica onde estava)
  if (!raiz) {
    main.innerHTML = '';
    raiz = html(`<div class="caderno" data-caderno="${esc(schema.id)}">
      <aside class="caderno-lista" aria-label="${esc(schema.nome)}">
        <div class="caderno-cabecalho">
          <div class="caderno-titulo"><h1>${icone(schema.icone)} ${esc(schema.nome)}</h1>
            ${podeEditar(schema) ? `<a class="btn pri icone" href="#/m/${schema.id}/novo" title="${esc(schema.novo)}" aria-label="${esc(schema.novo)}">${icone('plus')}</a>` : ''}</div>
          <div class="busca">${icone('search')}<input type="search" placeholder="Buscar" value="${esc(e.busca)}" data-busca></div>
          <div class="caderno-filtros">
            <label>${icone('arrows-sort')}<select data-ordem aria-label="Ordenar">${Object.entries(ORDENS).map(([k, o]) => `<option value="${k}" ${k === e.ordem ? 'selected' : ''}>${esc(o.rot)}</option>`).join('')}</select></label>
            <label>${icone('tag')}<select data-categoria aria-label="Categoria"><option value="">Todas as categorias</option>
              ${(schema.campos.find((c) => c.k === 'categoria')?.opcoes || []).map((c) => `<option ${c === e.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          </div>
          <div class="mudo pequeno" data-total></div>
        </div>
        <div class="caderno-itens" data-itens><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
      </aside>
      <section class="caderno-editor" data-editor></section>
    </div>`);
    main.append(raiz);
    $('[data-busca]', raiz).addEventListener('input', (ev) => { e.busca = ev.target.value; desenharLista(raiz, schema, e); });
    $('[data-ordem]', raiz).addEventListener('change', (ev) => { e.ordem = ev.target.value; salvarOrdem(schema.id, e.ordem); desenharLista(raiz, schema, e); });
    $('[data-categoria]', raiz).addEventListener('change', (ev) => { e.categoria = ev.target.value; desenharLista(raiz, schema, e); });
    await carregarLista(raiz, schema, e);
  }

  // Sem anotação aberta, o lado direito mostra o resumo (no celular ele só aparece ao tocar em "Resumo")
  raiz.dataset.aberto = registroId || 'resumo';
  raiz.classList.toggle('com-nota', !!registroId);
  marcarAtivo(raiz);
  if (!registroId || registroId === 'resumo') return abrirResumo(raiz, schema, e);
  await abrirEditor(raiz, schema, e, registroId, query);
}

async function carregarLista(raiz, schema, e) {
  try {
    e.docs = await db.listar(schema.id, { ordem: 'dataHora', desc: true, limite: 1000 });
  } catch (err) {
    $('[data-itens]', raiz).innerHTML = `<div class="vazio">${esc(mensagemErro(err))}</div>`;
    return;
  }
  desenharLista(raiz, schema, e);
}

function desenharLista(raiz, schema, e) {
  const termo = normalizar(e.busca.trim());
  const lista = (e.docs || [])
    .filter((d) => !e.categoria || d.categoria === e.categoria)
    .filter((d) => !termo || normalizar(`${d.titulo} ${d.texto} ${d.categoria}`).includes(termo))
    .sort(ORDENS[e.ordem]?.fn || ORDENS.recentes.fn);
  $('[data-total]', raiz).textContent = `${lista.length} anotação(ões)${lista.length !== (e.docs || []).length ? ` de ${e.docs.length}` : ''}`;
  // Primeiro item fixo: o resumo das anotações ainda em aberto
  const abertas = emAberto(e).length;
  const resumo = `<a class="caderno-item caderno-resumo" href="#/m/${schema.id}/resumo" data-id="resumo">
    <div class="caderno-item-topo"><b>${icone('list-check')} Resumo</b><span class="caderno-resumo-n ${abertas ? '' : 'zero'}">${abertas ? `${abertas} em aberto` : 'tudo resolvido'}</span></div>
  </a>`;
  $('[data-itens]', raiz).innerHTML = resumo + (lista.length ? lista.map((d) => {
    const a = schema.alerta?.(d);
    return `<a class="caderno-item ${a ? 'com-lembrete' : ''} ${d.resolvido ? 'resolvida' : ''}" href="#/m/${schema.id}/${esc(d.id)}" data-id="${esc(d.id)}">
      <div class="caderno-item-topo"><b>${esc(d.titulo || '(sem título)')}</b>${d.nAnexos > 0 ? icone('paperclip') : ''}${d.resolvido ? `<span class="caderno-ok" title="Resolvida">${icone('check')}</span>` : ''}</div>
      <div class="caderno-item-meta">${d.categoria ? `<span class="etiqueta">${esc(d.categoria)}</span>` : ''}${fmtData(d.dataHora)}
        ${d.lembrete && !d.resolvido ? `<span class="caderno-lembrete ${a ? 'atrasado' : ''}">${icone('bell')} ${fmtData(d.lembrete).slice(0, 5)}${String(d.lembrete).length > 10 ? ` ${String(d.lembrete).slice(11, 16)}` : ''}</span>` : ''}</div>
      <div class="caderno-item-texto">${esc(String(d.texto || '').slice(0, 110))}</div>
    </a>`;
  }).join('') : `<div class="vazio">${(e.docs || []).length ? 'Nada encontrado com esses filtros.' : 'Nenhuma anotação ainda.'}</div>`);
  marcarAtivo(raiz);
}

// Anotações ainda não resolvidas: lembretes vencidos primeiro, depois as mais antigas
const emAberto = (e) => (e.docs || []).filter((d) => !d.resolvido)
  .sort((a, b) => pesoLembrete(a) - pesoLembrete(b) || String(a.dataHora).localeCompare(String(b.dataHora)));

function abrirResumo(raiz, schema, e) {
  const editor = $('[data-editor]', raiz);
  const todas = emAberto(e);
  const editavel = podeEditar(schema);
  // Filtro por categoria (com a contagem de cada uma); "" = todas
  const categorias = schema.campos.find((c) => c.k === 'categoria')?.opcoes || [];
  const conta = (cat) => todas.filter((d) => d.categoria === cat).length;
  // Categoria escolhida que ficou sem pendências (ex.: acabou de resolver a última) volta para "Todas"
  if (e.resumoCat && !conta(e.resumoCat)) e.resumoCat = '';
  const lista = e.resumoCat ? todas.filter((d) => d.categoria === e.resumoCat) : todas;
  const chip = (cat, rot, n) => `<button type="button" class="resumo-chip ${(e.resumoCat || '') === cat ? 'ativo' : ''}" data-resumo-cat="${esc(cat)}" aria-pressed="${(e.resumoCat || '') === cat}">${esc(rot)} <span>${n}</span></button>`;
  editor.innerHTML = '';
  editor.append(html(`<div class="caderno-editor-topo">
    <a class="voltar so-celular" href="#/m/${schema.id}">${icone('arrow-left')} ${esc(schema.nome)}</a>
    <div class="caderno-editor-titulo"><h2>${icone('list-check')} Em aberto <span class="mudo">(${todas.length})</span></h2></div>
    <div class="mudo pequeno">Anotações que ainda faltam resolver. Clique numa linha para abrir.</div>
  </div>`));
  if (!todas.length) {
    editor.append(html(`<div class="caderno-vazio">${icone('circle-check')}<p>Nenhuma anotação em aberto.</p></div>`));
    return;
  }
  editor.append(html(`<div class="resumo-filtro" role="group" aria-label="Filtrar por categoria">
    ${chip('', 'Todas', todas.length)}${categorias.filter(conta).map((c) => chip(c, c, conta(c))).join('')}
  </div>`));
  editor.querySelectorAll('[data-resumo-cat]').forEach((b) => {
    b.onclick = () => { e.resumoCat = b.dataset.resumoCat; abrirResumo(raiz, schema, e); };
  });
  editor.append(html(`<div class="resumo-abertas"><table class="mini-tabela">
    <thead><tr><th>Anotação</th><th>Data</th><th>Lembrete</th>${editavel ? '<th></th>' : ''}</tr></thead>
    <tbody>${lista.map((d) => {
      const a = schema.alerta?.(d);
      const lembrete = d.lembrete ? `${fmtData(d.lembrete).slice(0, 5)}${String(d.lembrete).length > 10 ? ` ${String(d.lembrete).slice(11, 16)}` : ''}` : '—';
      return `<tr data-abrir="${esc(d.id)}" class="${a ? 'com-alerta' : ''}">
        <td><b>${esc(d.titulo || '(sem título)')}</b>${d.categoria ? `<small>${esc(d.categoria)}</small>` : ''}</td>
        <td class="sem-quebra">${fmtData(d.dataHora)}</td>
        <td class="sem-quebra ${a ? 'lembrete-atrasado' : 'mudo'}">${d.lembrete ? icone('bell') : ''} ${lembrete}</td>
        ${editavel ? `<td class="acao"><button type="button" class="btn pequeno ok" data-resolver-id="${esc(d.id)}" title="Marcar como resolvida">${icone('check')}<span class="some-celular"> Resolvido</span></button></td>` : ''}
      </tr>`;
    }).join('')}</tbody></table></div>`));

  editor.querySelectorAll('tr[data-abrir]').forEach((tr) => {
    tr.onclick = (ev) => { if (!ev.target.closest('button')) location.hash = `#/m/${schema.id}/${tr.dataset.abrir}`; };
  });
  editor.querySelectorAll('[data-resolver-id]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await db.atualizar(schema.id, b.dataset.resolverId, { resolvido: true });
        const doc = (e.docs || []).find((d) => d.id === b.dataset.resolverId);
        if (doc) doc.resolvido = true;
        toast('Anotação marcada como resolvida', 'ok');
        desenharLista(raiz, schema, e);
        abrirResumo(raiz, schema, e);
      } catch (err) {
        b.disabled = false;
        toast(mensagemErro(err), 'erro');
      }
    };
  });
}

function marcarAtivo(raiz) {
  const id = raiz.dataset.aberto;
  raiz.querySelectorAll('.caderno-item').forEach((a) => a.classList.toggle('ativo', !!id && a.dataset.id === id));
}

async function abrirEditor(raiz, schema, e, registroId, query) {
  const editor = $('[data-editor]', raiz);
  if (!registroId) {
    editor.innerHTML = `<div class="caderno-vazio">${icone('notes')}<p>Escolha uma anotação na lista para abrir.</p>
      ${podeEditar(schema) ? `<a class="btn pri" href="#/m/${schema.id}/novo">${icone('plus')} ${esc(schema.novo)}</a>` : ''}</div>`;
    return;
  }
  const novo = registroId === 'novo';
  let dados = {};
  if (!novo) {
    editor.innerHTML = `<div class="vazio">${icone('loader-2 girar')} Abrindo…</div>`;
    dados = (e.docs || []).find((d) => d.id === registroId) || await db.obter(schema.id, registroId);
    if (!dados) { editor.innerHTML = '<div class="vazio">Anotação não encontrada.</div>'; return; }
  } else {
    for (const [k, v] of query || []) dados[k] = v;
  }
  const editavel = podeEditar(schema);

  editor.innerHTML = '';
  editor.append(html(`<div class="caderno-editor-topo">
    <a class="voltar so-celular" href="#/m/${schema.id}">${icone('arrow-left')} ${esc(schema.nome)}</a>
    <div class="caderno-editor-titulo"><h2>${novo ? esc(schema.novo) : 'Anotação'}${!novo && dados.resolvido ? ' <span class="selo-texto ok">Resolvida</span>' : ''}</h2>
      <div class="botoes">
        ${!novo && editavel ? (dados.resolvido
          ? `<button type="button" class="btn pequeno" data-resolver title="Voltar a anotação para pendente">${icone('arrow-back-up')} Reabrir</button>`
          : `<button type="button" class="btn pequeno ok" data-resolver title="Marcar como resolvida">${icone('check')} Resolvido</button>`) : ''}
        ${!novo && podeExcluir() ? `<button type="button" class="btn pequeno perigo" data-excluir>${icone('trash')} Excluir</button>` : ''}
      </div></div>
    ${novo ? '' : `<div class="mudo pequeno">Registrada por ${esc(dados.criadoPorNome || '—')} em ${fmtDataHora(dados.criadoLocal)}${dados.atualizadoLocal && dados.atualizadoLocal !== dados.criadoLocal ? ` · alterada por ${esc(dados.atualizadoPorNome || '—')} em ${fmtDataHora(dados.atualizadoLocal)}` : ''}</div>`}
  </div>`));

  if (!editavel) {
    editor.append(html(`<div class="cartao"><p class="texto-longo">${esc(dados.texto || '')}</p></div>`));
  } else {
    const form = renderForm(schema, dados, {
      rotuloSalvar: novo ? 'Salvar anotação' : 'Salvar alterações',
      onCancelar: () => { location.hash = novo ? `#/m/${schema.id}` : `#/m/${schema.id}/${registroId}?r=${Date.now()}`; },
      onSalvar: async (vals) => {
        if (!vals.dataHora) vals.dataHora = agoraLocal();
        let id = registroId;
        let status;
        if (novo) ({ id, status } = await db.criar(schema.id, vals));
        else ({ status } = await db.atualizar(schema.id, registroId, vals));
        limparCacheRef(schema.id);
        toast(status === 'pendente' ? 'Salvo offline; será sincronizado quando houver internet' : 'Anotação salva', 'ok');
        await carregarLista(raiz, schema, e);
        if (vals.lembrete) iniciarLembretes(true);
        if (novo) location.hash = `#/m/${schema.id}/${id}`;
        else { raiz.dataset.aberto = id; marcarAtivo(raiz); }
      },
    });
    editor.append(html('<section class="cartao" data-form></section>'));
    $('[data-form]', editor).append(form);
  }

  if (!novo) {
    const anexos = html('<div data-anexos></div>');
    editor.append(anexos);
    renderAnexos(anexos, schema.id, registroId, { podeAnexar: editavel }).catch(() => {});
  }

  // Resolvido / Reabrir: grava na hora, sem precisar salvar o formulário
  const resolver = $('[data-resolver]', editor);
  if (resolver) resolver.onclick = async () => {
    resolver.disabled = true;
    const resolvido = !dados.resolvido;
    try {
      await db.atualizar(schema.id, registroId, { resolvido });
      toast(resolvido ? 'Anotação marcada como resolvida' : 'Anotação reaberta', 'ok');
      const doc = (e.docs || []).find((d) => d.id === registroId);
      if (doc) doc.resolvido = resolvido;
      desenharLista(raiz, schema, e);
      await abrirEditor(raiz, schema, e, registroId, query);
    } catch (err) {
      resolver.disabled = false;
      toast(mensagemErro(err), 'erro');
    }
  };

  const excluir = $('[data-excluir]', editor);
  if (excluir) excluir.onclick = async () => {
    if (!confirm('Excluir esta anotação e os anexos? Essa ação não pode ser desfeita.')) return;
    try {
      await db.excluir(schema.id, registroId);
      toast('Anotação excluída');
      e.docs = (e.docs || []).filter((d) => d.id !== registroId);
      desenharLista(raiz, schema, e);
      location.hash = `#/m/${schema.id}`;
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  };
}
