import { db } from '../db.js';
import { MODULOS, PERFIS, ehAdmin, obterPerfilAtual } from '../perm.js';
import { $, $$, esc, html, icone, toast, mensagemErro } from '../util.js';

const seloStatus = (u) => (u.ativo ? ['ok', 'Ativo'] : ['atencao', 'Aguardando aprovação']);

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
    <div class="usuarios"><div class="vazio">Carregando…</div></div>
    <section class="removidos" hidden><h2 class="subtitulo">${icone('user-off')} Usuários removidos</h2><div class="usuarios"></div></section>
  </div>`);
  main.append(pagina);
  const lista = $('.usuarios', pagina);
  const secaoRemovidos = $('.removidos', pagina);

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

  for (const u of usuarios.filter((x) => !x.excluido)) lista.append(cartaoUsuario(u, u.id === eu));

  const removidos = usuarios.filter((x) => x.excluido);
  secaoRemovidos.hidden = !removidos.length;
  for (const u of removidos) {
    const card = html(`<div class="cartao usuario removido">
      <div class="cartao-topo"><div><h2>${esc(u.nome || '(sem nome)')}</h2><div class="mudo">${esc(u.email || '')}</div></div>
      <button type="button" class="btn pequeno" data-restaurar>${icone('arrow-back-up')} Restaurar</button></div></div>`);
    $('[data-restaurar]', card).onclick = async () => {
      try {
        await db.salvarUsuario(u.id, { excluido: false, ativo: false });
        toast(`${u.nome} restaurado. Libere o acesso novamente.`, 'ok');
        paginaUsuarios(main);
      } catch (e) { toast(mensagemErro(e), 'erro'); }
    };
    $('.usuarios', secaoRemovidos).append(card);
  }
}

function cartaoUsuario(u, souEu) {
  const mods = new Set(u.modulos || []);
  const [nivel, status] = seloStatus(u);
  const card = html(`<section class="cartao usuario">
    <div class="cartao-topo">
      <div><h2 data-nome>${esc(u.nome || '(sem nome)')}</h2><div class="mudo" data-email>${esc(u.email || '')}</div></div>
      <div class="botoes">
        <span class="selo-texto ${nivel}">${status}</span>
        <button type="button" class="btn pequeno" data-editar>${icone('pencil')} Editar</button>
      </div>
    </div>
    <div class="usuario-edicao" hidden>
      <div class="grade">
        <div class="campo lg-m"><label class="rotulo">Nome</label><input data-campo-nome autocomplete="off"></div>
        <div class="campo lg-m"><label class="rotulo">E-mail <small>de contato</small></label><input type="email" data-campo-email autocomplete="off"></div>
      </div>
      <p class="mudo pequeno">O e-mail usado para entrar no app não muda por aqui; para isso, a pessoa cria uma conta nova com o outro e-mail.</p>
      ${souEu ? '' : `<button type="button" class="btn perigo pequeno" data-excluir>${icone('user-x')} Excluir usuário</button>`}
    </div>
    <div class="usuario-controles">
      <label class="check"><input type="checkbox" data-ativo ${u.ativo ? 'checked' : ''} ${souEu ? 'disabled' : ''}><span>Acesso liberado</span></label>
      <label class="check"><input type="checkbox" data-admin ${u.papel === 'admin' ? 'checked' : ''} ${souEu ? 'disabled' : ''}><span>Administrador (acesso total)</span></label>
    </div>
    <div class="usuario-modulos">
      <div class="rotulo">Módulos <span class="perfis">${Object.keys(PERFIS).map((p) => `<button type="button" class="btn pequeno" data-perfil="${esc(p)}">Perfil ${esc(p.toLowerCase())}</button>`).join('')}</span></div>
      <div class="chips">${MODULOS.map((m) => `<label class="chip"><input type="checkbox" value="${m.id}" ${mods.has(m.id) ? 'checked' : ''}><span>${esc(m.nome)}</span></label>`).join('')}</div>
    </div>
    <div class="acoes"><button type="button" class="btn pri" data-salvar>${icone('check')} Salvar</button></div>
  </section>`);

  const campoNome = $('[data-campo-nome]', card);
  const campoEmail = $('[data-campo-email]', card);
  campoNome.value = u.nome || '';
  campoEmail.value = u.email || '';
  const edicao = $('.usuario-edicao', card);
  $('[data-editar]', card).onclick = () => {
    edicao.hidden = !edicao.hidden;
    if (!edicao.hidden) campoNome.focus();
  };

  const chips = $$('.chips input', card);
  const sincronizarAdmin = () => {
    $('.usuario-modulos', card).classList.toggle('desativado', $('[data-admin]', card).checked);
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
    const nome = campoNome.value.trim();
    const email = campoEmail.value.trim();
    if (!nome) {
      edicao.hidden = false;
      toast('Digite o nome', 'erro');
      campoNome.focus();
      return;
    }
    const dados = {
      nome, email,
      ativo: $('[data-ativo]', card).checked,
      papel: $('[data-admin]', card).checked ? 'admin' : 'usuario',
      modulos: chips.filter((c) => c.checked).map((c) => c.value),
    };
    if (souEu) { dados.ativo = true; dados.papel = 'admin'; }
    try {
      await db.salvarUsuario(u.id, dados);
      Object.assign(u, dados);
      toast(`${nome}: alterações salvas`, 'ok');
      $('[data-nome]', card).textContent = nome;
      $('[data-email]', card).textContent = email;
      const [nv, st] = seloStatus(u);
      const selo = $('.selo-texto', card);
      selo.className = `selo-texto ${nv}`;
      selo.textContent = st;
      edicao.hidden = true;
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };

  const excluir = $('[data-excluir]', card);
  if (excluir) excluir.onclick = async () => {
    if (!confirm(`Excluir ${u.nome}? A pessoa perde o acesso ao app na hora. Os registros que ela fez continuam guardados.`)) return;
    try {
      // Remoção "suave": o perfil fica marcado como excluído, o que também impede a pessoa de se recadastrar sozinha.
      await db.salvarUsuario(u.id, { excluido: true, ativo: false, papel: 'usuario', modulos: [] });
      toast(`${u.nome} excluído`);
      paginaUsuarios(card.closest('#conteudo'));
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };
  return card;
}
