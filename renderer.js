const { io } = require('socket.io-client')
const { ipcRenderer, clipboard } = require('electron')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const SUPABASE_URL = 'https://jxwjvaanfzufklyrsxrk.supabase.co'
const SUPABASE_KEY = 'sb_publishable_A2oU2UYshxiIvb6EHLS8BA_tWbveC72'

let supabase
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    console.log('[Supabase] Cliente inicializado')
} catch (e) {
    console.error('[Supabase] Falha ao inicializar:', e)
}

let socket = null
let currentRoomCode = null
let serverUrl = null
let playerName = localStorage.getItem('playerName') || 'Aventureiro'
let currentUserId = null
let isLoginMode = true
let playerCharacters = []
let isRoomMaster = false

// ── Música ────────────────────────────────────────────────────────────────────
let ytPlayer = null
let ytReady = false
let pendingVideoId = null
let pendingSeekTime = 0

function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
        /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/
    ]
    for (const pat of patterns) {
        const m = url.match(pat)
        if (m) return m[1]
    }
    return null
}

function loadYouTubeAPI() {
    if (window.YT) return
    window.onYouTubeIframeAPIReady = () => {
        ytReady = true
        if (pendingVideoId) playYouTubeVideo(pendingVideoId, pendingSeekTime)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
}

function playYouTubeVideo(videoId, seekTime = 0) {
    const volSlider = document.getElementById('volumeSlider')
    const vol = volSlider ? parseInt(volSlider.value) : 60

    if (!ytReady) {
        pendingVideoId = videoId
        pendingSeekTime = seekTime
        loadYouTubeAPI()
        return
    }

    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(videoId)
        ytPlayer.setVolume(vol)
        if (seekTime > 0) ytPlayer.seekTo(seekTime)
        return
    }

    ytPlayer = new YT.Player('ytPlayer', {
        height: '1',
        width: '1',
        videoId,
        playerVars: { autoplay: 1, controls: 0, loop: 1, playlist: videoId, mute: 1 },
        events: {
            onReady(e) {
                e.target.setVolume(vol)
                if (seekTime > 0) e.target.seekTo(seekTime)
                e.target.playVideo()
            },
            onStateChange(event) {
                if (event.data === YT.PlayerState.PLAYING) {
                    event.target.unMute()
                }
            },
            onError(event) {
                console.error('[Música] Erro no player', event.data, 'para vídeo', videoId)
            }
        }
    })
}

function stopYouTubeVideo() {
    if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        ytPlayer.stopVideo()
    }
}

// ── HUD Toggle ────────────────────────────────────────────────────────────────
const hudToggle = document.getElementById('hudToggle')
const chatToggle = document.getElementById('chatToggle')
let hudVisible = true
let chatVisible = false

hudToggle.addEventListener('click', toggleHUD)

function toggleHUD() {
    hudVisible = !hudVisible
    document.body.classList.toggle('hud-hidden', !hudVisible)
    hudToggle.title = hudVisible ? 'Ocultar HUD (H)' : 'Mostrar HUD (H)'
}

chatToggle.addEventListener('click', toggleChat)
document.addEventListener('keydown', e => {
    if ((e.key === 'h' || e.key === 'H') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        toggleHUD()
    }
    if ((e.key === 'c' || e.key === 'C') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        toggleChat()
    }
})

function toggleChat() {
    chatVisible = !chatVisible
    const panel = document.getElementById('chatPanel')
    panel.classList.toggle('chat-visible', chatVisible)
    chatToggle.classList.toggle('chat-active', chatVisible)
    chatToggle.title = chatVisible ? 'Ocultar Chat (C)' : 'Mostrar Chat (C)'
    if (chatVisible) document.getElementById('chatInput').focus()
}

// ── Background Crossfade ──────────────────────────────────────────────────────
let activeBgLayer = 'A'

