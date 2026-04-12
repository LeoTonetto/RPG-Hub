// src/lockpicking.js
// ── Sistema de Lockpicking — Tema Velho Oeste ──────────────────────────────
// Mestre inicia → jogador selecionado joga → resultado broadcast para todos

const state = require('./state')

// ── Estado do jogo ────────────────────────────────────────────────────────────
let lockpickActive = false
let pickAngle = 0
let sweetSpot = 0
let sweetSpotSize = 20
let turning = false
let turnAngle = 0
let maxTurnForPos = 0
let lockHealth = 100
let picksLeft = 5
let picksTotal = 5
let resultState = null
let targetCharId = null
let targetCharName = null
let animFrame = null
let pickLocked = false
let breakCooldown = false
let damageAccum = 0

// Dificuldade atual
let dmgPerTick = 1        // quanto dano por tick
let dmgFreq = 5           // a cada quantos frames aplica dano
let turnSpeed = 1.5       // velocidade de giro do cilindro
let timerTotal = 0        // tempo total (0 = sem timer)
let timerLeft = 0         // tempo restante em ms
let timerInterval = null  // interval do countdown
let falloffRange = 70     // quão rápido o giro cai fora do sweet spot

// ── Init ──────────────────────────────────────────────────────────────────────
function initLockpicking() {
    _buildOverlayHTML()
    _setupEvents()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── DIFICULDADES ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const DIFFICULTIES = [
    {
        label: 'Fácil',
        size: 32,           // sweet spot grande
        dmgPerTick: 1,      // 1 hp por tick
        dmgFreq: 5,         // tick a cada 5 frames (~12 ticks/s → ~8s pra quebrar)
        turnSpeed: 1.4,     // giro lento
        timer: 0,           // sem timer
        falloff: 70,        // falloff suave
        color: '#4a7c4e',
    },
    {
        label: 'Médio',
        size: 14,           // sweet spot médio-pequeno
        dmgPerTick: 2,      // 2 hp por tick
        dmgFreq: 3,         // tick a cada 3 frames (~20 ticks/s → ~2.5s pra quebrar)
        turnSpeed: 1.6,
        timer: 0,
        falloff: 55,        // falloff mais agressivo
        color: '#c9a84c',
    },
    {
        label: 'Difícil',
        size: 8,            // sweet spot pequeno
        dmgPerTick: 3,      // 3 hp por tick
        dmgFreq: 2,         // tick a cada 2 frames → ~1.7s pra quebrar
        turnSpeed: 1.8,
        timer: 40,          // 40 segundos
        falloff: 45,        // falloff agressivo
        color: '#d4622a',
    },
    {
        label: 'Mestre',
        size: 4,            // sweet spot minúsculo
        dmgPerTick: 5,      // 5 hp por tick
        dmgFreq: 1,         // tick todo frame → ~1s pra quebrar
        turnSpeed: 2.0,
        timer: 40,          // 40 segundos
        falloff: 35,        // falloff brutal
        color: '#8b1a1a',
    },
]

// ══════════════════════════════════════════════════════════════════════════════
// ── PICKER DO MESTRE ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function openLockpickPicker() {
    if (!state.isRoomMaster || !state.socket) return
    const chars = state.allCharsCache || []
    if (chars.length === 0) return

    const existing = document.getElementById('lockpickPicker')
    if (existing) existing.remove()

    let selectedDiff = DIFFICULTIES[1] // Médio por padrão
    let selectedPicks = 5

    const picker = document.createElement('div')
    picker.id = 'lockpickPicker'
    picker.className = 'lp-picker-overlay'
    picker.addEventListener('click', e => { if (e.target === picker) picker.remove() })

    const card = document.createElement('div')
    card.className = 'lp-picker-card'

    // Header
    card.innerHTML = `
        <div class="lp-picker-header">
            <div class="lp-picker-icon">⚙</div>
            <div class="lp-picker-title">Arrombar Cofre</div>
            <div class="lp-picker-subtitle">Escolha o alvo e a dificuldade</div>
        </div>
    `

    // ── Dificuldade ──
    const diffSection = document.createElement('div')
    diffSection.className = 'lp-section'
    diffSection.innerHTML = '<div class="lp-section-label">Dificuldade</div>'

    const diffRow = document.createElement('div')
    diffRow.className = 'lp-diff-row'

    const diffDesc = document.createElement('div')
    diffDesc.className = 'lp-diff-desc'
    diffDesc.textContent = _getDiffDesc(selectedDiff)

    DIFFICULTIES.forEach(d => {
        const btn = document.createElement('button')
        btn.className = 'lp-diff-btn' + (d.label === selectedDiff.label ? ' active' : '')
        btn.textContent = d.label
        btn.style.setProperty('--diff-color', d.color)
        btn.addEventListener('click', () => {
            selectedDiff = d
            diffRow.querySelectorAll('.lp-diff-btn').forEach(b => b.classList.remove('active'))
            btn.classList.add('active')
            diffDesc.textContent = _getDiffDesc(d)
        })
        diffRow.appendChild(btn)
    })

    diffSection.appendChild(diffRow)
    diffSection.appendChild(diffDesc)
    card.appendChild(diffSection)

    // ── Gazuas ──
    const picksSection = document.createElement('div')
    picksSection.className = 'lp-section'
    picksSection.innerHTML = '<div class="lp-section-label">Gazuas</div>'

    const picksRow = document.createElement('div')
    picksRow.className = 'lp-picks-selector'

    const minusBtn = document.createElement('button')
    minusBtn.className = 'lp-adj-btn'
    minusBtn.textContent = '−'

    const picksVal = document.createElement('span')
    picksVal.className = 'lp-picks-val'
    picksVal.textContent = selectedPicks

    const plusBtn = document.createElement('button')
    plusBtn.className = 'lp-adj-btn'
    plusBtn.textContent = '+'

    minusBtn.addEventListener('click', () => {
        if (selectedPicks > 1) { selectedPicks--; picksVal.textContent = selectedPicks }
    })
    plusBtn.addEventListener('click', () => {
        if (selectedPicks < 20) { selectedPicks++; picksVal.textContent = selectedPicks }
    })

    picksRow.appendChild(minusBtn)
    picksRow.appendChild(picksVal)
    picksRow.appendChild(plusBtn)
    picksSection.appendChild(picksRow)
    card.appendChild(picksSection)

    // ── Personagens ──
    const charSection = document.createElement('div')
    charSection.className = 'lp-section'
    charSection.innerHTML = '<div class="lp-section-label">Quem vai tentar?</div>'

    const list = document.createElement('div')
    list.className = 'lp-char-list'

    chars.forEach(({ playerName: owner, character }) => {
        const item = document.createElement('div')
        item.className = 'lp-char-item'

        const thumb = document.createElement('div')
        thumb.className = 'lp-char-thumb'
        if (character.photo) {
            const img = document.createElement('img')
            img.src = character.photo
            img.onerror = () => { thumb.textContent = '⚔' }
            thumb.appendChild(img)
        } else {
            thumb.textContent = '⚔'
        }

        const info = document.createElement('div')
        info.className = 'lp-char-info'
        info.innerHTML = `
            <div class="lp-char-name">${character.name}</div>
            <div class="lp-char-owner">${owner}</div>
        `

        const arrow = document.createElement('div')
        arrow.className = 'lp-char-arrow'
        arrow.textContent = '▸'

        item.appendChild(thumb)
        item.appendChild(info)
        item.appendChild(arrow)

        item.addEventListener('click', () => {
            picker.remove()
            state.socket.emit('lockpick_start', {
                charId: character.id,
                charName: character.name,
                sweetSpotSize: selectedDiff.size,
                diffLabel: selectedDiff.label,
                picks: selectedPicks,
                dmgPerTick: selectedDiff.dmgPerTick,
                dmgFreq: selectedDiff.dmgFreq,
                turnSpeed: selectedDiff.turnSpeed,
                timer: selectedDiff.timer,
                falloff: selectedDiff.falloff,
                startedBy: state.playerName,
            })
        })

        list.appendChild(item)
    })

    charSection.appendChild(list)
    card.appendChild(charSection)
    picker.appendChild(card)
    document.body.appendChild(picker)
}

