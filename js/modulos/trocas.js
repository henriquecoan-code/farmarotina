// Trocas com outras farmácias: empréstimos (pega hoje, devolve depois) e repasses de produtos perto do vencimento.
import * as config from '../config.js';
import { fmtData, fmtDataHora, fmtNum, hoje } from '../util.js';

export const TIPOS_TROCA = ['Peguei emprestado', 'Emprestei', 'Repassei (vencimento próximo)', 'Recebi (vencimento próximo)'];
const emprestimo = (v) => v.tipo === 'Peguei emprestado' || v.tipo === 'Emprestei';
const pad = (n) => String(n).padStart(2, '0');

// Empréstimo: prazo padrão para o dia seguinte
function diaSeguinte(dataHora) {
  if (!dataHora) return null;
  const d = new Date(`${dataHora.slice(0, 10)}T12:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function alerta(v) {
  if (v.situacao !== 'Pendente' || !v.prazo) return null;
  if (v.prazo < hoje()) return { nivel: 'perigo', msg: `Prazo venceu em ${fmtData(v.prazo)}.` };
  if (v.prazo === hoje()) return { nivel: 'atencao', msg: 'O prazo vence hoje.' };
  return null;
}

// Trocas antigas guardavam só o nome digitado em "farmacia"
export const nomeParceiro = (d) => d.parceiroNome || d.farmacia || '';

const qtd = (d) => (d.quantidade ? `${fmtNum(d.quantidade)} un. de ` : '');

// Mensagem de WhatsApp para a farmácia parceira, conforme o tipo da troca
export function mensagemTroca(d) {
  const contato = String(d.contato || '').trim().split(/\s+/)[0];
  const farmacia = config.NOME_FARMACIA ? `da ${config.NOME_FARMACIA}` : 'da farmácia';
  const ola = `Olá${contato ? ', ' + contato : ''}! Aqui é ${farmacia}.`;
  const item = `${qtd(d)}${d.produto || 'produto'}`;
  const quando = fmtData(d.dataHora).slice(0, 5);
  switch (d.tipo) {
    case 'Peguei emprestado':
      return `${ola} Sobre ${item} que pegamos emprestado em ${quando}: vamos fazer a devolução. Qual o melhor horário para vocês?`;
    case 'Emprestei':
      return `${ola} Passando para lembrar da devolução de ${item} que emprestamos em ${quando}`
        + `${d.prazo ? ` (combinado para ${fmtData(d.prazo).slice(0, 5)})` : ''}. Obrigado!`;
    case 'Repassei (vencimento próximo)':
      return `${ola} Sobre ${item} que repassamos para vocês em ${quando}: podemos combinar o acerto?`;
    default:
      return `${ola} Sobre ${item} que recebemos de vocês em ${quando}: vamos combinar o acerto?`;
  }
}

export const trocas = {
  id: 'trocas', modulo: 'trocas', nome: 'Trocas', novo: 'Nova troca', icone: 'arrows-exchange',
  ordem: 'dataHora', desc: true,
  links: [{ href: '#/m/parceiros', icone: 'building-store', rot: 'Farmácias parceiras' }],
  campos: [
    { k: 'dataHora', rot: 'Data e hora', tipo: 'datahora', obrig: true, lg: 'm' },
    { k: 'situacao', rot: 'Situação', tipo: 'opcoes', opcoes: ['Pendente', 'Concluída'], obrig: true, padrao: 'Pendente', lg: 'm' },
    { k: 'tipo', rot: 'Tipo', tipo: 'opcoes', opcoes: TIPOS_TROCA, lista: true, obrig: true },
    { k: 'parceiroId', rot: 'Farmácia parceira', tipo: 'ref', col: 'parceiros', obrig: true, livre: true,
      preencher: { contato: 'contato', telefone: 'telefone' } },
    { k: 'contato', rot: 'Contato', tipo: 'texto', lg: 'm', ajuda: 'Quem combinou' },
    { k: 'telefone', rot: 'Telefone / WhatsApp', tipo: 'tel', lg: 'm' },
    { k: 'produto', rot: 'Produto', tipo: 'texto', obrig: true },
    { k: 'quantidade', rot: 'Quantidade', tipo: 'num', unidade: 'un.', lg: 't' },
    { k: 'lote', rot: 'Lote', tipo: 'texto', lg: 't' },
    { k: 'validade', rot: 'Validade', tipo: 'data', lg: 't' },
    { k: 'prazo', rot: 'Prazo para devolver / acertar', tipo: 'data', lg: 'm', ajuda: 'Empréstimo: dia seguinte' },
    { k: 'acerto', rot: 'Forma de acerto', tipo: 'opcoes', lista: true, lg: 'm',
      opcoes: ['Devolver o mesmo produto', 'Pagamento', 'Troca por outro produto', 'Sem acerto'] },
    { k: 'obs', rot: 'Observações', tipo: 'textarea' },
  ],
  // Empréstimo já sugere devolução no dia seguinte (pode ajustar ou apagar)
  calcular: (v) => ({ prazo: emprestimo(v) ? diaSeguinte(v.dataHora) : null }),
  titulo: (d) => `${qtd(d)}${d.produto}`,
  sub: (d) => `${d.tipo} · ${nomeParceiro(d)} · ${fmtDataHora(d.dataHora)}`,
  valor: (d) => (d.situacao === 'Concluída' ? 'Concluída' : d.prazo ? `prazo ${fmtData(d.prazo).slice(0, 5)}` : 'Pendente'),
  alerta,
};

// Cadastro das farmácias com quem fazemos trocas (fica dentro do módulo Trocas)
export const parceiros = {
  id: 'parceiros', modulo: 'trocas', nome: 'Farmácias parceiras', novo: 'Nova farmácia parceira', icone: 'building-store',
  ordem: 'nome', desc: false, menu: false, voltar: { href: '#/m/trocas', rot: 'Trocas' },
  campos: [
    { k: 'nome', rot: 'Nome da farmácia', tipo: 'texto', obrig: true },
    { k: 'contato', rot: 'Contato', tipo: 'texto', lg: 'm', ajuda: 'Com quem costuma falar' },
    { k: 'telefone', rot: 'Telefone / WhatsApp', tipo: 'tel', lg: 'm' },
    { k: 'endereco', rot: 'Endereço', tipo: 'texto' },
    { k: 'obs', rot: 'Observações', tipo: 'textarea' },
  ],
  titulo: (d) => d.nome,
  sub: (d) => [d.contato, d.telefone].filter(Boolean).join(' · '),
  valor: () => '',
};
