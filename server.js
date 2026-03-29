const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

const rooms = {}   // { roomCode: { socketId: { x, y } } }
const roomCodes = {}   // { CODE: url }
const urlCodes = {}   // { normalizedUrl: CODE }
const roomChars = {}   // { roomCode: { socketId: { playerName, characters[] } } }
const roomMusic = {}   // { roomCode: { videoId, startedBy } | null }
const roomMasters = {} // { roomCode: socketId }

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

    // Recebe personagens do jogador e redistribui para todos na sala
    socket.on('share_characters', ({ playerName, characters }) => {
        roomChars[roomCode][socket.id] = { playerName, characters: characters || [] }
        console.log(`[Chars] ${playerName} — ${characters?.length} personagem(ns) na sala ${roomCode}`)
        broadcastRoomChars(roomCode)
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
