// src/imageShow.js
// ── Imagem mostrada pelo mestre ───────────────────────────────────────────────
// Um mapa, uma carta, um retrato: algo que não é cena nem item. O mestre escolhe
// o arquivo, ele sobe para a pasta da sala e aparece por cima da tela de todo
// mundo. Cada um fecha a sua quando terminar de olhar (clique fora, ✕ ou Esc);
// o mestre ainda pode recolher de todos de uma vez.

const state = require('./state')
const { enviarArquivoDaSala, fetchAsBlobUrl } = require('./scene')

const ROTULO_BOTAO = '🔍 Mostrar Imagem'

function initImageShow() {
    const btn = document.getElementById('imageShowBtn')
    const input = document.getElementById('imageShowInput')
    if (!btn || !input || btn.dataset.inited) return
    btn.dataset.inited = '1'

    btn.addEventListener('click', () => input.click())
    input.addEventListener('change', async () => {
        const file = input.files[0]
        if (!file || !state.socket) return
        btn.textContent = '⏳ Enviando…'
        btn.disabled = true
        try {
            const url = await enviarArquivoDaSala(file)
            state.socket.emit('image_show', { url })
            btn.textContent = '✓ Imagem enviada'
        } catch (e) {
            console.error('[Imagem] Erro no upload:', e)
            btn.textContent = '✗ Erro no upload'
        }
        input.value = ''
        setTimeout(() => { btn.textContent = ROTULO_BOTAO; btn.disabled = false }, 2000)
    })
}

let blobAtual = null

function fecharImagem() {
    const overlay = document.getElementById('imageShowOverlay')
    if (!overlay) return
    overlay.classList.remove('visible')
    document.removeEventListener('keydown', onEsc)
    const blob = blobAtual
    setTimeout(() => {
        overlay.remove()
        // Se outra imagem chegou durante o fade-out, o blob dela é outro
        if (blob && blob === blobAtual) { URL.revokeObjectURL(blob); blobAtual = null }
    }, 300)
}

function onEsc(e) { if (e.key === 'Escape') fecharImagem() }

async function handleImageShow({ url }) {
    // O fetch com o cabeçalho do ngrok evita a página de aviso no lugar da imagem
    let src = url
    try { src = await fetchAsBlobUrl(url) }
    catch (e) { console.warn('[Imagem] Fetch bypass falhou, usando URL direta:', e.message) }

    document.getElementById('imageShowOverlay')?.remove()
    if (blobAtual) URL.revokeObjectURL(blobAtual)
    blobAtual = src.startsWith('blob:') ? src : null

    const overlay = document.createElement('div')
    overlay.id = 'imageShowOverlay'

    const img = document.createElement('img')
    img.className = 'image-show-img'
    img.src = src
    img.alt = 'Imagem mostrada pelo mestre'
    overlay.appendChild(img)

    const rodape = document.createElement('div')
    rodape.className = 'image-show-footer'
    rodape.textContent = 'Clique fora ou aperte Esc para fechar'
    overlay.appendChild(rodape)

    if (state.isRoomMaster) {
        const recolher = document.createElement('button')
        recolher.className = 'image-show-hide-all'
        recolher.textContent = 'Recolher de todos'
        recolher.addEventListener('click', e => {
            e.stopPropagation()
            state.socket?.emit('image_hide')
        })
        overlay.appendChild(recolher)
    }

    const fechar = document.createElement('button')
    fechar.className = 'image-show-close'
    fechar.textContent = '✕'
    fechar.title = 'Fechar (Esc)'
    fechar.addEventListener('click', e => { e.stopPropagation(); fecharImagem() })
    overlay.appendChild(fechar)

    overlay.addEventListener('click', e => { if (e.target === overlay) fecharImagem() })
    document.addEventListener('keydown', onEsc)

    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('visible'))
}

function handleImageHide() { fecharImagem() }

module.exports = { initImageShow, handleImageShow, handleImageHide }
