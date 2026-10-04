import { db } from '../db.js';
import { podeVer, podeEditar, obterPerfilAtual } from '../perm.js';
import { schemaPorId, visiveis } from '../modulos/index.js';
import { FAIXAS, turnoAtual } from '../modulos/temperatura.js';
import { mensagemTroca, nomeParceiro } from '../modulos/trocas.js';
import { carregarRef } from '../form.js';
import { linhaRegistro } from './lista.js';
import {
  listarAgendadas, situacao, diasAte, telefones, cartaoAgenda, cartaoPrazo, botaoWhatsapp, mensagemRetorno,
} from '../agenda.js';
import { esc, html, icone, hoje, fmtNum, fmtDataHora, toast, mensagemErro } from '../util.js';

// "hoje 08:00" ou "02/10 16:00"
function quando(iso) {
  const s = fmtDataHora(iso);
  return String(iso).startsWith(hoje()) ? `hoje ${s.slice(11)}` : `${s.slice(0, 5)} ${s.slice(11)}`;
}

const DIAS_AGENDA = 7;
const resumo = (s, n = 80) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

// Ações rápidas dos cartões da agenda: marcam o registro como resolvido sem abrir a tela dele
const MARCAR = {
  nota: { col: 'notas', dados: { resolvido: true }, msg: 'Lembrete marcado como resolvido' },
  troca: { col: 'trocas', dados: () => schemaPorId('trocas').acaoRapida.dados(), msg: 'Troca concluída' },
};
const botaoMarcar = (tipo, id, rotulo, titulo) => `<button type="button" class="btn icone" data-marcar="${tipo}" data-id="${esc(id)}" title="${esc(titulo)}" aria-label="${esc(titulo)}">${icone('check')}<span class="so-celular">${esc(rotulo)}</span></button>`;

// Tudo que tem prazo, num lugar só: aplicações agendadas, lembretes, retornos de atendimento e trocas.
async function montarAgenda(secao, { agendadas, notasRec, atendAbertos, trocasPend }) {
  if (!agendadas && !notasRec && !atendAbertos && !trocasPend) return;
  secao.hidden = false;
  const tels = await telefones().catch(() => new Map());
  const itens = [];

  for (const d of agendadas || []) {
    itens.push({ data: d.proxima, html: cartaoAgenda('injetaveis', d, tels.get(d.clienteId), 'Aplicação') });
  }
  const podeResolverNota = podeEditar(schemaPorId('notas'));
  for (const n of (notasRec || []).filter((x) => x.lembrete && !x.resolvido)) {
    itens.push({ data: n.lembrete, html: cartaoPrazo({
      data: n.lembrete, etiqueta: 'Anotação', genero: 'o', titulo: n.titulo, sub: resumo(n.texto), href: `#/m/notas/${n.id}`,
      acoes: podeResolverNota ? botaoMarcar('nota', n.id, 'Resolvido', 'Marcar como resolvido') : '',
    }) });
  }
  const podeResolverAtend = podeEditar(schemaPorId('atendimentos'));
  for (const a of (atendAbertos || []).filter((x) => x.retorno)) {
    itens.push({ data: a.retorno, html: cartaoPrazo({
      data: a.retorno, etiqueta: 'Retorno', genero: 'o', titulo: `${a.tipo} · ${a.clienteNome || 'Sem cliente'}`,
      sub: resumo(a.descricao), href: `#/m/atendimentos/${a.id}`,
      acoes: `${a.clienteId ? botaoWhatsapp(a, tels.get(a.clienteId), false, mensagemRetorno(a)) : ''}
        ${podeResolverAtend ? `<a class="btn icone" href="#/m/atendimentos/${a.id}/editar" title="Registrar a solução" aria-label="Registrar a solução">${icone('check')}<span class="so-celular">Resolver</span></a>` : ''}`,
    }) });
  }
  const sTrocas = schemaPorId('trocas');
  const telsParceiros = trocasPend?.length
    ? new Map((await carregarRef('parceiros').catch(() => [])).map((p) => [p.id, p.telefone])) : new Map();
  for (const t of (trocasPend || []).filter((x) => x.prazo)) {
    const tel = t.telefone || telsParceiros.get(t.parceiroId);
    itens.push({ data: t.prazo, html: cartaoPrazo({
      data: t.prazo, etiqueta: 'Troca', genero: 'o', titulo: sTrocas.titulo(t), sub: `${t.tipo} · ${nomeParceiro(t)}`,
      href: `#/m/trocas/${t.id}`,
      acoes: `${tel ? botaoWhatsapp({ clienteNome: nomeParceiro(t) }, tel, false, mensagemTroca(t)) : ''}
        ${podeEditar(sTrocas) ? botaoMarcar('troca', t.id, 'Concluída', 'Marcar a troca como concluída') : ''}`,
    }) });
  }

  itens.sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const proximos = itens.filter((i) => diasAte(i.data) <= DIAS_AGENDA);
  const depois = itens.length - proximos.length;
  secao.querySelector('[data-total]').textContent = proximos.length ? `(${proximos.length})` : '';
  secao.querySelector('.agenda-lista').innerHTML = proximos.length
    ? proximos.map((i) => i.html).join('')
    : `<div class="vazio">Nada com prazo para os próximos ${DIAS_AGENDA} dias.</div>`;
  secao.querySelector('[data-mais]').textContent = depois ? `E mais ${depois} item(ns) depois disso.` : '';

  secao.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-marcar]');
    if (!b) return;
    const acao = MARCAR[b.dataset.marcar];
    b.disabled = true;
    try {
      await db.atualizar(acao.col, b.dataset.id, typeof acao.dados === 'function' ? acao.dados() : acao.dados);
      b.closest('.agenda').remove();
      toast(acao.msg, 'ok');
    } catch (err) {
      b.disabled = false;
      toast(mensagemErro(err), 'erro');
    }
  });
}

