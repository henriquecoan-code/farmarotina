// Mostra a ESTRUTURA do banco do Trier para achar as tabelas do crediário.
// Não imprime dados de clientes: só nomes de tabelas/colunas, quantidade de linhas,
// valores distintos de colunas de código (situação, tipo, forma...) e o intervalo das datas.
//
//   node explorar.js                 -> tabelas e colunas com nomes ligados a crediário
//   node explorar.js tudo            -> todas as tabelas (só nomes e quantidade de linhas)
//   node explorar.js tabela <nome>   -> colunas da tabela + códigos e intervalo de datas
import { criarPool } from './banco.js';

const PALAVRAS = /receb|credi|parcel|conta|titul|cliente|baixa|duplic|carne|convenio|fiado|debit|pagament/i;
const COLUNA_CODIGO = /situa|status|tipo|forma|especie|modal|flag|baixad|aberto|quitad|cancel/i;

const pool = criarPool();
const [modo, nome] = process.argv.slice(2);

async function tabelas() {
  const { rows } = await pool.query(`
    SELECT n.nspname AS esquema, c.relname AS tabela, c.reltuples::bigint AS linhas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r','v','m','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
     ORDER BY 1, 2`);
  return rows;
}

async function colunas(esquema, tabela) {
  // pg_attribute (e não information_schema, que esconde colunas sem permissão)
  const { rows } = await pool.query(`
    SELECT a.attname AS coluna, format_type(a.atttypid, a.atttypmod) AS tipo
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [esquema, tabela]);
  return rows;
}

const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';

try {
  const todas = await tabelas();
  if (modo === 'tudo') {
    for (const t of todas) console.log(`${t.esquema}.${t.tabela}  (~${t.linhas} linhas)`);
  } else if (modo === 'tabela') {
    const [esq, tab] = nome.includes('.') ? nome.split('.') : [todas.find((t) => t.tabela === nome)?.esquema || 'public', nome];
    const cols = await colunas(esq, tab);
    const alvo = `${ident(esq)}.${ident(tab)}`;
    const { rows: [{ n }] } = await pool.query(`SELECT count(*)::bigint AS n FROM ${alvo}`);
    console.log(`${esq}.${tab}: ${n} linhas\n`);
    for (const c of cols) {
      let extra = '';
      if (/date|timestamp/.test(c.tipo)) {
        const { rows: [r] } = await pool.query(`SELECT min(${ident(c.coluna)})::text AS a, max(${ident(c.coluna)})::text AS b FROM ${alvo}`);
        extra = `datas de ${r.a} a ${r.b}`;
      } else if (COLUNA_CODIGO.test(c.coluna) && !/text/.test(c.tipo)) {
        const { rows } = await pool.query(
          `SELECT ${ident(c.coluna)}::text AS v, count(*)::bigint AS n FROM ${alvo} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
        extra = 'códigos: ' + rows.map((r) => `${r.v ?? 'NULL'}(${r.n})`).join(', ');
      }
      console.log(`  ${c.coluna.padEnd(32)} ${c.tipo.padEnd(28)} ${extra}`);
    }
  } else {
    const achadas = [];
    for (const t of todas) {
      const cols = await colunas(t.esquema, t.tabela);
      if (PALAVRAS.test(t.tabela) || cols.some((c) => PALAVRAS.test(c.coluna))) achadas.push({ ...t, cols });
    }
    for (const t of achadas.filter((t) => PALAVRAS.test(t.tabela) || t.linhas > 0)) {
      console.log(`\n${t.esquema}.${t.tabela}  (~${t.linhas} linhas)`);
      console.log('  ' + t.cols.map((c) => c.coluna).join(', '));
    }
    console.log(`\n${achadas.length} tabelas relacionadas de ${todas.length}.`);
  }
} catch (e) {
  console.error('Erro:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
