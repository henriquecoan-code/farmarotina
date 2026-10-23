// Busca geral: procura um texto em tudo o que está salvo no Firebase e que a pessoa pode ver.
// O Firestore não tem busca por texto, então os registros mais recentes de cada coleção são carregados
// (uma vez, ao usar a busca) e filtrados aqui no navegador.
import { db } from '../db.js';
import { podeVer, ehAdmin } from '../perm.js';
import { visiveis } from '../modulos/index.js';
import { fmtValor, nomeRef } from '../form.js';
import { linhaRegistro } from './lista.js';
import { esc, html, icone, normalizar, fmtDataHora } from '../util.js';

const POR_COLECAO = 300;          // registros mais recentes de cada coleção
const VALIDADE_INDICE = 2 * 60_000; // relê os registros se a última leitura tiver mais de 2 minutos
const MAX_POR_GRUPO = 8;

let indice = null;     // [{ fonte, d, texto, titulo }]
let carregadoEm = 0;
let carregando = null;

// Texto pesquisável de um registro de módulo: todos os campos formatados (+ nomes de cliente/fornecedor)
function textoDoRegistro(schema, d) {
  const partes = [];
  for (const c of schema.campos) {
    if (c.tipo === 'secao') continue;
    try { partes.push(fmtValor(c, d)); } catch { /* campo com formato inesperado */ }
    if (c.tipo === 'ref') partes.push(d[nomeRef(c.k)] || '');
  }
  partes.push(d.criadoPorNome || '');
  return partes.join(' ');
}

const seguro = (fn, padrao = '') => { try { return fn() ?? padrao; } catch { return padrao; } };

// Fontes de dados: os módulos do menu e algumas coleções das páginas separadas
function fontes() {
  const lista = visiveis().map((s) => ({
    id: s.id, nome: s.nome, icone: s.icone,
    carregar: () => db.listar(s.id, { ordem: s.ordem, desc: s.desc, limite: POR_COLECAO }),
    preparar: (d) => (s.normalizar ? s.normalizar(d) : d),
    titulo: (d) => seguro(() => s.titulo(d)),
    texto: (d) => textoDoRegistro(s, d),
    linha: (d) => linhaRegistro(s, d),
  }));

  if (podeVer('orcamento')) {
    lista.push({
      id: 'orcamentos', nome: 'Orçamentos', icone: 'file-dollar',
      carregar: () => db.listar('orcamentos', { ordem: 'dataHora', desc: true, limite: POR_COLECAO }),
      titulo: (d) => d.clienteNome || 'Cliente não informado',
      texto: (d) => [d.clienteNome, d.telefone, d.obs, d.situacao, ...(d.itens || []).map((i) => `${i.nome} ${i.laboratorio || ''}`)].join(' '),
      linha: (d) => linhaSimples(`consultas/orcamento.html#id=${encodeURIComponent(d.id)}`, d.clienteNome || 'Cliente não informado',
        [fmtDataHora(d.dataHora), `${(d.itens || []).length} item(ns)`, d.situacao].filter(Boolean).join(' · '),
        (d.itens || []).slice(0, 3).map((i) => i.nome).join(', ')),
    });
  }
  if (podeVer('pedido')) {
    lista.push({
      id: 'pedido_regras', nome: 'Regras do pedido de compras', icone: 'shopping-cart',
      carregar: () => db.listar('pedido_regras', { ordem: 'ean', desc: false, limite: 2000 }),
      titulo: (d) => d.produto || d.ean,
      texto: (d) => [d.produto, d.ean, d.observacao].join(' '),
      linha: (d) => linhaSimples('compras/pedido.html', d.produto || d.ean,
        [d.ean, d.excluir_sempre ? 'sempre excluir' : d.quantidade_fixa != null ? `quantidade fixa ${d.quantidade_fixa}` : 'sempre incluir'].join(' · '),
        d.observacao || ''),
    });
  }
  if (ehAdmin()) {
    lista.push({
      id: 'usuarios', nome: 'Usuários', icone: 'shield-lock',
      carregar: () => db.listarUsuarios(),
      titulo: (d) => d.nome || d.email,
      texto: (d) => [d.nome, d.email].join(' '),
      linha: (d) => linhaSimples('#/usuarios', d.nome || '(sem nome)', d.email || '', d.excluido ? 'removido' : d.ativo ? 'ativo' : 'aguardando aprovação'),
    });
  }
  return lista;
}

