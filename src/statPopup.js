const state = require('./state')
const { makeDraggable } = require('./hud')
const { updateCardStat, flashCard } = require('./characters')
const { SYSTEMS } = require('./systems')

const statPopup = document.getElementById('statPopup')
const statPopupName = document.getElementById('statPopupName')
const statPopupHeader = document.getElementById('statPopupHeader')
const statPopupClose = document.getElementById('statPopupClose')
const statDynamicRows = document.getElementById('statDynamicRows')
const inventoryModal = document.getElementById('inventoryModal')

const attrPanel = document.getElementById('attrPanel')
const antPanel = document.getElementById('antPanel')
const habPanel = document.getElementById('habPanel')

const statCharMgmt = document.getElementById('statCharMgmt')
const statSwitchPanel = document.getElementById('statSwitchPanel')
const statBtnSwitch = document.getElementById('statBtnSwitch')
const statBtnEdit = document.getElementById('statBtnEdit')
const statBtnNew = document.getElementById('statBtnNew')

makeDraggable(statPopup, statPopupHeader)
makeDraggable(attrPanel, document.getElementById('attrPanelHeader'))
makeDraggable(antPanel, document.getElementById('antPanelHeader'))
makeDraggable(habPanel, document.getElementById('habPanelHeader'))

statPopupClose.addEventListener('click', closeStatPopup)
document.getElementById('attrPanelClose').addEventListener('click', () => attrPanel.classList.remove('visible'))
document.getElementById('antPanelClose').addEventListener('click', () => antPanel.classList.remove('visible'))
document.getElementById('habPanelClose').addEventListener('click', () => habPanel.classList.remove('visible'))

document.addEventListener('click', e => {
    if (statPopup.classList.contains('visible')
        && !statPopup.contains(e.target)
        && !inventoryModal.contains(e.target)
        && !attrPanel.contains(e.target)
        && !antPanel.contains(e.target)
        && !habPanel.contains(e.target)) {
        closeStatPopup()
    }
})

// ── Gestão ────────────────────────────────────────────────────────────────────
statBtnSwitch?.addEventListener('click', () => {
    const open = statSwitchPanel.style.display !== 'none'
    statSwitchPanel.style.display = open ? 'none' : 'flex'
})
statBtnEdit?.addEventListener('click', () => {
    const char = state.statPopupChar; if (!char) return
    closeStatPopup()
    const { openEditCharModal } = require('./characters')
    const fresh = state.allCharsCache.find(en => en.character.id === char.id)
    openEditCharModal(fresh ? fresh.character : char)
})
statBtnNew?.addEventListener('click', () => {
    closeStatPopup()
    const { openCharModal } = require('./characters')
    openCharModal()
})

