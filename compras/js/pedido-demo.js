// Dados fictícios do pedido de compras para o modo demonstração (sem ponte nem banco do Trier).
const LABS = { 1: 'EMS', 2: 'MEDLEY', 3: 'NEO QUIMICA', 4: 'EUROFARMA', 5: 'HYPERA', 6: 'PRATI DONADUZZI', 7: 'CIMED' };
const FORNECEDORES = { 10: 'DISTRIBUIDORA EXEMPLO', 11: 'DROGARIA ATACADO MODELO', 12: 'EMS (DIRETO)', 13: 'HYPERA (DIRETO)' };
const GRUPOS = { 2000: 'SIMILAR', 3000: 'REFERENCIA', 4000: 'GENERICO', 8000: 'PERFUMARIA', 9000: 'CORRELATOS' };
const DEPTOS = { 1: 'MEDICAMENTOS', 2: 'HIGIENE', 3: 'CONVENIENCIA' };
const CATEGS = { 1: 'ANALGESICOS', 2: 'ANTIBIOTICOS', 3: 'ANTI-HIPERTENSIVOS', 4: 'GRIPE E RESFRIADO', 5: 'DERMOCOSMETICOS' };

const NOMES = ['DIPIRONA 500MG 10CP', 'LOSARTANA 50MG 30CP', 'AMOXICILINA 500MG 21CP', 'PARACETAMOL 750MG 20CP', 'BENEGRIPE 20CP',
  'OMEPRAZOL 20MG 28CP', 'IBUPROFENO 600MG 20CP', 'SINVASTATINA 20MG 30CP', 'METFORMINA 850MG 30CP', 'AZITROMICINA 500MG 3CP',
  'HIDROCLOROTIAZIDA 25MG 30CP', 'DORFLEX 36CP', 'NEOSALDINA 20DRG', 'PROTETOR SOLAR FPS50 200ML', 'FIO DENTAL 50M',
  'SHAMPOO ANTICASPA 200ML', 'ATENOLOL 25MG 30CP', 'CLONAZEPAM 2MG 30CP', 'VITAMINA C 1G 10EF', 'ESOMEPRAZOL 40MG 28CP',
  'ENALAPRIL 10MG 30CP', 'NIMESULIDA 100MG 12CP', 'LORATADINA 10MG 12CP', 'CETOPROFENO 100MG 20CP', 'BUSCOPAN 20DRG',
  'POMADA ASSADURA 45G', 'ALCOOL GEL 500ML', 'SABONETE LIQUIDO 250ML', 'TERMOMETRO DIGITAL', 'SERINGA 5ML C/AGULHA'];

const dia = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function produtos() {
  return NOMES.map((nome, i) => {
    const lab = (i % 7) + 1;
    const venda = [0, 1, 2, 4, 8, 15, 30][i % 7];
    const v30 = venda * 2 + (i % 3);
    const fat = [1, 1, 1, 25, 1, 12, 1][i % 7];
    const saldo = [-2, 0, 0, 3, 12, 40, 5, 1, 0, 60][i % 10];
    const parado = i % 9 === 0;
    return {
      id: 1000 + i, nome, ean: String(7890000000000 + i * 37),
      lab, grupo: [4000, 3000, 2000, 8000, 9000][i % 5], depto: (i % 3) + 1, cat: (i % 5) + 1,
      curva: ['A', 'B', 'B', 'C', 'A', 'D'][i % 6], saldo: parado ? 18 : saldo,
      minimo: [2, 1, 3, 4][i % 4], demanda: [4, 2, 6, 8][i % 4], custo: 3.5 + (i * 7.3) % 60,
      periodo: parado ? 0 : v30, v7: parado ? 0 : Math.round(v30 / 4), v30: parado ? 0 : v30, v90: parado ? 0 : v30 * 3,
      v180: parado ? 0 : v30 * 6, v365: parado ? 1 : v30 * 12,
      ultVenda: parado ? dia(200) : dia(i % 5), ultEntrada: dia(10 + i), ultFornec: 10 + (i % 4),
      forn: [[10 + (i % 4), fat, dia(10 + i)], ...(i % 2 ? [[12, 1, dia(60)]] : [])],
    };
  });
}

export function demoPedido(caminho) {
  const url = new URL(caminho, 'http://demo');
  return {
    de: url.searchParams.get('de') || dia(29), ate: url.searchParams.get('ate') || dia(0), produtos: produtos(),
    laboratorios: LABS, grupos: GRUPOS, departamentos: DEPTOS, categorias: CATEGS, fornecedores: FORNECEDORES,
  };
}
