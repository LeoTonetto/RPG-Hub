const { ipcRenderer, clipboard } = require('electron')
const state = require('./state')
const { connectToRoom } = require('./socket')

function setRoomInfo(msg, type = '') {
    const el = document.getElementById('roomInfo')
    el.textContent = msg
    el.className = 'info-box visible ' + type
}

function initRoom() {
    const createBtn = document.getElementById('createRoomButton')
    const joinBtn = document.getElementById('joinRoomButton')
    const roomCodeInput = document.getElementById('roomCodeInput')
    const roomBadge = document.getElementById('roomBadge')
    const roomBadgeCode = document.getElementById('roomBadgeCode')
    const { hideJournalButtons } = require('./journal')

    createBtn.addEventListener('click', async () => {
        const backend = require('./backend')
        createBtn.disabled = true

        if (state.backendMode === 'vps') {
            // Nao adianta criar a sala se o servidor nao responde: o mestre
            // ficaria olhando para uma tela de conexao que nunca completa
            setRoomInfo('Falando com o servidor...')
            const teste = await backend.testarServidor(state.vpsUrl)
            if (!teste.ok) {
                setRoomInfo(teste.erro, 'error')
                createBtn.disabled = false
                return
            }
        }

        setRoomInfo('Preparando a taverna...')
        ipcRenderer.send('create-room', {
            modo: state.backendMode,
            urlServidor: state.vpsUrl,
        })
    })

    ipcRenderer.on('room-created', async (event, data) => {
        const backend = require('./backend')

        state.isRoomMaster = true
        state.currentRoomCode = data.roomCode
        state.serverUrl = data.publicUrl
        state.rooms[data.roomCode.toLowerCase()] = data.publicUrl
        roomBadgeCode.textContent = data.roomCode

        // ── Registra a sala e recebe o token de mestre ───────────────────────
        // O token é o que prova, a cada conexão, que este app é o dono. Sem
        // ele, num servidor sempre no ar, quem conectasse primeiro viraria
        // mestre — e o próprio mestre perderia o posto ao reconectar.
        try {
            await backend.registrarSala(data.publicUrl, data.roomCode, state.currentUserId)
        } catch (e) {
            console.error('[Room] Erro ao registrar sala:', e)
            setRoomInfo(`Não consegui registrar a sala no servidor:\n${e.message}`, 'error')
            createBtn.disabled = false
            state.isRoomMaster = false
            return
        }

        // No modo VPS o código é o que interessa: a URL é sempre a mesma
        const noVps = data.modo === 'vps'
        clipboard.writeText(noVps ? data.roomCode : data.publicUrl)
        setRoomInfo(noVps
            ? `Sala aberta no seu servidor!\n\nCódigo: ${data.roomCode}  (copiado)\nSeus jogadores entram só com o código.`
            : `Sala aberta! Código: ${data.roomCode}\n\nURL copiada para a área de transferência.\nCompartilhe com seus aliados remotos.`,
            'success')
        createBtn.disabled = false

        // Registra no Supabase para quem entra pelo código
        if (state.supabase) {
            state.supabase.from('room_codes')
                .upsert({ code: data.roomCode, url: data.publicUrl, created_at: new Date().toISOString() })
                .then(({ error }) => { if (error) console.warn('[Room] Supabase room_codes:', error.message) })
        }

        connectToRoom(data.publicUrl, data.roomCode)
    })

    ipcRenderer.on('room-error', (event, data) => {
        setRoomInfo(`Erro: ${data.message}`, 'error')
        createBtn.disabled = false
    })

    joinBtn.addEventListener('click', async () => {
        const input = roomCodeInput.value.trim()
        if (!input) { roomCodeInput.focus(); return }

        // Trava o botao enquanto procura e conecta. Sem isto, clicar varias
        // vezes abria uma conexao por clique e o jogador entrava repetido na
        // sala — varios cursores e varios cards do mesmo personagem.
        if (joinBtn.disabled) return
        joinBtn.disabled = true
        const liberar = () => { joinBtn.disabled = false }

        let roomUrl = null, roomCode = input

        if (/^https?:\/\//i.test(input)) {
            roomUrl = input; roomCode = input
        } else {
            const code = input.toUpperCase()
            roomCode = code
            roomUrl = state.rooms[input.toLowerCase()] || null

            // Pergunta a quem pode saber: o servidor configurado (VPS) e o
            // servidor local (ngrok, quando a sala e deste PC)
            if (!roomUrl) {
                const candidatos = [state.vpsUrl, 'http://localhost:3001'].filter(Boolean)
                for (const base of candidatos) {
                    try {
                        const r = await fetch(`${base}/resolve-code/${code}`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
                        const j = await r.json()
                        if (j.url) { roomUrl = j.url; break }
                    } catch (e) { }
                }
            }

            if (!roomUrl && state.supabase) {
                setRoomInfo('Procurando sala...', '')
                try {
                    const { data: row, error } = await state.supabase
                        .from('room_codes').select('url').eq('code', code).maybeSingle()
                    if (error) {
                        setRoomInfo('Tabela room_codes não encontrada no Supabase.\nExecute o SQL de criação (ver README).', 'error')
                        liberar()
                        return
                    }
                    if (row?.url) roomUrl = row.url
                } catch (e) { console.warn('[Room] Supabase lookup:', e) }
            }

            if (!roomUrl) {
                setRoomInfo('Código não encontrado.\nVerifique o código ou use a URL completa do ngrok.', 'error')
                liberar()
                return
            }
        }

        connectToRoom(roomUrl, roomCode)

        // Se a conexão falhar, o botão volta: o connect_error do socket.js
        // reexibe a tela de sala, e o jogador precisa poder tentar de novo.
        setTimeout(liberar, 3000)
    })

    // Badge: clique copia o código
    roomBadge.addEventListener('click', () => {
        if (!state.currentRoomCode) return
        clipboard.writeText(state.currentRoomCode)
        roomBadgeCode.textContent = `${state.currentRoomCode} ✓`
        setTimeout(() => { roomBadgeCode.textContent = state.currentRoomCode }, 2000)
    })

    // Botão sair da sala
    const leaveBtn = document.getElementById('leaveRoomBtn')
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            if (!state.socket) return

            // Encerra com limpeza: derruba os listeners, desconecta e apaga os
            // cursores dos outros jogadores — que senão ficariam parados na sua
            // tela, na última posição em que estavam.
            require('./socket').desconectarSocketAtual()

            state.currentRoomCode = null
            state.serverUrl = null
            state.isRoomMaster = false
            state.masterToken = null
            state.playerCharacters = []
            state.allCharsCache = []
            state.activeCharacterId = null

            hideJournalButtons()

            // Esconde HUD de jogo
            document.getElementById('diceFab').style.display = 'none'
            document.getElementById('roomBadge').style.display = 'none'
            document.getElementById('leaveRoomBtn').style.display = 'none'
            document.getElementById('characterBar').style.display = 'none'
            document.getElementById('characterBar').innerHTML = ''
            document.getElementById('chatPanel').style.display = 'none'
            document.getElementById('hudToggle').style.display = 'none'
            document.getElementById('musicPanel')?.classList?.remove('visible')

            // Mostra tela de sala
            document.getElementById('connectScreen').style.display = 'flex'
        })
    }
}

module.exports = { initRoom, setRoomInfo }
