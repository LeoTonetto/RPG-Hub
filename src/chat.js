const state = require('./state')


const GIPHY_KEY = 'Mn6Xc5nLEurS5zITCgQIGjR3tVzkP3PW'
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs'
const GIPHY_LIMIT = 24
const GIPHY_RATING = 'pg-13'

const EMOJI_CATS = [
    { id: 'faces', icon: '😊', label: 'Rostos', list: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'] },
    { id: 'hands', icon: '👋', label: 'Gestos', list: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦵', '🦶', '👂', '🦻', '👃', '👅', '👄', '🫦', '🧠', '🦷', '🦴', '👁️'] },
    { id: 'rpg', icon: '⚔️', label: 'RPG', list: ['⚔️', '🗡️', '🛡️', '🏹', '🪄', '🔮', '💀', '💣', '🧿', '🗺️', '🔑', '🗝️', '🔒', '🔓', '⚗️', '🧪', '📜', '📖', '🪙', '💰', '💎', '🧲', '🎭', '👑', '🏆', '🎲', '🎯', '🎮', '🕹️', '👾', '🧙', '🧝', '🧛', '🧟', '🧞', '🧜', '🐉', '🦁', '🐺', '🦊', '🦅', '🌙', '⭐', '🔥', '💧', '🌊', '⚡', '🌪️', '❄️', '🌑', '🌕', '🌟', '✨', '💥', '🌋', '🏰', '⛩️', '🌌', '☄️', '🌠'] },
    { id: 'symbols', icon: '❤️', label: 'Símbolos', list: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '✅', '❌', '❓', '❗', '💯', '🎉', '🎊', '🎈', '🎁', '🎀', '🏅', '🥇', '🥈', '🥉', '🏆', '👑', '💎', '🌈', '⚡', '✨', '💫', '🔥', '🍀', '🌸', '🌺', '🌹', '🌻', '🌼', '☮️', '🔱', '⚜️', '🔰', '💠', '🔯'] },
]

let _emojiOpen = false, _gifOpen = false, _activeCat = EMOJI_CATS[0].id
let _gifOffset = 0, _gifQuery = '', _gifLoading = false, _gifDebounce = null
let _chatAtBottom = true   // rastreia se o usuário está no fundo do chat
let _historyReady = false  // true após o histórico ter sido carregado
let _pendingLive = []      // mensagens ao vivo que chegaram antes do histórico

// ══════════════════════════════════════════════════════════════════════════════
function initChat() {
    const input = document.getElementById('chatInput')
    const sendBtn = document.getElementById('chatSendBtn')
    if (input.dataset.inited) return
    input.dataset.inited = '1'

    const sendChat = () => {
        const msg = input.value.trim()
        if (!msg || !state.socket) return
        state.socket.emit('chat_message', { playerName: state.playerName, message: msg, type: 'text' })
        input.value = ''
    }
    sendBtn.addEventListener('click', sendChat)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat() } e.stopPropagation() })

    document.getElementById('chatEmojiBtn')?.addEventListener('click', e => { e.stopPropagation(); closeGifModal(); toggleEmojiPicker() })
    document.getElementById('chatGifBtn')?.addEventListener('click', e => { e.stopPropagation(); closeEmojiPicker(); toggleGifModal() })

    document.addEventListener('click', e => {
        if (_emojiOpen && !e.target.closest('#emojiPicker') && !e.target.closest('#chatEmojiBtn')) closeEmojiPicker()
        if (_gifOpen && !e.target.closest('#gifModal') && !e.target.closest('#chatGifBtn')) closeGifModal()
    })

    // ── Rastreamento de scroll ─────────────────────────────────────────────────
    const container = document.getElementById('chatMessages')
    if (container) {
        container.addEventListener('scroll', () => {
            const dist = container.scrollHeight - container.scrollTop - container.clientHeight
            _chatAtBottom = dist < 40
        })
    }

    buildEmojiPicker()
    buildGifModal()
}

