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

export const injetaveis = {
  id: 'injetaveis', modulo: 'saude', nome: 'Injetáveis', novo: 'Nova aplicação', icone: 'vaccine',
  ordem: 'dataHora', desc: true,
  campos: [
    { k: 'clienteId', rot: 'Cliente', tipo: 'ref', col: 'clientes', obrig: true },
    { k: 'dataHora', rot: 'Data e hora', tipo: 'datahora', obrig: true, lg: 'm' },
    { k: 'via', rot: 'Via', tipo: 'opcoes', opcoes: ['IM', 'SC', 'ID'], obrig: true, lg: 'm' },
    { k: 'medicamento', rot: 'Medicamento e dose', tipo: 'texto', obrig: true },
    { k: 'lote', rot: 'Lote', tipo: 'texto', obrig: true, lg: 'm' },
    { k: 'validade', rot: 'Validade', tipo: 'data', obrig: true, lg: 'm' },
    { k: 'local', rot: 'Local de aplicação', tipo: 'opcoes', opcoes: ['Glúteo', 'Deltoide', 'Vasto lateral da coxa', 'Abdome', 'Outro'] },
    { k: 'receita', rot: 'Apresentou receita', tipo: 'simnao' },
    { k: 'prescritor', rot: 'Prescritor', tipo: 'texto', lg: 'm', se: comReceita },
    { k: 'registroProf', rot: 'CRM / CRO', tipo: 'texto', lg: 'm', se: comReceita },
    { k: 'obs', rot: 'Observações', tipo: 'textarea' },
  ],
  titulo: (d) => d.clienteNome || 'Sem cliente',
  sub: (d) => `${d.medicamento} · ${fmtDataHora(d.dataHora)}`,
  valor: (d) => d.via,
  alerta: (v) => (v.validade && v.dataHora && v.validade < v.dataHora.slice(0, 10)
    ? { nivel: 'perigo', msg: 'Medicamento vencido na data da aplicação.' } : null),
};