// Faz fetch com o header que bypassa o interstitial do ngrok.
// Retorna um blob: URL para uso direto em <img>, <video> ou background-image.
async function fetchAsBlobUrl(url) {
    const res = await fetch(url, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
}

async function applyScene({ url, mimeType }) {
    const layerA = document.getElementById('bgA')
    const layerB = document.getElementById('bgB')
    const next = activeBgLayer === 'A' ? layerB : layerA
    const prev = activeBgLayer === 'A' ? layerA : layerB

    next.innerHTML = ''
    next.style.backgroundImage = ''

    // Busca o arquivo via fetch com header de bypass do ngrok.
    // Isso garante que usuários externos recebam o arquivo real
    // em vez da página de interstitial do ngrok free tier.
    let displayUrl = url
    try {
        displayUrl = await fetchAsBlobUrl(url)
    } catch (e) {
        console.warn('[Cena] Fetch com bypass falhou, usando URL direta:', e.message)
    }

    if (mimeType && mimeType.startsWith('video/')) {
        const vid = document.createElement('video')
        vid.src = displayUrl
        vid.autoplay = true
        vid.loop = true
        vid.muted = true
        vid.playsInline = true
        vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
        next.appendChild(vid)
    } else {
        next.style.backgroundImage = `url('${displayUrl}')`
        next.style.backgroundSize = 'cover'
        next.style.backgroundPosition = 'center'
    }

    next.style.opacity = '1'
    prev.style.opacity = '0'
    activeBgLayer = activeBgLayer === 'A' ? 'B' : 'A'

    setTimeout(() => {
        // Revoga blob URLs anteriores para liberar memória
        const oldSrc = prev.style.backgroundImage.match(/url\(['"]?(blob:[^'")\s]+)/)
        if (oldSrc) URL.revokeObjectURL(oldSrc[1])
        prev.querySelectorAll('video').forEach(v => { URL.revokeObjectURL(v.src); v.src = '' })
        prev.innerHTML = ''
        prev.style.backgroundImage = ''
    }, 950)
}

const authScreen = document.getElementById('authScreen')
const tabLogin = document.getElementById('tabLogin')
const tabRegister = document.getElementById('tabRegister')
const loginFields = document.getElementById('loginFields')
const registerFields = document.getElementById('registerFields')
const usernameLoginInput = document.getElementById('usernameLoginInput')
const passwordInput = document.getElementById('passwordInput')
const usernameRegisterInput = document.getElementById('usernameRegisterInput')
const passwordRegisterInput = document.getElementById('passwordRegisterInput')
const authSubmitBtn = document.getElementById('authSubmitBtn')
const authInfo = document.getElementById('authInfo')

const connectScreen = document.getElementById('connectScreen')
const connectSubtitle = document.getElementById('connectSubtitle')
const createRoomButton = document.getElementById('createRoomButton')
const joinRoomButton = document.getElementById('joinRoomButton')
const roomCodeInput = document.getElementById('roomCodeInput')
const roomInfo = document.getElementById('roomInfo')
const logoutBtn = document.getElementById('logoutBtn')

const roomBadge = document.getElementById('roomBadge')
const roomBadgeCode = document.getElementById('roomBadgeCode')
const diceResultEl = document.getElementById('diceResult')
const diceResultLabel = document.getElementById('diceResultLabel')
const diceResultValue = document.getElementById('diceResultValue')
const diceResultCrit = document.getElementById('diceResultCrit')
const diceFab = document.getElementById('diceFab')
const diceMainBtn = document.getElementById('diceMainBtn')
const diceMenu = document.getElementById('diceMenu')
const characterBar = document.getElementById('characterBar')

const charModal = document.getElementById('charModal')
const charNameInput = document.getElementById('charName')
const charHpInput = document.getElementById('charHp')
const charSanityInput = document.getElementById('charSanity')
const charBulletsInput = document.getElementById('charBullets')
const charPhotoInput = document.getElementById('charPhoto')
const charSubmitBtn = document.getElementById('charSubmitBtn')
const charModalInfo = document.getElementById('charModalInfo')
const photoUploadLabel = document.getElementById('photoUploadLabel')
const photoLabelText = document.getElementById('photoLabelText')

function showAuthInfo(msg, type = '') {
    authInfo.textContent = msg
    authInfo.className = 'info-box visible ' + type
}
function clearAuthInfo() {
    authInfo.className = 'info-box'
    authInfo.textContent = ''
}
function setRoomInfo(msg, type = '') {
    roomInfo.textContent = msg
    roomInfo.className = 'info-box visible ' + type
}
function setAuthLoading(loading) {
    authSubmitBtn.disabled = loading
    authSubmitBtn.textContent = loading
        ? (isLoginMode ? 'Entrando...' : 'Criando conta...')
        : (isLoginMode ? 'Entrar na Taverna' : 'Criar Conta')
}
function usernameToEmail(username) {
    const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
    return `${clean}@rpglobby.internal`
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
tabLogin.addEventListener('click', () => {
    isLoginMode = true
    tabLogin.classList.add('active')
    tabRegister.classList.remove('active')
    loginFields.style.display = 'flex'
    registerFields.style.display = 'none'
    authSubmitBtn.textContent = 'Entrar na Taverna'
    clearAuthInfo()
})
tabRegister.addEventListener('click', () => {
    isLoginMode = false
    tabRegister.classList.add('active')
    tabLogin.classList.remove('active')
    loginFields.style.display = 'none'
    registerFields.style.display = 'flex'
    authSubmitBtn.textContent = 'Criar Conta'
    clearAuthInfo()
})
    ;[usernameLoginInput, passwordInput, usernameRegisterInput, passwordRegisterInput].forEach(el => {
        el.addEventListener('keydown', e => { if (e.key === 'Enter') authSubmitBtn.click() })
    })

// ── Auth submit ───────────────────────────────────────────────────────────────
authSubmitBtn.addEventListener('click', async () => {
    const username = isLoginMode ? usernameLoginInput.value.trim() : usernameRegisterInput.value.trim()
    const password = isLoginMode ? passwordInput.value : passwordRegisterInput.value

    if (!username || !password) { showAuthInfo('Preencha usuário e senha.', 'error'); return }
    if (username.length < 3) { showAuthInfo('Usuário deve ter pelo menos 3 caracteres.', 'error'); return }
    if (!supabase) { showAuthInfo('Erro interno: Supabase não inicializado.', 'error'); return }

    setAuthLoading(true)
    clearAuthInfo()
    try {
        if (isLoginMode) await handleLogin(username, password)
        else await handleRegister(username, password)
    } catch (e) {
        console.error('[Auth] Erro:', e)
        showAuthInfo(`Erro inesperado: ${e.message || e}`, 'error')
    } finally {
        setAuthLoading(false)
    }
})

async function handleLogin(username, password) {
    const email = usernameToEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { showAuthInfo(translateAuthError(error.message), 'error'); return }
    currentUserId = data.user.id
    try {
        const { data: profile } = await supabase.from('profiles').select('user').eq('id', data.user.id).single()
        playerName = profile?.user || username
    } catch (e) { playerName = username }
    localStorage.setItem('playerName', playerName)
    enterLobby(playerName)
}

async function handleRegister(username, password) {
    const email = usernameToEmail(username)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { showAuthInfo(translateAuthError(error.message), 'error'); return }
    if (data.user) {
        currentUserId = data.user.id
        try {
            await supabase.from('profiles').upsert({
                id: data.user.id, user: username, role: 'player',
                created_at: new Date().toISOString()
            })
            console.log('[Registro] Perfil criado com role: player')
        } catch (e) { console.warn('[Registro] Erro ao salvar perfil:', e) }
    }
    if (!data.session) { showAuthInfo('Conta criada!\nConfirme seu e-mail para entrar.', 'success'); return }
    playerName = username
    localStorage.setItem('playerName', playerName)
    enterLobby(playerName)
}

async function checkSession() {
    if (!supabase) return
    try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error || !session) return
        currentUserId = session.user.id
        try {
            const { data: profile } = await supabase.from('profiles').select('user').eq('id', session.user.id).single()
            if (profile?.user) { playerName = profile.user; localStorage.setItem('playerName', playerName) }
        } catch (e) { }
        enterLobby(playerName)
    } catch (e) { console.error('[Session] Erro:', e) }
}

function enterLobby(name) {
    connectSubtitle.textContent = `Bem-vindo, ${name}`
    authScreen.style.display = 'none'
    connectScreen.style.display = 'flex'
}

logoutBtn.addEventListener('click', async () => {
    try { await supabase.auth.signOut() } catch (e) { }
    currentUserId = null
    playerCharacters = []
    if (socket) { socket.disconnect(); socket = null }
    characterBar.style.display = 'none'
    characterBar.innerHTML = ''
    connectScreen.style.display = 'none'
    authScreen.style.display = 'flex'
    usernameLoginInput.value = ''
    passwordInput.value = ''
    usernameRegisterInput.value = ''
    passwordRegisterInput.value = ''
    tabLogin.click()
    clearAuthInfo()
})

function translateAuthError(msg) {
    if (msg.includes('Invalid login credentials')) return 'Usuário ou senha incorretos.'
    if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
    if (msg.includes('User already registered')) return 'Este usuário já possui uma conta.'
    if (msg.includes('Password should be')) return 'A senha deve ter pelo menos 6 caracteres.'
    if (msg.includes('Unable to validate')) return 'Usuário inválido.'
    if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns segundos.'
    if (msg.includes('fetch')) return 'Erro de rede. Verifique sua conexão.'
    return msg
}

// ── Criar / entrar na sala ────────────────────────────────────────────────────
const rooms = {}

createRoomButton.addEventListener('click', () => {
    setRoomInfo('Preparando a taverna...')
    createRoomButton.disabled = true
    ipcRenderer.send('create-room')
})

ipcRenderer.on('room-created', (event, data) => {
    isRoomMaster = true
    currentRoomCode = data.roomCode
    serverUrl = data.publicUrl
    rooms[data.roomCode.toLowerCase()] = data.publicUrl
    clipboard.writeText(data.publicUrl)
    setRoomInfo(`Sala aberta! Código: ${data.roomCode}\n\nURL copiada para a área de transferência.\nCompartilhe com seus aliados remotos.`, 'success')
    createRoomButton.disabled = false
    roomBadgeCode.textContent = data.roomCode
    fetch(`${data.publicUrl}/register-room`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ code: data.roomCode, url: data.publicUrl })
    }).catch(e => console.error('[Room] Erro ao registrar sala:', e))

    // Salva código→URL no Supabase para resolução remota por jogadores externos.
    // Requer a tabela room_codes — ver SQL de criação no README.
    if (supabase) {
        supabase.from('room_codes')
            .upsert({ code: data.roomCode, url: data.publicUrl, created_at: new Date().toISOString() })
            .then(({ error }) => {
                if (error) console.warn('[Room] Supabase room_codes falhou:', error.message, '— crie a tabela no Supabase!')
                else console.log('[Room] Código registrado no Supabase:', data.roomCode)
            })
    }

    connectToRoom(data.publicUrl, data.roomCode)
})

