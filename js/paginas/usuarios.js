import { db } from '../db.js';
import { MODULOS, PERFIS, ehAdmin, obterPerfilAtual } from '../perm.js';
import { $, $$, esc, html, icone, toast, mensagemErro } from '../util.js';

export async function paginaUsuarios(main) {
  if (!ehAdmin()) {
    main.innerHTML = `<div class="pagina"><div class="vazio">Somente o administrador gerencia usuários.</div></div>`;
    return;
  }
  main.innerHTML = '';
  const pagina = html(`<div class="pagina">
    <div class="pagina-topo"><h1>${icone('shield-lock')} Usuários</h1></div>
    <p class="mudo">Novos cadastros chegam aqui como pendentes. Ative a pessoa e marque os módulos que ela pode acessar.
    Só o administrador exclui registros e edita POPs.</p>
    <div class="usuarios"><div class="vazio">Carregando…</div></div></div>`);
  main.append(pagina);
  const lista = $('.usuarios', pagina);

  let usuarios;
  try {
    usuarios = await db.listarUsuarios();
  } catch (e) {
    lista.innerHTML = `<div class="vazio">${esc(mensagemErro(e))}</div>`;
    return;
  }
  usuarios.sort((a, b) => Number(a.ativo) - Number(b.ativo) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  lista.innerHTML = '';
  const eu = obterPerfilAtual().id;

  for (const u of usuarios) {
    const mods = new Set(u.modulos || []);
    const card = html(`<section class="cartao usuario">
      <div class="cartao-topo">
        <div><h2>${esc(u.nome || '(sem nome)')}</h2><div class="mudo">${esc(u.email || '')}</div></div>
        <span class="selo-texto ${u.ativo ? 'ok' : 'atencao'}">${u.ativo ? 'Ativo' : 'Aguardando aprovação'}</span>
      </div>
      <div class="usuario-controles">
        <label class="check"><input type="checkbox" data-ativo ${u.ativo ? 'checked' : ''} ${u.id === eu ? 'disabled' : ''}><span>Acesso liberado</span></label>
        <label class="check"><input type="checkbox" data-admin ${u.papel === 'admin' ? 'checked' : ''} ${u.id === eu ? 'disabled' : ''}><span>Administrador (acesso total)</span></label>
      </div>
      <div class="usuario-modulos">
        <div class="rotulo">Módulos <span class="perfis">${Object.keys(PERFIS).map((p) => `<button type="button" class="btn pequeno" data-perfil="${esc(p)}">Perfil ${esc(p.toLowerCase())}</button>`).join('')}</span></div>
        <div class="chips">${MODULOS.map((m) => `<label class="chip"><input type="checkbox" value="${m.id}" ${mods.has(m.id) ? 'checked' : ''}><span>${esc(m.nome)}</span></label>`).join('')}</div>
      </div>
      <div class="acoes"><button type="button" class="btn pri" data-salvar>${icone('check')} Salvar</button></div>
    </section>`);

    const chips = $$('.chips input', card);
    const sincronizarAdmin = () => {
      const admin = $('[data-admin]', card).checked;
      $('.usuario-modulos', card).classList.toggle('desativado', admin);
    };
    $('[data-admin]', card).onchange = sincronizarAdmin;
    sincronizarAdmin();
    for (const b of $$('[data-perfil]', card)) {
      b.onclick = () => {
        const alvo = new Set(PERFIS[b.dataset.perfil]);
        for (const c of chips) c.checked = alvo.has(c.value);
      };
    }
    $('[data-salvar]', card).onclick = async () => {
      const dados = {
        ativo: $('[data-ativo]', card).checked,
        papel: $('[data-admin]', card).checked ? 'admin' : 'usuario',
        modulos: chips.filter((c) => c.checked).map((c) => c.value),
      };
      if (u.id === eu) { dados.ativo = true; dados.papel = 'admin'; }
      try {
        await db.salvarUsuario(u.id, dados);
        toast(`${u.nome}: permissões salvas`, 'ok');
        const selo = $('.selo-texto', card);
        selo.className = `selo-texto ${dados.ativo ? 'ok' : 'atencao'}`;
        selo.textContent = dados.ativo ? 'Ativo' : 'Aguardando aprovação';
      } catch (e) { toast(mensagemErro(e), 'erro'); }
    };
    lista.append(card);
  }
}
