// Download do instalador da ponte do Trier (Configurações → Ponte do Trier): junta num .zip, aqui no
// navegador, os arquivos da pasta ponte/ que o próprio site publica, com o LEIA-ME.txt e o instalar.bat.
// Assim o zip é sempre a versão atual. A senha do banco NÃO vai junto: o config.json é criado no
// computador da farmácia pelo instalar.bat, a partir do config.exemplo.json.

// Ao criar um arquivo novo na ponte/, acrescente aqui.
export const ARQUIVOS_PONTE = [
  'LEIA-ME.txt', 'instalar.bat', 'inicio-automatico.bat', 'iniciar.bat', 'iniciar-oculto.vbs', 'parar.bat',
  'servidor.js', 'consultas.js', 'banco.js', 'porta.js', 'explorar.js',
  'package.json', 'package-lock.json', 'config.exemplo.json',
];
// Estes precisam de fim de linha do Windows (CRLF): o site publica com LF e o .bat falharia nos "goto"
const TEXTO_WINDOWS = /\.(bat|vbs|txt)$/i;

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Zip simples, sem compressão (os arquivos são pequenos). arquivos: [{ nome, bytes }]
export function montarZip(arquivos, quando = new Date()) {
  const enc = new TextEncoder();
  const hora = (quando.getHours() << 11) | (quando.getMinutes() << 5) | (quando.getSeconds() >> 1);
  const dia = ((quando.getFullYear() - 1980) << 9) | ((quando.getMonth() + 1) << 5) | quando.getDate();
  const partes = [];
  const central = [];
  let pos = 0;
  for (const { nome, bytes } of arquivos) {
    const n = enc.encode(nome);
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);        // versão mínima
    local.setUint16(6, 0x0800, true);    // nomes em UTF-8
    local.setUint16(8, 0, true);         // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, n.length, true);
    partes.push(new Uint8Array(local.buffer), n, bytes);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, pos, true);          // onde começa o arquivo
    central.push(new Uint8Array(c.buffer), n);
    pos += 30 + n.length + bytes.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/zip' });
}

async function baixar(nome) {
  const r = await fetch(`ponte/${nome}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Não consegui baixar ponte/${nome} (erro ${r.status}). Confira a internet e tente de novo.`);
  let bytes = new Uint8Array(await r.arrayBuffer());
  if (TEXTO_WINDOWS.test(nome)) {
    const texto = new TextDecoder('utf-8').decode(bytes).replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    // O .txt leva a marca de UTF-8 para o Bloco de Notas mostrar os acentos em qualquer Windows
    bytes = new TextEncoder().encode((/\.txt$/i.test(nome) ? '﻿' : '') + texto);
  }
  return { nome: `ponte/${nome}`, bytes };
}

// Monta o zip e manda o navegador salvar. Devolve a versão da ponte (ex.: "1.5").
export async function baixarZipPonte() {
  const arquivos = await Promise.all(ARQUIVOS_PONTE.map(baixar));
  const servidor = new TextDecoder().decode(arquivos.find((a) => a.nome === 'ponte/servidor.js').bytes);
  const versao = servidor.match(/const VERSAO = '([^']+)'/)?.[1] || '';
  const url = URL.createObjectURL(montarZip(arquivos));
  const a = document.createElement('a');
  a.href = url;
  a.download = `FarmaRotinaPonte${versao ? `-v${versao}` : ''}.zip`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return versao;
}