const seguro =(p) => p.catch((e) => { console.error(e); return []; });

function cartaoNumero({ rotulo, valor, selo, nivel = 'ok', href }) {
  return `<a class="metrica" href="${href}">
    <div class="metrica-rotulo">${esc(rotulo)}</div>
    <div class="metrica-valor">${valor}</div>
    ${selo ? `<span class="selo-texto ${nivel}">${esc(selo)}</span>` : ''}</a>`;
}

export async function paginaInicio(main) {
  const perfil = obterPerfilAtual();
  const primeiroNome = String(perfil.nome || '').split(/[\s(]/)[0];
  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const dataExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  main.innerHTML = '';
  const pagina = html(`<div class="pagina">
    <div class="pagina-topo"><div><h1>${saudacao}, ${esc(primeiroNome)}</h1><div class="mudo primeira-maiuscula">${esc(dataExtenso)}</div></div></div>
    <div class="avisos"></div>
    <div class="metricas"></div>
    <div class="atalhos">${visiveis().filter(podeEditar).filter((s) => s.id !== 'pops')
      .map((s) => `<a class="atalho" href="#/m/${s.id}/novo">${icone(s.icone)}<span>${esc(s.novo)}</span></a>`).join('')}</div>
    <section class="agenda-secao" data-agenda hidden>
      <div><h2>${icone('calendar-event')} Agenda <span class="mudo" data-total></span></h2>
      <p class="mudo pequeno">Atrasados, hoje e próximos ${DIAS_AGENDA} dias</p></div>
      <div class="agenda-lista"></div>
      <p class="mudo pequeno" data-mais></p>
    </section>
    <section class="cartao recentes" hidden><div class="cartao-topo"><h2>Últimos registros</h2></div><div class="lista"></div></section>
  </div>`);
  main.append(pagina);
  const metricas = pagina.querySelector('.metricas');
  const avisos = pagina.querySelector('.avisos');
  const dia = hoje();

  const [temps, afericoesHoje, atendAbertos, notasRec, inj, agendadas, trocasPend] = await Promise.all([
    podeVer('temperatura') ? seguro(db.listar('temperatura', { limite: 30 })) : null,
    podeVer('saude') ? seguro(db.listar('afericoes', { de: dia, ate: dia })) : null,
    podeVer('atendimento') ? seguro(db.listar('atendimentos', { onde: ['status', 'Aberto'] })) : null,
    podeVer('notas') ? seguro(db.listar('notas', { limite: 200 })) : null,
    podeVer('saude') ? seguro(db.listar('injetaveis', { limite: 10 })) : null,
    podeVer('saude') ? seguro(listarAgendadas('injetaveis')) : null,
    podeVer('trocas') ? seguro(db.listar('trocas', { onde: ['situacao', 'Pendente'] })) : null,
  ]);

  const cards = [];
  if (temps) {
    const sTemp = schemaPorId('temperatura');
    for (const local of Object.keys(FAIXAS)) {
      const ult = temps.find((t) => t.local === local);
      const a = ult && sTemp.alerta(ult);
      cards.push(cartaoNumero({
        rotulo: `${local} · última`,
        valor: ult ? `${fmtNum(ult.atual, 1)} °C` : '—',
        selo: ult ? (a ? 'Fora da faixa' : `Na faixa · ${quando(ult.dataHora)}`) : 'Sem registro',
        nivel: !ult ? 'atencao' : a ? 'perigo' : 'ok',
        href: ult ? `#/m/temperatura/${ult.id}` : '#/m/temperatura/novo',
      }));
    }
    const turno = turnoAtual();
    const faltam = Object.keys(FAIXAS).filter((local) => !temps.some((t) => t.local === local && t.turno === turno && String(t.dataHora).startsWith(dia)));
    if (faltam.length) {
      avisos.append(html(`<a class="alerta atencao" href="#/m/temperatura/novo?local=${encodeURIComponent(faltam[0])}">${icone('temperature')}<span>Temperatura do turno da ${turno.toLowerCase()} ainda não registrada: ${esc(faltam.join(' e ').toLowerCase())}.</span>${icone('chevron-right')}</a>`));
    }
  }
  if (afericoesHoje) {
    const s = schemaPorId('afericoes');
    const alteradas = afericoesHoje.filter((d) => s.alerta(d)).length;
    cards.push(cartaoNumero({
      rotulo: 'Aferições hoje', valor: afericoesHoje.length,
      selo: alteradas ? `${alteradas} alterada(s)` : 'Nenhuma alterada', nivel: alteradas ? 'atencao' : 'ok', href: '#/m/afericoes',
    }));
  }
  if (agendadas) {
    const deHoje = agendadas.filter((d) => situacao(d) === 'hoje').length;
    const atrasadas = agendadas.filter((d) => situacao(d) === 'atrasado').length;
    cards.push(cartaoNumero({
      rotulo: 'Aplicações agendadas', valor: agendadas.length,
      selo: [deHoje && `${deHoje} hoje`, atrasadas && `${atrasadas} atrasada(s)`].filter(Boolean).join(' · ') || 'Nada para hoje',
      nivel: atrasadas ? 'perigo' : deHoje ? 'atencao' : 'ok', href: '#/m/injetaveis',
    }));
  }
  if (atendAbertos) {
    const s = schemaPorId('atendimentos');
    const atrasados = atendAbertos.filter((d) => s.alerta(d)).length;
    cards.push(cartaoNumero({
      rotulo: 'Atendimentos abertos', valor: atendAbertos.length,
      selo: atrasados ? `${atrasados} com retorno atrasado` : '', nivel: atrasados ? 'atencao' : 'ok', href: '#/m/atendimentos',
    }));
  }
  if (trocasPend) {
    const s = schemaPorId('trocas');
    const vencidas = trocasPend.filter((t) => s.alerta(t)?.nivel === 'perigo').length;
    cards.push(cartaoNumero({
      rotulo: 'Trocas pendentes', valor: trocasPend.length,
      selo: vencidas ? `${vencidas} com prazo vencido` : '', nivel: vencidas ? 'perigo' : 'ok', href: '#/m/trocas',
    }));
  }
  if (notasRec) {
    const s = schemaPorId('notas');
    const lembretes = notasRec.filter((n) => s.alerta(n));
    cards.push(cartaoNumero({
      rotulo: 'Lembretes', valor: lembretes.length,
      selo: lembretes.length ? 'Para hoje ou atrasados' : 'Nada pendente', nivel: lembretes.length ? 'atencao' : 'ok', href: '#/m/notas',
    }));
  }
  metricas.innerHTML = cards.join('');

  await montarAgenda(pagina.querySelector('[data-agenda]'), { agendadas, notasRec, atendAbertos, trocasPend });

  const recentes = [
    ...(afericoesHoje || []).map((d) => ({ s: schemaPorId('afericoes'), d })),
    ...(inj || []).map((d) => ({ s: schemaPorId('injetaveis'), d })),
    ...(atendAbertos || []).map((d) => ({ s: schemaPorId('atendimentos'), d })),
  ].sort((a, b) => String(b.d.dataHora).localeCompare(String(a.d.dataHora))).slice(0, 6);
  if (recentes.length) {
    const sec = pagina.querySelector('.recentes');
    sec.hidden = false;
    sec.querySelector('.lista').innerHTML = recentes.map(({ s, d }) => linhaRegistro(s, d)).join('');
  }
}
