// ══════════════════════════════════════════════════════════════════════════════
// src/dndBolsa.js — BOLSA DO GRUPO (D&D)
//
// Decidido com o mestre (2026-11-03): o dinheiro é do grupo todo e aparece num
// lugar só da sala. O servidor guarda a bolsa da sala (bolsa_*, em
// server/handlers.js); quem guarda entre sessões é o app do MESTRE, na tabela
// dnd_bolsas do Supabase (sql/dnd/03_itens_bolsa.sql), com o localStorage de
// reserva. Ao abrir a sala, o mestre traz a bolsa dele.
//
// O ouro inicial de cada personagem (o da algibeira do antecedente, ou o ouro
// inicial no lugar do pacote) entra na bolsa uma vez, quando ele chega à mesa.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')

const MOEDAS = [['pl', 'platina'], ['po', 'ouro'], ['pe', 'electro'], ['pp', 'prata'], ['pc', 'cobre']]
const CHAVE_LOCAL = 'dndBolsa'

let bolsa = null         // { moedas, historico } que o servidor mandou
let suportada = false    // o servidor da sala conhece a bolsa
let salvarTimer = null

function noDnd() {
    return state.roomSystem === 'dnd'
}

/** "125 po · 4 pp" — só as moedas que existem. */
function resumo(m) {
    if (!m) return '—'
    const partes = MOEDAS.filter(([k]) => m[k]).map(([k]) => `${m[k].toLocaleString('pt-BR')} ${k}`)
    return partes.length ? partes.join(' · ') : 'vazia'
}

// ── Estado vindo do servidor ──────────────────────────────────────────────────

function aoEstado(b) {
    bolsa = b
    suportada = true
    desenharBotao()
    if (document.getElementById('dndBolsaPainel')) desenharPainel()
    if (!b) { if (state.isRoomMaster && noDnd()) carregarDoMestre(); return }
    if (state.isRoomMaster) agendarSalvar()
    entregarMoedasIniciais()
}

/** O app virou mestre depois de a bolsa chegar vazia: traz a guardada. */
function aoMestre() {
    if (suportada && !bolsa && state.isRoomMaster && noDnd()) carregarDoMestre()
    desenharBotao()
}

async function carregarDoMestre() {
    let guardada = null
    if (state.supabase && state.currentUserId) {
        const { data, error } = await state.supabase.from('dnd_bolsas').select('moedas, historico').eq('dono', state.currentUserId).maybeSingle()
        if (!error && data) guardada = data
    }
    if (!guardada) {
        try { guardada = JSON.parse(localStorage.getItem(CHAVE_LOCAL) || 'null') } catch (e) { guardada = null }
    }
    if (state.socket) state.socket.emit('bolsa_definir', guardada || { moedas: {}, historico: [] })
}

function agendarSalvar() {
    clearTimeout(salvarTimer)
    salvarTimer = setTimeout(async () => {
        if (!bolsa) return
        const dados = { moedas: bolsa.moedas, historico: bolsa.historico || [] }
        try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(dados)) } catch (e) { /* sem espaço: segue */ }
        if (state.supabase && state.currentUserId) {
            const { error } = await state.supabase.from('dnd_bolsas').upsert({ dono: state.currentUserId, ...dados, atualizado_em: new Date().toISOString() })
            if (error) console.warn('[Bolsa] Supabase:', error.message)
        }
    }, 800)
}

// ── Mudanças ──────────────────────────────────────────────────────────────────

function mudar(moeda, qtd, motivo) {
    if (!state.socket || !qtd) return false
    if (!suportada) { aviso('O servidor desta sala ainda não tem a bolsa do grupo. Atualize o servidor da VPS.'); return false }
    state.socket.emit('bolsa_mudar', { moeda, qtd, motivo, quem: state.playerName })
    return true
}

/** Cobra um preço em po (pode ser fração: 0,2 po = 2 pp). */
function cobrar(po, motivo) {
    if (!po) return
    if (Number.isInteger(po)) mudar('po', -po, motivo)
    else if (Number.isInteger(Math.round(po * 10 * 1000) / 1000)) mudar('pp', -Math.round(po * 10), motivo)
    else mudar('pc', -Math.round(po * 100), motivo)
}

/** O ouro inicial dos meus personagens entra na bolsa, uma vez. */
function entregarMoedasIniciais() {
    if (!suportada || !noDnd() || !state.socket) return
    state.playerCharacters.filter(c => c.system === 'dnd').forEach(c => {
        const st = c.stats || {}
        const moedas = st.moedas_iniciais
        if (!moedas || st.moedas_entregues) return
        if (!state.allCharsCache.some(e => e.character.id === c.id)) return   // só quem está na mesa
        Object.entries(moedas).forEach(([k, n]) => { if (n > 0) mudar(k, n, `ouro inicial de ${c.name}`) })
        require('./dndSheet').gravar(c.id, { moedas_entregues: true })
    })
}

// ── Tela ──────────────────────────────────────────────────────────────────────

