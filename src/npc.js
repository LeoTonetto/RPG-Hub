// src/npc.js
// ── Sistema de NPCs ────────────────────────────────────────────────────────────
// Responsável por: picker de NPCs (mestre), animação de intro, bolhas no canto
// e card modal ao clicar. Só o mestre pode invocar/dispensar.

const state = require('./state')

let npcCacheLoaded = false
let npcCache = []
let introNpc = null
let introTimer1 = null
let introTimer2 = null

// ── Init ──────────────────────────────────────────────────────────────────────
function initNPC() {
    if (document.getElementById('npcOverlay')?.dataset.inited) return
    if (document.getElementById('npcOverlay')) {
        document.getElementById('npcOverlay').dataset.inited = '1'
    }

    _setupOverlayClose()
    _setupCardModal()

    if (state.isRoomMaster) {
        _setupMasterPanel()
    }
}

// ── Setup de elementos base ───────────────────────────────────────────────────
function _setupOverlayClose() {
    const overlay = document.getElementById('npcOverlay')
    if (!overlay) return
    overlay.addEventListener('click', e => {
        if (e.target === overlay) _closeNPCIntro()
    })
}

function _setupCardModal() {
    const modal = document.getElementById('npcCardModal')
    if (!modal) return
    modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.remove('visible')
    })
}

function _setupMasterPanel() {
    const invokeBtn = document.getElementById('npcInvokeBtn')
    if (!invokeBtn || invokeBtn.dataset.inited) return
    invokeBtn.dataset.inited = '1'

    invokeBtn.addEventListener('click', e => {
        e.stopPropagation()
        _togglePicker()
    })

    document.addEventListener('click', e => {
        const picker = document.getElementById('npcPicker')
        const wrap = document.getElementById('npcPanelWrap')
        if (picker?.classList.contains('visible') && !wrap?.contains(e.target)) {
            picker.classList.remove('visible')
        }
    })
}

// ── Picker de NPCs ────────────────────────────────────────────────────────────
async function _togglePicker() {
    const picker = document.getElementById('npcPicker')
    if (!picker) return

    if (picker.classList.contains('visible')) {
        picker.classList.remove('visible')
        return
    }

    await _loadNPCCache()
    _renderPicker()
    picker.classList.add('visible')
}

async function _loadNPCCache() {
    if (npcCacheLoaded || !state.supabase) return
    try {
        const { data, error } = await state.supabase
            .from('npcs')
            .select('id, name, photo, description')
            .order('name')
        if (error) { console.error('[NPC] Erro ao carregar:', error.message); return }
        npcCache = data || []
        npcCacheLoaded = true
        console.log(`[NPC] ${npcCache.length} NPCs carregados`)
    } catch (e) { console.error('[NPC] _loadNPCCache:', e) }
}

function _renderPicker() {
    const picker = document.getElementById('npcPicker')
    if (!picker) return
    picker.innerHTML = ''

    const title = document.createElement('div')
    title.className = 'npc-picker-title'
    title.textContent = 'Invocar NPC'
    picker.appendChild(title)

    if (npcCache.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'npc-picker-empty'
        empty.textContent = 'Nenhum NPC cadastrado ainda.'
        picker.appendChild(empty)
        return
    }

    npcCache.forEach(npc => {
        const item = document.createElement('div')
        item.className = 'npc-picker-item'

        const thumb = document.createElement('div')
        thumb.className = 'npc-picker-thumb'
        if (npc.photo) {
            const img = document.createElement('img')
            img.src = npc.photo
            img.onerror = () => { thumb.innerHTML = ''; thumb.textContent = '👤' }
            thumb.appendChild(img)
        } else {
            thumb.textContent = '👤'
        }

        const name = document.createElement('span')
        name.className = 'npc-picker-name'
        name.textContent = npc.name

        item.appendChild(thumb)
        item.appendChild(name)

        const inScene = !!state.activeNPCs[npc.id]
        if (inScene) {
            const badge = document.createElement('span')
            badge.className = 'npc-picker-already'
            badge.textContent = '✦'
            item.appendChild(badge)
            item.style.opacity = '0.45'
            item.style.cursor = 'default'
        } else {
            item.addEventListener('click', () => {
                _summonNPC(npc)
                picker.classList.remove('visible')
            })
        }

        picker.appendChild(item)
    })
}

