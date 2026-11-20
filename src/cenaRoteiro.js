// src/cenaRoteiro.js
// ── ROTEIRO DE CENAS (aba "Roteiro" do painel de src/cenaFx.js) ──────────────
//
// O mestre monta antes da mesa: SESSÕES, cada uma com uma lista de CENAS em
// ordem. Uma cena é uma imagem (ou nenhuma, para manter a que está na tela) +
// uma transição + o conjunto de efeitos contínuos que vale nela. Na mesa, é
// clicar na cena ou em "Próxima".
//
// Fica no computador do mestre, fora de qualquer sala:
//     <userData>/roteiro/sessoes.json
//     <userData>/roteiro/imagens/<id>.<ext>
// As imagens só sobem para o servidor quando há sala aberta (vão para a pasta
// da sala e somem quando ela fecha, como qualquer cena). Para a troca não
// esperar pelo upload, a sessão escolhida é enviada aos poucos em segundo plano.

const fs = require('fs')
const path = require('path')
const { ipcRenderer } = require('electron')
const state = require('./state')
const fx = require('./cenaFx')
const { enviarArquivoDaSala } = require('./scene')

const esc = s => fx.escapar(s)
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

let raiz = null       // o container da aba
let pasta = null      // <userData>/roteiro
let dados = { sessoes: [], ativa: null }
let carregado = false

// Estado só da interface
let editando = null           // { idx: número | null (nova), rascunho, arquivo: File | null, previa }
let renomeando = false
let confirmando = null        // { chave, timer } — botão destrutivo esperando o segundo clique
const tocando = new Set()     // ids de cenas subindo agora
const falhas = {}             // id da cena → mensagem

// ══════════════════════════════════════════════════════════════════════════════
// ── ARMAZENAMENTO ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

async function carregar() {
    if (carregado) return
    pasta = path.join(await ipcRenderer.invoke('caminho-dados'), 'roteiro')
    fs.mkdirSync(path.join(pasta, 'imagens'), { recursive: true })
    try {
        const lido = JSON.parse(fs.readFileSync(path.join(pasta, 'sessoes.json'), 'utf8'))
        if (lido && Array.isArray(lido.sessoes)) dados = lido
    } catch (e) {
        if (e.code !== 'ENOENT') console.warn('[Roteiro] sessoes.json ilegível, começando vazio:', e.message)
    }
    carregado = true
}

function salvar() {
    // Grava num temporário e renomeia: um travamento no meio não corrompe o roteiro
    const destino = path.join(pasta, 'sessoes.json')
    const tmp = destino + '.tmp'
    try {
        fs.writeFileSync(tmp, JSON.stringify(dados, null, 1))
        fs.renameSync(tmp, destino)
    } catch (e) {
        console.error('[Roteiro] Não consegui salvar:', e)
    }
}

const caminhoImagem = nome => path.join(pasta, 'imagens', nome)
const urlLocal = nome => 'file:///' + encodeURI(caminhoImagem(nome).replace(/\\/g, '/'))

/** Apaga a imagem do disco se nenhuma cena de nenhuma sessão usa mais. */
function apagarImagemSeSobrar(nome) {
    if (!nome) return
    const usada = dados.sessoes.some(s => s.cenas.some(c => c.imagem === nome))
    if (!usada) fs.promises.unlink(caminhoImagem(nome)).catch(() => { })
}

async function guardarArquivo(file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const nome = `${novoId()}.${ext}`
    await fs.promises.writeFile(caminhoImagem(nome), Buffer.from(await file.arrayBuffer()))
    return nome
}

const sessaoAtiva = () => dados.sessoes.find(s => s.id === dados.ativa) || dados.sessoes[0] || null

// ══════════════════════════════════════════════════════════════════════════════
// ── ENVIO PARA A SALA ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const enviadas = new Map()   // `${sala}|${imagem}` → Promise<url>

function urlNaSala(cena) {
    const chave = `${state.currentRoomCode}|${cena.imagem}`
    if (!enviadas.has(chave)) {
        const p = (async () => {
            const buf = await fs.promises.readFile(caminhoImagem(cena.imagem))
            return enviarArquivoDaSala(new File([buf], cena.imagem, { type: cena.mime || 'image/jpeg' }))
        })()
        p.catch(() => enviadas.delete(chave))   // falhou: a próxima tentativa sobe de novo
        enviadas.set(chave, p)
    }
    return enviadas.get(chave)
}

