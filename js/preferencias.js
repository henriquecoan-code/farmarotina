// Preferências de cada usuário (ordem do menu, itens escondidos, atalhos), salvas em usuarios/{uid}.preferencias.
import { db } from './db.js';
import { ehAdmin, podeEditar, obterPerfilAtual } from './perm.js';
import { visiveis } from './modulos/index.js';

// Padrões de quem ainda não personalizou
const PADRAO_CELULAR = ['afericoes', 'temperatura', 'atendimentos', 'clientes', 'notas'];
const FORA_DOS_ATALHOS = ['pops', 'rotinas'];

export const prefs = () => obterPerfilAtual()?.preferencias || {};

// Todos os itens do menu. "fixo" não muda de lugar nem pode ser escondido.
export function itensMenu() {
  return [
    { id: 'inicio', rota: '', href: '#/', icone: 'home', nome: 'Início', fixo: 'topo' },
    ...visiveis().filter((s) => s.menu !== false)
      .map((s) => ({ id: s.id, rota: s.id, href: `#/m/${s.id}`, icone: s.icone, nome: s.nome, schema: s })),
    { id: 'configuracoes', rota: 'configuracoes', href: '#/configuracoes', icone: 'settings', nome: 'Configurações', fixo: 'fim' },
    ...(ehAdmin() ? [{ id: 'usuarios', rota: 'usuarios', href: '#/usuarios', icone: 'shield-lock', nome: 'Usuários', fixo: 'fim' }] : []),
  ];
}

// Aplica a ordem salva. Itens que não estão na lista (ex.: módulo liberado depois) vão para o fim, na ordem padrão.
export function aplicarOrdem(itens = itensMenu(), p = prefs()) {
  const ordem = p.menuOrdem || [];
  const pos = (i, idx) => { const k = ordem.indexOf(i.id); return k < 0 ? 1000 + idx : k; };
  const meio = itens.map((i, idx) => ({ i, k: pos(i, idx) })).filter(({ i }) => !i.fixo)
    .sort((a, b) => a.k - b.k).map(({ i }) => i);
  return [...itens.filter((i) => i.fixo === 'topo'), ...meio, ...itens.filter((i) => i.fixo === 'fim')];
}

export const oculto = (item, p = prefs()) => !item.fixo && (p.menuOcultos || []).includes(item.id);

// Itens que aparecem no menu lateral, já ordenados e sem os escondidos
export const itensVisiveisNoMenu = (p = prefs()) => aplicarOrdem(itensMenu(), p).filter((i) => !oculto(i, p));

// Os 3 atalhos da barra de baixo no celular (além de Início)
export function itensBarraCelular(p = prefs()) {
  const todos = itensMenu();
  const ids = p.barraCelular?.length ? p.barraCelular : PADRAO_CELULAR;
  return ids.map((id) => todos.find((i) => i.id === id && !i.fixo)).filter(Boolean).slice(0, 3);
}

// Módulos que podem virar atalho "Novo…" na tela inicial (na ordem do menu)
export const candidatosAtalho = (p = prefs()) => aplicarOrdem(itensMenu(), p).filter((i) => i.schema && podeEditar(i.schema));

export function atalhosInicio(p = prefs()) {
  const candidatos = candidatosAtalho(p);
  if (Array.isArray(p.atalhosInicio)) return candidatos.filter((i) => p.atalhosInicio.includes(i.id)).map((i) => i.schema);
  return candidatos.filter((i) => !FORA_DOS_ATALHOS.includes(i.id)).map((i) => i.schema);
}

// Grava (junta com o que já existe; null apaga tudo = volta ao padrão) e avisa o app para redesenhar o menu
export async function salvarPreferencias(parcial) {
  const perfil = obterPerfilAtual();
  const novas = parcial === null ? null : { ...(perfil.preferencias || {}), ...parcial };
  await db.salvarUsuario(perfil.id, { preferencias: novas });
  perfil.preferencias = novas;
  window.dispatchEvent(new Event('preferencias'));
}

// Arrastar e soltar com pointer events (funciona com mouse e com toque).
// Segurando a alça, o item acompanha o dedo/mouse e os outros abrem espaço; ao soltar chama aoSoltar().
export function arrastavel(lista, { item, alca, aoSoltar }) {
  lista.addEventListener('pointerdown', (e) => {
    const pegador = e.target.closest(alca);
    if (!pegador || !lista.contains(pegador)) return;
    const el = pegador.closest(item);
    if (!el) return;
    e.preventDefault();
    try { pegador.setPointerCapture(e.pointerId); } catch { /* alguns navegadores recusam; o arrastar continua */ }
    el.classList.add('arrastando');

    const mover = (ev) => {
      const irmaos = [...lista.querySelectorAll(item)].filter((x) => x !== el);
      const depois = irmaos.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (depois) { if (el.nextElementSibling !== depois) lista.insertBefore(el, depois); }
      else if (irmaos.length && lista.lastElementChild !== el) irmaos.at(-1).after(el);
    };
    const soltar = () => {
      pegador.removeEventListener('pointermove', mover);
      pegador.removeEventListener('pointerup', soltar);
      pegador.removeEventListener('pointercancel', soltar);
      el.classList.remove('arrastando');
      aoSoltar?.();
    };
    pegador.addEventListener('pointermove', mover);
    pegador.addEventListener('pointerup', soltar);
    pegador.addEventListener('pointercancel', soltar);
  });
}