function desenharBotao() {
    let b = document.getElementById('dndBolsaBtn')
    if (!noDnd() || !state.socket) { if (b) b.remove(); return }
    if (!b) {
        b = document.createElement('button')
        b.id = 'dndBolsaBtn'
        b.type = 'button'
        b.addEventListener('click', e => {
            e.stopPropagation()
            const p = document.getElementById('dndBolsaPainel')
            if (p) p.remove()
            else desenharPainel()
        })
        document.body.appendChild(b)
    }
    const po = bolsa ? bolsa.moedas.po : 0
    b.textContent = `💰 ${bolsa ? `${po.toLocaleString('pt-BR')} po` : '—'}`
    b.title = bolsa ? `Bolsa do grupo: ${resumo(bolsa.moedas)}` : 'Bolsa do grupo'
}

function desenharPainel() {
    let p = document.getElementById('dndBolsaPainel')
    if (!p) {
        p = document.createElement('div')
        p.id = 'dndBolsaPainel'
        p.setAttribute('role', 'dialog')
        p.setAttribute('aria-label', 'Bolsa do grupo')
        p.addEventListener('click', e => e.stopPropagation())
        document.body.appendChild(p)
    }
    p.innerHTML = ''
    const cab = mk('div', 'db-cab')
    cab.appendChild(mk('b', null, '💰 Bolsa do grupo'))
    const fechar = mk('button', 'subpanel-close', '✕')
    fechar.setAttribute('aria-label', 'Fechar')
    fechar.addEventListener('click', () => p.remove())
    cab.appendChild(fechar)
    p.appendChild(cab)

    if (!suportada) {
        p.appendChild(mk('div', 'ds-legenda', 'O servidor desta sala ainda não tem a bolsa do grupo. Atualize o servidor da VPS.'))
        return
    }
    const moedas = (bolsa && bolsa.moedas) || {}
    const grade = mk('div', 'db-moedas')
    MOEDAS.forEach(([k, nome]) => {
        const m = mk('div', 'db-moeda' + (moedas[k] ? '' : ' zero'))
        m.appendChild(mk('b', null, (moedas[k] || 0).toLocaleString('pt-BR')))
        m.appendChild(mk('span', null, `${k} · ${nome}`))
        grade.appendChild(m)
    })
    p.appendChild(grade)

    // Pôr ou tirar
    const form = mk('div', 'db-form')
    const qtd = document.createElement('input')
    qtd.type = 'number'
    qtd.min = '1'
    qtd.value = '1'
    qtd.className = 'room-input'
    qtd.setAttribute('aria-label', 'Quantidade')
    qtd.addEventListener('keydown', e => e.stopPropagation())
    const moeda = document.createElement('select')
    moeda.className = 'dc-select'
    moeda.setAttribute('aria-label', 'Moeda')
    MOEDAS.forEach(([k, nome]) => moeda.appendChild(new Option(`${k} (${nome})`, k)))
    moeda.value = 'po'
    const motivo = document.createElement('input')
    motivo.className = 'room-input'
    motivo.placeholder = 'Motivo (opcional)'
    motivo.setAttribute('aria-label', 'Motivo')
    motivo.maxLength = 80
    motivo.addEventListener('keydown', e => e.stopPropagation())
    const erro = mk('div', 'da-alerta')
    erro.setAttribute('role', 'alert')
    erro.id = 'dndBolsaErro'
    const n = () => Math.max(1, parseInt(qtd.value, 10) || 1)
    const por = mk('button', 'ds-magia-btn principal', '+ Pôr')
    por.addEventListener('click', () => { erro.textContent = ''; mudar(moeda.value, n(), motivo.value.trim()) })
    const tirar = mk('button', 'ds-magia-btn', '− Gastar')
    tirar.title = 'Se faltar a moeda escolhida, o app troca as outras'
    tirar.addEventListener('click', () => { erro.textContent = ''; mudar(moeda.value, -n(), motivo.value.trim()) })
    form.appendChild(qtd)
    form.appendChild(moeda)
    form.appendChild(motivo)
    form.appendChild(por)
    form.appendChild(tirar)
    p.appendChild(form)
    p.appendChild(erro)

    const hist = (bolsa && bolsa.historico) || []
    if (hist.length) {
        p.appendChild(mk('div', 'ds-grupo', 'Últimas mudanças'))
        const lista = mk('div', 'db-hist')
        hist.slice().reverse().forEach(h => lista.appendChild(mk('div', null, `${h.quem}: ${h.texto}`)))
        p.appendChild(lista)
    }
}

function aoErro({ texto }) {
    const el = document.getElementById('dndBolsaErro')
    if (el) el.textContent = texto
    else aviso(texto)
}

function aviso(texto) {
    try { require('./dndCombate').perguntar({ titulo: '💰 Bolsa do grupo', texto, opcoes: [] }) } catch (e) { console.warn('[Bolsa]', texto) }
}

function limpar() {
    bolsa = null
    suportada = false
    ;['dndBolsaBtn', 'dndBolsaPainel'].forEach(id => { const el = document.getElementById(id); if (el) el.remove() })
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = { aoEstado, aoMestre, aoErro, desenharBotao, mudar, cobrar, entregarMoedasIniciais, limpar, resumo }
