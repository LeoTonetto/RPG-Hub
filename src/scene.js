const state = require('./state')

async function fetchAsBlobUrl(url) {
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
}

/**
 * Sobe um arquivo para a pasta da sala no servidor e devolve a URL absoluta.
 * O arquivo é apagado junto com a sala quando ela fecha.
 */
async function enviarArquivoDaSala(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    const res = await fetch(`${state.serverUrl}/upload-scene`, {
        method: 'POST',
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Ext': ext,
            'X-Room-Code': state.currentRoomCode || '',
            'ngrok-skip-browser-warning': 'true',
        },
        body: await file.arrayBuffer()
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { scenePath } = await res.json()
    return `${state.serverUrl}${scenePath}`
}

async function applyScene({ url, mimeType }) {
    const layerA = document.getElementById('bgA')
    const layerB = document.getElementById('bgB')
    const next = state.activeBgLayer === 'A' ? layerB : layerA
    const prev = state.activeBgLayer === 'A' ? layerA : layerB

    next.innerHTML = ''
    next.style.backgroundImage = ''

    const absoluteUrl = url.startsWith('/') ? (state.serverUrl + url) : url

    let displayUrl = absoluteUrl
    try { displayUrl = await fetchAsBlobUrl(absoluteUrl) }
    catch (e) { console.warn('[Cena] Fetch bypass falhou, usando URL direta:', e.message) }

    if (mimeType && mimeType.startsWith('video/')) {
        const vid = document.createElement('video')
        vid.src = displayUrl; vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true
        vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
        next.appendChild(vid)
    } else {
        next.style.backgroundImage = `url('${displayUrl}')`
        next.style.backgroundSize = 'cover'
        next.style.backgroundPosition = 'center'
    }

    next.style.opacity = '1'
    prev.style.opacity = '0'
    state.activeBgLayer = state.activeBgLayer === 'A' ? 'B' : 'A'

    setTimeout(() => {
        const oldSrc = prev.style.backgroundImage.match(/url\(['"]?(blob:[^'")\s]+)/)
        if (oldSrc) URL.revokeObjectURL(oldSrc[1])
        prev.querySelectorAll('video').forEach(v => { URL.revokeObjectURL(v.src); v.src = '' })
        prev.innerHTML = ''
        prev.style.backgroundImage = ''
    }, 950)
}

module.exports = { applyScene, fetchAsBlobUrl, enviarArquivoDaSala }
