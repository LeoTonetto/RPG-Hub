const state = require('./state')
const { SYSTEMS, SYSTEM_ORDER } = require('./systems')

// ── Carregar e emitir ─────────────────────────────────────────────────────────
async function loadAndShareCharacters() {
    if (!state.currentUserId || !state.supabase) return
    try {
        const { data: chars, error } = await state.supabase
            .from('characters').select('*').eq('user_id', state.currentUserId)
        if (error) { console.error('[Characters] Erro ao carregar:', error.message); return }

        state.playerCharacters = (chars || []).map(normalizeChar)

        if (state.playerCharacters.length === 0) {
            openCharModal()
        } else {
            if (!state.activeCharacterId) {
                state.activeCharacterId = state.playerCharacters[0].id
            }
            emitCharacters()
        }
    } catch (e) { console.error('[Characters] Erro:', e) }
}

function normalizeChar(char) {
    if (char.stats && typeof char.stats === 'object') return char
    const system = char.system || 'coc'
    const stats = {
        hp: char.hp ?? 10,
        hp_max: char.hp_max ?? char.hp ?? 10,
    }
    if (char.sanity != null) stats.sanity = char.sanity
    if (char.sanity_max != null) stats.sanity_max = char.sanity_max
    if (char.bullets != null) stats.bullets = char.bullets
    return { id: char.id, user_id: char.user_id, name: char.name, photo: char.photo, system, stats }
}

function emitCharacters() {
    if (!state.socket) return
    const activeChar = state.activeCharacterId
        ? state.playerCharacters.find(c => c.id === state.activeCharacterId)
        : state.playerCharacters[0]
    const toSend = activeChar ? [activeChar] : []
    state.socket.emit('share_characters', { playerName: state.playerName, characters: toSend })
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
    updateActiveIndicator()
}

function buildCharCard(char, ownerName) {
    const card = document.createElement('div')
    card.className = 'char-card clickable'
    card.dataset.charId = char.id
    card.dataset.ownerName = ownerName
    // Permite que o CSS trate o card por sistema. No Calico, 0 PV não é morte:
    // é o começo dos testes de Vigor (§7.9), e o card precisa dizer isso.
    card.dataset.system = char.system || ''
    if (ownerName === state.playerName) card.style.borderColor = 'rgba(201,168,76,0.65)'

    const photoWrap = document.createElement('div'); photoWrap.className = 'char-card-photo-wrap'
    if (char.photo) {
        const img = document.createElement('img')
        img.className = 'char-card-photo'; img.src = char.photo; img.alt = char.name
        img.onerror = () => { img.style.display = 'none'; photoWrap.appendChild(buildPhotoPlaceholder()) }
        photoWrap.appendChild(img)
    } else { photoWrap.appendChild(buildPhotoPlaceholder()) }
    card.appendChild(photoWrap)

    const info = document.createElement('div'); info.className = 'char-card-info'

    const ownerEl = document.createElement('div')
    ownerEl.style.cssText = 'font-family:"Cinzel",serif;font-size:8px;letter-spacing:.15em;color:rgba(201,168,76,.45);text-transform:uppercase;margin-bottom:1px;'
    ownerEl.textContent = ownerName; info.appendChild(ownerEl)

    const nameEl = document.createElement('div'); nameEl.className = 'char-card-name'; nameEl.textContent = char.name; info.appendChild(nameEl)

    const stats = char.stats || {}
    const sysDef = SYSTEMS[char.system] || null

    if (sysDef) {
        sysDef.cardBars.forEach(bar => {
            const val = stats[bar.key] ?? 0
            const max = stats[bar.maxKey] ?? val ?? 1
            info.appendChild(buildStatRow(bar.label, val, max, bar.fillClass, bar.key))
        })
        if (sysDef.cardExtras.length > 0) {
            const extrasRow = document.createElement('div')
            extrasRow.style.cssText = 'display:flex;gap:8px;margin-top:2px;'
            sysDef.cardExtras.forEach(ex => {
                const span = document.createElement('span')
                span.className = 'char-card-extra'
                span.dataset.statField = ex.key
                span.textContent = `${ex.label} ${stats[ex.key] ?? 0}`
                extrasRow.appendChild(span)
            })
            info.appendChild(extrasRow)
        }
    } else {
        if (stats.hp != null) info.appendChild(buildStatRow('Vida', stats.hp, stats.hp_max ?? stats.hp, 'hp-fill', 'hp'))
        if (stats.sanity != null) info.appendChild(buildStatRow('Sanidade', stats.sanity, stats.sanity_max ?? stats.sanity, 'san-fill', 'sanity'))
    }

    // ── Condicoes ativas ─────────────────────────────────────────────────────
    // Agarrado, caido, sangrando... a mesa precisa ver isso de relance, sem
    // abrir a ficha de cada um
    if (sysDef?.cardCondicoes) {
        info.appendChild(buildCondicoesRow(stats.condicoes))
    }

    card.appendChild(info)

    // Indicador de morte (HP = 0)
    if ((stats.hp ?? 1) <= 0) {
        card.classList.add('char-dead')
    }

    card.addEventListener('click', e => {
        e.stopPropagation()
        if (!state.isRoomMaster && ownerName !== state.playerName) return
        const fresh = state.allCharsCache.find(en => en.character.id === char.id)
        const { openStatPopup } = require('./statPopup')
        openStatPopup(fresh ? fresh.character : char, ownerName, card)
    })

    return card
}

