const state = require('./state')

// ── Detecta se está rodando no Electron ──────────────────────────────────────
// Mestre: Electron com nodeIntegration → usa IPC para musicWindow oculta
// Players remotos: browser via ngrok → usa YouTube IFrame API diretamente
const IS_ELECTRON = typeof window !== 'undefined' && window.process?.type === 'renderer'

let ipcRenderer = null
if (IS_ELECTRON) {
    try { ipcRenderer = require('electron').ipcRenderer } catch (e) { }
}

// ── YouTube IFrame API (usado pelos players remotos no browser) ───────────────
let ytPlayer = null
let ytReady = false
let pendingVideoId = null
let pendingSeekTime = 0

function loadYouTubeAPI() {
    if (IS_ELECTRON) return   // Electron usa IPC, não precisa do IFrame API
    if (window.YT || document.getElementById('yt-api-script')) return

    window.onYouTubeIframeAPIReady = () => {
        ytReady = true
        console.log('[Música] YouTube IFrame API pronta')
        if (pendingVideoId) {
            _browserPlay(pendingVideoId, pendingSeekTime)
            pendingVideoId = null
        }
    }
    const tag = document.createElement('script')
    tag.id = 'yt-api-script'
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
}

function _browserPlay(videoId, seekTime) {
    const vol = parseInt(document.getElementById('volumeSlider')?.value ?? 60)

    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById({ videoId, startSeconds: Math.floor(seekTime || 0) })
        ytPlayer.setPlaybackQuality('tiny')
        ytPlayer.setVolume(vol)
        return
    }

    let bufferTimer = null

    ytPlayer = new YT.Player('ytPlayer', {
        height: '1', width: '1', videoId,
        playerVars: {
            autoplay: 1, controls: 0, loop: 1, playlist: videoId,
            start: Math.floor(seekTime || 0),
            vq: 'tiny',
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
        },
        events: {
            onReady(e) {
                e.target.setPlaybackQuality('tiny')
                e.target.setVolume(vol)
                e.target.playVideo()
            },
            onStateChange(e) {
                // Recuperação automática de buffering prolongado
                if (e.data === YT.PlayerState.BUFFERING) {
                    if (bufferTimer) return
                    bufferTimer = setTimeout(() => {
                        bufferTimer = null
                        if (!ytPlayer) return
                        const t = ytPlayer.getCurrentTime() || 0
                        console.log('[Música] buffering timeout — recuperando em:', t)
                        ytPlayer.seekTo(t + 0.1, true)
                    }, 4000)
                } else {
                    if (bufferTimer) { clearTimeout(bufferTimer); bufferTimer = null }
                    if (e.data === YT.PlayerState.PLAYING) e.target.unMute()
                }
            },
            onError(e) {
                console.error('[Música] Erro IFrame API:', e.data)
            }
        }
    })
}

// ── Interface pública ─────────────────────────────────────────────────────────
function playYouTubeVideo(videoId, seekTime = 0) {
    console.log('[Música] play —', videoId, IS_ELECTRON ? '(Electron/IPC)' : '(browser/IFrame)')

    if (IS_ELECTRON && ipcRenderer) {
        // Mestre: delega para a musicWindow oculta no main process
        ipcRenderer.send('music-play', { videoId, seekTime: seekTime || 0 })
        const vol = parseInt(document.getElementById('volumeSlider')?.value ?? 60)
        ipcRenderer.send('music-volume', { volume: vol })
    } else {
        // Player remoto: toca diretamente via IFrame API
        if (!ytReady) {
            pendingVideoId = videoId
            pendingSeekTime = seekTime || 0
            loadYouTubeAPI()
            return
        }
        _browserPlay(videoId, seekTime || 0)
    }
}

function stopYouTubeVideo() {
    console.log('[Música] stop —', IS_ELECTRON ? '(Electron/IPC)' : '(browser/IFrame)')

    if (IS_ELECTRON && ipcRenderer) {
        ipcRenderer.send('music-stop')
    } else {
        if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
            ytPlayer.stopVideo()
        }
    }
}

