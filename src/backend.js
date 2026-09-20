// ══════════════════════════════════════════════════════════════════════════════
// src/backend.js — ONDE A SALA É HOSPEDADA
//
// Dois modos, escolhidos na tela de criar sala:
//
//   ngrok — o servidor roda dentro deste app e é exposto por um túnel. É como
//           sempre funcionou. Grátis, porém com 1 GB/mês de tráfego e uma URL
//           nova a cada sessão.
//
//   vps   — o servidor roda na sua máquina alugada, sempre no ar. A URL é fixa,
//           não tem franquia de banda, e o seu PC pode até fechar o app que a
//           sala continua de pé.
//
// A escolha e o endereço da VPS ficam no localStorage: são preferência de
// máquina, não de conta — quem hospeda é este computador.
//
// O masterToken também mora aqui. É a prova de que este app é o dono da sala;
// sem ele, num servidor permanente, qualquer jogador que conectasse primeiro
// viraria mestre.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')

const CHAVE_MODO = 'backendMode'
const CHAVE_URL = 'vpsUrl'
const CHAVE_TOKEN = 'masterToken:'   // + código da sala

const MODOS = ['ngrok', 'vps']

// ── Persistência ──────────────────────────────────────────────────────────────
function ler(chave, padrao) {
    try { return localStorage.getItem(chave) ?? padrao } catch (e) { return padrao }
}
function gravar(chave, valor) {
    try { localStorage.setItem(chave, valor) } catch (e) { /* sem storage, segue em memória */ }
}

function carregarPreferencias() {
    const modo = ler(CHAVE_MODO, 'ngrok')
    state.backendMode = MODOS.includes(modo) ? modo : 'ngrok'
    state.vpsUrl = ler(CHAVE_URL, '')
}

/**
 * Normaliza o que o mestre digitou. Aceita "1.2.3.4", "1.2.3.4:3001",
 * "http://host:3001/" e devolve sempre algo conectável, sem barra no fim.
 */
function normalizarUrl(bruto) {
    let u = (bruto || '').trim()
    if (!u) return ''
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u
    u = u.replace(/\/+$/, '')
    // Sem porta explícita e sem TLS: assume a porta padrão do projeto
    try {
        const parsed = new URL(u)
        if (!parsed.port && parsed.protocol === 'http:') parsed.port = '3001'
        return parsed.origin
    } catch (e) {
        return u
    }
}

function definirModo(modo) {
    if (!MODOS.includes(modo)) return
    state.backendMode = modo
    gravar(CHAVE_MODO, modo)
    renderizar()
}

function definirUrl(bruto) {
    state.vpsUrl = normalizarUrl(bruto)
    gravar(CHAVE_URL, state.vpsUrl)
}

// ── Token de mestre, por sala ─────────────────────────────────────────────────
function guardarToken(roomCode, token) {
    state.masterToken = token || null
    if (roomCode && token) gravar(CHAVE_TOKEN + roomCode.toUpperCase(), token)
}

function recuperarToken(roomCode) {
    if (!roomCode) return null
    return ler(CHAVE_TOKEN + roomCode.toUpperCase(), null)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Registro da sala no servidor ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Avisa o servidor que esta sala existe e que ESTE app é o dono.
 * Devolve o masterToken, que vai no handshake do socket.
 *
 * Reentrante: registrar a mesma sala com o mesmo dono devolve o mesmo token,
 * então reabrir o app depois de uma queda recupera o posto de mestre.
 */
async function registrarSala(urlServidor, roomCode, ownerId) {
    const resp = await fetch(`${urlServidor}/register-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ code: roomCode, url: urlServidor, ownerId: ownerId || null }),
    })

    if (!resp.ok) {
        let detalhe = `HTTP ${resp.status}`
        try { detalhe = (await resp.json()).error || detalhe } catch (e) { }
        throw new Error(detalhe)
    }

    const { masterToken } = await resp.json()
    guardarToken(roomCode, masterToken)
    return masterToken
}

/** Confere se a VPS está no ar antes de tentar criar a sala lá. */
async function testarServidor(url, timeoutMs = 6000) {
    const alvo = normalizarUrl(url)
    if (!alvo) return { ok: false, erro: 'Informe o endereço do servidor.' }

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
        const r = await fetch(`${alvo}/health`, { signal: ctrl.signal })
        if (!r.ok) return { ok: false, erro: `O servidor respondeu HTTP ${r.status}.` }
        const info = await r.json()
        return { ok: true, info, url: alvo }
    } catch (e) {
        const motivo = e.name === 'AbortError'
            ? 'não respondeu a tempo'
            : 'não deu para alcançar'

        // Mostra o endereço EXATO que foi tentado. Sem isto, quem digitasse só
        // o host não veria que a porta 3001 foi completada automaticamente — e
        // quem roda o container noutra porta ficaria sem entender a falha.
        const { port } = (() => { try { return new URL(alvo) } catch (x) { return {} } })()
        const dicaPorta = port
            ? `\nA porta usada foi a ${port}. Se o seu container publica outra, informe-a no endereço.`
            : ''

        return {
            ok: false,
            erro: `Não consegui alcançar ${alvo}/health — ${motivo}.${dicaPorta}`
                + '\nConfira se o serviço está rodando e se a porta está liberada no firewall.',
        }
    } finally {
        clearTimeout(t)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Interface ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function initBackend() {
    carregarPreferencias()

    const btnNgrok = document.getElementById('backendNgrok')
    const btnVps = document.getElementById('backendVps')
    const input = document.getElementById('vpsUrlInput')
    if (!btnNgrok || !btnVps || !input) return

    btnNgrok.addEventListener('click', () => definirModo('ngrok'))
    btnVps.addEventListener('click', () => definirModo('vps'))

    input.value = state.vpsUrl
    input.addEventListener('change', () => {
        definirUrl(input.value)
        input.value = state.vpsUrl
        if (state.vpsUrl) verificarEExibir()
    })
    input.addEventListener('keydown', e => {
        e.stopPropagation()
        if (e.key === 'Enter') input.blur()
    })

    renderizar()
    // Se já havia um endereço salvo, confere em segundo plano
    if (state.backendMode === 'vps' && state.vpsUrl) verificarEExibir()
}

function renderizar() {
    const btnNgrok = document.getElementById('backendNgrok')
    const btnVps = document.getElementById('backendVps')
    const wrap = document.getElementById('vpsUrlWrap')
    if (!btnNgrok || !btnVps) return

    btnNgrok.classList.toggle('ativo', state.backendMode === 'ngrok')
    btnVps.classList.toggle('ativo', state.backendMode === 'vps')
    if (wrap) wrap.style.display = state.backendMode === 'vps' ? 'block' : 'none'
}

function status(msg, tipo) {
    const el = document.getElementById('vpsStatus')
    if (!el) return
    el.textContent = msg
    el.className = 'backend-hint' + (tipo ? ' ' + tipo : '')
}

async function verificarEExibir() {
    status('Procurando o servidor…', '')
    const r = await testarServidor(state.vpsUrl)
    if (r.ok) {
        const n = r.info && r.info.salas
        status(`Servidor no ar${typeof n === 'number' ? ` · ${n} sala(s) ativa(s)` : ''}.`, 'ok')
    } else {
        status(r.erro, 'erro')
    }
}

module.exports = {
    initBackend, carregarPreferencias, normalizarUrl, definirModo, definirUrl,
    registrarSala, testarServidor, guardarToken, recuperarToken, verificarEExibir,
}
