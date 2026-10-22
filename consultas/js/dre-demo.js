// Dados fictícios do DRE para o modo demonstração (sem ponte nem banco). Mesmo formato da rota /dre da ponte.
const proximo = (m) => { const [a, b] = m.split('-').map(Number); return b === 12 ? `${a + 1}-01` : `${a}-${String(b + 1).padStart(2, '0')}`; };
// Variação estável por mês (sem aleatório, para os números não mudarem a cada recarga)
const fator = (m) => 1 + (((Number(m.slice(0, 4)) * 12 + Number(m.slice(5))) * 37) % 21 - 10) / 100;
const r2 = (n) => Math.round(n * 100) / 100;

// [tipo, nome do tipo, fornecedor, nome, descrição, valor, dia do vencimento]
const DESPESAS = [
  [1, 'FUNCIONARIOS', 501, 'FOLHA DE PAGAMENTO', 'SALARIOS DO MES', 14200, 5],
  [7, 'TRIBUTOS', 502, 'RECEITA FEDERAL', 'DAS SIMPLES NACIONAL', 15800, 20],
  [7, 'TRIBUTOS', 502, 'RECEITA FEDERAL', 'FGTS', 1150, 7],
  [12, 'ENERGIA', 503, 'COMPANHIA DE ENERGIA', 'ENERGIA', 1380, 12],
  [2, 'SISTEMA TRIER', 504, 'TRIER SISTEMAS', 'MENSALIDADE SISTEMA', 690, 10],
  [4, 'SERVICOS TERCEIRIZADO', 505, 'ESCRITORIO CONTABIL', 'HONORARIOS CONTABEIS', 1100, 10],
  [4, 'SERVICOS TERCEIRIZADO', 506, 'LIMPEZA E CIA', 'FAXINA', 600, 15],
  [3, 'CUSTOS OPERACIONAIS', 507, 'PAPELARIA CENTRAL', 'SACOLAS E BOBINAS', 420, 18],
  [6, 'FINANCEIRO', 508, 'BANCO', 'TARIFA BANCARIA', 180, 1],
  [10, 'MARKETING', 509, 'GRAFICA RAPIDA', 'PANFLETOS', 350, 22],
  [9, 'DESPESAS DIVERSAS', 510, 'DIVERSOS', 'ALUGUEL', 6500, 10],
  [9, 'DESPESAS DIVERSAS', 510, 'DIVERSOS', 'AGUA', 160, 14],
  [9, 'DESPESAS DIVERSAS', 510, 'DIVERSOS', 'INTERNET', 199, 16],
  [9, 'DESPESAS DIVERSAS', 510, 'DIVERSOS', 'RETIRADA SOCIO', 8000, 28],
  [9, 'DESPESAS DIVERSAS', 510, 'DIVERSOS', 'PARCELA EMPRESTIMO', 2300, 25],
];

export function demoDre(caminho) {
  const url = new URL(caminho, 'http://demo');
  if (url.pathname !== '/dre') throw new Error('Endereço não encontrado.');
  const de = url.searchParams.get('de');
  const ate = url.searchParams.get('ate') || de;
  const r = { de, ate, vendas: [], cmv: [], despesas: [], entradas: [], fornecedores: [] };
  const hoje = new Date().toISOString().slice(0, 10);
  for (let m = de; m <= ate; m = proximo(m)) {
    const f = fator(m);
    const liquido = r2(210000 * f);
    r.vendas.push({ mes: m, notas: Math.round(2500 * f), bruto: r2(liquido * 1.34), liquido, devolucoes: r2(2100 * f) });
    r.cmv.push({ mes: m, valor: r2(liquido * 0.585), itens: Math.round(4900 * f), ultimaCompra: 1400, custoAtual: 12, semCusto: 4 });
    DESPESAS.forEach(([tipo, tipoNome, fornecedorId, fornecedor, obs, valor, dia], i) => {
      const vencimento = `${m}-${String(dia).padStart(2, '0')}`;
      const pago = vencimento <= hoje;
      const v = r2(valor * (tipo === 7 || tipo === 12 ? f : 1));
      r.despesas.push({ id: `${fornecedorId}-${i}-${vencimento}`, tipo, tipoNome, fornecedorId, fornecedor, obs: `${obs} ${m.slice(5)}/${m.slice(0, 4)}`,
        documento: String(1000 + i), valor: v, pago: pago ? v : 0, vencimento, pagamento: pago ? vencimento : null });
    });
    r.entradas.push({ mes: m, id: 61, nome: 'Recebimento venda à vista', valor: r2(liquido * 0.46) });
    r.entradas.push({ mes: m, id: 66, nome: 'Recebimento crediário', valor: r2(liquido * 0.47) });
    r.fornecedores.push({ mes: m, valor: r2(liquido * 0.55), titulos: 310 });
  }
  return r;
}
