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
        const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth  - el.offsetWidth))
        const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - el.offsetHeight))
        el.style.left = x + 'px'
        el.style.top  = y + 'px'
    })
    document.addEventListener('mouseup', () => { dragging = false })
}

// ── HUD toggle ────────────────────────────────────────────────────────────────
function initHUD() {
    const hudToggle  = document.getElementById('hudToggle')
    const chatToggle = document.getElementById('chatToggle')

    hudToggle.addEventListener('click', toggleHUD)
    chatToggle.addEventListener('click', toggleChat)

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
    const panel = document.getElementById('chatPanel')
    const btn   = document.getElementById('chatToggle')
    if (panel) panel.classList.toggle('chat-visible', state.chatVisible)
    if (btn) {
        btn.classList.toggle('chat-active', state.chatVisible)
        btn.title = state.chatVisible ? 'Ocultar Chat (C)' : 'Mostrar Chat (C)'
    }
    if (state.chatVisible) document.getElementById('chatInput')?.focus()
}

// Mostra os botões de HUD e chat (chamado quando entra em sala)
function showHUDButtons() {
    const hudToggle  = document.getElementById('hudToggle')
    const chatToggle = document.getElementById('chatToggle')
    if (hudToggle)  { hudToggle.style.display  = 'flex'; hudToggle.style.alignItems = 'center'; hudToggle.style.justifyContent = 'center' }
    if (chatToggle) { chatToggle.style.display = 'flex'; chatToggle.style.alignItems = 'center'; chatToggle.style.justifyContent = 'center' }
    const chatPanel = document.getElementById('chatPanel')
    if (chatPanel) chatPanel.style.display = 'flex'
}

module.exports = { makeDraggable, initHUD, toggleHUD, toggleChat, showHUDButtons }
