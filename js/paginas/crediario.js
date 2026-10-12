// Crediário: consulta ao banco do Trier pela ponte local (pasta ponte/), somente leitura.
// Abas: Cliente (o que tem em aberto), Recebimentos (conferência do caixa) e Em atraso.
import { db } from '../db.js';
import { DEMO, PONTE_URL, NOME_FARMACIA } from '../config.js';
import { linkWhatsapp } from '../agenda.js';
import { $, $$, esc, html, icone, fmtData, fmtMoeda, hoje, normalizar } from '../util.js';
import { demoCrediario } from './crediario-demo.js';

const ABAS = [
  { id: 'cliente', rot: 'Cliente', icone: 'user-search' },
  { id: 'recebimentos', rot: 'Recebimentos', icone: 'receipt' },
  { id: 'atrasados', rot: 'Em atraso', icone: 'alert-triangle' },
];
const estado = { busca: '', de: '', ate: '', diasAtraso: '1', filtroAtraso: '' }; // lembra os filtros enquanto o app está aberto

class PonteDesligada extends Error {}

async function api(caminho) {
  if (DEMO) return demoCrediario(caminho);
  const token = await db.tokenAcesso();
  let r;
  try {
    r = await fetch(PONTE_URL + caminho, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch {
    throw new PonteDesligada();
  }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status} na ponte do crediário.`);
  return dados;
}

const moeda = (n) => fmtMoeda(n || 0);
const soma = (l, f) => Math.round(l.reduce((s, x) => s + (typeof f === 'function' ? f(x) : x[f] || 0), 0) * 100) / 100;
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0].toLowerCase().replace(/^./, (c) => c.toUpperCase());
const hora = (h) => String(h || '').slice(0, 5);

function textoAtraso(dias) {
  if (dias > 1) return `${dias} dias de atraso`;
  if (dias === 1) return 'venceu ontem';
  if (dias === 0) return 'vence hoje';
  return dias === -1 ? 'vence amanhã' : `vence em ${-dias} dias`;
}

function telaErro(e) {
  if (e instanceof PonteDesligada) {
    return `<div class="alerta atencao cred-ponte">${icone('plug-connected-x')}<span>
      <b>O programa do crediário não está rodando neste computador.</b><br>
      Esta tela lê o sistema da farmácia por um programa instalado no próprio computador (a "ponte").
      Abra o atalho <b>Ponte do crediário</b> (ou o arquivo <code>ponte\\iniciar.bat</code>) e tente de novo.
      Ela só funciona nos computadores da farmácia em que a ponte foi instalada.</span>
      <button type="button" class="btn" data-recarregar>${icone('refresh')} Tentar de novo</button></div>`;
  }
  return `<div class="alerta perigo">${icone('alert-triangle')}<span>${esc(e.message)}</span>
    <button type="button" class="btn" data-recarregar>${icone('refresh')} Tentar de novo</button></div>`;
}

export async function paginaCrediario(main, query) {
  const aba = ABAS.some((a) => a.id === query.get('aba')) ? query.get('aba') : 'cliente';
  const clienteId = query.get('cliente');

  main.innerHTML = '';
  main.append(html(`<div class="pagina crediario">
    <div class="pagina-topo">
      <h1>${icone('wallet')} Crediário</h1>
      <div class="botoes"><button type="button" class="btn" data-imprimir title="Imprimir">${icone('printer')}<span class="some-celular"> Imprimir</span></button></div>
    </div>
    <div class="seg abas cred-abas" role="tablist">${ABAS.map((a) => `<label><input type="radio" name="cred-aba" value="${a.id}" ${a.id === aba ? 'checked' : ''}>
      <span>${icone(a.icone)} ${esc(a.rot)}</span></label>`).join('')}</div>
    <div class="cred-corpo"><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
  </div>`));

  const corpo = $('.cred-corpo', main);
  $$('input[name="cred-aba"]', main).forEach((r) => {
    r.onchange = () => { location.hash = r.value === 'cliente' ? '#/crediario' : `#/crediario?aba=${r.value}`; };
  });
  $('[data-imprimir]', main).onclick = () => window.print();
  corpo.addEventListener('click', (e) => {
    if (e.target.closest('[data-recarregar]')) window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  try {
    if (aba === 'recebimentos') await abaRecebimentos(corpo);
    else if (aba === 'atrasados') await abaAtrasados(corpo);
    else if (clienteId) await abaCliente(corpo, Number(clienteId));
    else abaBusca(corpo);
  } catch (e) {
    console.error(e);
    corpo.innerHTML = telaErro(e);
  }
}

// ---------- Cliente: busca ----------
function linhaBusca(c) {
  return `<a class="linha ${c.vencido > 0 ? 'com-alerta perigo' : ''}" href="#/crediario?cliente=${c.id}">
    <div class="linha-texto"><div class="linha-titulo">${esc(c.nome)}
      ${c.bloqueado ? '<span class="selo-texto perigo">Bloqueado</span>' : ''}${!c.ativo ? ' <span class="selo-texto">Inativo</span>' : ''}</div>
      <div class="linha-sub">Cód. ${c.id}${c.cpf ? ` · ${esc(c.cpf)}` : ''}${c.telefone ? ` · ${esc(c.telefone)}` : ''}</div></div>
    <div class="linha-valor">${c.parcelas ? `<span><b>${moeda(c.aberto)}</b>${c.vencido > 0 ? `<small class="cred-vencido">${moeda(c.vencido)} vencido</small>` : ''}</span>`
      : '<span class="mudo">nada em aberto</span>'}</div></a>`;
}

function abaBusca(corpo) {
  corpo.innerHTML = `<div class="filtros"><div class="busca">${icone('search')}
      <input type="search" placeholder="Nome, código ou CPF do cliente" value="${esc(estado.busca)}" data-busca autocomplete="off" enterkeyhint="search"></div></div>
    <div class="lista" data-resultado></div>`;
  const input = $('[data-busca]', corpo);
  const resultado = $('[data-resultado]', corpo);
  let timer, pedido = 0;

  async function buscar() {
    estado.busca = input.value;
    const termo = input.value.trim();
    if (termo.length < 2) {
      resultado.innerHTML = `<div class="vazio">${icone('user-search')} Digite pelo menos 2 letras do nome, o código ou o CPF.</div>`;
      return;
    }
    const meu = ++pedido;
    resultado.innerHTML = `<div class="vazio">${icone('loader-2 girar')} Buscando…</div>`;
    try {
      const lista = await api(`/clientes?busca=${encodeURIComponent(termo)}`);
      if (meu !== pedido) return;
      resultado.innerHTML = lista.length
        ? lista.map(linhaBusca).join('') + (lista.length >= 30 ? '<div class="vazio mudo">Mostrando os 30 primeiros. Digite mais do nome para filtrar.</div>' : '')
        : '<div class="vazio">Nenhum cliente encontrado.</div>';
    } catch (e) {
      if (meu === pedido) resultado.innerHTML = telaErro(e);
    }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(buscar, 350); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const primeiro = $('a.linha', resultado); if (primeiro) location.hash = primeiro.getAttribute('href'); }
  });
  input.focus();
  buscar();
}

