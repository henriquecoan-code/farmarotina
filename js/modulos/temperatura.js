// Temperatura: geladeira e ambiente num registro só, por turno.
import { esc, fmtData, fmtDataHora, fmtNum } from '../util.js';

export const FAIXAS = { Geladeira: [2, 8], Ambiente: [15, 30] };
export const UMIDADE_MAX = 70;
const PREFIXO = { Geladeira: 'gel', Ambiente: 'amb' };
const TURNOS = ['Manhã', 'Tarde', 'Noite'];

export function turnoAtual(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
}

// Registros antigos tinham um local por registro (local + atual/min/max). Converte para o formato atual.
export function normalizarTemp(d) {
  if (!d?.local || d.gelAtual != null || d.ambAtual != null) return d;
  const p = PREFIXO[d.local];
  return p ? { ...d, [`${p}Atual`]: d.atual, [`${p}Min`]: d.min, [`${p}Max`]: d.max } : d;
}

const temValor = (x) => typeof x === 'number';
// Algum valor (atual, mínima ou máxima) do local fora da faixa?
export function foraDaFaixa(d, local) {
  const p = PREFIXO[local];
  const [min, max] = FAIXAS[local];
  return ['Atual', 'Min', 'Max'].some((k) => temValor(d[p + k]) && (d[p + k] < min || d[p + k] > max));
}

function alerta(v) {
  v = normalizarTemp(v);
  const fora = Object.keys(FAIXAS).filter((l) => foraDaFaixa(v, l));
  if (fora.length) {
    const txt = fora.map((l) => `${l.toLowerCase()} (${FAIXAS[l][0]} a ${FAIXAS[l][1]} °C)`).join(' e ');
    return { nivel: 'perigo', msg: `Fora da faixa: ${txt}. Registre a ação corretiva.` };
  }
  if (v.umidade > UMIDADE_MAX) return { nivel: 'atencao', msg: `Umidade acima de ${UMIDADE_MAX}%.` };
  return null;
}

const faixaTxt = (local) => `${FAIXAS[local][0]} a ${FAIXAS[local][1]} °C`;

// ---------- lista: uma mini tabela por dia ----------
function celula(d, local) {
  const p = PREFIXO[local];
  if (!temValor(d[`${p}Atual`])) return '<td class="vazio-cel">—</td>';
  const extremos = temValor(d[`${p}Min`]) || temValor(d[`${p}Max`])
    ? `<small>${fmtNum(d[`${p}Min`], 1) || '?'} – ${fmtNum(d[`${p}Max`], 1) || '?'}</small>` : '';
  return `<td class="${foraDaFaixa(d, local) ? 'fora' : ''}"><b>${fmtNum(d[`${p}Atual`], 1)} °C</b>${extremos}</td>`;
}

