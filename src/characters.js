const state = require('./state')

// ── Carregar e emitir ─────────────────────────────────────────────────────────
async function loadAndShareCharacters() {
    if (!state.currentUserId || !state.supabase) return
    try {
        const { data: chars, error } = await state.supabase
            .from('characters').select('*').eq('user_id', state.currentUserId)
        if (error) { console.error('[Characters] Erro ao carregar:', error.message); return }
        state.playerCharacters = chars || []
        if (state.playerCharacters.length === 0) openCharModal()
        else emitCharacters()
    } catch (e) { console.error('[Characters] Erro:', e) }
}

function emitCharacters() {
    if (!state.socket) return
    state.socket.emit('share_characters', { playerName: state.playerName, characters: state.playerCharacters })
}

// ── Render da barra ───────────────────────────────────────────────────────────
function renderCharacterBar(allChars) {
    state.allCharsCache = allChars || []
    const bar = document.getElementById('characterBar')
    bar.innerHTML = ''
    if (!allChars || allChars.length === 0) { bar.style.display = 'none'; return }
    allChars.forEach(({ playerName: owner, character }) => {
        bar.appendChild(buildCharCard(character, owner))
    })
    bar.style.display = 'flex'
}

function buildCharCard(char, ownerName) {
    const { openStatPopup } = require('./statPopup')

    const card = document.createElement('div')
    card.className = 'char-card clickable'
    card.dataset.charId = char.id
    card.dataset.ownerName = ownerName
    if (ownerName === state.playerName) card.style.borderColor = 'rgba(201,168,76,0.65)'

    // Foto
    const photoWrap = document.createElement('div'); photoWrap.className = 'char-card-photo-wrap'
    if (char.photo) {
        const img = document.createElement('img')
        img.className = 'char-card-photo'; img.src = char.photo; img.alt = char.name
        img.onerror = () => { img.style.display = 'none'; photoWrap.appendChild(buildPhotoPlaceholder()) }
        photoWrap.appendChild(img)
    } else { photoWrap.appendChild(buildPhotoPlaceholder()) }
    card.appendChild(photoWrap)

    // Info
    const info = document.createElement('div'); info.className = 'char-card-info'

    const ownerEl = document.createElement('div')
    ownerEl.style.cssText = 'font-family:"Cinzel",serif;font-size:8px;letter-spacing:.15em;color:rgba(201,168,76,.45);text-transform:uppercase;margin-bottom:1px;'
    ownerEl.textContent = ownerName; info.appendChild(ownerEl)

    const nameEl = document.createElement('div'); nameEl.className = 'char-card-name'; nameEl.textContent = char.name; info.appendChild(nameEl)

    info.appendChild(buildStatRow('Vida', char.hp, char.hp_max ?? char.hp ?? 1, 'hp-fill', 'hp'))
    if (char.sanity != null) info.appendChild(buildStatRow('Sanidade', char.sanity, char.sanity_max ?? char.sanity ?? 1, 'san-fill', 'sanity'))
    if (char.bullets != null) {
        const row = document.createElement('div'); row.className = 'char-bullets'
        const lbl = document.createElement('span'); lbl.className = 'char-bullets-label'; lbl.textContent = 'Balas'
        const val = document.createElement('span'); val.className = 'char-bullets-val'; val.dataset.statField = 'bullets'; val.textContent = `🔫 ${char.bullets}`
        row.appendChild(lbl); row.appendChild(val); info.appendChild(row)
    }
    card.appendChild(info)

    card.addEventListener('click', e => {
        e.stopPropagation()
        if (!state.isRoomMaster && ownerName !== state.playerName) return
        const fresh = state.allCharsCache.find(en => en.character.id === char.id)
        openStatPopup(fresh ? fresh.character : char, ownerName, card)
    })

    return card
}

function buildPhotoPlaceholder() {
    const ph = document.createElement('div'); ph.className = 'char-card-photo-placeholder'; ph.textContent = '⚔'; return ph
}

function buildStatRow(label, value, maxValue, fillClass, field) {
    const row = document.createElement('div'); row.className = 'char-stat'
    const lbl = document.createElement('span'); lbl.className = 'char-stat-label'; lbl.textContent = label
    const bar = document.createElement('div'); bar.className = 'char-stat-bar'
    const fill = document.createElement('div')
    fill.className = `char-stat-fill ${fillClass}`  // NÃO setar data-stat-field no fill
    const pct = (maxValue && maxValue > 0) ? Math.max(0, Math.min(100, (value / maxValue) * 100)) : 100
    fill.style.width = pct + '%'
    bar.appendChild(fill)
    const val = document.createElement('span')
    val.className = 'char-stat-val'
    val.dataset.statField = field  // apenas o texto tem o atributo
    val.textContent = maxValue != null ? `${value}/${maxValue}` : value
    row.appendChild(lbl); row.appendChild(bar); row.appendChild(val)
    return row
}

