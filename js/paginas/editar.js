import { db } from '../db.js';
import { podeEditar } from '../perm.js';
import { renderForm, limparCacheRef } from '../form.js';
import { prepararAgenda, concluirAnteriores } from '../agenda.js';
import { esc, html, icone, toast, agoraLocal } from '../util.js';

export async function paginaEditar(main, schema, id, query) {
  if (!podeEditar(schema)) {
    main.innerHTML = `<div class="pagina"><div class="vazio">Você não tem permissão para editar ${esc(schema.nome)}.</div></div>`;
    return;
  }
  let dados = {};
  if (id) {
    dados = await db.obter(schema.id, id);
    if (!dados) {
      main.innerHTML = `<div class="pagina"><div class="vazio">Registro não encontrado.</div></div>`;
      return;
    }
  } else {
    // Pré-preenchimento vindo da URL, ex.: #/m/afericoes/novo?clienteId=...&clienteNome=...
    for (const [k, v] of query) dados[k] = v === 'true' ? true : v;
  }

  const voltar = id ? `#/m/${schema.id}/${id}` : `#/m/${schema.id}`;
  main.innerHTML = '';
  const pagina = html(`<div class="pagina estreita">
    <a class="voltar" href="${voltar}">${icone('arrow-left')} ${id ? 'Voltar' : esc(schema.nome)}</a>
    <div class="pagina-topo"><h1>${id ? 'Editar' : esc(schema.novo)}</h1>${!id && query.get('tipo') ? `<span class="selo-texto info">${esc(query.get('tipo'))}</span>` : ''}</div>
    <section class="cartao" data-form></section></div>`);
  main.append(pagina);

  pagina.querySelector('[data-form]').append(renderForm(schema, dados, {
    onCancelar: () => { location.hash = voltar; },
    onSalvar: async (vals) => {
      // Sem data a lista (ordenada por data) não mostraria o registro: usa o momento atual
      if (schema.ordem === 'dataHora' && !vals.dataHora) vals.dataHora = agoraLocal();
      if (schema.agenda) vals = prepararAgenda(vals, id ? dados : null);
      let novoId = id;
      let status;
      if (id) ({ status } = await db.atualizar(schema.id, id, vals));
      else ({ id: novoId, status } = await db.criar(schema.id, vals));
      if (schema.agenda && !id) await concluirAnteriores(schema.id, novoId, vals, query.get('origem'));
      limparCacheRef(schema.id);
      // Alguns módulos emendam o próximo registro (ex.: temperatura da geladeira → do ambiente)
      const proximo = !id && schema.aposCriar ? await schema.aposCriar(vals, novoId) : null;
      if (status === 'pendente') toast('Salvo offline; será sincronizado quando houver internet', 'ok');
      else toast(proximo?.msg || 'Salvo', 'ok');
      location.hash = proximo?.hash || `#/m/${schema.id}/${novoId}`;
    },
  }));
}
