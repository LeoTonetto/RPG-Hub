const {
    rooms, roomCodes, urlCodes, roomChars,
    roomMusic, roomMasters, roomScene, roomNPCs,
    roomReputation, roomMissions, normalizeUrl
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
        if (urlCodes[norm]) { roomCode = urlCodes[norm] }
        else { const found = Object.entries(roomCodes).find(([, url]) => normalizeUrl(url) === norm)?.[0]; if (found) roomCode = found }
        console.log('roomCode final:', roomCode)
        socket.join(roomCode)
        if (!rooms[roomCode]) rooms[roomCode] = {}
        if (!roomChars[roomCode]) roomChars[roomCode] = {}
        rooms[roomCode][socket.id] = { x: 100, y: 100 }
        io.to(roomCode).emit('players_update', rooms[roomCode])
        if (!roomMasters[roomCode]) { roomMasters[roomCode] = socket.id; console.log('[Master] definido:', socket.id, 'na sala', roomCode) }
        socket.emit('master_status', roomMasters[roomCode] === socket.id)
        if (roomMusic[roomCode]) { const elapsed = (Date.now() - roomMusic[roomCode].startTime) / 1000; socket.emit('music_play', { ...roomMusic[roomCode], seekTime: elapsed }) }
        if (roomScene[roomCode]) { socket.emit('scene_change', roomScene[roomCode]) }
        if (roomNPCs[roomCode]) { Object.values(roomNPCs[roomCode]).forEach(npc => { socket.emit('npc_summon', { ...npc, silent: true }) }) }

        if (roomMissions[roomCode]) {
            socket.emit('missions_sync', { missions: roomMissions[roomCode] })
        }

        // ── Música ──────────────────────────────────────────────────────────
        socket.on('play_music', ({ videoId, startedBy }) => { if (roomMasters[roomCode] !== socket.id) return; if (!videoId || typeof videoId !== 'string' || !videoId.trim()) return; roomMusic[roomCode] = { videoId: videoId.trim(), startedBy: startedBy || 'unknown', startTime: Date.now() }; io.to(roomCode).emit('music_play', roomMusic[roomCode]); console.log(`[Música] ${startedBy} tocou ${videoId} na sala ${roomCode}`) })
        socket.on('stop_music', ({ stoppedBy }) => { if (roomMasters[roomCode] !== socket.id) return; roomMusic[roomCode] = null; io.to(roomCode).emit('music_stop', { stoppedBy }); console.log(`[Música] ${stoppedBy} parou a música na sala ${roomCode}`) })

        // ── Efeitos Sonoros ─────────────────────────────────────────────────
        socket.on('play_sfx', ({ audioUrl, sfxName }) => { if (roomMasters[roomCode] !== socket.id) return; if (!audioUrl || typeof audioUrl !== 'string') return; io.to(roomCode).emit('play_sfx', { audioUrl, sfxName }); console.log(`[SFX] ${sfxName} tocado na sala ${roomCode}`) })

        // ── Cena ─────────────────────────────────────────────────────────────
        socket.on('scene_change', ({ url, mimeType }) => { if (roomMasters[roomCode] !== socket.id) return; if (!url || typeof url !== 'string') return; roomScene[roomCode] = { url, mimeType: mimeType || 'image/jpeg' }; io.to(roomCode).emit('scene_change', roomScene[roomCode]); console.log(`[Cena] Nova cena na sala ${roomCode}:`, url) })

        // ── NPCs ──────────────────────────────────────────────────────────────
        socket.on('npc_summon', (npc) => { if (roomMasters[roomCode] !== socket.id) return; if (!npc || !npc.id || !npc.name) return; if (!roomNPCs[roomCode]) roomNPCs[roomCode] = {}; roomNPCs[roomCode][npc.id] = { id: npc.id, name: npc.name, photo: npc.photo || null, description: npc.description || '' }; io.to(roomCode).emit('npc_summon', roomNPCs[roomCode][npc.id]); console.log(`[NPC] "${npc.name}" invocado na sala ${roomCode}`) })
        socket.on('npc_dismiss', ({ npcId }) => { if (roomMasters[roomCode] !== socket.id) return; if (roomNPCs[roomCode]) delete roomNPCs[roomCode][npcId]; io.to(roomCode).emit('npc_dismiss', { npcId }); console.log(`[NPC] ${npcId} dispensado da sala ${roomCode}`) })

        // ── Lockpicking ─────────────────────────────────────────────────────────
        socket.on('lockpick_start', (data) => {
            if (roomMasters[roomCode] !== socket.id) return
            io.to(roomCode).emit('lockpick_start', data)
            console.log(`[Lockpick] ${data.startedBy} iniciou lockpicking para ${data.charName} (${data.diffLabel}, ${data.picks} gazuas) na sala ${roomCode}`)
        })

        socket.on('lockpick_result', ({ charId, charName, success }) => {
            io.to(roomCode).emit('lockpick_result', { charId, charName, success })
            const msg = success
                ? `🔓 ${charName} abriu o cofre com sucesso!`
                : `💔 ${charName} falhou ao abrir o cofre...`
            io.to(roomCode).emit('chat_message', {
                playerName: '⚙ Sistema',
                message: msg,
                type: 'text'
            })
            console.log(`[Lockpick] ${charName} → ${success ? 'SUCESSO' : 'FALHA'} na sala ${roomCode}`)
        })

        // ── Personagens ─────────────────────────────────────────────────────
        socket.on('share_characters', ({ playerName, characters }) => { roomChars[roomCode][socket.id] = { playerName, characters: characters || [] }; console.log(`[Chars] ${playerName} — ${characters?.length} personagem(ns) na sala ${roomCode}`); broadcastRoomChars(io, roomCode) })

        // ── Stats ───────────────────────────────────────────────────────────
        socket.on('stat_update', ({ charId, field, value, ownerName }) => {
            if (!roomChars[roomCode]) return
            const isMaster = roomMasters[roomCode] === socket.id
            const isOwner = roomChars[roomCode][socket.id]?.characters.some(c => c.id === charId)
            if (!isMaster && !isOwner) return
            for (const sid in roomChars[roomCode]) {
                const char = roomChars[roomCode][sid].characters.find(c => c.id === charId)
                if (char) {
                    if (char.stats && typeof char.stats === 'object') char.stats[field] = value
                    else char[field] = value
                    break
                }
            }
            io.to(roomCode).emit('stat_update', { charId, field, value, ownerName })
            console.log(`[Stat] ${ownerName} atualizou ${field}=${value} em char ${charId}`)
        })

        // ── Inventário ──────────────────────────────────────────────────────
        socket.on('inventory_update', ({ charId, items }) => { const isMaster = roomMasters[roomCode] === socket.id; const isOwner = roomChars[roomCode][socket.id]?.characters.some(c => c.id === charId); if (!isMaster && !isOwner) return; io.to(roomCode).emit('inventory_update', { charId, items }) })

        // ── Dados ────────────────────────────────────────────────────────────
        socket.on('dice_roll', ({ player, value, sides, label }) => { io.to(roomCode).emit('dice_result', { player, value, sides, label }) })

        // ── Mostrar item a todos ─────────────────────────────────────────────
        socket.on('item_show', ({ playerName, item }) => {
            if (!playerName || !item) return
            io.to(roomCode).emit('item_show', { playerName, item })
            console.log(`[Item] ${playerName} mostrou "${item.name}" na sala ${roomCode}`)
        })

        // ── Transferir item ──────────────────────────────────────────────────
        socket.on('item_transferred', ({ toCharId, item }) => {
            if (!toCharId || !item) return
            io.to(roomCode).emit('item_transferred', { toCharId, item })
            console.log(`[Item] "${item.name}" transferido para char ${toCharId} na sala ${roomCode}`)
        })

        // ── Chat ─────────────────────────────────────────────────────────────
        socket.on('chat_message', ({ playerName, message, type, gifUrl }) => { if (!message || typeof message !== 'string' || !message.trim()) return; io.to(roomCode).emit('chat_message', { playerName, message: message.trim(), type: type || 'text', gifUrl: gifUrl || null }) })

        // ── Reputação ────────────────────────────────────────────────────────
        socket.on('reputation_show', ({ value }) => {
            if (roomMasters[roomCode] !== socket.id) return
            const v = Math.max(-10, Math.min(10, parseInt(value) || 0))
            roomReputation[roomCode] = v
            io.to(roomCode).emit('reputation_show', { value: v })
            console.log(`[Reputação] Valor ${v} exibido na sala ${roomCode}`)
        })

        // ── Missões / Jornal ────────────────────────────────────────────────
        socket.on('missions_sync', ({ missions }) => {
            if (roomMasters[roomCode] !== socket.id) return
            roomMissions[roomCode] = missions || []
            socket.to(roomCode).emit('missions_sync', { missions: roomMissions[roomCode] })
            console.log(`[Missões] Sync — ${missions?.length || 0} missões na sala ${roomCode}`)
        })

        socket.on('mission_objective_show', ({ objective }) => {
            if (roomMasters[roomCode] !== socket.id) return
            io.to(roomCode).emit('mission_objective_show', { objective })
            console.log(`[Missões] Objetivo exibido na sala ${roomCode}`)
        })

        socket.on('mission_objective_hide', () => {
            if (roomMasters[roomCode] !== socket.id) return
            io.to(roomCode).emit('mission_objective_hide')
            console.log(`[Missões] Objetivo ocultado na sala ${roomCode}`)
        })

        // ── Cursores ─────────────────────────────────────────────────────────
        socket.on('mouse_move', ({ x, y }) => { if (!rooms[roomCode]) return; rooms[roomCode][socket.id] = { x, y }; socket.to(roomCode).emit('players_update', rooms[roomCode]) })

        // ── Desconexão ───────────────────────────────────────────────────────
        socket.on('disconnect', () => { if (rooms[roomCode]) delete rooms[roomCode][socket.id]; if (roomChars[roomCode]) delete roomChars[roomCode][socket.id]; io.to(roomCode).emit('players_update', rooms[roomCode] || {}); broadcastRoomChars(io, roomCode); console.log(`[Socket] Desconectado: ${socket.id} da sala ${roomCode}`) })
    })
}

module.exports = { setupSocketHandlers }
