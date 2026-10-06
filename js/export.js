// Exportação CSV (abre no Excel em português) e impressão em tabela.
import { fmtValor } from './form.js';
import { NOME_APP } from './config.js';
import { esc, html, fmtDataHora, agoraLocal } from './util.js';

function colunas(schema) {
  return [
    ...schema.campos.filter((c) => c.tipo !== 'secao').map((c) => ({ rot: c.rotLongo || c.rot, val: (d) => fmtValor(c, d) })),
    { rot: 'Registrado por', val: (d) => d.criadoPorNome || '' },
    { rot: 'Registrado em', val: (d) => fmtDataHora(d.criadoLocal) },
  ];
}

export function exportarCSV(schema, docs, periodo = '') {
  const cols = colunas(schema);
  const cel = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const linhas = [cols.map((c) => cel(c.rot)).join(';')];
  for (const d of docs) linhas.push(cols.map((c) => cel(c.val(d))).join(';'));
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = html(`<a download="${esc(schema.id)}${periodo ? '_' + periodo : ''}.csv"></a>`);
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function imprimir(schema, docs, descricaoPeriodo = '') {
  const cols = colunas(schema).filter((c, i, todas) => docs.some((d) => c.val(d)) || i >= todas.length - 2);
  const area = html(`<div class="area-impressao">
    <h1>${esc(schema.nome)}</h1>
    <p>${esc(NOME_APP)}${descricaoPeriodo ? ' · ' + esc(descricaoPeriodo) : ''} · impresso em ${fmtDataHora(agoraLocal())}</p>
    <table><thead><tr>${cols.map((c) => `<th>${esc(c.rot)}</th>`).join('')}</tr></thead>
    <tbody>${docs.map((d) => `<tr>${cols.map((c) => `<td>${esc(c.val(d))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="assinatura">Conferido por: ______________________________ Data: ___/___/______</div>
  </div>`);
  document.body.append(area);
  document.body.classList.add('imprimindo');
  const limpar = () => { area.remove(); document.body.classList.remove('imprimindo'); };
  window.addEventListener('afterprint', limpar, { once: true });
  window.print();
}
