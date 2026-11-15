// Pedidos da loja online (site da farmácia). Os pedidos ficam no Supabase da loja, não no Firebase:
// aqui só se lê a fila e se muda o status, com o login de alguém da equipe da loja (tabela admins).
// Usado pela página loja/pedidos.html, pela Agenda da tela inicial e pelo aviso de pedido novo.
import { DEMO, LOJA_URL, LOJA_CHAVE } from './config.js';
import { podeVer } from './perm.js';
import { toast, agoraLocal } from './util.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const CHAVE_SESSAO = 'farmarotina-loja';        // sessão da loja neste aparelho (separada da do site)
const CHAVE_ULTIMO = 'farmarotina-loja-ultimo'; // maior nº de pedido já avisado
const CHAVE_DEMO = 'farmarotina-loja-demo';
const VIGIAR = 60_000;

export const ABERTOS = ['aguardando_pagamento', 'pago', 'separando', 'enviado', 'pronto_retirada'];
export const STATUS = {
  aguardando_pagamento: 'Aguardando pagamento', pago: 'Pago', separando: 'Em separação',
  enviado: 'Saiu para entrega', pronto_retirada: 'Pronto para retirada', entregue: 'Entregue', cancelado: 'Cancelado',
};
export const PAGAMENTO = { pix: 'Pix', cartao_online: 'Cartão (online)', na_entrega: 'Na entrega / retirada' };
export const ENTREGA = { padrao: 'Entrega padrão', expresso: 'Entrega expressa', retirada: 'Retirada na loja' };

// "Pagar na entrega" ainda não pago aparece como Recebido, não como "aguardando pagamento"
export const rotuloStatus = (p) => (p.status === 'aguardando_pagamento' && p.pagamento === 'na_entrega' ? 'Recebido' : (STATUS[p.status] ?? p.status));
// Pedido novo = a equipe ainda não começou a separar (o que espera Pix ou cartão do cliente não conta)
export const ehNovo = (p) => p.status === 'pago' || (p.status === 'aguardando_pagamento' && p.pagamento === 'na_entrega');
export const nivelStatus = (p) => (ehNovo(p) ? 'atencao' : p.status === 'entregue' ? 'ok' : p.status === 'cancelado' ? 'perigo' : 'info');

// Próximos passos possíveis (espelha a função admin_mudar_status do banco da loja)
export function proximosStatus(p) {
  const saida = p.entrega === 'retirada'
    ? { para: 'pronto_retirada', rotulo: 'Pronto para retirada' } : { para: 'enviado', rotulo: 'Saiu para entrega' };
  const cancelar = { para: 'cancelado', rotulo: 'Cancelar pedido', perigo: true };
  switch (p.status) {
    case 'aguardando_pagamento': return [{ para: 'separando', rotulo: 'Iniciar separação' }, { para: 'pago', rotulo: 'Marcar como pago' }, cancelar];
    case 'pago': return [{ para: 'separando', rotulo: 'Iniciar separação' }, cancelar];
    case 'separando': return [saida, cancelar];
    case 'enviado':
    case 'pronto_retirada': return [{ para: 'entregue', rotulo: 'Marcar como entregue' }, cancelar];
    default: return [];
  }
}

// Data e hora locais ("AAAA-MM-DDTHH:MM") de um horário do banco
export const horaLocal = (ts) => agoraLocal(new Date(ts));

export class LojaDesconectada extends Error {
  constructor(msg = 'Entre com a conta da loja para ver os pedidos.') { super(msg); }
}

export const lojaAtiva = () => DEMO || !!LOJA_URL;
// Sem carregar a biblioteca: há uma sessão da loja guardada neste aparelho?
export function lojaConectada() {
  if (DEMO) return true;
  try { return !!localStorage.getItem(CHAVE_SESSAO); } catch { return false; }
}

