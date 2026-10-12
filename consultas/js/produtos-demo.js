// Dados fictícios da consulta de produtos para o modo demonstração (sem ponte nem banco)
import { diasAtras } from '../../js/util.js';

const FORMAS = { 0: 'Outros', 1: 'Comprimido/cápsula', 2: 'Injetável', 3: 'Gotas', 4: 'Líquido', 5: 'Gel/pomada/creme' };

// [id, nome, laboratório, dcb, concentração, forma, quantidade, estoque, PMC, custo, curva, desconto %]
const PRODUTOS = [
  [25352, 'LOSARTANA POT 50MG 30CP REV', 'PRATI DONADUZZI', '05432', '50MG', 1, 30, 5, 10.96, 2.08, 'A', 39.02],
  [31414, 'LOSARTANA POT 50MG 30CP REV', 'NEO QUIMICA', '05432', '50MG', 1, 30, 2, 10.94, 2.62, 'A', 28.86],
  [33292, 'LOSARTANA POT 50MG 30CP REV', 'EMS', '05432', '50MG', 1, 30, 0, 21.73, 1.33, 'D', 46.34],
  [31405, 'LOSARTANA POT 50MG 60CP REV', 'PRATI DONADUZZI', '05432', '50MG', 1, 60, 21, 21.92, 4.1, 'A', 40],
  [18481, 'LOSARTANA POT 100MG 30CP REV', 'GERMED', '05432', '100MG', 1, 30, 0, 53.09, 19.25, 'D', 30],
  [26410, 'LOSARTANA POT 100MG 30CP REV', 'EUROFARMA', '05432', '100MG', 1, 30, 4, 32.5, 9.8, 'B', 35],
  [12001, 'COZAAR 50MG 30CP REV', 'ORGANON', '05432', '50MG', 1, 30, 3, 98.4, 71.2, 'C', 0],
  [40100, 'DIPIRONA 500MG/ML GTS 20ML', 'EMS', '03121', '500MG/ML', 3, 20, 37, 6.99, 2.1, 'A', 20],
  [40101, 'DIPIRONA 1G 10CP', 'MEDLEY', '03121', '1G', 1, 10, 12, 9.9, 3.4, 'B', 15],
  [40200, 'PROTETOR SOLAR FPS50 120ML', 'NIVEA', null, null, 0, null, 6, 64.9, 41.0, 'C', 0],
].map(([id, nome, laboratorio, dcb, concentracao, forma, quantidade, estoque, pmc, custo, curva, desc]) => {
  const venda = Math.round(pmc * (1 - desc / 100) * 100) / 100;
  return { id, nome, laboratorio, dcb, concentracao, forma, quantidade, estoque, pmc, venda, custo, curva, ativo: true,
    desconto: Math.round((pmc - venda) / pmc * 1000) / 10, margem: Math.round((venda - custo) / venda * 1000) / 10 };
});
const CLIENTES = [[1201, 'MARIA APARECIDA DA SILVA'], [null, null], [877, 'JOSE CARLOS PEREIRA'], [null, null], [1530, 'ANA PAULA SOUZA']];

const DCBS = { '05432': 'LOSARTANA POTASSICA', '03121': 'DIPIRONA MONOIDRATADA' };
const semDcb = ({ dcb, ...resto }) => resto;

export function demoProdutos(caminho) {
  const url = new URL(caminho, 'http://demo');
  const [, id, sub] = url.pathname.split('/').filter(Boolean);
  if (!id) {
    const termo = (url.searchParams.get('busca') || '').toUpperCase().trim();
    const palavras = termo.split(/\s+/);
    return PRODUTOS.filter((p) => String(p.id) === termo || palavras.every((w) => p.nome.includes(w))).map(semDcb);
  }
  const p = PRODUTOS.find((x) => x.id === Number(id));
  if (!p) throw new Error('Produto não encontrado.');
  if (sub === 'info') {
    const dias = Number(url.searchParams.get('dias')) || 90;
    const compras = [12, 40, 75, 110, 160, 230].filter((n) => n <= dias).map((n, i) => ({ data: diasAtras(n), fornecedor: ['SANTA CRUZ', 'PROFARMA', 'PANPHARMA'][i % 3],
      nf: 2064000 + i, quantidade: 6 + i * 2, fator: 1, unitario: Math.round(p.custo * 3.5 * 100) / 100, desconto: 71.4, custo: p.custo,
      total: Math.round(p.custo * (6 + i * 2) * 100) / 100 }));
    const vendas = Array.from({ length: Math.round(dias / (p.curva === 'A' ? 2 : 7)) }, (_, i) => ({
      data: diasAtras(Math.round(i * (p.curva === 'A' ? 2 : 7))), hora: `${String(9 + (i % 10)).padStart(2, '0')}:1${i % 10}:00`, quantidade: 1 + (i % 2),
      unitario: p.venda, desconto: i % 3 ? 10 : 0, total: Math.round(p.venda * (1 + (i % 2)) * (i % 3 ? 0.9 : 1) * 100) / 100,
      clienteId: CLIENTES[i % 5][0], cliente: CLIENTES[i % 5][1] }));
    const soma = (l, k) => Math.round(l.reduce((s, x) => s + x[k], 0) * 100) / 100;
    return {
      dias,
      totais: { qtdComprada: soma(compras, 'quantidade'), valorComprado: soma(compras, 'total'), compras: compras.length,
        qtdVendida: soma(vendas, 'quantidade'), valorVendido: soma(vendas, 'total'), vendas: vendas.length },
      compras, vendas,
    };
  }
  return {
    produto: { ...semDcb(p), codigo: String(p.id), dcb: p.dcb, nomeDcb: DCBS[p.dcb] || null, descontoMaximo: 70,
      custoCadastro: Math.round(p.pmc * 0.72 * 100) / 100, alteracaoPreco: diasAtras(30), descApresentacao: null, minimo: 2, demanda: 8,
      ultimaEntrada: diasAtras(12), qtdUltimaEntrada: 6, ultimaSaida: diasAtras(1), local: 'G3', ean: '7896004708539' },
    similares: p.dcb ? PRODUTOS.filter((x) => x.dcb === p.dcb).map(semDcb) : [],
    formas: FORMAS,
  };
}
