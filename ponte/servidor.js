// Ponte local entre o FarmaRotina (navegador) e o banco do Trier — SOMENTE LEITURA.
// Escuta só neste computador (127.0.0.1). Cada pedido precisa do login do FarmaRotina:
// o token do Firebase é conferido aqui e o usuário precisa ser admin ou ter o módulo "crediario".
import http from 'node:http';
import crypto from 'node:crypto';
import { lerConfig, criarPool, CAMINHO_CONFIG } from './banco.js';
import * as consultas from './consultas.js';

const VERSAO = '1.0';
const cfg = lerConfig();
const PORTA = cfg.portaPonte || 3790;
const PROJETO = cfg.projetoFirebase || 'farmarotina-ed7c3';
const ORIGENS = cfg.origens || ['https://henriquecoan-code.github.io'];
const opcoes = { rede: cfg.rede ?? 1, filial: cfg.filial ?? 3, carencia: cfg.carenciaJuros ?? 10 };
const pool = criarPool(cfg);

class ErroHttp extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

// ---------- login do Firebase ----------
let chaves = { expira: 0, certs: {} };
async function certificados() {
  if (Date.now() < chaves.expira) return chaves.certs;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new ErroHttp(503, 'Não consegui baixar as chaves do Google para conferir o login.');
  const idade = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') || '')?.[1] || 3600);
  chaves = { certs: await r.json(), expira: Date.now() + idade * 1000 };
  return chaves.certs;
}

const b64 = (s) => Buffer.from(s, 'base64url');

async function verificarToken(token) {
  const [cab, corpo, assinatura] = String(token).split('.');
  if (!assinatura) throw new ErroHttp(401, 'Entre no FarmaRotina para consultar o crediário.');
  let h, d;
  try { h = JSON.parse(b64(cab)); d = JSON.parse(b64(corpo)); } catch { throw new ErroHttp(401, 'Login inválido.'); }
  const pem = h.alg === 'RS256' && (await certificados())[h.kid];
  if (!pem) throw new ErroHttp(401, 'Login inválido.');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${cab}.${corpo}`), new crypto.X509Certificate(pem).publicKey, b64(assinatura));
  const agora = Date.now() / 1000;
  if (!ok || d.aud !== PROJETO || d.iss !== `https://securetoken.google.com/${PROJETO}` || !d.sub || d.exp < agora || d.iat > agora + 300) {
    throw new ErroHttp(401, 'Login inválido ou expirado. Atualize a página.');
  }
  return d;
}

// Permissão lida do perfil do usuário no Firestore (com o próprio token dele); guardada por 5 minutos
const permissoes = new Map();
async function autorizar(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { sub: uid } = await verificarToken(token);
  let p = permissoes.get(uid);
  if (!p || p.ate < Date.now()) {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${token}` } });
    const f = r.ok ? (await r.json()).fields || {} : {};
    const modulos = (f.modulos?.arrayValue?.values || []).map((v) => v.stringValue);
    const ok = f.ativo?.booleanValue === true && (f.papel?.stringValue === 'admin' || modulos.includes('crediario'));
    p = { ok, ate: Date.now() + 5 * 60 * 1000 };
    permissoes.set(uid, p);
  }
  if (!p.ok) throw new ErroHttp(403, 'Seu usuário não tem acesso ao Crediário. Peça ao administrador.');
}

// ---------- rotas ----------
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const hojeLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

async function responder(url, req) {
  const partes = url.pathname.split('/').filter(Boolean);
  if (partes[0] === 'saude') {
    let banco = false;
    try { await pool.query('SELECT 1'); banco = true; } catch { /* informa abaixo */ }
    return { ok: true, versao: VERSAO, filial: opcoes.filial, banco };
  }
  await autorizar(req);
  if (partes[0] === 'clientes' && !partes[1]) return consultas.buscarClientes(pool, opcoes, url.searchParams.get('busca') || '');
  if (partes[0] === 'clientes' && /^\d+$/.test(partes[1])) {
    const r = await consultas.cliente(pool, opcoes, Number(partes[1]));
    if (!r) throw new ErroHttp(404, 'Cliente não encontrado.');
    return r;
  }
  if (partes[0] === 'recebimentos') {
    const de = url.searchParams.get('de') || hojeLocal();
    const ate = url.searchParams.get('ate') || de;
    if (!DATA.test(de) || !DATA.test(ate)) throw new ErroHttp(400, 'Datas inválidas.');
    return consultas.recebimentos(pool, opcoes, de, ate);
  }
  if (partes[0] === 'atrasados') {
    const dias = Math.max(1, Math.min(3650, Number(url.searchParams.get('dias')) || 1));
    return consultas.atrasados(pool, opcoes, dias);
  }
  throw new ErroHttp(404, 'Endereço não encontrado.');
}

function origemPermitida(origem) {
  return !!origem && (ORIGENS.includes(origem) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem));
}

const servidor = http.createServer(async (req, res) => {
  const origem = req.headers.origin;
  if (origemPermitida(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Max-Age', '600');
  } else if (origem) {
    res.writeHead(403).end();
    return;
  }
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.writeHead(405).end('{}'); return; }
  try {
    const dados = await responder(new URL(req.url, 'http://127.0.0.1'), req);
    res.writeHead(200).end(JSON.stringify(dados));
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(new Date().toLocaleString('pt-BR'), e.message);
    res.writeHead(status).end(JSON.stringify({ erro: status === 500 ? `Erro ao consultar o banco: ${e.message}` : e.message }));
  }
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Ponte do crediário v${VERSAO} rodando em http://127.0.0.1:${PORTA} (filial ${opcoes.filial}, config: ${CAMINHO_CONFIG})`);
  console.log('Deixe esta janela aberta (pode minimizar).');
});
servidor.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `A porta ${PORTA} já está em uso — a ponte já deve estar aberta.` : e.message);
  process.exit(1);
});
