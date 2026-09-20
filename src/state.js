const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://jxwjvaanfzufklyrsxrk.supabase.co'
const SUPABASE_KEY = 'sb_publishable_A2oU2UYshxiIvb6EHLS8BA_tWbveC72'

let supabase
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    console.log('[Supabase] Cliente inicializado')
} catch (e) {
    console.error('[Supabase] Falha ao inicializar:', e)
}

const state = {
    supabase,

    // Auth
    playerName: localStorage.getItem('playerName') || 'Aventureiro',
    currentUserId: null,
    isLoginMode: true,

    // Sala
    socket: null,
    currentRoomCode: null,
    serverUrl: null,
    isRoomMaster: false,
    rooms: {},   // mapa local código→url

    // Onde a sala é hospedada: 'ngrok' (túnel a partir da máquina do mestre)
    // ou 'vps' (servidor próprio, sempre no ar). Ver src/backend.js
    backendMode: 'ngrok',
    vpsUrl: '',
    masterToken: null,   // prova que este app é o dono da sala

    // Personagens
    playerCharacters: [],
    allCharsCache: [],

    // Character options popup & edit mode
    activeCharacterId: null,  // personagem ativo para rolagem de dados
    charOptionsChar: null,
    charOptionsCardEl: null,
    charOptionsOwner: null,
    editCharMode: false,
    editCharId: null,

    // Stat popup
    statPopupCharId: null,
    statPopupChar: null,

    // Inventário
    inventories: {},   // { charId: [ { id, icon, name } ] }

    // Background
    activeBgLayer: 'A',

    // YouTube
    ytPlayer: null,
    ytReady: false,
    pendingVideoId: null,
    pendingSeekTime: 0,

    // NPCs ativos na cena
    activeNPCs: {},   // { npcId: { id, name, photo, description } }

    // Missões
    missions: [],   // [{ id, room_code, objective, status, show_objective, sort_order }]

    // Preferencias do jogador (ver config.js)
    cursorColor: null,     // cor do proprio cursor, vista pelos outros
    veuOpacidade: 1,       // escurecido por cima da cena; 0 = limpo
    zoom: 1,               // escala da interface inteira; 1 = tamanho original
    cursorProprio: false,  // true = esconde o cursor do sistema e desenha o da plataforma

    // UI
    hudVisible: true,
    chatVisible: false,
    fabOpen: false,
    resultTimer: null,
}

module.exports = state
