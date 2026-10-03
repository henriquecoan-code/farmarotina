// Agenda de aplicações recorrentes (injetáveis): próximas datas, cores por situação
// e mensagens prontas para avisar o cliente pelo WhatsApp.
import { db } from './db.js';
import * as config from './config.js';
import { carregarRef } from './form.js';
import { esc, icone, hoje, fmtData, normalizar } from './util.js';

const DIA = 86_400_000;
const meioDia = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00`);

// Dias entre hoje e a data (negativo = já passou)
export const diasAte = (iso) => Math.round((meioDia(iso) - meioDia(hoje())) / DIA);

export function situacaoData(iso) {
  const n = diasAte(iso);
  return n < 0 ? 'atrasado' : n === 0 ? 'hoje' : 'futuro';
}
export const situacao = (d) => situacaoData(d.proxima);

// genero: 'a' (aplicação) ou 'o' (lembrete, retorno)
export function textoQuando(iso, genero = 'a') {
  const n = diasAte(iso);
  if (n < -1) return `atrasad${genero} há ${-n} dias`;
  if (n === -1) return `atrasad${genero} desde ontem`;
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  return `em ${n} dias`;
}

const diaSemana = (iso) => meioDia(iso).toLocaleDateString('pt-BR', { weekday: 'long' });
const ddmm = (iso) => fmtData(iso).slice(0, 5);

// ---------- WhatsApp ----------
export function mensagemWhatsapp(d) {
  const nome = String(d.clienteNome || '').trim().split(/\s+/)[0] || '';
  const farmacia = config.NOME_FARMACIA ? `da ${config.NOME_FARMACIA}` : 'da farmácia';
  const ola = `Olá${nome ? ', ' + nome : ''}! Aqui é ${farmacia}.`;
  const n = diasAte(d.proxima);

  if (n < 0) {
    return `${ola} A sua aplicação estava prevista para ${ddmm(d.proxima)} e ainda não foi feita. `
      + 'Para manter o tratamento em dia, venha assim que puder ou responda esta mensagem para combinarmos o melhor horário.';
  }
  if (n === 0) {
    return `${ola} Hoje, ${ddmm(d.proxima)}, é o dia da sua aplicação. Estamos te esperando! `
      + 'Se precisar remarcar, é só responder esta mensagem.';
  }
  const quando = n === 1
    ? `amanhã, ${diaSemana(d.proxima)}, ${ddmm(d.proxima)}`
    : `${diaSemana(d.proxima)}, ${ddmm(d.proxima)} (daqui a ${n} dias)`;
  return `${ola} Passando para lembrar que a sua próxima aplicação está marcada para ${quando}. `
    + 'Qualquer dúvida, é só responder esta mensagem. Até lá!';
}

// Telefone brasileiro → link do WhatsApp com a mensagem pronta (null se não houver número)
export function linkWhatsapp(telefone, texto) {
  let num = String(telefone || '').replace(/\D/g, '');
  if (num.length < 10) return null;
  if (num.length <= 11) num = '55' + num;
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

// Telefone do cliente (os registros guardam só o id e o nome)
export async function telefones() {
  const clientes = await carregarRef('clientes');
  return new Map(clientes.map((c) => [c.id, c.telefone]));
}

// Mensagem para retornar o contato de um atendimento em aberto
export function mensagemRetorno(d) {
  const nome = String(d.clienteNome || '').trim().split(/\s+/)[0] || '';
  const farmacia = config.NOME_FARMACIA ? `da ${config.NOME_FARMACIA}` : 'da farmácia';
  return `Olá${nome ? ', ' + nome : ''}! Aqui é ${farmacia}. Estamos retornando o seu contato. Podemos conversar?`;
}

export function botaoWhatsapp(d, telefone, comTexto = false, texto = mensagemWhatsapp(d)) {
  const link = linkWhatsapp(telefone, texto);
  const rotulo = comTexto ? ' Avisar pelo WhatsApp' : '<span class="so-celular">Avisar</span>';
  if (!link) {
    return `<button type="button" class="btn ${comTexto ? '' : 'icone'} whats" disabled title="Cliente sem telefone cadastrado">${icone('brand-whatsapp')}${rotulo}</button>`;
  }
  return `<a class="btn ${comTexto ? '' : 'icone'} whats" href="${esc(link)}" target="_blank" rel="noopener" title="Avisar ${esc(d.clienteNome || 'cliente')} pelo WhatsApp" aria-label="Avisar pelo WhatsApp">${icone('brand-whatsapp')}${rotulo}</a>`;
}

// Link para registrar a próxima aplicação já preenchida com os dados desta
export function linkRegistrar(schemaId, d) {
  const p = new URLSearchParams();
  const copiar = { origem: d.id, clienteId: d.clienteId, clienteNome: d.clienteNome, medicamento: d.medicamento, lote: d.lote, validade: d.validade, via: d.via,
    local: d.local, intervalo: d.intervalo, intervaloDias: d.intervaloDias, totalDoses: d.totalDoses,
    dose: d.dose ? d.dose + 1 : '', receita: d.receita ? 'true' : '', prescritor: d.prescritor, registroProf: d.registroProf };
  for (const [k, v] of Object.entries(copiar)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  return `#/m/${schemaId}/novo?${p}`;
}

