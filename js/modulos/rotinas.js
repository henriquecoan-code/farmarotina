// Rotinas: tarefas que se repetem (ex.: todo começo de mês enviar relatório CST e XML para a contabilidade).
// Cada rotina tem uma regra de repetição; ao marcar "Feito", a próxima data é calculada sozinha.
import { obterPerfilAtual } from '../perm.js';
import { esc, agoraLocal, fmtData, fmtDataHora, hoje } from '../util.js';

export const FREQUENCIAS = ['Mensal', 'Semanal', 'Quinzenal', 'Diária', 'Anual', 'A cada X dias'];
const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']; // ordem do getDay()
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIA = 86_400_000;

const pad = (n) => String(n).padStart(2, '0');
const iso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const data = (s) => new Date(`${String(s).slice(0, 10)}T12:00`);
const ultimoDia = (dt) => new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
const diaDoMes = (v, dt) => Math.min(Math.max(1, Math.round(v.diaMes || 1)), ultimoDia(dt));

// A data cai na regra da rotina?
function casa(v, dt) {
  switch (v.frequencia) {
    case 'Diária': return true;
    case 'Semanal': return SEMANA[dt.getDay()] === (v.diaSemana || 'Segunda');
    case 'Mensal': return dt.getDate() === diaDoMes(v, dt);
    case 'Anual': return MESES[dt.getMonth()] === (v.mes || 'Janeiro') && dt.getDate() === diaDoMes(v, dt);
    case 'Quinzenal':
    case 'A cada X dias': {
      const n = v.frequencia === 'Quinzenal' ? 15 : Math.round(v.intervaloDias || 0);
      if (n < 1) return false;
      const dias = Math.round((dt - data(v.inicio || hoje())) / DIA);
      return dias >= 0 && dias % n === 0;
    }
    default: return false;
  }
}

// Primeira data da regra a partir de "base" (incluindo a própria base, ou só depois dela se estrito)
export function ocorrencia(v, base = hoje(), estrito = false) {
  const dt = data(base);
  if (estrito) dt.setDate(dt.getDate() + 1);
  for (let i = 0; i < 800; i++, dt.setDate(dt.getDate() + 1)) if (casa(v, dt)) return iso(dt);
  return null;
}

// Depois de feita: a próxima vem depois de hoje e depois da data que estava marcada
// (feita com atraso → próximo ciclo; feita adiantada → não repete o mesmo ciclo).
const proximaDepoisDeFeita = (d) => ocorrencia(d, d.proxima && d.proxima > hoje() ? d.proxima : hoje(), true);

export function descreverFrequencia(d) {
  switch (d.frequencia) {
    case 'Diária': return 'Todo dia';
    case 'Semanal': return `Toda ${String(d.diaSemana || 'Segunda').toLowerCase()}${['Sábado', 'Domingo'].includes(d.diaSemana) ? '' : '-feira'}`;
    case 'Mensal': return `Todo dia ${d.diaMes || 1} do mês`;
    case 'Anual': return `Todo ano, ${d.diaMes || 1} de ${String(d.mes || 'Janeiro').toLowerCase()}`;
    case 'Quinzenal': return 'A cada 15 dias';
    case 'A cada X dias': return `A cada ${d.intervaloDias || '?'} dias`;
    default: return '';
  }
}

function quando(s) {
  const n = Math.round((data(s) - data(hoje())) / DIA);
  if (n < -1) return `atrasada há ${-n} dias`;
  if (n === -1) return 'atrasada desde ontem';
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  return `em ${n} dias`;
}

const ativa = (d) => d.ativa !== false;
const fq = (...fs) => (v) => fs.includes(v.frequencia);