let sb = null;
async function cliente() {
  if (!sb) {
    const { createClient } = await import(SDK);
    sb = createClient(LOJA_URL, LOJA_CHAVE, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: CHAVE_SESSAO },
    });
  }
  return sb;
}
async function clienteLogado() {
  const c = await cliente();
  const { data } = await c.auth.getSession();
  if (!data?.session) throw new LojaDesconectada();
  return c;
}
function conferir({ data, error }) {
  if (!error) return data;
  const msg = error.message || '';
  if (/jwt|token|session/i.test(msg)) throw new LojaDesconectada('A sessão da loja expirou. Entre de novo.');
  throw new Error(/fetch|network/i.test(msg) ? 'Sem conexão com a loja online. Tente de novo.' : (msg || 'Erro ao falar com a loja online.'));
}

// ---------- login da loja ----------
export async function entrarLoja(email, senha) {
  if (DEMO) return;
  const c = await cliente();
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(/invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message);
  const { data: equipe } = await c.rpc('is_equipe');
  if (equipe !== true) {
    await c.auth.signOut();
    throw new Error('Esta conta não faz parte da equipe da loja. Peça ao administrador para liberar o acesso ao painel.');
  }
}
export async function sairLoja() {
  if (DEMO) return;
  const c = await cliente();
  await c.auth.signOut();
}
export async function contaLoja() {
  if (DEMO) return 'demonstração';
  const c = await cliente();
  const { data } = await c.auth.getSession();
  return data?.session?.user?.email || '';
}

// ---------- pedidos ----------
const COLUNAS_FILA = 'id, numero, status, pagamento, entrega, total, criado_em, cliente_nome, cliente_telefone, tem_prescricao, endereco, pedido_itens(quantidade)';

export async function listarPedidos(status) {
  const soAbertos = status.every((s) => ABERTOS.includes(s));
  if (DEMO) {
    return demo().filter((p) => status.includes(p.status))
      .sort((a, b) => (soAbertos ? 1 : -1) * a.criado_em.localeCompare(b.criado_em));
  }
  const c = await clienteLogado();
  return conferir(await c.from('pedidos').select(COLUNAS_FILA).in('status', status)
    .order('criado_em', { ascending: soAbertos }).limit(200)) || [];
}
export const pedidosAbertos = () => listarPedidos(ABERTOS);

// { status: quantidade }
export async function resumoPedidos() {
  if (DEMO) return demo().reduce((r, p) => ({ ...r, [p.status]: (r[p.status] || 0) + 1 }), {});
  const c = await clienteLogado();
  return conferir(await c.rpc('admin_resumo_pedidos')) || {};
}

export async function obterPedido(id) {
  if (DEMO) return demo().find((p) => p.id === id) || null;
  const c = await clienteLogado();
  return conferir(await c.from('pedidos')
    .select('*, pedido_itens(cod_red, nome, quantidade, preco_unit, total, tipo_venda), pedido_status_log(para, em)')
    .eq('id', id).maybeSingle());
}

export async function mudarStatus(id, para) {
  if (DEMO) {
    const lista = demo();
    const p = lista.find((x) => x.id === id);
    p.status = para;
    p.pedido_status_log.push({ para, em: new Date().toISOString() });
    try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(lista)); } catch { /* ignora */ }
    return;
  }
  const c = await clienteLogado();
  conferir(await c.rpc('admin_mudar_status', { p_pedido_id: id, p_status: para }));
}

// Para a tela inicial: nunca lança erro. conectada = false pede o login da loja.
export async function pedidosParaInicio() {
  if (!lojaAtiva() || !podeVer('loja')) return null;
  if (!lojaConectada()) return { conectada: false, pedidos: [] };
  try {
    return { conectada: true, pedidos: await pedidosAbertos() };
  } catch (e) {
    if (e instanceof LojaDesconectada) return { conectada: false, pedidos: [] };
    console.error(e);
    return { conectada: true, pedidos: [], erro: true };
  }
}

// ---------- aviso de pedido novo (com o FarmaRotina aberto) ----------
let relogio = null;
function ultimoAvisado() { try { return Number(localStorage.getItem(CHAVE_ULTIMO)) || 0; } catch { return 0; } }