// ══════════════════════════════════════════════════════════════════════════════
//  MENSAGENS
// ══════════════════════════════════════════════════════════════════════════════
function addChatMessage(from, message, isOwn = false, type = 'text', gifUrl = null, isHistory = false) {
    const container = document.getElementById('chatMessages')
    if (!container) return

    const el = document.createElement('div')
    el.className = 'chat-msg'
        + (isOwn ? ' chat-own' : '')
        + (isHistory ? ' chat-history' : '')

    const nameSpan = document.createElement('span')
    nameSpan.className = 'chat-name'; nameSpan.textContent = from + ':'
    el.appendChild(nameSpan)

    if (type === 'gif' && gifUrl) {
        el.classList.add('chat-msg-gif')
        const img = document.createElement('img')
        img.className = 'chat-gif'; img.src = gifUrl; img.alt = 'GIF'
        el.appendChild(document.createElement('br')); el.appendChild(img)
    } else {
        el.appendChild(document.createTextNode(' ' + message))
    }

    container.appendChild(el)

    // Histórico: sem auto-scroll forçado
    if (isHistory) return

    // ── Auto-scroll apenas se o usuário estava no fundo ───────────────────────
    if (_chatAtBottom) container.scrollTop = container.scrollHeight
}

// ── Histórico da sessão ───────────────────────────────────────────────────────
function loadChatHistory(messages) {
    const container = document.getElementById('chatMessages')
    if (!container) return

    if (Array.isArray(messages) && messages.length > 0) {
        messages.forEach(msg => addChatMessage(
            msg.player_name, msg.message || '',
            msg.player_name === state.playerName,
            msg.type || 'text', msg.gif_url || null,
            true
        ))
    }

    const sep = document.createElement('div')
    sep.className = 'chat-sep'; sep.textContent = '— ao vivo —'
    container.appendChild(sep)

    // Scroll para o fundo após carregar o histórico
    container.scrollTop = container.scrollHeight
    _chatAtBottom = true

    // Libera as mensagens ao vivo que chegaram antes do histórico
    _historyReady = true
    _pendingLive.forEach(args => addChatMessage(...args))
    _pendingLive = []
}

// ── Enfileira mensagens ao vivo até o histórico estar pronto ─────────────────
function addLiveChatMessage(from, message, isOwn = false, type = 'text', gifUrl = null) {
    if (!_historyReady) {
        _pendingLive.push([from, message, isOwn, type, gifUrl, false])
        return
    }
    addChatMessage(from, message, isOwn, type, gifUrl, false)
}

// ══════════════════════════════════════════════════════════════════════════════
//  EMOJI PICKER
// ══════════════════════════════════════════════════════════════════════════════
function buildEmojiPicker() {
    if (document.getElementById('emojiPicker')) return
    const picker = document.createElement('div'); picker.id = 'emojiPicker'; picker.className = 'chat-picker'
    const tabs = document.createElement('div'); tabs.className = 'picker-tabs'
    EMOJI_CATS.forEach(cat => {
        const tab = document.createElement('button')
        tab.className = 'picker-tab' + (cat.id === _activeCat ? ' active' : ''); tab.textContent = cat.icon; tab.title = cat.label
        tab.addEventListener('click', e => { e.stopPropagation(); _activeCat = cat.id; tabs.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); renderEmojiGrid(grid) })
        tabs.appendChild(tab)
    })
    picker.appendChild(tabs)
    const grid = document.createElement('div'); grid.className = 'emoji-grid'
    picker.appendChild(grid); renderEmojiGrid(grid); document.body.appendChild(picker)
}

