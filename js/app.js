import { db } from './db.js';
import { DEMO, NOME_APP } from './config.js';
import { definirPerfil, ehAdmin, podeEditar } from './perm.js';
import { schemaPorId, visiveis } from './modulos/index.js';
import { paginaLogin, paginaPendente } from './paginas/login.js';
import { paginaInicio } from './paginas/inicio.js';
import { paginaLista } from './paginas/lista.js';
import { paginaDetalhe } from './paginas/detalhe.js';
import { paginaEditar } from './paginas/editar.js';
import { paginaUsuarios } from './paginas/usuarios.js';
import { paginaConfiguracoes } from './paginas/configuracoes.js';
import { itensMenu, itensVisiveisNoMenu, itensBarraCelular, aplicarOrdem, prefs, salvarPreferencias, arrastavel } from './preferencias.js';
import { $, $$, esc, html, icone, toast, mensagemErro } from './util.js';

const raiz = document.getElementById('app');
let perfil = null;

const itemLink = (l) => `<a href="${l.href}" data-rota="${l.rota}">${icone(l.icone)}<span>${esc(l.nome)}</span></a>`;

function montarShell() {
  raiz.innerHTML = '';
  raiz.append(html(`<div class="shell">
    <header class="topo-celular">
      <button type="button" class="btn icone" data-abrir-menu aria-label="Abrir menu">${icone('menu-2')}</button>
      <div class="marca">${icone('first-aid-kit')} ${esc(NOME_APP)}</div>
      <span class="status-rede" hidden>${icone('wifi-off')}</span>
    </header>
    <nav class="lateral" aria-label="Menu principal">
      <div class="lateral-topo">
        <div class="marca">${icone('first-aid-kit')} ${esc(NOME_APP)}</div>
        <button type="button" class="btn icone so-desktop" data-organizar title="Organizar o menu" aria-label="Organizar o menu">${icone('adjustments-horizontal')}</button>
      </div>
      ${DEMO ? '<div class="selo-texto info demo">Modo demonstração</div>' : ''}
      <div class="nav-links"></div>
      <div class="nav-rodape">
        <div class="usuario-atual"><b>${esc(perfil.nome || '')}</b><span class="mudo">${ehAdmin() ? 'Administrador' : esc(perfil.email || '')}</span></div>
        ${DEMO ? `<button type="button" class="btn pequeno" data-reiniciar>${icone('refresh')} Reiniciar dados de exemplo</button>` : ''}
        <button type="button" class="btn pequeno" data-sair>${icone('logout')} Sair</button>
      </div>
    </nav>
    <div class="fundo-menu" data-fechar-menu></div>
    <main id="conteudo" tabindex="-1"></main>
    <nav class="barra-inferior" aria-label="Atalhos"></nav>
  </div>`));

  const shell = $('.shell', raiz);
  const fecharMenu = () => shell.classList.remove('menu-aberto');
  // Delegação: o menu e a barra são redesenhados quando as preferências mudam
  shell.addEventListener('click', (e) => {
    if (e.target.closest('[data-abrir-menu]')) shell.classList.add('menu-aberto');
    else if (e.target.closest('[data-fechar-menu], .nav-links a')) fecharMenu();
  });
  $('[data-organizar]', shell).onclick = () => organizarMenu(shell);
  $('[data-sair]', shell).onclick = () => db.sair();
  const reiniciar = $('[data-reiniciar]', shell);
  if (reiniciar) reiniciar.onclick = () => {
    if (!confirm('Apagar tudo o que foi feito na demonstração e voltar aos dados de exemplo?')) return;
    db.reiniciarDemo();
    location.hash = '#/';
    location.reload();
  };

  const rede = $('.status-rede', shell);
  const atualizarRede = () => { rede.hidden = navigator.onLine; };
  window.addEventListener('online', atualizarRede);
  window.addEventListener('offline', atualizarRede);
  atualizarRede();
  atualizarMenu();
}

// Desenha o menu lateral e a barra do celular conforme as preferências do usuário
function atualizarMenu() {
  const shell = $('.shell', raiz);
  if (!shell) return;
  shell.classList.remove('organizando');
  $('.nav-links', shell).innerHTML = itensVisiveisNoMenu().map(itemLink).join('');
  const inicio = itensMenu()[0];
  $('.barra-inferior', shell).innerHTML = [inicio, ...itensBarraCelular()].map(itemLink).join('')
    + `<button type="button" data-abrir-menu>${icone('dots')}<span>Mais</span></button>`;
  marcarAtivo();
}

function marcarAtivo() {
  const [p0, p1] = lerRota().partes;
  const ativa = p0 === 'm' ? p1 : p0 || '';
  $$('[data-rota]').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === ativa));
}

