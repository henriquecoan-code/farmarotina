// Parte comum das consultas ao sistema da farmácia (Trier): lê o banco pela ponte local (pasta ponte/),
// só nos computadores da farmácia em que a ponte estiver aberta. Usa o login e as permissões do FarmaRotina.
import { db } from '../../js/db.js';
import { DEMO, PONTE_URL } from '../../js/config.js';
import { iniciarSubsite } from '../../js/subsite.js';
import { esc, icone } from '../../js/util.js';
import { demoCrediario } from './crediario-demo.js';

// Módulos de consulta. Para criar um novo: página .html + js nesta pasta, rota na ponte e um item aqui
// (e o módulo em js/perm.js com grupo: 'consultas').
export const CONSULTAS = [
  { id: 'crediario', modulo: 'crediario', href: 'crediario.html', icone: 'wallet', nome: 'Crediário',
    desc: 'O que o cliente tem em aberto, conferência dos recebimentos e clientes em atraso.' },
];

const PAGINAS = [
  { id: 'inicio', href: 'consulta.html', icone: 'database-search', nome: 'Consultas' },
  ...CONSULTAS,
];

export function iniciar({ atual, modulos, titulo, montar }) {
  iniciarSubsite({ paginas: PAGINAS, atual, modulos, titulo, montar });
}

export class PonteDesligada extends Error {}

// Dados fictícios no modo demonstração, para testar sem a ponte
const DEMOS = { crediario: demoCrediario };

export async function api(caminho, demo) {
  if (DEMO) {
    if (caminho === '/saude') return { ok: true, versao: 'demo', filial: 3, banco: true };
    return DEMOS[demo](caminho);
  }
  const token = await db.tokenAcesso();
  let r;
  try {
    r = await fetch(PONTE_URL + caminho, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch {
    throw new PonteDesligada();
  }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status} na ponte do sistema.`);
  return dados;
}

export function telaErro(e) {
  if (e instanceof PonteDesligada) {
    return `<div class="alerta atencao cred-ponte">${icone('plug-connected-x')}<span>
      <b>O programa de consultas não está rodando neste computador.</b><br>
      Estas telas leem o sistema da farmácia por um programa instalado no próprio computador (a "ponte").
      Abra o atalho <b>Ponte do FarmaRotina</b> (ou o arquivo <code>ponte\\iniciar.bat</code>) e tente de novo.
      Só funciona nos computadores da farmácia em que a ponte foi instalada.</span>
      <button type="button" class="btn" data-recarregar>${icone('refresh')} Tentar de novo</button></div>`;
  }
  return `<div class="alerta perigo">${icone('alert-triangle')}<span>${esc(e.message)}</span>
    <button type="button" class="btn" data-recarregar>${icone('refresh')} Tentar de novo</button></div>`;
}

// "Tentar de novo" e linhas de tabela clicáveis (tr[data-href]) em qualquer consulta
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-recarregar]')) { window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a, button, input')) location.hash = tr.dataset.href;
});
