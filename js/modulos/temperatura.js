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

// ---------- lista: planilha do mês (um dia por linha, turnos nas colunas) ----------
const HORA_TURNO = { Manhã: '08:00', Tarde: '14:00', Noite: '19:00' };
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const hojeIso = () => new Date().toLocaleDateString('sv-SE');

// Último dia do mês que já chegou (mês atual: hoje; mês futuro: 0)
function ultimoDia(mes) {
  const [ano, m] = mes.split('-').map(Number);
  const h = hojeIso();
  if (mes === h.slice(0, 7)) return Number(h.slice(8, 10));
  return mes > h.slice(0, 7) ? 0 : new Date(ano, m, 0).getDate();
}

// Turnos que aparecem: manhã e tarde sempre; noite só se houver algum registro de noite no mês
const turnosDoMes = (docs) => TURNOS.filter((t) => t !== 'Noite' || docs.some((d) => d.turno === 'Noite'));

function celula(d, local, impressao, classe = '') {
  const p = PREFIXO[local];
  if (!temValor(d[`${p}Atual`])) return `<td class="vazio-cel ${classe}">—</td>`;
  const extremos = temValor(d[`${p}Min`]) || temValor(d[`${p}Max`])
    ? `<small>${fmtNum(d[`${p}Min`], 1) || '?'} – ${fmtNum(d[`${p}Max`], 1) || '?'}</small>` : '';
  const valor = `<b>${fmtNum(d[`${p}Atual`], 1)}</b>${extremos}`;
  return `<td class="${classe} ${foraDaFaixa(d, local) ? 'fora' : ''}">${impressao ? valor : `<a href="#/m/temperatura/${esc(d.id)}">${valor}</a>`}</td>`;
}

// Agrupa por dia e turno. Registros antigos (geladeira e ambiente separados) se juntam; havendo dois
// registros novos no mesmo turno, vale o mais recente e a célula mostra quantos são.
function porDiaTurno(docs) {
  const mapa = new Map();
  for (const d of [...docs].sort((a, b) => String(a.dataHora).localeCompare(String(b.dataHora)))) {
    const chave = `${String(d.dataHora).slice(0, 10)}|${d.turno || turnoAtual(new Date(d.dataHora))}`;
    const atual = mapa.get(chave);
    if (!atual) { mapa.set(chave, { ...d, _n: 1 }); continue; }
    const juntar = d.local && atual.local && d.local !== atual.local;
    const base = juntar ? { ...atual, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null)) } : { ...d };
    mapa.set(chave, { ...base, _n: juntar ? atual._n : atual._n + 1 });
  }
  return mapa;
}

const extremo = (docs, campos, fn) => {
  const vals = docs.flatMap((d) => campos.map((k) => d[k])).filter(temValor);
  return vals.length ? fn(...vals) : null;
};

export function tabelaMes(docs, mes, { impressao = false, editar = false } = {}) {
  const [ano, m] = mes.split('-').map(Number);
  const hoje = hojeIso();
  const mapa = porDiaTurno(docs);
  const turnos = turnosDoMes(docs);

  const linhas = [];
  for (let dia = ultimoDia(mes); dia >= 1; dia--) {
    const iso = `${mes}-${String(dia).padStart(2, '0')}`;
    const semana = DIAS_SEMANA[new Date(ano, m - 1, dia).getDay()];
    const cels = turnos.map((t) => {
      const d = mapa.get(`${iso}|${t}`);
      if (!d) {
        const novo = editar && !impressao
          ? `<a class="temp-novo" href="#/m/temperatura/novo?${new URLSearchParams({ turno: t, dataHora: `${iso}T${HORA_TURNO[t]}` })}" title="Registrar ${t.toLowerCase()} de ${fmtData(iso)}">+</a>` : '—';
        return `<td class="vazio-cel turno-ini" colspan="3">${novo}</td>`;
      }
      const mais = d._n > 1 ? ` <small class="temp-mais" title="${d._n} registros neste turno">${d._n}×</small>` : '';
      return celula(d, 'Geladeira', impressao, `turno-ini ${alerta(d) ? 'com-alerta' : ''}`) + celula(d, 'Ambiente', impressao)
        + `<td class="${d.umidade > UMIDADE_MAX ? 'fora' : ''}">${temValor(d.umidade) ? `${fmtNum(d.umidade, 0)}%` : '—'}${mais}</td>`;
    }).join('');
    const fds = semana === 'sáb' || semana === 'dom';
    linhas.push(`<tr class="${fds ? 'fds' : ''} ${iso === hoje ? 'hoje' : ''}"><th scope="row"><b>${String(dia).padStart(2, '0')}</b> <small>${semana}</small></th>${cels}</tr>`);
  }

  return `<table class="temp-mes">
    <thead>
      <tr><th rowspan="2" class="temp-dia-col">Dia</th>${turnos.map((t) => `<th colspan="3" class="turno-ini">${t}</th>`).join('')}</tr>
      <tr>${turnos.map(() => `<th class="turno-ini">Gel. <small>${faixaTxt('Geladeira')}</small></th><th>Amb. <small>${faixaTxt('Ambiente')}</small></th><th>Umid.</th>`).join('')}</tr>
    </thead>
    <tbody>${linhas.join('') || `<tr><td colspan="${1 + turnos.length * 3}" class="vazio-cel">Este mês ainda não começou.</td></tr>`}</tbody>
  </table>`;
}