function _getDiffDesc(d) {
    let desc = `Sweet spot: ${d.size > 20 ? 'amplo' : d.size > 10 ? 'moderado' : d.size > 5 ? 'estreito' : 'mínimo'}`
    desc += ` · Dano: ${d.dmgPerTick <= 1 ? 'lento' : d.dmgPerTick <= 2 ? 'moderado' : d.dmgPerTick <= 3 ? 'rápido' : 'brutal'}`
    if (d.timer > 0) desc += ` · ⏱ ${d.timer}s`
    return desc
}

// ══════════════════════════════════════════════════════════════════════════════
// ── HANDLERS DE SOCKET ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function handleLockpickStart(data) {
    targetCharId = data.charId
    targetCharName = data.charName

    const isMyChar = state.playerCharacters.some(c => c.id === data.charId)

    if (isMyChar) {
        _startGame(data)
    } else {
        _showWaitingOverlay(data.charName, data.diffLabel, data.timer)
    }
}

function handleLockpickResult({ charId, charName, success }) {
    const waiting = document.getElementById('lockpickWaiting')
    if (waiting) waiting.remove()
}

function _showWaitingOverlay(charName, diffLabel, timer) {
    const existing = document.getElementById('lockpickWaiting')
    if (existing) existing.remove()

    const overlay = document.createElement('div')
    overlay.id = 'lockpickWaiting'
    overlay.className = 'lp-waiting'
    overlay.innerHTML = `
        <div class="lp-waiting-card">
            <div class="lp-waiting-icon">⚙</div>
            <div class="lp-waiting-name">${charName}</div>
            <div class="lp-waiting-sub">está tentando arrombar o cofre...</div>
            <div class="lp-waiting-diff">${diffLabel}${timer ? ` · ⏱ ${timer}s` : ''}</div>
            <div class="lp-waiting-dots"><span>.</span><span>.</span><span>.</span></div>
        </div>
    `
    document.body.appendChild(overlay)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── HTML DO OVERLAY ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _buildOverlayHTML() {
    if (document.getElementById('lockpickOverlay')) return

    const overlay = document.createElement('div')
    overlay.id = 'lockpickOverlay'
    overlay.className = 'lp-overlay'

    overlay.innerHTML = `
        <!-- Timer bar -->
        <div id="lpTimerWrap" class="lp-timer-wrap" style="display:none;">
            <div class="lp-timer-label">
                <span>⏱</span>
                <span id="lpTimerText">40s</span>
            </div>
            <div class="lp-timer-outer">
                <div id="lpTimerBar" class="lp-timer-inner"></div>
            </div>
        </div>

        <!-- HUD -->
        <div class="lp-hud">
            <div class="lp-hud-left">
                <span id="lockpickCharName" class="lp-hud-name"></span>
            </div>
            <div class="lp-hud-right">
                <span id="lockpickPicks" class="lp-hud-picks"></span>
            </div>
        </div>

        <!-- Barra de vida da gazua -->
        <div class="lp-health-wrap">
            <div class="lp-health-row">
                <span class="lp-health-title">Gazua</span>
                <span id="lockpickHealthPct" class="lp-health-pct">100%</span>
            </div>
            <div class="lp-health-outer">
                <div id="lockpickHealthBar" class="lp-health-inner"></div>
            </div>
        </div>

        <!-- Lock area -->
        <div id="lockpickLockArea" class="lp-lock-area">
            <svg id="lockpickSVG" width="320" height="320" viewBox="0 0 320 320">
                <defs>
                    <radialGradient id="lpSafeGrad" cx="50%" cy="48%">
                        <stop offset="0%" stop-color="#4a3a28"/>
                        <stop offset="60%" stop-color="#2a1e12"/>
                        <stop offset="100%" stop-color="#1a1008"/>
                    </radialGradient>
                    <radialGradient id="lpHoleGrad" cx="50%" cy="40%">
                        <stop offset="0%" stop-color="#1a1510"/>
                        <stop offset="100%" stop-color="#050403"/>
                    </radialGradient>
                    <filter id="lpRoughness">
                        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" result="noise"/>
                        <feDiffuseLighting in="noise" lighting-color="#8a7248" surfaceScale="1.2" result="lit">
                            <feDistantLight azimuth="225" elevation="40"/>
                        </feDiffuseLighting>
                        <feComposite in="lit" in2="SourceGraphic" operator="in"/>
                        <feBlend in2="SourceGraphic" mode="overlay" result="textured"/>
                    </filter>
                </defs>

                <!-- Placa do cofre (fundo texturizado) -->
                <circle cx="160" cy="160" r="145" fill="#1a1008" stroke="#3a2a18" stroke-width="3"/>
                <circle cx="160" cy="160" r="140" fill="url(#lpSafeGrad)" stroke="#5a4a30" stroke-width="1.5"/>

                <!-- Anel decorativo externo com rebites -->
                <circle cx="160" cy="160" r="130" fill="none" stroke="#4a3a25" stroke-width="2" stroke-dasharray="2 8"/>
                <circle cx="160" cy="160" r="122" fill="none" stroke="rgba(138,114,72,0.15)" stroke-width="1"/>

                <!-- Rebites (parafusos do cofre) -->
                ${_generateRivets()}

                <!-- Marcas de posição (como um dial de cofre) -->
                ${_generateDialMarks()}

                <!-- Cilindro giratório (mecanismo interno) -->
                <g id="lpCylinder">
                    <circle cx="160" cy="160" r="52" fill="url(#lpHoleGrad)" stroke="#5a4a30" stroke-width="2"/>
                    <circle cx="160" cy="160" r="48" fill="none" stroke="rgba(138,114,72,0.08)" stroke-width="1"/>
                    <!-- Keyway -->
                    <rect x="153" y="160" width="14" height="52" rx="2" fill="#0a0806" stroke="rgba(90,74,48,0.2)" stroke-width="0.5"/>
                    <!-- Marcas do cilindro -->
                    <line x1="160" y1="110" x2="160" y2="116" stroke="rgba(138,114,72,0.2)" stroke-width="1.5"/>
                    <line x1="160" y1="204" x2="160" y2="210" stroke="rgba(138,114,72,0.15)" stroke-width="1"/>
                    <line x1="110" y1="160" x2="116" y2="160" stroke="rgba(138,114,72,0.15)" stroke-width="1"/>
                    <line x1="204" y1="160" x2="210" y2="160" stroke="rgba(138,114,72,0.15)" stroke-width="1"/>
                </g>

                <!-- Gazua (lockpick) -->
                <g id="lpPickGroup">
                    <line id="lpPick" x1="160" y1="160" x2="160" y2="55"
                          stroke="#a08858" stroke-width="2.5" stroke-linecap="round"/>
                    <circle id="lpPickTip" cx="160" cy="55" r="3.5"
                            fill="#b89860" stroke="#8a7248" stroke-width="1"/>
                    <line id="lpPickHook" x1="160" y1="55" x2="170" y2="48"
                          stroke="#907848" stroke-width="1.5" stroke-linecap="round"/>
                </g>

                <!-- Faíscas -->
                <g id="lpSparks"></g>

                <!-- Ponto central -->
                <circle cx="160" cy="160" r="4" fill="#2a1e12" stroke="#5a4a30" stroke-width="1"/>
                <circle cx="160" cy="160" r="1.5" fill="#8a7248"/>
            </svg>
        </div>

        <!-- Instruções -->
        <div class="lp-instructions">
            <span>Mova o mouse para posicionar · Segure o clique para girar</span>
            <span class="lp-inst-hint">Se travar, solte e tente outra posição</span>
        </div>

        <!-- Flash de quebra -->
        <div id="lockpickBreakFlash" class="lp-break-flash"></div>

        <!-- Texto de quebra -->
        <div id="lockpickBreakText" class="lp-break-text"></div>

        <!-- Resultado -->
        <div id="lockpickResult" class="lp-result" style="display:none;">
            <div id="lockpickResultIcon" class="lp-result-icon"></div>
            <div id="lockpickResultText" class="lp-result-text"></div>
            <div id="lockpickResultSub" class="lp-result-sub"></div>
        </div>
    `

    document.body.appendChild(overlay)
}

function _generateRivets() {
    let rivets = ''
    const angles = [30, 75, 120, 165, 210, 255, 300, 345]
    angles.forEach(deg => {
        const rad = deg * (Math.PI / 180)
        const x = 160 + Math.cos(rad) * 136
        const y = 160 + Math.sin(rad) * 136
        rivets += `<circle cx="${x}" cy="${y}" r="4" fill="#3a2a18" stroke="#5a4a30" stroke-width="0.8"/>`
        rivets += `<circle cx="${x - 0.5}" cy="${y - 0.5}" r="1.2" fill="#5a4a30" opacity="0.5"/>`
    })
    return rivets
}

function _generateDialMarks() {
    let marks = ''
    for (let i = 0; i < 36; i++) {
        const angle = (i * 10 - 90) * (Math.PI / 180)
        const isMajor = i % 3 === 0
        const r1 = 120
        const r2 = isMajor ? 112 : 116
        const x1 = 160 + Math.cos(angle) * r1
        const y1 = 160 + Math.sin(angle) * r1
        const x2 = 160 + Math.cos(angle) * r2
        const y2 = 160 + Math.sin(angle) * r2
        const opacity = isMajor ? 0.25 : 0.08
        const width = isMajor ? 1.5 : 0.8
        marks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(138,114,72,${opacity})" stroke-width="${width}"/>`
    }
    return marks
}

// ══════════════════════════════════════════════════════════════════════════════
// ── INÍCIO DO JOGO ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _startGame(data) {
    lockpickActive = true
    pickAngle = 0
    sweetSpot = Math.random() * 140 - 70
    sweetSpotSize = data.sweetSpotSize || 20
    turning = false
    turnAngle = 0
    maxTurnForPos = 0
    lockHealth = 100
    picksLeft = data.picks || 5
    picksTotal = data.picks || 5
    resultState = null
    pickLocked = false
    breakCooldown = false
    damageAccum = 0

    // Configuração de dificuldade
    dmgPerTick = data.dmgPerTick || 1
    dmgFreq = data.dmgFreq || 5
    turnSpeed = data.turnSpeed || 1.5
    falloffRange = data.falloff || 70
    timerTotal = (data.timer || 0) * 1000
    timerLeft = timerTotal

    const overlay = document.getElementById('lockpickOverlay')
    overlay.classList.add('active')
    overlay.classList.remove('shake', 'shake-hard')
    document.getElementById('lockpickResult').style.display = 'none'
    document.getElementById('lockpickBreakFlash').classList.remove('active')
    document.getElementById('lockpickBreakText').classList.remove('active')

    document.getElementById('lockpickCharName').textContent = targetCharName
    _updatePicksDisplay()
    _updateHealthBar()
    _updatePickVisual()

    document.getElementById('lpCylinder').setAttribute('transform', '')
    const pickGroup = document.getElementById('lpPickGroup')
    if (pickGroup) { pickGroup.style.opacity = '1'; pickGroup.style.transition = '' }

    // Timer
    _stopTimer()
    const timerWrap = document.getElementById('lpTimerWrap')
    if (timerTotal > 0) {
        timerWrap.style.display = 'block'
        _updateTimerDisplay()
        timerInterval = setInterval(() => {
            timerLeft -= 100
            _updateTimerDisplay()
            if (timerLeft <= 0) {
                _stopTimer()
                _onResult(false)
            }
        }, 100)
    } else {
        timerWrap.style.display = 'none'
    }
}

