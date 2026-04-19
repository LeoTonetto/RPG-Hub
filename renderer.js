// ── Entry point do cliente ─────────────────────────────────────────────────────
// Cada módulo em src/ é responsável por uma fatia da aplicação.
// Este arquivo apenas inicializa tudo na ordem correta.

const { initHUD } = require('./src/hud')
const { initAuth, checkSession } = require('./src/auth')
const { initCharModal } = require('./src/characters')
const { initDice } = require('./src/dice')
const { initRoom } = require('./src/room')
const { initJournal } = require('./src/journal')
const state = require('./src/state')

// Módulos que se auto-registram no DOM ao ser importados
// (event listeners aplicados direto nos elementos existentes)
require('./src/statPopup')
require('./src/inventory')
require('./src/sfx')
require('./src/npc')      // registra handlers; initNPC() é chamado pelo socket.js
require('./src/reputation')  // barra de reputação; initReputation() é chamado pelo socket.js


// ── Inicialização ─────────────────────────────────────────────────────────────
initHUD()         // botões HUD/chat + atalhos de teclado
initAuth()        // login, registro, logout
initCharModal()   // modal de criação de personagem
initDice()        // FAB de dados
initRoom()        // criar/entrar na sala, badge
initJournal()     // jornal de missões

checkSession()    // tenta restaurar sessão ativa automaticamente

window.addEventListener('beforeunload', () => {
    if (state.currentRoomCode && state.serverUrl) {
        fetch(`${state.serverUrl}/cleanup-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode: state.currentRoomCode }),
            keepalive: true   // garante envio mesmo com a janela fechando
        }).catch(() => { })
    }
})
