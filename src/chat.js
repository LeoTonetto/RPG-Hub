const state = require('./state')

const MSG_LIFETIME = 18000
const MSG_FADE     = 1200
const MAX_VISIBLE  = 12

function initChat() {
    const input   = document.getElementById('chatInput')
    const sendBtn = document.getElementById('chatSendBtn')
    if (input.dataset.inited) return
    input.dataset.inited = '1'

    function sendChat() {
        const msg = input.value.trim()
        if (!msg || !state.socket) return
        state.socket.emit('chat_message', { playerName: state.playerName, message: msg })
        input.value = ''
    }

    sendBtn.addEventListener('click', sendChat)
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); sendChat() }
        e.stopPropagation()
    })
}

function addChatMessage(from, message, isOwn = false) {
    const container = document.getElementById('chatMessages')
    if (!container) return

    const el   = document.createElement('div')
    el.className = 'chat-msg' + (isOwn ? ' chat-own' : '')

    const nameSpan = document.createElement('span')
    nameSpan.className   = 'chat-name'
    nameSpan.textContent = from + ':'
    el.appendChild(nameSpan)
    el.appendChild(document.createTextNode(' ' + message))
    container.appendChild(el)

    while (container.children.length > MAX_VISIBLE) container.firstChild.remove()
    container.scrollTop = container.scrollHeight

    // Se chat fechado, mostra brevemente na tela mesmo assim
    const panel = document.getElementById('chatPanel')
    if (!state.chatVisible) {
        panel.style.display   = 'flex'
        panel.style.pointerEvents = 'none'
    }

    const fadeTimer = setTimeout(() => {
        el.classList.add('chat-fading')
        setTimeout(() => el.remove(), MSG_FADE)
    }, MSG_LIFETIME)

    const observer = new MutationObserver(() => {
        if (state.chatVisible) { clearTimeout(fadeTimer); el.classList.remove('chat-fading') }
    })
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] })
}

module.exports = { initChat, addChatMessage }