function _stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}

function _updateTimerDisplay() {
    const secs = Math.max(0, Math.ceil(timerLeft / 1000))
    const pct = timerTotal > 0 ? Math.max(0, (timerLeft / timerTotal) * 100) : 100
    const text = document.getElementById('lpTimerText')
    const bar = document.getElementById('lpTimerBar')
    if (text) text.textContent = secs + 's'
    if (bar) {
        bar.style.width = pct + '%'
        if (pct > 50) bar.style.background = '#a08858'
        else if (pct > 25) bar.style.background = '#d4622a'
        else bar.style.background = '#8b1a1a'
    }
    // Flash quando pouco tempo
    if (secs <= 10 && secs > 0) {
        const wrap = document.getElementById('lpTimerWrap')
        if (wrap) wrap.classList.toggle('lp-timer-urgent', true)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── EVENTOS ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _setupEvents() {
    document.addEventListener('mousemove', e => {
        if (!lockpickActive || pickLocked || resultState || breakCooldown) return
        const lockArea = document.getElementById('lockpickLockArea')
        if (!lockArea) return
        const rect = lockArea.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const relX = (e.clientX - centerX) / (rect.width / 2)
        pickAngle = Math.max(-90, Math.min(90, relX * 90))
        _updatePickVisual()
    })

    document.addEventListener('mousedown', e => {
        if (!lockpickActive || resultState || breakCooldown) return
        if (e.button !== 0) return
        const overlay = document.getElementById('lockpickOverlay')
        if (!overlay?.classList.contains('active') || !overlay.contains(e.target)) return
        _beginTurn()
    })

    document.addEventListener('mouseup', () => {
        if (!lockpickActive) return
        _endTurn()
    })

    document.addEventListener('touchmove', e => {
        if (!lockpickActive || pickLocked || resultState || breakCooldown) return
        const touch = e.touches[0]
        const lockArea = document.getElementById('lockpickLockArea')
        if (!lockArea) return
        const rect = lockArea.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const relX = (touch.clientX - centerX) / (rect.width / 2)
        pickAngle = Math.max(-90, Math.min(90, relX * 90))
        _updatePickVisual()
        e.preventDefault()
    }, { passive: false })

    document.addEventListener('touchstart', e => {
        if (!lockpickActive || resultState || breakCooldown) return
        const overlay = document.getElementById('lockpickOverlay')
        if (!overlay?.classList.contains('active') || !overlay.contains(e.target)) return
        _beginTurn()
    })

    document.addEventListener('touchend', () => {
        if (!lockpickActive) return
        _endTurn()
    })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MECÂNICA DE GIRO ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _beginTurn() {
    if (turning || breakCooldown) return
    turning = true
    pickLocked = true
    damageAccum = 0
    turnAngle = 0

    const dist = Math.abs(pickAngle - sweetSpot)
    const halfSweet = sweetSpotSize / 2

    if (dist <= halfSweet) {
        maxTurnForPos = 90
    } else {
        const falloff = Math.max(0, 1 - (dist - halfSweet) / falloffRange)
        maxTurnForPos = Math.max(5, falloff * 85)
    }

    _animateTurn()
}

function _endTurn() {
    if (!turning) return
    turning = false
    pickLocked = false
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
    const pickGroup = document.getElementById('lpPickGroup')
    if (pickGroup) pickGroup.style.transform = ''
    _animateReturnCylinder()
}

function _animateTurn() {
    if (!turning || resultState) return

    turnAngle += turnSpeed

    // ── SUCESSO ──
    if (turnAngle >= 90) {
        turnAngle = 90
        turning = false
        pickLocked = false
        document.getElementById('lpCylinder')?.setAttribute('transform', `rotate(${turnAngle}, 160, 160)`)
        _stopTimer()
        _onResult(true)
        return
    }

    // ── TRAVOU ──
    if (turnAngle >= maxTurnForPos) {
        turnAngle = maxTurnForPos

        // Shake cilindro + gazua
        const sx = (Math.random() - 0.5) * 4
        const sy = (Math.random() - 0.5) * 4
        document.getElementById('lpCylinder')?.setAttribute('transform',
            `rotate(${turnAngle}, 160, 160) translate(${sx}, ${sy})`)

        const pickGroup = document.getElementById('lpPickGroup')
        if (pickGroup) {
            const px = (Math.random() - 0.5) * 3
            const py = (Math.random() - 0.5) * 3
            pickGroup.style.transform = `translate(${px}px, ${py}px)`
        }

        // Dano baseado na dificuldade
        damageAccum++
        if (damageAccum % dmgFreq === 0) {
            lockHealth -= dmgPerTick
            _updateHealthBar()
            if (Math.random() > 0.3) _addSpark()
        }

        // Shake overlay periódico
        if (damageAccum % 12 === 0) {
            const overlay = document.getElementById('lockpickOverlay')
            if (overlay) {
                overlay.classList.add('shake')
                setTimeout(() => overlay.classList.remove('shake'), 100)
            }
        }

        // ── QUEBROU ──
        if (lockHealth <= 0) {
            turning = false
            pickLocked = false
            if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
            _onPickBreak()
            return
        }

        animFrame = requestAnimationFrame(() => _animateTurn())
        return
    }

    // ── Girando normalmente ──
    document.getElementById('lpCylinder')?.setAttribute('transform', `rotate(${turnAngle}, 160, 160)`)

    // Feedback de proximidade
    const proximity = turnAngle / maxTurnForPos
    if (proximity > 0.65) {
        const intensity = (proximity - 0.65) / 0.35
        const px = (Math.random() - 0.5) * intensity * 2
        const pickGroup = document.getElementById('lpPickGroup')
        if (pickGroup) pickGroup.style.transform = `translate(${px}px, 0)`
    }

    animFrame = requestAnimationFrame(() => _animateTurn())
}

function _animateReturnCylinder() {
    if (turning) return
    if (turnAngle <= 0) {
        turnAngle = 0
        document.getElementById('lpCylinder')?.setAttribute('transform', '')
        return
    }
    turnAngle -= 3
    if (turnAngle < 0) turnAngle = 0
    document.getElementById('lpCylinder')?.setAttribute('transform',
        turnAngle > 0 ? `rotate(${turnAngle}, 160, 160)` : '')
    requestAnimationFrame(() => _animateReturnCylinder())
}

// ══════════════════════════════════════════════════════════════════════════════
// ── QUEBRA DE GAZUA ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _onPickBreak() {
    picksLeft--
    breakCooldown = true

    // Flash
    const flash = document.getElementById('lockpickBreakFlash')
    flash.classList.add('active')
    setTimeout(() => flash.classList.remove('active'), 400)

    // Texto
    const breakText = document.getElementById('lockpickBreakText')
    breakText.textContent = picksLeft > 0
        ? `GAZUA QUEBROU!  (${picksLeft} restante${picksLeft !== 1 ? 's' : ''})`
        : 'ÚLTIMA GAZUA QUEBROU!'
    breakText.classList.add('active')

    // Shake forte
    const overlay = document.getElementById('lockpickOverlay')
    overlay.classList.add('shake-hard')

    // Gazua some
    const pickGroup = document.getElementById('lpPickGroup')
    if (pickGroup) {
        pickGroup.style.transition = 'opacity 0.15s'
        pickGroup.style.opacity = '0'
    }

    _updatePicksDisplay()
    turnAngle = 0
    document.getElementById('lpCylinder')?.setAttribute('transform', '')

    if (picksLeft <= 0) {
        setTimeout(() => {
            breakText.classList.remove('active')
            overlay.classList.remove('shake-hard')
            _stopTimer()
            _onResult(false)
        }, 1200)
        return
    }

    setTimeout(() => {
        breakText.classList.remove('active')
        overlay.classList.remove('shake-hard')

        lockHealth = 100
        _updateHealthBar()
        damageAccum = 0
        turnAngle = 0
        pickLocked = false

        if (pickGroup) {
            pickGroup.style.transition = 'opacity 0.3s'
            pickGroup.style.opacity = '1'
        }

        breakCooldown = false
    }, 1500)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RESULTADO ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _onResult(success) {
    resultState = success ? 'success' : 'fail'
    lockpickActive = false
    turning = false
    pickLocked = false
    breakCooldown = false
    _stopTimer()
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }

    if (success) {
        document.getElementById('lpCylinder')?.setAttribute('transform', 'rotate(90, 160, 160)')
    }

    const resultEl = document.getElementById('lockpickResult')
    const iconEl = document.getElementById('lockpickResultIcon')
    const textEl = document.getElementById('lockpickResultText')
    const subEl = document.getElementById('lockpickResultSub')

    iconEl.textContent = success ? '🔓' : '💔'
    textEl.textContent = success ? 'COFRE ABERTO!' : 'FALHOU!'
    textEl.className = 'lp-result-text ' + (success ? 'success' : 'fail')
    subEl.textContent = success
        ? `${targetCharName} abriu a fechadura com maestria!`
        : timerLeft <= 0 && timerTotal > 0
            ? `O tempo acabou para ${targetCharName}...`
            : `${targetCharName} quebrou todas as gazuas...`

    resultEl.style.display = 'flex'

    if (state.socket) {
        state.socket.emit('lockpick_result', {
            charId: targetCharId,
            charName: targetCharName,
            success
        })
    }

    setTimeout(() => _closeOverlay(), 3500)
}

function _closeOverlay() {
    _stopTimer()
    const overlay = document.getElementById('lockpickOverlay')
    if (overlay) overlay.classList.remove('active', 'shake', 'shake-hard')
    lockpickActive = false
    resultState = null
    targetCharId = null
    targetCharName = null
    turnAngle = 0
    pickAngle = 0
    document.getElementById('lpCylinder')?.setAttribute('transform', '')
    document.getElementById('lpTimerWrap')?.classList?.remove('lp-timer-urgent')
    const pickGroup = document.getElementById('lpPickGroup')
    if (pickGroup) { pickGroup.style.opacity = '1'; pickGroup.style.transition = ''; pickGroup.style.transform = '' }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── VISUAIS ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _updatePickVisual() {
    const rad = (pickAngle - 90) * (Math.PI / 180)
    const x2 = 160 + Math.cos(rad) * 105
    const y2 = 160 + Math.sin(rad) * 105

    const pick = document.getElementById('lpPick')
    const tip = document.getElementById('lpPickTip')
    const hook = document.getElementById('lpPickHook')
    if (pick) { pick.setAttribute('x2', x2); pick.setAttribute('y2', y2) }
    if (tip) { tip.setAttribute('cx', x2); tip.setAttribute('cy', y2) }
    if (hook) {
        const hookRad = (pickAngle - 45) * (Math.PI / 180)
        hook.setAttribute('x1', x2); hook.setAttribute('y1', y2)
        hook.setAttribute('x2', x2 + Math.cos(hookRad) * 15)
        hook.setAttribute('y2', y2 + Math.sin(hookRad) * 15)
    }
}

function _updatePicksDisplay() {
    const el = document.getElementById('lockpickPicks')
    if (!el) return
    el.innerHTML = ''
    for (let i = 0; i < picksTotal; i++) {
        const span = document.createElement('span')
        span.className = 'lp-pick-icon' + (i >= picksLeft ? ' broken' : '')
        span.textContent = '🔧'
        el.appendChild(span)
    }
}

function _updateHealthBar() {
    const bar = document.getElementById('lockpickHealthBar')
    const pct = document.getElementById('lockpickHealthPct')
    const hp = Math.max(0, lockHealth)
    if (bar) {
        bar.style.width = hp + '%'
        bar.style.background = hp > 50 ? '#5a7a3e' : hp > 25 ? '#a08858' : '#8b1a1a'
    }
    if (pct) pct.textContent = hp + '%'
}

function _addSpark() {
    const sparks = document.getElementById('lpSparks')
    if (!sparks) return
    for (let i = 0; i < 2; i++) {
        const spark = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        const rad = (pickAngle - 90) * (Math.PI / 180)
        const baseX = 160 + Math.cos(rad) * 58
        const baseY = 160 + Math.sin(rad) * 58
        spark.setAttribute('cx', baseX + (Math.random() - 0.5) * 20)
        spark.setAttribute('cy', baseY + (Math.random() - 0.5) * 20)
        spark.setAttribute('r', 1.5 + Math.random() * 1.5)
        spark.setAttribute('fill', Math.random() > 0.3 ? '#d4a040' : '#d4622a')

        const a1 = document.createElementNS('http://www.w3.org/2000/svg', 'animate')
        a1.setAttribute('attributeName', 'opacity'); a1.setAttribute('from', '1'); a1.setAttribute('to', '0')
        a1.setAttribute('dur', '0.5s'); a1.setAttribute('fill', 'freeze')

        const a2 = document.createElementNS('http://www.w3.org/2000/svg', 'animate')
        a2.setAttribute('attributeName', 'r'); a2.setAttribute('from', spark.getAttribute('r')); a2.setAttribute('to', '0')
        a2.setAttribute('dur', '0.5s'); a2.setAttribute('fill', 'freeze')

        spark.appendChild(a1); spark.appendChild(a2)
        sparks.appendChild(spark)
        setTimeout(() => spark.remove(), 550)
    }
}

module.exports = { initLockpicking, openLockpickPicker, handleLockpickStart, handleLockpickResult }
