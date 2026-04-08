const state = require('./state')

// ── Drag genérico ─────────────────────────────────────────────────────────────
function makeDraggable(el, handle) {
    let dragging = false, ox = 0, oy = 0
    handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return
        dragging = true
        el.style.transform = ''
        const r = el.getBoundingClientRect()
        ox = e.clientX - r.left
        oy = e.clientY - r.top
        e.preventDefault()
    })
    document.addEventListener('mousemove', e => {
        if (!dragging) return
        const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - el.offsetWidth))
        const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - el.offsetHeight))
        el.style.left = x + 'px'
        el.style.top = y + 'px'
    })
    document.addEventListener('mouseup', () => { dragging = false })
}

// ── HUD toggle ────────────────────────────────────────────────────────────────
function initHUD() {
    const hudToggle = document.getElementById('hudToggle')
    hudToggle.addEventListener('click', toggleHUD)

    // O toggle do chat agora fica no input row
    const collapseBtn = document.getElementById('chatCollapseBtn')
    if (collapseBtn) collapseBtn.addEventListener('click', toggleChat)

    document.addEventListener('keydown', e => {
        const tag = document.activeElement.tagName
        if (['INPUT', 'TEXTAREA'].includes(tag)) return
        if (e.key === 'h' || e.key === 'H') toggleHUD()
        if (e.key === 'c' || e.key === 'C') toggleChat()
    })
}

function toggleHUD() {
    state.hudVisible = !state.hudVisible
    document.body.classList.toggle('hud-hidden', !state.hudVisible)
    const btn = document.getElementById('hudToggle')
    if (btn) btn.title = state.hudVisible ? 'Ocultar HUD (H)' : 'Mostrar HUD (H)'
}

function toggleChat() {
    state.chatVisible = !state.chatVisible
    const messages = document.getElementById('chatMessages')
    const collapseBtn = document.getElementById('chatCollapseBtn')

    if (messages) {
        messages.classList.toggle('chat-collapsed', !state.chatVisible)
        if (state.chatVisible) {
            // Snap ao fundo ao abrir
            messages.scrollTop = messages.scrollHeight
        }
    }
    if (collapseBtn) {
        collapseBtn.classList.toggle('chat-active', state.chatVisible)
        collapseBtn.title = state.chatVisible ? 'Ocultar Chat (C)' : 'Mostrar Chat (C)'
    }
    if (state.chatVisible) document.getElementById('chatInput')?.focus()
}

// Mostra os botões de HUD (chamado quando entra em sala)
function showHUDButtons() {
    const hudToggle = document.getElementById('hudToggle')
    if (hudToggle) {
        hudToggle.style.display = 'flex'
        hudToggle.style.alignItems = 'center'
        hudToggle.style.justifyContent = 'center'
    }
    // O painel do chat fica sempre visível a partir de agora (input sempre acessível)
    const chatPanel = document.getElementById('chatPanel')
    if (chatPanel) chatPanel.style.display = 'flex'

    // Chat começa aberto
    const messages = document.getElementById('chatMessages')
    if (!state.chatVisible) {
        state.chatVisible = true
    }
    if (messages) {
        messages.classList.remove('chat-collapsed')
    }
    const collapseBtn = document.getElementById('chatCollapseBtn')
    if (collapseBtn) {
        collapseBtn.classList.add('chat-active')
        collapseBtn.title = 'Ocultar Chat (C)'
    }
}

module.exports = { makeDraggable, initHUD, toggleHUD, toggleChat, showHUDButtons }
