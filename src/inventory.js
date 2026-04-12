const state = require('./state')
const { makeDraggable } = require('./hud')

// ── Elementos do DOM ──────────────────────────────────────────────────────────
const inventoryModal = document.getElementById('inventoryModal')
const invModalHeader = document.getElementById('invModalHeader')
const invModalCharName = document.getElementById('invModalCharName')
const invGrid = document.getElementById('invGrid')
const invGridEmpty = document.getElementById('invGridEmpty')
const invModalFooter = document.getElementById('invModalFooter')

makeDraggable(inventoryModal, invModalHeader)

// ── Fechar modal ──────────────────────────────────────────────────────────────
document.getElementById('inventoryClose').addEventListener('click', () => {
    inventoryModal.classList.remove('visible')
})
document.addEventListener('click', e => {
    const statPopup = document.getElementById('statPopup')
    const transferPicker = document.getElementById('transferPicker')
    if (inventoryModal.classList.contains('visible')
        && !inventoryModal.contains(e.target)
        && !statPopup.contains(e.target)
        && !document.getElementById('invLightbox')?.contains(e.target)
        && !(transferPicker && transferPicker.contains(e.target))) {
        inventoryModal.classList.remove('visible')
    }
})

// Impede que cliques no footer/dropdown propaguem e fechem o modal
invModalFooter.addEventListener('mousedown', e => e.stopPropagation())
invModalFooter.addEventListener('click', e => e.stopPropagation())

document.getElementById('openInventoryBtn').addEventListener('click', () => {
    if (!state.statPopupChar) return
    openInventoryModal(state.statPopupChar)
})

// ── Cache de itens da tabela `items` ─────────────────────────────────────────
let allItemsCache = []
let currentInvIsOwn = false
let currentInvCharId = null

async function loadAllItems() {
    if (!state.supabase || allItemsCache.length > 0) return
    try {
        const { data, error } = await state.supabase
            .from('items')
            .select('id, name, photo, icon, viewable')
            .order('name')
        if (error) { console.error('[Inventory] Erro ao carregar itens:', error.message); return }
        allItemsCache = data || []
        console.log(`[Inventory] ${allItemsCache.length} itens disponíveis no banco`)
    } catch (e) { console.error('[Inventory] loadAllItems:', e) }
}

// ── Render do ícone: trata URL vs emoji ───────────────────────────────────────
function buildItemIcon(item, sizePx = 20) {
    const icon = (item.icon || '').trim()
    const isUrl = icon.startsWith('http') || icon.startsWith('/')

    if (isUrl) {
        const img = document.createElement('img')
        img.src = icon
        img.style.cssText = `width:${sizePx}px;height:${sizePx}px;object-fit:contain;border-radius:3px;flex-shrink:0;`
        img.onerror = () => { img.replaceWith(document.createTextNode('📦')) }
        return img
    }

    const span = document.createElement('span')
    span.textContent = icon || '📦'
    span.style.cssText = `font-size:${sizePx}px;line-height:1;`
    return span
}

