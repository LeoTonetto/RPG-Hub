const { ipcRenderer, clipboard } = require('electron')
const state = require('./state')
const { connectToRoom } = require('./socket')

function setRoomInfo(msg, type = '') {
    const el = document.getElementById('roomInfo')
    el.textContent = msg
    el.className   = 'info-box visible ' + type
}

function initRoom() {
    const createBtn   = document.getElementById('createRoomButton')
    const joinBtn     = document.getElementById('joinRoomButton')
    const roomCodeInput = document.getElementById('roomCodeInput')
    const roomBadge   = document.getElementById('roomBadge')
    const roomBadgeCode = document.getElementById('roomBadgeCode')

    createBtn.addEventListener('click', () => {
        setRoomInfo('Preparando a taverna...')
        createBtn.disabled = true
        ipcRenderer.send('create-room')
    })

    ipcRenderer.on('room-created', async (event, data) => {
        state.isRoomMaster  = true
        state.currentRoomCode = data.roomCode
        state.serverUrl     = data.publicUrl
        state.rooms[data.roomCode.toLowerCase()] = data.publicUrl
        clipboard.writeText(data.publicUrl)

        setRoomInfo(`Sala aberta! Código: ${data.roomCode}\n\nURL copiada para a área de transferência.\nCompartilhe com seus aliados remotos.`, 'success')
        createBtn.disabled = false
        roomBadgeCode.textContent = data.roomCode

        // Registra no servidor local
        fetch(`${data.publicUrl}/register-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ code: data.roomCode, url: data.publicUrl })
        }).catch(e => console.error('[Room] Erro ao registrar sala:', e))

        // Registra no Supabase para usuários remotos
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

        let roomUrl = null, roomCode = input

        if (/^https?:\/\//i.test(input)) {
            roomUrl = input; roomCode = input
        } else {
            const code = input.toUpperCase()
            roomCode   = code
            roomUrl    = state.rooms[input.toLowerCase()] || null

            if (!roomUrl) {
                try {
                    const r = await fetch(`http://localhost:3001/resolve-code/${code}`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
                    const j = await r.json()
                    if (j.url) roomUrl = j.url
                } catch (e) {}
            }

            if (!roomUrl && state.supabase) {
                setRoomInfo('Procurando sala...', '')
                try {
                    const { data: row, error } = await state.supabase
                        .from('room_codes').select('url').eq('code', code).maybeSingle()
                    if (error) {
                        setRoomInfo('Tabela room_codes não encontrada no Supabase.\nExecute o SQL de criação (ver README).', 'error')
                        return
                    }
                    if (row?.url) roomUrl = row.url
                } catch (e) { console.warn('[Room] Supabase lookup:', e) }
            }

            if (!roomUrl) { setRoomInfo('Código não encontrado.\nVerifique o código ou use a URL completa do ngrok.', 'error'); return }
        }

        connectToRoom(roomUrl, roomCode)
    })

    // Badge: clique copia o código
    roomBadge.addEventListener('click', () => {
        if (!state.currentRoomCode) return
        clipboard.writeText(state.currentRoomCode)
        roomBadgeCode.textContent = `${state.currentRoomCode} ✓`
        setTimeout(() => { roomBadgeCode.textContent = state.currentRoomCode }, 2000)
    })
}

module.exports = { initRoom, setRoomInfo }