// ---------- Cliente: o que tem em aberto ----------
async function abaCliente(corpo, id) {
  const { cliente: c, parcelas, pagamentos, carencia } = await api(`/clientes/${id}`);
  const total = (p) => p.valor + (p.juros || 0) + (p.multa || 0);
  const vencidas = parcelas.filter((p) => p.dias > 0);
  const zap = linkWhatsapp(c.telefone, `Olá, ${primeiroNome(c.nome)}! Aqui é ${NOME_FARMACIA ? `da ${NOME_FARMACIA}` : 'da farmácia'}.`);
  const obs = [c.obs1, c.obs2].filter((o) => o && o.trim());

  corpo.innerHTML = `<a class="voltar so-tela" href="#/crediario">${icone('arrow-left')} Buscar outro cliente</a>
    <section class="cartao cred-cliente">
      <div class="cred-cliente-topo">
        <div><h2>${esc(c.nome)}</h2>
          <div class="mudo">Cód. ${c.id}${c.cpf ? ` · ${esc(c.cpf)}` : ''}${c.telefone ? ` · ${esc(c.telefone)}` : ''}</div></div>
        <div class="botoes so-tela">${zap ? `<a class="btn whats" href="${esc(zap)}" target="_blank" rel="noopener">${icone('brand-whatsapp')} WhatsApp</a>` : ''}</div>
      </div>
      ${c.bloqueado ? `<div class="alerta perigo">${icone('lock')}<span>Cliente <b>bloqueado</b> no Trier.</span></div>` : ''}
      ${!c.ativo ? `<div class="alerta atencao">${icone('user-off')}<span>Cadastro inativo no Trier.</span></div>` : ''}
      ${obs.length ? `<div class="alerta info">${icone('info-circle')}<span>${obs.map(esc).join('<br>')}</span></div>` : ''}
      <div class="metricas cred-metricas">
        <div class="metrica"><div class="metrica-rotulo">Em aberto</div><div class="metrica-valor">${moeda(soma(parcelas, 'valor'))}</div>
          <div class="mudo pequeno">${parcelas.length} parcela(s)</div></div>
        <div class="metrica ${vencidas.length ? 'perigo' : ''}"><div class="metrica-rotulo">Vencido</div><div class="metrica-valor">${moeda(soma(vencidas, 'valor'))}</div>
          <div class="mudo pequeno">${vencidas.length} parcela(s)</div></div>
        <div class="metrica"><div class="metrica-rotulo">Juros e multa (estimado)</div><div class="metrica-valor">${moeda(soma(parcelas, (p) => (p.juros || 0) + (p.multa || 0)))}</div>
          <div class="mudo pequeno">${c.prcJuros ? `${String(c.prcJuros).replace('.', ',')}% ao dia após ${carencia} dias` : 'sem juros no cadastro'}</div></div>
        <div class="metrica"><div class="metrica-rotulo">Limite</div><div class="metrica-valor">${c.limite ? moeda(c.limite) : '—'}</div>
          <div class="mudo pequeno">${c.ultimoPagamento ? `último pagamento ${fmtData(c.ultimoPagamento)}` : ''}</div></div>
      </div>
    </section>

    ${parcelas.length ? `<section class="temp-dia cred-parcelas">
      <div class="temp-dia-titulo"><b>Parcelas em aberto</b>
        <span class="botoes so-tela"><button type="button" class="btn pequeno" data-marcar="vencidas">Marcar vencidas</button>
        <button type="button" class="btn pequeno" data-marcar="todas">Todas</button>
        <button type="button" class="btn pequeno" data-marcar="nenhuma">Limpar</button></span></div>
      <table class="mini-tabela">
        <thead><tr><th class="so-tela"></th><th>Vencimento</th><th>Nota / parcela</th><th class="some-celular">Emissão</th>
          <th class="num">Valor</th><th class="num some-celular">Juros</th><th class="num">Total hoje</th></tr></thead>
        <tbody>${parcelas.map((p, i) => `<tr class="${p.dias > 0 ? 'com-alerta vencida' : p.dias === 0 ? 'hoje' : ''}">
          <td class="so-tela"><input type="checkbox" data-i="${i}" aria-label="Marcar parcela"></td>
          <td><b>${fmtData(p.vencimento)}</b><small>${textoAtraso(p.dias)}</small></td>
          <td>${p.nota}${p.totalParcelas > 1 ? ` · ${p.parcela}/${p.totalParcelas}` : ''}${p.tipo === 'D' ? ' <span class="selo-texto">D</span>' : ''}</td>
          <td class="some-celular">${fmtData(p.emissao)}</td>
          <td class="num">${moeda(p.valor)}</td>
          <td class="num some-celular">${p.juros || p.multa ? moeda((p.juros || 0) + (p.multa || 0)) : '<span class="mudo">—</span>'}</td>
          <td class="num"><b>${moeda(total(p))}</b></td></tr>`).join('')}</tbody>
        <tfoot>
          <tr class="cred-marcadas so-tela" hidden><td></td><td colspan="2"><b data-qtd-marcadas></b></td><td class="some-celular"></td>
            <td class="num" data-marc-valor></td><td class="num some-celular" data-marc-juros></td><td class="num"><b data-marc-total></b></td></tr>
          <tr><td class="so-tela"></td><td colspan="2"><b>Total em aberto</b></td><td class="some-celular"></td>
            <td class="num">${moeda(soma(parcelas, 'valor'))}</td><td class="num some-celular">${moeda(soma(parcelas, (p) => (p.juros || 0) + (p.multa || 0)))}</td>
            <td class="num"><b>${moeda(soma(parcelas, total))}</b></td></tr>
        </tfoot>
      </table>
    </section>
    <p class="mudo pequeno">Juros calculados até hoje como estimativa (${c.prcJuros ? `${String(c.prcJuros).replace('.', ',')}% ao dia` : 'sem juros'}, só depois de ${carencia} dias de atraso). O valor final é o do caixa do Trier.</p>`
    : `<div class="vazio cartao">${icone('circle-check')} Nada em aberto no crediário.</div>`}

    ${pagamentos.length ? `<section class="temp-dia">
      <div class="temp-dia-titulo"><b>Últimos pagamentos</b></div>
      <table class="mini-tabela"><thead><tr><th>Data</th><th>Parcelas</th><th class="num">Juros</th><th class="num">Recebido</th></tr></thead>
      <tbody>${pagamentos.map((g) => `<tr><td>${fmtData(g.data)}<small>${hora(g.hora)}</small></td><td>${g.parcelas}</td>
        <td class="num">${g.encargos ? moeda(g.encargos) : '<span class="mudo">—</span>'}</td><td class="num">${moeda(g.recebido)}</td></tr>`).join('')}</tbody></table>
    </section>` : ''}`;

  // Marcar parcelas para somar o que o cliente vai pagar
  const caixas = $$('input[data-i]', corpo);
  const atualizar = () => {
    const marcadas = caixas.filter((x) => x.checked).map((x) => parcelas[x.dataset.i]);
    caixas.forEach((x) => x.closest('tr').classList.toggle('marcada', x.checked));
    const linha = $('.cred-marcadas', corpo);
    if (!linha) return;
    linha.hidden = !marcadas.length;
    $('[data-qtd-marcadas]', corpo).textContent = `${marcadas.length} marcada(s)`;
    $('[data-marc-valor]', corpo).textContent = moeda(soma(marcadas, 'valor'));
    $('[data-marc-juros]', corpo).textContent = moeda(soma(marcadas, (p) => (p.juros || 0) + (p.multa || 0)));
    $('[data-marc-total]', corpo).textContent = moeda(soma(marcadas, total));
  };
  caixas.forEach((x) => { x.onchange = atualizar; });
  $$('[data-marcar]', corpo).forEach((b) => {
    b.onclick = () => {
      caixas.forEach((x) => { x.checked = b.dataset.marcar === 'todas' || (b.dataset.marcar === 'vencidas' && parcelas[x.dataset.i].dias > 0); });
      atualizar();
    };
  });
  $$('tbody tr', corpo).forEach((tr) => {
    const x = $('input[data-i]', tr);
    if (x) tr.addEventListener('click', (e) => { if (e.target !== x) { x.checked = !x.checked; atualizar(); } });
  });
}