// Cartão genérico de algo com prazo: amarelo no dia, vermelho se passou.
export function cartaoPrazo({ data, titulo, sub, href, etiqueta, genero, acoes = '', atributos = '' }) {
  return `<div class="agenda ${situacaoData(data)}" ${atributos}>
    <a class="agenda-texto" href="${href}">
      <div class="linha-titulo">${etiqueta ? `<span class="etiqueta">${esc(etiqueta)}</span> ` : ''}${esc(titulo)}</div>
      <div class="linha-sub">${esc(sub || '')}</div>
    </a>
    <div class="agenda-data"><b>${ddmm(data)}</b><span>${esc(textoQuando(data, genero))}</span></div>
    <div class="agenda-acoes">${acoes}</div></div>`;
}

export function cartaoAgenda(schemaId, d, telefone, etiqueta = '') {
  const dose = d.totalDoses && d.dose ? `dose ${d.dose + 1} de ${d.totalDoses}` : d.dose ? `dose ${d.dose + 1}` : '';
  return cartaoPrazo({
    data: d.proxima, etiqueta, titulo: d.clienteNome || 'Sem cliente',
    sub: [d.medicamento, dose].filter(Boolean).join(' · '), href: `#/m/${schemaId}/${d.id}`,
    acoes: `${botaoWhatsapp(d, telefone)}
      <a class="btn icone" href="${linkRegistrar(schemaId, d)}" title="Registrar esta aplicação" aria-label="Registrar esta aplicação">${icone('check')}<span class="so-celular">Registrar</span></a>`,
  });
}

// ---------- dados ----------
export async function listarAgendadas(schemaId) {
  return db.listar(schemaId, { onde: ['agendaPendente', true], ordem: 'proxima', desc: false });
}

// Ao salvar: marca se o registro tem uma próxima aplicação em aberto.
export function prepararAgenda(vals, anterior) {
  const jaConcluida = !!anterior?.agendaConcluida && anterior.proxima === vals.proxima;
  return { ...vals, agendaPendente: !!vals.proxima && !jaConcluida, agendaConcluida: jaConcluida };
}

export const encerrarAgenda = (schemaId, id) => db.atualizar(schemaId, id, { agendaPendente: false, agendaConcluida: true });

// Depois de registrar uma aplicação, dá baixa no agendamento que ela cumpre:
// o de origem (botão "Registrar") e outros em aberto do mesmo cliente e medicamento.
export async function concluirAnteriores(schemaId, novoId, vals, origemId) {
  const ids = new Set(origemId ? [origemId] : []);
  if (vals.clienteId) {
    try {
      const doCliente = await db.listar(schemaId, { onde: ['clienteId', vals.clienteId], ordem: 'dataHora' });
      for (const a of doCliente) {
        if (a.id !== novoId && a.agendaPendente && a.dataHora < vals.dataHora
          && normalizar(a.medicamento) === normalizar(vals.medicamento)) ids.add(a.id);
      }
    } catch (e) { console.error(e); }
  }
  ids.delete(novoId);
  await Promise.all([...ids].map((id) => encerrarAgenda(schemaId, id).catch((e) => console.error(e))));
}
