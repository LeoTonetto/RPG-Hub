const {
    rooms, roomCodes, urlCodes, roomChars,
    roomMusic, roomMasters, roomScene, roomNPCs,
    roomReputation, roomMissions, roomOwners,
    normalizeUrl, tocarSala
} = require('./roomState')

// Remetente das linhas de rolagem no chat, no mesmo espírito do "⚙ Sistema"
// que o lockpicking já usa.
const CHAT_DADOS = '🎲 Dados'

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
        rooms[roomCode][socket.id] = { x: 100, y: 100, color: null }
        tocarSala(roomCode)
        io.to(roomCode).emit('players_update', rooms[roomCode])

        // ── Quem e o mestre? ─────────────────────────────────────────────────
        // Sala registrada (POST /register-room) tem dono: so quem apresenta o
        // masterToken vira mestre, e pode reconectar quantas vezes quiser.
        // Sala sem registro cai na regra antiga (primeira conexao) — e o caso
        // de quem entra por URL direta, sem passar pela criacao.
        const dono = roomOwners[roomCode]
        const tokenEnviado = socket.handshake.auth.masterToken || socket.handshake.query.masterToken

        if (dono) {
            if (tokenEnviado && tokenEnviado === dono.token) {
                roomMasters[roomCode] = socket.id
                console.log(`[Master] ${socket.id} assumiu a sala ${roomCode} pelo token`)
            } else if (roomMasters[roomCode] === socket.id) {
                // nada a fazer, ja era
            } else if (tokenEnviado) {
                console.warn(`[Master] token invalido na sala ${roomCode} — conexao entra como jogador`)
            }
        } else if (!roomMasters[roomCode]) {
            roomMasters[roomCode] = socket.id
            console.log('[Master] definido por ordem de chegada:', socket.id, 'na sala', roomCode)
        }

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

        // ══ Dados ════════════════════════════════════════════════════════════
        // Toda rolagem vira uma linha no chat, para o mestre ter o registro de
        // quem rolou o quê. Rolagem secreta é privilégio do mestre: o resultado
        // e a linha do chat voltam só para ele, e a sala não recebe nada.

        socket.on('dice_roll', ({ player, value, sides, label, secreto }) => {
            const ehMestre = roomMasters[roomCode] === socket.id
            const escondido = !!secreto && ehMestre
            const dLabel = label || `d${sides || 20}`

            const ehD20 = sides === 20 || dLabel === 'd20'
            const critico = ehD20 && value === 20
            const falha = ehD20 && value === 1

            const resultado = { player, value, sides, label, secreto: escondido }
            const linha = {
                playerName: CHAT_DADOS,
                message: `${player} rolou ${dLabel}: ${value}`
                    + (critico ? '  ✦ crítico' : falha ? '  ✗ falha crítica' : ''),
                type: 'roll',
                critico, falha, secreto: escondido,
            }

            const destino = escondido ? socket : io.to(roomCode)
            destino.emit('dice_result', resultado)
            destino.emit('chat_message', linha)

            console.log(`[Dados]${escondido ? ' (secreto)' : ''} ${player} rolou ${dLabel}: ${value} na sala ${roomCode}`)
        })

        // ── Calico: teste de 2 dados contra DT ───────────────────────────────
        // O cliente já resolveu a rolagem; aqui só formatamos e distribuímos.
        socket.on('calico_roll', (res) => {
            if (!res || !Array.isArray(res.rolados)) return

            const ehMestre = roomMasters[roomCode] === socket.id
            const escondido = !!res.secreto && ehMestre
            const ctx = res.contexto || {}

            // Sem DT e sem veredito: o mestre anuncia a dificuldade na mesa e a
            // conta de passou ou não é feita em voz alta. A linha só registra o
            // que saiu nos dados — e marca crítico e falha crítica, que não
            // dependem de DT.
            const passos = ctx.passos
                ? `  (${ctx.passos > 0 ? '+' : ''}${ctx.passos} passo${Math.abs(ctx.passos) > 1 ? 's' : ''})`
                : ''
            const marca = res.falhaCritica ? '  ✗ falha crítica'
                : res.critico ? '  ✦ crítico' : ''

            // Ex.: "Jed — FÍSICO + Pontaria: d8(5) + d6(3) = 8 · RA 5 · RB 3"
            const dados = res.rolados
                .map(d => `${d.dado}(${d.valor})${d.somado === false ? '↯' : ''}`)
                .join(' + ')
            const linha = {
                playerName: CHAT_DADOS,
                message: `${ctx.personagem || '?'} — ${ctx.atributo || ''} + ${ctx.pericia || ''}${passos}: `
                    + `${dados} = ${res.soma}`
                    + `  ·  RA ${res.ra} · RB ${res.rb}${marca}`,
                type: 'roll',
                critico: !!res.critico,
                falha: !!res.falhaCritica,
                secreto: escondido,
            }

            if (escondido) {
                // Só a linha no chat do mestre: o overlay grande no meio da tela
                // entregaria o jogo se ele estiver com a tela compartilhada.
                socket.emit('chat_message', linha)
            } else {
                io.to(roomCode).emit('calico_result', res)
                io.to(roomCode).emit('chat_message', linha)
            }

            console.log(`[Calico]${escondido ? ' (secreto)' : ''} ${ctx.personagem || '?'} — ${ctx.atributo || ''} + ${ctx.pericia || ''}: soma ${res.soma} (RA ${res.ra}, RB ${res.rb})${marca} na sala ${roomCode}`)
        })

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
        // Preserva a cor: antes este handler substituia o objeto inteiro e
        // apagava a cor escolhida pelo jogador a cada movimento do mouse.
        socket.on('mouse_move', ({ x, y }) => {
            if (!rooms[roomCode] || !rooms[roomCode][socket.id]) return
            rooms[roomCode][socket.id].x = x
            rooms[roomCode][socket.id].y = y
            socket.to(roomCode).emit('players_update', rooms[roomCode])
        })

        // ── Cor do cursor ────────────────────────────────────────────────────
        socket.on('set_cursor_color', ({ color }) => {
            if (!rooms[roomCode] || !rooms[roomCode][socket.id]) return
            // So aceita hex de 3 ou 6 digitos, para nao deixar CSS arbitrario entrar
            if (typeof color !== 'string' || !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) return
            rooms[roomCode][socket.id].color = color
            io.to(roomCode).emit('players_update', rooms[roomCode])
        })

        // ── Desconexão ───────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            if (rooms[roomCode]) delete rooms[roomCode][socket.id]
            if (roomChars[roomCode]) delete roomChars[roomCode][socket.id]

            // Solta o posto de mestre. Antes isto nao acontecia: o socket id
            // morto ficava em roomMasters e, ao reconectar, o mestre perdia o
            // posto para sempre — ninguem mais conseguia comandar a sala.
            if (roomMasters[roomCode] === socket.id) {
                delete roomMasters[roomCode]
                console.log(`[Master] ${socket.id} saiu; a sala ${roomCode} esta sem mestre ate ele voltar`)
                // Sala com dono espera o token voltar. Sala sem dono (URL
                // direta) promove quem ja estiver dentro, para nao travar.
                if (!roomOwners[roomCode]) {
                    const restante = Object.keys(rooms[roomCode] || {})[0]
                    if (restante) {
                        roomMasters[roomCode] = restante
                        io.to(restante).emit('master_status', true)
                        console.log(`[Master] ${restante} assumiu a sala ${roomCode} por sucessao`)
                    }
                }
            }

            io.to(roomCode).emit('players_update', rooms[roomCode] || {})
            broadcastRoomChars(io, roomCode)
            console.log(`[Socket] Desconectado: ${socket.id} da sala ${roomCode}`)
        })
    })
}

module.exports = { setupSocketHandlers }
