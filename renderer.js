// ── Entry point do cliente ─────────────────────────────────────────────────────
// Cada módulo em src/ é responsável por uma fatia da aplicação.
// Este arquivo apenas inicializa tudo na ordem correta.

const { initHUD }      = require('./src/hud')
const { initAuth, checkSession } = require('./src/auth')
const { initCharModal }= require('./src/characters')
const { initDice }     = require('./src/dice')
const { initRoom }     = require('./src/room')

// Módulos que se auto-registram no DOM ao ser importados
// (event listeners aplicados direto nos elementos existentes)
require('./src/statPopup')
require('./src/inventory')

// ── Inicialização ─────────────────────────────────────────────────────────────
initHUD()         // botões HUD/chat + atalhos de teclado
initAuth()        // login, registro, logout
initCharModal()   // modal de criação de personagem
initDice()        // FAB de dados
initRoom()        // criar/entrar na sala, badge

checkSession()    // tenta restaurar sessão ativa automaticamente
