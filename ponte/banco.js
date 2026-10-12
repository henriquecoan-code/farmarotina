// Conexão somente leitura com o Postgres do Trier.
// A configuração (com a senha) fica FORA do repositório: C:\FarmaRotinaPonte\config.json
// ou no caminho indicado na variável de ambiente PONTE_CONFIG.
import { readFileSync } from 'node:fs';
import pg from 'pg';

export const CAMINHO_CONFIG = process.env.PONTE_CONFIG || 'C:\\FarmaRotinaPonte\\config.json';

// Datas como texto 'AAAA-MM-DD' (sem fuso) e números como número
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export function lerConfig() {
  try {
    return JSON.parse(readFileSync(CAMINHO_CONFIG, 'utf8'));
  } catch (e) {
    console.error(`Não consegui ler ${CAMINHO_CONFIG}. Copie ponte/config.exemplo.json para lá e preencha.\n${e.message}`);
    process.exit(1);
  }
}

export function criarPool(cfg = lerConfig()) {
  const pool = new pg.Pool({
    host: cfg.host, port: cfg.porta || 5432, database: cfg.banco, user: cfg.usuario, password: cfg.senha,
    max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    application_name: 'farmarotina-ponte',
  });
  // Toda sessão é somente leitura e com tempo limite: a ponte nunca altera o banco do Trier
  pool.on('connect', (c) => {
    c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY; SET statement_timeout = '15s'").catch(() => {});
  });
  return pool;
}
