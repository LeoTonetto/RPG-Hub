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
const { showReputation, initReputation } = require('./reputation')

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
        const leaveBtn = document.getElementById('leaveRoomBtn')
        if (leaveBtn) leaveBtn.style.display = 'block'
        showHUDButtons()
        initMusicPanel()
        initChat()
        await loadAndShareCharacters()
    })

    state.socket.on('master_status', isMaster => {
        state.isRoomMaster = isMaster
        initMusicPanel(); initNPC(); initSfxPanel(); initReputation()
    })

    state.socket.on('connect_error', err => {
        console.error('[Socket] Erro:', err.message)
        document.getElementById('roomInfo').textContent = `Erro ao conectar à sala: ${err.message}`
        document.getElementById('roomInfo').className = 'info-box visible error'
    })

    state.socket.on('dice_result', showDiceResult)

    state.socket.on('music_play', ({ videoId, startedBy, seekTime }) => { playYouTubeVideo(videoId, seekTime || 0); showMusicActive(videoId, startedBy) })
    state.socket.on('music_stop', () => { stopYouTubeVideo(); hideMusicActive() })
    state.socket.on('play_sfx', ({ audioUrl, sfxName }) => { playSfxAudio(audioUrl) })
    state.socket.on('scene_change', data => applyScene(data))
    state.socket.on('room_characters', allChars => renderCharacterBar(allChars))

    // ── Stats em tempo real ──────────────────────────────────────────────────
    state.socket.on('stat_update', ({ charId, field, value, ownerName }) => {
        const entry = state.allCharsCache.find(e => e.character.id === charId)
        const stats = entry?.character?.stats || {}
        const oldVal = stats[field] ?? null
        if (oldVal === value) return

        if (entry?.character?.stats) entry.character.stats[field] = value
        const ownChar = state.playerCharacters.find(c => c.id === charId)
        if (ownChar?.stats) ownChar.stats[field] = value

        updateCardStat(charId, field, value)

        if (state.statPopupCharId === charId) {
            const input = document.querySelector(`#statDynamicRows [data-stat-key="${field}"]`)
            if (input && document.activeElement !== input) {
                if (input.tagName === 'INPUT') input.value = value
                else input.textContent = value
            }
        }

        if (field === 'hp') flashCard(charId, value < oldVal ? 'red' : 'green')
        else if (field === 'sanity') flashCard(charId, 'blue')
    })

    // ── Reputação ────────────────────────────────────────────────────────────
    state.socket.on('reputation_show', showReputation)

    // ── Inventário / NPCs / Chat ─────────────────────────────────────────────
    state.socket.on('inventory_update', ({ charId, items }) => { handleInventoryUpdate({ charId, items }) })
    state.socket.on('npc_summon', npc => handleNPCSummon(npc))
    state.socket.on('npc_dismiss', ({ npcId }) => handleNPCDismiss({ npcId }))
    state.socket.on('chat_message', ({ playerName: from, message, type, gifUrl }) => { addChatMessage(from, message, from === state.playerName, type || 'text', gifUrl || null) })

    // ── Cursors ──────────────────────────────────────────────────────────────
    const cursors = {}
    state.socket.on('players_update', players => {
        Object.values(cursors).forEach(c => c.remove())
        for (const k in cursors) delete cursors[k]
        for (const id in players) {
            if (id === state.socket.id) continue
            const wrap = document.createElement('div'); wrap.className = 'cursor'
            wrap.style.left = players[id].x + 'px'; wrap.style.top = players[id].y + 'px'
            const dot = document.createElement('div'); dot.className = 'cursor-dot'
            wrap.appendChild(dot); document.body.appendChild(wrap); cursors[id] = wrap
        }
    })
    document.onmousemove = e => { if (state.socket) state.socket.emit('mouse_move', { x: e.clientX, y: e.clientY }) }
}

module.exports = { connectToRoom }
