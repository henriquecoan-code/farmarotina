import { firebaseConfig } from './config.js';
import { agoraLocal } from './util.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'pt';
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

let atual = null; // { uid, nome }
export function definirUsuario(u) { atual = u; }

// Sem internet, a escrita fica na fila local e a promise só resolve quando sincroniza.
// Não travamos a tela: depois de alguns segundos seguimos e avisamos que está pendente.
async function comPrazo(p) {
  p.catch((e) => window.dispatchEvent(new CustomEvent('erro-sync', { detail: e })));
  return Promise.race([p.then(() => 'ok'), new Promise((r) => setTimeout(() => r('pendente'), 4000))]);
}

function carimbo(novo) {
  const c = { atualizadoEm: serverTimestamp(), atualizadoPor: atual.uid, atualizadoPorNome: atual.nome, atualizadoLocal: agoraLocal() };
  if (novo) Object.assign(c, { criadoEm: serverTimestamp(), criadoPor: atual.uid, criadoPorNome: atual.nome, criadoLocal: agoraLocal() });
  return c;
}

const lerDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ---------- autenticação ----------
export function observarAuth(cb) {
  return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email, nome: u.displayName || u.email } : null));
}
export const entrar = (email, senha) => signInWithEmailAndPassword(auth, email, senha);
export const sair = () => signOut(auth);
export const recuperarSenha = (email) => sendPasswordResetEmail(auth, email);

export async function cadastrar(nome, email, senha) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await updateProfile(cred.user, { displayName: nome });
  await criarPerfilPendente({ uid: cred.user.uid, nome, email });
}

// ---------- usuários ----------
export function criarPerfilPendente({ uid, nome, email }) {
  return setDoc(doc(db, 'usuarios', uid), {
    nome, email, papel: 'usuario', modulos: [], ativo: false, criadoEm: serverTimestamp(),
  });
}
export async function obterPerfil(uid) {
  const s = await getDoc(doc(db, 'usuarios', uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function listarUsuarios() {
  return lerDocs(await getDocs(collection(db, 'usuarios')));
}
export const salvarUsuario = (uid, dados) => updateDoc(doc(db, 'usuarios', uid), dados);

// ---------- registros ----------
export async function listar(col, { ordem = 'dataHora', desc = true, de, ate, onde, limite = 300 } = {}) {
  const c = collection(db, col);
  const dir = desc ? 'desc' : 'asc';
  let q;
  if (onde) {
    // Filtro por igualdade + ordenação exigiria índice composto: ordenamos no navegador.
    q = query(c, where(onde[0], '==', onde[1]), limit(limite));
  } else if (de || ate) {
    const filtros = [];
    if (de) filtros.push(where(ordem, '>=', de));
    if (ate) filtros.push(where(ordem, '<=', ate + ''));
    q = query(c, ...filtros, orderBy(ordem, dir), limit(limite));
  } else {
    q = query(c, orderBy(ordem, dir), limit(limite));
  }
  const docs = lerDocs(await getDocs(q));
  if (onde) {
    docs.sort((a, b) => String(a[ordem] ?? '').localeCompare(String(b[ordem] ?? ''), 'pt-BR'));
    if (desc) docs.reverse();
  }
  return docs;
}

export async function obter(col, id) {
  const s = await getDoc(doc(db, col, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function criar(col, dados) {
  const ref = doc(collection(db, col));
  const status = await comPrazo(setDoc(ref, { ...dados, nAnexos: 0, ...carimbo(true) }));
  return { id: ref.id, status };
}

export async function atualizar(col, id, dados) {
  const status = await comPrazo(updateDoc(doc(db, col, id), { ...dados, ...carimbo(false) }));
  return { status };
}

// Grava (ou substitui por inteiro) um registro com id escolhido, ex.: regra por EAN, vendas de um mês
export async function definir(col, id, dados) {
  const status = await comPrazo(setDoc(doc(db, col, id), { ...dados, ...carimbo(true) }));
  return { id, status };
}

export const apagar = (col, id) => deleteDoc(doc(db, col, id));

export async function excluir(col, id) {
  const anexos = await getDocs(collection(db, col, id, 'anexos'));
  await Promise.all(anexos.docs.map((a) => deleteDoc(a.ref)));
  await deleteDoc(doc(db, col, id));
}

// ---------- anexos (subcoleção) ----------
export async function listarAnexos(col, id) {
  const docs = lerDocs(await getDocs(collection(db, col, id, 'anexos')));
  return docs.sort((a, b) => String(b.criadoLocal).localeCompare(String(a.criadoLocal)));
}
export async function criarAnexo(col, id, dados) {
  const ref = doc(collection(db, col, id, 'anexos'));
  const status = await comPrazo(setDoc(ref, { ...dados, ...carimbo(true) }));
  await comPrazo(updateDoc(doc(db, col, id), { nAnexos: increment(1) }));
  return { id: ref.id, status };
}
export async function atualizarAnexo(col, id, aid, dados) {
  return { status: await comPrazo(updateDoc(doc(db, col, id, 'anexos', aid), { ...dados, ...carimbo(false) })) };
}
export async function excluirAnexo(col, id, aid) {
  await deleteDoc(doc(db, col, id, 'anexos', aid));
  await updateDoc(doc(db, col, id), { nAnexos: increment(-1) });
}
