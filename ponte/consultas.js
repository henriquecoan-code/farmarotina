// Consultas do crediário no banco do Trier (somente leitura).
//
// O que se descobriu da estrutura (filial 3; as filiais 1 e 2 são CNPJs antigos):
//  - cadcredi: uma linha por parcela (cod_rede, cod_filial, num_nota, num_seqcadvlrfp, num_parcela).
//      em aberto  = dat_receb IS NULL
//      recebida   = dat_receb preenchida; num_seqrec agrupa o que foi pago junto (o "recebimento"); num_caixa = caixa do dia
//      cancelada  = dat_cancreceb preenchida (não entra nos totais recebidos)
//      tip_venda  = 'V' venda, 'D' (a venda em cadcvend também é 'D')
//      vlr_recebido = vlr_receber + vlr_jurosrec + vlr_multa - vlr_descrec
//  - cadslddv: SALDO DEVEDOR. Quando o cliente paga só uma parte, o Trier baixa as parcelas inteiras e grava aqui o que
//      faltou (num_seqrecorig = recebimento que gerou; dat_refer = data; dat_vencto = novo vencimento).
//      Em aberto = dat_receb IS NULL e não cancelado. Quando é pago, recebe num_seqrec/num_caixareceb como uma parcela
//      e cobra juros pela mesma regra. Por isso, o valor pago num recebimento =
//      parcelas baixadas + saldos pagos - saldo novo gerado.
//  - cadclien: cadastro do cliente; prc_juros = % ao dia (juros simples), prc_multa = % de multa.
//      O Trier só cobra juros depois de alguns dias de atraso (carência, ajustável no config.json).
//  - cadabcai: abertura/fechamento de cada caixa.

const SEM_ACENTO_DE = 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ';
const SEM_ACENTO_PARA = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn';
const semAcento = (s) => [...String(s)].map((c) => { const i = SEM_ACENTO_DE.indexOf(c); return i < 0 ? c : SEM_ACENTO_PARA[i]; }).join('');
const nomeSql = `upper(translate(cl.nom_cliente, '${SEM_ACENTO_DE}', '${SEM_ACENTO_PARA}'))`;

const telefone = `coalesce(nullif(trim(cl.num_celular), ''), nullif(trim(cl.num_fone), ''))`;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Tudo o que está em aberto: parcelas + saldos devedores (o Postgres aplica os filtros de fora em cada parte)
const ABERTOS = `(
  SELECT c.cod_rede, c.cod_filial, c.cod_cliente, false AS saldo, c.num_nota AS nota, c.num_parcela AS parcela,
         c.qtd_parcelas AS total_parcelas, c.tip_venda AS tipo, c.dat_emissao AS emissao, c.dat_vencto AS vencimento,
         c.vlr_receber AS valor, NULL::int AS recibo_origem
    FROM cadcredi c WHERE c.dat_receb IS NULL
  UNION ALL
  SELECT s.cod_rede, s.cod_filial, s.cod_cliente, true, NULL, NULL, NULL, NULL, s.dat_refer, s.dat_vencto,
         s.vlr_receber, s.num_seqrecorig
    FROM cadslddv s WHERE s.dat_receb IS NULL AND s.dat_cancreceb IS NULL)`;

// Tudo o que foi baixado (parcelas e saldos pagos), uma linha por item, para agrupar por recebimento
const BAIXAS = (filtroC, filtroS) => `(
  SELECT c.cod_rede, c.cod_filial, c.num_seqrec AS recibo, c.dat_receb AS data, c.hor_receb AS hora, c.num_caixa AS caixa,
         c.cod_cliente, false AS saldo, c.vlr_receber AS valor, coalesce(c.vlr_jurosrec, 0) AS juros, coalesce(c.vlr_multa, 0) AS multa,
         coalesce(c.vlr_descrec, 0) AS desconto, coalesce(c.vlr_recebido, 0) AS baixado, c.dat_cancreceb IS NOT NULL AS cancelado
    FROM cadcredi c WHERE c.dat_receb IS NOT NULL AND ${filtroC}
  UNION ALL
  SELECT s.cod_rede, s.cod_filial, s.num_seqrec, s.dat_receb, s.hor_receb, s.num_caixareceb, s.cod_cliente, true, s.vlr_receber,
         coalesce(s.vlr_juros, 0), coalesce(s.vlr_multa, 0), coalesce(s.vlr_descto, 0), coalesce(s.vlr_recebido, 0),
         s.dat_cancreceb IS NOT NULL
    FROM cadslddv s WHERE s.dat_receb IS NOT NULL AND ${filtroS})`;

