// Estado compartilhado do servidor entre todos os módulos
const rooms = {}  // { roomCode: { socketId: { x, y, color } } }
const roomCodes = {}  // { CODE: publicUrl }
const urlCodes = {}  // { normalizedUrl: CODE }
const roomChars = {}  // { roomCode: { socketId: { playerName, characters[] } } }
const roomMusic = {}  // { roomCode: { videoId, startedBy, startTime } | null }
const roomMasters = {}  // { roomCode: socketId }  — quem é o mestre AGORA
const roomScene = {}  // { roomCode: { url, mimeType } | null }
const roomNPCs = {}  // { roomCode: { npcId: npcData } }  — NPCs ativos na cena
const roomReputation = {}  // { roomCode: number (-10 a +10) }
const roomMissions = {}  // { roomCode: [{ id, objective, status }] }

// ══════════════════════════════════════════════════════════════════════════════
// ── DONO DA SALA ─────────────────────────────────────────────────────────────
//
// Antes, mestre era simplesmente "a primeira conexão da sala". Isso funcionava
// enquanto o servidor vivia dentro do app do mestre — ele subia o servidor e
// conectava primeiro, então sempre ganhava. Num servidor que fica de pé (VPS),
// dois problemas aparecem:
//
//   1. qualquer jogador que conecte antes do mestre vira mestre e ganha música,
//      cena, NPCs, rolagem secreta e edição de ficha alheia;
//   2. se o mestre cair e reconectar, o socket id muda e ele perde o posto —
//      para sempre, porque nada reatribuía.
//
// Agora a sala tem dono: ao criar, o app do mestre recebe um `masterToken`, que
// guarda e reenvia no handshake. Quem apresenta o token é o mestre, quantas
// vezes reconectar for preciso.
//
// { roomCode: { token, ownerId, url, createdAt, lastSeen } }
// ══════════════════════════════════════════════════════════════════════════════
const roomOwners = {}

// ══════════════════════════════════════════════════════════════════════════════
// ── QUANDO A SALA FECHA ──────────────────────────────────────────────────────
//
// Eram 12 horas de tolerância, varridas de hora em hora — na prática uma sala
// ficava de pé até 13h depois de todo mundo sair, segurando os vídeos de fundo
// no disco e o código de 6 letras reservado.
//
// Agora a sala fecha alguns minutos depois de esvaziar. A carência existe para
// aguentar o normal: alguém caiu o Wi-Fi, o mestre reiniciou o app, todo mundo
// saiu para o intervalo. Dez minutos cobrem isso com folga.
// ══════════════════════════════════════════════════════════════════════════════
const SALA_VAZIA_MS = (parseInt(process.env.ROOM_EMPTY_MINUTES, 10) > 0
    ? parseInt(process.env.ROOM_EMPTY_MINUTES, 10)
    : 10) * 60 * 1000

// Teto absoluto: mesmo com gente conectada, uma sala esquecida aberta por dias
// (app minimizado, máquina ligada) acaba sendo reciclada.
const SALA_TTL_MS = (parseInt(process.env.ROOM_MAX_HOURS, 10) > 0
    ? parseInt(process.env.ROOM_MAX_HOURS, 10)
    : 24) * 60 * 60 * 1000

// Quem quiser ser avisado do fechamento se registra aqui. É assim que a
// limpeza das cenas entra, sem roomState precisar conhecer o módulo de cenas.
const ouvintesDeFechamento = []

function registrarAoFecharSala(fn) {
    if (typeof fn === 'function') ouvintesDeFechamento.push(fn)
}

function normalizeUrl(url) {
    return url.toLowerCase().replace(/\/$/, '')
}

/** Marca atividade na sala e cancela a contagem de sala vazia. */
function tocarSala(roomCode) {
    const sala = roomOwners[roomCode]
    if (!sala) return
    sala.lastSeen = Date.now()
    sala.vazioDesde = null
}

/** Derruba a sala e tudo que pertence a ela. */
function fecharSala(code, motivo = 'inatividade') {
    const sala = roomOwners[code]
    const url = sala && sala.url

    delete roomOwners[code]
    delete roomCodes[code]
    if (url) delete urlCodes[normalizeUrl(url)]
    delete rooms[code]
    delete roomChars[code]
    delete roomMusic[code]
    delete roomMasters[code]
    delete roomScene[code]
    delete roomNPCs[code]
    delete roomReputation[code]
    delete roomMissions[code]

    // Avisa quem precisa limpar o que ficou para trás (cenas, por exemplo)
    ouvintesDeFechamento.forEach(fn => {
        try { fn(code, motivo) } catch (e) { console.warn('[Salas] ouvinte falhou:', e.message) }
    })

    console.log(`[Salas] ${code} fechada (${motivo})`)
}

/**
 * Varre as salas e fecha as que passaram do tempo. Roda de minuto em minuto.
 *
 * A contagem de "vazia desde" é feita aqui, e não no disconnect, de propósito:
 * assim ela não depende do handler de desconexão ter rodado — se o processo
 * perdeu um evento, a varredura seguinte corrige sozinha.
 */
function limparSalasVencidas() {
    const agora = Date.now()
    const fechadas = []

    for (const code of Object.keys(roomOwners)) {
        const sala = roomOwners[code]
        const gente = rooms[code] ? Object.keys(rooms[code]).length : 0

        if (gente > 0) {
            sala.lastSeen = agora
            sala.vazioDesde = null

            // Teto absoluto, mesmo com gente dentro
            if (agora - (sala.createdAt || agora) > SALA_TTL_MS) {
                fecharSala(code, 'tempo máximo de sala')
                fechadas.push(code)
            }
            continue
        }

        // Esvaziou agora: começa a contar a carência
        if (!sala.vazioDesde) {
            sala.vazioDesde = agora
            continue
        }

        if (agora - sala.vazioDesde >= SALA_VAZIA_MS) {
            fecharSala(code, `vazia há ${Math.round((agora - sala.vazioDesde) / 60000)} min`)
            fechadas.push(code)
        }
    }

    return fechadas
}

/** Códigos das salas abertas — usado para achar cenas órfãs. */
function salasAtivas() {
    return Object.keys(roomOwners)
}

module.exports = {
    rooms, roomCodes, urlCodes, roomChars,
    roomMusic, roomMasters, roomScene, roomNPCs,
    roomReputation, roomMissions, roomOwners,
    normalizeUrl, tocarSala, fecharSala, limparSalasVencidas,
    registrarAoFecharSala, salasAtivas,
    SALA_TTL_MS, SALA_VAZIA_MS,
}
