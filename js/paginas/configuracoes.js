// Configurações do próprio usuário: ordem do menu, itens escondidos, barra do celular e atalhos da tela inicial.
// Tudo é salvo na hora (preferencias.js) e o menu se redesenha sozinho.
import {
  prefs, itensMenu, aplicarOrdem, itensBarraCelular, candidatosAtalho, atalhosInicio, salvarPreferencias, arrastavel,
} from '../preferencias.js';
import { $, $$, esc, html, icone, toast, mensagemErro } from '../util.js';

async function salvar(parcial, msg = 'Preferências salvas') {
  try {
    await salvarPreferencias(parcial);
    toast(msg, 'ok');
  } catch (e) {
    toast(mensagemErro(e), 'erro');
  }
}

export async function paginaConfiguracoes(main) {
  main.innerHTML = '';
  const pagina = html(`<div class="pagina estreita">
    <div class="pagina-topo"><h1>${icone('settings')} Configurações</h1></div>
    <p class="mudo">Estas preferências são só suas e valem no celular e no computador.</p>

    <section class="cartao">
      <div class="cartao-topo"><h2>${icone('menu-2')} Menu lateral</h2></div>
      <p class="mudo pequeno">Arraste pela alça ${icone('grip-vertical')} ou use as setas. Desmarque para esconder do menu (o acesso continua).</p>
      <div class="config-menu"></div>
    </section>

    <section class="cartao">
      <div class="cartao-topo"><h2>${icone('device-mobile')} Barra de atalhos do celular</h2></div>
      <p class="mudo pequeno">Os 3 botões que aparecem embaixo da tela no celular, depois de Início.</p>
      <div class="config-barra grade"></div>
    </section>

    <section class="cartao">
      <div class="cartao-topo"><h2>${icone('bolt')} Atalhos da tela inicial</h2></div>
      <p class="mudo pequeno">Botões de "Novo…" que aparecem no início.</p>
      <div class="config-atalhos chips"></div>
    </section>

    <div class="acoes"><button type="button" class="btn" data-restaurar>${icone('restore')} Restaurar padrão</button></div>
  </div>`);
  main.append(pagina);

  desenharMenu($('.config-menu', pagina));
  desenharBarra($('.config-barra', pagina));
  desenharAtalhos($('.config-atalhos', pagina));

  $('[data-restaurar]', pagina).onclick = async () => {
    if (!confirm('Voltar o menu, a barra do celular e os atalhos ao padrão?')) return;
    await salvar(null, 'Preferências restauradas');
    paginaConfiguracoes(main);
  };
}

// ---------- menu lateral ----------
function desenharMenu(el) {
  const p = prefs();
  const ocultos = new Set(p.menuOcultos || []);
  const itens = aplicarOrdem().filter((i) => !i.fixo);
  el.innerHTML = `<div class="config-lista">${itens.map((i) => `<div class="config-item" data-id="${esc(i.id)}">
      <span class="alca" title="Arrastar">${icone('grip-vertical')}</span>
      <label class="check"><input type="checkbox" ${ocultos.has(i.id) ? '' : 'checked'}><span>${icone(i.icone)} ${esc(i.nome)}</span></label>
      <span class="config-setas">
        <button type="button" class="btn icone" data-mover="-1" aria-label="Subir ${esc(i.nome)}">${icone('chevron-up')}</button>
        <button type="button" class="btn icone" data-mover="1" aria-label="Descer ${esc(i.nome)}">${icone('chevron-down')}</button>
      </span>
    </div>`).join('')}</div>
    <p class="mudo pequeno">Início fica sempre no topo; Configurações${itensMenu().some((i) => i.id === 'usuarios') ? ' e Usuários ficam' : ' fica'} sempre no fim.</p>`;

  const lista = $('.config-lista', el);
  const gravar = () => {
    const linhas = $$('.config-item', lista);
    return salvar({
      menuOrdem: linhas.map((l) => l.dataset.id),
      menuOcultos: linhas.filter((l) => !$('input', l).checked).map((l) => l.dataset.id),
    });
  };
  arrastavel(lista, { item: '.config-item', alca: '.alca', aoSoltar: gravar });
  lista.addEventListener('change', gravar);
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mover]');
    if (!b) return;
    const linha = b.closest('.config-item');
    if (b.dataset.mover === '-1' && linha.previousElementSibling) linha.previousElementSibling.before(linha);
    else if (b.dataset.mover === '1' && linha.nextElementSibling) linha.nextElementSibling.after(linha);
    else return;
    b.focus();
    gravar();
  });
}

// ---------- barra do celular ----------
function desenharBarra(el) {
  const opcoes = aplicarOrdem().filter((i) => !i.fixo);
  const atuais = itensBarraCelular().map((i) => i.id);
  el.innerHTML = [0, 1, 2].map((n) => `<div class="campo lg-t"><label class="rotulo">Atalho ${n + 1}</label>
    <select data-pos="${n}"><option value="">Nenhum</option>${opcoes.map((i) => `<option value="${esc(i.id)}" ${atuais[n] === i.id ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}</select></div>`).join('');
  el.addEventListener('change', () => {
    const ids = $$('select', el).map((s) => s.value).filter(Boolean);
    salvar({ barraCelular: [...new Set(ids)] });
  });
}

// ---------- atalhos da tela inicial ----------
function desenharAtalhos(el) {
  const marcados = new Set(atalhosInicio().map((s) => s.id));
  el.innerHTML = candidatosAtalho().map((i) => `<label class="chip"><input type="checkbox" value="${esc(i.id)}" ${marcados.has(i.id) ? 'checked' : ''}><span>${icone(i.schema.icone)} ${esc(i.schema.novo)}</span></label>`).join('')
    || '<div class="vazio">Nenhum módulo com registro novo disponível.</div>';
  el.addEventListener('change', () => salvar({ atalhosInicio: $$('input:checked', el).map((c) => c.value) }));
}