/** Sobe, uma de cada vez, as imagens da sessão que ainda não estão na sala. */
let filaEnvio = Promise.resolve()
function preEnviar(sessao) {
    if (!sessao || !state.isRoomMaster || !state.currentRoomCode || !state.serverUrl) return
    sessao.cenas.filter(c => c.imagem).forEach(c => {
        filaEnvio = filaEnvio.then(() => urlNaSala(c)).catch(() => { })
    })
}

async function tocar(idx) {
    const sessao = sessaoAtiva()
    const cena = sessao && sessao.cenas[idx]
    if (!cena || tocando.has(cena.id)) return

    delete falhas[cena.id]
    const pacote = { tipo: cena.transicao || 'suave', efeitos: { ...cena.efeitos } }
    if (cena.imagem) {
        tocando.add(cena.id); render()
        try {
            pacote.cena = { url: await urlNaSala(cena), mimeType: cena.mime || 'image/jpeg' }
        } catch (e) {
            console.error('[Roteiro] Upload falhou:', e)
            falhas[cena.id] = 'Não consegui enviar a imagem. Clique de novo para tentar.'
            tocando.delete(cena.id); render()
            return
        } finally {
            tocando.delete(cena.id)
        }
    }
    fx.emitirTransicao(pacote)
    sessao.atual = idx
    salvar()
    render()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── INTERFACE ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function montar(container) {
    raiz = container
    raiz.innerHTML = '<div class="cfx-dica">Carregando o roteiro…</div>'
    raiz.addEventListener('click', aoClicar)
    raiz.addEventListener('change', aoMudar)
    raiz.addEventListener('input', aoDigitar)
    raiz.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.id === 'cfrNomeSessao') confirmarRenomear()
        if (e.key === 'Escape' && renomeando) { renomeando = false; render(); e.stopPropagation() }
    })
    carregar().then(render).catch(e => {
        console.error('[Roteiro]', e)
        raiz.innerHTML = '<div class="cfx-dica">Não consegui abrir a pasta do roteiro neste computador.</div>'
    })
}

function aoAbrir() {
    if (carregado) { render(); preEnviar(sessaoAtiva()) }
}

function miniatura(cena, previa) {
    if (previa) return `<span class="cfr-mini" style="background-image:url('${previa}')"></span>`
    if (!cena.imagem) return '<span class="cfr-mini vazia" title="Mantém a imagem que estiver na tela">—</span>'
    if ((cena.mime || '').startsWith('video/')) return '<span class="cfr-mini vazia" title="Vídeo">🎞</span>'
    return `<span class="cfr-mini" style="background-image:url('${urlLocal(cena.imagem)}')"></span>`
}

function botaoConfirmavel(chave, rotulo, rotuloConfirma, extra = '') {
    const pedindo = confirmando && confirmando.chave === chave
    return `<button class="${pedindo ? 'cfx-b cfr-perigo' : 'cfr-link'}" data-r="apagar" data-chave="${chave}" ${extra}>${pedindo ? rotuloConfirma : rotulo}</button>`
}

