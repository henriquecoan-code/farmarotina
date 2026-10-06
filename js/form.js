// Gera formulários e exibe valores a partir do "schema" de cada módulo.
import { db } from './db.js';
import { schemaPorId } from './modulos/index.js';
import { podeEditar } from './perm.js';
import {
  $, $$, esc, html, icone, agoraLocal, fmtData, fmtDataHora, fmtNum, fmtMoeda,
  normalizar, abrirDialogo, toast, mensagemErro,
} from './util.js';

export const nomeRef = (k) => k.replace(/Id$/, 'Nome');
const vazio = (x) => x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0);

// ---------- valores para exibição ----------
export function fmtValor(campo, d) {
  const v = d[campo.k];
  switch (campo.tipo) {
    case 'ref': return d[nomeRef(campo.k)] || '';
    case 'data': return fmtData(v);
    case 'datahora': return fmtDataHora(v);
    case 'num': return vazio(v) ? '' : `${fmtNum(v)}${campo.unidade ? ' ' + campo.unidade : ''}`;
    case 'moeda': return fmtMoeda(v);
    case 'simnao': return v === true ? 'Sim' : v === false ? 'Não' : '';
    case 'multi': return (v || []).join(', ');
    default: return vazio(v) ? '' : String(v);
  }
}

export const campoVisivel = (campo, d) => !campo.se || campo.se(d);

export function htmlAlerta(a) {
  if (!a) return '';
  const ic = a.nivel === 'perigo' ? 'alert-triangle' : 'alert-circle';
  return `<div class="alerta ${a.nivel}">${icone(ic)}<span>${esc(a.msg)}</span></div>`;
}

// ---------- seletor de registro relacionado (cliente, fornecedor) ----------
const cacheRef = new Map();
export function limparCacheRef(col) { cacheRef.delete(col); }
export function carregarRef(col) {
  if (!cacheRef.has(col)) {
    cacheRef.set(col, db.listar(col, { ordem: 'nome', desc: false, limite: 2000 }).catch(() => []));
  }
  return cacheRef.get(col);
}