// ── Invocar NPC (ação do mestre) ──────────────────────────────────────────────
function _summonNPC(npc) {
    if (!state.socket) return
    state.socket.emit('npc_summon', {
        id: npc.id,
        name: npc.name,
        photo: npc.photo || null,
        description: npc.description || ''
    })
}

// ── Dispensar NPC (ação do mestre) ────────────────────────────────────────────
function _dismissNPC(npcId) {
    if (!state.socket) return
    state.socket.emit('npc_dismiss', { npcId })
}

// ── Handler: recebe npc_summon do socket ──────────────────────────────────────
function handleNPCSummon(npc) {
    if (state.activeNPCs[npc.id]) return   // já na cena
    state.activeNPCs[npc.id] = npc

    if (npc.silent) {
        // Jogador entrou depois — vai direto para a bolha
        addNPCBubble(npc)
    } else {
        // Invocação ao vivo — mostra intro completo
        _showNPCIntro(npc)
    }
}

// ── Handler: recebe npc_dismiss do socket ─────────────────────────────────────
function handleNPCDismiss({ npcId }) {
    delete state.activeNPCs[npcId]
    _removeNPCBubble(npcId)

    const modal = document.getElementById('npcCardModal')
    if (modal?.dataset.npcId === String(npcId)) {
        modal.classList.remove('visible')
    }
}

// ── Animação de intro ─────────────────────────────────────────────────────────
function _showNPCIntro(npc) {
    introNpc = npc
    const overlay = document.getElementById('npcOverlay')
    const photoEl = document.getElementById('npcIntroPhoto')
    const cardEl = document.getElementById('npcIntroCard')
    if (!overlay || !photoEl || !cardEl) { addNPCBubble(npc); return }

    // Reset
    clearTimeout(introTimer1)
    clearTimeout(introTimer2)
    photoEl.classList.remove('visible')
    cardEl.classList.remove('visible')
    photoEl.innerHTML = ''
    cardEl.innerHTML = ''

    // Foto
    if (npc.photo) {
        const img = document.createElement('img')
        img.src = npc.photo
        img.onerror = () => {
            photoEl.innerHTML = '<div class="npc-photo-placeholder">👤</div>'
        }
        photoEl.appendChild(img)
    } else {
        photoEl.innerHTML = '<div class="npc-photo-placeholder">👤</div>'
    }

    // Card de descrição
    const inner = document.createElement('div')
    inner.className = 'npc-card-inner'

    const nameEl = document.createElement('div')
    nameEl.className = 'npc-card-name'
    nameEl.textContent = npc.name

    const descEl = document.createElement('div')
    descEl.className = 'npc-card-desc'
    descEl.textContent = npc.description || ''

    inner.appendChild(nameEl)
    inner.appendChild(descEl)

    const footer = document.createElement('div')
    footer.className = 'npc-card-footer'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'npc-close-intro-btn'
    closeBtn.textContent = '✕  Fechar'
    closeBtn.addEventListener('click', _closeNPCIntro)
    footer.appendChild(closeBtn)

    cardEl.appendChild(inner)
    cardEl.appendChild(footer)

    // Ativa overlay
    overlay.classList.add('active')

    // Fade-in da foto
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { photoEl.classList.add('visible') })
    })

    // Card desliza após 1.3 s
    introTimer1 = setTimeout(() => { cardEl.classList.add('visible') }, 1300)

    // Auto-fecha após 7 s
    introTimer2 = setTimeout(() => { _closeNPCIntro() }, 7000)
}

function _closeNPCIntro() {
    clearTimeout(introTimer1)
    clearTimeout(introTimer2)
    const overlay = document.getElementById('npcOverlay')
    const photoEl = document.getElementById('npcIntroPhoto')
    const cardEl = document.getElementById('npcIntroCard')

    if (photoEl) photoEl.classList.remove('visible')
    if (cardEl) cardEl.classList.remove('visible')

    // Espera o fade-out terminar antes de esconder o overlay
    setTimeout(() => {
        if (overlay) overlay.classList.remove('active')
        if (introNpc) {
            addNPCBubble(introNpc)
            introNpc = null
        }
    }, 600)
}

