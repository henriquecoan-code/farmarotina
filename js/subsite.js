// Páginas separadas do site (pastas compras/ e consultas/): mesmo login e permissões do FarmaRotina,
// com um cabeçalho próprio que leva de volta ao app e às outras páginas da mesma área.
import { db } from './db.js';
import { DEMO, NOME_APP } from './config.js';
import { definirPerfil, podeVer } from './perm.js';
import { esc, html, icone, mensagemErro } from './util.js';

function aviso(raiz, msg, comLink = true) {
  raiz.innerHTML = '';
  raiz.append(html(`<div class="tela-entrada"><div class="cartao entrada">
    <div class="marca grande">${icone('first-aid-kit')} ${esc(NOME_APP)}</div>
    <p>${esc(msg)}</p>
    ${comLink ? `<a class="btn pri" href="../index.html">${icone('login')} Ir para o ${esc(NOME_APP)}</a>` : ''}
  </div></div>`));
}

function topo(paginas, atual, perfil) {
  return html(`<header class="sub-topo">
    <a class="marca" href="../index.html" title="Voltar ao ${esc(NOME_APP)}">${icone('first-aid-kit')} ${esc(NOME_APP)}</a>
    <nav class="sub-nav">${paginas.filter((p) => !p.modulo || podeVer(p.modulo)).map((p) => `<a href="${p.href}" class="${p.id === atual ? 'ativo' : ''}">${icone(p.icone)}<span>${esc(p.nome)}</span></a>`).join('')}</nav>
    <span class="sub-usuario mudo">${DEMO ? '<span class="selo-texto info">Demonstração</span> ' : ''}${esc(perfil.nome || '')}</span>
  </header>`);
}

// Confere login e permissão; se estiver tudo certo, desenha o cabeçalho e chama montar(main, perfil).
// modulos: o usuário precisa ter pelo menos um deles. atual: id da página ativa no cabeçalho.
export function iniciarSubsite({ paginas, atual, modulos, titulo, montar }) {
  const raiz = document.getElementById('app');
  db.observarAuth(async (u) => {
    if (!u) return aviso(raiz, `Entre no ${NOME_APP} para usar ${titulo}.`);
    db.definirUsuario(u);
    try {
      const p = await db.obterPerfil(u.uid);
      definirPerfil(p);
      if (!p?.ativo) return aviso(raiz, 'Seu acesso ainda não foi liberado pelo administrador.');
      if (!modulos.some(podeVer)) {
        return aviso(raiz, `Você não tem acesso a ${titulo}. Peça ao administrador para liberar o módulo na tela Usuários do ${NOME_APP}.`);
      }
      db.definirUsuario({ uid: u.uid, nome: p.nome || u.nome });
      raiz.innerHTML = '';
      raiz.append(topo(paginas, atual, p));
      const main = html('<main class="sub-main"></main>');
      raiz.append(main);
      await montar(main, p);
    } catch (e) {
      console.error(e);
      aviso(raiz, mensagemErro(e), false);
    }
  });
}
