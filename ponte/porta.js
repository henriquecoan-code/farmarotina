// Mostra a porta em que a ponte escuta (a mesma conta do servidor.js: portaPonte do config ou 3790).
// Usado pelo parar.bat. Não usa o banco.js para não precisar do pacote pg nem encerrar com erro.
import { readFileSync } from 'node:fs';

let porta = 3790;
try {
  const caminho = process.env.PONTE_CONFIG || 'C:\\FarmaRotinaPonte\\config.json';
  porta = JSON.parse(readFileSync(caminho, 'utf8')).portaPonte || 3790;
} catch { /* sem config legível: fica a porta padrão */ }
console.log(porta);
