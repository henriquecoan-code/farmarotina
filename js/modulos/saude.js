import { esc, fmtData, fmtDataHora, fmtNum } from '../util.js';
import { NOME_FARMACIA } from '../config.js';

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

// Clientes na lista (busca + cartões; ao clicar, histórico com Imprimir e WhatsApp): js/paginas/painel-clientes.js.
// O painel fica abaixo do título e da linha de busca/datas e segue o período De/Até.
function painelClientes(schemaId, depois, vazio) {
  return {
    titulo: 'Clientes', icone: 'users', depois, consulta: { limite: 2000 }, abaixoDoTitulo: true, usaPeriodo: true, vazio,
    render: () => '',
    // Importado na hora para não criar dependência circular entre os módulos
    ligar: async (el, docs, periodo) => {
      const m = await import('../paginas/painel-clientes.js');
      el.innerHTML = m.renderClientes(schemaId);
      await m.ligarClientes(el, docs, periodo, schemaId);
    },
  };
}

// Cabeçalho com os dados do cliente nas folhas impressas
function cabecalhoCliente(cliente) {
  const dados = [
    cliente.nascimento && `Nascimento: ${fmtData(cliente.nascimento)}`,
    cliente.cpf && `CPF: ${cliente.cpf}`,
    cliente.telefone && `Telefone: ${cliente.telefone}`,
    cliente.condicoes?.length && `Condições: ${cliente.condicoes.join(', ')}`,
  ].filter(Boolean);
  return `<p class="impressao-cliente"><b>Cliente: ${esc(cliente.nome)}</b>${dados.length ? `<br>${esc(dados.join(' · '))}` : ''}</p>`;
}
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const ola = (cliente) => `Olá${primeiroNome(cliente.nome) ? ', ' + primeiroNome(cliente.nome) : ''}! Aqui é ${NOME_FARMACIA ? `da ${NOME_FARMACIA}` : 'da farmácia'}.`;
const quem = (d) => String(d.criadoPorNome || '').split(' (')[0];

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
  painel: painelClientes('afericoes', 'Todos os registros', 'Nenhuma aferição neste período.'),
  historico: {
    tituloFolha: 'Controle de aferições', singular: 'aferição', plural: 'aferições',
    folha: (c, docs) => folhaAfericoes(c, docs), mensagem: (c, docs) => mensagemAfericoes(c, docs),
    linhaTitulo: (d) => d.tipo, linhaSub: (d) => fmtDataHora(d.dataHora),
  },
};

// ---------- aferições de um cliente: folha para imprimir e mensagem de WhatsApp ----------
const resultado = (d) => [afericoes.valor(d), d.tipo === 'Glicemia' && d.momento ? d.momento.toLowerCase() : '',
  d.fc ? `FC ${fmtNum(d.fc, 0)} bpm` : ''].filter(Boolean).join(' · ');

export function folhaAfericoes(cliente, docs) {
  const lista = [...docs].sort((a, b) => String(a.dataHora).localeCompare(String(b.dataHora)));
  return `${cabecalhoCliente(cliente)}
    <table><thead><tr><th>Data e hora</th><th>Tipo</th><th>Resultado</th><th>Observações e orientação</th><th>Aferido por</th></tr></thead>
    <tbody>${lista.map((d) => {
      const a = alertaAfericao(d);
      return `<tr><td>${fmtDataHora(d.dataHora)}</td><td>${esc(d.tipo)}</td><td><b>${esc(resultado(d))}</b>${a ? `<br><small>${esc(a.msg)}</small>` : ''}</td>
        <td>${esc(d.obs || '')}</td><td>${esc(quem(d))}</td></tr>`;
    }).join('')}</tbody></table>`;
}

// Últimas aferições (até 10, da mais recente para a mais antiga) em texto para o WhatsApp
export function mensagemAfericoes(cliente, docs) {
  const lista = [...docs].sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora))).slice(0, 10);
  return `${ola(cliente)} Seguem as suas aferições registradas aqui na farmácia:\n\n`
    + lista.map((d) => `• ${fmtDataHora(d.dataHora)}: ${d.tipo} ${resultado(d)}`).join('\n')
    + '\n\nLeve estes valores na sua próxima consulta. Qualquer dúvida, estamos à disposição!';
}

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
  // O título "Aplicações realizadas" já vem da seção de agendadas, por isso sem "depois"
  painel: painelClientes('injetaveis', '', 'Nenhuma aplicação neste período.'),
  historico: {
    tituloFolha: 'Histórico de aplicações de injetáveis', singular: 'aplicação', plural: 'aplicações',
    folha: (c, docs) => folhaInjetaveis(c, docs), mensagem: (c, docs) => mensagemInjetaveis(c, docs),
    linhaTitulo: (d) => d.medicamento || 'Aplicação',
    linhaSub: (d) => [fmtDataHora(d.dataHora), doseTxt(d)].filter(Boolean).join(' · '),
  },
  // Botão "Imprimir declaração" na página de cada aplicação
  impressaoRegistro: { rot: 'Imprimir declaração', gerar: (d, cliente) => declaracaoAplicacao(d, cliente) },
};

