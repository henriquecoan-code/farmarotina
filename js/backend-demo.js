// Backend de demonstração: mesma interface do backend-firebase.js,
// mas guarda tudo no localStorage deste navegador. Serve para testar o app sem Firebase.
import { agoraLocal, diasAtras, hoje } from './util.js';
import { calcularProxima } from './modulos/saude.js';

const CHAVE = 'farmarotina-demo-v3';
const SESSAO = 'farmarotina-demo-sessao';
const TODOS = ['clientes', 'saude', 'temperatura', 'notas', 'fornecedores', 'atendimento', 'pops'];

export const USUARIOS_DEMO = {
  'admin@demo': { nome: 'Ana (admin)', papel: 'admin', modulos: [], ativo: true },
  'farmaceutico@demo': { nome: 'Bruno (farmacêutico)', papel: 'usuario', modulos: TODOS, ativo: true },
  'atendente@demo': { nome: 'Carla (atendente)', papel: 'usuario', modulos: ['clientes', 'temperatura', 'atendimento', 'notas', 'fornecedores', 'pops'], ativo: true },
};

const novoId = () => Math.random().toString(36).slice(2, 12);
let atual = null;
const ouvintes = new Set();

function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE));
    if (s) return s;
  } catch { /* sem armazenamento: recomeça */ }
  return semente();
}
let banco = carregar();
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(banco)); } catch { /* cheio ou bloqueado */ }
}

