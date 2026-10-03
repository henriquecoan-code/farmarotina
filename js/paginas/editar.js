import { db } from '../db.js';
import { podeEditar } from '../perm.js';
import { renderForm, limparCacheRef } from '../form.js';
import { esc, html, icone, toast } from '../util.js';

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
    for (const [k, v] of query) dados[k] = v;
  }

  const voltar = id ? `#/m/${schema.id}/${id}` : `#/m/${schema.id}`;
  main.innerHTML = '';
  const pagina = html(`<div class="pagina estreita">
    <a class="voltar" href="${voltar}">${icone('arrow-left')} ${id ? 'Voltar' : esc(schema.nome)}</a>
    <div class="pagina-topo"><h1>${id ? 'Editar' : esc(schema.novo)}</h1></div>
    <section class="cartao" data-form></section></div>`);
  main.append(pagina);

  pagina.querySelector('[data-form]').append(renderForm(schema, dados, {
    onCancelar: () => { location.hash = voltar; },
    onSalvar: async (vals) => {
      let novoId = id;
      let status;
      if (id) ({ status } = await db.atualizar(schema.id, id, vals));
      else ({ id: novoId, status } = await db.criar(schema.id, vals));
      limparCacheRef(schema.id);
      toast(status === 'pendente' ? 'Salvo offline; será sincronizado quando houver internet' : 'Salvo', 'ok');
      location.hash = `#/m/${schema.id}/${novoId}`;
    },
  }));
}
