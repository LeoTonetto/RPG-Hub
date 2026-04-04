const {
    rooms, roomCodes, urlCodes, roomChars,
    roomMusic, roomMasters, roomScene, normalizeUrl
} = require('./roomState')

// ── Helpers ────────────────────────────────────────────────────────────────
function broadcastRoomChars(io, roomCode) {
    const entries = roomChars[roomCode] || {}
    const all = []
    for (const sid in entries) {
        const { playerName, characters } = entries[sid]
        characters.forEach(char => all.push({ playerName, character: char }))
    }
    io.to(roomCode).emit('room_characters', all)
}

// ── Rota de limpeza ───────────────────────────────────────────────────────────
function setupCleanupRoute(app, io) {
    app.post('/cleanup-room', (req, res) => {
        res.json({ ok: true })

        const roomCode = (req.body?.roomCode || '').toString().trim().toUpperCase()
        if (!roomCode) return

        setTimeout(() => {
            const room = io.sockets.adapter.rooms.get(roomCode)
            if (!room || room.size === 0) {
                delete rooms[roomCode]
                delete roomChars[roomCode]
                delete roomMasters[roomCode]
                delete roomMusic[roomCode]
                delete roomScene[roomCode]
            }
        }, 400)
    })
}

// ── Socket handlers ───────────────────────────────────────────────────────────
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

        socket.emit('master_status', roomMasters[roomCode] === socket.id)

        if (roomMusic[roomCode]) {
            const elapsed = (Date.now() - roomMusic[roomCode].startTime) / 1000
            socket.emit('music_play', { ...roomMusic[roomCode], seekTime: elapsed })
        }
        if (roomScene[roomCode]) socket.emit('scene_change', roomScene[roomCode])

        // ── Música ──────────────────────────────────────────────────────────
        socket.on('play_music', ({ videoId, startedBy }) => {
            if (roomMasters[roomCode] !== socket.id) return
            if (!videoId || typeof videoId !== 'string' || !videoId.trim()) return
            roomMusic[roomCode] = { videoId: videoId.trim(), startedBy: startedBy || 'unknown', startTime: Date.now() }
            io.to(roomCode).emit('music_play', roomMusic[roomCode])
        })

        socket.on('stop_music', ({ stoppedBy }) => {
            if (roomMasters[roomCode] !== socket.id) return
            roomMusic[roomCode] = null
            io.to(roomCode).emit('music_stop', { stoppedBy })
        })

        // ── Cena ─────────────────────────────────────────────────────────────
        socket.on('scene_change', ({ url, mimeType }) => {
            if (roomMasters[roomCode] !== socket.id) return
            if (!url || typeof url !== 'string') return
            roomScene[roomCode] = { url, mimeType: mimeType || 'image/jpeg' }
            io.to(roomCode).emit('scene_change', roomScene[roomCode])
        })

        // ── Personagens ──────────────────────────────────────────────────────
        socket.on('share_characters', ({ playerName, characters }) => {
            roomChars[roomCode][socket.id] = { playerName, characters: characters || [] }
            broadcastRoomChars(io, roomCode)
        })

        // ── Stats ────────────────────────────────────────────────────────────
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
        })

        // ── Inventário ───────────────────────────────────────────────────────
        socket.on('inventory_update', ({ charId, items }) => {
            const isMaster = roomMasters[roomCode] === socket.id
            const isOwner = roomChars[roomCode][socket.id]?.characters.some(c => c.id === charId)
            if (!isMaster && !isOwner) return
            if (!charId || !Array.isArray(items)) return
            io.to(roomCode).emit('inventory_update', { charId, items })
        })

        // ── Chat ─────────────────────────────────────────────────────────────
        socket.on('chat_message', ({ playerName, message, type, gifUrl }) => {
            const name = (playerName || 'Anônimo').toString().slice(0, 40)

            if (type === 'gif') {
                if (!gifUrl || typeof gifUrl !== 'string') return
                const isGiphy = gifUrl.startsWith('https://media') || gifUrl.startsWith('https://i.giphy.com')
                if (!isGiphy) return
                io.to(roomCode).emit('chat_message', { playerName: name, message: '[GIF]', type: 'gif', gifUrl })
                return
            }

            if (!message || typeof message !== 'string' || !message.trim()) return
            const safe = message.trim().slice(0, 300)
            io.to(roomCode).emit('chat_message', { playerName: name, message: safe, type: 'text' })
        })

        // ── Cursor ───────────────────────────────────────────────────────────
        socket.on('mouse_move', (data) => {
            rooms[roomCode][socket.id] = data
            io.to(roomCode).emit('players_update', rooms[roomCode])
        })

        // ── Dados ────────────────────────────────────────────────────────────
        socket.on('dice_roll', (data) => {
            io.to(roomCode).emit('dice_result', data)
        })

        // ── Desconexão ───────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            if (rooms[roomCode]) { delete rooms[roomCode][socket.id]; io.to(roomCode).emit('players_update', rooms[roomCode]) }
            if (roomChars[roomCode]) { delete roomChars[roomCode][socket.id]; broadcastRoomChars(io, roomCode) }

            if (roomMasters[roomCode] === socket.id) {
                const remaining = io.sockets.adapter.rooms.get(roomCode)
                if (remaining && remaining.size > 0) {
                    const nextSid = remaining.values().next().value
                    roomMasters[roomCode] = nextSid
                    io.to(nextSid).emit('master_status', true)
                } else {
                    delete roomMasters[roomCode]
                }
            }
        })
    })
}

module.exports = { setupSocketHandlers, setupCleanupRoute }
