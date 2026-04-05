const state = require('./state')

// ── Electron IPC ──────────────────────────────────────────────────────────────
const IS_ELECTRON = typeof window !== 'undefined' && window.process?.type === 'renderer'

let ipcRenderer = null
if (IS_ELECTRON) {
    try { ipcRenderer = require('electron').ipcRenderer } catch (e) { }
}

// ── Pool de áudio para reutilizar elementos ──────────────────────────────────
const audioPool = {}

// ── Abrir painel externo (só no Electron / mestre) ───────────────────────────
function openSfxPanel() {
    if (IS_ELECTRON && ipcRenderer) {
        ipcRenderer.send('open-sfx-panel')
        console.log('[SFX] Pediu abertura do painel externo')
    }
}

// ── Botão no painel do mestre ─────────────────────────────────────────────────
document.getElementById('sfxOpenBtn')?.addEventListener('click', openSfxPanel)

// ── Receber trigger do painel externo (via main process) ──────────────────────
if (IS_ELECTRON && ipcRenderer) {
    ipcRenderer.on('sfx-trigger', (event, { audioUrl, sfxName, volume }) => {
        console.log('[SFX] Trigger recebido do painel externo:', sfxName, 'vol:', volume)
        // Emite via socket para todos na sala (incluindo o volume)
        if (state.socket) {
            state.socket.emit('play_sfx', { audioUrl, sfxName, volume })
        }
    })
}

// ── Tocar SFX localmente (chamado pelo socket em todos os clientes) ──────────
function playSfxAudio(audioUrl, volume) {
    const vol = typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 0.8

    try {
        if (!audioPool[audioUrl]) {
            audioPool[audioUrl] = new Audio(audioUrl)
        }
        const audio = audioPool[audioUrl]
        audio.currentTime = 0
        audio.volume = vol
        audio.play().catch(e => {
            console.warn('[SFX] Erro ao reproduzir:', e.message)
            delete audioPool[audioUrl]
            const fresh = new Audio(audioUrl)
            fresh.volume = vol
            fresh.play().catch(e2 => console.error('[SFX] Falha definitiva:', e2))
        })
    } catch (e) {
        console.error('[SFX] playSfxAudio:', e)
    }
}

// ── Init (chamado quando entra na sala) ───────────────────────────────────────
function initSfxPanel() {
    const btn = document.getElementById('sfxOpenBtn')
    if (btn) btn.style.display = state.isRoomMaster ? 'block' : 'none'
}

module.exports = { initSfxPanel, playSfxAudio, openSfxPanel }
