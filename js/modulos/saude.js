import { fmtDataHora, fmtNum } from '../util.js';

// Valores de referência gerais para triagem em farmácia.
// Ajuste conforme os POPs e a orientação do farmacêutico responsável.
function alertaAfericao(v) {
  if (v.tipo === 'Pressão' && v.pas && v.pad) {
    if (v.pas >= 180 || v.pad >= 120) return { nivel: 'perigo', msg: 'Pressão muito alta (≥ 180/120). Encaminhar com urgência.' };
    if (v.pas >= 140 || v.pad >= 90) return { nivel: 'atencao', msg: 'Pressão acima de 140/90. Orientar e encaminhar à UBS.' };
    if (v.pas < 90 || v.pad < 60) return { nivel: 'atencao', msg: 'Pressão baixa (< 90/60).' };
  }
  if (v.tipo === 'Glicemia' && v.glicemia) {
    if (v.glicemia < 70) return { nivel: 'perigo', msg: 'Hipoglicemia (< 70 mg/dL).' };
    if (v.momento === 'Jejum') {
      if (v.glicemia >= 126) return { nivel: 'perigo', msg: 'Glicemia de jejum ≥ 126 mg/dL. Encaminhar.' };
      if (v.glicemia >= 100) return { nivel: 'atencao', msg: 'Glicemia de jejum alterada (100–125 mg/dL).' };
    } else if (v.momento) {
      if (v.glicemia >= 200) return { nivel: 'perigo', msg: 'Glicemia ≥ 200 mg/dL. Encaminhar.' };
      if (v.glicemia >= 140) return { nivel: 'atencao', msg: 'Glicemia acima de 140 mg/dL.' };
    }
  }
  if (v.tipo === 'Oximetria' && v.spo2) {
    if (v.spo2 < 90) return { nivel: 'perigo', msg: 'SpO2 abaixo de 90%. Encaminhar com urgência.' };
    if (v.spo2 < 95) return { nivel: 'atencao', msg: 'SpO2 abaixo de 95%.' };
  }
  return null;
}

const pressao = (v) => v.tipo === 'Pressão';
const glicemia = (v) => v.tipo === 'Glicemia';
const oximetria = (v) => v.tipo === 'Oximetria';

export const afericoes = {
  id: 'afericoes', modulo: 'saude', nome: 'Aferições', novo: 'Nova aferição', icone: 'heartbeat',
  ordem: 'dataHora', desc: true,
  campos: [
    { k: 'clienteId', rot: 'Cliente', tipo: 'ref', col: 'clientes', obrig: true },
    { k: 'dataHora', rot: 'Data e hora', tipo: 'datahora', obrig: true, lg: 'm' },
    { k: 'tipo', rot: 'Tipo', tipo: 'opcoes', opcoes: ['Pressão', 'Glicemia', 'Oximetria'], obrig: true, padrao: 'Pressão', lg: 'm' },
    { k: 'pas', rot: 'PAS (sistólica)', tipo: 'num', unidade: 'mmHg', obrig: true, lg: 't', se: pressao },
    { k: 'pad', rot: 'PAD (diastólica)', tipo: 'num', unidade: 'mmHg', obrig: true, lg: 't', se: pressao },
    { k: 'glicemia', rot: 'Glicemia capilar', tipo: 'num', unidade: 'mg/dL', obrig: true, lg: 'm', se: glicemia },
    { k: 'momento', rot: 'Momento', tipo: 'opcoes', opcoes: ['Jejum', 'Pós-prandial', 'Aleatória'], obrig: true, lg: 'm', se: glicemia },
    { k: 'spo2', rot: 'Saturação (SpO2)', tipo: 'num', unidade: '%', obrig: true, lg: 't', se: oximetria },
    { k: 'fc', rot: 'Frequência cardíaca', tipo: 'num', unidade: 'bpm', lg: 't', se: (v) => pressao(v) || oximetria(v) },
    { k: 'obs', rot: 'Observações e orientação', tipo: 'textarea' },
  ],
  titulo: (d) => d.clienteNome || 'Sem cliente',
  sub: (d) => `${d.tipo} · ${fmtDataHora(d.dataHora)}`,
  valor: (d) => {
    if (d.tipo === 'Pressão') return `${fmtNum(d.pas, 0)}/${fmtNum(d.pad, 0)} mmHg`;
    if (d.tipo === 'Glicemia') return `${fmtNum(d.glicemia, 0)} mg/dL`;
    if (d.tipo === 'Oximetria') return `${fmtNum(d.spo2, 0)}%`;
    return '';
  },
  alerta: alertaAfericao,
};