// ── Footer do mestre ──────────────────────────────────────────────────────────
function buildMasterFooter() {
    invModalFooter.innerHTML = ''
    invModalFooter.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-top:1px solid rgba(201,168,76,0.15);'

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:6px;'

    const searchInput = document.createElement('input')
    searchInput.className = 'inv-add-input'
    searchInput.placeholder = 'Buscar item do banco…'
    searchInput.autocomplete = 'off'
    searchInput.maxLength = 80
    searchInput.style.flex = '1'

    const addBtn = document.createElement('button')
    addBtn.className = 'inv-add-btn'
    addBtn.textContent = '+ Adicionar'
    addBtn.disabled = true

    row.appendChild(searchInput)
    row.appendChild(addBtn)
    invModalFooter.appendChild(row)

    // Linha de quantidade
    const qtyRow = document.createElement('div')
    qtyRow.style.cssText = 'display:none;align-items:center;gap:8px;'

    const selectedLabel = document.createElement('span')
    selectedLabel.style.cssText = 'font-size:12px;color:rgba(201,168,76,0.85);font-family:"Crimson Text",serif;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'

    const qtyLabel = document.createElement('span')
    qtyLabel.textContent = 'Qtd:'
    qtyLabel.style.cssText = 'font-size:11px;color:rgba(201,168,76,0.5);white-space:nowrap;'

    const qtyInput = document.createElement('input')
    qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.value = '1'
    qtyInput.className = 'inv-add-input'
    qtyInput.style.cssText = 'width:54px;text-align:center;padding:4px 6px;'
    qtyInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addBtn.click() }
        e.stopPropagation()
    })

    qtyRow.appendChild(selectedLabel)
    qtyRow.appendChild(qtyLabel)
    qtyRow.appendChild(qtyInput)
    invModalFooter.appendChild(qtyRow)

    // Dropdown
    const dropdown = document.createElement('div')
    dropdown.style.cssText = `
        background:rgba(15,11,7,0.98);
        border:1px solid rgba(201,168,76,0.2);
        border-radius:6px;
        max-height:180px;overflow-y:auto;
        display:none;flex-direction:column;
    `
    invModalFooter.appendChild(dropdown)

    let selectedItem = null

    function selectItem(item) {
        selectedItem = item
        searchInput.value = item.name
        dropdown.style.display = 'none'
        selectedLabel.textContent = `✓ ${item.name}`
        qtyRow.style.display = 'flex'
        addBtn.disabled = false
        qtyInput.focus(); qtyInput.select()
    }

    function clearSelection() {
        selectedItem = null
        addBtn.disabled = true
        qtyRow.style.display = 'none'
        selectedLabel.textContent = ''
    }

    function renderDropdown(query) {
        dropdown.innerHTML = ''
        const q = (query || '').toLowerCase().trim()
        const filtered = q
            ? allItemsCache.filter(i => i.name.toLowerCase().includes(q))
            : allItemsCache

        if (filtered.length === 0) { dropdown.style.display = 'none'; return }

        filtered.slice(0, 40).forEach(item => {
            const opt = document.createElement('div')
            opt.style.cssText = `
                display:flex;align-items:center;gap:9px;padding:7px 10px;
                cursor:pointer;border-bottom:1px solid rgba(201,168,76,0.07);
                transition:background .1s;
            `
            opt.addEventListener('mouseenter', () => { opt.style.background = 'rgba(201,168,76,0.08)' })
            opt.addEventListener('mouseleave', () => { opt.style.background = '' })

            opt.appendChild(buildItemIcon(item, 18))

            const nameEl = document.createElement('span')
            nameEl.textContent = item.name
            nameEl.style.cssText = 'font-family:"Crimson Text",serif;font-size:14px;color:rgba(220,200,160,0.9);'
            opt.appendChild(nameEl)

            if (item.viewable && item.photo) {
                const badge = document.createElement('span')
                badge.textContent = '🖼'
                badge.title = 'Item visualizável'
                badge.style.cssText = 'margin-left:auto;font-size:11px;opacity:.55;'
                opt.appendChild(badge)
            }

            opt.addEventListener('mousedown', e => { e.preventDefault(); selectItem(item) })
            dropdown.appendChild(opt)
        })

        dropdown.style.display = 'flex'
    }

    let debounce
    searchInput.addEventListener('input', () => {
        clearSelection()
        clearTimeout(debounce)
        debounce = setTimeout(() => renderDropdown(searchInput.value), 150)
    })
    searchInput.addEventListener('focus', () => {
        loadAllItems().then(() => renderDropdown(searchInput.value))
    })
    searchInput.addEventListener('blur', () => {
        setTimeout(() => { dropdown.style.display = 'none' }, 200)
    })
    searchInput.addEventListener('keydown', e => { e.stopPropagation() })

    addBtn.addEventListener('click', async () => {
        if (!selectedItem || !state.statPopupChar) return
        const qty = Math.max(1, parseInt(qtyInput.value) || 1)
        addBtn.disabled = true
        addBtn.textContent = '…'
        await addItemToInventory(state.statPopupChar.id, selectedItem, qty)
        searchInput.value = ''
        clearSelection()
        addBtn.textContent = '+ Adicionar'
        qtyInput.value = '1'
    })
}

