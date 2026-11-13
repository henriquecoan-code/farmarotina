// Notificações dos lembretes das anotações (Windows, celular), enquanto o FarmaRotina está aberto
// (numa aba ou como app instalado, mesmo minimizado). Com o app totalmente fechado, seria preciso um
// servidor enviando as notificações (push) — isso não existe ainda.
import { db } from './db.js';
import { podeVer } from './perm.js';

const CHAVE_ATIVO = 'farmarotina-notificacoes';
const CHAVE_AVISADOS = 'farmarotina-lembretes-avisados';
const COLECOES = [['notas', 'Anotação'], ['controle', 'Anotação de controle']];
const RECARREGAR = 10 * 60_000; // relê os lembretes do Firebase a cada 10 min
const VERIFICAR = 30_000;       // confere a hora a cada 30 s
const JANELA = 12 * 3_600_000;  // só avisa lembretes que venceram nas últimas 12 h (não acumula atrasados antigos)

let pendentes = [];
let lidoEm = 0;
let relogio = null;

export const suportado = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permissao = () => (suportado() ? Notification.permission : 'unsupported');
export function ativas() {
  try { return localStorage.getItem(CHAVE_ATIVO) === '1' && permissao() === 'granted'; } catch { return false; }
}

export async function ativar() {
  if (!suportado()) throw new Error('Este navegador não aceita notificações.');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('As notificações foram bloqueadas no navegador. Libere nas configurações do site (cadeado ao lado do endereço).');
  try { localStorage.setItem(CHAVE_ATIVO, '1'); } catch { /* ignora */ }
  iniciarLembretes(true);
}

export function desativar() {
  try { localStorage.removeItem(CHAVE_ATIVO); } catch { /* ignora */ }
  clearInterval(relogio);
  relogio = null;
}

function avisados() {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_AVISADOS) || '[]')); } catch { return new Set(); }
}
function marcarAvisado(chave) {
  const s = avisados();
  s.add(chave);
  try { localStorage.setItem(CHAVE_AVISADOS, JSON.stringify([...s].slice(-300))); } catch { /* ignora */ }
}

// "AAAA-MM-DD" (lembretes antigos, sem hora) vale como 08:00
const quandoAvisar = (l) => new Date(String(l).length > 10 ? String(l) : `${l}T08:00`).getTime();

async function recarregar() {
  if (!podeVer('notas')) { pendentes = []; return; }
  const listas = await Promise.all(COLECOES.map(([col, tipo]) => db.listar(col, { ordem: 'dataHora', desc: true, limite: 500 })
    .then((docs) => docs.filter((d) => d.lembrete && !d.resolvido).map((d) => ({ ...d, _col: col, _tipo: tipo })))
    .catch(() => [])));
  pendentes = listas.flat();
  lidoEm = Date.now();
}

async function mostrar(d) {
  const titulo = `🔔 ${d.titulo || d._tipo}`;
  const opcoes = {
    body: String(d.texto || '').slice(0, 140) || d._tipo,
    tag: `lembrete-${d._col}-${d.id}`,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: `${location.pathname}#/m/${d._col}/${d.id}` },
    requireInteraction: true,
  };
  // Pelo service worker funciona melhor no celular (e o clique abre a anotação)
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.showNotification(titulo, opcoes);
  else new Notification(titulo, opcoes);
}

async function verificar() {
  if (!ativas()) return;
  if (Date.now() - lidoEm > RECARREGAR) await recarregar();
  const agora = Date.now();
  const ja = avisados();
  for (const d of pendentes) {
    const t = quandoAvisar(d.lembrete);
    const chave = `${d._col}:${d.id}:${d.lembrete}`;
    if (t <= agora && agora - t < JANELA && !ja.has(chave)) {
      marcarAvisado(chave);
      try { await mostrar(d); } catch (e) { console.warn('Notificação não exibida', e); }
    }
  }
}

// Chamado ao entrar no app e quando um lembrete é salvo (forcar = relê do Firebase na hora)
export function iniciarLembretes(forcar = false) {
  if (!ativas()) return;
  if (forcar) lidoEm = 0;
  if (!relogio) relogio = setInterval(verificar, VERIFICAR);
  verificar();
}

