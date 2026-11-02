const {
    rooms, roomCodes, urlCodes, roomChars,
    roomMusic, roomMasters, roomScene, roomNPCs,
    roomReputation, roomMissions, roomOwners, roomCombate,
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
        socket.emit('room_system', { sistema: (dono && dono.sistema) || null })
        if (roomMusic[roomCode]) { const elapsed = (Date.now() - roomMusic[roomCode].startTime) / 1000; socket.emit('music_play', { ...roomMusic[roomCode], seekTime: elapsed }) }
        if (roomScene[roomCode]) { socket.emit('scene_change', roomScene[roomCode]) }
        if (roomNPCs[roomCode]) { Object.values(roomNPCs[roomCode]).forEach(npc => { socket.emit('npc_summon', { ...npc, silent: true }) }) }

        if (roomMissions[roomCode]) {
            socket.emit('missions_sync', { missions: roomMissions[roomCode] })
        }
        // Quem entra no meio da batalha já recebe a ordem e o turno
        if (roomCombate[roomCode]) socket.emit('combate_estado', roomCombate[roomCode])

        // ── Música ──────────────────────────────────────────────────────────
        socket.on('play_music', ({ videoId, startedBy }) => { if (roomMasters[roomCode] !== socket.id) return; if (!videoId || typeof videoId !== 'string' || !videoId.trim()) return; roomMusic[roomCode] = { videoId: videoId.trim(), startedBy: startedBy || 'unknown', startTime: Date.now() }; io.to(roomCode).emit('music_play', roomMusic[roomCode]); console.log(`[Música] ${startedBy} tocou ${videoId} na sala ${roomCode}`) })
        socket.on('stop_music', ({ stoppedBy }) => { if (roomMasters[roomCode] !== socket.id) return; roomMusic[roomCode] = null; io.to(roomCode).emit('music_stop', { stoppedBy }); console.log(`[Música] ${stoppedBy} parou a música na sala ${roomCode}`) })

        // ── Efeitos Sonoros ─────────────────────────────────────────────────
        socket.on('play_sfx', ({ audioUrl, sfxName }) => { if (roomMasters[roomCode] !== socket.id) return; if (!audioUrl || typeof audioUrl !== 'string') return; io.to(roomCode).emit('play_sfx', { audioUrl, sfxName }); console.log(`[SFX] ${sfxName} tocado na sala ${roomCode}`) })

        // ── Cena ─────────────────────────────────────────────────────────────
        socket.on('scene_change', ({ url, mimeType }) => { if (roomMasters[roomCode] !== socket.id) return; if (!url || typeof url !== 'string') return; roomScene[roomCode] = { url, mimeType: mimeType || 'image/jpeg' }; io.to(roomCode).emit('scene_change', roomScene[roomCode]); console.log(`[Cena] Nova cena na sala ${roomCode}:`, url) })

        // ── Imagem mostrada pelo mestre ──────────────────────────────────────
        // Não é cena nem item: aparece por cima de tudo e cada um fecha a sua.
        // Não fica guardada — quem entrar depois não recebe.
        socket.on('image_show', ({ url } = {}) => { if (roomMasters[roomCode] !== socket.id) return; if (!url || typeof url !== 'string') return; io.to(roomCode).emit('image_show', { url }); console.log(`[Imagem] Mestre mostrou uma imagem na sala ${roomCode}`) })
        socket.on('image_hide', () => { if (roomMasters[roomCode] !== socket.id) return; io.to(roomCode).emit('image_hide'); console.log(`[Imagem] Mestre recolheu a imagem na sala ${roomCode}`) })

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
        // Sala com sistema só aceita personagens dele. O app já filtra; isto
        // segura quem estiver numa versão antiga.
        socket.on('share_characters', ({ playerName, characters }) => {
            const sistema = roomOwners[roomCode]?.sistema
            const daSala = (characters || []).filter(c => !sistema || c.system === sistema)
            roomChars[roomCode][socket.id] = { playerName, characters: daSala }
            console.log(`[Chars] ${playerName} — ${daSala.length} personagem(ns) na sala ${roomCode}`)
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

        // ── D&D: teste de d20, dano ou cura ──────────────────────────────────
        // Mesmo modelo do Calico: o app já rolou, aqui só vira linha de chat.
        socket.on('dnd_roll', (bruto) => {
            if (!bruto || !Array.isArray(bruto.dados)) return
            const texto = (v, max) => String(v ?? '').slice(0, max)
            const num = v => (Number.isFinite(+v) ? Math.round(+v) : 0)
            const dadosDe = lista => (Array.isArray(lista) ? lista : []).slice(0, 80).map(d => ({ lados: num(d.lados), valor: num(d.valor) }))
            const res = {
                id: texto(bruto.id, 12),
                personagem: texto(bruto.personagem, 60),
                rotulo: texto(bruto.rotulo, 80),
                tipo: ['teste', 'ataque', 'dano', 'cura', 'magia'].includes(bruto.tipo) ? bruto.tipo : 'teste',
                modo: ['normal', 'vantagem', 'desvantagem'].includes(bruto.modo) ? bruto.modo : 'normal',
                dados: dadosDe(bruto.dados),
                natural: num(bruto.natural), bonus: num(bruto.bonus), total: num(bruto.total),
                expressao: texto(bruto.expressao, 40), tipoDano: texto(bruto.tipoDano, 20),
                critico: !!bruto.critico, falha: !!bruto.falha,
            }
            if (res.tipo === 'magia' && bruto.ataque) {
                const a = bruto.ataque
                res.ataque = { dados: dadosDe(a.dados), natural: num(a.natural), bonus: num(a.bonus), total: num(a.total) }
            }
            const ehMestre = roomMasters[roomCode] === socket.id
            res.secreto = !!bruto.secreto && ehMestre
            // O app espera esta confirmação; sem ela, mostra a rolagem por conta
            // própria (é o que acontece com um servidor que não conhece dnd_roll)
            socket.emit('dnd_ack', { id: res.id })

            // Ex.: "Thorin — Atletismo: d20(14, 7) vantagem +5 = 19  ✦ 20 natural"
            const sinal = n => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`)
            const d20 = (dados, bonus, total) => `d20(${dados.map(d => d.valor).join(', ')})${res.modo !== 'normal' ? ' ' + res.modo : ''}`
                + (bonus ? ` ${sinal(bonus)}` : '') + ` = ${total}`
            let corpo
            if (res.tipo === 'magia' && res.ataque) {
                corpo = `ataque ${d20(res.ataque.dados, res.ataque.bonus, res.ataque.total)}`
                    + (res.falha ? '  ✗ 1 natural'
                        : ` · dano ${res.expressao || 'dados'}(${res.dados.map(d => d.valor).join(', ')}) = ${res.total}`
                        + (res.tipoDano ? ` de ${res.tipoDano}` : '') + (res.critico ? '  ✦ crítico' : ''))
            } else if (res.tipo === 'dano' || res.tipo === 'cura') {
                const valores = res.dados.map(d => d.valor).join(', ')
                corpo = `${res.expressao || 'dados'}(${valores}) = ${res.total}`
                    + (res.tipo === 'cura' ? ' de cura' : res.tipoDano ? ` de ${res.tipoDano}` : '')
                    + (res.critico ? '  ✦ crítico' : '')
            } else {
                const valores = res.dados.map(d => d.valor).join(', ')
                corpo = `d20(${valores})${res.modo !== 'normal' ? ' ' + res.modo : ''}`
                    + (res.bonus ? ` ${sinal(res.bonus)}` : '') + ` = ${res.total}`
                    + (res.critico ? '  ✦ 20 natural' : res.falha ? '  ✗ 1 natural' : '')
            }
            const linha = {
                playerName: CHAT_DADOS,
                message: `${res.personagem || '?'} — ${res.rotulo}: ${corpo}`,
                type: 'roll',
                critico: res.critico, falha: res.falha, secreto: res.secreto,
            }

            if (res.secreto) {
                socket.emit('chat_message', linha)
            } else {
                io.to(roomCode).emit('dnd_result', res)
                io.to(roomCode).emit('chat_message', linha)
            }
            console.log(`[D&D]${res.secreto ? ' (secreto)' : ''} ${linha.message} na sala ${roomCode}`)
        })

        // ══ D&D: modo de batalha ═════════════════════════════════════════════
        // O mestre manda a ordem pronta (o app dele rola a iniciativa dos
        // personagens). O servidor guarda turno, rodada e o que cada um já
        // gastou no turno, e repassa os anúncios do mestre (criatura conjura,
        // ataca, sai do alcance) para os jogadores decidirem suas reações.
        const ehMestreAgora = () => roomMasters[roomCode] === socket.id
        const ehDonoDaEntrada = ent => !!ent && !!ent.charId
            && !!roomChars[roomCode]?.[socket.id]?.characters.some(c => c.id === ent.charId)
        const economiaNova = () => ({ acoes: 1, acoesUsadas: 0, bonusUsada: false, reacaoUsada: false })
        const emitirCombate = () => io.to(roomCode).emit('combate_estado', roomCombate[roomCode] || null)
        const avisarBatalha = message => io.to(roomCode).emit('chat_message', { playerName: '⚔ Batalha', message, type: 'text' })
        const limparEntrada = e => ({
            id: String(e?.id ?? '').slice(0, 40),
            tipo: e?.tipo === 'pj' ? 'pj' : 'criatura',
            nome: String(e?.nome ?? '?').slice(0, 40),
            charId: e?.charId ? String(e.charId).slice(0, 64) : null,
            dono: e?.dono ? String(e.dono).slice(0, 40) : null,
            foto: typeof e?.foto === 'string' && e.foto.length < 600 ? e.foto : null,
            iniciativa: Number.isFinite(+e?.iniciativa) ? Math.round(+e.iniciativa) : 0,
            desempate: Number.isFinite(+e?.desempate) ? +e.desempate : 0,
        })

        socket.on('combate_iniciar', ({ ordem } = {}) => {
            if (!ehMestreAgora() || !Array.isArray(ordem) || !ordem.length) return
            const lista = ordem.slice(0, 40).map(limparEntrada).filter(e => e.id)
            roomCombate[roomCode] = {
                rodada: 1, turno: 0, ordem: lista,
                economia: Object.fromEntries(lista.map(e => [e.id, economiaNova()])),
            }
            emitirCombate()
            avisarBatalha(`Batalha iniciada! Ordem: ${lista.map(e => `${e.nome} ${e.iniciativa}`).join(' · ')}`)
            avisarBatalha(`Rodada 1 — turno de ${lista[0].nome}`)
            console.log(`[Batalha] Iniciada na sala ${roomCode} com ${lista.length} participante(s)`)
        })

        // Mestre ajustou a ordem: criatura nova, removida ou posição trocada
        socket.on('combate_ordem', ({ ordem } = {}) => {
            const c = roomCombate[roomCode]
            if (!c || !ehMestreAgora() || !Array.isArray(ordem) || !ordem.length) return
            const atual = c.ordem[c.turno]?.id
            c.ordem = ordem.slice(0, 40).map(limparEntrada).filter(e => e.id)
            c.ordem.forEach(e => { if (!c.economia[e.id]) c.economia[e.id] = economiaNova() })
            const idx = c.ordem.findIndex(e => e.id === atual)
            c.turno = idx >= 0 ? idx : Math.min(c.turno, c.ordem.length - 1)
            emitirCombate()
        })

        socket.on('combate_proximo', () => {
            const c = roomCombate[roomCode]
            if (!c) return
            if (!ehMestreAgora() && !ehDonoDaEntrada(c.ordem[c.turno])) return
            c.turno = (c.turno + 1) % c.ordem.length
            if (c.turno === 0) c.rodada++
            // A reação volta no começo do próprio turno, junto com a ação
            c.economia[c.ordem[c.turno].id] = economiaNova()
            emitirCombate()
            avisarBatalha(`Rodada ${c.rodada} — turno de ${c.ordem[c.turno].nome}`)
        })

        socket.on('combate_gastar', ({ id, campo, valor } = {}) => {
            const c = roomCombate[roomCode]
            if (!c || !c.economia[id]) return
            const ent = c.ordem.find(e => e.id === id)
            if (!ehMestreAgora() && !ehDonoDaEntrada(ent)) return
            const e = c.economia[id]
            if (campo === 'acoesUsadas' || campo === 'acoes') e[campo] = Math.max(0, Math.min(4, Math.round(+valor) || 0))
            else if (campo === 'bonusUsada' || campo === 'reacaoUsada') e[campo] = !!valor
            else return
            emitirCombate()
        })

        socket.on('combate_encerrar', () => {
            if (!ehMestreAgora() || !roomCombate[roomCode]) return
            const rodadas = roomCombate[roomCode].rodada
            delete roomCombate[roomCode]
            emitirCombate()
            avisarBatalha(`Batalha encerrada depois de ${rodadas} rodada${rodadas > 1 ? 's' : ''}.`)
        })

        // Anúncio do mestre: { tipo: magia|ataque|oportunidade|dano, criatura,
        // alvoId?, magia?, nivel?, total?, corpo?, dano? }
        socket.on('combate_anuncio', (a = {}) => {
            if (!ehMestreAgora() || !roomCombate[roomCode]) return
            if (!['magia', 'ataque', 'oportunidade', 'dano'].includes(a.tipo)) return
            const anuncio = {
                id: Math.random().toString(36).slice(2, 10),
                tipo: a.tipo,
                criatura: String(a.criatura ?? 'Criatura').slice(0, 40),
                alvoId: a.alvoId ? String(a.alvoId).slice(0, 40) : null,
                magia: a.magia ? String(a.magia).slice(0, 60) : null,
                nivel: Math.max(0, Math.min(9, Math.round(+a.nivel) || 0)),
                total: Math.round(+a.total) || 0,
                corpo: !!a.corpo,
                dano: Math.max(0, Math.round(+a.dano) || 0),
            }
            io.to(roomCode).emit('combate_anuncio', anuncio)
            const alvo = roomCombate[roomCode].ordem.find(e => e.id === anuncio.alvoId)
            const texto = {
                magia: `${anuncio.criatura} começa a conjurar ${anuncio.magia || 'uma magia'}${anuncio.nivel ? ` (${anuncio.nivel}º nível)` : ''}.`,
                ataque: `${anuncio.criatura} ataca ${alvo ? alvo.nome : '?'} (${anuncio.total} no ataque${anuncio.corpo ? ', corpo-a-corpo' : ''}).`,
                oportunidade: `${anuncio.criatura} sai do alcance de ${alvo ? alvo.nome : '?'}.`,
                dano: `${alvo ? alvo.nome : '?'} sofre ${anuncio.dano} de dano de ${anuncio.criatura}.`,
            }[anuncio.tipo]
            avisarBatalha(texto)
        })

        // Resposta de um jogador a um anúncio: gasta a reação dele
        socket.on('combate_reacao', (r = {}) => {
            const c = roomCombate[roomCode]
            if (!c || !c.economia[r.entradaId]) return
            const ent = c.ordem.find(e => e.id === r.entradaId)
            if (!ehMestreAgora() && !ehDonoDaEntrada(ent)) return
            c.economia[r.entradaId].reacaoUsada = true
            const resposta = {
                anuncioId: String(r.anuncioId ?? '').slice(0, 12),
                entradaId: ent.id,
                nome: ent.nome,
                reacao: String(r.reacao ?? '').slice(0, 30),
                texto: String(r.texto ?? '').slice(0, 160),
                efeito: ['erra', 'metade', 'reduz', 'anula', 'falha', 'nada'].includes(r.efeito) ? r.efeito : 'nada',
                reducao: Math.max(0, Math.round(+r.reducao) || 0),
            }
            io.to(roomCode).emit('combate_reacao', resposta)
            emitirCombate()
            avisarBatalha(`⚡ ${ent.nome}: ${resposta.texto}`)
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