function semente() {
  const b = { cols: {}, anexos: {}, usuarios: {} };
  for (const [email, u] of Object.entries(USUARIOS_DEMO)) b.usuarios[email] = { email, ...u };
  const meta = () => ({ criadoPor: 'admin@demo', criadoPorNome: 'Ana (admin)', criadoLocal: agoraLocal(), nAnexos: 0 });
  const add = (col, d) => { const id = novoId(); (b.cols[col] ??= {})[id] = { ...meta(), ...d }; return id; };
  const h = (dias, hora) => `${diasAtras(dias)}T${hora}`;

  const maria = add('clientes', { nome: 'Maria Souza', telefone: '(11) 98888-1234', nascimento: '1958-04-12', condicoes: ['Hipertensão'], consentimento: true });
  const joao = add('clientes', { nome: 'João Pereira', telefone: '(11) 97777-4321', nascimento: '1970-09-30', condicoes: ['Diabetes'], consentimento: true });
  const carla = add('clientes', { nome: 'Carla Mendes', telefone: '(11) 96666-0000', consentimento: true });

  add('afericoes', { clienteId: maria, clienteNome: 'Maria Souza', dataHora: h(0, '09:12'), tipo: 'Pressão', pas: 150, pad: 95, fc: 82, obs: 'Orientada a procurar a UBS.' });
  add('afericoes', { clienteId: joao, clienteNome: 'João Pereira', dataHora: h(0, '08:40'), tipo: 'Glicemia', glicemia: 98, momento: 'Jejum' });
  add('afericoes', { clienteId: maria, clienteNome: 'Maria Souza', dataHora: h(7, '10:05'), tipo: 'Pressão', pas: 138, pad: 88, fc: 76 });
  add('afericoes', { clienteId: carla, clienteNome: 'Carla Mendes', dataHora: h(1, '15:30'), tipo: 'Oximetria', spo2: 97, fc: 70 });
  // Aplicações recorrentes: uma futura, uma para hoje e uma atrasada
  const injetavel = (d, concluida = false) => {
    const proxima = calcularProxima(d);
    add('injetaveis', { ...d, proxima, agendaPendente: !!proxima && !concluida, agendaConcluida: concluida });
  };
  const benzetacil = { clienteId: carla, clienteNome: 'Carla Mendes', medicamento: 'Benzilpenicilina benzatina 1.200.000 UI', lote: 'BZ2291', validade: '2027-03-31', via: 'IM', local: 'Glúteo', receita: true, prescritor: 'Dra. Lima', registroProf: 'CRM 123456', intervalo: 'Semanal', totalDoses: 3 };
  injetavel({ ...benzetacil, dataHora: h(7, '10:15'), dose: 1 }, true);
  injetavel({ ...benzetacil, dataHora: h(0, '10:20'), dose: 2 });
  injetavel({ clienteId: maria, clienteNome: 'Maria Souza', dataHora: h(2, '09:30'), medicamento: 'Cianocobalamina 5.000 mcg', lote: 'CN7781', validade: '2027-08-31', via: 'IM', local: 'Deltoide', receita: true, prescritor: 'Dr. Alves', intervalo: 'A cada 2 dias', dose: 2, totalDoses: 5 });
  injetavel({ clienteId: joao, clienteNome: 'João Pereira', dataHora: `${diasAtras(33)}T16:00`, medicamento: 'Decanoato de haloperidol 50 mg', lote: 'HD0042', validade: '2027-01-31', via: 'IM', local: 'Glúteo', receita: true, intervalo: 'Mensal' });

  for (let d = 6; d >= 0; d--) {
    add('temperatura', { dataHora: h(d, '08:00'), turno: 'Manhã', local: 'Geladeira', atual: 4.5 + (d % 3) * 0.6, min: 3.1, max: 6.2 });
    add('temperatura', { dataHora: h(d, '08:02'), turno: 'Manhã', local: 'Ambiente', atual: 23 + (d % 4), min: 21, max: 27, umidade: 55 });
    if (d > 0) add('temperatura', { dataHora: h(d, '16:00'), turno: 'Tarde', local: 'Geladeira', atual: d === 3 ? 8.9 : 5.1, min: 3.4, max: d === 3 ? 9.4 : 6.5, acao: d === 3 ? 'Porta mal fechada. Ajustada e reconferida após 30 min (5,8 °C).' : '' });
  }

  add('fornecedores', { nome: 'Distribuidora Saúde Ltda.', cnpj: '12.345.678/0001-90', contato: 'Roberto', telefone: '(11) 3333-4444', email: 'vendas@exemplo.com.br', horarioLimite: '14:00', prazo: '24 h', produtos: 'Medicamentos, perfumaria' });
  add('fornecedores', { nome: 'Genéricos Brasil Distribuidora', contato: 'Patrícia', telefone: '(11) 4002-1000', horarioLimite: '17:30', prazo: '2 dias úteis', produtos: 'Genéricos e similares', obs: 'Pedido mínimo de R$ 500.' });
  add('notas', { titulo: 'Dipirona em falta na NF 48213', dataHora: h(0, '09:00'), categoria: 'Estoque', texto: 'Faltaram 2 caixas de dipirona 500 mg. O Roberto (Distribuidora Saúde) vai repor na terça.', lembrete: hoje() });
  add('notas', { titulo: 'Reunião de equipe', dataHora: h(3, '18:10'), categoria: 'Equipe', texto: 'Revisar escala de dezembro e o POP de temperatura com todos.' });

  add('atendimentos', { dataHora: h(0, '11:00'), status: 'Aberto', clienteId: maria, clienteNome: 'Maria Souza', tipo: 'Encomenda', descricao: 'Losartana 50 mg genérico, 3 caixas.', retorno: hoje() });
  add('atendimentos', { dataHora: h(2, '17:45'), status: 'Resolvido', tipo: 'Dúvida', clienteNome: 'Cliente de passagem', descricao: 'Interação entre ibuprofeno e losartana.', solucao: 'Orientado a preferir paracetamol e falar com o médico.' });

  add('pops', { codigo: 'POP-001', titulo: 'Aferição de pressão arterial', versao: '2', vigencia: '2026-01-15', responsavel: 'Farmacêutico RT', conteudo: '1. Cliente em repouso por 5 minutos, sentado, pés apoiados.\n2. Braço na altura do coração, manguito adequado.\n3. Realizar a medida e registrar no app.\n4. Valores ≥ 140/90: orientar e encaminhar à UBS.' });
  add('pops', { codigo: 'POP-002', titulo: 'Controle de temperatura da geladeira', versao: '1', vigencia: '2026-01-15', responsavel: 'Farmacêutico RT', conteudo: '1. Registrar temperatura atual, mínima e máxima no início de cada turno.\n2. Faixa aceitável: 2 °C a 8 °C.\n3. Fora da faixa: registrar ação corretiva e avisar o RT.' });
  return b;
}

// ---------- autenticação ----------
function avisar() { for (const cb of ouvintes) cb(atual); }

