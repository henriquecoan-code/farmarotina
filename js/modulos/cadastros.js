import { fmtData, fmtDataHora, hoje } from '../util.js';

export const clientes = {
  id: 'clientes', modulo: 'clientes', nome: 'Clientes', novo: 'Novo cliente', icone: 'users',
  ordem: 'nome', desc: false,
  campos: [
    { k: 'nome', rot: 'Nome completo', tipo: 'texto', obrig: true },
    { k: 'telefone', rot: 'Telefone', tipo: 'tel', lg: 'm' },
    { k: 'nascimento', rot: 'Nascimento', tipo: 'data', lg: 'm' },
    { k: 'cpf', rot: 'CPF', tipo: 'texto', lg: 'm', ajuda: 'Opcional' },
    { k: 'condicoes', rot: 'Condições', tipo: 'multi', opcoes: ['Hipertensão', 'Diabetes', 'Asma/DPOC', 'Gestante', 'Outra'] },
    { k: 'obs', rot: 'Observações', tipo: 'textarea' },
    { k: 'consentimento', rot: 'O cliente autorizou o registro dos dados de saúde (LGPD)', tipo: 'simnao', obrig: true },
  ],
  titulo: (d) => d.nome,
  sub: (d) => [d.telefone, (d.condicoes || []).join(', ')].filter(Boolean).join(' · '),
  valor: (d) => (d.nascimento ? `nasc. ${fmtData(d.nascimento)}` : ''),
};

export const atendimentos = {
  id: 'atendimentos', modulo: 'atendimento', nome: 'Atendimento', novo: 'Novo atendimento', icone: 'message-circle',
  ordem: 'dataHora', desc: true,
  campos: [
    { k: 'dataHora', rot: 'Data e hora', tipo: 'datahora', obrig: true, lg: 'm' },
    { k: 'status', rot: 'Situação', tipo: 'opcoes', opcoes: ['Aberto', 'Resolvido'], obrig: true, padrao: 'Aberto', lg: 'm' },
    { k: 'clienteId', rot: 'Cliente', tipo: 'ref', col: 'clientes', livre: true, ajuda: 'Pode digitar um nome sem cadastrar' },
    { k: 'tipo', rot: 'Tipo', tipo: 'opcoes', opcoes: ['Dúvida', 'Orientação farmacêutica', 'Encomenda', 'Reclamação', 'Elogio', 'Outro'], obrig: true },
    { k: 'descricao', rot: 'Descrição', tipo: 'textarea', obrig: true },
    { k: 'retorno', rot: 'Retornar até', tipo: 'data', lg: 'm', se: (v) => v.status === 'Aberto' },
    { k: 'solucao', rot: 'Solução', tipo: 'textarea', se: (v) => v.status === 'Resolvido' },
  ],
  titulo: (d) => `${d.tipo} · ${d.clienteNome || 'Sem cliente'}`,
  sub: (d) => `${fmtDataHora(d.dataHora)} · ${String(d.descricao || '').slice(0, 70)}`,
  valor: (d) => d.status,
  alerta: (v) => (v.status === 'Aberto' && v.retorno && v.retorno < hoje()
    ? { nivel: 'atencao', msg: `Retorno atrasado (era até ${fmtData(v.retorno)}).` } : null),
};

