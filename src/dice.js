const state = require('./state')

const DICE = [
    { label: 'd4', sides: 4 }, { label: 'd6', sides: 6 }, { label: 'd8', sides: 8 },
    { label: 'd10', sides: 10 }, { label: 'd12', sides: 12 }, { label: 'd20', sides: 20 },
    { label: 'd100', sides: 100 }
]

// Rolagem secreta: só o mestre enxerga o resultado. Nada vai para a sala — nem
// o resultado, nem a linha no chat.
let secretMode = false

function initDice() {
    const diceFab = document.getElementById('diceFab')
    const diceMainBtn = document.getElementById('diceMainBtn')
    const diceMenu = document.getElementById('diceMenu')

    // Monta os botões de dado
    DICE.forEach(({ label, sides }) => {
        const wrap = document.createElement('div'); wrap.className = 'dice-option'
        const lbl = document.createElement('span'); lbl.className = 'dice-label'; lbl.textContent = label
        const btn = document.createElement('button'); btn.className = 'dice-btn'; btn.textContent = label; btn.title = `Rolar ${label}`
        btn.addEventListener('click', () => rollDice(sides, label))
        wrap.appendChild(lbl); wrap.appendChild(btn); diceMenu.appendChild(wrap)
    })

    // ── Interruptor de rolagem secreta (só o mestre vê) ──────────────────────
    // O menu é column-reverse, então o último filho aparece no topo da pilha.
    const secretWrap = document.createElement('div')
    secretWrap.className = 'dice-option dice-secret'
    secretWrap.id = 'diceSecretOption'
    secretWrap.style.display = 'none'

    const secretLbl = document.createElement('span')
    secretLbl.className = 'dice-label dice-secret-label'
    secretWrap.appendChild(secretLbl)

    const secretBtn = document.createElement('button')
    secretBtn.className = 'dice-btn dice-secret-btn'
    secretBtn.addEventListener('click', e => {
        e.stopPropagation()
        secretMode = !secretMode
        renderSecretToggle()
    })
    secretWrap.appendChild(secretBtn)
    diceMenu.appendChild(secretWrap)

    updateDiceMasterUI()

    diceMainBtn.addEventListener('click', () => {
        state.fabOpen = !state.fabOpen
        diceFab.classList.toggle('open', state.fabOpen)
    })

    document.addEventListener('click', e => {
        if (state.fabOpen && !diceFab.contains(e.target)) {
            state.fabOpen = false
            diceFab.classList.remove('open')
        }
    })
}

/** Atualiza o visual do interruptor de rolagem secreta. */
function renderSecretToggle() {
    const wrap = document.getElementById('diceSecretOption')
    if (!wrap) return
    const btn = wrap.querySelector('.dice-secret-btn')
    const lbl = wrap.querySelector('.dice-secret-label')
    btn.textContent = secretMode ? '🙈' : '👁'
    btn.title = secretMode
        ? 'Rolagem secreta LIGADA — clique para voltar ao normal'
        : 'Rolagem secreta desligada — clique para esconder suas rolagens'
    lbl.textContent = secretMode ? 'Secreto' : 'Visível'
    wrap.classList.toggle('secreto-on', secretMode)
}

/** Chamado pelo socket.js quando o status de mestre chega ou muda. */
function updateDiceMasterUI() {
    const wrap = document.getElementById('diceSecretOption')
    if (!wrap) return
    const isMaster = !!state.isRoomMaster
    wrap.style.display = isMaster ? '' : 'none'
    // Quem deixa de ser mestre não continua rolando escondido sem perceber
    if (!isMaster) secretMode = false
    renderSecretToggle()
}

/** O modo secreto só vale para o mestre. */
function isSecretRoll() {
    return secretMode && !!state.isRoomMaster
}

function rollDice(sides, label) {
    if (!state.socket) return

    // Usa o nome do personagem ativo, ou o primeiro personagem, ou o nome do player
    const activeChar = state.activeCharacterId
        ? state.playerCharacters.find(c => c.id === state.activeCharacterId)
        : state.playerCharacters[0]
    const rollerName = activeChar ? activeChar.name : state.playerName

    state.socket.emit('dice_roll', {
        player: rollerName,
        value: Math.floor(Math.random() * sides) + 1,
        sides,
        label,
        secreto: isSecretRoll(),
    })
    state.fabOpen = false
    document.getElementById('diceFab').classList.remove('open')
}

function showDiceResult({ player, value, sides, label, secreto }) {
    const dLabel = label || `d${sides || 20}`
    const el = document.getElementById('diceResult')

    document.getElementById('diceResultValue').textContent = value
    document.getElementById('diceResultCrit').textContent = ''
    el.classList.remove('crit', 'fail')
    // Marca visual para o mestre saber que a mesa não viu esta rolagem
    el.classList.toggle('secreto', !!secreto)

    if (sides === 20 || dLabel === 'd20') {
        if (value === 20) { document.getElementById('diceResultCrit').textContent = '✦ CRÍTICO!'; el.classList.add('crit') }
        else if (value === 1) { document.getElementById('diceResultCrit').textContent = '✗ falha crítica'; el.classList.add('fail') }
    }
    document.getElementById('diceResultLabel').textContent =
        (secreto ? '🙈 ' : '') + `${player} · ${dLabel}`
    el.classList.add('show')

    clearTimeout(state.resultTimer)
    state.resultTimer = setTimeout(() => el.classList.remove('show'), 4000)
}

module.exports = { initDice, showDiceResult, updateDiceMasterUI, isSecretRoll }
