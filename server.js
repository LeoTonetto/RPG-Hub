// ══════════════════════════════════════════════════════════════════════════════
// server.js — Express + Socket.IO
//
// O MESMO servidor roda em dois lugares:
//
//   • dentro do app do mestre (modo ngrok) — main.js chama startServer()
//   • numa VPS (modo servidor)             — server/standalone.js é o entrypoint
//
// Nada aqui depende do Electron. A única parte que dependia era o diretório de
// cenas, que agora se resolve sozinho (ver server/scenes.js).
// ══════════════════════════════════════════════════════════════════════════════

const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const crypto = require('crypto')

const {
    setupSceneRoutes, limparCenasDaSala, limparCenasOrfas, tamanhoDasCenas,
} = require('./server/scenes')
const { setupSocketHandlers } = require('./server/handlers')
const {
    roomCodes, urlCodes, rooms, roomOwners,
    normalizeUrl, limparSalasVencidas,
    registrarAoFecharSala, salasAtivas, SALA_VAZIA_MS,
} = require('./server/roomState')

const PORTA = parseInt(process.env.PORT, 10) || 3001

const app = express()
const httpServer = createServer(app)

// CORS aberto: os clientes são apps Electron, que não têm origem web fixa.
// Quem controla o acesso é o código da sala mais o masterToken.
const io = new Server(httpServer, { cors: { origin: '*' } })

// Atrás de um proxy reverso (nginx), confia no X-Forwarded-For para os logs
app.set('trust proxy', true)

// ── Rotas de cena ────────────────────────────────────────────────────────────
setupSceneRoutes(app, express)

// ── Saúde, para o systemd e para você conferir do navegador ──────────────────
app.get('/health', (req, res) => {
    res.json({
        ok: true,
        salas: Object.keys(roomOwners).length,
        conectados: Object.values(rooms).reduce((n, r) => n + Object.keys(r).length, 0),
        cenas: tamanhoDasCenas(),
        uptime: Math.round(process.uptime()),
    })
})

app.get('/debug', (req, res) => {
    // Não devolve tokens: só o que ajuda a diagnosticar
    res.json({
        roomCodes,
        urlCodes,
        rooms: Object.keys(rooms),
        salas: Object.fromEntries(Object.entries(roomOwners).map(([code, s]) => [code, {
            ownerId: s.ownerId, url: s.url, createdAt: s.createdAt, lastSeen: s.lastSeen,
        }])),
    })
})

app.get('/resolve-code/:code', (req, res) => {
    const code = req.params.code.toUpperCase()
    res.json({ url: roomCodes[code] || null })
})

// ══════════════════════════════════════════════════════════════════════════════
// ── Criar / registrar sala ───────────────────────────────────────────────────
//
// Devolve o masterToken, que é como o app do mestre prova quem é ao conectar.
// Reentrante: o mesmo dono pode registrar a mesma sala de novo (reconexão,
// reinício do app) e recebe o mesmo token. Dono diferente é recusado, para
// ninguém sequestrar um código em uso.
// ══════════════════════════════════════════════════════════════════════════════
app.post('/register-room', express.json(), (req, res) => {
    const { code, url, ownerId } = req.body || {}

    if (!code || typeof code !== 'string' || !/^[A-Z0-9]{4,12}$/i.test(code)) {
        return res.status(400).json({ error: 'Código de sala inválido' })
    }
    const sala = code.toUpperCase()
    const existente = roomOwners[sala]

    if (existente && ownerId && existente.ownerId && existente.ownerId !== ownerId) {
        console.log(`[Sala] ${sala} recusada: já pertence a outro dono`)
        return res.status(409).json({ error: 'Este código já está em uso por outra mesa. Crie a sala de novo.' })
    }

    const token = existente ? existente.token : crypto.randomBytes(24).toString('hex')

    roomOwners[sala] = {
        token,
        ownerId: ownerId || (existente && existente.ownerId) || null,
        url: url || (existente && existente.url) || null,
        createdAt: (existente && existente.createdAt) || Date.now(),
        lastSeen: Date.now(),
    }

    if (url) {
        roomCodes[sala] = url
        urlCodes[normalizeUrl(url)] = sala
    }

    console.log(`[Sala] ${sala} registrada${url ? ' -> ' + url : ''}${existente ? ' (reaproveitando token)' : ''}`)
    res.json({ ok: true, code: sala, masterToken: token })
})

// Encerrar a sala ao fechar o app (renderer.js chama no beforeunload)
app.post('/cleanup-room', express.json(), (req, res) => {
    const { roomCode, masterToken } = req.body || {}
    const sala = (roomCode || '').toUpperCase()
    const dono = roomOwners[sala]
    // Só o dono encerra. Sem token, ignora em silêncio — a varredura recicla depois.
    if (!dono || !masterToken || masterToken !== dono.token) return res.json({ ok: false })

    // Marca como vazia há bastante tempo: a próxima varredura fecha e apaga as
    // cenas. Não fechamos na hora de propósito — o mestre pode estar só
    // reiniciando o app, e os jogadores continuariam conectados.
    dono.vazioDesde = Date.now() - SALA_VAZIA_MS
    console.log(`[Sala] ${sala} marcada para fechar pelo dono`)
    res.json({ ok: true })
})

// ── Arquivos estáticos (HTML/CSS/JS do client) ────────────────────────────────
// Na VPS isso serve só o music-player/sfx-panel, que não são usados remotamente,
// mas não atrapalha e mantém os dois modos idênticos.
app.use(express.static(__dirname))

setupSocketHandlers(io)

// ── Ciclo de vida das salas ──────────────────────────────────────────────────
// Quando uma sala fecha, o que ela enviou some junto. Sem isto, os vídeos de
// fundo ficariam ocupando disco para sempre.
registrarAoFecharSala(code => limparCenasDaSala(code))

// As salas vivem em memória, então ao subir o servidor nenhuma existe: tudo que
// estiver na pasta de cenas é sobra de antes do reinício.
limparCenasOrfas(salasAtivas())

// Varredura de minuto em minuto. Antes era de hora em hora, o que somado à
// tolerância antiga deixava a sala de pé por até 13h depois de esvaziar.
const varredura = setInterval(limparSalasVencidas, 60 * 1000)
varredura.unref?.()

// ── Inicialização ─────────────────────────────────────────────────────────────
function startServer(porta = PORTA) {
    return new Promise((resolve, reject) => {
        httpServer.once('error', reject)
        httpServer.listen(porta, () => {
            console.log(`Servidor na porta ${porta}`)
            resolve(httpServer)
        })
    })
}

module.exports = { startServer, app, io, httpServer, PORTA }