// ── Adicionar item ao inventário ──────────────────────────────────────────────
async function addItemToInventory(charId, item, quantity = 1) {
    if (!state.supabase) return
    try {
        const { data: existing, error: selErr } = await state.supabase
            .from('inventory')
            .select('id, quantity')
            .eq('character_id', charId)
            .eq('item_id', item.id)
            .maybeSingle()

        if (selErr) throw selErr

        let inventoryId

        if (existing) {
            const newQty = existing.quantity + quantity
            const { error } = await state.supabase
                .from('inventory').update({ quantity: newQty }).eq('id', existing.id)
            if (error) throw error
            inventoryId = existing.id
            const entry = (state.inventories[charId] || []).find(i => i.inventoryId === existing.id)
            if (entry) entry.quantity = newQty
        } else {
            const { data: inserted, error } = await state.supabase
                .from('inventory')
                .insert({ character_id: charId, item_id: item.id, quantity })
                .select('id')
                .single()
            if (error) throw error
            inventoryId = inserted.id

            if (!state.inventories[charId]) state.inventories[charId] = []
            state.inventories[charId].push({
                inventoryId, quantity,
                id: item.id, name: item.name, photo: item.photo, icon: item.icon, viewable: item.viewable,
            })
        }

        renderInvGrid(charId)

        if (state.socket) {
            state.socket.emit('inventory_update', { charId, items: state.inventories[charId] })
        }

        console.log(`[Inventory] "${item.name}" ×${quantity} adicionado ao char ${charId}`)
    } catch (e) {
        console.error('[Inventory] addItemToInventory:', e)
    }
}

// ── Remover item do inventário ────────────────────────────────────────────────
async function removeItemFromInventory(charId, inventoryId) {
    if (!state.supabase) return
    try {
        const { error } = await state.supabase
            .from('inventory').delete().eq('id', inventoryId)
        if (error) throw error

        state.inventories[charId] = (state.inventories[charId] || []).filter(i => i.inventoryId !== inventoryId)
        renderInvGrid(charId)

        if (state.socket) {
            state.socket.emit('inventory_update', { charId, items: state.inventories[charId] })
        }
    } catch (e) { console.error('[Inventory] removeItemFromInventory:', e) }
}

// ── Abrir modal ───────────────────────────────────────────────────────────────
async function openInventoryModal(char) {
    invModalCharName.textContent = char.name
    currentInvCharId = char.id
    currentInvIsOwn = state.playerCharacters.some(c => c.id === char.id)

    if (state.isRoomMaster) {
        buildMasterFooter()
        loadAllItems()
    } else {
        invModalFooter.style.display = 'none'
    }

    invGrid.querySelectorAll('.inv-item-tile').forEach(el => el.remove())
    invGridEmpty.style.display = 'block'

    const cached = state.inventories[char.id]
    if (cached !== undefined) {
        renderInvGrid(char.id)
    } else {
        const items = await loadCharInventoryFromDB(char.id)
        state.inventories[char.id] = items
        renderInvGrid(char.id)
    }

    inventoryModal.style.visibility = 'hidden'
    inventoryModal.classList.add('visible')

    requestAnimationFrame(() => {
        const statPopup = document.getElementById('statPopup')
        const mw = inventoryModal.offsetWidth
        const mh = inventoryModal.offsetHeight
        const sp = statPopup.getBoundingClientRect()

        let left = sp.right + 10
        if (left + mw > window.innerWidth - 8) left = sp.left - mw - 10
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8))
        let top = Math.max(8, Math.min(sp.top, window.innerHeight - mh - 8))

        inventoryModal.style.left = left + 'px'
        inventoryModal.style.top = top + 'px'
        inventoryModal.style.visibility = 'visible'
    })
}

// ── Fallback: busca do banco ─────────────────────────────────────────────────
async function loadCharInventoryFromDB(charId) {
    if (!state.supabase) return []
    try {
        const { data, error } = await state.supabase
            .from('inventory')
            .select('id, quantity, item:item_id(id, name, photo, icon, viewable)')
            .eq('character_id', charId)

        if (error) { console.error('[Inventory] DB fallback error:', error.message); return [] }

        return (data || [])
            .filter(row => row.item)
            .map(row => ({
                inventoryId: row.id, quantity: row.quantity,
                id: row.item.id, name: row.item.name, photo: row.item.photo,
                icon: row.item.icon, viewable: row.item.viewable,
            }))
    } catch (e) { console.error('[Inventory] loadCharInventoryFromDB:', e); return [] }
}