export function resumoMes(docs, mes) {
  const hoje = hojeIso();
  const ultimo = ultimoDia(mes);
  const mapa = porDiaTurno(docs);
  const dias = new Set([...mapa.keys()].map((k) => k.slice(0, 10))).size;
  const turnos = turnosDoMes(docs);
  let faltam = 0;
  for (let dia = 1; dia <= ultimo; dia++) {
    const iso = `${mes}-${String(dia).padStart(2, '0')}`;
    for (const t of turnos) {
      // Hoje só conta os turnos que já começaram
      if (iso === hoje && TURNOS.indexOf(t) > TURNOS.indexOf(turnoAtual())) continue;
      if (!mapa.has(`${iso}|${t}`)) faltam++;
    }
  }
  const fora = docs.filter((d) => alerta(d)?.nivel === 'perigo').length;
  const faixa = (p) => {
    const min = extremo(docs, [`${p}Atual`, `${p}Min`], Math.min);
    const max = extremo(docs, [`${p}Atual`, `${p}Max`], Math.max);
    return min == null ? '—' : `${fmtNum(min, 1)} a ${fmtNum(max, 1)} °C`;
  };
  const umidMax = extremo(docs, ['umidade'], Math.max);
  const item = (rot, val, cls = '') => `<div class="temp-resumo-item ${cls}"><span>${rot}</span><b>${val}</b></div>`;
  return `<div class="temp-resumo">
    ${item('Dias com registro', `${dias} de ${ultimo}`)}
    ${item('Turnos sem registro', faltam, faltam ? 'atencao' : 'ok')}
    ${item('Fora da faixa', fora, fora ? 'perigo' : 'ok')}
    ${item('Geladeira no mês', faixa('gel'))}
    ${item('Ambiente no mês', faixa('amb'))}
    ${item('Umidade máxima', umidMax == null ? '—' : `${fmtNum(umidMax, 0)}%`, umidMax > UMIDADE_MAX ? 'atencao' : '')}
  </div>`;
}

const acoesDoMes = (docs) => docs.filter((d) => d.acao).sort((a, b) => String(a.dataHora).localeCompare(String(b.dataHora)));

function renderLista(docs, { mes, editar } = {}) {
  const acoes = acoesDoMes(docs);
  return `${resumoMes(docs, mes)}
    <div class="temp-mes-rolagem">${tabelaMes(docs, mes, { editar })}</div>
    ${acoes.length ? `<section class="temp-acoes"><h2>Ações corretivas do mês</h2>
      ${acoes.map((d) => `<a class="linha" href="#/m/temperatura/${esc(d.id)}"><div class="linha-texto"><div class="linha-titulo">${fmtData(d.dataHora)} · ${esc(d.turno || '')}</div><div class="linha-sub">${esc(d.acao)}</div></div></a>`).join('')}
    </section>` : ''}`;
}

// Planilha do mês para imprimir e assinar
function impressaoMes(docs, { mes }) {
  const acoes = acoesDoMes(docs);
  return `${tabelaMes(docs, mes, { impressao: true })}
    ${acoes.length ? `<h2>Ações corretivas</h2><table><thead><tr><th>Data</th><th>Ação</th><th>Por</th></tr></thead><tbody>
      ${acoes.map((d) => `<tr><td>${fmtData(d.dataHora)} ${esc(d.turno || '')}</td><td>${esc(d.acao)}</td><td>${esc(d.criadoPorNome || '')}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

const titulo = (d) => [
  temValor(d.gelAtual) && `Geladeira ${fmtNum(d.gelAtual, 1)} °C`,
  temValor(d.ambAtual) && `Ambiente ${fmtNum(d.ambAtual, 1)} °C`,
].filter(Boolean).join(' · ') || 'Temperatura';

export const temperatura = {
  id: 'temperatura', modulo: 'temperatura', nome: 'Temperatura', novo: 'Registrar temperatura', icone: 'temperature',
  ordem: 'dataHora', desc: true,
  normalizar: normalizarTemp,
  porMes: true, // a lista é a planilha de um mês
  renderLista,
  impressaoMes,
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
