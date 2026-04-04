const express = require('express')
const path = require('path')
const { createServer } = require('http')
const { Server } = require('socket.io')

const { setupSceneRoutes } = require('./server/scenes')
const { setupSocketHandlers, setupCleanupRoute } = require('./server/handlers')
const { roomCodes, urlCodes, rooms, normalizeUrl } = require('./server/roomState')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

// ── Rotas de cena ────────────────────────────────────────────────────────────
setupSceneRoutes(app, express)

// ── Rotas da API ─────────────────────────────────────────────────────────────
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

// ── Arquivos estáticos (HTML/CSS/JS do client) ────────────────────────────────
app.use(express.static(__dirname))

setupCleanupRoute(app, io)
setupSocketHandlers(io)

// ── Inicialização ─────────────────────────────────────────────────────────────
function startServer() {
    return new Promise((resolve) => {
        httpServer.listen(3001, () => {
            console.log('Servidor na porta 3001')
            resolve()
        })
    })
}

module.exports = { startServer }
