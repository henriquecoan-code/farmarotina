// Anexos salvos no próprio Firestore (plano gratuito): imagens são comprimidas no navegador
// até caber no limite de ~1 MB por documento. Outros arquivos (PDF) entram se forem pequenos.
import { db } from './db.js';
import { podeExcluir } from './perm.js';
import { $, esc, html, icone, fmtBytes, fmtDataHora, toast, mensagemErro } from './util.js';

const LIMITE = 900_000; // caracteres do data URL (~650 KB de arquivo)
const LADO_MAX = 1600;

const tamanhoDataUrl = (url) => Math.round((url.length - url.indexOf(',') - 1) * 0.75);

function lerComoDataUrl(file) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => falha(r.error);
    r.readAsDataURL(file);
  });
}

export async function comprimir(file) {
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    const bmp = await createImageBitmap(file);
    let escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      canvas.width = Math.round(bmp.width * escala);
      canvas.height = Math.round(bmp.height * escala);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      for (const q of [0.82, 0.72, 0.6, 0.5]) {
        const url = canvas.toDataURL('image/jpeg', q);
        if (url.length <= LIMITE) {
          const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          return { nome, mime: 'image/jpeg', dados: url, tamanho: tamanhoDataUrl(url), original: file.size };
        }
      }
      escala *= 0.75;
    }
    throw new Error('Não foi possível reduzir essa imagem o suficiente.');
  }
  const url = await lerComoDataUrl(file);
  if (url.length > LIMITE) {
    throw new Error(`Arquivo grande demais (${fmtBytes(file.size)}). O limite é ~650 KB. Para PDFs, tire uma foto da página.`);
  }
  return { nome: file.name, mime: file.type || 'application/octet-stream', dados: url, tamanho: file.size, original: file.size };
}