// ══════════════════════════════════════════════════════════════════════════════
// ── Abertura do popup principal ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function openStatPopup(char, ownerName, cardEl) {
    state.statPopupCharId = char.id
    state.statPopupChar = char
    statPopupName.textContent = char.name

    const canEdit = state.isRoomMaster || ownerName === state.playerName
    const isOwn = ownerName === state.playerName
    const stats = char.stats || {}
    const sysDef = SYSTEMS[char.system] || null

    statDynamicRows.innerHTML = ''

    if (sysDef) {
        buildMainPopup(sysDef, stats, canEdit)
    } else {
        statDynamicRows.innerHTML = '<div style="padding:8px;color:rgba(244,234,213,0.5);font-size:13px;">Sistema não definido</div>'
    }

    // Gestão
    if (statCharMgmt) statCharMgmt.style.display = isOwn ? 'block' : 'none'
    if (statSwitchPanel) {
        statSwitchPanel.style.display = 'none'
        statSwitchPanel.innerHTML = ''
        state.playerCharacters.forEach(c => statSwitchPanel.appendChild(buildSwitchItem(c)))
    }

    // Fecha sub-painéis
    attrPanel.classList.remove('visible')
    antPanel.classList.remove('visible')
    habPanel.classList.remove('visible')

    // Posiciona
    statPopup.style.visibility = 'hidden'
    statPopup.style.transform = ''
    statPopup.classList.add('visible')

    requestAnimationFrame(() => {
        const pw = statPopup.offsetWidth
        const ph = statPopup.offsetHeight
        const rect = cardEl.getBoundingClientRect()
        let top = rect.top - ph - 8
        if (top < 8) top = rect.bottom + 8
        let left = rect.left
        left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
        top = Math.max(8, Math.min(top, window.innerHeight - ph - 8))
        statPopup.style.top = top + 'px'
        statPopup.style.left = left + 'px'
        statPopup.style.visibility = 'visible'
    })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Popup principal (limpo) ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function buildMainPopup(sysDef, stats, canEdit) {

    // ── Vida + Dinheiro (linha superior) ─────────────────────────────────
    const topRow = mk('div', 'sp-top-row')

    const hpWrap = mk('div', 'sp-hp-wrap')
    hpWrap.appendChild(mk('span', 'sp-mini-label', '❤ Vida'))
    const hpCtrl = mk('div', 'sp-inline-ctrl')
    hpCtrl.appendChild(adjBtn('−', canEdit, () => adj('hp', -1)))
    hpCtrl.appendChild(numInput('hp', stats.hp ?? 0, canEdit))
    hpCtrl.appendChild(mk('span', 'sp-sep', '/'))
    hpCtrl.appendChild(numInput('hp_max', stats.hp_max ?? 0, canEdit))
    hpCtrl.appendChild(adjBtn('+', canEdit, () => adj('hp', +1)))
    hpWrap.appendChild(hpCtrl)
    topRow.appendChild(hpWrap)

    if (sysDef.hasDinheiro) {
        const mWrap = mk('div', 'sp-money-wrap')
        mWrap.appendChild(mk('span', 'sp-mini-label', '💵'))
        const mCtrl = mk('div', 'sp-inline-ctrl')
        mCtrl.appendChild(adjBtn('−', canEdit, () => adj('dinheiro', -1)))
        mCtrl.appendChild(numInput('dinheiro', stats.dinheiro ?? 0, canEdit))
        mCtrl.appendChild(adjBtn('+', canEdit, () => adj('dinheiro', +1)))
        mWrap.appendChild(mCtrl)
        topRow.appendChild(mWrap)
    }

    statDynamicRows.appendChild(topRow)

    // ── Stats de combate (DEF, INIT, AÇÕES) ──────────────────────────────
    const combatStats = sysDef.popupStats.filter(p => p.key !== 'hp')
    if (combatStats.length > 0) {
        const row = mk('div', 'sp-combat-row')
        combatStats.forEach(ps => {
            const badge = mk('div', 'sp-cbadge')
            // Usa só o emoji do label como ícone
            const icon = ps.label.substring(0, 2)
            const name = ps.label.substring(2).trim()
            badge.appendChild(mk('span', 'sp-cbadge-icon', icon))
            badge.appendChild(mk('span', 'sp-cbadge-name', name))

            const ctrl = mk('div', 'sp-cbadge-ctrl')
            ctrl.appendChild(adjBtn('−', canEdit, () => adj(ps.key, -1), 'sp-adj-xs'))
            ctrl.appendChild(numInput(ps.key, stats[ps.key] ?? 0, canEdit, 'sp-input-xs'))
            ctrl.appendChild(adjBtn('+', canEdit, () => adj(ps.key, +1), 'sp-adj-xs'))
            badge.appendChild(ctrl)

            row.appendChild(badge)
        })
        statDynamicRows.appendChild(row)
    }

    // ── Botões de sub-painéis (Atributos | Antecedentes | Habilidades) ───
    if (sysDef.attributes.length > 0 || sysDef.antecedentes?.length > 0 || sysDef.hasHabilidades) {
        const btnRow = mk('div', 'sp-subpanel-row')

        if (sysDef.attributes.length > 0) {
            const btn = mk('button', 'sp-subpanel-btn', '📊 Atributos')
            btn.addEventListener('click', () => openAttrPanel(sysDef, stats, canEdit))
            btnRow.appendChild(btn)
        }
        if (sysDef.antecedentes?.length > 0) {
            const btn = mk('button', 'sp-subpanel-btn', '📜 Antecedentes')
            btn.addEventListener('click', () => openAntPanel(sysDef, stats, canEdit))
            btnRow.appendChild(btn)
        }
        if (sysDef.hasHabilidades) {
            const btn = mk('button', 'sp-subpanel-btn', '⚡ Habilidades')
            btn.addEventListener('click', () => openHabPanel(stats, canEdit))
            btnRow.appendChild(btn)
        }

        statDynamicRows.appendChild(btnRow)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Sub-painel: ATRIBUTOS ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function openAttrPanel(sysDef, stats, canEdit) {
    const body = document.getElementById('attrPanelBody')
    body.innerHTML = ''

    sysDef.attributes.forEach(attr => {
        const row = mk('div', 'subp-row')
        row.appendChild(mk('span', 'subp-icon', attr.icon))
        row.appendChild(mk('span', 'subp-name', attr.label))

        const ctrl = mk('div', 'subp-ctrl')
        ctrl.appendChild(adjBtn('−', canEdit, () => {
            const el = body.querySelector(`[data-stat-key="${attr.key}"]`)
            const nv = Math.max(0, (parseInt(el.textContent) || 0) - 1)
            el.textContent = nv
            commitStatChange(attr.key, nv)
        }, 'sp-adj-sm'))

        const val = mk('span', 'subp-val')
        val.dataset.statKey = attr.key
        val.textContent = stats[attr.key] ?? 0
        ctrl.appendChild(val)

        ctrl.appendChild(adjBtn('+', canEdit, () => {
            const el = body.querySelector(`[data-stat-key="${attr.key}"]`)
            const nv = (parseInt(el.textContent) || 0) + 1
            el.textContent = nv
            commitStatChange(attr.key, nv)
        }, 'sp-adj-sm'))

        row.appendChild(ctrl)
        body.appendChild(row)
    })

    positionPanel(attrPanel)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Sub-painel: ANTECEDENTES ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function openAntPanel(sysDef, stats, canEdit) {
    const body = document.getElementById('antPanelBody')
    body.innerHTML = ''

    sysDef.antecedentes.forEach(ant => {
        const row = mk('div', 'subp-row')
        row.appendChild(mk('span', 'subp-icon', ant.icon))
        row.appendChild(mk('span', 'subp-name', ant.label))

        const ctrl = mk('div', 'subp-ctrl')
        ctrl.appendChild(adjBtn('−', canEdit, () => {
            const el = body.querySelector(`[data-stat-key="${ant.key}"]`)
            const nv = Math.max(0, (parseInt(el.textContent) || 0) - 1)
            el.textContent = nv
            commitStatChange(ant.key, nv)
        }, 'sp-adj-sm'))

        const val = mk('span', 'subp-val')
        val.dataset.statKey = ant.key
        val.textContent = stats[ant.key] ?? 0
        ctrl.appendChild(val)

        ctrl.appendChild(adjBtn('+', canEdit, () => {
            const el = body.querySelector(`[data-stat-key="${ant.key}"]`)
            const nv = (parseInt(el.textContent) || 0) + 1
            el.textContent = nv
            commitStatChange(ant.key, nv)
        }, 'sp-adj-sm'))

        row.appendChild(ctrl)
        body.appendChild(row)
    })

    positionPanel(antPanel)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Sub-painel: HABILIDADES ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function openHabPanel(stats, canEdit) {
    const body = document.getElementById('habPanelBody')
    body.innerHTML = ''

    const habs = stats.habilidades || []
    habs.forEach((hab, idx) => body.appendChild(buildHabItem(hab, idx, canEdit, body)))

    if (canEdit) {
        const addBtn = mk('button', 'subp-add-btn', '+ Nova Habilidade')
        addBtn.addEventListener('click', () => {
            const form = buildHabForm(body, canEdit, addBtn)
            body.insertBefore(form, addBtn)
        })
        body.appendChild(addBtn)
    }

    if (habs.length === 0 && !canEdit) {
        body.appendChild(mk('div', 'subp-empty', 'Nenhuma habilidade.'))
    }

    positionPanel(habPanel)
}

function buildHabItem(hab, idx, canEdit, listEl) {
    const item = mk('div', 'subp-hab-item')
    const header = mk('div', 'subp-hab-header')
    header.appendChild(mk('span', 'subp-hab-name', hab.nome || 'Sem nome'))
    if (canEdit) {
        const del = mk('button', 'subp-hab-del', '✕')
        del.addEventListener('click', e => {
            e.stopPropagation()
            removeHabilidade(idx)
            item.remove()
        })
        header.appendChild(del)
    }
    item.appendChild(header)
    if (hab.descricao) item.appendChild(mk('div', 'subp-hab-desc', hab.descricao))
    return item
}

function buildHabForm(listEl, canEdit, addBtn) {
    const form = mk('div', 'subp-hab-form')

    const nameIn = document.createElement('input')
    nameIn.className = 'subp-hab-input'
    nameIn.placeholder = 'Nome da habilidade'
    nameIn.maxLength = 60
    nameIn.addEventListener('keydown', e => e.stopPropagation())

    const descIn = document.createElement('textarea')
    descIn.className = 'subp-hab-textarea'
    descIn.placeholder = 'Descrição (opcional)'
    descIn.maxLength = 300
    descIn.rows = 2
    descIn.addEventListener('keydown', e => e.stopPropagation())

    const btns = mk('div', 'subp-hab-btns')
    const save = mk('button', 'subp-hab-save', '✓ Salvar')
    const cancel = mk('button', 'subp-hab-cancel', 'Cancelar')

    save.addEventListener('click', () => {
        const nome = nameIn.value.trim()
        if (!nome) return
        const hab = { nome, descricao: descIn.value.trim() }
        addHabilidade(hab)
        listEl.insertBefore(buildHabItem(hab, getHabilidades().length - 1, canEdit, listEl), addBtn)
        form.remove()
    })
    cancel.addEventListener('click', () => form.remove())

    btns.appendChild(save); btns.appendChild(cancel)
    form.appendChild(nameIn); form.appendChild(descIn); form.appendChild(btns)
    return form
}

function getHabilidades() {
    return state.statPopupChar?.stats?.habilidades || []
}
function addHabilidade(hab) {
    if (!state.statPopupChar?.stats) return
    if (!state.statPopupChar.stats.habilidades) state.statPopupChar.stats.habilidades = []
    state.statPopupChar.stats.habilidades.push(hab)
    persistFullStats()
}
function removeHabilidade(idx) {
    if (!state.statPopupChar?.stats?.habilidades) return
    state.statPopupChar.stats.habilidades.splice(idx, 1)
    persistFullStats()
}

// ── Posicionar sub-painel ao lado do statPopup ──────────────────────────────
function positionPanel(panel) {
    panel.style.visibility = 'hidden'
    panel.classList.add('visible')

    requestAnimationFrame(() => {
        const sp = statPopup.getBoundingClientRect()
        const pw = panel.offsetWidth
        const ph = panel.offsetHeight

        let left = sp.right + 10
        if (left + pw > window.innerWidth - 8) left = sp.left - pw - 10
        left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
        let top = Math.max(8, Math.min(sp.top, window.innerHeight - ph - 8))

        panel.style.left = left + 'px'
        panel.style.top = top + 'px'
        panel.style.visibility = 'visible'
    })
}

// ── Switch item ───────────────────────────────────────────────────────────────
function buildSwitchItem(c) {
    const isActive = c.id === state.activeCharacterId
    const item = mk('div', 'char-switch-item' + (isActive ? ' active' : ''))
    if (c.photo) { const img = document.createElement('img'); img.className = 'char-switch-photo'; img.src = c.photo; item.appendChild(img) }
    else { item.appendChild(mk('div', 'char-switch-placeholder', '⚔')) }
    const info = mk('div', 'char-switch-info')
    info.appendChild(mk('div', 'char-switch-name', c.name))
    const s = c.stats || {}
    info.appendChild(mk('div', 'char-switch-hp', `HP ${s.hp ?? '?'}/${s.hp_max ?? '?'}`))
    item.appendChild(info)
    if (isActive) item.appendChild(mk('span', 'char-switch-active-badge', '✦'))
    item.addEventListener('click', e => {
        e.stopPropagation(); state.activeCharacterId = c.id; closeStatPopup()
        const { emitCharacters, updateActiveIndicator } = require('./characters')
        emitCharacters(); updateActiveIndicator()
    })
    return item
}

// ── Fechamento ────────────────────────────────────────────────────────────────
function closeStatPopup() {
    statPopup.classList.remove('visible')
    inventoryModal.classList.remove('visible')
    attrPanel.classList.remove('visible')
    antPanel.classList.remove('visible')
    habPanel.classList.remove('visible')
    if (statCharMgmt) statCharMgmt.style.display = 'none'
    if (statSwitchPanel) statSwitchPanel.style.display = 'none'
    state.statPopupCharId = null
    state.statPopupChar = null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

function adjBtn(label, enabled, onClick, extraCls) {
    const btn = document.createElement('button')
    btn.className = 'sp-adj-btn' + (extraCls ? ' ' + extraCls : '')
    btn.textContent = label
    btn.disabled = !enabled
    btn.addEventListener('click', e => { e.stopPropagation(); onClick() })
    return btn
}

function numInput(key, value, enabled, extraCls) {
    const input = document.createElement('input')
    input.className = 'sp-stat-input' + (extraCls ? ' ' + extraCls : '')
    input.type = 'number'; input.min = '0'; input.value = value
    input.disabled = !enabled; input.dataset.statKey = key
    input.addEventListener('change', () => { const v = Math.max(0, parseInt(input.value) || 0); input.value = v; commitStatChange(key, v) })
    input.addEventListener('keydown', e => e.stopPropagation())
    return input
}

function adj(field, delta) {
    // Procura em todos os painéis visíveis
    const containers = [statDynamicRows, document.getElementById('attrPanelBody'), document.getElementById('antPanelBody')]
    for (const c of containers) {
        const el = c?.querySelector(`[data-stat-key="${field}"]`)
        if (!el) continue
        if (el.tagName === 'INPUT') {
            const nv = Math.max(0, (parseInt(el.value) || 0) + delta)
            el.value = nv; commitStatChange(field, nv)
        } else {
            const nv = Math.max(0, (parseInt(el.textContent) || 0) + delta)
            el.textContent = nv; commitStatChange(field, nv)
        }
        return
    }
}

// ── Commit & persist ──────────────────────────────────────────────────────────
function commitStatChange(field, value) {
    if (!state.statPopupCharId || !state.socket) return
    const cachedEntry = state.allCharsCache.find(e => e.character.id === state.statPopupCharId)
    const stats = cachedEntry?.character?.stats || {}
    const oldVal = stats[field] ?? null

    if (cachedEntry?.character?.stats) cachedEntry.character.stats[field] = value
    const ownChar = state.playerCharacters.find(c => c.id === state.statPopupCharId)
    if (ownChar?.stats) ownChar.stats[field] = value

    updateCardStat(state.statPopupCharId, field, value)

    if (oldVal !== null && oldVal !== value) {
        const sysDef = SYSTEMS[cachedEntry?.character?.system] || null
        if (sysDef) {
            const psDef = sysDef.popupStats.find(ps => ps.key === field)
            if (psDef?.flashField === 'hp') flashCard(state.statPopupCharId, value < oldVal ? 'red' : 'green')
            else if (psDef?.flashField === 'sanity') flashCard(state.statPopupCharId, 'blue')
        }
    }

    persistFullStats()
    state.socket.emit('stat_update', { charId: state.statPopupCharId, field, value, ownerName: state.playerName })
}

function persistFullStats() {
    if (!state.statPopupCharId) return
    const ownChar = state.playerCharacters.find(c => c.id === state.statPopupCharId)
    const cachedEntry = state.allCharsCache.find(e => e.character.id === state.statPopupCharId)
    const stats = ownChar?.stats || cachedEntry?.character?.stats || {}
    state.supabase.from('characters').update({ stats }).eq('id', state.statPopupCharId)
        .then(({ error }) => { if (error) console.warn('[Stat] Supabase error:', error.message) })
}

module.exports = { openStatPopup, closeStatPopup, commitStatChange }