// Modo "Organizar" (computador): arrastar os itens do menu e mostrar/esconder com o olho
function organizarMenu(shell) {
  shell.classList.add('organizando');
  const p = prefs();
  const ocultos = new Set(p.menuOcultos || []);
  const nav = $('.nav-links', shell);
  const itens = aplicarOrdem();
  nav.innerHTML = `<div class="organizar-topo">
      <span>Arraste para reordenar</span>
      <div class="botoes"><button type="button" class="btn pequeno" data-cancelar>Cancelar</button>
      <button type="button" class="btn pequeno pri" data-concluir>${icone('check')} Concluir</button></div>
    </div>
    <div class="organizar-lista">${itens.map((i) => `<div class="nav-edit ${i.fixo ? 'fixo' : ''} ${ocultos.has(i.id) ? 'escondido' : ''}" data-id="${esc(i.id)}">
      ${i.fixo ? `<span class="alca-vazia"></span>` : `<span class="alca" title="Arrastar">${icone('grip-vertical')}</span>`}
      ${icone(i.icone)}<span class="nav-edit-nome">${esc(i.nome)}</span>
      ${i.fixo ? '' : `<button type="button" class="btn icone olho" data-olho title="Mostrar ou esconder" aria-label="Mostrar ou esconder ${esc(i.nome)}">${icone(ocultos.has(i.id) ? 'eye-off' : 'eye')}</button>`}
    </div>`).join('')}</div>`;

  const lista = $('.organizar-lista', nav);
  arrastavel(lista, { item: '.nav-edit:not(.fixo)', alca: '.alca' });
  lista.addEventListener('click', (e) => {
    const olho = e.target.closest('[data-olho]');
    if (!olho) return;
    const linha = olho.closest('.nav-edit');
    linha.classList.toggle('escondido');
    olho.innerHTML = icone(linha.classList.contains('escondido') ? 'eye-off' : 'eye');
  });
  $('[data-cancelar]', nav).onclick = atualizarMenu;
  $('[data-concluir]', nav).onclick = async () => {
    const linhas = $$('.nav-edit:not(.fixo)', lista);
    try {
      await salvarPreferencias({
        menuOrdem: linhas.map((l) => l.dataset.id),
        menuOcultos: linhas.filter((l) => l.classList.contains('escondido')).map((l) => l.dataset.id),
      });
      toast('Menu organizado', 'ok');
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  };
}

function lerRota() {
  const [caminho, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { partes: caminho.split('/').filter(Boolean), query: new URLSearchParams(qs) };
}

async function rotear() {
  if (!perfil) return;
  const main = document.getElementById('conteudo');
  if (!main) return;
  const { partes, query } = lerRota();
  const [p0, p1, p2, p3] = partes;

  marcarAtivo();
  window.scrollTo(0, 0);

  try {
    if (!p0) return await paginaInicio(main);
    if (p0 === 'usuarios') return await paginaUsuarios(main);
    if (p0 === 'configuracoes') return await paginaConfiguracoes(main);
    if (p0 === 'm') {
      const schema = schemaPorId(p1);
      if (!schema || !visiveis().includes(schema)) {
        main.innerHTML = `<div class="pagina"><div class="vazio">Você não tem acesso a esse módulo.</div></div>`;
        return;
      }
      if (!p2) return await paginaLista(main, schema);
      if (p2 === 'novo') return await paginaEditar(main, schema, null, query);
      if (p3 === 'editar' && podeEditar(schema)) return await paginaEditar(main, schema, p2, query);
      return await paginaDetalhe(main, schema, p2);
    }
    main.innerHTML = `<div class="pagina"><div class="vazio">Página não encontrada. <a href="#/">Ir para o início</a></div></div>`;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="pagina"><div class="alerta perigo">${icone('alert-triangle')}<span>${esc(mensagemErro(e))}</span></div></div>`;
  }
}

window.addEventListener('hashchange', rotear);
window.addEventListener('preferencias', atualizarMenu);
window.addEventListener('erro-sync', (e) => toast(`Não foi possível sincronizar: ${mensagemErro(e.detail)}`, 'erro'));

db.observarAuth(async (u) => {
  perfil = null;
  definirPerfil(null);
  if (!u) {
    // Quem entrar depois começa pelo início, não pela última tela do usuário anterior.
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    paginaLogin(raiz);
    return;
  }
  db.definirUsuario(u);
  try {
    let p = await db.obterPerfil(u.uid);
    if (!p) {
      // Logo após "Criar conta" o perfil pode ainda estar sendo gravado: espera um pouco antes de criar.
      await new Promise((r) => setTimeout(r, 1500));
      p = await db.obterPerfil(u.uid);
      if (!p) {
        await db.criarPerfilPendente({ uid: u.uid, nome: u.nome, email: u.email });
        p = await db.obterPerfil(u.uid);
      }
    }
    if (!p?.ativo) {
      paginaPendente(raiz, p || u);
      return;
    }
    perfil = p;
    definirPerfil(p);
    db.definirUsuario({ uid: u.uid, nome: p.nome || u.nome });
    montarShell();
    await rotear();
  } catch (e) {
    console.error(e);
    raiz.innerHTML = `<div class="tela-entrada"><div class="cartao entrada"><div class="alerta perigo">${icone('alert-triangle')}<span>${esc(mensagemErro(e))}</span></div>
      <button type="button" class="btn" onclick="location.reload()">Tentar de novo</button></div></div>`;
  }
});
