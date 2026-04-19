// ══════════════════════════════════════════════════════════════════════════════
// src/journal.js — Jornal de Missões
// O mestre cadastra missões, os players consultam no jornal.
// O mestre pode exibir/ocultar o objetivo atual na tela de todos.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')

let journalOpen = false
let objectiveBannerVisible = false

// ── Carregar missões do Supabase ──────────────────────────────────────────────
async function loadMissions() {
    if (!state.supabase || !state.currentRoomCode) return
    try {
        const { data, error } = await state.supabase
            .from('missions')
            .select('*')
            .eq('room_code', state.currentRoomCode)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })
        if (error) { console.warn('[Journal] Erro ao carregar missões:', error.message); return }
        state.missions = data || []
        renderMissions()
    } catch (e) { console.error('[Journal] loadMissions:', e) }
}

// ── Salvar missão no Supabase ─────────────────────────────────────────────────
async function addMission(objective) {
    if (!state.supabase || !state.currentRoomCode || !objective.trim()) return
    try {
        const newMission = {
            room_code: state.currentRoomCode,
            objective: objective.trim(),
            status: 'in_progress',
            show_objective: false,
            sort_order: state.missions.length
        }
        const { data, error } = await state.supabase
            .from('missions')
            .insert(newMission)
            .select()
            .single()
        if (error) { console.warn('[Journal] Erro ao adicionar missão:', error.message); return }
        state.missions.push(data)
        renderMissions()
        // Notifica todos na sala
        if (state.socket) {
            state.socket.emit('missions_sync', { missions: state.missions })
        }
    } catch (e) { console.error('[Journal] addMission:', e) }
}

// ── Atualizar status da missão ────────────────────────────────────────────────
async function updateMissionStatus(missionId, newStatus) {
    if (!state.supabase) return
    try {
        const { error } = await state.supabase
            .from('missions')
            .update({ status: newStatus })
            .eq('id', missionId)
        if (error) { console.warn('[Journal] Erro ao atualizar:', error.message); return }
        const mission = state.missions.find(m => m.id === missionId)
        if (mission) mission.status = newStatus
        renderMissions()
        if (state.socket) state.socket.emit('missions_sync', { missions: state.missions })
    } catch (e) { console.error('[Journal] updateMissionStatus:', e) }
}

// ── Deletar missão ────────────────────────────────────────────────────────────
async function deleteMission(missionId) {
    if (!state.supabase) return
    try {
        const { error } = await state.supabase
            .from('missions')
            .delete()
            .eq('id', missionId)
        if (error) { console.warn('[Journal] Erro ao deletar:', error.message); return }
        state.missions = state.missions.filter(m => m.id !== missionId)
        renderMissions()
        if (state.socket) state.socket.emit('missions_sync', { missions: state.missions })
    } catch (e) { console.error('[Journal] deleteMission:', e) }
}

// ── Toggle exibição do objetivo na tela ───────────────────────────────────────
function toggleObjectiveBanner() {
    objectiveBannerVisible = !objectiveBannerVisible
    const toggleBtn = document.getElementById('missionObjectiveToggle')

    if (objectiveBannerVisible) {
        // Pega a primeira missão em progresso como "objetivo atual"
        const current = state.missions.find(m => m.status === 'in_progress')
        if (!current) {
            objectiveBannerVisible = false
            return
        }
        if (toggleBtn) toggleBtn.classList.add('active')
        // Emite para todos
        if (state.socket) {
            state.socket.emit('mission_objective_show', { objective: current.objective })
        }
    } else {
        if (toggleBtn) toggleBtn.classList.remove('active')
        if (state.socket) {
            state.socket.emit('mission_objective_hide')
        }
    }
}

// ── Mostrar banner do objetivo (chamado pelo socket em todos) ─────────────────
function showObjectiveBanner(objective) {
    const banner = document.getElementById('missionObjectiveBanner')
    if (!banner) return
    banner.querySelector('.objective-text').textContent = objective
    banner.classList.add('visible')
    banner.style.display = 'block'
    // Força reflow para animação
    requestAnimationFrame(() => { banner.style.opacity = '1' })
}

function hideObjectiveBanner() {
    const banner = document.getElementById('missionObjectiveBanner')
    if (!banner) return
    banner.style.opacity = '0'
    setTimeout(() => {
        banner.classList.remove('visible')
        banner.style.display = 'none'
    }, 400)
    const toggleBtn = document.getElementById('missionObjectiveToggle')
    if (toggleBtn) toggleBtn.classList.remove('active')
    objectiveBannerVisible = false
}

// ── Renderizar missões no painel ──────────────────────────────────────────────
function renderMissions() {
    const body = document.getElementById('journalBody')
    if (!body) return

    if (!state.missions || state.missions.length === 0) {
        body.innerHTML = `
            <div class="journal-empty">
                <span class="journal-empty-icon">📜</span>
                Nenhuma missão registrada.<br>
                ${state.isRoomMaster ? 'Adicione missões abaixo.' : 'O mestre ainda não registrou missões.'}
            </div>`
        return
    }

    const inProgress = state.missions.filter(m => m.status === 'in_progress')
    const completed = state.missions.filter(m => m.status === 'completed')

    let html = ''

    if (inProgress.length > 0) {
        inProgress.forEach(m => { html += buildMissionItem(m) })
    }

    if (completed.length > 0) {
        if (inProgress.length > 0) {
            html += '<div class="journal-divider">· · · · ·</div>'
        }
        completed.forEach(m => { html += buildMissionItem(m) })
    }

    body.innerHTML = html

    // Bind eventos dos botões do mestre
    if (state.isRoomMaster) {
        body.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action
                const id = btn.dataset.id
                if (action === 'complete') updateMissionStatus(id, 'completed')
                else if (action === 'reopen') updateMissionStatus(id, 'in_progress')
                else if (action === 'delete') deleteMission(id)
            })
        })
    }
}