// ── Render da grade ───────────────────────────────────────────────────────────
function renderInvGrid(charId) {
    invGrid.querySelectorAll('.inv-item-tile').forEach(el => el.remove())
    const items = state.inventories[charId] || []
    invGridEmpty.style.display = items.length === 0 ? 'block' : 'none'
    items.forEach(item => invGrid.insertBefore(buildInvTile(item, charId), invGridEmpty))
}

function buildInvTile(item, charId) {
    const tile = document.createElement('div')
    tile.className = 'inv-item-tile'
    tile.dataset.itemId = item.id
    tile.dataset.invId = item.inventoryId
    tile.style.position = 'relative'

    if (state.isRoomMaster) {
        const del = document.createElement('button')
        del.className = 'inv-item-del-tile'
        del.textContent = '✕'
        del.title = 'Remover do inventário'
        del.addEventListener('click', async e => {
            e.stopPropagation()
            await removeItemFromInventory(charId, item.inventoryId)
        })
        tile.appendChild(del)
    }

    const iconWrap = document.createElement('div')
    iconWrap.className = 'inv-item-tile-icon'
    iconWrap.appendChild(buildItemIcon(item, 28))
    tile.appendChild(iconWrap)

    const nameEl = document.createElement('span')
    nameEl.className = 'inv-item-tile-name'
    nameEl.textContent = item.name
    tile.appendChild(nameEl)

    if (item.quantity > 1) {
        const qty = document.createElement('span')
        qty.textContent = `×${item.quantity}`
        qty.style.cssText = 'position:absolute;bottom:4px;right:5px;font-size:9px;font-family:"Cinzel",serif;color:rgba(201,168,76,0.55);'
        tile.appendChild(qty)
    }

    if (item.viewable && item.photo) {
        tile.classList.add('inv-viewable')
        tile.title = 'Clique para visualizar'
        tile.style.cursor = 'zoom-in'
        tile.addEventListener('click', e => { e.stopPropagation(); openLightbox(item) })
    }

    // Ações do dono: mostrar a todos / transferir
    if (currentInvIsOwn && !state.isRoomMaster) {
        const actions = document.createElement('div')
        actions.className = 'inv-item-actions'

        const showBtn = document.createElement('button')
        showBtn.className = 'inv-action-btn'
        showBtn.title = 'Mostrar a todos'
        showBtn.textContent = '👁'
        showBtn.addEventListener('click', e => {
            e.stopPropagation()
            showItemToAll(item)
        })
        actions.appendChild(showBtn)

        const transferBtn = document.createElement('button')
        transferBtn.className = 'inv-action-btn'
        transferBtn.title = 'Transferir para...'
        transferBtn.textContent = '↗'
        transferBtn.addEventListener('click', e => {
            e.stopPropagation()
            openTransferPicker(charId, item, tile)
        })
        actions.appendChild(transferBtn)

        tile.appendChild(actions)
    }

    return tile
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(item) {
    document.getElementById('invLightbox')?.remove()

    const overlay = document.createElement('div')
    overlay.id = 'invLightbox'
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:9999;
        background:rgba(0,0,0,0.88);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        cursor:zoom-out;
    `

    const img = document.createElement('img')
    img.src = item.photo
    img.alt = item.name
    img.style.cssText = `
        max-width:min(88vw,820px);max-height:78vh;
        border-radius:8px;border:1px solid rgba(201,168,76,0.25);
        box-shadow:0 8px 80px rgba(0,0,0,0.8);object-fit:contain;
    `

    const caption = document.createElement('div')
    caption.textContent = item.name
    caption.style.cssText = 'margin-top:14px;font-family:"Cinzel",serif;font-size:13px;letter-spacing:.15em;color:rgba(201,168,76,0.7);text-transform:uppercase;'

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    closeBtn.style.cssText = 'position:absolute;top:18px;right:22px;background:none;border:none;color:rgba(201,168,76,0.5);font-size:22px;cursor:pointer;padding:4px 8px;transition:color .15s;'
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = 'rgba(201,168,76,1)' })
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = 'rgba(201,168,76,0.5)' })

    overlay.appendChild(img)
    overlay.appendChild(caption)
    overlay.appendChild(closeBtn)
    document.body.appendChild(overlay)

    const close = () => overlay.remove()
    overlay.addEventListener('click', e => { if (e.target === overlay) close() })
    closeBtn.addEventListener('click', close)
    const onEsc = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc) } }
    document.addEventListener('keydown', onEsc)
}

// ── Receber atualização via socket ────────────────────────────────────────────
function handleInventoryUpdate({ charId, items }) {
    state.inventories[charId] = items

    if (inventoryModal.classList.contains('visible') && state.statPopupChar?.id === charId) {
        renderInvGrid(charId)
    }

    updateInventoryBadge(charId, items.length)
}

function updateInventoryBadge(charId, count) {
    const bar = document.getElementById('characterBar')
    const card = bar?.querySelector(`[data-char-id="${charId}"]`)
    if (!card) return

    let badge = card.querySelector('.inv-count-badge')
    if (count === 0) { badge?.remove(); return }

    if (!badge) {
        badge = document.createElement('span')
        badge.className = 'inv-count-badge'
        badge.style.cssText = `
            position:absolute;top:4px;right:4px;
            background:rgba(201,168,76,0.85);color:#1a140a;
            font-size:9px;font-family:"Cinzel",serif;font-weight:700;
            border-radius:99px;padding:1px 5px;pointer-events:none;
        `
        card.style.position = 'relative'
        card.appendChild(badge)
    }
    badge.textContent = `📦 ${count}`
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MOSTRAR ITEM A TODOS ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function showItemToAll(item) {
    if (!state.socket) return
    state.socket.emit('item_show', {
        playerName: state.playerName,
        item: { name: item.name, icon: item.icon, photo: item.photo, viewable: item.viewable }
    })
}

function handleItemShow({ playerName, item }) {
    document.getElementById('invLightbox')?.remove()

    const overlay = document.createElement('div')
    overlay.id = 'invLightbox'
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:9999;
        background:rgba(0,0,0,0.88);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        cursor:pointer;
    `

    if (item.viewable && item.photo) {
        const img = document.createElement('img')
        img.src = item.photo
        img.alt = item.name
        img.style.cssText = `
            max-width:min(88vw,820px);max-height:70vh;
            border-radius:8px;border:1px solid rgba(201,168,76,0.25);
            box-shadow:0 8px 80px rgba(0,0,0,0.8);object-fit:contain;
        `
        overlay.appendChild(img)
    } else {
        const iconWrap = document.createElement('div')
        iconWrap.style.cssText = 'font-size:80px;line-height:1;margin-bottom:8px;'
        iconWrap.appendChild(buildItemIcon(item, 80))
        overlay.appendChild(iconWrap)
    }

    const caption = document.createElement('div')
    caption.style.cssText = 'margin-top:14px;font-family:"Cinzel",serif;font-size:16px;letter-spacing:.15em;color:var(--gold);text-transform:uppercase;'
    caption.textContent = item.name
    overlay.appendChild(caption)

    const shownBy = document.createElement('div')
    shownBy.style.cssText = 'margin-top:6px;font-family:"Crimson Text",serif;font-size:14px;color:rgba(244,234,213,0.45);font-style:italic;'
    shownBy.textContent = `Mostrado por ${playerName}`
    overlay.appendChild(shownBy)

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    closeBtn.style.cssText = 'position:absolute;top:18px;right:22px;background:none;border:none;color:rgba(201,168,76,0.5);font-size:22px;cursor:pointer;padding:4px 8px;transition:color .15s;'
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = 'rgba(201,168,76,1)' })
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = 'rgba(201,168,76,0.5)' })
    overlay.appendChild(closeBtn)

    document.body.appendChild(overlay)

    const close = () => overlay.remove()
    overlay.addEventListener('click', e => { if (e.target === overlay) close() })
    closeBtn.addEventListener('click', close)
    const timer = setTimeout(close, 10000)
    const onEsc = e => { if (e.key === 'Escape') { close(); clearTimeout(timer); document.removeEventListener('keydown', onEsc) } }
    document.addEventListener('keydown', onEsc)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TRANSFERIR ITEM ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function openTransferPicker(fromCharId, item, tileEl) {
    document.getElementById('transferPicker')?.remove()

    const targets = state.allCharsCache.filter(e =>
        e.character.id !== fromCharId && e.playerName !== state.playerName
    )

    if (targets.length === 0) return

    const picker = document.createElement('div')
    picker.id = 'transferPicker'
    picker.className = 'transfer-picker'

    const title = document.createElement('div')
    title.className = 'transfer-picker-title'
    title.textContent = `Transferir "${item.name}" para:`
    picker.appendChild(title)

    targets.forEach(({ playerName: owner, character: char }) => {
        const opt = document.createElement('div')
        opt.className = 'transfer-picker-opt'

        if (char.photo) {
            const img = document.createElement('img')
            img.src = char.photo
            img.className = 'transfer-picker-photo'
            opt.appendChild(img)
        } else {
            const ph = document.createElement('div')
            ph.className = 'transfer-picker-ph'
            ph.textContent = '⚔'
            opt.appendChild(ph)
        }

        const info = document.createElement('div')
        info.className = 'transfer-picker-info'
        info.innerHTML = `<div class="transfer-picker-name">${char.name}</div><div class="transfer-picker-owner">${owner}</div>`
        opt.appendChild(info)

        opt.addEventListener('click', async e => {
            e.stopPropagation()
            picker.remove()
            await transferItemTo(fromCharId, char.id, item)
        })
        picker.appendChild(opt)
    })

    // Fecha ao clicar fora
    const closePicker = e => {
        if (!picker.contains(e.target)) {
            picker.remove()
            document.removeEventListener('click', closePicker, true)
        }
    }
    setTimeout(() => document.addEventListener('click', closePicker, true), 10)

    document.body.appendChild(picker)
    requestAnimationFrame(() => {
        const tileRect = tileEl.getBoundingClientRect()
        const pw = picker.offsetWidth
        const ph = picker.offsetHeight

        let left = tileRect.right + 8
        if (left + pw > window.innerWidth - 8) left = tileRect.left - pw - 8
        left = Math.max(8, left)
        let top = Math.max(8, Math.min(tileRect.top, window.innerHeight - ph - 8))

        picker.style.left = left + 'px'
        picker.style.top = top + 'px'
    })
}

