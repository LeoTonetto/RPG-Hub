const state      = require('./state')
const { makeDraggable } = require('./hud')
const { updateCardStat, flashCard } = require('./characters')

const statPopup       = document.getElementById('statPopup')
const statPopupName   = document.getElementById('statPopupName')
const statPopupHeader = document.getElementById('statPopupHeader')
const statPopupClose  = document.getElementById('statPopupClose')
const statHpVal       = document.getElementById('statHpVal')
const statHpMax       = document.getElementById('statHpMax')
const statSanVal      = document.getElementById('statSanVal')
const statSanMax      = document.getElementById('statSanMax')
const statBulletsVal  = document.getElementById('statBulletsVal')
const statRowSan      = document.getElementById('statRowSan')
const statRowBullets  = document.getElementById('statRowBullets')
const inventoryModal  = document.getElementById('inventoryModal')

makeDraggable(statPopup, statPopupHeader)

statPopupClose.addEventListener('click', closeStatPopup)
document.addEventListener('click', e => {
    if (statPopup.classList.contains('visible')
        && !statPopup.contains(e.target)
        && !inventoryModal.contains(e.target)) {
        closeStatPopup()
    }
})

function openStatPopup(char, ownerName, cardEl) {
    state.statPopupCharId = char.id
    state.statPopupChar   = char
    statPopupName.textContent = char.name

    const canEdit = state.isRoomMaster || ownerName === state.playerName

    statHpVal.value    = char.hp    ?? 0
    statHpMax.value    = char.hp_max ?? char.hp ?? 0
    statHpVal.disabled = !canEdit
    statHpMax.disabled = !canEdit

    statRowSan.style.display = char.sanity != null ? 'flex' : 'none'
    if (char.sanity != null) {
        statSanVal.value    = char.sanity
        statSanMax.value    = char.sanity_max ?? char.sanity ?? 0
        statSanVal.disabled = !canEdit
        statSanMax.disabled = !canEdit
    }

    statRowBullets.style.display = char.bullets != null ? 'flex' : 'none'
    if (char.bullets != null) {
        statBulletsVal.value    = char.bullets
        statBulletsVal.disabled = !canEdit
    }
    statPopup.querySelectorAll('.stat-adj-btn').forEach(btn => { btn.disabled = !canEdit })

    // Posiciona: mede altura real antes de mostrar
    statPopup.style.visibility = 'hidden'
    statPopup.style.transform  = ''
    statPopup.classList.add('visible')

    requestAnimationFrame(() => {
        const pw   = statPopup.offsetWidth
        const ph   = statPopup.offsetHeight
        const rect = cardEl.getBoundingClientRect()

        let top  = rect.top - ph - 8
        if (top < 8) top = rect.bottom + 8

        let left = rect.left
        left = Math.max(8, Math.min(left, window.innerWidth  - pw - 8))
        top  = Math.max(8, Math.min(top,  window.innerHeight - ph - 8))

        statPopup.style.top        = top  + 'px'
        statPopup.style.left       = left + 'px'
        statPopup.style.visibility = 'visible'
    })
}

function closeStatPopup() {
    statPopup.classList.remove('visible')
    inventoryModal.classList.remove('visible')
    state.statPopupCharId = null
    state.statPopupChar   = null
}

// ── Botões −/+ ────────────────────────────────────────────────────────────────
statPopup.querySelectorAll('.stat-adj-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const field = btn.dataset.field
        const delta = parseInt(btn.dataset.delta)
        let input
        if (field === 'hp')      input = statHpVal
        else if (field === 'sanity')  input = statSanVal
        else if (field === 'bullets') input = statBulletsVal
        if (!input || input.disabled) return
        const newVal = Math.max(0, (parseInt(input.value) || 0) + delta)
        input.value = newVal
        commitStatChange(field, newVal)
    })
})

;[
    { input: statHpVal,     field: 'hp' },
    { input: statHpMax,     field: 'hp_max' },
    { input: statSanVal,    field: 'sanity' },
    { input: statSanMax,    field: 'sanity_max' },
    { input: statBulletsVal,field: 'bullets' }
].forEach(({ input, field }) => {
    input.addEventListener('change', () => {
        const v = Math.max(0, parseInt(input.value) || 0)
        input.value = v
        commitStatChange(field, v)
    })
})

function commitStatChange(field, value) {
    if (!state.statPopupCharId || !state.socket) return

    const cachedEntry = state.allCharsCache.find(e => e.character.id === state.statPopupCharId)
    const oldVal      = cachedEntry?.character[field] ?? null

    if (cachedEntry) cachedEntry.character[field] = value

    const ownChar = state.playerCharacters.find(c => c.id === state.statPopupCharId)
    if (ownChar) ownChar[field] = value

    updateCardStat(state.statPopupCharId, field, value)

    if (oldVal !== null && oldVal !== value) {
        if (field === 'hp')     flashCard(state.statPopupCharId, value < oldVal ? 'red' : 'green')
        else if (field === 'sanity') flashCard(state.statPopupCharId, 'blue')
    }

    state.supabase.from('characters').update({ [field]: value }).eq('id', state.statPopupCharId)
        .then(({ error }) => { if (error) console.warn('[Stat] Supabase error:', error.message) })

    state.socket.emit('stat_update', { charId: state.statPopupCharId, field, value, ownerName: state.playerName })
}

module.exports = { openStatPopup, closeStatPopup, commitStatChange }
