const state = require('./state')

let hideTimer = null

// ── Mostrar a barra (chamado pelo socket) ─────────────────────────────────────
function showReputation({ value }) {
    const bar = document.getElementById('reputationBar')
    const pointer = document.getElementById('repPointer')
    const valLabel = document.getElementById('repValueLabel')

    // Calcula posição do ponteiro: -10 = 0%, 0 = 50%, +10 = 100%
    const pct = ((value + 10) / 20) * 100

    // Atualiza ponteiro
    pointer.style.left = pct + '%'

    // Label
    valLabel.textContent = (value > 0 ? '+' : '') + value

    // Mostra com animação
    bar.classList.remove('rep-hiding')
    bar.classList.add('rep-visible')

    // Auto-hide após 8 segundos
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
        bar.classList.add('rep-hiding')
        setTimeout(() => bar.classList.remove('rep-visible', 'rep-hiding'), 600)
    }, 8000)
}

// ── Controle do mestre ────────────────────────────────────────────────────────
function initReputation() {
    const controlWrap = document.getElementById('repMasterControls')
    if (!controlWrap) return

    // Mostra controles só pro mestre
    if (state.isRoomMaster) {
        controlWrap.style.display = 'flex'
    } else {
        controlWrap.style.display = 'none'
        return
    }

    const slider = document.getElementById('repSlider')
    const valDisplay = document.getElementById('repSliderVal')
    const sendBtn = document.getElementById('repSendBtn')

    // Sincroniza label com slider
    slider.addEventListener('input', () => {
        const v = parseInt(slider.value)
        valDisplay.textContent = (v > 0 ? '+' : '') + v
    })

    sendBtn.addEventListener('click', () => {
        if (!state.socket) return
        const v = parseInt(slider.value)
        state.socket.emit('reputation_show', { value: v })
    })
}

module.exports = { showReputation, initReputation }