const comReceita = (v) => v.receita === true;

// ---------- aplicações recorrentes ----------
export const INTERVALOS = ['Dose única', 'A cada 2 dias', 'Semanal', 'Quinzenal', 'Mensal', 'Outro'];
const DIAS_INTERVALO = { 'A cada 2 dias': 2, 'Semanal': 7, 'Quinzenal': 15 };
const repete = (v) => !!v.intervalo && v.intervalo !== 'Dose única';
const pad = (n) => String(n).padStart(2, '0');

// Data da próxima aplicação a partir da data desta aplicação e do intervalo (null se não houver próxima).
export function calcularProxima(v) {
  if (!v.dataHora || !repete(v)) return null;
  if (v.totalDoses && v.dose && v.dose >= v.totalDoses) return null;
  const d = new Date(`${v.dataHora.slice(0, 10)}T12:00`);
  if (v.intervalo === 'Mensal') d.setMonth(d.getMonth() + 1);
  else {
    const dias = DIAS_INTERVALO[v.intervalo] ?? (v.intervalo === 'Outro' ? v.intervaloDias : null);
    if (!(dias > 0)) return null;
    d.setDate(d.getDate() + dias);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const RECOMENDADO = 'Recomendado (RDC 44/2009)';

export const injetaveis = {
  id: 'injetaveis', modulo: 'saude', nome: 'Injetáveis', novo: 'Nova aplicação', icone: 'vaccine',
  ordem: 'dataHora', desc: true,
  agenda: true, // lista mostra as próximas aplicações agendadas (js/agenda.js)
  campos: [
    { k: 'clienteId', rot: 'Cliente', tipo: 'ref', col: 'clientes', obrig: true },
    { k: 'dataHora', rot: 'Data e hora', tipo: 'datahora', obrig: true, lg: 'm' },
    { k: 'via', rot: 'Via', tipo: 'opcoes', opcoes: ['IM', 'SC', 'ID'], lg: 'm' },
    { k: 'medicamento', rot: 'Medicamento e dose', tipo: 'texto' },
    { k: 'lote', rot: 'Lote', tipo: 'texto', lg: 'm', ajuda: RECOMENDADO },
    { k: 'validade', rot: 'Validade', tipo: 'data', lg: 'm', ajuda: RECOMENDADO },
    { k: 'local', rot: 'Local de aplicação', tipo: 'opcoes', opcoes: ['Glúteo', 'Deltoide', 'Vasto lateral da coxa', 'Abdome', 'Outro'] },
    { k: 'receita', rot: 'Apresentou receita (exigida para medicamento sob prescrição)', tipo: 'simnao' },
    { k: 'prescritor', rot: 'Prescritor', tipo: 'texto', lg: 'm', se: comReceita },
    { k: 'registroProf', rot: 'CRM / CRO', tipo: 'texto', lg: 'm', se: comReceita },
    { k: 'intervalo', rot: 'Repetir', tipo: 'opcoes', opcoes: INTERVALOS, padrao: 'Dose única', lg: 'm' },
    { k: 'intervaloDias', rot: 'A cada', tipo: 'num', unidade: 'dias', lg: 'm', se: (v) => v.intervalo === 'Outro' },
    { k: 'dose', rot: 'Esta é a dose nº', tipo: 'num', lg: 't', se: repete },
    { k: 'totalDoses', rot: 'Total de doses', tipo: 'num', lg: 't', ajuda: 'Se souber', se: repete },
    { k: 'proxima', rot: 'Próxima aplicação', tipo: 'data', lg: 't', se: repete, ajuda: 'Calculada; pode ajustar' },
    { k: 'obs', rot: 'Observações', tipo: 'textarea' },
  ],
  // Campos preenchidos automaticamente enquanto o usuário não os altera à mão
  calcular: (v) => ({ proxima: calcularProxima(v) }),
  titulo: (d) => d.clienteNome || 'Sem cliente',
  sub: (d) => [d.medicamento, fmtDataHora(d.dataHora), d.totalDoses && d.dose ? `dose ${d.dose} de ${d.totalDoses}` : '']
    .filter(Boolean).join(' · '),
  valor: (d) => d.via || '',
  alerta: (v) => (v.validade && v.dataHora && v.validade < v.dataHora.slice(0, 10)
    ? { nivel: 'perigo', msg: 'Medicamento vencido na data da aplicação.' } : null),
};