ipcRenderer.on('room-error', (event, data) => {
    setRoomInfo(`Erro: ${data.message}`, 'error')
    createRoomButton.disabled = false
})

joinRoomButton.addEventListener('click', async () => {
    const input = roomCodeInput.value.trim()
    if (!input) { roomCodeInput.focus(); return }
    let roomUrl = null, roomCode = input

    if (/^https?:\/\//i.test(input)) {
        // Input já é uma URL completa
        roomUrl = input
        roomCode = input
    } else {
        const code = input.toUpperCase()
        roomCode = code

        // 1) Memória local (mesma sessão/janela)
        roomUrl = rooms[input.toLowerCase()] || null

        // 2) Servidor local em localhost (mesma máquina, outra instância)
        if (!roomUrl) {
            try {
                const r = await fetch(`http://localhost:3001/resolve-code/${code}`, {
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                })
                const json = await r.json()
                if (json.url) roomUrl = json.url
            } catch (e) { /* usuário externo, localhost inacessível — esperado */ }
        }

        // 3) Supabase — única forma de funcionar para usuários externos
        //    Requer tabela room_codes no Supabase (ver SQL abaixo)
        if (!roomUrl && supabase) {
            setRoomInfo('Procurando sala...', '')
            try {
                const { data: row, error } = await supabase
                    .from('room_codes')
                    .select('url')
                    .eq('code', code)
                    .maybeSingle()

                if (error) {
                    // Tabela provavelmente não existe
                    console.error('[Room] Supabase room_codes erro:', error.message)
                    setRoomInfo(
                        'Tabela room_codes não encontrada no Supabase.\n' +
                        'Execute no SQL Editor do Supabase:\n\n' +
                        'create table room_codes (\n  code text primary key,\n  url text not null,\n  created_at timestamptz default now()\n);\n' +
                        'alter table room_codes enable row level security;\n' +
                        'create policy "public rw" on room_codes for all using (true) with check (true);',
                        'error'
                    )
                    return
                }

                if (row?.url) roomUrl = row.url
            } catch (e) {
                console.warn('[Room] Supabase lookup exceção:', e)
            }
        }

        if (!roomUrl) {
            setRoomInfo('Código não encontrado.\nVerifique o código ou use a URL completa do ngrok.', 'error')
            return
        }
    }

    connectToRoom(roomUrl, roomCode)
})

// ── Socket ────────────────────────────────────────────────────────────────────
const cursors = {}

function connectToRoom(url, roomCode) {
    currentRoomCode = (roomCode || 'DEFAULT').toString().trim().toUpperCase()
    if (!serverUrl) serverUrl = url.replace(/\/$/, '')

    socket = io(url, { auth: { roomCode: currentRoomCode }, transports: ['websocket'] })

    socket.on('connect', async () => {
        console.log('[Socket] Conectado:', socket.id)
        connectScreen.style.display = 'none'
        diceFab.style.display = 'block'
        roomBadge.style.display = 'block'
        hudToggle.style.display = 'flex'
        hudToggle.style.alignItems = 'center'
        hudToggle.style.justifyContent = 'center'
        chatToggle.style.display = 'flex'
        chatToggle.style.alignItems = 'center'
        chatToggle.style.justifyContent = 'center'
        const chatPanel = document.getElementById('chatPanel')
        chatPanel.style.display = 'flex'
        roomBadgeCode.textContent = currentRoomCode
        initMusicPanel()
        initChat()
        await loadAndShareCharacters()
    })

    socket.on('master_status', (isMaster) => {
        isRoomMaster = isMaster
        console.log('[Música] Status de mestre:', isMaster)
        initMusicPanel() // Re-inicializa para mostrar/ocultar controles
    })

    socket.on('connect_error', (err) => {
        console.error('[Socket] Erro:', err.message)
        setRoomInfo(`Erro ao conectar à sala: ${err.message}`, 'error')
    })

    socket.on('dice_result', showDiceResult)

    // ── Música ────────────────────────────────────────────────────────────────
    socket.on('music_play', ({ videoId, startedBy, seekTime }) => {
        console.log('[Música] Tocando:', videoId, 'por', startedBy, 'seek:', seekTime)
        pendingVideoId = null
        pendingSeekTime = 0
        loadYouTubeAPI()
        playYouTubeVideo(videoId, seekTime || 0)
        showMusicActive(videoId, startedBy)
    })

    socket.on('music_stop', () => {
        stopYouTubeVideo()
        hideMusicActive()
    })

    // ── Cena de fundo ─────────────────────────────────────────────────────────
    socket.on('scene_change', (data) => {
        console.log('[Cena] Nova cena recebida:', data.url)
        applyScene(data)
    })

    // Recebe lista completa de personagens de todos os jogadores da sala
    socket.on('room_characters', (allChars) => {
        console.log('[Characters] room_characters:', allChars.length, 'entradas')
        renderCharacterBar(allChars)
    })

    // Recebe atualização de atributo em tempo real
    socket.on('stat_update', ({ charId, field, value, ownerName }) => {
        console.log('[Stat] recebido:', field, '=', value, 'para', charId)

        const entry = allCharsCache.find(e => e.character.id === charId)
        const oldVal = entry ? entry.character[field] : null

        // Se o valor já está atualizado (enviado por nós mesmos), não reprocessa
        if (oldVal === value) return

        // Atualiza cache
        if (entry) entry.character[field] = value

        // Atualiza playerCharacters local se for do jogador
        const ownChar = playerCharacters.find(c => c.id === charId)
        if (ownChar) ownChar[field] = value

        // Atualiza card visual
        updateCardStat(charId, field, value)

        // Atualiza popup se aberto para este personagem
        if (statPopupCharId === charId) {
            if (field === 'hp') statHpVal.value = value
            else if (field === 'hp_max') statHpMax.value = value
            else if (field === 'sanity') statSanVal.value = value
            else if (field === 'sanity_max') statSanMax.value = value
            else if (field === 'bullets') statBulletsVal.value = value
        }

        // Flash visual
        if (field === 'hp') flashCard(charId, value < oldVal ? 'red' : 'green')
        else if (field === 'sanity') flashCard(charId, 'blue')
    })

    // ── Chat ──────────────────────────────────────────────────────────────────
    socket.on('chat_message', ({ playerName: from, message }) => {
        addChatMessage(from, message, from === playerName)
    })

    socket.on('players_update', (players) => {
        Object.values(cursors).forEach(c => c.remove())
        for (const k in cursors) delete cursors[k]
        for (const id in players) {
            if (id === socket.id) continue
            const wrap = document.createElement('div')
            wrap.className = 'cursor'
            wrap.style.left = players[id].x + 'px'
            wrap.style.top = players[id].y + 'px'
            const dot = document.createElement('div')
            dot.className = 'cursor-dot'
            wrap.appendChild(dot)
            document.body.appendChild(wrap)
            cursors[id] = wrap
        }
    })

    document.onmousemove = (e) => { if (socket) socket.emit('mouse_move', { x: e.clientX, y: e.clientY }) }
}