function controleRef(campo, valor, nome, aoEscolher) {
  const alvo = schemaPorId(campo.col);
  const el = html(`<div class="ref">
    <div class="ref-entrada">${icone('search')}<input type="text" autocomplete="off" placeholder="Buscar pelo nome"></div>
    <div class="ref-lista" hidden></div></div>`);
  const input = $('input', el);
  const lista = $('.ref-lista', el);
  let sel = { id: valor || null, nome: nome || '' };
  input.value = sel.nome;
  if (sel.id) el.classList.add('escolhido');

  const escolher = (id, n, item) => {
    sel = { id, nome: n };
    input.value = n;
    el.classList.toggle('escolhido', !!id);
    lista.hidden = true;
    if (item) aoEscolher?.(item);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  async function mostrar() {
    const itens = await carregarRef(campo.col);
    const termo = normalizar(input.value);
    const achados = itens.filter((i) => normalizar(i.nome).includes(termo)).slice(0, 8);
    lista.innerHTML = '';
    for (const i of achados) {
      const extra = i.telefone || i.cnpj || '';
      const b = html(`<button type="button" class="ref-item"><span>${esc(i.nome)}</span><small>${esc(extra)}</small></button>`);
      b.onclick = () => escolher(i.id, i.nome, i);
      lista.append(b);
    }
    if (input.value.trim() && alvo && podeEditar(alvo) && !achados.some((i) => normalizar(i.nome) === termo)) {
      const b = html(`<button type="button" class="ref-item novo">${icone('plus')} Cadastrar “${esc(input.value.trim())}”</button>`);
      b.onclick = () => cadastroRapido(alvo, input.value.trim(), escolher);
      lista.append(b);
    }
    if (!lista.children.length) lista.append(html(`<div class="ref-vazio">Nenhum resultado</div>`));
    lista.hidden = false;
  }

  input.addEventListener('focus', mostrar);
  input.addEventListener('input', () => {
    sel = { id: null, nome: input.value.trim() };
    el.classList.remove('escolhido');
    mostrar();
  });
  input.addEventListener('blur', () => setTimeout(() => { lista.hidden = true; }, 200));

  return { el, get: () => sel, foco: input };
}

function cadastroRapido(schema, nome, escolher) {
  let fechar;
  const form = renderForm(schema, { nome }, {
    rotuloSalvar: 'Cadastrar',
    onCancelar: () => fechar(),
    onSalvar: async (vals) => {
      const { id } = await db.criar(schema.id, vals);
      limparCacheRef(schema.id);
      fechar();
      toast(`${vals.nome} cadastrado`, 'ok');
      escolher(id, vals.nome, vals);
    },
  });
  ({ fechar } = abrirDialogo(schema.novo, form));
}

// Aceita "4,5", "4.5" e "1.520,30". Vazio vira null; texto inválido vira NaN.
function lerNumero(s) {
  s = String(s).trim();
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

// ---------- controles por tipo ----------
function controle(campo, valor, dados, aoEscolher) {
  const k = esc(campo.k);
  switch (campo.tipo) {
    case 'textarea': {
      const el = html(`<textarea rows="${campo.linhas || 3}" name="${k}"></textarea>`);
      el.value = valor ?? '';
      return { el, get: () => el.value.trim() || null };
    }
    case 'num':
    case 'moeda': {
      const un = campo.tipo === 'moeda' ? 'R$' : campo.unidade;
      const el = html(`<div class="com-unidade ${campo.tipo === 'moeda' ? 'antes' : ''}">
        <input type="text" inputmode="decimal" name="${k}">${un ? `<span>${esc(un)}</span>` : ''}</div>`);
      const input = $('input', el);
      input.value = vazio(valor) ? '' : String(valor).replace('.', ',');
      return {
        el, foco: input,
        get: () => { const n = lerNumero(input.value); return Number.isNaN(n) ? null : n; },
        invalido: () => Number.isNaN(lerNumero(input.value)),
      };
    }
    case 'data':
    case 'datahora':
    case 'hora': {
      const tipo = { data: 'date', datahora: 'datetime-local', hora: 'time' }[campo.tipo];
      const el = html(`<input type="${tipo}" name="${k}">`);
      el.value = valor ?? '';
      return { el, get: () => el.value || null, set: (x) => { el.value = x ?? ''; } };
    }
    case 'simnao': {
      const el = html(`<label class="check"><input type="checkbox" name="${k}"><span>${esc(campo.rot)}</span></label>`);
      $('input', el).checked = valor === true;
      return { el, get: () => $('input', el).checked };
    }
    case 'multi': {
      const sel = new Set(valor || []);
      const el = html(`<div class="chips">${campo.opcoes.map((o) => `<label class="chip"><input type="checkbox" value="${esc(o)}" ${sel.has(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`);
      return { el, get: () => $$('input:checked', el).map((i) => i.value) };
    }
    case 'opcoes': {
      if (campo.opcoes.length <= 4 && !campo.lista) {
        const nomeGrupo = `${campo.k}-${Math.random().toString(36).slice(2, 7)}`;
        const el = html(`<div class="seg" role="radiogroup">${campo.opcoes.map((o) => `<label><input type="radio" name="${nomeGrupo}" value="${esc(o)}" ${o === valor ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`);
        return { el, get: () => $('input:checked', el)?.value ?? null };
      }
      const el = html(`<select name="${k}"><option value="">Selecione…</option>${campo.opcoes.map((o) => `<option ${o === valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`);
      return { el, get: () => el.value || null };
    }
    case 'ref':
      return controleRef(campo, valor, dados[nomeRef(campo.k)], aoEscolher);
    default: {
      const tipo = { tel: 'tel', email: 'email' }[campo.tipo] || 'text';
      const el = html(`<input type="${tipo}" name="${k}">`);
      el.value = valor ?? '';
      return { el, get: () => el.value.trim() || null, set: (x) => { el.value = x ?? ''; } };
    }
  }
}

// ---------- formulário ----------
export function renderForm(schema, dados = {}, { onSalvar, onCancelar, rotuloSalvar = 'Salvar' } = {}) {
  const inicial = { ...dados };
  for (const c of schema.campos) {
    if (vazio(inicial[c.k]) && c.padrao !== undefined) inicial[c.k] = typeof c.padrao === 'function' ? c.padrao() : c.padrao;
    if (vazio(inicial[c.k]) && c.tipo === 'datahora') inicial[c.k] = agoraLocal();
  }

  const form = html(`<form class="form" novalidate>
    <div class="grade"></div>
    <div class="previa-alerta"></div>
    <div class="acoes">
      <button type="button" class="btn" data-cancelar>Cancelar</button>
      <button type="submit" class="btn pri">${icone('check')} ${esc(rotuloSalvar)}</button>
    </div></form>`);
  const grade = $('.grade', form);
  const controles = [];

  for (const campo of schema.campos) {
    // tipo 'secao': só um título separando grupos de campos (não guarda valor)
    if (campo.tipo === 'secao') {
      grade.append(html(`<div class="secao-form">${campo.icone ? icone(campo.icone) : ''} ${esc(campo.rot)}</div>`));
      continue;
    }
    const ctl = controle(campo, inicial[campo.k], inicial, (item) => preencher(campo, item));
    const wrap = html(`<div class="campo ${campo.lg ? 'lg-' + campo.lg : ''}" data-k="${esc(campo.k)}"></div>`);
    if (campo.tipo !== 'simnao') {
      wrap.append(html(`<label class="rotulo">${esc(campo.rot)}${campo.obrig ? ' <b class="obrig" title="Obrigatório">*</b>' : ''}${campo.ajuda ? ` <small>${esc(campo.ajuda)}</small>` : ''}</label>`));
    }
    wrap.append(ctl.el);
    wrap.append(html(`<div class="erro-campo"></div>`));
    grade.append(wrap);
    controles.push({ campo, ctl, wrap });
  }

  function ler() {
    const v = {};
    for (const { campo, ctl } of controles) {
      if (campo.tipo === 'ref') {
        const r = ctl.get();
        v[campo.k] = r.id;
        v[nomeRef(campo.k)] = r.nome || null;
      } else {
        v[campo.k] = ctl.get();
      }
    }
    return v;
  }

  // Ao escolher um cadastro (ex.: farmácia parceira), copia dados dele para campos vazios do formulário.
  // campo.preencher = { campoDoFormulario: 'campoDoCadastro' }
  function preencher(campo, item) {
    for (const [destino, origem] of Object.entries(campo.preencher || {})) {
      const c = controles.find((x) => x.campo.k === destino);
      if (c && item[origem] && !c.ctl.get()) c.ctl.set?.(item[origem]);
    }
  }

  // Campos calculados (ex.: próxima aplicação): recalculam sozinhos até o usuário alterá-los à mão.
  const calculados = new Set(Object.keys(schema.calcular?.({}) || {}));
  const manuais = new Set();
  if (schema.calcular) {
    const calc = schema.calcular(inicial);
    for (const k of calculados) if (!vazio(inicial[k]) && inicial[k] !== calc[k]) manuais.add(k);
  }

  function atualizar() {
    const v = ler();
    if (schema.calcular) {
      for (const [k, val] of Object.entries(schema.calcular(v))) {
        if (manuais.has(k)) continue;
        controles.find((c) => c.campo.k === k)?.ctl.set?.(val);
        v[k] = val;
      }
    }
    for (const { campo, wrap } of controles) wrap.hidden = !campoVisivel(campo, v);
    $('.previa-alerta', form).innerHTML = htmlAlerta(schema.alerta?.(v));
  }
  const aoMudar = (e) => {
    const wrap = e.target.closest?.('.campo');
    if (wrap?.classList.contains('com-erro')) {
      wrap.classList.remove('com-erro');
      $('.erro-campo', wrap).textContent = '';
    }
    const k = wrap?.dataset.k;
    if (calculados.has(k)) {
      // Apagar o campo devolve o cálculo automático
      if (e.target.value) manuais.add(k);
      else manuais.delete(k);
    }
    atualizar();
  };
  form.addEventListener('input', aoMudar);
  form.addEventListener('change', aoMudar);
  atualizar();

  $('[data-cancelar]', form).onclick = () => onCancelar?.();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = ler();
    let primeiroErro = null;
    for (const { campo, ctl, wrap } of controles) {
      const erroEl = $('.erro-campo', wrap);
      erroEl.textContent = '';
      wrap.classList.remove('com-erro');
      if (!campoVisivel(campo, v)) {
        v[campo.k] = null;
        if (campo.tipo === 'ref') v[nomeRef(campo.k)] = null;
        continue;
      }
      let msg = '';
      if (ctl.invalido?.()) msg = 'Digite um número válido';
      else if (campo.obrig) {
        if (campo.tipo === 'ref' && !v[campo.k] && !(campo.livre && v[nomeRef(campo.k)])) msg = 'Escolha da lista ou cadastre';
        else if (campo.tipo === 'simnao' && v[campo.k] !== true) msg = 'Obrigatório';
        else if (campo.tipo !== 'ref' && vazio(v[campo.k])) msg = 'Obrigatório';
      }
      if (msg) {
        erroEl.textContent = msg;
        wrap.classList.add('com-erro');
        primeiroErro ??= wrap;
      }
    }
    if (primeiroErro) {
      primeiroErro.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const botao = $('button[type=submit]', form);
    botao.disabled = true;
    try {
      await onSalvar(v);
    } catch (err) {
      console.error(err);
      toast(mensagemErro(err), 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  return form;
}