export function observarAuth(cb) {
  ouvintes.add(cb);
  let email = null;
  try { email = sessionStorage.getItem(SESSAO); } catch { /* ignora */ }
  const u = email && banco.usuarios[email];
  atual = u ? { uid: email, email, nome: u.nome } : null;
  setTimeout(() => cb(atual), 0);
  return () => ouvintes.delete(cb);
}
export async function entrar(email) {
  const u = banco.usuarios[email];
  if (!u) throw Object.assign(new Error('Usuário de demonstração não encontrado.'), { code: 'auth/user-not-found' });
  try { sessionStorage.setItem(SESSAO, email); } catch { /* ignora */ }
  atual = { uid: email, email, nome: u.nome };
  avisar();
}
export async function sair() {
  try { sessionStorage.removeItem(SESSAO); } catch { /* ignora */ }
  atual = null;
  avisar();
}
export async function cadastrar(nome, email) {
  if (banco.usuarios[email]) throw Object.assign(new Error(''), { code: 'auth/email-already-in-use' });
  banco.usuarios[email] = { email, nome, papel: 'usuario', modulos: [], ativo: false };
  salvar();
  await entrar(email);
}
export async function recuperarSenha() {}
export function definirUsuario() {}
export async function criarPerfilPendente() {}

export function reiniciarDemo() {
  banco = semente();
  salvar();
}

// ---------- usuários ----------
export async function obterPerfil(uid) {
  const u = banco.usuarios[uid];
  return u ? { id: uid, ...structuredClone(u) } : null;
}
export async function listarUsuarios() {
  return Object.entries(banco.usuarios).map(([id, u]) => ({ id, ...structuredClone(u) }));
}
export async function salvarUsuario(uid, dados) {
  Object.assign(banco.usuarios[uid], dados);
  salvar();
}

// ---------- registros ----------
const colecao = (col) => (banco.cols[col] ??= {});
const carimbo = (novo) => ({
  atualizadoPor: atual.uid, atualizadoPorNome: atual.nome, atualizadoLocal: agoraLocal(),
  ...(novo ? { criadoPor: atual.uid, criadoPorNome: atual.nome, criadoLocal: agoraLocal() } : {}),
});

export async function listar(col, { ordem = 'dataHora', desc = true, de, ate, onde, limite = 300 } = {}) {
  let docs = Object.entries(colecao(col)).map(([id, d]) => ({ id, ...structuredClone(d) }));
  if (onde) docs = docs.filter((d) => d[onde[0]] === onde[1]);
  else docs = docs.filter((d) => d[ordem] !== undefined && d[ordem] !== null);
  if (de) docs = docs.filter((d) => String(d[ordem]) >= de);
  if (ate) docs = docs.filter((d) => String(d[ordem]) <= ate + '');
  docs.sort((a, b) => String(a[ordem] ?? '').localeCompare(String(b[ordem] ?? ''), 'pt-BR'));
  if (desc) docs.reverse();
  return docs.slice(0, limite);
}
export async function obter(col, id) {
  const d = colecao(col)[id];
  return d ? { id, ...structuredClone(d) } : null;
}
export async function criar(col, dados) {
  const id = novoId();
  colecao(col)[id] = { ...dados, nAnexos: 0, ...carimbo(true) };
  salvar();
  return { id, status: 'ok' };
}
export async function atualizar(col, id, dados) {
  Object.assign(colecao(col)[id], dados, carimbo(false));
  salvar();
  return { status: 'ok' };
}
export async function excluir(col, id) {
  delete colecao(col)[id];
  delete banco.anexos[`${col}/${id}`];
  salvar();
}

// ---------- anexos ----------
const anexosDe = (col, id) => (banco.anexos[`${col}/${id}`] ??= {});
export async function listarAnexos(col, id) {
  return Object.entries(anexosDe(col, id))
    .map(([aid, a]) => ({ id: aid, ...a }))
    .sort((a, b) => String(b.criadoLocal).localeCompare(String(a.criadoLocal)));
}
export async function criarAnexo(col, id, dados) {
  const aid = novoId();
  anexosDe(col, id)[aid] = { ...dados, ...carimbo(true) };
  colecao(col)[id].nAnexos = (colecao(col)[id].nAnexos || 0) + 1;
  try { localStorage.setItem(CHAVE, JSON.stringify(banco)); } catch {
    delete anexosDe(col, id)[aid];
    colecao(col)[id].nAnexos--;
    throw new Error('O armazenamento de demonstração deste navegador está cheio. No Firebase isso não acontece.');
  }
  return { id: aid, status: 'ok' };
}
export async function atualizarAnexo(col, id, aid, dados) {
  Object.assign(anexosDe(col, id)[aid], dados, carimbo(false));
  salvar();
  return { status: 'ok' };
}
export async function excluirAnexo(col, id, aid) {
  delete anexosDe(col, id)[aid];
  colecao(col)[id].nAnexos = Math.max(0, (colecao(col)[id].nAnexos || 1) - 1);
  salvar();
}