// ── Painel de música ──────────────────────────────────────────────────────────
function initMusicPanel() {
    const panel = document.getElementById('musicPanel')
    const masterControls = document.getElementById('musicMasterControls')

    panel.style.display = 'block'
    masterControls.style.display = state.isRoomMaster ? 'block' : 'none'

    // Pré-carrega a API para players remotos (sem custo se não tocar nada)
    if (!IS_ELECTRON) loadYouTubeAPI()

    if (panel.dataset.inited) return
    panel.dataset.inited = '1'

    const playBtn = document.getElementById('musicPlayBtn')
    const stopBtn = document.getElementById('musicStopBtn')
    const urlInput = document.getElementById('musicUrlInput')
    const volSlider = document.getElementById('volumeSlider')
    const volVal = document.getElementById('volumeVal')
    const scenePickerBtn = document.getElementById('scenePickerBtn')
    const sceneFileInput = document.getElementById('sceneFileInput')

    playBtn.addEventListener('click', () => {
        const url = urlInput.value.trim()
        if (!url) { urlInput.focus(); return }
        const videoId = extractYouTubeId(url)
        if (!videoId) {
            urlInput.style.borderColor = 'rgba(192,57,43,0.7)'
            setTimeout(() => { urlInput.style.borderColor = '' }, 1500)
            return
        }
        state.socket.emit('play_music', { videoId, startedBy: state.playerName })
        urlInput.value = ''
    })
    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') playBtn.click() })

    stopBtn.addEventListener('click', () => {
        state.socket.emit('stop_music', { stoppedBy: state.playerName })
    })

    volSlider.addEventListener('input', () => {
        const v = parseInt(volSlider.value)
        volVal.textContent = v + '%'
        const icon = document.querySelector('.music-vol-icon')
        if (icon) icon.textContent = v === 0 ? '🔇' : '🔊'

        // Controla volume local — cada um no seu próprio player
        if (IS_ELECTRON && ipcRenderer) {
            ipcRenderer.send('music-volume', { volume: v })
        } else if (ytPlayer?.setVolume) {
            ytPlayer.setVolume(v)
            if (v === 0) ytPlayer.mute()
            else ytPlayer.unMute()
        }
    })

    scenePickerBtn.addEventListener('click', () => sceneFileInput.click())
    sceneFileInput.addEventListener('change', async () => {
        const file = sceneFileInput.files[0]
        if (!file) return
        scenePickerBtn.textContent = '⏳ Enviando…'
        scenePickerBtn.disabled = true
        try {
            const ext = file.name.split('.').pop().toLowerCase()
            const arrayBuffer = await file.arrayBuffer()
            const res = await fetch(`${state.serverUrl}/upload-scene`, {
                method: 'POST',
                headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Ext': ext, 'ngrok-skip-browser-warning': 'true' },
                body: arrayBuffer
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const { scenePath } = await res.json()
            state.socket.emit('scene_change', { url: `${state.serverUrl}${scenePath}`, mimeType: file.type })
        } catch (e) {
            console.error('[Cena] Erro no upload:', e)
            scenePickerBtn.textContent = '✗ Erro no upload'
            setTimeout(() => { scenePickerBtn.textContent = '🖼 Trocar Cena'; scenePickerBtn.disabled = false }, 2500)
            return
        }
        scenePickerBtn.textContent = '✓ Cena enviada'
        setTimeout(() => { scenePickerBtn.textContent = '🖼 Trocar Cena'; scenePickerBtn.disabled = false }, 2000)
        sceneFileInput.value = ''
    })
}

function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
        /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/
    ]
    for (const pat of patterns) {
        const m = url.match(pat)
        if (m) return m[1]
    }
    return null
}

function showMusicActive(videoId, startedBy) {
    document.getElementById('musicNowPlayingText').textContent = `youtube.com/watch?v=${videoId}`
    document.getElementById('musicNowPlayingBy').textContent = startedBy
    document.getElementById('musicNowPlaying').classList.add('visible')
    document.getElementById('musicVolumeRow').style.display = 'flex'
    document.getElementById('musicNote').classList.add('active')
    if (state.isRoomMaster) document.getElementById('musicStopBtn').style.display = 'block'
}

function hideMusicActive() {
    document.getElementById('musicNowPlaying').classList.remove('visible')
    document.getElementById('musicVolumeRow').style.display = 'none'
    document.getElementById('musicNote').classList.remove('active')
    document.getElementById('musicStopBtn').style.display = 'none'
}

module.exports = { extractYouTubeId, loadYouTubeAPI, playYouTubeVideo, stopYouTubeVideo, initMusicPanel, showMusicActive, hideMusicActive }
