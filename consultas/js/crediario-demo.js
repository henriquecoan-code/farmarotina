// Dados fictícios do crediário para o modo demonstração (sem ponte nem banco)
import { diasAtras } from '../../js/util.js';

const CARENCIA = 10;
const dia = (n) => diasAtras(n); // n > 0 = passado, n < 0 = futuro

const CLIENTES = [
  { id: 1201, nome: 'MARIA APARECIDA DA SILVA', cpf: '123.456.789-00', telefone: '(11) 98888-1111', prcJuros: 0.16, prcMulta: 0, limite: 500,
    parcelas: [[35, 89.9, 4021, 2, 2], [5, 64.5, 4188, 1, 1], [-25, 120.4, 4302, 1, 2], [-55, 120.4, 4302, 2, 2]] },
  { id: 877, nome: 'JOSE CARLOS PEREIRA', cpf: '987.654.321-00', telefone: '(11) 97777-2222', prcJuros: 0.16, prcMulta: 0, limite: 800,
    parcelas: [[95, 210, 3650, 1, 1], [64, 45.8, 3810, 1, 1]] },
  { id: 1530, nome: 'ANA PAULA SOUZA', cpf: '111.222.333-44', telefone: '(11) 96666-3333', prcJuros: 0.1, prcMulta: 0, limite: 300,
    parcelas: [[-12, 75.3, 4410, 1, 1]] },
  { id: 342, nome: 'ANTONIO MARCOS OLIVEIRA', cpf: '555.666.777-88', telefone: '', prcJuros: 0.16, prcMulta: 0, limite: 400, bloqueado: true,
    parcelas: [[210, 152.75, 2911, 1, 1], [180, 98.4, 3001, 1, 1]] },
  { id: 990, nome: 'MARIA JOSE FERREIRA', cpf: '222.333.444-55', telefone: '(11) 95555-4444', prcJuros: 0.16, prcMulta: 0, limite: 600, parcelas: [] },
];

function parcelasDe(c) {
  return c.parcelas.map(([atraso, valor, nota, parcela, total]) => {
    const dias = atraso;
    const juros = dias > CARENCIA ? Math.round(valor * c.prcJuros / 100 * dias * 100) / 100 : 0;
    return { nota, parcela, totalParcelas: total, tipo: 'V', emissao: dia(atraso + 30 * parcela), vencimento: dia(atraso), valor, dias, juros, multa: 0 };
  }).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

function resumo(c) {
  const ps = parcelasDe(c);
  const soma = (l) => Math.round(l.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  return { id: c.id, nome: c.nome, cpf: c.cpf, telefone: c.telefone, bloqueado: !!c.bloqueado, ativo: true,
    aberto: soma(ps), vencido: soma(ps.filter((p) => p.dias > 0)), parcelas: ps.length };
}

const RECEBIMENTOS = [
  ['08:12', 1530, 1, 75.3, 0, 75.3], ['09:40', 877, 2, 180.5, 6.2, 186.7], ['11:05', 990, 1, 54.9, 0, 54.9],
  ['14:22', 1201, 3, 210.0, 12.48, 222.48], ['16:50', 342, 1, 40, 0, 40, true], ['18:31', 1530, 1, 33.1, 0, 33.1],
];

export function demoCrediario(caminho) {
  const url = new URL(caminho, 'http://demo');
  const [p0, p1] = url.pathname.split('/').filter(Boolean);
  if (p0 === 'saude') return { ok: true, versao: 'demo', filial: 3, banco: true };
  if (p0 === 'clientes' && !p1) {
    const termo = (url.searchParams.get('busca') || '').toUpperCase();
    return CLIENTES.filter((c) => c.nome.includes(termo) || String(c.id) === termo || c.cpf.replace(/\D/g, '').startsWith(termo.replace(/\D/g, '') || 'x'))
      .map(resumo).sort((a, b) => (b.parcelas > 0) - (a.parcelas > 0) || a.nome.localeCompare(b.nome));
  }
  if (p0 === 'clientes') {
    const c = CLIENTES.find((x) => x.id === Number(p1));
    if (!c) throw new Error('Cliente não encontrado.');
    return {
      cliente: { id: c.id, nome: c.nome, cpf: c.cpf, telefone: c.telefone, bloqueado: !!c.bloqueado, ativo: true, limite: c.limite,
        prcJuros: c.prcJuros, prcMulta: c.prcMulta, ultimoPagamento: dia(20), obs1: c.bloqueado ? 'SÓ À VISTA ATÉ ACERTAR' : '' },
      parcelas: parcelasDe(c),
      pagamentos: [{ recibo: 85990, data: dia(20), hora: '10:15:00', parcelas: 2, recebido: 130.4, encargos: 0 },
        { recibo: 85512, data: dia(52), hora: '17:02:00', parcelas: 1, recebido: 96.1, encargos: 3.4 }],
      carencia: CARENCIA,
    };
  }
  if (p0 === 'recebimentos') {
    const data = url.searchParams.get('de') || dia(0);
    const nomes = new Map(CLIENTES.map((c) => [c.id, c.nome]));
    return {
      recebimentos: RECEBIMENTOS.map(([hora, cli, parcelas, original, juros, recebido, cancelado], i) => ({
        recibo: 86000 + i, data, hora: `${hora}:00`, caixa: 3640, clienteId: cli, cliente: nomes.get(cli), parcelas,
        original, juros, multa: 0, desconto: 0, recebido, cancelado: !!cancelado })),
      caixas: [{ caixa: 3640, abertoEm: diasAtras(1), abertoAs: '20:58:10', fechadoEm: null, fechadoAs: null }],
    };
  }
  if (p0 === 'atrasados') {
    const min = Number(url.searchParams.get('dias')) || 1;
    return CLIENTES.map((c) => {
      const v = parcelasDe(c).filter((p) => p.dias >= min);
      if (!v.length) return null;
      return { id: c.id, nome: c.nome, telefone: c.telefone, bloqueado: !!c.bloqueado, parcelas: v.length,
        vencido: Math.round(v.reduce((s, p) => s + p.valor, 0) * 100) / 100, maisAntigo: v[0].vencimento, dias: v[0].dias, ultimoPagamento: dia(20) };
    }).filter(Boolean).sort((a, b) => b.dias - a.dias);
  }
  throw new Error('Endereço não encontrado.');
}
