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
    playerName:     localStorage.getItem('playerName') || 'Aventureiro',
    currentUserId:  null,
    isLoginMode:    true,

    // Sala
    socket:          null,
    currentRoomCode: null,
    serverUrl:       null,
    isRoomMaster:    false,
    rooms:           {},   // mapa local código→url

    // Personagens
    playerCharacters: [],
    allCharsCache:    [],

    // Stat popup
    statPopupCharId: null,
    statPopupChar:   null,

    // Inventário
    inventories: {},   // { charId: [ { id, icon, name } ] }

    // Background
    activeBgLayer: 'A',

    // YouTube
    ytPlayer:       null,
    ytReady:        false,
    pendingVideoId: null,
    pendingSeekTime: 0,

    // UI
    hudVisible:  true,
    chatVisible: false,
    fabOpen:     false,
    resultTimer: null,
}

module.exports = state