// Agrupa as baixas por recebimento e desconta o saldo novo que ficou: "recebido" = o que o cliente pagou de fato
const POR_RECIBO = (baixas) => `
  SELECT m.recibo, min(m.data) AS data, min(m.hora)::text AS hora, max(m.caixa) AS caixa,
         m.cod_cliente AS "clienteId", cl.nom_cliente AS cliente,
         count(*) FILTER (WHERE NOT m.saldo) AS parcelas, count(*) FILTER (WHERE m.saldo) AS "saldosPagos",
         sum(m.valor) AS original, sum(m.juros) AS juros, sum(m.multa) AS multa, sum(m.desconto) AS desconto,
         sum(m.baixado) AS baixado, g.gerado AS "saldoGerado", sum(m.baixado) - g.gerado AS recebido,
         bool_or(m.cancelado) AS cancelado
    FROM ${baixas} m
    LEFT JOIN cadclien cl ON cl.cod_rede = m.cod_rede AND cl.cod_cliente = m.cod_cliente
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(s.vlr_receber), 0) AS gerado FROM cadslddv s
       WHERE s.cod_rede = m.cod_rede AND s.cod_filial = m.cod_filial AND s.num_seqrecorig = m.recibo AND s.dat_cancreceb IS NULL
    ) g ON true
   GROUP BY m.recibo, m.cod_cliente, cl.nom_cliente, g.gerado`;

// Juros e multa estimados para hoje, do jeito que o Trier calcula
export function encargos(p, cliente, carencia) {
  const dias = p.dias;
  if (dias <= carencia) return { juros: 0, multa: 0 };
  return {
    juros: r2(p.valor * (cliente.prcJuros || 0) / 100 * dias),
    multa: r2(p.valor * (cliente.prcMulta || 0) / 100),
  };
}

export async function buscarClientes(pool, { rede, filial }, busca) {
  const texto = semAcento(busca).trim().toUpperCase();
  if (texto.length < 2) return [];
  const digitos = texto.replace(/\D/g, '');
  const codigo = /^\d{1,9}$/.test(texto) ? Number(texto) : -1;
  const nome = '%' + texto.split(/\s+/).join('%') + '%';
  const { rows } = await pool.query(`
    SELECT cl.cod_cliente AS id, cl.nom_cliente AS nome, cl.num_cnpj AS cpf, ${telefone} AS telefone,
           cl.flg_bloqueado = 'S' AS bloqueado, coalesce(cl.flg_ativo, 'S') <> 'N' AS ativo,
           coalesce(s.aberto, 0) AS aberto, coalesce(s.vencido, 0) AS vencido, coalesce(s.parcelas, 0) AS parcelas
      FROM cadclien cl
      LEFT JOIN LATERAL (
        SELECT sum(a.valor) AS aberto, sum(a.valor) FILTER (WHERE a.vencimento < current_date) AS vencido, count(*) AS parcelas
          FROM ${ABERTOS} a
         WHERE a.cod_rede = cl.cod_rede AND a.cod_cliente = cl.cod_cliente AND a.cod_filial = $2
      ) s ON true
     WHERE cl.cod_rede = $1
       AND (${nomeSql} LIKE $3 OR cl.cod_cliente = $4 OR ($5 <> '' AND length($5) >= 6 AND regexp_replace(coalesce(cl.num_cnpj, ''), '\\D', '', 'g') LIKE $5 || '%'))
     ORDER BY (coalesce(s.parcelas, 0) = 0), cl.nom_cliente
     LIMIT 30`, [rede, filial, nome, codigo, digitos]);
  return rows;
}