// ── Atualização visual do card ────────────────────────────────────────────────
function updateCardStat(charId, field, value) {
    const bar = document.getElementById('characterBar')
    const card = bar?.querySelector(`[data-char-id="${charId}"]`)
    if (!card) return
    const entry = state.allCharsCache.find(e => e.character.id === charId)
    const char = entry?.character ?? null

    if (field === 'hp' || field === 'hp_max') {
        const hp = field === 'hp' ? value : (char?.hp ?? value)
        const hpMax = field === 'hp_max' ? value : (char?.hp_max ?? char?.hp ?? 1)
        const fill = card.querySelector('.hp-fill'); if (fill) fill.style.width = Math.max(0, Math.min(100, (hp / hpMax) * 100)) + '%'
        const val = card.querySelector('[data-stat-field="hp"]'); if (val) val.textContent = `${hp}/${hpMax}`
    } else if (field === 'sanity' || field === 'sanity_max') {
        const san = field === 'sanity' ? value : (char?.sanity ?? value)
        const sanMax = field === 'sanity_max' ? value : (char?.sanity_max ?? char?.sanity ?? 1)
        const fill = card.querySelector('.san-fill'); if (fill) fill.style.width = Math.max(0, Math.min(100, (san / sanMax) * 100)) + '%'
        const val = card.querySelector('[data-stat-field="sanity"]'); if (val) val.textContent = `${san}/${sanMax}`
    } else if (field === 'bullets') {
        const val = card.querySelector('[data-stat-field="bullets"]'); if (val) val.textContent = `🔫 ${value}`
    }
}

function flashCard(charId, type) {
    const bar = document.getElementById('characterBar')
    const card = bar?.querySelector(`[data-char-id="${charId}"]`)
    if (!card) return
    card.classList.remove('flash-red', 'flash-green', 'flash-blue')
    void card.offsetWidth
    card.classList.add(`flash-${type}`)
    setTimeout(() => card.classList.remove(`flash-${type}`), 750)
}

// ── Modal de criação de personagem ────────────────────────────────────────────
function openCharModal() {
    const modal = document.getElementById('charModal')
    modal.style.display = 'flex'
    document.getElementById('charModalInfo').className = 'info-box'
    document.getElementById('charModalInfo').textContent = ''
}

function closeCharModal() { document.getElementById('charModal').style.display = 'none' }

function showCharModalInfo(msg, type) {
    const el = document.getElementById('charModalInfo')
    el.textContent = msg
    el.className = msg ? `info-box visible ${type}` : 'info-box'
}

function initCharModal() {
    const charPhotoInput = document.getElementById('charPhoto')
    const photoUploadLabel = document.getElementById('photoUploadLabel')
    const photoLabelText = document.getElementById('photoLabelText')
    const charSubmitBtn = document.getElementById('charSubmitBtn')

    charPhotoInput.addEventListener('change', () => {
        const file = charPhotoInput.files[0]
        if (file) { photoLabelText.textContent = file.name; photoUploadLabel.classList.add('has-file') }
        else { photoLabelText.textContent = 'Clique para escolher imagem'; photoUploadLabel.classList.remove('has-file') }
    })

    charSubmitBtn.addEventListener('click', async () => {
        const name = document.getElementById('charName').value.trim()
        const hpMax = parseInt(document.getElementById('charHp').value)
        const sanityMax = document.getElementById('charSanity').value !== '' ? parseInt(document.getElementById('charSanity').value) : null
        const bullets = document.getElementById('charBullets').value !== '' ? parseInt(document.getElementById('charBullets').value) : null
        const photoFile = charPhotoInput.files[0] || null

        if (!name) { showCharModalInfo('O nome do personagem é obrigatório.', 'error'); return }
        if (isNaN(hpMax)) { showCharModalInfo('Vida Máxima (HP) é obrigatória.', 'error'); return }

        charSubmitBtn.disabled = true
        charSubmitBtn.textContent = 'Invocando...'

        try {
            const charId = crypto.randomUUID()
            let photoUrl = null

            if (photoFile) {
                const ext = photoFile.name.split('.').pop().toLowerCase()
                const filePath = `${state.currentUserId}/${charId}/photo.${ext}`
                const mimeType = photoFile.type || `image/${ext}`
                try {
                    const arrayBuffer = await photoFile.arrayBuffer()
                    const { data, error } = await state.supabase.storage
                        .from('CharactersAndItems')
                        .upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true })
                    if (error) throw error
                    const { data: urlData } = state.supabase.storage.from('CharactersAndItems').getPublicUrl(filePath)
                    photoUrl = urlData?.publicUrl
                } catch (err) { console.error('[Photo] Erro no upload:', err) }
            }

            const { data: newChar, error: insertError } = await state.supabase
                .from('characters')
                .insert({ id: charId, user_id: state.currentUserId, name, hp: hpMax, hp_max: hpMax, sanity: sanityMax, sanity_max: sanityMax, bullets, photo: photoUrl })
                .select().single()
            if (insertError) throw new Error(insertError.message)

            state.playerCharacters.push(newChar)
            closeCharModal()
            emitCharacters()

                ;['charName', 'charHp', 'charSanity', 'charBullets'].forEach(id => { document.getElementById(id).value = '' })
            charPhotoInput.value = ''
            photoLabelText.textContent = 'Clique para escolher imagem'
            photoUploadLabel.classList.remove('has-file')
        } catch (e) {
            console.error('[Characters] Erro:', e)
            showCharModalInfo(`Erro: ${e.message}`, 'error')
        } finally {
            charSubmitBtn.disabled = false
            charSubmitBtn.textContent = '⚔ Invocar Personagem'
        }
    })
}

module.exports = { loadAndShareCharacters, emitCharacters, renderCharacterBar, updateCardStat, flashCard, openCharModal, initCharModal }
