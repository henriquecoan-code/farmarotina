export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

export const icone = (nome) => `<i class="ti ti-${nome}" aria-hidden="true"></i>`;

const pad = (n) => String(n).padStart(2, '0');

export function agoraLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const hoje = () => agoraLocal().slice(0, 10);

export function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return agoraLocal(d).slice(0, 10);
}

export function fmtData(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDataHora(iso) {
  if (!iso) return '';
  return fmtData(iso) + (String(iso).length > 10 ? ' ' + String(iso).slice(11, 16) : '');
}
export function fmtNum(n, casas = 2) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}
export function fmtMoeda(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function toast(msg, tipo = '') {
  const el = html(`<div class="toast ${tipo}">${esc(msg)}</div>`);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.classList.add('saindo'), 3500);
  setTimeout(() => el.remove(), 4000);
}

export function mensagemErro(e) {
  const code = e?.code || '';
  if (code.includes('permission-denied')) return 'Você não tem permissão para isso.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'E-mail ou senha incorretos.';
  if (code.includes('email-already-in-use')) return 'Esse e-mail já tem cadastro. Use "Entrar".';
  if (code.includes('weak-password')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (code.includes('invalid-email')) return 'E-mail inválido.';
  if (code.includes('unavailable') || code.includes('network')) return 'Sem conexão com o servidor. Tente de novo.';
  return e?.message || 'Algo deu errado.';
}

// Abre um <dialog> com o conteúdo informado; retorna { dlg, fechar }.
export function abrirDialogo(titulo, conteudo) {
  const dlg = html(`<dialog class="dialogo">
    <div class="dialogo-topo"><h2>${esc(titulo)}</h2>
    <button type="button" class="btn icone" data-fechar aria-label="Fechar">${icone('x')}</button></div>
    <div class="dialogo-corpo"></div></dialog>`);
  dlg.querySelector('.dialogo-corpo').append(conteudo);
  document.body.append(dlg);
  const fechar = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('[data-fechar]').onclick = fechar;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); });
  dlg.showModal();
  return { dlg, fechar };
}

export function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
