// Orçamento: produtos e preços do Trier (pela ponte), valor no crediário (preço com o desconto padrão do sistema)
// e à vista (com um desconto extra, por item ou geral). Os orçamentos ficam salvos no FarmaRotina (coleção orcamentos).
// Endereços: orcamento.html (lista) · #novo · #id=<id>
import { db } from '../../js/db.js';
import * as config from '../../js/config.js';
import { podeExcluir } from '../../js/perm.js';
import {
  $, $$, esc, html, icone, fmtData, fmtDataHora, fmtMoeda, fmtNum, agoraLocal, hoje, toast, mensagemErro, normalizar, abrirDialogo,
} from '../../js/util.js';
import { iniciar, api as apiPonte, telaErro } from './comum.js';

const COL = 'orcamentos';
const api = (caminho) => apiPonte(caminho, 'orcamento');
const SITUACOES = ['Aberto', 'Aprovado', 'Não aprovado'];
const VALIDADES = [3, 7, 15, 30];

const cent = (n) => Math.round((Number(n) || 0) * 100) / 100;
const moeda = (n) => fmtMoeda(cent(n));
const pct = (n) => `${fmtNum(n || 0, 1)}%`;
// "4,5", "4.5" e "1.250,90" viram número; vazio ou inválido → 0
const numero = (s) => {
  let t = String(s ?? '').trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
const somarDias = (iso, n) => { const d = new Date(`${iso.slice(0, 10)}T12:00`); d.setDate(d.getDate() + n); return agoraLocal(d).slice(0, 10); };

// ---------- contas ----------
const unitVista = (it) => cent(it.credito * (1 - (it.descVista || 0) / 100));
const subCred = (it) => cent(it.credito * it.qtd);
const subVista = (it) => cent(unitVista(it) * it.qtd);
// Desconto total sobre o preço cheio, para comparar com o desconto máximo do cadastro
const descTotal = (it) => (it.pmc > 0 ? (1 - unitVista(it) / it.pmc) * 100 : 0);
const passouMaximo = (it) => it.descMax > 0 && descTotal(it) > it.descMax + 0.05;

function totais(itens) {
  const credito = cent(itens.reduce((s, it) => s + subCred(it), 0));
  const vista = cent(itens.reduce((s, it) => s + subVista(it), 0));
  const cheio = cent(itens.reduce((s, it) => s + cent((it.pmc || it.credito) * it.qtd), 0));
  return { credito, vista, cheio, economia: cent(credito - vista) };
}

// ---------- WhatsApp e impressão ----------
function mensagem(o) {
  const t = totais(o.itens);
  const nome = String(o.clienteNome || '').trim().split(/\s+/)[0];
  const farmacia = config.NOME_FARMACIA || 'farmácia';
  const linhas = o.itens.map((it) => `• ${fmtNum(it.qtd, 0)}x ${it.nome} — ${moeda(subCred(it))}`);
  // Preço cheio (PMC sem desconto) riscado no WhatsApp (~texto~), para mostrar o quanto o cliente economiza
  const cheio = t.cheio > t.credito ? [`Preço cheio (sem desconto): ~${moeda(t.cheio)}~`] : [];
  const valores = t.economia > 0
    ? [...cheio, `*Crediário:* ${moeda(t.credito)}`, `*À vista:* ${moeda(t.vista)} (economia de ${moeda(t.economia)})`]
    : [...cheio, `*Total:* ${moeda(t.credito)}`];
  return [`Olá${nome ? ', ' + nome : ''}! Segue o orçamento da ${farmacia} (${fmtData(o.dataHora || hoje())}):`, '',
    ...linhas, '', ...valores, '',
    `Orçamento válido até ${fmtData(o.validade || somarDias(o.dataHora || hoje(), o.validadeDias || 7))}. Qualquer dúvida, é só responder esta mensagem.`].join('\n');
}

function linkWhatsapp(telefone, texto) {
  let num = String(telefone || '').replace(/\D/g, '');
  if (num.length >= 10 && num.length <= 11) num = '55' + num;
  // Sem telefone, o WhatsApp abre para escolher o contato
  return `https://wa.me/${num.length >= 12 ? num : ''}?text=${encodeURIComponent(texto)}`;
}

function imprimir(o) {
  const t = totais(o.itens);
  const area = html(`<div class="area-impressao">
    <h1>Orçamento · ${esc(config.NOME_FARMACIA || config.NOME_APP)}</h1>
    <p>${o.clienteNome ? `Cliente: <b>${esc(o.clienteNome)}</b> · ` : ''}${fmtData(o.dataHora || hoje())} · válido até ${fmtData(o.validade || somarDias(hoje(), o.validadeDias || 7))}</p>
    <table><thead><tr><th>Produto</th><th>Qtd</th><th>Crediário</th><th>À vista</th></tr></thead>
    <tbody>${o.itens.map((it) => `<tr><td>${esc(it.nome)}${it.laboratorio ? ` <small>(${esc(it.laboratorio)})</small>` : ''}</td>
      <td>${fmtNum(it.qtd, 0)}</td><td>${moeda(subCred(it))}</td><td>${moeda(subVista(it))}</td></tr>`).join('')}</tbody>
    <tfoot>${t.cheio > t.credito ? `<tr><td colspan="2">Preço cheio (sem desconto)</td><td colspan="2"><s>${moeda(t.cheio)}</s></td></tr>` : ''}
    <tr><th colspan="2">Total</th><th>${moeda(t.credito)}</th><th>${moeda(t.vista)}</th></tr></tfoot></table>
    ${o.obs ? `<p>${esc(o.obs)}</p>` : ''}
  </div>`);
  document.body.append(area);
  document.body.classList.add('imprimindo');
  window.addEventListener('afterprint', () => { area.remove(); document.body.classList.remove('imprimindo'); }, { once: true });
  window.print();
}

// ---------- lista ----------
async function paginaLista(main) {
  main.innerHTML = '';
  main.append(html(`<div class="pagina orcamento">
    <div class="pagina-topo"><h1>${icone('file-dollar')} Orçamentos</h1>
      <a class="btn pri" href="#novo">${icone('plus')} Novo orçamento</a></div>
    <div class="filtros"><div class="busca">${icone('search')}<input type="search" placeholder="Buscar pelo cliente" data-busca></div></div>
    <div class="lista"><div class="vazio">${icone('loader-2 girar')} Carregando…</div></div>
  </div>`));
  const lista = $('.lista', main);
  let docs = [];
  try {
    docs = await db.listar(COL, { ordem: 'dataHora', desc: true, limite: 200 });
  } catch (e) {
    lista.innerHTML = `<div class="vazio">${esc(mensagemErro(e))}</div>`;
    return;
  }
  const desenhar = () => {
    const termo = normalizar($('[data-busca]', main).value);
    const filtrados = docs.filter((d) => !termo || normalizar(`${d.clienteNome} ${d.telefone}`).includes(termo));
    lista.innerHTML = filtrados.length ? filtrados.map((d) => {
      const vencido = d.situacao === 'Aberto' && d.validade && d.validade < hoje();
      const selo = vencido ? ['atencao', 'Vencido'] : d.situacao === 'Aprovado' ? ['ok', 'Aprovado'] : d.situacao === 'Não aprovado' ? ['perigo', 'Não aprovado'] : ['info', 'Aberto'];
      return `<a class="linha" href="#id=${esc(d.id)}">
        <div class="linha-texto"><div class="linha-titulo">${esc(d.clienteNome || 'Cliente não informado')}</div>
        <div class="linha-sub">${fmtDataHora(d.dataHora)} · ${d.nItens || 0} item(ns) · ${esc(d.criadoPorNome || '')}</div></div>
        <div class="linha-valor"><span class="orc-lista-valores"><small>Cred. ${moeda(d.totalCrediario)}</small><b>À vista ${moeda(d.totalVista)}</b></span>
        <span class="selo-texto ${selo[0]}">${selo[1]}</span></div></a>`;
    }).join('') : `<div class="vazio">${docs.length ? 'Nenhum orçamento com esse nome.' : 'Nenhum orçamento ainda. Toque em "Novo orçamento".'}</div>`;
  };
  $('[data-busca]', main).addEventListener('input', desenhar);
  desenhar();
}

// ---------- editor ----------
function novoOrcamento() {
  return { clienteNome: '', telefone: '', validadeDias: 7, obs: '', situacao: 'Aberto', descontoGeral: 0, itens: [] };
}

async function paginaEditor(main, id, base) {
  let o = base || novoOrcamento();
  if (id) {
    const d = await db.obter(COL, id);
    if (!d) { main.innerHTML = '<div class="pagina"><div class="vazio">Orçamento não encontrado. <a href="#">Voltar</a></div></div>'; return; }
    o = { ...novoOrcamento(), ...d };
  }
  let alterado = !!base;

  main.innerHTML = '';
  const pagina = html(`<div class="pagina orcamento">
    <a class="voltar" href="#" data-voltar>${icone('arrow-left')} Orçamentos</a>
    <div class="pagina-topo"><h1>${icone('file-dollar')} ${id ? 'Orçamento' : 'Novo orçamento'}</h1>
      <div class="botoes">${id ? `<button type="button" class="btn" data-duplicar>${icone('copy')} Duplicar</button>` : ''}
      ${id && podeExcluir() ? `<button type="button" class="btn perigo" data-excluir>${icone('trash')} Excluir</button>` : ''}</div></div>

    <section class="cartao">
      <div class="grade">
        <div class="campo lg-m"><label class="rotulo">Cliente</label><input data-c="clienteNome" autocomplete="off" placeholder="Nome do cliente"></div>
        <div class="campo lg-m"><label class="rotulo">Telefone / WhatsApp</label><input data-c="telefone" type="tel" placeholder="(11) 98888-1234"></div>
        <div class="campo lg-m"><label class="rotulo">Validade</label><select data-c="validadeDias">${VALIDADES.map((n) => `<option value="${n}">${n} dias</option>`).join('')}</select></div>
        <div class="campo lg-m"><label class="rotulo">Situação</label><select data-c="situacao">${SITUACOES.map((s) => `<option>${s}</option>`).join('')}</select></div>
      </div>
    </section>

    <section class="cartao">
      <div class="cartao-topo"><h2>${icone('pill')} Produtos</h2>
        <div class="botoes">${id ? `<button type="button" class="btn pequeno" data-atualizar title="Buscar os preços atuais no sistema">${icone('refresh')} Atualizar preços</button>` : ''}
        <button type="button" class="btn pequeno" data-avulso>${icone('plus')} Item avulso</button></div></div>
      <div class="orc-busca"><div class="busca">${icone('search')}<input type="search" data-busca autocomplete="off" placeholder="Buscar produto pelo nome, código ou código de barras"></div>
        <div class="orc-resultados" hidden></div></div>
      <div class="orc-itens"></div>
    </section>

    <section class="cartao orc-resumo">
      <div class="orc-geral">
        <label class="rotulo" for="orc-geral">Desconto à vista para todos os itens</label>
        <div class="orc-geral-campo"><div class="com-unidade"><input id="orc-geral" inputmode="decimal" data-geral><span>%</span></div>
        <button type="button" class="btn" data-aplicar>${icone('check')} Aplicar a todos</button></div>
      </div>
      <div class="orc-totais"></div>
      <div class="campo"><label class="rotulo">Observações</label><textarea rows="2" data-c="obs" placeholder="Aparece na impressão"></textarea></div>
      <div class="acoes">
        <button type="button" class="btn" data-imprimir>${icone('printer')} Imprimir</button>
        <button type="button" class="btn whats" data-whats>${icone('brand-whatsapp')} Enviar pelo WhatsApp</button>
        <button type="button" class="btn pri" data-salvar>${icone('check')} Salvar</button>
      </div>
    </section>
  </div>`);
  main.append(pagina);

  // Campos do cabeçalho
  for (const el of $$('[data-c]', pagina)) {
    el.value = o[el.dataset.c] ?? '';
    el.addEventListener('input', () => {
      o[el.dataset.c] = el.dataset.c === 'validadeDias' ? Number(el.value) : el.value;
      alterado = true;
    });
  }
  $('[data-geral]', pagina).value = o.descontoGeral ? String(o.descontoGeral).replace('.', ',') : '';

  const itensEl = $('.orc-itens', pagina);
  const totaisEl = $('.orc-totais', pagina);

  function desenharTotais() {
    const t = totais(o.itens);
    totaisEl.innerHTML = `<div class="orc-total"><span>Crediário</span><b>${moeda(t.credito)}</b></div>
      <div class="orc-total vista"><span>À vista</span><b>${moeda(t.vista)}</b>${t.economia > 0 ? `<small>economia de ${moeda(t.economia)}</small>` : ''}</div>
      ${t.cheio > t.credito ? `<div class="orc-total cheio"><span>Preço cheio (PMC)</span><s>${moeda(t.cheio)}</s></div>` : ''}`;
  }

  function atualizarLinha(i) {
    const it = o.itens[i];
    const linha = itensEl.querySelector(`[data-i="${i}"]`);
    if (!linha) return;
    $('[data-sub-cred]', linha).textContent = moeda(subCred(it));
    $('[data-sub-vista]', linha).textContent = moeda(subVista(it));
    $('[data-aviso]', linha).innerHTML = passouMaximo(it)
      ? `${icone('alert-triangle')} Desconto total de ${pct(descTotal(it))} sobre o preço cheio passa do máximo do cadastro (${pct(it.descMax)}).` : '';
    desenharTotais();
  }

  function desenharItens() {
    itensEl.innerHTML = o.itens.length ? o.itens.map((it, i) => `<div class="orc-item" data-i="${i}">
      <div class="orc-item-nome"><b>${esc(it.nome)}</b>
        <small>${[it.laboratorio, it.id ? `cód. ${it.id}` : 'avulso', it.estoque != null ? `estoque ${fmtNum(it.estoque, 0)}` : ''].filter(Boolean).map(esc).join(' · ')}</small></div>
      <div class="orc-qtd" aria-label="Quantidade">
        <button type="button" class="btn icone" data-menos aria-label="Diminuir">${icone('minus')}</button>
        <input data-qtd inputmode="numeric" value="${fmtNum(it.qtd, 0)}" aria-label="Quantidade">
        <button type="button" class="btn icone" data-mais aria-label="Aumentar">${icone('plus')}</button></div>
      <div class="orc-preco"><small>Crediário un.</small>
        ${it.id ? `<b>${moeda(it.credito)}</b>${it.pmc > it.credito ? `<s class="mudo">${moeda(it.pmc)}</s>` : ''}`
          : `<div class="com-unidade antes"><input data-preco inputmode="decimal" value="${fmtNum(it.credito, 2)}"><span>R$</span></div>`}</div>
      <div class="orc-desc"><small>Desc. à vista</small><div class="com-unidade"><input data-desc inputmode="decimal" value="${it.descVista ? fmtNum(it.descVista, 2) : ''}" placeholder="0"><span>%</span></div></div>
      <div class="orc-sub"><small>Cred. <span data-sub-cred></span></small><b>À vista <span data-sub-vista></span></b></div>
      <button type="button" class="btn icone perigo orc-remover" data-remover aria-label="Remover ${esc(it.nome)}">${icone('x')}</button>
      <div class="orc-aviso" data-aviso></div>
    </div>`).join('') : `<div class="vazio">Busque um produto acima para adicionar ao orçamento.</div>`;
    o.itens.forEach((_, i) => atualizarLinha(i));
    desenharTotais();
  }

  itensEl.addEventListener('input', (e) => {
    const linha = e.target.closest('[data-i]');
    if (!linha) return;
    const it = o.itens[Number(linha.dataset.i)];
    if (e.target.matches('[data-qtd]')) it.qtd = Math.max(1, Math.round(numero(e.target.value)) || 1);
    if (e.target.matches('[data-desc]')) it.descVista = Math.min(100, Math.max(0, numero(e.target.value)));
    if (e.target.matches('[data-preco]')) it.credito = it.pmc = Math.max(0, numero(e.target.value));
    alterado = true;
    atualizarLinha(Number(linha.dataset.i));
  });
  itensEl.addEventListener('click', (e) => {
    const linha = e.target.closest('[data-i]');
    if (!linha) return;
    const i = Number(linha.dataset.i);
    const it = o.itens[i];
    if (e.target.closest('[data-remover]')) { o.itens.splice(i, 1); alterado = true; desenharItens(); return; }
    const passo = e.target.closest('[data-mais]') ? 1 : e.target.closest('[data-menos]') ? -1 : 0;
    if (!passo) return;
    it.qtd = Math.max(1, (it.qtd || 1) + passo);
    $('[data-qtd]', linha).value = it.qtd;
    alterado = true;
    atualizarLinha(i);
  });

  function adicionar(p) {
    const existente = o.itens.find((it) => it.id && it.id === p.id);
    if (existente) existente.qtd += 1;
    else {
      o.itens.push({ id: p.id, nome: p.nome, laboratorio: p.laboratorio || '', estoque: p.estoque ?? null, qtd: 1,
        pmc: Number(p.pmc) || Number(p.venda) || 0, credito: Number(p.venda) || 0, descVista: o.descontoGeral || 0,
        descMax: p.descontoMaximo ?? null });
    }
    alterado = true;
    desenharItens();
    if (!p.estoque && p.id) toast(`${p.nome}: sem estoque no momento`, 'erro');
  }

  // Busca de produtos no Trier
  const busca = $('[data-busca]', pagina);
  const resultados = $('.orc-resultados', pagina);
  let espera;
  let ultimos = [];
  const fecharResultados = () => { resultados.hidden = true; };
  busca.addEventListener('input', () => {
    clearTimeout(espera);
    const termo = busca.value.trim();
    if (termo.length < 2) { fecharResultados(); return; }
    espera = setTimeout(async () => {
      resultados.hidden = false;
      resultados.innerHTML = `<div class="vazio">${icone('loader-2 girar')} Buscando…</div>`;
      try {
        ultimos = await api(`/orcamento/produtos?busca=${encodeURIComponent(termo)}`);
        if (busca.value.trim() !== termo) return;
        resultados.innerHTML = ultimos.length ? ultimos.map((p, i) => `<button type="button" class="orc-resultado" data-r="${i}">
          <span class="orc-r-nome"><b>${esc(p.nome)}</b><small>${esc(p.laboratorio || '')} · cód. ${p.id}</small></span>
          <span class="orc-r-est ${p.estoque > 0 ? 'prod-tem' : 'prod-zero'}">${fmtNum(p.estoque || 0, 0)} <small>est.</small></span>
          <span class="orc-r-preco">${p.pmc > p.venda ? `<s class="mudo">${moeda(p.pmc)}</s> ` : ''}<b>${moeda(p.venda)}</b></span></button>`).join('')
          : '<div class="vazio">Nenhum produto encontrado.</div>';
      } catch (e) {
        resultados.innerHTML = telaErro(e);
      }
    }, 350);
  });
  busca.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharResultados(); });
  resultados.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    adicionar(ultimos[Number(b.dataset.r)]);
    busca.value = '';
    fecharResultados();
    busca.focus();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.orc-busca')) fecharResultados(); });

  // Item avulso (produto que não está no sistema, ou com a ponte desligada)
  $('[data-avulso]', pagina).onclick = () => {
    const form = html(`<form class="form" novalidate>
      <div class="campo"><label class="rotulo">Produto</label><input data-n required></div>
      <div class="campo"><label class="rotulo">Preço no crediário (unidade)</label><div class="com-unidade antes"><input data-p inputmode="decimal"><span>R$</span></div></div>
      <div class="erro-form"></div>
      <div class="acoes"><button type="submit" class="btn pri">${icone('plus')} Adicionar</button></div></form>`);
    const { fechar } = abrirDialogo('Item avulso', form);
    $('[data-n]', form).focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = $('[data-n]', form).value.trim();
      const preco = numero($('[data-p]', form).value);
      if (!nome || !(preco > 0)) { $('.erro-form', form).textContent = 'Informe o produto e o preço.'; return; }
      adicionar({ id: null, nome, pmc: preco, venda: preco, estoque: null });
      fechar();
    });
  };

  // Desconto geral
  $('[data-aplicar]', pagina).onclick = () => {
    const d = Math.min(100, Math.max(0, numero($('[data-geral]', pagina).value)));
    o.descontoGeral = d;
    o.itens.forEach((it) => { it.descVista = d; });
    alterado = true;
    desenharItens();
    toast(`Desconto à vista de ${pct(d)} aplicado a todos os itens`, 'ok');
  };

  // Preços atuais do sistema (para orçamentos antigos)
  const btnAtualizar = $('[data-atualizar]', pagina);
  if (btnAtualizar) btnAtualizar.onclick = async () => {
    btnAtualizar.disabled = true;
    let mudou = 0;
    try {
      for (const it of o.itens.filter((x) => x.id)) {
        const achado = (await api(`/orcamento/produtos?busca=${it.id}`)).find((p) => p.id === it.id);
        if (achado && (achado.venda !== it.credito || achado.pmc !== it.pmc)) {
          Object.assign(it, { pmc: achado.pmc, credito: achado.venda, estoque: achado.estoque, descMax: achado.descontoMaximo });
          mudou++;
        }
      }
      alterado = alterado || mudou > 0;
      desenharItens();
      toast(mudou ? `${mudou} preço(s) atualizado(s). Salve para guardar.` : 'Os preços continuam os mesmos.', 'ok');
    } catch (e) {
      toast(e.message || mensagemErro(e), 'erro');
    } finally { btnAtualizar.disabled = false; }
  };

  async function salvar() {
    if (!o.itens.length) { toast('Adicione pelo menos um produto.', 'erro'); return false; }
    const t = totais(o.itens);
    o.dataHora = o.dataHora || agoraLocal();
    const dados = {
      dataHora: o.dataHora, clienteNome: o.clienteNome.trim(), telefone: o.telefone.trim(), validadeDias: o.validadeDias,
      validade: somarDias(o.dataHora, o.validadeDias || 7), obs: o.obs.trim(), situacao: o.situacao, descontoGeral: o.descontoGeral || 0,
      itens: o.itens.map(({ id, nome, laboratorio, estoque, qtd, pmc, credito, descVista, descMax }) => ({
        id: id ?? null, nome, laboratorio: laboratorio || '', estoque: estoque ?? null, qtd, pmc, credito, descVista: descVista || 0, descMax: descMax ?? null })),
      nItens: o.itens.length, totalCrediario: t.credito, totalVista: t.vista,
    };
    try {
      if (o.id) await db.atualizar(COL, o.id, dados);
      else {
        const { id: novo } = await db.criar(COL, dados);
        o.id = novo;
        history.replaceState(null, '', `#id=${novo}`);
      }
      o.validade = dados.validade;
      alterado = false;
      toast('Orçamento salvo', 'ok');
      return true;
    } catch (e) {
      toast(mensagemErro(e), 'erro');
      return false;
    }
  }

  $('[data-salvar]', pagina).onclick = salvar;
  $('[data-whats]', pagina).onclick = async () => {
    // Abre a janela antes de salvar para o navegador não bloquear o pop-up
    const janela = window.open('', '_blank');
    if (!(await salvar())) { janela?.close(); return; }
    const link = linkWhatsapp(o.telefone, mensagem(o));
    if (janela) janela.location.href = link; else location.href = link;
  };
  $('[data-imprimir]', pagina).onclick = () => { if (o.itens.length) imprimir(o); else toast('Adicione pelo menos um produto.', 'erro'); };
  const duplicar = $('[data-duplicar]', pagina);
  if (duplicar) duplicar.onclick = () => {
    const copia = { ...novoOrcamento(), clienteNome: o.clienteNome, telefone: o.telefone, validadeDias: o.validadeDias,
      descontoGeral: o.descontoGeral, obs: o.obs, itens: o.itens.map((it) => ({ ...it })) };
    history.pushState(null, '', '#novo');
    paginaEditor(main, null, copia);
    toast('Cópia criada. Confira os preços e salve.', 'ok');
  };
  const excluir = $('[data-excluir]', pagina);
  if (excluir) excluir.onclick = async () => {
    if (!confirm('Excluir este orçamento? Essa ação não pode ser desfeita.')) return;
    try { await db.excluir(COL, o.id); toast('Orçamento excluído'); location.hash = ''; } catch (e) { toast(mensagemErro(e), 'erro'); }
  };
  $('[data-voltar]', pagina).addEventListener('click', (e) => {
    if (alterado && !confirm('Sair sem salvar as alterações?')) e.preventDefault();
  });

  desenharItens();
  if (!id) busca.focus();
}

// ---------- rotas ----------
async function rotear(main) {
  const h = location.hash.slice(1);
  const q = new URLSearchParams(h);
  window.scrollTo(0, 0);
  try {
    if (h === 'novo') return await paginaEditor(main, null);
    if (q.get('id')) return await paginaEditor(main, q.get('id'));
    return await paginaLista(main);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="pagina">${telaErro(e)}</div>`;
  }
}

iniciar({
  atual: 'orcamento',
  modulos: ['orcamento'],
  titulo: 'o Orçamento',
  montar: async (main) => {
    window.addEventListener('hashchange', () => rotear(main));
    await rotear(main);
  },
});