export async function cliente(pool, { rede, filial, carencia }, id) {
  const { rows: [cli] } = await pool.query(`
    SELECT cl.cod_cliente AS id, cl.nom_cliente AS nome, cl.num_cnpj AS cpf, ${telefone} AS telefone,
           cl.flg_bloqueado = 'S' AS bloqueado, coalesce(cl.flg_ativo, 'S') <> 'N' AS ativo, cl.vlr_limite AS limite,
           cl.prc_juros AS "prcJuros", cl.prc_multa AS "prcMulta", cl.dia_vencto AS "diaVencto",
           cl.dat_ultreceb AS "ultimoPagamento", cl.nom_observacao1 AS obs1, cl.nom_observacao2 AS obs2
      FROM cadclien cl WHERE cl.cod_rede = $1 AND cl.cod_cliente = $2`, [rede, id]);
  if (!cli) return null;

  // Parcelas e saldos devedores em aberto (saldo = true: sobra de um pagamento parcial)
  const { rows: parcelas } = await pool.query(`
    SELECT a.saldo, a.nota, a.parcela, a.total_parcelas AS "totalParcelas", a.tipo, a.emissao, a.vencimento, a.valor,
           a.recibo_origem AS "reciboOrigem", (current_date - a.vencimento) AS dias
      FROM ${ABERTOS} a
     WHERE a.cod_rede = $1 AND a.cod_filial = $2 AND a.cod_cliente = $3
     ORDER BY a.vencimento, a.saldo DESC, a.nota, a.parcela`, [rede, filial, id]);
  for (const p of parcelas) Object.assign(p, encargos(p, cli, carencia));

  // Últimos pagamentos, para conferir com o que o cliente diz
  const { rows: pagamentos } = await pool.query(`
    ${POR_RECIBO(BAIXAS('c.cod_rede = $1 AND c.cod_filial = $2 AND c.cod_cliente = $3',
      's.cod_rede = $1 AND s.cod_filial = $2 AND s.cod_cliente = $3'))}
    HAVING NOT bool_or(m.cancelado)
    ORDER BY min(m.data) DESC, min(m.hora) DESC LIMIT 6`, [rede, filial, id]);

  return { cliente: cli, parcelas, pagamentos, carencia };
}

export async function recebimentos(pool, { rede, filial }, de, ate) {
  const { rows } = await pool.query(`
    ${POR_RECIBO(BAIXAS('c.cod_rede = $1 AND c.cod_filial = $2 AND c.dat_receb BETWEEN $3 AND $4',
      's.cod_rede = $1 AND s.cod_filial = $2 AND s.dat_receb BETWEEN $3 AND $4'))}
    ORDER BY min(m.data), min(m.hora)`, [rede, filial, de, ate]);

  const numeros = [...new Set(rows.map((r) => r.caixa).filter((n) => n != null))];
  const { rows: caixas } = numeros.length ? await pool.query(`
    SELECT num_caixa AS caixa, dat_abertura AS "abertoEm", hor_abertura::text AS "abertoAs",
           dat_fechamento AS "fechadoEm", hor_fechamento::text AS "fechadoAs"
      FROM cadabcai WHERE cod_rede = $1 AND cod_filial = $2 AND num_caixa = ANY($3) ORDER BY num_caixa`, [rede, filial, numeros]) : { rows: [] };
  return { recebimentos: rows, caixas };
}

export async function atrasados(pool, { rede, filial }, diasMin = 1) {
  const { rows } = await pool.query(`
    SELECT a.cod_cliente AS id, cl.nom_cliente AS nome, ${telefone} AS telefone, cl.flg_bloqueado = 'S' AS bloqueado,
           count(*) AS parcelas, count(*) FILTER (WHERE a.saldo) AS saldos, sum(a.valor) AS vencido, min(a.vencimento) AS "maisAntigo",
           (current_date - min(a.vencimento)) AS dias, cl.dat_ultreceb AS "ultimoPagamento"
      FROM ${ABERTOS} a
      LEFT JOIN cadclien cl ON cl.cod_rede = a.cod_rede AND cl.cod_cliente = a.cod_cliente
     WHERE a.cod_rede = $1 AND a.cod_filial = $2 AND a.vencimento <= current_date - $3::int
     GROUP BY a.cod_cliente, cl.nom_cliente, cl.num_celular, cl.num_fone, cl.flg_bloqueado, cl.dat_ultreceb
     ORDER BY min(a.vencimento)`, [rede, filial, diasMin]);
  return rows;
}

// ---------- Produtos ----------
//  - cadprodu: cadastro (cod_reduzido = código interno). flg_ativo 'A'/'I'. cod_dcb, cod_concentracao,
//      tip_apresenta (forma) e unidade_apresentacao (quantidade, ex.: 30).
//  - cadcddcb / produto_concentracao / cadlabor: nomes do DCB, da concentração e do laboratório.
//  - cadestoq: estoque, mínimo, demanda e curva da filial; vlr_custoaq = custo real de aquisição (com os descontos da
//      compra). O vlr_custo do cadprodu é o custo de cadastro (preço de fábrica), bem maior nos genéricos.
//  - cadcdbar: códigos de barras.
//  - cadicomp + cadforne: compras (notas de entrada). cadivend: itens vendidos (flg_excluido 'S' = venda excluída);
//      o cliente vem de cadcvend.cod_cliente (vazio = venda sem cliente identificado).

// Nomes deduzidos dos produtos de cada código no banco
export const FORMAS = { 0: 'Outros', 1: 'Comprimido/cápsula', 2: 'Injetável', 3: 'Gotas', 4: 'Líquido', 5: 'Gel/pomada/creme' };

