const { io } = require('socket.io-client')
const state = require('./state')

const { applyScene } = require('./scene')
const { playYouTubeVideo, stopYouTubeVideo, loadYouTubeAPI, initMusicPanel, showMusicActive, hideMusicActive } = require('./music')
const { renderCharacterBar, updateCardStat, flashCard, loadAndShareCharacters } = require('./characters')
const { showDiceResult } = require('./dice')
const { initChat, addChatMessage } = require('./chat')
const { showHUDButtons } = require('./hud')
const { handleInventoryUpdate } = require('./inventory')
const { initNPC, handleNPCSummon, handleNPCDismiss } = require('./npc')
const { initSfxPanel, playSfxAudio } = require('./sfx')

function connectToRoom(url, roomCode) {
    state.currentRoomCode = (roomCode || 'DEFAULT').toString().trim().toUpperCase()
    if (!state.serverUrl) state.serverUrl = url.replace(/\/$/, '')

    state.socket = io(url, { auth: { roomCode: state.currentRoomCode }, transports: ['websocket'] })

    state.socket.on('connect', async () => {
        console.log('[Socket] Conectado:', state.socket.id)

        document.getElementById('connectScreen').style.display = 'none'
        document.getElementById('diceFab').style.display = 'block'
        document.getElementById('roomBadge').style.display = 'block'
        document.getElementById('roomBadgeCode').textContent = state.currentRoomCode

        showHUDButtons()
        initMusicPanel()
        initChat()
        await loadAndShareCharacters()
    })

    state.socket.on('master_status', isMaster => {
        state.isRoomMaster = isMaster
        initMusicPanel()   // mostra/oculta controles do mestre
        initNPC()          // configura painel de NPC (mestre) ou apenas listeners (players)
        initSfxPanel()      // mostra/oculta painel de efeitos sonoros
    })

    state.socket.on('connect_error', err => {
        console.error('[Socket] Erro:', err.message)
        document.getElementById('roomInfo').textContent = `Erro ao conectar à sala: ${err.message}`
        document.getElementById('roomInfo').className = 'info-box visible error'
    })

    // ── Dados ────────────────────────────────────────────────────────────────
    state.socket.on('dice_result', showDiceResult)

    // ── Música ───────────────────────────────────────────────────────────────
    state.socket.on('music_play', ({ videoId, startedBy, seekTime }) => {
        console.log('[Socket] music_play recebido — videoId:', videoId, 'seekTime:', seekTime)
        playYouTubeVideo(videoId, seekTime || 0)
        showMusicActive(videoId, startedBy)
    })
    state.socket.on('music_stop', () => {
        stopYouTubeVideo()
        hideMusicActive()
    })

    // ── Efeitos Sonoros ───────────────────────────────────────────────────────
    state.socket.on('play_sfx', ({ audioUrl, sfxName }) => {
        console.log('[Socket] play_sfx recebido —', sfxName)
        playSfxAudio(audioUrl)
    })

    // ── Cena de fundo ─────────────────────────────────────────────────────────
    state.socket.on('scene_change', data => applyScene(data))

    // ── Personagens ───────────────────────────────────────────────────────────
    state.socket.on('room_characters', allChars => renderCharacterBar(allChars))

    // ── Stats em tempo real ────────────────────────────────────────────────────
    state.socket.on('stat_update', ({ charId, field, value, ownerName }) => {
        const entry = state.allCharsCache.find(e => e.character.id === charId)
        const oldVal = entry?.character[field] ?? null

        if (oldVal === value) return   // já atualizado localmente

        if (entry) entry.character[field] = value

        const ownChar = state.playerCharacters.find(c => c.id === charId)
        if (ownChar) ownChar[field] = value

        updateCardStat(charId, field, value)

        // Atualiza popup se estiver aberto para este personagem
        if (state.statPopupCharId === charId) {
            const map = { hp: 'statHpVal', hp_max: 'statHpMax', sanity: 'statSanVal', sanity_max: 'statSanMax', bullets: 'statBulletsVal' }
            const inputId = map[field]
            if (inputId) { const el = document.getElementById(inputId); if (el) el.value = value }
        }

        if (field === 'hp') flashCard(charId, value < oldVal ? 'red' : 'green')
        else if (field === 'sanity') flashCard(charId, 'blue')
    })

    // ── Inventário ────────────────────────────────────────────────────────────
    state.socket.on('inventory_update', ({ charId, items }) => {
        handleInventoryUpdate({ charId, items })
    })

    // ── NPCs ──────────────────────────────────────────────────────────────────
    state.socket.on('npc_summon', npc => handleNPCSummon(npc))
    state.socket.on('npc_dismiss', ({ npcId }) => handleNPCDismiss({ npcId }))

    // ── Chat ──────────────────────────────────────────────────────────────────
    state.socket.on('chat_message', ({ playerName: from, message, type, gifUrl }) => {
        addChatMessage(from, message, from === state.playerName, type || 'text', gifUrl || null)
    })

    // ── Cursors ───────────────────────────────────────────────────────────────
    const cursors = {}
    state.socket.on('players_update', players => {
        Object.values(cursors).forEach(c => c.remove())
        for (const k in cursors) delete cursors[k]
        for (const id in players) {
            if (id === state.socket.id) continue
            const wrap = document.createElement('div'); wrap.className = 'cursor'
            wrap.style.left = players[id].x + 'px'
            wrap.style.top = players[id].y + 'px'
            const dot = document.createElement('div'); dot.className = 'cursor-dot'
            wrap.appendChild(dot)
            document.body.appendChild(wrap)
            cursors[id] = wrap
        }
    })

    document.onmousemove = e => {
        if (state.socket) state.socket.emit('mouse_move', { x: e.clientX, y: e.clientY })
    }
}

module.exports = { connectToRoom }