async function abrirArquivo(a) {
  const blob = await (await fetch(a.dados)).blob();
  const url = URL.createObjectURL(blob);
  const janela = window.open(url, '_blank');
  if (!janela) {
    const link = html(`<a href="${url}" download="${esc(a.nome)}"></a>`);
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Seção de anexos de um registro: lista, envio (com anotação), edição da anotação e exclusão.
export async function renderAnexos(container, col, id, { podeAnexar }) {
  container.innerHTML = '';
  const secao = html(`<section class="cartao anexos">
    <div class="cartao-topo"><h2>${icone('paperclip')} Anexos</h2></div>
    ${podeAnexar ? `<div class="anexo-novo">
      <div class="anexo-botoes">
        <label class="btn">${icone('camera')} Tirar foto<input type="file" accept="image/*" capture="environment" hidden></label>
        <label class="btn">${icone('upload')} Escolher arquivo<input type="file" accept="image/*,application/pdf" hidden></label>
      </div>
      <div class="anexo-previa" hidden></div>
    </div>` : ''}
    <div class="anexo-lista"><div class="vazio">Carregando…</div></div>
  </section>`);
  container.append(secao);
  const lista = $('.anexo-lista', secao);
  const previa = $('.anexo-previa', secao);

  async function recarregar() {
    let itens;
    try {
      itens = await db.listarAnexos(col, id);
    } catch (e) {
      lista.innerHTML = `<div class="vazio">${esc(mensagemErro(e))}</div>`;
      return;
    }
    lista.innerHTML = itens.length ? '' : '<div class="vazio">Nenhum anexo ainda.</div>';
    for (const a of itens) lista.append(itemAnexo(a));
  }

  function itemAnexo(a) {
    const ehImagem = a.mime?.startsWith('image/');
    const el = html(`<div class="anexo">
      <button type="button" class="anexo-miniatura" aria-label="Abrir ${esc(a.nome)}">
        ${ehImagem ? `<img src="${esc(a.dados)}" alt="">` : icone('file-type-pdf')}
      </button>
      <div class="anexo-info">
        <div class="anexo-nome">${esc(a.nome)} <small>· ${fmtBytes(a.tamanho || 0)}</small></div>
        <div class="anexo-nota">${a.anotacao ? esc(a.anotacao) : '<span class="mudo">Sem anotação</span>'}</div>
        <div class="anexo-meta">${esc(a.criadoPorNome || '')} · ${fmtDataHora(a.criadoLocal)}</div>
      </div>
      <div class="anexo-acoes">
        ${podeAnexar ? `<button type="button" class="btn icone" data-editar aria-label="Editar anotação">${icone('pencil')}</button>` : ''}
        ${podeExcluir() ? `<button type="button" class="btn icone perigo" data-excluir aria-label="Excluir anexo">${icone('trash')}</button>` : ''}
      </div></div>`);
    $('.anexo-miniatura', el).onclick = () => abrirArquivo(a);
    const editar = $('[data-editar]', el);
    if (editar) editar.onclick = () => {
      const nota = $('.anexo-nota', el);
      nota.innerHTML = '';
      const ta = html(`<textarea rows="2"></textarea>`);
      ta.value = a.anotacao || '';
      const salvar = html(`<button type="button" class="btn pri pequeno">Salvar anotação</button>`);
      nota.append(ta, salvar);
      ta.focus();
      salvar.onclick = async () => {
        try {
          await db.atualizarAnexo(col, id, a.id, { anotacao: ta.value.trim() });
          toast('Anotação salva', 'ok');
          recarregar();
        } catch (e) { toast(mensagemErro(e), 'erro'); }
      };
    };
    const excluir = $('[data-excluir]', el);
    if (excluir) excluir.onclick = async () => {
      if (!confirm(`Excluir o anexo "${a.nome}"? Essa ação não pode ser desfeita.`)) return;
      try {
        await db.excluirAnexo(col, id, a.id);
        toast('Anexo excluído');
        recarregar();
      } catch (e) { toast(mensagemErro(e), 'erro'); }
    };
    return el;
  }

  for (const input of secao.querySelectorAll('input[type=file]')) {
    input.onchange = async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      previa.hidden = false;
      previa.innerHTML = `<div class="vazio">${icone('loader-2 girar')} Preparando ${esc(file.name)}…</div>`;
      let arq;
      try {
        arq = await comprimir(file);
      } catch (e) {
        previa.innerHTML = `<div class="alerta perigo">${icone('alert-triangle')}<span>${esc(e.message)}</span></div>`;
        return;
      }
      const reduziu = arq.original > arq.tamanho ? ` (reduzido de ${fmtBytes(arq.original)})` : '';
      previa.innerHTML = '';
      previa.append(html(`<div class="anexo">
        <div class="anexo-miniatura">${arq.mime.startsWith('image/') ? `<img src="${arq.dados}" alt="">` : icone('file')}</div>
        <div class="anexo-info"><div class="anexo-nome">${esc(arq.nome)} <small>· ${fmtBytes(arq.tamanho)}${reduziu}</small></div>
        <textarea rows="2" placeholder="Anotação sobre o anexo (opcional)"></textarea>
        <div class="acoes"><button type="button" class="btn" data-cancelar>Cancelar</button>
        <button type="button" class="btn pri" data-enviar>${icone('paperclip')} Anexar</button></div></div></div>`));
      $('[data-cancelar]', previa).onclick = () => { previa.hidden = true; previa.innerHTML = ''; };
      $('[data-enviar]', previa).onclick = async (ev) => {
        ev.target.disabled = true;
        try {
          const { status } = await db.criarAnexo(col, id, {
            nome: arq.nome, mime: arq.mime, dados: arq.dados, tamanho: arq.tamanho,
            anotacao: $('textarea', previa).value.trim(),
          });
          toast(status === 'pendente' ? 'Anexo salvo offline; será enviado quando houver internet' : 'Anexo adicionado', 'ok');
          previa.hidden = true;
          previa.innerHTML = '';
          recarregar();
        } catch (e) {
          ev.target.disabled = false;
          toast(mensagemErro(e), 'erro');
        }
      };
    };
  }

  await recarregar();
}