/**
 * Fileira de condicoes do card. Devolve sempre o elemento (vazio quando nao ha
 * condicao), para o updateCardStat conseguir trocar o conteudo sem remontar o
 * card inteiro.
 */
function buildCondicoesRow(condicoes) {
    const row = document.createElement('div')
    row.className = 'char-card-cond'
    row.dataset.statField = 'condicoes'
    preencherCondicoes(row, condicoes)
    return row
}

function preencherCondicoes(row, condicoes) {
    row.innerHTML = ''
    const lista = Array.isArray(condicoes) ? condicoes : []
    row.style.display = lista.length ? 'flex' : 'none'
    if (!lista.length) return

    const { CONDICAO_POR_ID } = require('./calico')
    lista.forEach(id => {
        const def = CONDICAO_POR_ID[id]
        if (!def) return
        const chip = document.createElement('span')
        chip.className = 'char-cond-chip cond-' + id
        chip.textContent = def.icon
        chip.title = `${def.nome} — ${def.efeito}`
        row.appendChild(chip)
    })
}

function buildPhotoPlaceholder() {
    const ph = document.createElement('div'); ph.className = 'char-card-photo-placeholder'; ph.textContent = '⚔'; return ph
}

function buildStatRow(label, value, maxValue, fillClass, field) {
    const row = document.createElement('div'); row.className = 'char-stat'
    const lbl = document.createElement('span'); lbl.className = 'char-stat-label'; lbl.textContent = label
    const bar = document.createElement('div'); bar.className = 'char-stat-bar'
    const fill = document.createElement('div')
    fill.className = `char-stat-fill ${fillClass}`
    const pct = (maxValue && maxValue > 0) ? Math.max(0, Math.min(100, (value / maxValue) * 100)) : 100
    fill.style.width = pct + '%'
    bar.appendChild(fill)
    const val = document.createElement('span')
    val.className = 'char-stat-val'
    val.dataset.statField = field
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
    const stats = entry?.character?.stats ?? {}
    const sysDef = SYSTEMS[entry?.character?.system] || null

    if (sysDef) {
        const barDef = sysDef.cardBars.find(b => b.key === field || b.maxKey === field)
        if (barDef) {
            const cur = field === barDef.key ? value : (stats[barDef.key] ?? 0)
            const max = field === barDef.maxKey ? value : (stats[barDef.maxKey] ?? 1)
            const fillEl = card.querySelector(`.${barDef.fillClass}`)
            if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, (cur / max) * 100)) + '%'
            const valEl = card.querySelector(`[data-stat-field="${barDef.key}"]`)
            if (valEl) valEl.textContent = `${cur}/${max}`
        }
        const extraDef = sysDef.cardExtras.find(e => e.key === field)
        if (extraDef) {
            const el = card.querySelector(`[data-stat-field="${field}"]`)
            if (el) el.textContent = `${extraDef.label} ${value}`
        }

        // Condicoes mudam em pleno combate: o card acompanha na hora
        if (field === 'condicoes' && sysDef.cardCondicoes) {
            const row = card.querySelector('[data-stat-field="condicoes"]')
            if (row) {
                preencherCondicoes(row, value)
                card.classList.remove('cond-flash')
                void card.offsetWidth
                card.classList.add('cond-flash')
                setTimeout(() => card.classList.remove('cond-flash'), 900)
            }
        }
    }

    // Indicador de morte
    if (field === 'hp') {
        card.classList.toggle('char-dead', value <= 0)
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

function updateActiveIndicator() {
    document.querySelectorAll('.char-card').forEach(c => c.classList.remove('char-active'))
    if (!state.activeCharacterId) return
    document.querySelectorAll(`.char-card[data-char-id="${state.activeCharacterId}"]`).forEach(card => {
        if (card.dataset.ownerName === state.playerName) card.classList.add('char-active')
    })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Modal de criação / edição ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

let selectedSystem = null
let attrPoints = {}

function openCharModal() {
    state.editCharMode = false
    state.editCharId = null

    document.getElementById('charName').value = ''
    document.getElementById('charPhoto').value = ''
    document.getElementById('photoLabelText').textContent = 'Clique para escolher imagem'
    document.getElementById('photoUploadLabel').classList.remove('has-file')
    document.getElementById('charSubmitBtn').textContent = '⚔ Invocar Personagem'

    const modal = document.getElementById('charModal')
    modal.querySelector('.card-title').textContent = 'Novo Personagem'
    modal.querySelector('.card-subtitle').textContent = 'Forje seu avatar neste mundo'
    modal.style.display = 'flex'

    document.getElementById('charModalInfo').className = 'info-box'
    document.getElementById('charModalInfo').textContent = ''

    document.getElementById('systemSelectorWrap').style.display = ''
    selectedSystem = null
    attrPoints = {}
    renderSystemSelector()
    renderSystemFields()
}

function openEditCharModal(char) {
    state.editCharMode = true
    state.editCharId = char.id

    document.getElementById('charName').value = char.name || ''
    document.getElementById('charPhoto').value = ''

    const hasPhoto = !!char.photo
    document.getElementById('photoLabelText').textContent = hasPhoto ? 'Foto atual (clique para alterar)' : 'Clique para escolher imagem'
    document.getElementById('photoUploadLabel').classList.toggle('has-file', hasPhoto)
    document.getElementById('charSubmitBtn').textContent = '✏ Atualizar Personagem'

    const modal = document.getElementById('charModal')
    modal.querySelector('.card-title').textContent = 'Editar Personagem'
    modal.querySelector('.card-subtitle').textContent = 'Atualize nome e imagem'
    modal.style.display = 'flex'

    document.getElementById('charModalInfo').className = 'info-box'
    document.getElementById('charModalInfo').textContent = ''

    document.getElementById('systemSelectorWrap').style.display = 'none'
    document.getElementById('systemFields').style.display = 'none'
    // A edição só mexe em nome e foto, então o modal volta à largura normal
    modal.querySelector('.connect-card').classList.remove('calico-mode')
}

function closeCharModal() { document.getElementById('charModal').style.display = 'none' }

function showCharModalInfo(msg, type) {
    const el = document.getElementById('charModalInfo')
    el.textContent = msg
    el.className = msg ? `info-box visible ${type}` : 'info-box'
}

function renderSystemSelector() {
    const container = document.getElementById('systemSelector')
    container.innerHTML = ''
    SYSTEM_ORDER.forEach(key => {
        const sys = SYSTEMS[key]
        const btn = document.createElement('button')
        btn.className = 'system-btn' + (selectedSystem === key ? ' active' : '')
        btn.textContent = sys.label
        btn.type = 'button'
        btn.addEventListener('click', () => {
            selectedSystem = key
            attrPoints = {}
            SYSTEMS[key].attributes.forEach(a => { attrPoints[a.key] = 0 })
            if (SYSTEMS[key].module === 'calico') {
                const calicoCreate = require('./calicoCreate')
                calicoCreate.resetForm()
                // Busca perfis/ocupações no Supabase; se falhar, o seed local vale
                calicoCreate.carregarConteudo().then(() => renderSystemFields())
            }
            renderSystemSelector()
            renderSystemFields()
        })
        container.appendChild(btn)
    })
}

function renderSystemFields() {
    const container = document.getElementById('systemFields')
    const card = document.querySelector('#charModal .connect-card')

    container.innerHTML = ''
    if (!selectedSystem) {
        container.style.display = 'none'
        card.classList.remove('calico-mode')
        return
    }
    container.style.display = 'flex'

    const sysDef = SYSTEMS[selectedSystem]

    // Sistemas com criador próprio assumem o container inteiro
    if (sysDef.module === 'calico') {
        card.classList.add('calico-mode')
        require('./calicoCreate').render(container, () => { })
        return
    }
    card.classList.remove('calico-mode')

    const infoEl = document.createElement('div')
    infoEl.className = 'system-info-box'
    const parts = []
    sysDef.popupStats.forEach(ps => {
        const def = sysDef.defaultStats
        if (ps.hasMax) parts.push(`${ps.label.replace(/^.\s/, '')} ${def[ps.key]}/${def[ps.maxKey]}`)
        else if (def[ps.key] != null) parts.push(`${ps.label.replace(/^.\s/, '')} ${def[ps.key]}`)
    })
    if (sysDef.hasDinheiro) parts.push(`💵 $${sysDef.defaultStats.dinheiro}`)
    infoEl.textContent = `Stats iniciais: ${parts.join(' · ')}`
    container.appendChild(infoEl)

    if (sysDef.attributes.length > 0 && sysDef.attributePoints > 0) {
        const totalUsed = Object.values(attrPoints).reduce((a, b) => a + b, 0)
        const remaining = sysDef.attributePoints - totalUsed

        const headerEl = document.createElement('div')
        headerEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;'

        const titleEl = document.createElement('span')
        titleEl.className = 'input-label'
        titleEl.textContent = 'Distribuir Atributos'

        const remainEl = document.createElement('span')
        remainEl.className = 'attr-remaining'
        remainEl.classList.toggle('done', remaining === 0)
        remainEl.textContent = `${remaining} ponto${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}`

        headerEl.appendChild(titleEl)
        headerEl.appendChild(remainEl)
        container.appendChild(headerEl)

        sysDef.attributes.forEach(attr => {
            const row = document.createElement('div')
            row.className = 'attr-row'

            row.appendChild(Object.assign(document.createElement('span'), { className: 'attr-icon', textContent: attr.icon }))
            row.appendChild(Object.assign(document.createElement('span'), { className: 'attr-label', textContent: attr.label }))

            const minusBtn = document.createElement('button')
            minusBtn.type = 'button'; minusBtn.className = 'attr-adj-btn'; minusBtn.textContent = '−'
            minusBtn.disabled = (attrPoints[attr.key] || 0) <= 0
            minusBtn.addEventListener('click', () => { if ((attrPoints[attr.key] || 0) > 0) { attrPoints[attr.key]--; renderSystemFields() } })
            row.appendChild(minusBtn)

            row.appendChild(Object.assign(document.createElement('span'), { className: 'attr-value', textContent: attrPoints[attr.key] || 0 }))

            const plusBtn = document.createElement('button')
            plusBtn.type = 'button'; plusBtn.className = 'attr-adj-btn'; plusBtn.textContent = '+'
            plusBtn.disabled = remaining <= 0
            plusBtn.addEventListener('click', () => {
                const used = Object.values(attrPoints).reduce((a, b) => a + b, 0)
                if (used < sysDef.attributePoints) { attrPoints[attr.key] = (attrPoints[attr.key] || 0) + 1; renderSystemFields() }
            })
            row.appendChild(plusBtn)

            container.appendChild(row)
        })
    }
}

function initCharModal() {
    const charPhotoInput = document.getElementById('charPhoto')
    const photoUploadLabel = document.getElementById('photoUploadLabel')
    const photoLabelText = document.getElementById('photoLabelText')
    const charSubmitBtn = document.getElementById('charSubmitBtn')

    document.getElementById('charModalClose')?.addEventListener('click', closeCharModal)
    document.getElementById('charModal').addEventListener('click', e => {
        if (e.target === document.getElementById('charModal')) closeCharModal()
    })

    charPhotoInput.addEventListener('change', () => {
        const file = charPhotoInput.files[0]
        if (file) { photoLabelText.textContent = file.name; photoUploadLabel.classList.add('has-file') }
        else { photoLabelText.textContent = 'Clique para escolher imagem'; photoUploadLabel.classList.remove('has-file') }
    })

    charSubmitBtn.addEventListener('click', async () => {
        const name = document.getElementById('charName').value.trim()
        const photoFile = charPhotoInput.files[0] || null

        if (!name) { showCharModalInfo('O nome do personagem é obrigatório.', 'error'); return }

        if (!state.editCharMode) {
            if (!selectedSystem) { showCharModalInfo('Escolha um sistema de jogo.', 'error'); return }
            const sysDef = SYSTEMS[selectedSystem]

            // Sistemas com criador próprio validam sozinhos (spec §12, P0:
            // não deixa salvar ficha inválida)
            if (sysDef.module === 'calico') {
                const v = require('./calicoCreate').validar(name)
                if (!v.valido) {
                    const msgs = v.erros.length ? v.erros : v.avisos
                    showCharModalInfo(msgs.slice(0, 3).join('\n'), 'error')
                    return
                }
            } else if (sysDef.attributePoints > 0) {
                const totalUsed = Object.values(attrPoints).reduce((a, b) => a + b, 0)
                if (totalUsed !== sysDef.attributePoints) {
                    showCharModalInfo(`Distribua todos os ${sysDef.attributePoints} pontos de atributo.`, 'error')
                    return
                }
            }
        }

        charSubmitBtn.disabled = true
        charSubmitBtn.textContent = state.editCharMode ? 'Atualizando...' : 'Invocando...'

        try {
            if (state.editCharMode) await handleEditChar(name, photoFile)
            else await handleCreateChar(name, photoFile)
        } catch (e) {
            console.error('[Characters] Erro:', e)
            showCharModalInfo(`Erro: ${e.message}`, 'error')
        } finally {
            charSubmitBtn.disabled = false
            charSubmitBtn.textContent = state.editCharMode ? '✏ Atualizar Personagem' : '⚔ Invocar Personagem'
        }
    })
}

async function handleCreateChar(name, photoFile) {
    const charId = crypto.randomUUID()
    // Idem na criação: falhou o upload, o jogador precisa saber por quê
    const photoUrl = photoFile ? await uploadCharPhoto(charId, photoFile) : null

    const sysDef = SYSTEMS[selectedSystem]
    let stats
    let itensIniciais = null

    if (sysDef.module === 'calico') {
        const calicoCreate = require('./calicoCreate')
        stats = calicoCreate.montarStats()
        itensIniciais = calicoCreate.itensIniciais()
    } else {
        stats = { ...sysDef.defaultStats }
        // Garante que habilidades seja um array novo (não referência do default)
        if (Array.isArray(sysDef.defaultStats.habilidades)) stats.habilidades = []
        sysDef.attributes.forEach(attr => { stats[attr.key] = attrPoints[attr.key] || 0 })
    }

    const { data: newChar, error } = await state.supabase
        .from('characters')
        .insert({ id: charId, user_id: state.currentUserId, name, photo: photoUrl, system: selectedSystem, stats })
        .select().single()
    if (error) throw new Error(error.message)

    state.playerCharacters.push(newChar)
    if (!state.activeCharacterId) state.activeCharacterId = newChar.id
    closeCharModal()
    emitCharacters()

    if (itensIniciais) seedInventarioInicial(charId, itensIniciais)
}

/**
 * Best-effort: dá ao personagem novo o equipamento inicial do Calico (§6.3).
 * Depende de os itens existirem no catálogo `items` — o seed SQL da campanha os
 * cria. Se não estiverem lá, o mestre entrega na mão e nada quebra aqui.
 */
async function seedInventarioInicial(charId, nomes) {
    if (!state.supabase || !nomes || nomes.length === 0) return
    try {
        const { data: itens, error } = await state.supabase
            .from('items').select('id, name').in('name', nomes)
        if (error || !itens || itens.length === 0) {
            console.log('[Calico] Catálogo de itens iniciais não encontrado; equipamento entra manualmente.')
            return
        }
        const linhas = itens.map(i => ({ character_id: charId, item_id: i.id, quantity: 1 }))
        const { error: insErr } = await state.supabase.from('inventory').insert(linhas)
        if (insErr) { console.warn('[Calico] Falha ao dar equipamento inicial:', insErr.message); return }
        console.log(`[Calico] ${linhas.length} item(ns) inicial(is) entregues ao personagem.`)
    } catch (e) {
        console.warn('[Calico] seedInventarioInicial:', e.message)
    }
}

async function handleEditChar(name, photoFile) {
    const charId = state.editCharId
    const existing = state.playerCharacters.find(c => c.id === charId)
    if (!existing) throw new Error('Personagem não encontrado')

    // Se o upload falhar, o erro sobe e o modal mostra o motivo — nada de dizer
    // que atualizou mantendo a foto antiga
    let photoUrl = existing.photo
    if (photoFile) photoUrl = await uploadCharPhoto(charId, photoFile)

    const updates = { name, photo: photoUrl }
    const { error } = await state.supabase.from('characters').update(updates).eq('id', charId)
    if (error) throw new Error(error.message)

    existing.name = name
    existing.photo = photoUrl
    closeCharModal()
    emitCharacters()
}

/**
 * Sobe a foto para o bucket e devolve a URL pública.
 *
 * ATENÇÃO: esta função PROPAGA o erro de propósito.
 *
 * Antes ela engolia a falha e devolvia null, e quem chamava simplesmente
 * mantinha a foto antiga — a tela dizia "Personagem atualizado" e nada mudava.
 * Era isso que parecia "a troca de foto não funciona para quem não é mestre":
 * o upload falhava na policy do Storage e ninguém ficava sabendo.
 */
async function uploadCharPhoto(charId, photoFile) {
    const ext = (photoFile.name.split('.').pop() || 'png').toLowerCase()
    // O primeiro nível da pasta é o id do usuário: é nisso que a policy do
    // Storage se apoia para deixar cada um escrever só na sua pasta.
    const filePath = `${state.currentUserId}/${charId}/photo.${ext}`
    const mimeType = photoFile.type || `image/${ext}`
    const buffer = await photoFile.arrayBuffer()

    const { error } = await state.supabase.storage
        .from('CharactersAndItems')
        .upload(filePath, buffer, { contentType: mimeType, upsert: true })

    if (error) {
        console.error('[Photo] Falha no upload:', error)
        throw new Error(traduzErroDeUpload(error))
    }

    const { data: urlData } = state.supabase.storage.from('CharactersAndItems').getPublicUrl(filePath)
    if (!urlData?.publicUrl) throw new Error('O upload foi feito, mas o bucket não devolveu uma URL pública.')

    // Quebra o cache do navegador: o caminho é sempre o mesmo (upsert), então
    // sem isto a imagem trocada continuaria aparecendo com a versão antiga.
    return `${urlData.publicUrl}?v=${Date.now()}`
}

/** Transforma o erro do Storage em algo que o jogador entenda e você consiga agir. */
function traduzErroDeUpload(error) {
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('row-level security') || msg.includes('unauthorized') || error.statusCode === '403') {
        return 'Sem permissão para salvar a imagem no servidor.\nO mestre precisa rodar sql/storage/fotos.sql no Supabase.'
    }
    if (msg.includes('already exists')) {
        return 'Já existe uma imagem nesse caminho e a conta não tem permissão para substituí-la.\nFalta a policy de UPDATE no bucket — ver sql/storage/fotos.sql.'
    }
    if (msg.includes('bucket not found')) {
        return 'O bucket "CharactersAndItems" não existe neste projeto do Supabase.'
    }
    if (msg.includes('payload too large') || msg.includes('maximum allowed size')) {
        return 'Imagem grande demais para o limite do bucket. Tente uma menor.'
    }
    return `Erro ao enviar a imagem: ${error.message || 'desconhecido'}`
}

module.exports = {
    loadAndShareCharacters, emitCharacters, renderCharacterBar,
    updateCardStat, flashCard, updateActiveIndicator,
    openCharModal, openEditCharModal, initCharModal
}