function linhaSimples(href, titulo, sub, valor) {
  return `<a class="linha" href="${esc(href)}"><div class="linha-texto"><div class="linha-titulo">${esc(titulo)}</div>
    <div class="linha-sub">${esc(sub)}</div></div><div class="linha-valor"><span class="mudo">${esc(valor)}</span></div></a>`;
}

async function carregarIndice(forcar = false) {
  if (!forcar && indice && Date.now() - carregadoEm < VALIDADE_INDICE) return indice;
  carregando ??= (async () => {
    const partes = await Promise.all(fontes().map(async (f) => {
      try {
        const docs = await f.carregar();
        return docs.map((bruto) => {
          const d = f.preparar ? f.preparar(bruto) : bruto;
          const titulo = palavrasDe(f.titulo(d));
          return { fonte: f, d, titulo, texto: `${titulo}${palavrasDe(seguro(() => f.texto(d)))}` };
        });
      } catch (e) {
        console.warn('Busca: não foi possível ler', f.id, e);
        return [];
      }
    }));
    indice = partes.flat();
    carregadoEm = Date.now();
    carregando = null;
    return indice;
  })();
  return carregando;
}

export const limparIndiceBusca = () => { indice = null; };
// Começa a carregar em segundo plano (ex.: quando a pessoa clica no campo de busca)
export const prepararBusca = () => { carregarIndice().catch(() => {}); };

// Texto sem acento, minúsculo, com um espaço antes de cada palavra (" maria souza 11 98888"),
// para casar pelo começo das palavras: "mari" acha "Maria", mas não "perfumaria"
const palavrasDe = (t) => ` ${normalizar(t).replace(/[^a-z0-9]+/g, ' ').trim()} `;

// Todas as palavras precisam aparecer; o que bate no título vem primeiro
function procurar(lista, termo) {
  const palavras = palavrasDe(termo).trim().split(' ').filter(Boolean);
  if (!palavras.length) return [];
  return lista
    .filter((r) => palavras.every((p) => r.texto.includes(` ${p}`)))
    .map((r) => ({ ...r, pontos: palavras.filter((p) => r.titulo.includes(` ${p}`)).length * 10 + (r.titulo.startsWith(` ${palavras[0]}`) ? 5 : 0) }))
    .sort((a, b) => b.pontos - a.pontos);
}

export async function paginaBusca(main, query) {
  const termo = (query.get('q') || '').trim();
  main.innerHTML = '';
  const pagina = html(`<div class="pagina">
    <div class="pagina-topo"><div><h1>${icone('search')} Busca</h1>
      <div class="mudo" data-resumo>${termo ? 'Procurando…' : 'Digite no campo de busca do menu.'}</div></div>
      <button type="button" class="btn pequeno" data-atualizar title="Ler de novo os registros do Firebase">${icone('refresh')} Atualizar</button></div>
    <div class="busca-resultados" data-resultados></div>
  </div>`);
  main.append(pagina);
  pagina.querySelector('[data-atualizar]').onclick = async () => { await carregarIndice(true); paginaBusca(main, query); };
  if (!termo) return;

  const lista = await carregarIndice();
  // A pessoa pode ter continuado digitando enquanto carregava
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('q')?.trim() !== termo) return;

  const achados = procurar(lista, termo);
  const resumo = pagina.querySelector('[data-resumo]');
  resumo.textContent = achados.length
    ? `${achados.length} resultado(s) para “${termo}”`
    : `Nada encontrado para “${termo}”. A busca olha os ${POR_COLECAO} registros mais recentes de cada módulo.`;

  const grupos = new Map();
  for (const r of achados) {
    if (!grupos.has(r.fonte.id)) grupos.set(r.fonte.id, { fonte: r.fonte, itens: [] });
    grupos.get(r.fonte.id).itens.push(r);
  }
  pagina.querySelector('[data-resultados]').innerHTML = [...grupos.values()].map(({ fonte, itens }) => `<section class="busca-grupo">
    <h2>${icone(fonte.icone)} ${esc(fonte.nome)} <span class="mudo">(${itens.length})</span></h2>
    <div class="lista">${itens.slice(0, MAX_POR_GRUPO).map((r) => seguro(() => fonte.linha(r.d))).join('')}</div>
    ${itens.length > MAX_POR_GRUPO ? `<p class="mudo pequeno">E mais ${itens.length - MAX_POR_GRUPO}. Refine a busca para ver os outros.</p>` : ''}
  </section>`).join('');
}