// ---------- Recebimentos (conferência) ----------
async function abaRecebimentos(corpo) {
  estado.de ||= hoje();
  estado.ate ||= estado.de;
  corpo.innerHTML = `<div class="filtros">
      <label class="filtro-data">De <input type="date" value="${estado.de}" data-f="de"></label>
      <label class="filtro-data">Até <input type="date" value="${estado.ate}" data-f="ate"></label>
      <button type="button" class="btn" data-hoje>Hoje</button>
      <button type="button" class="btn" data-ontem>Ontem</button>
    </div>
    <div data-resultado><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>`;
  const resultado = $('[data-resultado]', corpo);

  const carregar = async () => {
    resultado.innerHTML = `<div class="vazio">${icone('loader-2 girar')} Carregando…</div>`;
    try {
      const { recebimentos, caixas } = await api(`/recebimentos?de=${estado.de}&ate=${estado.ate}`);
      resultado.innerHTML = desenharRecebimentos(recebimentos, caixas);
    } catch (e) {
      resultado.innerHTML = telaErro(e);
    }
  };
  $$('[data-f]', corpo).forEach((el) => {
    el.onchange = () => {
      estado[el.dataset.f] = el.value;
      if (el.dataset.f === 'de' && (!estado.ate || estado.ate < el.value)) { estado.ate = el.value; $('[data-f="ate"]', corpo).value = el.value; }
      if (estado.de && estado.ate) carregar();
    };
  });
  const definirDia = (d) => { estado.de = estado.ate = d; $('[data-f="de"]', corpo).value = d; $('[data-f="ate"]', corpo).value = d; carregar(); };
  $('[data-hoje]', corpo).onclick = () => definirDia(hoje());
  $('[data-ontem]', corpo).onclick = () => { const d = new Date(`${hoje()}T12:00`); d.setDate(d.getDate() - 1); definirDia(d.toISOString().slice(0, 10)); };
  await carregar();
}