const nomeProdSql = `upper(translate(p.nom_produto, '${SEM_ACENTO_DE}', '${SEM_ACENTO_PARA}'))`;
// Preço: vlr_venda é o preço cheio (normalmente = PMC) e prc_desconto o desconto padrão do produto
// (as tabelas de desconto caddescp/caddesca estão vazias). Preço final = venda com o desconto; a margem é sobre ele.
const custoSql = `coalesce(nullif(e.vlr_custoaq, 0), p.vlr_custo)`;
const pmcSql = `greatest(coalesce(p.vlr_pmc, 0), p.vlr_venda)`;
const precoSql = `round(p.vlr_venda * (1 - coalesce(p.prc_desconto, 0) / 100), 2)`;
const descontoSql = `CASE WHEN ${pmcSql} > 0 THEN round((${pmcSql} - ${precoSql}) / ${pmcSql} * 100, 1) END`;
const margemSql = `CASE WHEN ${precoSql} > 0 THEN round((${precoSql} - ${custoSql}) / ${precoSql} * 100, 1) END`;
const camposLista = `p.cod_reduzido AS id, p.nom_produto AS nome, p.flg_ativo = 'A' AS ativo, l.nom_laborat AS laboratorio,
  coalesce(e.qtd_estoque, 0) AS estoque, ${pmcSql} AS pmc, ${precoSql} AS venda, ${descontoSql} AS desconto, ${custoSql} AS custo, ${margemSql} AS margem, e.tip_curva AS curva,
  c.nom_concentracao AS concentracao, p.tip_apresenta AS forma, p.unidade_apresentacao AS quantidade`;
const juncoes = `
  LEFT JOIN cadlabor l ON l.cod_rede = p.cod_rede AND l.cod_laborat = p.cod_laborat
  LEFT JOIN cadestoq e ON e.cod_rede = p.cod_rede AND e.cod_filial = $2 AND e.cod_reduzido = p.cod_reduzido
  LEFT JOIN produto_concentracao c ON c.cod_rede = p.cod_rede AND c.cod_concentracao = p.cod_concentracao`;

export async function buscarProdutos(pool, { rede, filial }, busca, inativos = false) {
  const texto = semAcento(busca).trim().toUpperCase();
  if (texto.length < 2) return [];
  const digitos = /^\d+$/.test(texto) ? texto : '';
  const nome = '%' + texto.split(/\s+/).join('%') + '%';
  const { rows } = await pool.query(`
    SELECT ${camposLista}
      FROM cadprodu p ${juncoes}
     WHERE p.cod_rede = $1 AND ($5 OR p.flg_ativo = 'A')
       AND (${nomeProdSql} LIKE $3
            OR p.cod_produto = $4 OR p.cod_reduzido = $6
            OR EXISTS (SELECT 1 FROM cadcdbar b WHERE b.cod_rede = p.cod_rede AND b.cod_reduzido = p.cod_reduzido
                         AND (b.cod_barra = $7 OR b.gtin = $4)))
     ORDER BY (p.flg_ativo = 'A') DESC, (coalesce(e.qtd_estoque, 0) > 0) DESC, p.nom_produto
     LIMIT 40`, [rede, filial, nome, digitos || '-', inativos, digitos && digitos.length <= 9 ? Number(digitos) : -1,
    digitos && digitos.length <= 14 ? digitos : null]);
  return rows;
}

export async function produto(pool, { rede, filial }, id) {
  const { rows: [prod] } = await pool.query(`
    SELECT ${camposLista}, p.cod_produto AS codigo, p.cod_dcb AS dcb, d.nom_dcb AS "nomeDcb", p.vlr_custo AS "custoCadastro", p.prc_descmax AS "descontoMaximo",
           p.dat_alterpreco AS "alteracaoPreco", nullif(trim(p.nom_descapresentacao), '') AS "descApresentacao",
           e.est_minimo AS minimo, e.qtd_demanda AS demanda, e.dat_ultent AS "ultimaEntrada", e.qtd_ultent AS "qtdUltimaEntrada",
           e.dat_ultsai AS "ultimaSaida", nullif(trim(p.nom_local), '') AS local,
           (SELECT string_agg(coalesce(nullif(b.gtin, ''), b.cod_barra::text), ', ') FROM cadcdbar b WHERE b.cod_rede = p.cod_rede AND b.cod_reduzido = p.cod_reduzido) AS ean
      FROM cadprodu p ${juncoes}
      LEFT JOIN cadcddcb d ON d.cod_rede = p.cod_rede AND d.cod_dcb = p.cod_dcb
     WHERE p.cod_rede = $1 AND p.cod_reduzido = $3`, [rede, filial, id]);
  if (!prod) return null;
  const { rows: similares } = prod.dcb ? await pool.query(`
    SELECT ${camposLista}
      FROM cadprodu p ${juncoes}
     WHERE p.cod_rede = $1 AND p.cod_dcb = $3 AND (p.flg_ativo = 'A' OR p.cod_reduzido = $4)
     ORDER BY c.nom_concentracao NULLS LAST, p.unidade_apresentacao NULLS LAST, p.vlr_venda`, [rede, filial, prod.dcb, id]) : { rows: [] };
  return { produto: prod, similares, formas: FORMAS };
}