function renderEmojiGrid(grid) {
    grid.innerHTML = ''
    const cat = EMOJI_CATS.find(c => c.id === _activeCat) || EMOJI_CATS[0]
    cat.list.forEach(emoji => {
        const btn = document.createElement('button'); btn.className = 'emoji-btn'; btn.textContent = emoji; btn.title = emoji
        btn.addEventListener('click', e => { e.stopPropagation(); insertAtCursor(document.getElementById('chatInput'), emoji); closeEmojiPicker(); document.getElementById('chatInput').focus() })
        grid.appendChild(btn)
    })
}

function insertAtCursor(input, text) {
    const s = input.selectionStart, e = input.selectionEnd
    input.value = input.value.slice(0, s) + text + input.value.slice(e)
    input.selectionStart = input.selectionEnd = s + text.length
}

function toggleEmojiPicker() { _emojiOpen ? closeEmojiPicker() : openEmojiPicker() }
function openEmojiPicker() { _emojiOpen = true; positionAboveInput(document.getElementById('emojiPicker'), document.getElementById('chatEmojiBtn')); document.getElementById('emojiPicker')?.classList.add('picker-open') }
function closeEmojiPicker() { _emojiOpen = false; document.getElementById('emojiPicker')?.classList.remove('picker-open') }

// ══════════════════════════════════════════════════════════════════════════════
//  GIF MODAL (Giphy)
// ══════════════════════════════════════════════════════════════════════════════
function buildGifModal() {
    if (document.getElementById('gifModal')) return
    const modal = document.createElement('div'); modal.id = 'gifModal'; modal.className = 'chat-picker gif-modal'
    const header = document.createElement('div'); header.className = 'gif-header'
    const sw = document.createElement('div'); sw.className = 'gif-search-wrap'
    const si = document.createElement('span'); si.className = 'gif-search-icon'; si.textContent = '🔍'
    const inp = document.createElement('input'); inp.id = 'gifSearchInput'; inp.className = 'gif-search-input'; inp.placeholder = 'Buscar GIFs…'; inp.autocomplete = 'off'
    inp.addEventListener('input', () => { clearTimeout(_gifDebounce); _gifDebounce = setTimeout(() => fetchGifs(inp.value.trim()), 420) })
    inp.addEventListener('keydown', e => e.stopPropagation())
    const clr = document.createElement('button'); clr.className = 'gif-clear-btn'; clr.textContent = '✕'
    clr.addEventListener('click', () => { inp.value = ''; fetchGifs(''); inp.focus() })
    sw.appendChild(si); sw.appendChild(inp); sw.appendChild(clr); header.appendChild(sw); modal.appendChild(header)

    const grid = document.createElement('div'); grid.id = 'gifGrid'; grid.className = 'gif-grid'
    grid.addEventListener('scroll', () => { if (!_gifLoading && grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 80) loadMoreGifs() })
    modal.appendChild(grid)

    const attrib = document.createElement('div'); attrib.className = 'gif-attrib'
    attrib.innerHTML = `<svg height="14" viewBox="0 0 65 26" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:4px;"><path d="M0 2h4v22H0z" fill="#00FF99"/><path d="M4 0h16v4H4z" fill="#00FF99"/><path d="M4 22h28v4H4z" fill="#00FF99"/><path d="M16 10h12v4H16z" fill="#00FF99"/><path d="M28 2h4v22h-4z" fill="#00FF99"/><path d="M28 0h12v4H28z" fill="#9933FF"/><path d="M36 0h4v26h-4z" fill="#9933FF"/><path d="M40 4h4v8h-4z" fill="#FF6666"/><path d="M44 0h4v26h-4z" fill="#FF6666"/><path d="M48 0h16v4H48z" fill="#FFFF66"/><path d="M48 8h8v4h-8z" fill="#FFFF66"/><path d="M60 0h4v26h-4z" fill="#FFFF66"/></svg><span>Powered by GIPHY</span>`
    modal.appendChild(attrib); document.body.appendChild(modal)
}

