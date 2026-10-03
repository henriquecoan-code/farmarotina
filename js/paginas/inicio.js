import { db } from '../db.js';
import { podeVer, podeEditar, obterPerfilAtual } from '../perm.js';
import { schemaPorId, visiveis } from '../modulos/index.js';
import { FAIXAS, turnoAtual } from '../modulos/temperatura.js';
import { linhaRegistro } from './lista.js';
import { esc, html, icone, hoje, fmtNum, fmtDataHora } from '../util.js';

// "hoje 08:00" ou "02/10 16:00"
function quando(iso) {
  const s = fmtDataHora(iso);
  return String(iso).startsWith(hoje()) ? `hoje ${s.slice(11)}` : `${s.slice(0, 5)} ${s.slice(11)}`;
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
    <section class="cartao recentes" hidden><div class="cartao-topo"><h2>Últimos registros</h2></div><div class="lista"></div></section>
  </div>`);
  main.append(pagina);
  const metricas = pagina.querySelector('.metricas');
  const avisos = pagina.querySelector('.avisos');
  const dia = hoje();

  const [temps, afericoesHoje, atendAbertos, notasRec, inj] = await Promise.all([
    podeVer('temperatura') ? seguro(db.listar('temperatura', { limite: 30 })) : null,
    podeVer('saude') ? seguro(db.listar('afericoes', { de: dia, ate: dia })) : null,
    podeVer('atendimento') ? seguro(db.listar('atendimentos', { onde: ['status', 'Aberto'] })) : null,
    podeVer('notas') ? seguro(db.listar('notas', { limite: 200 })) : null,
    podeVer('saude') ? seguro(db.listar('injetaveis', { limite: 10 })) : null,
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
      avisos.append(html(`<a class="alerta atencao" href="#/m/temperatura/novo">${icone('temperature')}<span>Temperatura do turno da ${turno.toLowerCase()} ainda não registrada: ${esc(faltam.join(' e ').toLowerCase())}.</span>${icone('chevron-right')}</a>`));
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
  if (atendAbertos) {
    const s = schemaPorId('atendimentos');
    const atrasados = atendAbertos.filter((d) => s.alerta(d)).length;
    cards.push(cartaoNumero({
      rotulo: 'Atendimentos abertos', valor: atendAbertos.length,
      selo: atrasados ? `${atrasados} com retorno atrasado` : '', nivel: atrasados ? 'atencao' : 'ok', href: '#/m/atendimentos',
    }));
  }
  if (notasRec) {
    const s = schemaPorId('notas');
    const lembretes = notasRec.filter((n) => s.alerta(n));
    for (const n of lembretes) {
      avisos.append(html(`<a class="alerta atencao" href="#/m/notas/${n.id}">${icone('bell')}<span>${esc(n.titulo)}: ${esc(s.alerta(n).msg.toLowerCase())}</span>${icone('chevron-right')}</a>`));
    }
    cards.push(cartaoNumero({
      rotulo: 'Lembretes', valor: lembretes.length,
      selo: lembretes.length ? 'Para hoje ou atrasados' : 'Nada pendente', nivel: lembretes.length ? 'atencao' : 'ok', href: '#/m/notas',
    }));
  }
  metricas.innerHTML = cards.join('');

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