function render() {
    if (!raiz || !carregado) return
    if (editando) return renderEditor()

    const sessao = sessaoAtiva()
    if (!sessao) {
        raiz.innerHTML = `
            <div class="cfr-vazio">
                <p>Nenhuma sessão ainda.</p>
                <p class="cfx-dica">Monte as cenas antes da mesa (imagem, transição e efeitos) e passe de uma para a outra com um clique.</p>
                <button class="cfx-b largo cfr-primario" data-r="nova-sessao">＋ Criar sessão</button>
            </div>
            ${htmlAvulsa()}`
        return
    }

    const prox = (sessao.atual ?? -1) + 1
    const cenaProx = sessao.cenas[prox]

    raiz.innerHTML = `
        <div class="cfx-secao">Sessão</div>
        ${renomeando ? `
            <div class="cfx-salvar">
                <input id="cfrNomeSessao" type="text" maxlength="40" value="${esc(sessao.nome)}" aria-label="Nome da sessão">
                <button class="cfx-b" data-r="renomear-ok">Salvar</button>
            </div>` : `
            <div class="cfr-sessao">
                <select id="cfrSessao" aria-label="Sessão">
                    ${dados.sessoes.map(s => `<option value="${s.id}"${s.id === sessao.id ? ' selected' : ''}>${esc(s.nome)}</option>`).join('')}
                </select>
                <button class="cfx-b" data-r="nova-sessao" title="Nova sessão">＋ Nova</button>
            </div>
            <div class="cfr-acoes">
                <button class="cfr-link" data-r="renomear">Renomear</button>
                <button class="cfr-link" data-r="duplicar">Duplicar</button>
                ${botaoConfirmavel('sessao', 'Apagar', `Apagar "${esc(sessao.nome)}"?`)}
            </div>`}

        <button class="cfx-b largo cfr-primario cfr-proxima" data-r="proxima" ${cenaProx ? '' : 'disabled'}>
            ${cenaProx ? `▶ Próxima: ${prox + 1}. ${esc(cenaProx.nome)}` : (sessao.cenas.length ? 'Fim da sessão' : 'Sem cenas ainda')}
        </button>

        <ol class="cfr-lista">
            ${sessao.cenas.map((c, i) => `
                <li class="cfr-cena${i === sessao.atual ? ' atual' : ''}">
                    <button class="cfr-tocar" data-r="tocar" data-i="${i}" title="Pôr esta cena na tela">
                        <span class="cfr-num">${tocando.has(c.id) ? '⏳' : i + 1}</span>
                        ${miniatura(c)}
                        <span class="cfr-txt"><b>${esc(c.nome)}</b><small>${esc(fx.resumoCena(c.transicao, c.efeitos))}</small></span>
                    </button>
                    <span class="cfr-ferr">
                        <button class="cfx-n" data-r="subir" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir ${esc(c.nome)}">↑</button>
                        <button class="cfx-n" data-r="descer" data-i="${i}" ${i === sessao.cenas.length - 1 ? 'disabled' : ''} title="Descer" aria-label="Descer ${esc(c.nome)}">↓</button>
                        <button class="cfx-n" data-r="editar" data-i="${i}" title="Editar" aria-label="Editar ${esc(c.nome)}">✎</button>
                    </span>
                    ${falhas[c.id] ? `<div class="cfr-erro">${esc(falhas[c.id])}</div>` : ''}
                </li>`).join('')}
        </ol>
        <button class="cfx-b largo" data-r="nova-cena">＋ Nova cena</button>
        ${htmlAvulsa()}
    `
}

function htmlAvulsa() {
    return `
        <div class="cfx-secao">Fora do roteiro</div>
        <button class="cfx-b largo" data-r="avulsa">🖼 Trocar a imagem agora</button>
        <input id="cfrArquivoAvulso" type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm">`
}

function renderEditor() {
    const { idx, rascunho, previa } = editando
    const temImagem = previa || rascunho.imagem
    raiz.innerHTML = `
        <div class="cfx-secao">${idx == null ? 'Nova cena' : `Editando a cena ${idx + 1}`}</div>
        <label class="cfr-campo">Nome
            <input id="cfrNome" type="text" maxlength="40" value="${esc(rascunho.nome)}">
        </label>

        <div class="cfr-campo">Imagem</div>
        <div class="cfr-imagem">
            ${miniatura(rascunho, previa)}
            <span class="cfr-img-txt">${temImagem ? esc(editando.arquivo ? editando.arquivo.name : 'Imagem salva') : 'Sem imagem: mantém a que estiver na tela'}</span>
        </div>
        <div class="cfr-acoes">
            <button class="cfr-link" data-r="escolher-img">${temImagem ? 'Trocar imagem' : 'Escolher imagem'}</button>
            ${temImagem ? '<button class="cfr-link" data-r="tirar-img">Sem imagem</button>' : ''}
        </div>
        <input id="cfrArquivoCena" type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm">

        <label class="cfr-campo" for="cfrTrans">Transição</label>
        <select id="cfrTrans" class="cfr-select">
            ${[fx.TRANSICAO_SUAVE, ...fx.TRANSICOES].map(t => `<option value="${t.id}"${(rascunho.transicao || 'suave') === t.id ? ' selected' : ''}>${t.nome}</option>`).join('')}
        </select>

        <div class="cfx-secao">Efeitos desta cena</div>
        <div id="cfrEfeitos">${fx.htmlLinhasEfeitos(rascunho.efeitos, 'data-ref')}</div>
        <button class="cfr-link" data-r="copiar-tela">Copiar os efeitos que estão na tela agora</button>

        <div class="cfr-rodape">
            <button class="cfx-b cfr-primario" data-r="salvar-cena">Salvar cena</button>
            <button class="cfx-b" data-r="cancelar">Cancelar</button>
            ${idx == null ? '' : botaoConfirmavel('cena', 'Apagar cena', 'Apagar mesmo?')}
        </div>
    `
}