export const rotinas = {
  id: 'rotinas', modulo: 'rotinas', nome: 'Rotinas', novo: 'Nova rotina', icone: 'repeat',
  ordem: 'proxima', desc: false,
  campos: [
    { k: 'titulo', rot: 'O que precisa ser feito', tipo: 'texto', obrig: true },
    { k: 'frequencia', rot: 'Repetir', tipo: 'opcoes', opcoes: FREQUENCIAS, lista: true, obrig: true, padrao: 'Mensal', lg: 'm' },
    { k: 'diaMes', rot: 'Dia do mês', tipo: 'num', lg: 'm', padrao: 1, ajuda: '1 = começo do mês', se: fq('Mensal', 'Anual') },
    { k: 'mes', rot: 'Mês', tipo: 'opcoes', opcoes: MESES, lista: true, lg: 'm', se: fq('Anual') },
    { k: 'diaSemana', rot: 'Dia da semana', tipo: 'opcoes', opcoes: [...SEMANA.slice(1), SEMANA[0]], lista: true, padrao: 'Segunda', lg: 'm', se: fq('Semanal') },
    { k: 'intervaloDias', rot: 'A cada', tipo: 'num', unidade: 'dias', lg: 'm', se: fq('A cada X dias') },
    { k: 'inicio', rot: 'Contando a partir de', tipo: 'data', lg: 'm', padrao: () => hoje(), se: fq('Quinzenal', 'A cada X dias') },
    { k: 'proxima', rot: 'Próxima vez', tipo: 'data', obrig: true, lg: 'm', ajuda: 'Calculada; pode ajustar' },
    { k: 'responsavel', rot: 'Responsável', tipo: 'texto', lg: 'm' },
    { k: 'descricao', rot: 'Como fazer', tipo: 'textarea', linhas: 5, ajuda: 'Passo a passo, links, contatos' },
    { k: 'ativa', rot: 'Rotina ativa (desmarque para pausar)', tipo: 'simnao', padrao: true },
  ],
  calcular: (v) => ({ proxima: ocorrencia(v, hoje()) }),
  titulo: (d) => d.titulo,
  sub: (d) => [descreverFrequencia(d), d.responsavel && `resp.: ${d.responsavel}`,
    d.ultimaVez && `feita em ${fmtData(d.ultimaVez).slice(0, 5)}`].filter(Boolean).join(' · '),
  valor: (d) => (!ativa(d) ? 'Pausada' : d.proxima ? `${fmtData(d.proxima).slice(0, 5)} · ${quando(d.proxima)}` : ''),
  alerta: (v) => {
    if (!ativa(v) || !v.proxima) return null;
    if (v.proxima < hoje()) return { nivel: 'perigo', msg: `Atrasada: era para ${fmtData(v.proxima)}.` };
    if (v.proxima === hoje()) return { nivel: 'atencao', msg: 'É para hoje.' };
    return null;
  },
  // Botão "Feito": registra quem fez e quando, e calcula a próxima data
  acaoRapida: {
    rot: 'Feito', icone: 'check', msg: 'Rotina feita. Próxima data calculada.',
    quando: (d) => ativa(d) && !!d.proxima,
    dados: (d) => ({
      ultimaVez: agoraLocal(),
      proxima: proximaDepoisDeFeita(d),
      historico: [...(d.historico || []).slice(-23), { quando: agoraLocal(), por: obterPerfilAtual()?.nome || '', prevista: d.proxima || null }],
    }),
  },
  // Histórico das últimas vezes em que foi feita, na página da rotina
  detalheExtra: (d) => (d.historico?.length ? `<section class="cartao">
    <div class="cartao-topo"><h2>Últimas vezes</h2></div>
    <ul class="historico-simples">${[...d.historico].reverse().map((h) => `<li><b>${fmtDataHora(h.quando)}</b>
      <span class="mudo">${esc(h.por || '')}${h.prevista && h.prevista < String(h.quando).slice(0, 10) ? ` · prevista para ${fmtData(h.prevista).slice(0, 5)}` : ''}</span></li>`).join('')}</ul>
  </section>` : ''),
};