// ---------- injetáveis: histórico do cliente, mensagem e declaração de cada aplicação ----------
const VIAS = { IM: 'Intramuscular (IM)', SC: 'Subcutânea (SC)', ID: 'Intradérmica (ID)' };
const doseTxt = (d) => (d.dose ? `dose ${d.dose}${d.totalDoses ? ` de ${d.totalDoses}` : ''}` : '');
const prescricao = (d) => (d.receita === true ? ['Sim', d.prescritor, d.registroProf].filter(Boolean).join(' · ') : d.receita === false ? 'Não' : '');

export function folhaInjetaveis(cliente, docs) {
  const lista = [...docs].sort((a, b) => String(a.dataHora).localeCompare(String(b.dataHora)));
  return `${cabecalhoCliente(cliente)}
    <table><thead><tr><th>Data e hora</th><th>Medicamento e dose</th><th>Via e local</th><th>Lote / validade</th><th>Receita / prescritor</th><th>Aplicado por</th></tr></thead>
    <tbody>${lista.map((d) => `<tr><td>${fmtDataHora(d.dataHora)}</td>
      <td><b>${esc(d.medicamento || '—')}</b>${doseTxt(d) ? `<br><small>${esc(doseTxt(d))}</small>` : ''}</td>
      <td>${esc([d.via, d.local].filter(Boolean).join(' · '))}</td>
      <td>${esc([d.lote, d.validade && `val. ${fmtData(d.validade)}`].filter(Boolean).join(' · '))}</td>
      <td>${esc(prescricao(d))}</td><td>${esc(quem(d))}</td></tr>`).join('')}</tbody></table>`;
}

// Últimas aplicações (até 10) e a próxima agendada, em texto para o WhatsApp
export function mensagemInjetaveis(cliente, docs) {
  const lista = [...docs].sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
  const proxima = lista.find((d) => d.agendaPendente && d.proxima)?.proxima;
  return `${ola(cliente)} Segue o histórico das suas aplicações aqui na farmácia:\n\n`
    + lista.slice(0, 10).map((d) => `• ${fmtDataHora(d.dataHora)}: ${[d.medicamento || 'aplicação', doseTxt(d)].filter(Boolean).join(' · ')}`).join('\n')
    + (proxima ? `\n\nPróxima aplicação: ${fmtData(proxima)}.` : '')
    + '\n\nQualquer dúvida, estamos à disposição!';
}

// Declaração de serviço farmacêutico de uma aplicação (para entregar ao cliente)
export function declaracaoAplicacao(d, cliente) {
  const linha = (rot, val) => (val ? `<tr><th>${esc(rot)}</th><td>${esc(val)}</td></tr>` : '');
  const nasc = cliente.nascimento ? fmtData(cliente.nascimento) : '';
  return {
    titulo: 'Declaração de Serviço Farmacêutico',
    descricao: [NOME_FARMACIA, 'Aplicação de medicamento injetável'].filter(Boolean).join(' · '),
    corpo: `<p class="declaracao-texto">Declaramos, para os devidos fins, que <b>${esc(cliente.nome || d.clienteNome || '')}</b>${nasc ? `, nascido(a) em ${esc(nasc)},` : ''}
        recebeu nesta farmácia, em <b>${esc(fmtDataHora(d.dataHora))}</b>, a aplicação do medicamento descrito abaixo.</p>
      <table class="declaracao-tabela"><tbody>
        ${linha('Paciente', cliente.nome || d.clienteNome)}
        ${linha('CPF', cliente.cpf)}
        ${linha('Data de nascimento', nasc)}
        ${linha('Medicamento e dose', d.medicamento)}
        ${linha('Dose', doseTxt(d).replace(/^dose /, ''))}
        ${linha('Lote', d.lote)}
        ${linha('Validade', d.validade && fmtData(d.validade))}
        ${linha('Via de administração', VIAS[d.via] || d.via)}
        ${linha('Local de aplicação', d.local)}
        ${linha('Data e hora da aplicação', fmtDataHora(d.dataHora))}
        ${linha('Receita apresentada', d.receita === true ? 'Sim' : d.receita === false ? 'Não' : '')}
        ${linha('Prescritor', [d.prescritor, d.registroProf].filter(Boolean).join(' · '))}
        ${linha('Próxima aplicação', d.agendaPendente && d.proxima ? fmtData(d.proxima) : '')}
        ${linha('Observações', d.obs)}
        ${linha('Aplicado por', quem(d))}
      </tbody></table>`,
    assinatura: `<div class="assinatura-dupla">
        <div><span></span>Assinatura do paciente ou responsável</div>
        <div><span></span>Farmacêutico(a) responsável · CRF nº</div>
      </div>`,
  };
}
