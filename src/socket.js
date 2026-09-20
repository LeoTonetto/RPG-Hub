const { io } = require('socket.io-client')
const state = require('./state')

const { applyScene } = require('./scene')
const { playYouTubeVideo, stopYouTubeVideo, loadYouTubeAPI, initMusicPanel, showMusicActive, hideMusicActive } = require('./music')
const { renderCharacterBar, updateCardStat, flashCard, loadAndShareCharacters } = require('./characters')
const { showDiceResult, updateDiceMasterUI } = require('./dice')
const { initChat, addChatMessage } = require('./chat')
const { showHUDButtons } = require('./hud')
const { showConfigButton, emitirCor, COR_PADRAO } = require('./config')
const { handleInventoryUpdate, handleItemShow, handleItemTransferred } = require('./inventory')
const { initNPC, handleNPCSummon, handleNPCDismiss } = require('./npc')
const { initSfxPanel, playSfxAudio } = require('./sfx')
const { showReputation, initReputation } = require('./reputation')
const { initLockpicking, handleLockpickStart, handleLockpickResult } = require('./lockpicking')
const { showJournalButtons, handleMissionsSync, showObjectiveBanner, hideObjectiveBanner, loadMissions } = require('./journal')

function connectToRoom(url, roomCode) {
    // Reentrante de proposito: clicar duas vezes em entrar, ou trocar de sala,
    // encerra a conexao anterior em vez de acumular outra.
    desconectarSocketAtual()

    state.currentRoomCode = (roomCode || 'DEFAULT').toString().trim().toUpperCase()
    if (!state.serverUrl) state.serverUrl = url.replace(/\/$/, '')

    // O token so existe para quem criou a sala. Recuperamos do localStorage
    // tambem, para o mestre reassumir depois de fechar e reabrir o app.
    const backend = require('./backend')
    const masterToken = state.masterToken || backend.recuperarToken(state.currentRoomCode)
    if (masterToken) state.masterToken = masterToken

    state.socket = io(url, {
        auth: { roomCode: state.currentRoomCode, masterToken: masterToken || undefined },
        transports: ['websocket'],
        // Sem isto o socket.io reaproveita a conexao ja aberta para a mesma URL
        // e devolve o socket antigo — com o auth ANTIGO. Trocar de sala
        // continuaria mandando o codigo da sala anterior no handshake.
        forceNew: true,
    })

    state.socket.on('connect', async () => {
        console.log('[Socket] Conectado:', state.socket.id)
        document.getElementById('connectScreen').style.display = 'none'
        document.getElementById('diceFab').style.display = 'block'
        document.getElementById('roomBadge').style.display = 'block'
        document.getElementById('roomBadgeCode').textContent = state.currentRoomCode
        const leaveBtn = document.getElementById('leaveRoomBtn')
        if (leaveBtn) leaveBtn.style.display = 'block'
        showHUDButtons()
        showConfigButton()
        emitirCor()          // a sala precisa saber a cor do meu cursor
        showJournalButtons()
        initMusicPanel()
        initChat()
        initLockpicking()
        await loadAndShareCharacters()
    })

    // ── Jornal de Missões ────────────────────────────────────────────────────
    state.socket.on('missions_sync', ({ missions }) => handleMissionsSync(missions))
    state.socket.on('mission_objective_show', ({ objective }) => showObjectiveBanner(objective))
    state.socket.on('mission_objective_hide', () => hideObjectiveBanner())

    // ── Lockpicking ──────────────────────────────────────────────────────────
    state.socket.on('lockpick_start', data => handleLockpickStart(data))
    state.socket.on('lockpick_result', data => handleLockpickResult(data))

    state.socket.on('master_status', isMaster => {
        state.isRoomMaster = isMaster
        initMusicPanel(); initNPC(); initSfxPanel(); initReputation()
        showJournalButtons()
        updateDiceMasterUI()   // mostra/esconde o interruptor de rolagem secreta

        const { openLockpickPicker } = require('./lockpicking')
        const lockBtn = document.getElementById('lockpickMasterBtn')
        if (lockBtn) {
            lockBtn.style.display = isMaster ? 'block' : 'none'
            if (!lockBtn.dataset.inited) {
                lockBtn.dataset.inited = '1'
                lockBtn.addEventListener('click', openLockpickPicker)
            }
        }
    })

    state.socket.on('connect_error', err => {
        console.error('[Socket] Erro:', err.message)
        document.getElementById('roomInfo').textContent = `Erro ao conectar à sala: ${err.message}`
        document.getElementById('roomInfo').className = 'info-box visible error'
    })

    state.socket.on('dice_result', showDiceResult)

    // ── Calico: resultado de teste (2 dados, RA/RB, crítico) para a sala ─────
    state.socket.on('calico_result', res => {
        require('./calicoSheet').mostrarRolagemNaSala(res)
    })

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
            const { onRemoteStatUpdate, isCalico } = require('./calicoSheet')
            if (isCalico(state.statPopupChar)) {
                // Ficha do Calico: campos estruturados (perícias, armas, condições)
                // precisam de redesenho, não de um input avulso
                onRemoteStatUpdate(charId, field)
            } else {
                const input = document.querySelector(`#statDynamicRows [data-stat-key="${field}"]`)
                if (input && document.activeElement !== input) {
                    if (input.tagName === 'INPUT') input.value = value
                    else input.textContent = value
                }
            }
        }

        if (field === 'hp') flashCard(charId, value < oldVal ? 'red' : 'green')
        else if (field === 'sanity') flashCard(charId, 'blue')
    })

    // ── Reputação ────────────────────────────────────────────────────────────
    state.socket.on('reputation_show', showReputation)

    // ── Inventário / NPCs / Chat ─────────────────────────────────────────────
    state.socket.on('inventory_update', ({ charId, items }) => { handleInventoryUpdate({ charId, items }) })
    state.socket.on('item_show', ({ playerName, item }) => { handleItemShow({ playerName, item }) })
    state.socket.on('item_transferred', ({ toCharId, item }) => { handleItemTransferred({ toCharId, item }) })
    state.socket.on('npc_summon', npc => handleNPCSummon(npc))
    state.socket.on('npc_dismiss', ({ npcId }) => handleNPCDismiss({ npcId }))
    state.socket.on('chat_message', ({ playerName: from, message, type, gifUrl, critico, falha, secreto }) => {
        addChatMessage(from, message, from === state.playerName, type || 'text', gifUrl || null, false,
            type === 'roll' ? { critico, falha, secreto } : null)
    })

    // ── Cursores ─────────────────────────────────────────────────────────────
    state.socket.on('players_update', renderizarCursores)

    document.onmousemove = e => { if (state.socket) state.socket.emit('mouse_move', { x: e.clientX, y: e.clientY }) }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CURSORES DOS OUTROS JOGADORES ────────────────────────────────────────────