async function vigiar() {
  if (!podeVer('loja') || !lojaConectada() || !navigator.onLine) return;
  let pedidos;
  try { pedidos = await pedidosAbertos(); } catch { return; }
  const maior = Math.max(0, ...pedidos.map((p) => Number(p.numero)));
  const antes = ultimoAvisado();
  if (maior <= antes) return;
  try { localStorage.setItem(CHAVE_ULTIMO, String(maior)); } catch { /* ignora */ }
  if (!antes) return; // primeira vez neste aparelho: só marca de onde começar
  const novos = pedidos.filter((p) => Number(p.numero) > antes);
  const texto = novos.length === 1
    ? `Pedido nº ${novos[0].numero} da loja online${novos[0].cliente_nome ? ` · ${novos[0].cliente_nome}` : ''}`
    : `${novos.length} pedidos novos da loja online`;
  toast(`Novo pedido! ${texto}`, 'ok');
  avisarSistema(texto, novos[0]).catch((e) => console.warn('Notificação não exibida', e));
  // Redesenha a tela inicial para o pedido entrar na Agenda
  if (!location.hash || location.hash === '#/') window.dispatchEvent(new HashChangeEvent('hashchange'));
}

async function avisarSistema(texto, pedido) {
  const { ativas } = await import('./notificacoes.js');
  if (!ativas()) return;
  const titulo = 'Novo pedido da loja online';
  const opcoes = {
    body: texto, tag: `loja-pedido-${pedido.numero}`, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    data: { url: new URL(`loja/pedidos.html#/p/${pedido.id}`, document.baseURI).href }, requireInteraction: true,
  };
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.showNotification(titulo, opcoes);
  else new Notification(titulo, opcoes);
}

// Chamado ao entrar no app: confere a cada minuto se chegou pedido novo
export function iniciarVigiaPedidos() {
  if (!lojaAtiva() || !podeVer('loja') || relogio) return;
  relogio = setInterval(vigiar, VIGIAR);
  vigiar();
}

// ---------- modo demonstração ----------
function demo() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_DEMO) || 'null');
    if (salvo) return salvo;
  } catch { /* ignora */ }
  const ha = (min) => new Date(Date.now() - min * 60_000).toISOString();
  const item = (cod_red, nome, quantidade, preco_unit, tipo_venda = 'mip') => ({ cod_red, nome, quantidade, preco_unit, total: quantidade * preco_unit, tipo_venda });
  const pedido = (numero, min, status, entrega, cliente, itens, extra = {}) => {
    const subtotal = itens.reduce((s, i) => s + i.total, 0);
    const frete = entrega === 'retirada' ? 0 : 9.9;
    return {
      id: `demo-${numero}`, numero, status, pagamento: 'na_entrega', entrega, subtotal, frete, total: subtotal + frete,
      criado_em: ha(min), cliente_nome: cliente, cliente_telefone: '(48) 99999-0000', cliente_email: 'cliente@exemplo.com',
      tem_prescricao: itens.some((i) => i.tipo_venda === 'prescricao'), observacao: '',
      endereco: entrega === 'retirada' ? null : { logradouro: 'Rua Exemplo', numero: '100', bairro: 'Centro', cidade: 'Lauro Müller', uf: 'SC', cep: '88880-000' },
      pedido_itens: itens, pedido_status_log: [{ para: 'aguardando_pagamento', em: ha(min) }], ...extra,
    };
  };
  return [
    pedido(1001, 60 * 26, 'separando', 'padrao', 'Maria Exemplo', [item(101, 'Dipirona 500 mg 10 cp', 2, 8.5), item(102, 'Losartana 50 mg 30 cp', 1, 19.9, 'prescricao')]),
    pedido(1002, 40, 'aguardando_pagamento', 'retirada', 'João Exemplo', [item(103, 'Protetor solar FPS 50', 1, 59.9)], { observacao: 'Retiro depois das 18h.' }),
    pedido(1003, 5, 'aguardando_pagamento', 'padrao', 'Ana Exemplo', [item(104, 'Vitamina C 1 g 10 cp ef.', 3, 14.9)]),
    pedido(1000, 60 * 50, 'entregue', 'padrao', 'Carlos Exemplo', [item(105, 'Soro fisiológico 500 ml', 2, 7.5)]),
  ];
}
