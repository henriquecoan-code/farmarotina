import { fmtDataHora, fmtNum } from '../util.js';

export const FAIXAS = { Geladeira: [2, 8], Ambiente: [15, 30] };
export const UMIDADE_MAX = 70;

export function turnoAtual(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
}

function alerta(v) {
  const faixa = FAIXAS[v.local];
  if (!faixa) return null;
  const [min, max] = faixa;
  const fora = ['atual', 'min', 'max'].filter((k) => typeof v[k] === 'number' && (v[k] < min || v[k] > max));
  if (fora.length) return { nivel: 'perigo', msg: `Fora da faixa (${min} a ${max} °C). Registre a ação corretiva.` };
  if (v.local === 'Ambiente' && v.umidade > UMIDADE_MAX) return { nivel: 'atencao', msg: `Umidade acima de ${UMIDADE_MAX}%.` };
  return null;
}

export const temperatura = {
  id: 'temperatura', modulo: 'temperatura', nome: 'Temperatura', novo: 'Registrar temperatura', icone: 'temperature',
  ordem: 'dataHora', desc: true,
  campos: [
    { k: 'local', rot: 'Local', tipo: 'opcoes', opcoes: ['Geladeira', 'Ambiente'], obrig: true, padrao: 'Geladeira', lg: 'm' },
    { k: 'turno', rot: 'Turno', tipo: 'opcoes', opcoes: ['Manhã', 'Tarde', 'Noite'], obrig: true, padrao: () => turnoAtual(), lg: 'm' },
    { k: 'dataHora', rot: 'Data e hora', tipo: 'datahora', obrig: true },
    { k: 'atual', rot: 'Atual', tipo: 'num', unidade: '°C', obrig: true, lg: 't' },
    { k: 'min', rot: 'Mínima', tipo: 'num', unidade: '°C', lg: 't' },
    { k: 'max', rot: 'Máxima', tipo: 'num', unidade: '°C', lg: 't' },
    { k: 'umidade', rot: 'Umidade relativa', tipo: 'num', unidade: '%', lg: 'm', se: (v) => v.local === 'Ambiente' },
    { k: 'acao', rot: 'Ação corretiva', tipo: 'textarea', obrig: true, se: (v) => alerta(v)?.nivel === 'perigo' },
  ],
  titulo: (d) => `${d.local} · ${fmtNum(d.atual, 1)} °C`,
  sub: (d) => `${fmtDataHora(d.dataHora)} · ${d.turno} · ${d.criadoPorNome || ''}`,
  valor: (d) => (d.min != null && d.max != null ? `mín ${fmtNum(d.min, 1)} · máx ${fmtNum(d.max, 1)}` : ''),
  alerta,
};