// ── Executar transferência (FIX: não mexe no cache do destinatário) ───────────
async function transferItemTo(fromCharId, toCharId, item) {
    if (!state.supabase || !state.socket) return
    try {
        // 1. Atualiza no banco: muda character_id
        const { error } = await state.supabase
            .from('inventory')
            .update({ character_id: toCharId })
            .eq('id', item.inventoryId)
        if (error) throw error

        // 2. Remove do cache LOCAL do remetente
        state.inventories[fromCharId] = (state.inventories[fromCharId] || []).filter(i => i.inventoryId !== item.inventoryId)

        // 3. Re-renderiza se o inventário do remetente está aberto
        if (inventoryModal.classList.contains('visible') && currentInvCharId === fromCharId) {
            renderInvGrid(fromCharId)
        }

        // 4. Emite inventory_update APENAS pro remetente (temos o cache completo)
        state.socket.emit('inventory_update', { charId: fromCharId, items: state.inventories[fromCharId] })

        // 5. Emite item_transferred — o servidor faz broadcast e CADA cliente
        //    adiciona o item ao cache do destinatário localmente
        state.socket.emit('item_transferred', { toCharId, item })

        // 6. Mensagem no chat
        const toEntry = state.allCharsCache.find(e => e.character.id === toCharId)
        const toName = toEntry?.character?.name || 'alguém'
        state.socket.emit('chat_message', {
            playerName: '⚙ Sistema',
            message: `${state.playerName} transferiu "${item.name}" para ${toName}.`,
            type: 'text'
        })

        console.log(`[Transfer] "${item.name}" transferido de ${fromCharId} para ${toCharId}`)
    } catch (e) {
        console.error('[Transfer] Erro:', e)
    }
}

// ── Receber item transferido (todos os clientes) ─────────────────────────────
function handleItemTransferred({ toCharId, item }) {
    // Adiciona ao cache do destinatário sem apagar os itens existentes
    if (!state.inventories[toCharId]) state.inventories[toCharId] = []
    state.inventories[toCharId].push(item)

    // Re-renderiza se o inventário do destinatário está aberto
    if (inventoryModal.classList.contains('visible') && state.statPopupChar?.id === toCharId) {
        renderInvGrid(toCharId)
    }

    // Atualiza badge
    updateInventoryBadge(toCharId, state.inventories[toCharId].length)
}

module.exports = { openInventoryModal, renderInvGrid, handleInventoryUpdate, handleItemShow, handleItemTransferred }