function renderLista(docs) {
  // Agrupa por dia e turno (junta os registros antigos de geladeira e ambiente do mesmo turno)
  const dias = new Map();
  for (const d of docs) {
    const dia = String(d.dataHora).slice(0, 10);
    // Só registros antigos (com "local") se juntam; registros novos nunca se escondem um no outro
    const chave = d.local ? `${d.turno}|antigo` : d.id;
    if (!dias.has(dia)) dias.set(dia, new Map());
    const turnos = dias.get(dia);
    const atual = turnos.get(chave);
    turnos.set(chave, atual ? { ...d, ...Object.fromEntries(Object.entries(atual).filter(([, v]) => v != null)) } : d);
  }
  const ordemTurno = (t) => { const i = TURNOS.indexOf(t.turno); return i < 0 ? 9 : i; };
  return [...dias.entries()].map(([dia, turnos]) => {
    const linhas = [...turnos.values()].sort((a, b) => ordemTurno(a) - ordemTurno(b));
    const semana = new Date(`${dia}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
    return `<section class="temp-dia">
      <div class="temp-dia-titulo"><b>${fmtData(dia)}</b> <span class="mudo primeira-maiuscula">${esc(semana)}</span></div>
      <table class="mini-tabela">
        <thead><tr><th>Turno</th><th>Geladeira <small>${faixaTxt('Geladeira')}</small></th><th>Ambiente <small>${faixaTxt('Ambiente')}</small></th><th>Umid.</th><th class="some-celular">Por</th></tr></thead>
        <tbody>${linhas.map((d) => `<tr data-href="#/m/temperatura/${esc(d.id)}" class="${alerta(d) ? 'com-alerta' : ''}">
          <td><a href="#/m/temperatura/${esc(d.id)}">${esc(d.turno || '—')}</a><small>${esc(String(d.dataHora).slice(11, 16))}</small></td>
          ${celula(d, 'Geladeira')}${celula(d, 'Ambiente')}
          <td class="${d.umidade > UMIDADE_MAX ? 'fora' : ''}">${temValor(d.umidade) ? `${fmtNum(d.umidade, 0)}%` : '—'}</td>
          <td class="some-celular mudo">${esc(String(d.criadoPorNome || '').split(/[\s(]/)[0])}</td>
        </tr>`).join('')}</tbody>
      </table></section>`;
  }).join('');
}

const titulo = (d) => [
  temValor(d.gelAtual) && `Geladeira ${fmtNum(d.gelAtual, 1)} °C`,
  temValor(d.ambAtual) && `Ambiente ${fmtNum(d.ambAtual, 1)} °C`,
].filter(Boolean).join(' · ') || 'Temperatura';

export const temperatura = {
  id: 'temperatura', modulo: 'temperatura', nome: 'Temperatura', novo: 'Registrar temperatura', icone: 'temperature',
  ordem: 'dataHora', desc: true,
  normalizar: normalizarTemp,
  renderLista,
  campos: [
    { k: 'turno', rot: 'Turno', tipo: 'opcoes', opcoes: TURNOS, obrig: true, padrao: () => turnoAtual(), lg: 'm' },
    { k: 'dataHora', rot: 'Data e hora', tipo: 'datahora', obrig: true, lg: 'm' },
    { k: '_gel', rot: `Geladeira (${faixaTxt('Geladeira')})`, tipo: 'secao', icone: 'fridge' },
    { k: 'gelAtual', rot: 'Atual', rotLongo: 'Geladeira atual', tipo: 'num', unidade: '°C', obrig: true, lg: 't' },
    { k: 'gelMin', rot: 'Mínima', rotLongo: 'Geladeira mínima', tipo: 'num', unidade: '°C', lg: 't' },
    { k: 'gelMax', rot: 'Máxima', rotLongo: 'Geladeira máxima', tipo: 'num', unidade: '°C', lg: 't' },
    { k: '_amb', rot: `Ambiente (${faixaTxt('Ambiente')})`, tipo: 'secao', icone: 'building-store' },
    { k: 'ambAtual', rot: 'Atual', rotLongo: 'Ambiente atual', tipo: 'num', unidade: '°C', obrig: true, lg: 't' },
    { k: 'ambMin', rot: 'Mínima', rotLongo: 'Ambiente mínima', tipo: 'num', unidade: '°C', lg: 't' },
    { k: 'ambMax', rot: 'Máxima', rotLongo: 'Ambiente máxima', tipo: 'num', unidade: '°C', lg: 't' },
    { k: 'umidade', rot: 'Umidade relativa', tipo: 'num', unidade: '%', lg: 'm' },
    { k: 'acao', rot: 'Ação corretiva', tipo: 'textarea', obrig: true, se: (v) => alerta(v)?.nivel === 'perigo' },
  ],
  titulo,
  sub: (d) => `${fmtDataHora(d.dataHora)} · ${d.turno || ''} · ${d.criadoPorNome || ''}`,
  valor: (d) => (temValor(d.umidade) ? `umidade ${fmtNum(d.umidade, 0)}%` : ''),
  alerta,
};
