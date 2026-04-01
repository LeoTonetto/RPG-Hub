const state = require('./state')

// ── YouTube API ───────────────────────────────────────────────────────────────
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

function loadYouTubeAPI() {
    if (window.YT) return
    window.onYouTubeIframeAPIReady = () => {
        state.ytReady = true
        if (state.pendingVideoId) playYouTubeVideo(state.pendingVideoId, state.pendingSeekTime)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
}

function playYouTubeVideo(videoId, seekTime = 0) {
    const vol = parseInt(document.getElementById('volumeSlider')?.value ?? 60)

    if (!state.ytReady) {
        state.pendingVideoId  = videoId
        state.pendingSeekTime = seekTime
        loadYouTubeAPI()
        return
    }

    if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
        state.ytPlayer.loadVideoById(videoId)
        state.ytPlayer.setVolume(vol)
        if (seekTime > 0) state.ytPlayer.seekTo(seekTime)
        return
    }

    state.ytPlayer = new YT.Player('ytPlayer', {
        height: '1', width: '1', videoId,
        playerVars: { autoplay: 1, controls: 0, loop: 1, playlist: videoId, mute: 1 },
        events: {
            onReady(e) {
                e.target.setVolume(vol)
                if (seekTime > 0) e.target.seekTo(seekTime)
                e.target.playVideo()
            },
            onStateChange(event) {
                if (event.data === YT.PlayerState.PLAYING) event.target.unMute()
            },
            onError(event) {
                console.error('[Música] Erro no player', event.data, 'para vídeo', videoId)
            }
        }
    })
}

function stopYouTubeVideo() {
    if (state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        state.ytPlayer.stopVideo()
    }
}

// ── Music panel UI ────────────────────────────────────────────────────────────
function initMusicPanel() {
    const panel          = document.getElementById('musicPanel')
    const masterControls = document.getElementById('musicMasterControls')

    panel.style.display = 'block'
    masterControls.style.display = state.isRoomMaster ? 'block' : 'none'

    if (panel.dataset.inited) return
    panel.dataset.inited = '1'

    const playBtn       = document.getElementById('musicPlayBtn')
    const stopBtn       = document.getElementById('musicStopBtn')
    const urlInput      = document.getElementById('musicUrlInput')
    const volSlider     = document.getElementById('volumeSlider')
    const volVal        = document.getElementById('volumeVal')
    const scenePickerBtn= document.getElementById('scenePickerBtn')
    const sceneFileInput= document.getElementById('sceneFileInput')

    // Tocar música
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

    // Parar música
    stopBtn.addEventListener('click', () => {
        state.socket.emit('stop_music', { stoppedBy: state.playerName })
    })

    // Volume (local)
    volSlider.addEventListener('input', () => {
        const v = parseInt(volSlider.value)
        volVal.textContent = v + '%'
        const icon = document.querySelector('.music-vol-icon')
        if (icon) icon.textContent = v === 0 ? '🔇' : '🔊'
        if (state.ytPlayer?.setVolume) state.ytPlayer.setVolume(v)
    })

    // Upload de cena
    scenePickerBtn.addEventListener('click', () => sceneFileInput.click())
    sceneFileInput.addEventListener('change', async () => {
        const file = sceneFileInput.files[0]
        if (!file) return
        scenePickerBtn.textContent = '⏳ Enviando…'
        scenePickerBtn.disabled    = true
        try {
            const ext         = file.name.split('.').pop().toLowerCase()
            const arrayBuffer = await file.arrayBuffer()
            const res         = await fetch(`${state.serverUrl}/upload-scene`, {
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

function showMusicActive(videoId, startedBy) {
    document.getElementById('musicNowPlayingText').textContent = `youtube.com/watch?v=${videoId}`
    document.getElementById('musicNowPlayingBy').textContent  = startedBy
    document.getElementById('musicNowPlaying').classList.add('visible')
    document.getElementById('musicVolumeRow').style.display   = 'flex'
    document.getElementById('musicNote').classList.add('active')
    if (state.isRoomMaster) document.getElementById('musicStopBtn').style.display = 'block'
}

function hideMusicActive() {
    document.getElementById('musicNowPlaying').classList.remove('visible')
    document.getElementById('musicVolumeRow').style.display  = 'none'
    document.getElementById('musicNote').classList.remove('active')
    document.getElementById('musicStopBtn').style.display    = 'none'
}

module.exports = { extractYouTubeId, loadYouTubeAPI, playYouTubeVideo, stopYouTubeVideo, initMusicPanel, showMusicActive, hideMusicActive }
