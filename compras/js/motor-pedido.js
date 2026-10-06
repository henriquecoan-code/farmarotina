// Motor do pedido: mesma lógica do motor.py do sistema antigo, agora no navegador.
//
// Regras salvas por EAN (prioridade sobre a marca):
//   incluir_sempre, excluir_sempre, quantidade_fixa, observacao
// Regras por marca/laboratório: hoje só "excluir_sempre" (todos os produtos da marca)
// Regras gerais (config): mínimo por curva A/B/C e a partir de qual Fat o produto é "encartelado".
import { numero } from './comum.js';

export const CONFIG_PADRAO = { fator_encartelado: 20, curva_minimo: { A: 2, B: 2, C: 1 } };

export function mesclarConfig(salva) {
  return {
    fator_encartelado: salva?.fator_encartelado ?? CONFIG_PADRAO.fator_encartelado,
    curva_minimo: { ...CONFIG_PADRAO.curva_minimo, ...(salva?.curva_minimo || {}) },
  };
}

export const normMarca = (m) => String(m ?? '').trim().toUpperCase();
// Firestore não aceita "/" no id do documento
export const idMarca = (m) => normMarca(m).replace(/\//g, '∕') || '(SEM MARCA)';

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

// EAN: aceita célula de texto ou numérica (sem casas decimais)
function lerEan(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : '';
  return texto(v).replace(/\.0+$/, '');
}

// ---------- leitura do relatório "Sugestão de Compras" do Trier ----------
// Colunas (contando a partir de A = 0): 3 EAN, 6 produto, 8 marca, 9 grupo/curva, 10 saldo,
// 12 estoque mínimo, 13 demanda, 15 qtd. comprar (sistema), 16 Fat
export function lerRelatorio(linhas) {
  const dados = [];
  for (const l of linhas) {
    const ean = lerEan(l?.[3]);
    if (!/^\d{8,14}$/.test(ean)) continue;
    dados.push({
      ean,
      produto: texto(l[6]),
      marca: texto(l[8]),
      curva: texto(l[9]).split('/').at(-1).trim(),
      saldo: numero(l[10]),
      estoque_minimo: numero(l[12]),
      demanda: numero(l[13]),
      qtd_comp_sistema: numero(l[15]),
      fat: numero(l[16]),
    });
  }
  if (!dados.length) {
    throw new Error('Não encontrei nenhuma linha de produto válida. O layout do relatório pode ter mudado; confira o arquivo.');
  }
  return dados;
}

// ---------- sugestão automática (regra geral, antes das exceções) ----------
export function calcularSugestao(row, config) {
  const minimoCurva = config.curva_minimo[row.curva];
  if (minimoCurva === undefined) return [null, `Curva '${row.curva || '(vazia)'}' - descontinuado, não compra`];

  if (row.fat >= config.fator_encartelado) {
    if (row.saldo <= row.estoque_minimo) return [1, `Encartelado (Fat=${Math.trunc(row.fat)}) - bateu o mínimo, pede 1 caixa fechada`];
    return [null, `Encartelado (Fat=${Math.trunc(row.fat)}) - ainda acima do mínimo (saldo ${Math.trunc(row.saldo)} > mínimo ${Math.trunc(row.estoque_minimo)})`];
  }

  const alvo = Math.max(minimoCurva, row.qtd_comp_sistema);
  const necessidade = alvo - row.saldo;
  if (necessidade <= 0) return [null, `Estoque já no nível ideal (saldo ${Math.trunc(row.saldo)} >= alvo ${Math.trunc(alvo)})`];

  const fat = row.fat > 0 ? row.fat : 1;
  const quantidade = Math.trunc(Math.ceil(necessidade / fat) * fat);
  if (quantidade <= 0) return [null, 'Quantidade calculada zerou após arredondamento'];
  return [quantidade, `Precisa de ${Math.trunc(necessidade)}, arredondado p/ múltiplo do Fat (${Math.trunc(fat)})`];
}

// Lista final: sugestão automática + regra da marca (genérica) + regra do EAN (específica, tem a última palavra)
export function montarLista(dados, config, regras, regrasMarca) {
  return dados.map((row) => {
    const [sugerida, motivo] = calcularSugestao(row, config);
    const regraMarca = regrasMarca.get(normMarca(row.marca));
    const regra = regras.get(row.ean) || {};

    const valida = sugerida !== null;
    let incluir = valida;
    let quantidade = valida ? sugerida : 0;
    let observacao = '';
    let origem = 'automatico';

    if (regraMarca?.acao === 'excluir_sempre') {
      incluir = false;
      quantidade = 0;
      origem = `regra da marca '${row.marca}': sempre excluir`;
      observacao = regraMarca.observacao || '';
    }

    if (regra.excluir_sempre) {
      incluir = false;
      quantidade = 0;
      origem = 'regra: sempre excluir';
    } else if (regra.quantidade_fixa !== null && regra.quantidade_fixa !== undefined) {
      incluir = true;
      quantidade = Math.trunc(regra.quantidade_fixa);
      origem = 'regra: quantidade fixa';
    } else if (regra.incluir_sempre) {
      incluir = true;
      quantidade = quantidade > 0 ? quantidade : 1;
      origem = 'regra: sempre incluir';
    }
    if (regra.observacao) observacao = regra.observacao;

    return {
      ean: row.ean, produto: row.produto, marca: row.marca, curva: row.curva,
      saldo: Math.trunc(row.saldo), estoque_minimo: Math.trunc(row.estoque_minimo),
      demanda: Math.trunc(row.demanda), fat: Math.trunc(row.fat),
      quantidade_sugerida: valida ? sugerida : 0, quantidade_final: quantidade,
      motivo_sugestao: motivo, origem_decisao: origem, incluir, observacao,
    };
  });
}
