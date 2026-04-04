// Estado compartilhado do servidor entre todos os módulos
const rooms = {}  // { roomCode: { socketId: { x, y } } }
const roomCodes = {}  // { CODE: publicUrl }
const urlCodes = {}  // { normalizedUrl: CODE }
const roomChars = {}  // { roomCode: { socketId: { playerName, characters[] } } }
const roomMusic = {}  // { roomCode: { videoId, startedBy, startTime } | null }
const roomMasters = {}  // { roomCode: socketId }
const roomScene = {}  // { roomCode: { url, mimeType } | null }
const roomNPCs = {}  // { roomCode: { npcId: npcData } }  — NPCs ativos na cena

function normalizeUrl(url) {
    return url.toLowerCase().replace(/\/$/, '')
}

module.exports = { rooms, roomCodes, urlCodes, roomChars, roomMusic, roomMasters, roomScene, roomNPCs, normalizeUrl }
