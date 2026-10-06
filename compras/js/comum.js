// Parte comum das páginas de compras (Pedido e Histórico de vendas):
// usa o mesmo login e as mesmas permissões do FarmaRotina.
import { db } from '../../js/db.js';
import { DEMO, NOME_APP } from '../../js/config.js';
import { definirPerfil, podeVer } from '../../js/perm.js';
import { esc, html, icone, mensagemErro } from '../../js/util.js';

export { db };

const PAGINAS = [
  { id: 'pedido', href: 'pedido.html', icone: 'shopping-cart', nome: 'Pedido' },
  { id: 'historico', href: 'historico.html', icone: 'chart-line', nome: 'Histórico de vendas' },
];

function aviso(raiz, msg, comLink = true) {
  raiz.innerHTML = '';
  raiz.append(html(`<div class="tela-entrada"><div class="cartao entrada">
    <div class="marca grande">${icone('first-aid-kit')} ${esc(NOME_APP)}</div>
    <p>${esc(msg)}</p>
    ${comLink ? `<a class="btn pri" href="../index.html">${icone('login')} Ir para o ${esc(NOME_APP)}</a>` : ''}
  </div></div>`));
}

function topo(atual, perfil) {
  return html(`<header class="compras-topo">
    <a class="marca" href="../index.html" title="Voltar ao ${esc(NOME_APP)}">${icone('first-aid-kit')} ${esc(NOME_APP)}</a>
    <nav class="compras-nav">${PAGINAS.filter((p) => podeVer(p.id)).map((p) => `<a href="${p.href}" class="${p.id === atual ? 'ativo' : ''}">${icone(p.icone)}<span>${esc(p.nome)}</span></a>`).join('')}</nav>
    <span class="compras-usuario mudo">${DEMO ? '<span class="selo-texto info">Demonstração</span> ' : ''}${esc(perfil.nome || '')}</span>
  </header>`);
}

// Confere login e permissão do módulo; se estiver tudo certo, desenha o topo e chama montar(main, perfil).
export function iniciar({ modulo, titulo, montar }) {
  const raiz = document.getElementById('app');
  db.observarAuth(async (u) => {
    if (!u) return aviso(raiz, `Entre no ${NOME_APP} para usar o ${titulo}.`);
    db.definirUsuario(u);
    try {
      const p = await db.obterPerfil(u.uid);
      definirPerfil(p);
      if (!p?.ativo) return aviso(raiz, 'Seu acesso ainda não foi liberado pelo administrador.');
      if (!podeVer(modulo)) {
        return aviso(raiz, `Você não tem acesso ao ${titulo}. Peça ao administrador para liberar o módulo na tela Usuários do ${NOME_APP}.`);
      }
      db.definirUsuario({ uid: u.uid, nome: p.nome || u.nome });
      raiz.innerHTML = '';
      raiz.append(topo(modulo, p));
      const main = html('<main class="compras-main"></main>');
      raiz.append(main);
      await montar(main, p);
    } catch (e) {
      console.error(e);
      aviso(raiz, mensagemErro(e), false);
    }
  });
}

// ---------- utilidades de planilha ----------
// Lê .xls/.xlsx/.csv no navegador (SheetJS) e devolve as linhas como listas de células.
// As colunas são contadas a partir da coluna A, como o pandas faz.
export async function lerPlanilha(arquivo) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('Não foi possível carregar o leitor de planilhas. Confira a internet e recarregue a página.');
  const buf = await arquivo.arrayBuffer();
  let wb;
  if (/\.csv$/i.test(arquivo.name)) {
    // CSV do Trier costuma vir em Latin-1 e separado por ";"
    let texto = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
    const primeira = texto.split(/\r?\n/, 1)[0] || '';
    wb = XLSX.read(texto, { type: 'string', FS: primeira.includes(';') ? ';' : ',', raw: true });
  } else {
    wb = XLSX.read(buf, { type: 'array' });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) return [];
  const inicioCol = XLSX.utils.decode_range(ws['!ref']).s.c;
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  return inicioCol ? linhas.map((l) => [...Array(inicioCol).fill(null), ...l]) : linhas;
}

// Número vindo da planilha: célula numérica, "1234.5" ou formato BR "1.234,56"
export function numero(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let t = String(v).trim();
  if (!t || t.toLowerCase() === 'nan') return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
