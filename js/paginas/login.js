import { db } from '../db.js';
import { DEMO, NOME_APP } from '../config.js';
import { $, esc, html, icone, toast, mensagemErro } from '../util.js';

export function paginaLogin(raiz) {
  raiz.innerHTML = '';
  const tela = html(`<div class="tela-entrada">
    <div class="cartao entrada">
      <div class="marca grande">${icone('first-aid-kit')} ${esc(NOME_APP)}</div>
      <p class="mudo">Rotinas, registros e POPs da farmácia.</p>
      ${DEMO ? `<div class="alerta info">${icone('info-circle')}<span><b>Modo demonstração.</b> Os dados ficam só neste navegador.
        Configure o Firebase em <code>js/config.js</code> para usar de verdade.</span></div>
        <div class="demo-botoes">
          <button type="button" class="btn pri" data-demo="admin@demo">${icone('shield-lock')} Entrar como administrador</button>
          <button type="button" class="btn" data-demo="farmaceutico@demo">${icone('stethoscope')} Entrar como farmacêutico</button>
          <button type="button" class="btn" data-demo="atendente@demo">${icone('user')} Entrar como atendente</button>
        </div>` : `
      <div class="seg abas" role="tablist">
        <label><input type="radio" name="modo" value="entrar" checked><span>Entrar</span></label>
        <label><input type="radio" name="modo" value="cadastrar"><span>Criar conta</span></label>
      </div>
      <form class="form" novalidate>
        <div class="campo" data-so="cadastrar" hidden><label class="rotulo" for="l-nome">Seu nome</label><input id="l-nome" autocomplete="name"></div>
        <div class="campo"><label class="rotulo" for="l-email">E-mail</label><input id="l-email" type="email" autocomplete="email" placeholder="nome@farmacia.com.br"></div>
        <div class="campo"><label class="rotulo" for="l-senha">Senha</label><input id="l-senha" type="password" autocomplete="current-password"></div>
        <div class="erro-form"></div>
        <button type="submit" class="btn pri largo" data-enviar>Entrar</button>
        <button type="button" class="link" data-esqueci>Esqueci minha senha</button>
      </form>`}
    </div></div>`);
  raiz.append(tela);

  if (DEMO) {
    for (const b of tela.querySelectorAll('[data-demo]')) {
      b.onclick = () => db.entrar(b.dataset.demo).catch((e) => toast(mensagemErro(e), 'erro'));
    }
    return;
  }

  const form = $('form', tela);
  const erro = $('.erro-form', tela);
  const modo = () => $('input[name=modo]:checked', tela).value;
  tela.querySelectorAll('input[name=modo]').forEach((r) => r.addEventListener('change', () => {
    const cad = modo() === 'cadastrar';
    $('[data-so=cadastrar]', tela).hidden = !cad;
    $('[data-enviar]', tela).textContent = cad ? 'Criar conta' : 'Entrar';
    $('#l-senha', tela).autocomplete = cad ? 'new-password' : 'current-password';
    erro.textContent = '';
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.textContent = '';
    const nome = $('#l-nome', tela).value.trim();
    const email = $('#l-email', tela).value.trim();
    const senha = $('#l-senha', tela).value;
    if (!email || !senha || (modo() === 'cadastrar' && !nome)) {
      erro.textContent = 'Preencha todos os campos.';
      return;
    }
    const botao = $('[data-enviar]', tela);
    botao.disabled = true;
    try {
      if (modo() === 'cadastrar') await db.cadastrar(nome, email, senha);
      else await db.entrar(email, senha);
    } catch (err) {
      erro.textContent = mensagemErro(err);
    } finally {
      botao.disabled = false;
    }
  });

  $('[data-esqueci]', tela).onclick = async () => {
    const email = $('#l-email', tela).value.trim();
    if (!email) { erro.textContent = 'Digite seu e-mail acima para receber o link.'; return; }
    try {
      await db.recuperarSenha(email);
      toast('Enviamos um link para redefinir a senha', 'ok');
    } catch (err) { erro.textContent = mensagemErro(err); }
  };
}

export function paginaPendente(raiz, perfil) {
  raiz.innerHTML = '';
  const removido = perfil?.excluido === true;
  const tela = html(`<div class="tela-entrada"><div class="cartao entrada">
    <div class="marca grande">${icone(removido ? 'user-off' : 'hourglass')} ${removido ? 'Acesso removido' : 'Aguardando aprovação'}</div>
    <p>Olá, ${esc(perfil?.nome || '')}. ${removido
      ? 'Seu acesso ao app foi removido pelo administrador. Se isso for um engano, fale com o administrador da farmácia.'
      : 'Sua conta foi criada. Peça ao administrador da farmácia para liberar o seu acesso e os módulos que você vai usar.'}</p>
    <div class="botoes"><button type="button" class="btn" data-recarregar>${icone('refresh')} Verificar de novo</button>
    <button type="button" class="btn" data-sair>${icone('logout')} Sair</button></div></div></div>`);
  raiz.append(tela);
  $('[data-recarregar]', tela).onclick = () => location.reload();
  $('[data-sair]', tela).onclick = () => db.sair();
}