// ── Personagens ───────────────────────────────────────────────────────────────
async function loadAndShareCharacters() {
    if (!currentUserId || !supabase) return
    try {
        const { data: chars, error } = await supabase.from('characters').select('*').eq('user_id', currentUserId)
        if (error) { console.error('[Characters] Erro ao carregar:', error.message); return }
        playerCharacters = chars || []
        console.log('[Characters] Carregados:', playerCharacters.length)
        if (playerCharacters.length === 0) {
            openCharModal()
        } else {
            emitCharacters()
        }
    } catch (e) { console.error('[Characters] Erro:', e) }
}

function emitCharacters() {
    if (!socket) return
    socket.emit('share_characters', { playerName, characters: playerCharacters })
    console.log('[Characters] Emitidos para a sala:', playerCharacters.length)
}

// ── Stat Popup ────────────────────────────────────────────────────────────────
let statPopupCharId = null
let statPopupChar = null   // referência ao objeto char em memória (allChars cache)
let allCharsCache = []     // cache da última room_characters recebida

const statPopup = document.getElementById('statPopup')
const statPopupName = document.getElementById('statPopupName')
const statPopupClose = document.getElementById('statPopupClose')
const statPopupHeader = document.getElementById('statPopupHeader')
const statHpVal = document.getElementById('statHpVal')
const statHpMax = document.getElementById('statHpMax')
const statSanVal = document.getElementById('statSanVal')
const statSanMax = document.getElementById('statSanMax')
const statBulletsVal = document.getElementById('statBulletsVal')
const statRowSan = document.getElementById('statRowSan')
const statRowBullets = document.getElementById('statRowBullets')

// ── Drag: reutilizável ────────────────────────────────────────────────────────
function makeDraggable(el, handle) {
    let isDragging = false, ox = 0, oy = 0
    handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return
        isDragging = true
        el.style.transform = ''   // limpa transform para não atrapalhar getBoundingClientRect
        const r = el.getBoundingClientRect()
        ox = e.clientX - r.left
        oy = e.clientY - r.top
        e.preventDefault()
    })
    document.addEventListener('mousemove', e => {
        if (!isDragging) return
        const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - el.offsetWidth))
        const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - el.offsetHeight))
        el.style.left = x + 'px'
        el.style.top = y + 'px'
    })
    document.addEventListener('mouseup', () => { isDragging = false })
}

makeDraggable(statPopup, statPopupHeader)

statPopupClose.addEventListener('click', closeStatPopup)
document.addEventListener('click', (e) => {
    if (statPopup.classList.contains('visible')
        && !statPopup.contains(e.target)
        && !inventoryModal.contains(e.target)) {
        closeStatPopup()
    }
})

function openStatPopup(char, ownerName, cardEl) {
    statPopupCharId = char.id
    statPopupChar = char
    statPopupName.textContent = char.name

    const canEdit = isRoomMaster || ownerName === playerName

    // HP
    statHpVal.value = char.hp ?? 0
    statHpMax.value = char.hp_max ?? char.hp ?? 0
    statHpVal.disabled = !canEdit
    statHpMax.disabled = !canEdit
    statRowSan.style.display = char.sanity != null ? 'flex' : 'none'

    // Sanidade
    if (char.sanity != null) {
        statSanVal.value = char.sanity
        statSanMax.value = char.sanity_max ?? char.sanity ?? 0
        statSanVal.disabled = !canEdit
        statSanMax.disabled = !canEdit
    }

    // Balas
    statRowBullets.style.display = char.bullets != null ? 'flex' : 'none'
    if (char.bullets != null) {
        statBulletsVal.value = char.bullets
        statBulletsVal.disabled = !canEdit
    }

    statPopup.querySelectorAll('.stat-adj-btn').forEach(btn => { btn.disabled = !canEdit })

    // Posiciona: mede a altura real antes de mostrar
    statPopup.style.visibility = 'hidden'
    statPopup.style.transform = ''
    statPopup.classList.add('visible')

    requestAnimationFrame(() => {
        const pw = statPopup.offsetWidth
        const ph = statPopup.offsetHeight
        const rect = cardEl.getBoundingClientRect()

        // Preferência: acima do card; se não couber, vai abaixo
        let top = rect.top - ph - 8
        if (top < 8) top = rect.bottom + 8

        let left = rect.left
        // Clamp: não sair da tela horizontalmente
        left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
        // Clamp: não sair da tela verticalmente
        top = Math.max(8, Math.min(top, window.innerHeight - ph - 8))

        statPopup.style.left = left + 'px'
        statPopup.style.top = top + 'px'
        statPopup.style.visibility = 'visible'
    })
}

function closeStatPopup() {
    statPopup.classList.remove('visible')
    statPopupCharId = null
    statPopupChar = null
    inventoryModal.classList.remove('visible')
}