function pedirConfirmacao(chave) {
    if (confirmando && confirmando.chave === chave) {
        clearTimeout(confirmando.timer)
        confirmando = null
        return true
    }
    if (confirmando) clearTimeout(confirmando.timer)
    confirmando = { chave, timer: setTimeout(() => { confirmando = null; render() }, 4000) }
    render()
    return false
}

function abrirEditor(idx) {
    const sessao = sessaoAtiva()
    const base = idx == null
        ? { id: novoId(), nome: `Cena ${sessao.cenas.length + 1}`, imagem: null, mime: null, transicao: 'fade_preto', efeitos: {} }
        : sessao.cenas[idx]
    editando = { idx, rascunho: JSON.parse(JSON.stringify(base)), arquivo: null, previa: null }
    render()
    raiz.querySelector('#cfrNome')?.focus()
}

function fecharEditor() {
    if (editando && editando.previa) URL.revokeObjectURL(editando.previa)
    editando = null
    render()
}

async function salvarCena() {
    const sessao = sessaoAtiva()
    const { idx, rascunho, arquivo } = editando
    rascunho.nome = rascunho.nome.trim() || `Cena ${(idx ?? sessao.cenas.length) + 1}`

    const anterior = idx == null ? null : sessao.cenas[idx].imagem
    if (arquivo) {
        try {
            rascunho.imagem = await guardarArquivo(arquivo)
            rascunho.mime = arquivo.type || 'image/jpeg'
        } catch (e) {
            console.error('[Roteiro] Não consegui guardar a imagem:', e)
            raiz.querySelector('.cfr-img-txt').textContent = 'Não consegui guardar a imagem neste computador.'
            return
        }
    }

    if (idx == null) sessao.cenas.push(rascunho)
    else sessao.cenas[idx] = rascunho
    salvar()
    if (anterior && anterior !== rascunho.imagem) apagarImagemSeSobrar(anterior)
    fecharEditor()
    preEnviar(sessao)
}

function confirmarRenomear() {
    const input = raiz.querySelector('#cfrNomeSessao')
    const nome = input && input.value.trim()
    if (!nome) { input && input.focus(); return }
    sessaoAtiva().nome = nome
    renomeando = false
    salvar()
    render()
}

