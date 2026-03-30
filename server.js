const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

// Garante que o diretório de cenas existe
const SCENES_DIR = path.join(__dirname, 'scenes')
if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR)

const rooms = {}      // { roomCode: { socketId: { x, y } } }
const roomCodes = {}  // { CODE: url }
const urlCodes = {}   // { normalizedUrl: CODE }
const roomChars = {}  // { roomCode: { socketId: { playerName, characters[] } } }
const roomMusic = {}  // { roomCode: { videoId, startedBy, startTime } | null }
const roomMasters = {}// { roomCode: socketId }
const roomScene = {}  // { roomCode: { url, mimeType } | null }

function normalizeUrl(url) { return url.toLowerCase().replace(/\/$/, '') }

function broadcastRoomChars(roomCode) {
    const entries = roomChars[roomCode] || {}
    const all = []
    for (const sid in entries) {
        const { playerName, characters } = entries[sid]
        characters.forEach(char => all.push({ playerName, character: char }))
    }
    io.to(roomCode).emit('room_characters', all)
}

// Upload de cena (arquivo bruto no body)
app.post('/upload-scene', (req, res) => {
    const ext = (req.headers['x-file-ext'] || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase()
    const filename = `scene_${Date.now()}.${ext}`
    const filepath = path.join(SCENES_DIR, filename)
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
        try {
            fs.writeFileSync(filepath, Buffer.concat(chunks))
            res.json({ ok: true, scenePath: `/scenes/${filename}` })
            console.log('[Cena] Arquivo salvo:', filename)
        } catch (e) {
            console.error('[Cena] Erro ao salvar:', e)
            res.status(500).json({ error: 'Falha ao salvar arquivo' })
        }
    })
    req.on('error', () => res.status(500).json({ error: 'Erro no upload' }))
})

// Serve arquivos de cena estáticos
app.use('/scenes', express.static(SCENES_DIR))

app.get('/debug', (req, res) => {
    res.json({ roomCodes, urlCodes, rooms: Object.keys(rooms) })
})

app.get('/resolve-code/:code', (req, res) => {
    const code = req.params.code.toUpperCase()
    res.json({ url: roomCodes[code] || null })
})

app.post('/register-room', express.json(), (req, res) => {
    const data = req.body
    const norm = normalizeUrl(data.url)
    roomCodes[data.code.toUpperCase()] = data.url
    urlCodes[norm] = data.code.toUpperCase()
    console.log('Sala registrada:', data.code, '->', data.url)
    res.json({ ok: true })
})

// Serve static files
app.use(express.static(__dirname))

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
        console.log('[Música] mestre definido:', socket.id, 'na sala', roomCode)
    }

    // Notifica o cliente se ele é o mestre
    socket.emit('master_status', roomMasters[roomCode] === socket.id)

    // Envia estado atual da música para quem acabou de entrar
    if (roomMusic[roomCode]) {
        const elapsed = (Date.now() - roomMusic[roomCode].startTime) / 1000
        socket.emit('music_play', { ...roomMusic[roomCode], seekTime: elapsed })
    }

    // Envia cena atual para quem acabou de entrar
    if (roomScene[roomCode]) {
        socket.emit('scene_change', roomScene[roomCode])
    }

    // Mestre inicia uma música — transmite para toda a sala
    socket.on('play_music', ({ videoId, startedBy }) => {
        if (roomMasters[roomCode] !== socket.id) {
            console.warn(`[Música] tentativa não autorizada de play_music por ${socket.id} na sala ${roomCode}`)
            return
        }
        if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
            console.warn(`[Música] play_music recebido com videoId inválido na sala ${roomCode}:`, videoId)
            return
        }
        roomMusic[roomCode] = { videoId: videoId.trim(), startedBy: startedBy || 'unknown', startTime: Date.now() }
        io.to(roomCode).emit('music_play', roomMusic[roomCode])
        console.log(`[Música] ${startedBy} tocou ${videoId} na sala ${roomCode}`)
    })

    // Mestre para a música — transmite para toda a sala
    socket.on('stop_music', ({ stoppedBy }) => {
        if (roomMasters[roomCode] !== socket.id) {
            console.warn(`[Música] tentativa não autorizada de stop_music por ${socket.id} na sala ${roomCode}`)
            return
        }
        roomMusic[roomCode] = null
        io.to(roomCode).emit('music_stop', { stoppedBy })
        console.log(`[Música] ${stoppedBy} parou a música na sala ${roomCode}`)
    })

    // Mestre troca a cena de fundo — transmite para toda a sala
    socket.on('scene_change', ({ url, mimeType }) => {
        if (roomMasters[roomCode] !== socket.id) {
            console.warn(`[Cena] tentativa não autorizada por ${socket.id} na sala ${roomCode}`)
            return
        }
        if (!url || typeof url !== 'string') return
        roomScene[roomCode] = { url, mimeType: mimeType || 'image/jpeg' }
        io.to(roomCode).emit('scene_change', roomScene[roomCode])
        console.log(`[Cena] Nova cena na sala ${roomCode}:`, url)
    })

    // Recebe personagens do jogador e redistribui para todos na sala
    socket.on('share_characters', ({ playerName, characters }) => {
        roomChars[roomCode][socket.id] = { playerName, characters: characters || [] }
        console.log(`[Chars] ${playerName} — ${characters?.length} personagem(ns) na sala ${roomCode}`)
        broadcastRoomChars(roomCode)
    })

    // Atualização de atributos (vida, sanidade, balas) — mestre pode alterar qualquer char, jogador só o seu
    socket.on('stat_update', ({ charId, field, value, ownerName }) => {
        if (!roomChars[roomCode]) return
        // Valida permissão: só mestre ou dono do personagem
        const isMaster = roomMasters[roomCode] === socket.id
        const isOwner = roomChars[roomCode][socket.id] &&
            roomChars[roomCode][socket.id].characters.some(c => c.id === charId)
        if (!isMaster && !isOwner) {
            console.warn(`[Stat] ${socket.id} tentou alterar char ${charId} sem permissão na sala ${roomCode}`)
            return
        }
        // Aplica a mudança localmente no servidor para novos jogadores
        for (const sid in roomChars[roomCode]) {
            const entry = roomChars[roomCode][sid]
            const char = entry.characters.find(c => c.id === charId)
            if (char) {
                char[field] = value
                break
            }
        }
        // Transmite para toda a sala
        io.to(roomCode).emit('stat_update', { charId, field, value, ownerName })
        console.log(`[Stat] ${ownerName} atualizou ${field}=${value} em char ${charId} na sala ${roomCode}`)
    })

    socket.on('chat_message', ({ playerName, message }) => {
        if (!message || typeof message !== 'string' || !message.trim()) return
        const safe = message.trim().slice(0, 300)
        io.to(roomCode).emit('chat_message', { playerName: playerName || 'Anônimo', message: safe })
    })

    socket.on('mouse_move', (data) => {
        rooms[roomCode][socket.id] = data
        io.to(roomCode).emit('players_update', rooms[roomCode])
    })

    socket.on('dice_roll', (data) => {
        io.to(roomCode).emit('dice_result', data)
    })

    socket.on('disconnect', () => {
        if (rooms[roomCode]) { delete rooms[roomCode][socket.id]; io.to(roomCode).emit('players_update', rooms[roomCode]) }
        if (roomChars[roomCode]) { delete roomChars[roomCode][socket.id]; broadcastRoomChars(roomCode) }
    })
})

function startServer() {
    return new Promise((resolve) => {
        httpServer.listen(3001, () => { console.log('Servidor na porta 3001'); resolve() })
    })
}

module.exports = { startServer }
