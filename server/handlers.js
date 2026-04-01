const {
    rooms, roomCodes, urlCodes, roomChars,
    roomMusic, roomMasters, roomScene, normalizeUrl
} = require('./roomState')

function broadcastRoomChars(io, roomCode) {
    const entries = roomChars[roomCode] || {}
    const all = []
    for (const sid in entries) {
        const { playerName, characters } = entries[sid]
        characters.forEach(char => all.push({ playerName, character: char }))
    }
    io.to(roomCode).emit('room_characters', all)
}

function setupSocketHandlers(io) {
    io.on('connection', (socket) => {
        let roomCode = (socket.handshake.auth.roomCode || socket.handshake.query.roomCode || 'default')
            .toString().toUpperCase()

        console.log('Conexão recebida — roomCode original:', roomCode)

        const norm = normalizeUrl(roomCode)
        if (urlCodes[norm]) {
            roomCode = urlCodes[norm]
        } else {
            const found = Object.entries(roomCodes).find(([, url]) => normalizeUrl(url) === norm)?.[0]
            if (found) roomCode = found
        }

        console.log('roomCode final:', roomCode)
        socket.join(roomCode)

        if (!rooms[roomCode]) rooms[roomCode] = {}
        if (!roomChars[roomCode]) roomChars[roomCode] = {}

        rooms[roomCode][socket.id] = { x: 100, y: 100 }
        io.to(roomCode).emit('players_update', rooms[roomCode])

        if (!roomMasters[roomCode]) {
            roomMasters[roomCode] = socket.id
            console.log('[Master] definido:', socket.id, 'na sala', roomCode)
        }

        // Informa ao cliente seu status de mestre
        socket.emit('master_status', roomMasters[roomCode] === socket.id)

        // Sincroniza estado existente para quem acabou de entrar
        if (roomMusic[roomCode]) {
            const elapsed = (Date.now() - roomMusic[roomCode].startTime) / 1000
            socket.emit('music_play', { ...roomMusic[roomCode], seekTime: elapsed })
        }
        if (roomScene[roomCode]) {
            socket.emit('scene_change', roomScene[roomCode])
        }

        // ── Música ──────────────────────────────────────────────────────────
        socket.on('play_music', ({ videoId, startedBy }) => {
            if (roomMasters[roomCode] !== socket.id) return
            if (!videoId || typeof videoId !== 'string' || !videoId.trim()) return
            roomMusic[roomCode] = { videoId: videoId.trim(), startedBy: startedBy || 'unknown', startTime: Date.now() }
            io.to(roomCode).emit('music_play', roomMusic[roomCode])
            console.log(`[Música] ${startedBy} tocou ${videoId} na sala ${roomCode}`)
        })

        socket.on('stop_music', ({ stoppedBy }) => {
            if (roomMasters[roomCode] !== socket.id) return
            roomMusic[roomCode] = null
            io.to(roomCode).emit('music_stop', { stoppedBy })
            console.log(`[Música] ${stoppedBy} parou a música na sala ${roomCode}`)
        })

        // ── Cena ────────────────────────────────────────────────────────────
        socket.on('scene_change', ({ url, mimeType }) => {
            if (roomMasters[roomCode] !== socket.id) return
            if (!url || typeof url !== 'string') return
            roomScene[roomCode] = { url, mimeType: mimeType || 'image/jpeg' }
            io.to(roomCode).emit('scene_change', roomScene[roomCode])
            console.log(`[Cena] Nova cena na sala ${roomCode}:`, url)
        })

        // ── Personagens ─────────────────────────────────────────────────────
        socket.on('share_characters', ({ playerName, characters }) => {
            roomChars[roomCode][socket.id] = { playerName, characters: characters || [] }
            console.log(`[Chars] ${playerName} — ${characters?.length} personagem(ns) na sala ${roomCode}`)
            broadcastRoomChars(io, roomCode)
        })

        // ── Stats ───────────────────────────────────────────────────────────
        socket.on('stat_update', ({ charId, field, value, ownerName }) => {
            if (!roomChars[roomCode]) return
            const isMaster = roomMasters[roomCode] === socket.id
            const isOwner = roomChars[roomCode][socket.id]?.characters.some(c => c.id === charId)
            if (!isMaster && !isOwner) return

            for (const sid in roomChars[roomCode]) {
                const char = roomChars[roomCode][sid].characters.find(c => c.id === charId)
                if (char) { char[field] = value; break }
            }
            io.to(roomCode).emit('stat_update', { charId, field, value, ownerName })
            console.log(`[Stat] ${ownerName} atualizou ${field}=${value} em char ${charId}`)
        })

        // ── Inventário ──────────────────────────────────────────────────────
        socket.on('inventory_update', ({ charId, items }) => {
            const isMaster = roomMasters[roomCode] === socket.id
            const isOwner = roomChars[roomCode][socket.id]?.characters.some(c => c.id === charId)

            if (!isMaster && !isOwner) {
                console.warn(`[Inventário] REJEITADO: sem permissão`)
                return
            }
            if (!charId || !Array.isArray(items)) {
                console.warn(`[Inventário] Payload inválido: charId=${charId}, items=${JSON.stringify(items)}`)
                return
            }
            console.log(`[Inventário] char ${charId}: ${items.length} item(ns) — nomes: ${items.map(i => i.name).join(', ') || '(vazio)'}`)
            io.to(roomCode).emit('inventory_update', { charId, items })
        })

        // ── Chat ────────────────────────────────────────────────────────────
        socket.on('chat_message', ({ playerName, message }) => {
            if (!message || typeof message !== 'string' || !message.trim()) return
            const safe = message.trim().slice(0, 300)
            io.to(roomCode).emit('chat_message', { playerName: playerName || 'Anônimo', message: safe })
        })

        // ── Cursor ──────────────────────────────────────────────────────────
        socket.on('mouse_move', (data) => {
            rooms[roomCode][socket.id] = data
            io.to(roomCode).emit('players_update', rooms[roomCode])
        })

        // ── Dados ───────────────────────────────────────────────────────────
        socket.on('dice_roll', (data) => {
            io.to(roomCode).emit('dice_result', data)
        })

        // ── Desconexão ──────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            if (rooms[roomCode]) {
                delete rooms[roomCode][socket.id]
                io.to(roomCode).emit('players_update', rooms[roomCode])
            }
            if (roomChars[roomCode]) {
                delete roomChars[roomCode][socket.id]
                broadcastRoomChars(io, roomCode)
            }
        })
    })
}

module.exports = { setupSocketHandlers }