function toggleGifModal() { _gifOpen ? closeGifModal() : openGifModal() }
function openGifModal() {
    _gifOpen = true
    const modal = document.getElementById('gifModal'); if (!modal) return
    positionAboveInput(modal, document.getElementById('chatGifBtn'))
    modal.classList.add('picker-open')
    const grid = document.getElementById('gifGrid')
    if (grid && grid.children.length === 0) fetchGifs('')
    setTimeout(() => document.getElementById('gifSearchInput')?.focus(), 60)
}
function closeGifModal() { _gifOpen = false; document.getElementById('gifModal')?.classList.remove('picker-open') }

async function fetchGifs(query) {
    if (_gifLoading) return
    _gifQuery = query; _gifOffset = 0; _gifLoading = true
    const grid = document.getElementById('gifGrid')
    if (grid) { grid.innerHTML = ''; showGifPlaceholders(grid, 6) }
    try { const r = await giphyRequest(query, 0); if (grid) { grid.innerHTML = ''; renderGifItems(grid, r) }; _gifOffset = r.length }
    catch (e) { console.error('[Giphy]', e); if (grid) grid.innerHTML = `<div class="gif-error">Erro ao carregar GIFs 😢</div>` }
    finally { _gifLoading = false }
}

async function loadMoreGifs() {
    if (_gifLoading || _gifOffset === 0) return
    _gifLoading = true
    try { const r = await giphyRequest(_gifQuery, _gifOffset); const g = document.getElementById('gifGrid'); if (g && r.length) { renderGifItems(g, r); _gifOffset += r.length } }
    catch (e) { console.error('[Giphy] loadMore:', e) }
    finally { _gifLoading = false }
}

async function giphyRequest(query, offset) {
    const ep = query ? 'search' : 'trending'
    const p = new URLSearchParams({ api_key: GIPHY_KEY, limit: GIPHY_LIMIT, rating: GIPHY_RATING, offset, ...(query ? { q: query } : {}) })
    const r = await fetch(`${GIPHY_BASE}/${ep}?${p}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()).data || []
}

function renderGifItems(grid, gifs) {
    if (!gifs.length && !grid.children.length) { grid.innerHTML = `<div class="gif-error">Nenhum GIF encontrado 🧙</div>`; return }
    gifs.forEach(gif => {
        const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.downsized?.url
        const sendUrl = gif.images?.downsized?.url || gif.images?.original?.url
        if (!previewUrl || !sendUrl) return
        const item = document.createElement('div'); item.className = 'gif-item'
        const img = document.createElement('img'); img.src = previewUrl; img.alt = gif.title || 'GIF'
        item.appendChild(img)
        item.addEventListener('click', e => { e.stopPropagation(); sendGif(sendUrl) })
        grid.appendChild(item)
    })
}

function showGifPlaceholders(grid, n) {
    for (let i = 0; i < n; i++) { const ph = document.createElement('div'); ph.className = 'gif-placeholder'; grid.appendChild(ph) }
}

function sendGif(gifUrl) {
    if (!state.socket) return
    state.socket.emit('chat_message', { playerName: state.playerName, message: '[GIF]', type: 'gif', gifUrl })
    closeGifModal()
}

function positionAboveInput(el, anchorEl) {
    if (!el) return
    el.style.visibility = 'hidden'; el.style.display = 'flex'
    requestAnimationFrame(() => {
        const ew = el.offsetWidth, eh = el.offsetHeight
        const rect = (anchorEl || document.getElementById('chatInput')).getBoundingClientRect()
        let left = rect.left, top = rect.top - eh - 8
        left = Math.max(8, Math.min(left, window.innerWidth - ew - 8))
        top = Math.max(8, Math.min(top, window.innerHeight - eh - 8))
        el.style.left = left + 'px'; el.style.top = top + 'px'
        el.style.visibility = 'visible'; el.style.display = ''
    })
}
module.exports = { initChat, addChatMessage, addLiveChatMessage, loadChatHistory }
