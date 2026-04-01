const state = require('./state')

async function fetchAsBlobUrl(url) {
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
}

async function applyScene({ url, mimeType }) {
    const layerA = document.getElementById('bgA')
    const layerB = document.getElementById('bgB')
    const next   = state.activeBgLayer === 'A' ? layerB : layerA
    const prev   = state.activeBgLayer === 'A' ? layerA : layerB

    next.innerHTML        = ''
    next.style.backgroundImage = ''

    let displayUrl = url
    try { displayUrl = await fetchAsBlobUrl(url) }
    catch (e) { console.warn('[Cena] Fetch bypass falhou, usando URL direta:', e.message) }

    if (mimeType && mimeType.startsWith('video/')) {
        const vid = document.createElement('video')
        vid.src = displayUrl; vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true
        vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
        next.appendChild(vid)
    } else {
        next.style.backgroundImage  = `url('${displayUrl}')`
        next.style.backgroundSize    = 'cover'
        next.style.backgroundPosition= 'center'
    }

    next.style.opacity = '1'
    prev.style.opacity = '0'
    state.activeBgLayer = state.activeBgLayer === 'A' ? 'B' : 'A'

    setTimeout(() => {
        const oldSrc = prev.style.backgroundImage.match(/url\(['"]?(blob:[^'")\s]+)/)
        if (oldSrc) URL.revokeObjectURL(oldSrc[1])
        prev.querySelectorAll('video').forEach(v => { URL.revokeObjectURL(v.src); v.src = '' })
        prev.innerHTML         = ''
        prev.style.backgroundImage = ''
    }, 950)
}

module.exports = { applyScene }
