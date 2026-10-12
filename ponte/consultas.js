// Consultas do crediário no banco do Trier (somente leitura).
//
// O que se descobriu da estrutura (filial 3; as filiais 1 e 2 são CNPJs antigos):
//  - cadcredi: uma linha por parcela (cod_rede, cod_filial, num_nota, num_seqcadvlrfp, num_parcela).
//      em aberto  = dat_receb IS NULL
//      recebida   = dat_receb preenchida; num_seqrec agrupa as parcelas pagas juntas; num_caixa = caixa do dia
//      cancelada  = dat_cancreceb preenchida (não entra nos totais recebidos)
//      tip_venda  = 'V' venda, 'D' (a venda em cadcvend também é 'D')
//      vlr_recebido = vlr_receber + vlr_jurosrec + vlr_multa - vlr_descrec
//  - cadclien: cadastro do cliente; prc_juros = % ao dia (juros simples), prc_multa = % de multa.
//      O Trier só cobra juros depois de alguns dias de atraso (carência, ajustável no config.json).
//  - cadabcai: abertura/fechamento de cada caixa.

const SEM_ACENTO_DE = 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ';
const SEM_ACENTO_PARA = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn';
const semAcento = (s) => [...String(s)].map((c) => { const i = SEM_ACENTO_DE.indexOf(c); return i < 0 ? c : SEM_ACENTO_PARA[i]; }).join('');
const nomeSql = `upper(translate(cl.nom_cliente, '${SEM_ACENTO_DE}', '${SEM_ACENTO_PARA}'))`;

const telefone = `coalesce(nullif(trim(cl.num_celular), ''), nullif(trim(cl.num_fone), ''))`;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

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
        SELECT sum(c.vlr_receber) AS aberto, sum(c.vlr_receber) FILTER (WHERE c.dat_vencto < current_date) AS vencido, count(*) AS parcelas
          FROM cadcredi c
         WHERE c.cod_rede = cl.cod_rede AND c.cod_cliente = cl.cod_cliente AND c.cod_filial = $2 AND c.dat_receb IS NULL
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

  const { rows: parcelas } = await pool.query(`
    SELECT c.num_nota AS nota, c.num_parcela AS parcela, c.qtd_parcelas AS "totalParcelas", c.tip_venda AS tipo,
           c.dat_emissao AS emissao, c.dat_vencto AS vencimento, c.vlr_receber AS valor, (current_date - c.dat_vencto) AS dias
      FROM cadcredi c
     WHERE c.cod_rede = $1 AND c.cod_filial = $2 AND c.cod_cliente = $3 AND c.dat_receb IS NULL
     ORDER BY c.dat_vencto, c.num_nota, c.num_parcela`, [rede, filial, id]);
  for (const p of parcelas) Object.assign(p, encargos(p, cli, carencia));

  // Últimos pagamentos, para conferir com o que o cliente diz
  const { rows: pagamentos } = await pool.query(`
    SELECT c.num_seqrec AS recibo, min(c.dat_receb) AS data, min(c.hor_receb)::text AS hora, count(*) AS parcelas,
           sum(c.vlr_recebido) AS recebido, sum(coalesce(c.vlr_jurosrec, 0) + coalesce(c.vlr_multa, 0)) AS encargos
      FROM cadcredi c
     WHERE c.cod_rede = $1 AND c.cod_filial = $2 AND c.cod_cliente = $3 AND c.dat_receb IS NOT NULL AND c.dat_cancreceb IS NULL
     GROUP BY c.num_seqrec ORDER BY min(c.dat_receb) DESC, min(c.hor_receb) DESC LIMIT 6`, [rede, filial, id]);

  return { cliente: cli, parcelas, pagamentos, carencia };
}

export async function recebimentos(pool, { rede, filial }, de, ate) {
  const { rows } = await pool.query(`
    SELECT c.num_seqrec AS recibo, min(c.dat_receb) AS data, min(c.hor_receb)::text AS hora, c.num_caixa AS caixa,
           c.cod_cliente AS "clienteId", cl.nom_cliente AS cliente, count(*) AS parcelas,
           sum(c.vlr_receber) AS original, sum(coalesce(c.vlr_jurosrec, 0)) AS juros, sum(coalesce(c.vlr_multa, 0)) AS multa,
           sum(coalesce(c.vlr_descrec, 0)) AS desconto, sum(coalesce(c.vlr_recebido, 0)) AS recebido,
           bool_or(c.dat_cancreceb IS NOT NULL) AS cancelado
      FROM cadcredi c
      LEFT JOIN cadclien cl ON cl.cod_rede = c.cod_rede AND cl.cod_cliente = c.cod_cliente
     WHERE c.cod_rede = $1 AND c.cod_filial = $2 AND c.dat_receb BETWEEN $3 AND $4
     GROUP BY c.num_seqrec, c.num_caixa, c.cod_cliente, cl.nom_cliente
     ORDER BY min(c.dat_receb), min(c.hor_receb)`, [rede, filial, de, ate]);

  const numeros = [...new Set(rows.map((r) => r.caixa).filter((n) => n != null))];
  const { rows: caixas } = numeros.length ? await pool.query(`
    SELECT num_caixa AS caixa, dat_abertura AS "abertoEm", hor_abertura::text AS "abertoAs",
           dat_fechamento AS "fechadoEm", hor_fechamento::text AS "fechadoAs"
      FROM cadabcai WHERE cod_rede = $1 AND cod_filial = $2 AND num_caixa = ANY($3) ORDER BY num_caixa`, [rede, filial, numeros]) : { rows: [] };
  return { recebimentos: rows, caixas };
}

export async function atrasados(pool, { rede, filial }, diasMin = 1) {
  const { rows } = await pool.query(`
    SELECT c.cod_cliente AS id, cl.nom_cliente AS nome, ${telefone} AS telefone, cl.flg_bloqueado = 'S' AS bloqueado,
           count(*) AS parcelas, sum(c.vlr_receber) AS vencido, min(c.dat_vencto) AS "maisAntigo",
           (current_date - min(c.dat_vencto)) AS dias, cl.dat_ultreceb AS "ultimoPagamento"
      FROM cadcredi c
      LEFT JOIN cadclien cl ON cl.cod_rede = c.cod_rede AND cl.cod_cliente = c.cod_cliente
     WHERE c.cod_rede = $1 AND c.cod_filial = $2 AND c.dat_receb IS NULL AND c.dat_vencto <= current_date - $3::int
     GROUP BY c.cod_cliente, cl.nom_cliente, cl.num_celular, cl.num_fone, cl.flg_bloqueado, cl.dat_ultreceb
     ORDER BY min(c.dat_vencto)`, [rede, filial, diasMin]);
  return rows;
}