export const notas = {
  id: 'notas', modulo: 'notas', nome: 'Anotações', novo: 'Nova anotação', icone: 'notes',
  ordem: 'dataHora', desc: true,
  campos: [
    { k: 'titulo', rot: 'Título', tipo: 'texto', obrig: true },
    { k: 'dataHora', rot: 'Data e hora', tipo: 'datahora', obrig: true, lg: 'm' },
    { k: 'categoria', rot: 'Categoria', tipo: 'opcoes', opcoes: ['Geral', 'Estoque', 'Equipe', 'Clientes', 'Fornecedores', 'Financeiro', 'Outro'], padrao: 'Geral', lg: 'm' },
    { k: 'texto', rot: 'Anotação', tipo: 'textarea', linhas: 6, obrig: true },
    { k: 'lembrete', rot: 'Lembrar em', tipo: 'data', lg: 'm', ajuda: 'Opcional' },
    { k: 'resolvido', rot: 'Resolvido', tipo: 'simnao', lg: 'm', se: (v) => !!v.lembrete },
  ],
  titulo: (d) => d.titulo,
  sub: (d) => `${d.categoria || 'Geral'} · ${fmtDataHora(d.dataHora)} · ${String(d.texto || '').slice(0, 60)}`,
  valor: (d) => (d.lembrete && !d.resolvido ? `lembrar ${fmtData(d.lembrete)}` : ''),
  alerta: (v) => {
    if (!v.lembrete || v.resolvido) return null;
    if (v.lembrete < hoje()) return { nivel: 'atencao', msg: `Lembrete atrasado (era ${fmtData(v.lembrete)}).` };
    if (v.lembrete === hoje()) return { nivel: 'atencao', msg: 'Lembrete para hoje.' };
    return null;
  },
};

// "14:00" → minutos desde 00:00, para comparar com a hora atual
const minutos = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
function situacaoPedido(d) {
  if (!d.horarioLimite) return '';
  const agora = new Date();
  const passou = agora.getHours() * 60 + agora.getMinutes() > minutos(d.horarioLimite);
  return passou ? `Encerrado (${d.horarioLimite})` : `Pedido até ${d.horarioLimite}`;
}

export const fornecedores = {
  id: 'fornecedores', modulo: 'fornecedores', nome: 'Fornecedores', novo: 'Novo fornecedor', icone: 'truck',
  ordem: 'nome', desc: false,
  campos: [
    { k: 'nome', rot: 'Razão social / nome', tipo: 'texto', obrig: true },
    { k: 'cnpj', rot: 'CNPJ', tipo: 'texto', lg: 'm' },
    { k: 'contato', rot: 'Contato (vendedor)', tipo: 'texto', lg: 'm' },
    { k: 'telefone', rot: 'Telefone', tipo: 'tel', lg: 'm' },
    { k: 'email', rot: 'E-mail', tipo: 'email', lg: 'm' },
    { k: 'horarioLimite', rot: 'Horário limite de envio do pedido', tipo: 'hora', lg: 'm' },
    { k: 'prazo', rot: 'Prazo padrão de entrega', tipo: 'texto', lg: 'm', ajuda: 'Ex.: 24 h, 2 dias úteis' },
    { k: 'produtos', rot: 'Produtos que fornece', tipo: 'textarea' },
    { k: 'obs', rot: 'Observações (pedido mínimo, condições…)', tipo: 'textarea' },
  ],
  titulo: (d) => d.nome,
  sub: (d) => [d.contato, d.telefone, d.prazo && `entrega: ${d.prazo}`].filter(Boolean).join(' · '),
  valor: situacaoPedido,
};

export const pops = {
  id: 'pops', modulo: 'pops', nome: 'POPs', novo: 'Novo POP', icone: 'book',
  ordem: 'titulo', desc: false, somenteAdmin: true,
  campos: [
    { k: 'codigo', rot: 'Código', tipo: 'texto', lg: 't', ajuda: 'POP-001' },
    { k: 'versao', rot: 'Versão', tipo: 'texto', lg: 't' },
    { k: 'vigencia', rot: 'Vigente desde', tipo: 'data', lg: 't' },
    { k: 'titulo', rot: 'Título', tipo: 'texto', obrig: true },
    { k: 'responsavel', rot: 'Responsável', tipo: 'texto' },
    { k: 'conteudo', rot: 'Procedimento', tipo: 'textarea', linhas: 12, obrig: true },
  ],
  titulo: (d) => `${d.codigo ? d.codigo + ' · ' : ''}${d.titulo}`,
  sub: (d) => [d.versao && `versão ${d.versao}`, d.vigencia && `vigente desde ${fmtData(d.vigencia)}`].filter(Boolean).join(' · '),
  valor: () => '',
};