// Adj buttons (−/+)
statPopup.querySelectorAll('.stat-adj-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const field = btn.dataset.field
        const delta = parseInt(btn.dataset.delta)
        let input
        if (field === 'hp') input = statHpVal
        else if (field === 'sanity') input = statSanVal
        else if (field === 'bullets') input = statBulletsVal
        if (!input || input.disabled) return
        const newVal = Math.max(0, (parseInt(input.value) || 0) + delta)
        input.value = newVal
        commitStatChange(field, newVal)
    })
})

    // Typing directly in input
    ;[
        { input: statHpVal, field: 'hp' },
        { input: statHpMax, field: 'hp_max' },
        { input: statSanVal, field: 'sanity' },
        { input: statSanMax, field: 'sanity_max' },
        { input: statBulletsVal, field: 'bullets' }
    ].forEach(({ input, field }) => {
        input.addEventListener('change', () => {
            const v = Math.max(0, parseInt(input.value) || 0)
            input.value = v
            commitStatChange(field, v)
        })
    })

// ── Inventory Modal ───────────────────────────────────────────────────────────
const inventoryModal = document.getElementById('inventoryModal')
const invModalHeader = document.getElementById('invModalHeader')
const invModalCharName = document.getElementById('invModalCharName')
const invGrid = document.getElementById('invGrid')
const invGridEmpty = document.getElementById('invGridEmpty')
const invModalFooter = document.getElementById('invModalFooter')
const invItemInput = document.getElementById('invItemInput')
const invAddBtn = document.getElementById('invAddBtn')

makeDraggable(inventoryModal, invModalHeader)

document.getElementById('inventoryClose').addEventListener('click', () => {
    inventoryModal.classList.remove('visible')
})

// Só fecha o modal de inventário com click fora se o stat popup também não estiver sendo clicado
document.addEventListener('click', e => {
    if (inventoryModal.classList.contains('visible')
        && !inventoryModal.contains(e.target)
        && !statPopup.contains(e.target)) {
        inventoryModal.classList.remove('visible')
    }
})

// Inventários em memória: { [charId]: [ { id, icon, name } ] }
const inventories = {}

const ICON_MAP = {
    espada: '⚔', faca: '🗡', adaga: '🗡', sword: '⚔', knife: '🗡',
    arco: '🏹', bow: '🏹', flecha: '🏹',
    escudo: '🛡', shield: '🛡',
    'poção': '🧪', pocao: '🧪', potion: '🧪', frasco: '🧪', elixir: '🧪',
    livro: '📖', book: '📖', grimório: '📖',
    mapa: '🗺', map: '🗺',
    chave: '🗝', key: '🗝',
    ouro: '🪙', gold: '🪙', moeda: '🪙', coin: '🪙',
    lanterna: '🔦', torch: '🔥', tocha: '🔥',
    comida: '🍖', food: '🍖', ração: '🍖',
    corda: '🪢', rope: '🪢',
    bomba: '💣', bomb: '💣',
    elmo: '⛑', helmet: '⛑', capacete: '⛑',
    magia: '✨', magic: '✨', runa: '✨',
    pergaminho: '📜', scroll: '📜',
    anel: '💍', ring: '💍',
    amuleto: '🔮', amulet: '🔮',
    pistola: '🔫', gun: '🔫', revólver: '🔫',
    bala: '🔫', bullets: '🔫',
    machado: '🪓', axe: '🪓',
    martelo: '🔨', hammer: '🔨',
    bastão: '🪄', staff: '🪄', cajado: '🪄',
}

function getItemIcon(name) {
    const lc = name.toLowerCase()
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (lc.includes(key)) return icon
    }
    return '📦'
}

document.getElementById('openInventoryBtn').addEventListener('click', () => {
    if (!statPopupChar) return
    openInventoryModal(statPopupChar)
})

function openInventoryModal(char) {
    invModalCharName.textContent = char.name
    if (!inventories[char.id]) inventories[char.id] = []

    // Só o mestre vê o footer de adicionar itens
    invModalFooter.style.display = isRoomMaster ? 'flex' : 'none'

    renderInvGrid(char.id)

    // Posiciona ao lado do stat popup; fallback: centro da tela
    inventoryModal.style.visibility = 'hidden'
    inventoryModal.classList.add('visible')

    requestAnimationFrame(() => {
        const mw = inventoryModal.offsetWidth
        const mh = inventoryModal.offsetHeight
        const sp = statPopup.getBoundingClientRect()

        let left = sp.right + 10
        if (left + mw > window.innerWidth - 8) left = sp.left - mw - 10
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8))

        let top = sp.top
        top = Math.max(8, Math.min(top, window.innerHeight - mh - 8))

        inventoryModal.style.left = left + 'px'
        inventoryModal.style.top = top + 'px'
        inventoryModal.style.visibility = 'visible'
    })
}

function renderInvGrid(charId) {
    // Remove tiles antigos mas preserva o empty msg
    invGrid.querySelectorAll('.inv-item-tile').forEach(el => el.remove())
    const items = inventories[charId] || []
    invGridEmpty.style.display = items.length === 0 ? 'block' : 'none'
    items.forEach(item => invGrid.insertBefore(buildInvTile(item, charId), invGridEmpty))
}

function buildInvTile(item, charId) {
    const tile = document.createElement('div')
    tile.className = 'inv-item-tile'
    tile.dataset.itemId = item.id

    const icon = document.createElement('span')
    icon.className = 'inv-item-tile-icon'
    icon.textContent = item.icon

    const name = document.createElement('span')
    name.className = 'inv-item-tile-name'
    name.textContent = item.name

    // Botão de deletar — só visível no hover, só funciona para o mestre
    if (isRoomMaster) {
        const del = document.createElement('button')
        del.className = 'inv-item-del-tile'
        del.textContent = '✕'
        del.title = 'Remover'
        del.addEventListener('click', e => {
            e.stopPropagation()
            inventories[charId] = inventories[charId].filter(i => i.id !== item.id)
            renderInvGrid(charId)
        })
        tile.appendChild(del)
    }

    tile.appendChild(icon)
    tile.appendChild(name)
    return tile
}

invAddBtn.addEventListener('click', addInvItem)
invItemInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addInvItem() }
    e.stopPropagation()
})

function addInvItem() {
    if (!statPopupChar || !isRoomMaster) return
    const name = invItemInput.value.trim()
    if (!name) { invItemInput.focus(); return }
    const item = { id: crypto.randomUUID(), icon: getItemIcon(name), name }
    if (!inventories[statPopupChar.id]) inventories[statPopupChar.id] = []
    inventories[statPopupChar.id].push(item)
    invItemInput.value = ''
    renderInvGrid(statPopupChar.id)
}