//
// Antes o mapa de cursores vivia num `const cursors = {}` DENTRO do
// connectToRoom, e cada players_update apagava tudo e redesenhava.
//
// O problema: aquele mapa pertencia àquela chamada de connectToRoom. Se um
// segundo socket entrasse em cena, o handler dele tinha o seu próprio mapa,
// vazio — e os elementos criados pelo primeiro ficavam órfãos no DOM, parados
// na última posição. Era esse o cursor que ficava preso quando alguém saía.
//
// Agora o DOM é a fonte da verdade: cada cursor carrega o socket id em
// `data-cursor-id`, e a sincronização apaga quem não veio na atualização.
// Qualquer handler, de qualquer conexão, converge para o mesmo resultado.
// ══════════════════════════════════════════════════════════════════════════════
function renderizarCursores(players) {
    const meuId = state.socket ? state.socket.id : null
    const presentes = new Set()

    for (const id in players) {
        if (id === meuId) continue
        presentes.add(id)

        let wrap = document.querySelector(`.cursor[data-cursor-id="${id}"]`)
        if (!wrap) {
            wrap = document.createElement('div')
            wrap.className = 'cursor'
            wrap.dataset.cursorId = id
            const dot = document.createElement('div')
            dot.className = 'cursor-dot'
            wrap.appendChild(dot)
            document.body.appendChild(wrap)
        }

        wrap.style.left = players[id].x + 'px'
        wrap.style.top = players[id].y + 'px'

        // Cada jogador escolhe a sua cor no painel de configuracoes
        const cor = players[id].color || COR_PADRAO
        const dot = wrap.querySelector('.cursor-dot')
        if (dot) {
            dot.style.background = cor
            dot.style.boxShadow = `0 0 6px ${cor}`
        }
    }

    // Quem sumiu da lista saiu da sala: o cursor vai junto
    document.querySelectorAll('.cursor[data-cursor-id]').forEach(el => {
        if (!presentes.has(el.dataset.cursorId)) el.remove()
    })
}

/** Apaga os cursores dos outros. O seu (#meuCursor) não tem data-cursor-id. */
function limparCursores() {
    document.querySelectorAll('.cursor[data-cursor-id]').forEach(el => el.remove())
}

// ══════════════════════════════════════════════════════════════════════════════
// ── UMA CONEXÃO POR VEZ ──────────────────────────────────────────────────────
//
// connectToRoom sobrescrevia state.socket sem desligar o anterior. Clicar duas
// vezes em "Entrar na Sala" deixava as duas conexões vivas, e o servidor
// enxergava dois jogadores — dois cursores, dois cards do mesmo personagem.
// ══════════════════════════════════════════════════════════════════════════════
function desconectarSocketAtual() {
    const antigo = state.socket
    if (!antigo) return

    try {
        // Tira os listeners ANTES de desconectar: sem isto, os handlers da
        // conexão velha ainda disparam durante o encerramento e mexem na tela.
        antigo.removeAllListeners()
        antigo.disconnect()
    } catch (e) {
        console.warn('[Socket] Falha ao encerrar a conexão anterior:', e.message)
    }

    state.socket = null
    limparCursores()
}

module.exports = { connectToRoom, desconectarSocketAtual, limparCursores, renderizarCursores }