// Compras e vendas do produto nos últimos `dias` (padrão 90): totais do período e as listas (até 200 linhas cada)
export async function produtoInfo(pool, { rede, filial }, id, dias = 90) {
  const desde = `current_date - $4::int`;
  const { rows: compras } = await pool.query(`
    SELECT i.dat_entrada AS data, f.nom_fornec AS fornecedor, coalesce(i.num_nf, i.num_nota) AS nf,
           i.qtd_produto AS quantidade, i.qtd_fator AS fator, i.vlr_unitario AS unitario, i.prc_descto AS desconto, i.vlr_custo AS custo, i.vlr_total AS total
      FROM cadicomp i
      LEFT JOIN cadforne f ON f.cod_rede = i.cod_rede AND f.cod_fornec = i.cod_fornec
     WHERE i.cod_rede = $1 AND i.cod_filial = $2 AND i.cod_reduzido = $3 AND i.dat_entrada >= ${desde}
     ORDER BY i.dat_entrada DESC, i.hor_entrada DESC NULLS LAST LIMIT 200`, [rede, filial, id, dias]);
  const { rows: vendas } = await pool.query(`
    SELECT v.dat_emissao AS data, v.hor_emissao::text AS hora, v.qtd_produto AS quantidade, v.vlr_unitario AS unitario,
           v.prc_descto AS desconto, v.vlr_total AS total, cv.cod_cliente AS "clienteId", cl.nom_cliente AS cliente
      FROM cadivend v
      LEFT JOIN cadcvend cv ON cv.cod_rede = v.cod_rede AND cv.cod_filial = v.cod_filial AND cv.num_nota = v.num_nota
      LEFT JOIN cadclien cl ON cl.cod_rede = cv.cod_rede AND cl.cod_cliente = cv.cod_cliente
     WHERE v.cod_rede = $1 AND v.cod_filial = $2 AND v.cod_reduzido = $3 AND coalesce(v.flg_excluido, 'N') <> 'S'
       AND v.dat_emissao >= ${desde}
     ORDER BY v.dat_emissao DESC, v.hor_emissao DESC LIMIT 200`, [rede, filial, id, dias]);
  // Totais calculados no banco (valem mesmo se a lista passar de 200 linhas)
  const { rows: [totais] } = await pool.query(`
    SELECT (SELECT coalesce(sum(qtd_produto), 0) FROM cadicomp WHERE cod_rede = $1 AND cod_filial = $2 AND cod_reduzido = $3 AND dat_entrada >= ${desde}) AS "qtdComprada",
           (SELECT coalesce(sum(vlr_total), 0) FROM cadicomp WHERE cod_rede = $1 AND cod_filial = $2 AND cod_reduzido = $3 AND dat_entrada >= ${desde}) AS "valorComprado",
           (SELECT count(*) FROM cadicomp WHERE cod_rede = $1 AND cod_filial = $2 AND cod_reduzido = $3 AND dat_entrada >= ${desde}) AS compras,
           (SELECT coalesce(sum(qtd_produto), 0) FROM cadivend WHERE cod_rede = $1 AND cod_filial = $2 AND cod_reduzido = $3 AND coalesce(flg_excluido, 'N') <> 'S' AND dat_emissao >= ${desde}) AS "qtdVendida",
           (SELECT coalesce(sum(vlr_total), 0) FROM cadivend WHERE cod_rede = $1 AND cod_filial = $2 AND cod_reduzido = $3 AND coalesce(flg_excluido, 'N') <> 'S' AND dat_emissao >= ${desde}) AS "valorVendido",
           (SELECT count(*) FROM cadivend WHERE cod_rede = $1 AND cod_filial = $2 AND cod_reduzido = $3 AND coalesce(flg_excluido, 'N') <> 'S' AND dat_emissao >= ${desde}) AS vendas`,
  [rede, filial, id, dias]);
  return { dias, totais, compras, vendas };
}