function commitStatChange(field, value) {
    if (!statPopupCharId || !socket) return

    // Captura valor anterior para flash local
    const cachedEntry = allCharsCache.find(e => e.character.id === statPopupCharId)
    const oldVal = cachedEntry ? cachedEntry.character[field] : null

    // Update local cache immediately
    if (cachedEntry) cachedEntry.character[field] = value

    // Update playerCharacters if owned
    const ownChar = playerCharacters.find(c => c.id === statPopupCharId)
    if (ownChar) ownChar[field] = value

    // Update card visually
    updateCardStat(statPopupCharId, field, value)

    // Flash local (o quem alterou também vê o efeito)
    if (oldVal !== null && oldVal !== value) {
        if (field === 'hp') flashCard(statPopupCharId, value < oldVal ? 'red' : 'green')
        else if (field === 'sanity') flashCard(statPopupCharId, 'blue')
    }

    // Persist to Supabase
    supabase.from('characters').update({ [field]: value }).eq('id', statPopupCharId)
        .then(({ error }) => { if (error) console.warn('[Stat] Supabase update error:', error.message) })

    // Broadcast via socket
    socket.emit('stat_update', { charId: statPopupCharId, field, value, ownerName: playerName })
}

function updateCardStat(charId, field, value) {
    const card = characterBar.querySelector(`[data-char-id="${charId}"]`)
    if (!card) return

    const entry = allCharsCache.find(e => e.character.id === charId)
    const char = entry ? entry.character : null

    if (field === 'hp' || field === 'hp_max') {
        const hp = field === 'hp' ? value : (char ? char.hp : value)
        const hpMax = field === 'hp_max' ? value : (char ? (char.hp_max ?? char.hp ?? 1) : 1)
        const fill = card.querySelector('.hp-fill')
        const val = card.querySelector('[data-stat-field="hp"]')
        if (fill) fill.style.width = Math.max(0, Math.min(100, (hp / hpMax) * 100)) + '%'
        if (val) val.textContent = `${hp}/${hpMax}`
    } else if (field === 'sanity' || field === 'sanity_max') {
        const san = field === 'sanity' ? value : (char ? char.sanity : value)
        const sanMax = field === 'sanity_max' ? value : (char ? (char.sanity_max ?? char.sanity ?? 1) : 1)
        const fill = card.querySelector('.san-fill')
        const val = card.querySelector('[data-stat-field="sanity"]')
        if (fill) fill.style.width = Math.max(0, Math.min(100, (san / sanMax) * 100)) + '%'
        if (val) val.textContent = `${san}/${sanMax}`
    } else if (field === 'bullets') {
        const val = card.querySelector('[data-stat-field="bullets"]')
        if (val) val.textContent = `🔫 ${value}`
    }
}

function flashCard(charId, type) {
    // type: 'red' | 'green' | 'blue'
    const card = characterBar.querySelector(`[data-char-id="${charId}"]`)
    if (!card) return
    card.classList.remove('flash-red', 'flash-green', 'flash-blue')
    void card.offsetWidth // reflow
    card.classList.add(`flash-${type}`)
    setTimeout(() => card.classList.remove(`flash-${type}`), 750)
}

// allChars = [ { playerName, character }, ... ]
function renderCharacterBar(allChars) {
    allCharsCache = allChars || []
    characterBar.innerHTML = ''
    if (!allChars || allChars.length === 0) { characterBar.style.display = 'none'; return }
    allChars.forEach(({ playerName: owner, character }) => {
        characterBar.appendChild(buildCharCard(character, owner))
    })
    characterBar.style.display = 'flex'
}

function buildCharCard(char, ownerName) {
    const card = document.createElement('div')
    card.className = 'char-card clickable'
    card.dataset.charId = char.id
    card.dataset.ownerName = ownerName
    if (ownerName === playerName) card.style.borderColor = 'rgba(201,168,76,0.65)'

    // Foto
    const photoWrap = document.createElement('div')
    photoWrap.className = 'char-card-photo-wrap'
    if (char.photo) {
        const img = document.createElement('img')
        img.className = 'char-card-photo'
        img.src = char.photo
        img.alt = char.name
        img.onerror = () => { img.style.display = 'none'; photoWrap.appendChild(buildPhotoPlaceholder()) }
        photoWrap.appendChild(img)
    } else {
        photoWrap.appendChild(buildPhotoPlaceholder())
    }
    card.appendChild(photoWrap)

    // Info
    const info = document.createElement('div')
    info.className = 'char-card-info'

    const ownerEl = document.createElement('div')
    ownerEl.style.cssText = 'font-family:"Cinzel",serif;font-size:8px;letter-spacing:.15em;color:rgba(201,168,76,.45);text-transform:uppercase;margin-bottom:1px;'
    ownerEl.textContent = ownerName
    info.appendChild(ownerEl)

    const nameEl = document.createElement('div')
    nameEl.className = 'char-card-name'
    nameEl.textContent = char.name
    info.appendChild(nameEl)

    info.appendChild(buildStatRow('Vida', char.hp, char.hp_max ?? char.hp ?? 1, 'hp-fill', 'hp'))
    if (char.sanity != null) info.appendChild(buildStatRow('Sanidade', char.sanity, char.sanity_max ?? char.sanity ?? 1, 'san-fill', 'sanity'))
    if (char.bullets != null) {
        const row = document.createElement('div')
        row.className = 'char-bullets'
        const lbl = document.createElement('span'); lbl.className = 'char-bullets-label'; lbl.textContent = 'Balas'
        const val = document.createElement('span')
        val.className = 'char-bullets-val'
        val.dataset.statField = 'bullets'
        val.textContent = `🔫 ${char.bullets}`
        row.appendChild(lbl); row.appendChild(val)
        info.appendChild(row)
    }
    card.appendChild(info)

    card.addEventListener('click', (e) => {
        e.stopPropagation()
        // Players só abrem o próprio card; o mestre abre qualquer um
        if (!isRoomMaster && ownerName !== playerName) return
        // Sempre busca a versão mais recente do cache para ter os valores atualizados
        const fresh = allCharsCache.find(e => e.character.id === char.id)
        openStatPopup(fresh ? fresh.character : char, ownerName, card)
    })

    return card
}

function buildPhotoPlaceholder() {
    const ph = document.createElement('div')
    ph.className = 'char-card-photo-placeholder'
    ph.textContent = '⚔'
    return ph
}

function buildStatRow(label, value, max, fillClass, fieldName) {
    const row = document.createElement('div')
    row.className = 'char-stat'

    const lbl = document.createElement('span')
    lbl.className = 'char-stat-label'
    lbl.textContent = label

    const bar = document.createElement('div')
    bar.className = 'char-stat-bar'

    const fill = document.createElement('div')
    fill.className = `char-stat-fill ${fillClass}`
    fill.style.width = Math.max(0, Math.min(100, (value / max) * 100)) + '%'

    const val = document.createElement('span')
    val.className = 'char-stat-val'

    // 🔥 AQUI É A CORREÇÃO
    val.dataset.statField = fieldName

    val.textContent = `${value}/${max}`

    bar.appendChild(fill)
    row.appendChild(lbl)
    row.appendChild(bar)
    row.appendChild(val)

    return row
}

