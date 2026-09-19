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

// Salas sem ninguém conectado por mais que isto são recicladas, para o código
// de 6 caracteres poder ser usado de novo.
const SALA_TTL_MS = 12 * 60 * 60 * 1000   // 12 horas

function normalizeUrl(url) {
    return url.toLowerCase().replace(/\/$/, '')
}

/** Marca atividade na sala, adiando a reciclagem. */
function tocarSala(roomCode) {
    if (roomOwners[roomCode]) roomOwners[roomCode].lastSeen = Date.now()
}

/** Remove salas vazias e vencidas. Chamado periodicamente pelo servidor. */
function limparSalasVencidas() {
    const agora = Date.now()
    let removidas = 0
    for (const code of Object.keys(roomOwners)) {
        const temGente = rooms[code] && Object.keys(rooms[code]).length > 0
        if (temGente) { roomOwners[code].lastSeen = agora; continue }
        if (agora - (roomOwners[code].lastSeen || 0) < SALA_TTL_MS) continue

        const url = roomOwners[code].url
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
        removidas++
    }
    if (removidas) console.log(`[Salas] ${removidas} sala(s) inativa(s) recicladas`)
    return removidas
}

module.exports = {
    rooms, roomCodes, urlCodes, roomChars,
    roomMusic, roomMasters, roomScene, roomNPCs,
    roomReputation, roomMissions, roomOwners,
    normalizeUrl, tocarSala, limparSalasVencidas, SALA_TTL_MS,
}