function desenharRecebimentos(lista, caixas) {
  const validos = lista.filter((r) => !r.cancelado);
  const cancelados = lista.filter((r) => r.cancelado);
  if (!lista.length) return '<div class="vazio cartao">Nenhum recebimento de crediário nesse período.</div>';
  const encargos = (r) => (r.juros || 0) + (r.multa || 0);
  const infoCaixa = new Map(caixas.map((c) => [c.caixa, c]));
  const porCaixa = new Map();
  for (const r of lista) {
    if (!porCaixa.has(r.caixa)) porCaixa.set(r.caixa, []);
    porCaixa.get(r.caixa).push(r);
  }
  const variosDias = new Set(lista.map((r) => r.data)).size > 1;

  return `<div class="metricas cred-metricas">
      <div class="metrica"><div class="metrica-rotulo">Total recebido</div><div class="metrica-valor">${moeda(soma(validos, 'recebido'))}</div>
        <div class="mudo pequeno">${validos.length} recebimento(s)</div></div>
      <div class="metrica"><div class="metrica-rotulo">Valor das parcelas</div><div class="metrica-valor">${moeda(soma(validos, 'original'))}</div>
        <div class="mudo pequeno">${soma(validos, 'parcelas')} parcela(s)</div></div>
      <div class="metrica"><div class="metrica-rotulo">Juros e multa</div><div class="metrica-valor">${moeda(soma(validos, encargos))}</div>
        <div class="mudo pequeno">${soma(validos, 'desconto') ? `descontos ${moeda(soma(validos, 'desconto'))}` : 'sem descontos'}</div></div>
      ${cancelados.length ? `<div class="metrica perigo"><div class="metrica-rotulo">Cancelados</div><div class="metrica-valor">${moeda(soma(cancelados, 'recebido'))}</div>
        <div class="mudo pequeno">${cancelados.length} — fora do total</div></div>` : ''}
    </div>
    ${[...porCaixa.entries()].map(([num, rs]) => {
      const cx = infoCaixa.get(num);
      const ok = rs.filter((r) => !r.cancelado);
      return `<section class="temp-dia">
        <div class="temp-dia-titulo"><b>Caixa ${num ?? '—'}</b>
          <span class="mudo">${cx ? `aberto ${fmtData(cx.abertoEm).slice(0, 5)} ${hora(cx.abertoAs)}${cx.fechadoEm ? ` · fechado ${fmtData(cx.fechadoEm).slice(0, 5)} ${hora(cx.fechadoAs)}` : ' · aberto agora'}` : ''}</span>
          <span class="cred-subtotal">${moeda(soma(ok, 'recebido'))}</span></div>
        <table class="mini-tabela">
          <thead><tr><th>Hora</th><th>Cliente</th><th class="num some-celular">Parcelas</th><th class="num some-celular">Valor</th><th class="num">Juros</th><th class="num">Recebido</th></tr></thead>
          <tbody>${rs.map((r) => `<tr class="${r.cancelado ? 'cancelado' : ''}" data-href="#/crediario?cliente=${r.clienteId}">
            <td>${variosDias ? `${fmtData(r.data).slice(0, 5)} ` : ''}${hora(r.hora)}</td>
            <td><a href="#/crediario?cliente=${r.clienteId}">${esc(r.cliente || `Cliente ${r.clienteId}`)}</a>
              ${r.cancelado ? '<small class="cred-vencido">recebimento cancelado</small>' : ''}</td>
            <td class="num some-celular">${r.parcelas}</td>
            <td class="num some-celular">${moeda(r.original)}</td>
            <td class="num">${encargos(r) ? moeda(encargos(r)) : '<span class="mudo">—</span>'}</td>
            <td class="num"><b>${moeda(r.recebido)}</b></td></tr>`).join('')}</tbody>
        </table></section>`;
    }).join('')}`;
}