function buildMissionItem(mission) {
    const isCompleted = mission.status === 'completed'
    const statusClass = isCompleted ? 'completed' : 'in-progress'
    const statusLabel = isCompleted ? 'Concluída' : 'Em Progresso'
    const statusIcon = isCompleted ? '✓' : '◆'

    let masterBtns = ''
    if (state.isRoomMaster) {
        const toggleBtn = isCompleted
            ? `<button class="mission-ctrl-btn" data-action="reopen" data-id="${mission.id}">↺ Reabrir</button>`
            : `<button class="mission-ctrl-btn" data-action="complete" data-id="${mission.id}">✓ Concluir</button>`
        masterBtns = `
            <div class="mission-master-controls">
                ${toggleBtn}
                <button class="mission-ctrl-btn delete" data-action="delete" data-id="${mission.id}">✕ Remover</button>
            </div>`
    }

    return `
        <div class="mission-item ${isCompleted ? 'completed' : ''}">
            <div class="mission-status ${statusClass}">
                <span class="mission-status-dot"></span>
                ${statusIcon} ${statusLabel}
            </div>
            <div class="mission-objective">${escapeHtml(mission.objective)}</div>
            ${masterBtns}
        </div>`
}

function escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
}

// ── Abrir/fechar jornal ───────────────────────────────────────────────────────
function openJournal() {
    const overlay = document.getElementById('journalOverlay')
    if (!overlay) return
    journalOpen = true
    overlay.style.display = 'flex'
    requestAnimationFrame(() => { overlay.classList.add('open') })
    loadMissions()

    // Mostra rodapé do mestre
    const footer = document.getElementById('journalFooterMaster')
    if (footer) {
        footer.classList.toggle('visible', state.isRoomMaster)
    }

    // Remove indicador de nova missão
    const btn = document.getElementById('journalToggle')
    if (btn) btn.classList.remove('has-new')
}

function closeJournal() {
    const overlay = document.getElementById('journalOverlay')
    if (!overlay) return
    journalOpen = false
    overlay.classList.remove('open')
    setTimeout(() => { overlay.style.display = 'none' }, 300)
}

// ── Receber sync de missões (chamado pelo socket) ─────────────────────────────
function handleMissionsSync(missions) {
    state.missions = missions || []
    renderMissions()
    // Pisca o botão do jornal se não estiver aberto
    if (!journalOpen) {
        const btn = document.getElementById('journalToggle')
        if (btn) btn.classList.add('has-new')
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initJournal() {
    const toggleBtn = document.getElementById('journalToggle')
    const closeBtn = document.getElementById('journalCloseBtn')
    const overlay = document.getElementById('journalOverlay')
    const addBtn = document.getElementById('journalAddBtn')
    const addInput = document.getElementById('journalAddInput')
    const objToggle = document.getElementById('missionObjectiveToggle')

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            journalOpen ? closeJournal() : openJournal()
        })
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeJournal)
    }

    // Clique fora do livro fecha
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeJournal()
        })
    }

    // Atalho de teclado: J
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement.tagName
        if (['INPUT', 'TEXTAREA'].includes(tag)) return
        if (e.key === 'j' || e.key === 'J') {
            journalOpen ? closeJournal() : openJournal()
        }
    })

    // Adicionar missão (mestre)
    if (addBtn && addInput) {
        addBtn.addEventListener('click', () => {
            const text = addInput.value.trim()
            if (text) {
                addMission(text)
                addInput.value = ''
            }
        })
        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { addBtn.click() }
            e.stopPropagation() // Não dispara atalhos globais
        })
    }

    // Botão do mestre para mostrar/ocultar objetivo
    if (objToggle) {
        objToggle.addEventListener('click', toggleObjectiveBanner)
    }
}

// Mostra os botões do jornal (chamado quando entra na sala)
function showJournalButtons() {
    const journalBtn = document.getElementById('journalToggle')
    if (journalBtn) {
        journalBtn.style.display = 'flex'
    }
    // Botão de objetivo só pro mestre
    const objBtn = document.getElementById('missionObjectiveToggle')
    if (objBtn) {
        objBtn.style.display = state.isRoomMaster ? 'flex' : 'none'
    }
    // Carrega missões iniciais
    loadMissions()
}

// Esconde botões do jornal (chamado ao sair da sala)
function hideJournalButtons() {
    const journalBtn = document.getElementById('journalToggle')
    if (journalBtn) journalBtn.style.display = 'none'
    const objBtn = document.getElementById('missionObjectiveToggle')
    if (objBtn) objBtn.style.display = 'none'
    hideObjectiveBanner()
    closeJournal()
}

module.exports = {
    initJournal,
    showJournalButtons,
    hideJournalButtons,
    handleMissionsSync,
    showObjectiveBanner,
    hideObjectiveBanner,
    loadMissions
}