// ── Modal de personagem ───────────────────────────────────────────────────────
function openCharModal() { charModal.style.display = 'flex'; charModalInfo.className = 'info-box'; charModalInfo.textContent = '' }
function closeCharModal() { charModal.style.display = 'none' }

charPhotoInput.addEventListener('change', () => {
    const file = charPhotoInput.files[0]
    if (file) { photoLabelText.textContent = file.name; photoUploadLabel.classList.add('has-file') }
    else { photoLabelText.textContent = 'Clique para escolher imagem'; photoUploadLabel.classList.remove('has-file') }
})

charSubmitBtn.addEventListener('click', async () => {
    const name = charNameInput.value.trim()
    const hpMax = parseInt(charHpInput.value)
    const sanityMax = charSanityInput.value !== '' ? parseInt(charSanityInput.value) : null
    const bullets = charBulletsInput.value !== '' ? parseInt(charBulletsInput.value) : null
    const photoFile = charPhotoInput.files[0] || null

    if (!name) { showCharModalInfo('O nome do personagem é obrigatório.', 'error'); return }
    if (isNaN(hpMax) || !charHpInput.value) { showCharModalInfo('Vida Máxima (HP) é obrigatória.', 'error'); return }

    charSubmitBtn.disabled = true
    charSubmitBtn.textContent = 'Invocando...'
    showCharModalInfo('', '')

    try {
        const charId = crypto.randomUUID()
        let photoUrl = null

        // ── Upload via Node fs (Electron — File.path dá o caminho real) ──────
        if (photoFile) {
            const ext = photoFile.name.split('.').pop().toLowerCase()
            const filePath = `${currentUserId}/${charId}/photo.${ext}`
            const mimeType = photoFile.type || `image/${ext}`

            console.log('[Photo] usando File API')

            try {
                const arrayBuffer = await photoFile.arrayBuffer()

                const { data, error } = await supabase.storage
                    .from('CharactersAndItems')
                    .upload(filePath, arrayBuffer, {
                        contentType: mimeType,
                        upsert: true
                    })

                console.log('[UPLOAD RESULT]', data)

                if (error) {
                    console.error('[ERRO UPLOAD]', error)
                    throw error
                }

                const { data: urlData } = supabase.storage
                    .from('CharactersAndItems')
                    .getPublicUrl(filePath)

                photoUrl = urlData?.publicUrl

            } catch (err) {
                console.error('[ERRO FOTO]', err)
            }
        }

        // ── Inserir no banco: hp_current = hp_max, sanity_current = sanity_max ──
        const { data: newChar, error: insertError } = await supabase
            .from('characters')
            .insert({
                id: charId,
                user_id: currentUserId,
                name,
                hp: hpMax,
                hp_max: hpMax,
                sanity: sanityMax,
                sanity_max: sanityMax,
                bullets,
                photo: photoUrl
            })
            .select()
            .single()

        if (insertError) throw new Error(insertError.message)

        console.log('[Characters] Criado:', newChar.id)
        playerCharacters.push(newChar)

        closeCharModal()
        emitCharacters()   // distribui para a sala via socket

        charNameInput.value = ''; charHpInput.value = ''; charSanityInput.value = ''
        charBulletsInput.value = ''; charPhotoInput.value = ''
        photoLabelText.textContent = 'Clique para escolher imagem'
        photoUploadLabel.classList.remove('has-file')

    } catch (e) {
        console.error('[Characters] Erro ao criar:', e)
        showCharModalInfo(`Erro: ${e.message}`, 'error')
    } finally {
        charSubmitBtn.disabled = false
        charSubmitBtn.textContent = '⚔ Invocar Personagem'
    }
})

function showCharModalInfo(msg, type) {
    charModalInfo.textContent = msg
    charModalInfo.className = msg ? `info-box visible ${type}` : 'info-box'
}

// ── Badge da sala ─────────────────────────────────────────────────────────────
roomBadge.addEventListener('click', () => {
    if (!currentRoomCode) return
    clipboard.writeText(currentRoomCode)
    roomBadgeCode.textContent = `${currentRoomCode} ✓`
    setTimeout(() => { roomBadgeCode.textContent = currentRoomCode }, 2000)
})

// ── Dado FAB ──────────────────────────────────────────────────────────────────
const DICE = [
    { label: 'd4', sides: 4 }, { label: 'd6', sides: 6 }, { label: 'd8', sides: 8 },
    { label: 'd10', sides: 10 }, { label: 'd12', sides: 12 }, { label: 'd20', sides: 20 }, { label: 'd100', sides: 100 }
]

DICE.forEach(({ label, sides }) => {
    const wrap = document.createElement('div'); wrap.className = 'dice-option'
    const lbl = document.createElement('span'); lbl.className = 'dice-label'; lbl.textContent = label
    const btn = document.createElement('button'); btn.className = 'dice-btn'; btn.textContent = label; btn.title = `Rolar ${label}`
    btn.addEventListener('click', () => rollDice(sides, label))
    wrap.appendChild(lbl); wrap.appendChild(btn); diceMenu.appendChild(wrap)
})

let fabOpen = false
diceMainBtn.addEventListener('click', () => { fabOpen = !fabOpen; diceFab.classList.toggle('open', fabOpen) })
document.addEventListener('click', (e) => { if (fabOpen && !diceFab.contains(e.target)) { fabOpen = false; diceFab.classList.remove('open') } })

function rollDice(sides, label) {
    if (!socket) return
    socket.emit('dice_roll', { player: playerName, value: Math.floor(Math.random() * sides) + 1, sides, label })
    fabOpen = false; diceFab.classList.remove('open')
}

// ── Resultado do dado ─────────────────────────────────────────────────────────
let resultTimer = null

function showDiceResult(data) {
    const { player, value, sides, label } = data
    const dLabel = label || `d${sides || 20}`
    diceResultValue.textContent = value
    diceResultCrit.textContent = ''
    diceResultEl.classList.remove('crit', 'fail')
    if (sides === 20 || dLabel === 'd20') {
        if (value === 20) { diceResultCrit.textContent = '✦ CRÍTICO!'; diceResultEl.classList.add('crit') }
        else if (value === 1) { diceResultCrit.textContent = '✗ falha crítica'; diceResultEl.classList.add('fail') }
    }
    diceResultLabel.textContent = `${player} · ${dLabel}`
    diceResultEl.classList.add('show')
    clearTimeout(resultTimer)
    resultTimer = setTimeout(() => diceResultEl.classList.remove('show'), 4000)
}