function aoClicar(e) {
    const b = e.target.closest('button')
    if (!b || !raiz.contains(b) || b.disabled) return
    const sessao = sessaoAtiva()
    const i = b.dataset.i != null ? +b.dataset.i : null

    // Editor: efeitos do rascunho (não mexem na tela)
    if (b.dataset.ref) {
        editando.rascunho.efeitos = fx.alternarEm(editando.rascunho.efeitos, b.dataset.ref, b.dataset.forca ? +b.dataset.forca : null)
        raiz.querySelector('#cfrEfeitos').innerHTML = fx.htmlLinhasEfeitos(editando.rascunho.efeitos, 'data-ref')
        return
    }

    switch (b.dataset.r) {
        case 'nova-sessao': {
            const s = { id: novoId(), nome: `Sessão ${dados.sessoes.length + 1}`, cenas: [], atual: -1 }
            dados.sessoes.push(s)
            dados.ativa = s.id
            renomeando = true
            salvar(); render()
            const input = raiz.querySelector('#cfrNomeSessao')
            if (input) { input.focus(); input.select() }
            return
        }
        case 'renomear':
            renomeando = true; render()
            raiz.querySelector('#cfrNomeSessao')?.select()
            return
        case 'renomear-ok': return confirmarRenomear()
        case 'duplicar': {
            const copia = JSON.parse(JSON.stringify(sessao))
            copia.id = novoId()
            copia.nome = `${sessao.nome} (cópia)`
            copia.atual = -1
            copia.cenas.forEach(c => { c.id = novoId() })   // as imagens são compartilhadas
            dados.sessoes.push(copia)
            dados.ativa = copia.id
            salvar(); render()
            return
        }
        case 'apagar': {
            if (!pedirConfirmacao(b.dataset.chave)) return
            if (b.dataset.chave === 'sessao') {
                dados.sessoes = dados.sessoes.filter(s => s !== sessao)
                dados.ativa = dados.sessoes[0] ? dados.sessoes[0].id : null
                sessao.cenas.forEach(c => apagarImagemSeSobrar(c.imagem))
                salvar(); render()
            } else if (b.dataset.chave === 'cena') {
                const [removida] = sessao.cenas.splice(editando.idx, 1)
                if (sessao.atual >= editando.idx) sessao.atual--
                salvar()
                apagarImagemSeSobrar(removida.imagem)
                fecharEditor()
            }
            return
        }
        case 'proxima': return tocar((sessao.atual ?? -1) + 1)
        case 'tocar': return tocar(i)
        case 'subir':
        case 'descer': {
            const j = b.dataset.r === 'subir' ? i - 1 : i + 1
            const [c] = sessao.cenas.splice(i, 1)
            sessao.cenas.splice(j, 0, c)
            if (sessao.atual === i) sessao.atual = j
            else if (sessao.atual === j) sessao.atual = i
            salvar(); render()
            raiz.querySelector(`[data-r="${b.dataset.r}"][data-i="${j}"]`)?.focus()
            return
        }
        case 'nova-cena': return abrirEditor(null)
        case 'editar': return abrirEditor(i)
        case 'cancelar': return fecharEditor()
        case 'salvar-cena': return salvarCena()
        case 'escolher-img': return raiz.querySelector('#cfrArquivoCena').click()
        case 'tirar-img':
            if (editando.previa) URL.revokeObjectURL(editando.previa)
            Object.assign(editando, { arquivo: null, previa: null })
            Object.assign(editando.rascunho, { imagem: null, mime: null })
            return render()
        case 'copiar-tela':
            editando.rascunho.efeitos = fx.efeitosAtuais()
            raiz.querySelector('#cfrEfeitos').innerHTML = fx.htmlLinhasEfeitos(editando.rascunho.efeitos, 'data-ref')
            return
        case 'avulsa': return raiz.querySelector('#cfrArquivoAvulso').click()
    }
}

async function aoMudar(e) {
    const alvo = e.target
    if (alvo.id === 'cfrSessao') {
        dados.ativa = alvo.value
        salvar(); render()
        preEnviar(sessaoAtiva())
        return
    }
    if (alvo.id === 'cfrTrans') { editando.rascunho.transicao = alvo.value; return }
    if (alvo.id === 'cfrArquivoCena') {
        const file = alvo.files[0]
        if (!file) return
        if (editando.previa) URL.revokeObjectURL(editando.previa)
        editando.arquivo = file
        editando.previa = file.type.startsWith('video/') ? null : URL.createObjectURL(file)
        editando.rascunho.mime = file.type
        if (file.type.startsWith('video/')) editando.rascunho.imagem = editando.rascunho.imagem || '(novo)'
        render()
        return
    }
    if (alvo.id === 'cfrArquivoAvulso') {
        // A troca simples de sempre: crossfade, efeitos como estão. Usa o evento
        // antigo, então funciona até num servidor sem os efeitos de cena.
        const file = alvo.files[0]
        if (!file || !state.socket) return
        const b = raiz.querySelector('[data-r="avulsa"]')
        b.textContent = '⏳ Enviando…'; b.disabled = true
        try {
            const url = await enviarArquivoDaSala(file)
            state.socket.emit('scene_change', { url, mimeType: file.type })
            b.textContent = '✓ Imagem trocada'
        } catch (err) {
            console.error('[Roteiro] Upload avulso falhou:', err)
            b.textContent = '✗ Não consegui enviar'
        }
        alvo.value = ''
        setTimeout(() => { b.textContent = '🖼 Trocar a imagem agora'; b.disabled = false }, 2000)
    }
}

function aoDigitar(e) {
    if (e.target.id === 'cfrNome' && editando) editando.rascunho.nome = e.target.value
}

module.exports = { montar, aoAbrir }
