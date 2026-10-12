// Página inicial das consultas: situação da ponte e os módulos que o usuário pode abrir.
import { podeVer } from '../../js/perm.js';
import { DEMO } from '../../js/config.js';
import { esc, html, icone } from '../../js/util.js';
import { CONSULTAS, iniciar, api, telaErro } from './comum.js';

iniciar({
  atual: 'inicio',
  modulos: CONSULTAS.map((c) => c.modulo),
  titulo: 'as consultas do sistema',
  montar: async (main) => {
    main.append(html(`<div class="pagina consultas-inicio">
      <div class="pagina-topo"><h1>${icone('database-search')} Consultas do sistema</h1></div>
      <p class="mudo">Informações lidas direto do sistema da farmácia (Trier), sem alterar nada e sem guardar na nuvem.</p>
      <div class="ponte-status" data-status><span class="mudo">${icone('loader-2 girar')} Verificando a ponte…</span></div>
      <div class="consultas-cartoes">${CONSULTAS.filter((c) => podeVer(c.modulo)).map((c) => `<a class="consulta-cartao" href="${c.href}">
        ${icone(c.icone)}<b>${esc(c.nome)}</b><span>${esc(c.desc)}</span></a>`).join('')}</div>
    </div>`));

    const status = main.querySelector('[data-status]');
    const verificar = async () => {
      try {
        const s = await api('/saude');
        status.innerHTML = s.banco
          ? `<span class="selo-texto ok">${icone('plug-connected')} Ponte conectada ao sistema</span>
             <span class="mudo">${DEMO ? 'modo demonstração' : `filial ${esc(s.filial)} · versão ${esc(s.versao)}`}</span>`
          : `<span class="selo-texto atencao">${icone('database-off')} A ponte está aberta, mas não conseguiu falar com o banco do sistema</span>`;
      } catch (e) {
        status.innerHTML = telaErro(e);
      }
    };
    window.addEventListener('hashchange', verificar);
    await verificar();
  },
});