// ── Painel de Música ──────────────────────────────────────────────────────────
function initMusicPanel() {
    const panel = document.getElementById('musicPanel')
    const masterControls = document.getElementById('musicMasterControls')
    const playBtn = document.getElementById('musicPlayBtn')
    const stopBtn = document.getElementById('musicStopBtn')
    const urlInput = document.getElementById('musicUrlInput')
    const volSlider = document.getElementById('volumeSlider')
    const volVal = document.getElementById('volumeVal')

    panel.style.display = 'block'

    if (isRoomMaster) {
        masterControls.style.display = 'block'
    } else {
        masterControls.style.display = 'none'
    }

    // Evita registrar listeners duplicados
    if (panel.dataset.inited) return
    panel.dataset.inited = '1'

    // Botão Tocar
    playBtn.addEventListener('click', () => {
        const url = urlInput.value.trim()
        if (!url) { urlInput.focus(); return }
        const videoId = extractYouTubeId(url)
        if (!videoId) {
            urlInput.style.borderColor = 'rgba(192,57,43,0.7)'
            setTimeout(() => urlInput.style.borderColor = '', 1500)
            return
        }
        socket.emit('play_music', { videoId, startedBy: playerName })
        urlInput.value = ''
    })

    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') playBtn.click() })

    // Botão Parar
    stopBtn.addEventListener('click', () => {
        socket.emit('stop_music', { stoppedBy: playerName })
    })

    // Slider de volume (apenas local)
    volSlider.addEventListener('input', () => {
        const v = parseInt(volSlider.value)
        volVal.textContent = v + '%'
        const icon = document.querySelector('.music-vol-icon')
        if (icon) icon.textContent = v === 0 ? '🔇' : '🔊'
        if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
            ytPlayer.setVolume(v)
        }
    })

    // ── Upload de cena ────────────────────────────────────────────────────────
    const scenePickerBtn = document.getElementById('scenePickerBtn')
    const sceneFileInput = document.getElementById('sceneFileInput')

    scenePickerBtn.addEventListener('click', () => sceneFileInput.click())

    sceneFileInput.addEventListener('change', async () => {
        const file = sceneFileInput.files[0]
        if (!file) return

        scenePickerBtn.textContent = '⏳ Enviando…'
        scenePickerBtn.disabled = true

        try {
            const ext = file.name.split('.').pop().toLowerCase()
            const uploadUrl = `${serverUrl}/upload-scene`

            const arrayBuffer = await file.arrayBuffer()

            const res = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': file.type || 'application/octet-stream',
                    'X-File-Ext': ext,
                    'ngrok-skip-browser-warning': 'true'
                },
                body: arrayBuffer
            })

            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const { scenePath } = await res.json()
            // scenePath é relativo ao servidor ngrok
            const fullUrl = `${serverUrl}${scenePath}`

            socket.emit('scene_change', { url: fullUrl, mimeType: file.type })
            console.log('[Cena] Upload concluído:', fullUrl)

        } catch (e) {
            console.error('[Cena] Erro no upload:', e)
            scenePickerBtn.textContent = '✗ Erro no upload'
            setTimeout(() => {
                scenePickerBtn.textContent = '🖼 Trocar Cena'
                scenePickerBtn.disabled = false
            }, 2500)
            return
        }

        scenePickerBtn.textContent = '✓ Cena enviada'
        setTimeout(() => {
            scenePickerBtn.textContent = '🖼 Trocar Cena'
            scenePickerBtn.disabled = false
        }, 2000)

        // Limpa o input para permitir selecionar o mesmo arquivo novamente
        sceneFileInput.value = ''
    })
}

function showMusicActive(videoId, startedBy) {
    const nowPlaying = document.getElementById('musicNowPlaying')
    const nowPlayingText = document.getElementById('musicNowPlayingText')
    const nowPlayingBy = document.getElementById('musicNowPlayingBy')
    const volumeRow = document.getElementById('musicVolumeRow')
    const stopBtn = document.getElementById('musicStopBtn')
    const musicNote = document.getElementById('musicNote')

    nowPlayingText.textContent = `youtube.com/watch?v=${videoId}`
    nowPlayingBy.textContent = startedBy
    nowPlaying.classList.add('visible')
    volumeRow.style.display = 'flex'
    musicNote.classList.add('active')

    if (isRoomMaster && stopBtn) stopBtn.style.display = 'block'
}

function hideMusicActive() {
    const nowPlaying = document.getElementById('musicNowPlaying')
    const volumeRow = document.getElementById('musicVolumeRow')
    const stopBtn = document.getElementById('musicStopBtn')
    const musicNote = document.getElementById('musicNote')

    nowPlaying.classList.remove('visible')
    volumeRow.style.display = 'none'
    musicNote.classList.remove('active')
    if (stopBtn) stopBtn.style.display = 'none'
}

// ── Chat ──────────────────────────────────────────────────────────────────────
const MSG_LIFETIME = 18000   // ms antes de começar a sumir
const MSG_FADE = 1200    // ms da transição de fade
const MAX_VISIBLE = 12      // máximo de msgs visíveis ao mesmo tempo

function initChat() {
    if (document.getElementById('chatInput').dataset.inited) return
    document.getElementById('chatInput').dataset.inited = '1'

    const input = document.getElementById('chatInput')
    const sendBtn = document.getElementById('chatSendBtn')

    function sendChat() {
        const msg = input.value.trim()
        if (!msg || !socket) return
        socket.emit('chat_message', { playerName, message: msg })
        input.value = ''
    }

    sendBtn.addEventListener('click', sendChat)
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); sendChat() }
        e.stopPropagation()   // impede que 'h' ou 'c' ativem atalhos de HUD/chat
    })
}

function addChatMessage(from, message, isOwn = false) {
    const container = document.getElementById('chatMessages')
    if (!container) return

    const el = document.createElement('div')
    el.className = 'chat-msg' + (isOwn ? ' chat-own' : '')

    const name = document.createElement('span')
    name.className = 'chat-name'
    name.textContent = from + ':'
    el.appendChild(name)
    el.appendChild(document.createTextNode(' ' + message))

    container.appendChild(el)

    // Mantém no máximo MAX_VISIBLE mensagens
    while (container.children.length > MAX_VISIBLE) {
        container.firstChild.remove()
    }

    // Auto-scroll ao fundo
    container.scrollTop = container.scrollHeight

    // Se o chat estiver fechado, mostra brevemente a mensagem mesmo assim
    const panel = document.getElementById('chatPanel')
    if (!chatVisible) {
        panel.style.display = 'flex'
        panel.style.pointerEvents = 'none'
    }

    // Inicia timer de fade-out
    const fadeTimer = setTimeout(() => {
        el.classList.add('chat-fading')
        setTimeout(() => { el.remove() }, MSG_FADE)
    }, MSG_LIFETIME)

    // Cancela o fade se o chat estiver aberto (não some enquanto visível)
    const observer = new MutationObserver(() => {
        if (chatVisible) { clearTimeout(fadeTimer); el.classList.remove('chat-fading') }
    })
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] })
}

// ── Init ──────────────────────────────────────────────────────────────────────
checkSession()