// ---------- Em atraso ----------
async function abaAtrasados(corpo) {
  corpo.innerHTML = `<div class="filtros">
      <div class="busca">${icone('search')}<input type="search" placeholder="Filtrar por nome" value="${esc(estado.filtroAtraso)}" data-filtro></div>
      <label class="filtro-data">Atrasado há
        <select data-dias>${[['1', '1 dia ou mais'], ['30', '30+ dias'], ['60', '60+ dias'], ['90', '90+ dias'], ['180', '180+ dias'], ['365', '1 ano ou mais']]
          .map(([v, t]) => `<option value="${v}" ${estado.diasAtraso === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div data-resultado><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>`;
  const resultado = $('[data-resultado]', corpo);
  let lista = [];

  const desenhar = () => {
    const termo = normalizar(estado.filtroAtraso.trim());
    const vis = termo ? lista.filter((c) => normalizar(c.nome).includes(termo)) : lista;
    if (!lista.length) { resultado.innerHTML = '<div class="vazio cartao">Nenhum cliente em atraso. 🎉</div>'; return; }
    const farmacia = NOME_FARMACIA ? `da ${NOME_FARMACIA}` : 'da farmácia';
    resultado.innerHTML = `<div class="metricas cred-metricas">
        <div class="metrica perigo"><div class="metrica-rotulo">Total vencido</div><div class="metrica-valor">${moeda(soma(vis, 'vencido'))}</div></div>
        <div class="metrica"><div class="metrica-rotulo">Clientes</div><div class="metrica-valor">${vis.length}</div></div>
        <div class="metrica"><div class="metrica-rotulo">Parcelas vencidas</div><div class="metrica-valor">${soma(vis, 'parcelas')}</div></div>
      </div>
      <section class="temp-dia"><table class="mini-tabela">
        <thead><tr><th>Cliente</th><th>Mais antiga</th><th class="num some-celular">Parcelas</th><th class="num">Vencido</th><th class="some-celular">Último pagto.</th><th class="so-tela"></th></tr></thead>
        <tbody>${vis.map((c) => {
          const zap = linkWhatsapp(c.telefone, `Olá, ${primeiroNome(c.nome)}! Aqui é ${farmacia}. Consta no seu crediário um valor em aberto desde ${fmtData(c.maisAntigo)}. Quando puder, passe na farmácia ou fale com a gente por aqui para combinarmos. Obrigado!`);
          return `<tr data-href="#/crediario?cliente=${c.id}">
            <td><a href="#/crediario?cliente=${c.id}">${esc(c.nome || `Cliente ${c.id}`)}</a>${c.bloqueado ? ' <span class="selo-texto perigo">Bloqueado</span>' : ''}<small>Cód. ${c.id}</small></td>
            <td>${fmtData(c.maisAntigo)}<small>${c.dias} dias</small></td>
            <td class="num some-celular">${c.parcelas}</td>
            <td class="num"><b>${moeda(c.vencido)}</b></td>
            <td class="some-celular">${c.ultimoPagamento ? fmtData(c.ultimoPagamento) : '<span class="mudo">—</span>'}</td>
            <td class="so-tela">${zap ? `<a class="btn icone whats" href="${esc(zap)}" target="_blank" rel="noopener" title="Cobrar pelo WhatsApp" aria-label="Cobrar pelo WhatsApp">${icone('brand-whatsapp')}</a>` : ''}</td></tr>`;
        }).join('')}</tbody></table></section>`;
  };

  const carregar = async () => {
    resultado.innerHTML = `<div class="vazio">${icone('loader-2 girar')} Carregando…</div>`;
    try {
      lista = await api(`/atrasados?dias=${estado.diasAtraso}`);
      desenhar();
    } catch (e) {
      resultado.innerHTML = telaErro(e);
    }
  };
  $('[data-dias]', corpo).onchange = (e) => { estado.diasAtraso = e.target.value; carregar(); };
  $('[data-filtro]', corpo).oninput = (e) => { estado.filtroAtraso = e.target.value; desenhar(); };
  await carregar();
}