// ── Bolha no canto ────────────────────────────────────────────────────────────
function addNPCBubble(npc) {
    const bar = document.getElementById('npcSceneBar')
    if (!bar) return

    // Remove duplicata
    bar.querySelector(`[data-npc-id="${npc.id}"]`)?.remove()

    const bubble = document.createElement('div')
    bubble.className = 'npc-bubble' + (state.isRoomMaster ? ' master' : '')
    bubble.dataset.npcId = npc.id
    bubble.dataset.name = npc.name

    if (npc.photo) {
        const img = document.createElement('img')
        img.src = npc.photo
        img.alt = npc.name
        img.onerror = () => {
            img.remove()
            const ph = document.createElement('div')
            ph.className = 'npc-bubble-placeholder'
            ph.textContent = '👤'
            bubble.insertBefore(ph, bubble.firstChild)
        }
        bubble.appendChild(img)
    } else {
        const ph = document.createElement('div')
        ph.className = 'npc-bubble-placeholder'
        ph.textContent = '👤'
        bubble.appendChild(ph)
    }

    // Overlay de dispensar — apenas para o mestre
    if (state.isRoomMaster) {
        const dismissEl = document.createElement('div')
        dismissEl.className = 'npc-bubble-dismiss'
        dismissEl.textContent = '✕'
        dismissEl.addEventListener('click', e => {
            e.stopPropagation()
            _dismissNPC(npc.id)
        })
        bubble.appendChild(dismissEl)
    }

    // Clique abre o card
    bubble.addEventListener('click', () => _openNPCCard(npc))

    bar.appendChild(bubble)
}

function _removeNPCBubble(npcId) {
    const bar = document.getElementById('npcSceneBar')
    const bubble = bar?.querySelector(`[data-npc-id="${npcId}"]`)
    if (!bubble) return
    bubble.style.animation = 'npcBubbleOut 0.3s ease forwards'
    setTimeout(() => bubble.remove(), 320)
}

// ── Card modal ao clicar na bolha ─────────────────────────────────────────────
function _openNPCCard(npc) {
    const modal = document.getElementById('npcCardModal')
    if (!modal) return
    modal.dataset.npcId = npc.id
    modal.innerHTML = ''
    modal.classList.add('visible')

    const wrap = document.createElement('div')
    wrap.className = 'npc-modal-wrap'

    // Foto
    const photoEl = document.createElement('div')
    photoEl.className = 'npc-modal-photo'
    if (npc.photo) {
        const img = document.createElement('img')
        img.src = npc.photo
        img.alt = npc.name
        img.onerror = () => {
            photoEl.innerHTML = '<div class="npc-modal-photo-placeholder">👤</div>'
        }
        photoEl.appendChild(img)
    } else {
        photoEl.innerHTML = '<div class="npc-modal-photo-placeholder">👤</div>'
    }

    // Corpo
    const body = document.createElement('div')
    body.className = 'npc-modal-body'

    const inner = document.createElement('div')
    inner.className = 'npc-modal-inner'

    const nameEl = document.createElement('div')
    nameEl.className = 'npc-modal-name'
    nameEl.textContent = npc.name

    const descEl = document.createElement('div')
    descEl.className = 'npc-modal-desc'
    descEl.textContent = npc.description || 'Sem descrição.'

    inner.appendChild(nameEl)
    inner.appendChild(descEl)

    const footer = document.createElement('div')
    footer.className = 'npc-modal-footer'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'npc-modal-btn'
    closeBtn.textContent = 'Fechar'
    closeBtn.addEventListener('click', () => modal.classList.remove('visible'))
    footer.appendChild(closeBtn)

    if (state.isRoomMaster) {
        const dismissBtn = document.createElement('button')
        dismissBtn.className = 'npc-modal-btn dismiss'
        dismissBtn.textContent = 'Dispensar NPC'
        dismissBtn.addEventListener('click', () => {
            _dismissNPC(npc.id)
            modal.classList.remove('visible')
        })
        footer.appendChild(dismissBtn)
    }

    body.appendChild(inner)
    body.appendChild(footer)
    wrap.appendChild(photoEl)
    wrap.appendChild(body)
    modal.appendChild(wrap)
}

module.exports = { initNPC, handleNPCSummon, handleNPCDismiss, addNPCBubble }
