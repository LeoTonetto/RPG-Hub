// ══════════════════════════════════════════════════════════════════════════════
// src/config.js — PREFERÊNCIAS DO JOGADOR
//
// Duas coisas, por enquanto:
//   • cor do cursor — cada jogador escolhe a sua; os outros veem essa cor
//   • opacidade do véu — o escurecido que fica por cima da cena de fundo
//
// Ambas ficam em `profiles` no Supabase, para acompanhar a conta em qualquer
// máquina, com localStorage como espelho local. Se as colunas ainda não
// existirem no banco (sql/perfil/preferencias.sql), tudo continua funcionando
// só com o localStorage — a preferência apenas não viaja entre computadores.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')

// Paleta sugerida: tons distinguíveis entre si sobre fundo escuro, e que não
// brigam com o dourado da interface.
const CORES_CURSOR = [
    { hex: '#c9a84c', nome: 'Ouro' },
    { hex: '#e05a52', nome: 'Sangue' },
    { hex: '#d4622a', nome: 'Brasa' },
    { hex: '#6ba368', nome: 'Musgo' },
    { hex: '#4aa3c4', nome: 'Gelo' },
    { hex: '#7d5ba6', nome: 'Vela' },
    { hex: '#d98cb3', nome: 'Rosa' },
    { hex: '#e8d9a0', nome: 'Osso' },
    { hex: '#8a8f98', nome: 'Chumbo' },
    { hex: '#3f7d5a', nome: 'Pinho' },
]

const COR_PADRAO = '#c9a84c'
const VEU_PADRAO = 1          // 1 = o escurecido original; 0 = cena limpa

const CHAVE_COR = 'cursorColor'
const CHAVE_VEU = 'veuOpacidade'

let painelAberto = false

// ══════════════════════════════════════════════════════════════════════════════
// ── Leitura e escrita das preferências ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function lerLocal() {
    try {
        return {
            cor: localStorage.getItem(CHAVE_COR) || COR_PADRAO,
            veu: parseFloat(localStorage.getItem(CHAVE_VEU) ?? VEU_PADRAO),
        }
    } catch (e) {
        return { cor: COR_PADRAO, veu: VEU_PADRAO }
    }
}

function gravarLocal(cor, veu) {
    try {
        localStorage.setItem(CHAVE_COR, cor)
        localStorage.setItem(CHAVE_VEU, String(veu))
    } catch (e) { /* modo privado, sem storage — segue com o valor em memória */ }
}

/**
 * Carrega as preferências do perfil. Chamado depois do login, antes de entrar
 * na sala. O localStorage entra primeiro para a tela já nascer certa, e o banco
 * sobrescreve se tiver algo salvo.
 */
async function carregarPreferencias() {
    const local = lerLocal()
    state.cursorColor = local.cor
    state.veuOpacidade = Number.isFinite(local.veu) ? local.veu : VEU_PADRAO

    if (state.supabase && state.currentUserId) {
        try {
            const { data, error } = await state.supabase
                .from('profiles')
                .select('cursor_color, veu_opacidade')
                .eq('id', state.currentUserId)
                .maybeSingle()

            if (error) {
                console.warn('[Config] Preferências não vieram do banco, usando as locais:', error.message)
            } else if (data) {
                if (data.cursor_color) state.cursorColor = data.cursor_color
                if (data.veu_opacidade != null) state.veuOpacidade = Number(data.veu_opacidade)
            }
        } catch (e) {
            console.warn('[Config] Falha ao ler preferências:', e.message)
        }
    }

    aplicarVeu()
    gravarLocal(state.cursorColor, state.veuOpacidade)
}

/** Grava no banco sem travar a interface: o valor local já foi aplicado. */
async function salvarPreferencias() {
    gravarLocal(state.cursorColor, state.veuOpacidade)
    if (!state.supabase || !state.currentUserId) return
    try {
        const { error } = await state.supabase
            .from('profiles')
            .update({ cursor_color: state.cursorColor, veu_opacidade: state.veuOpacidade })
            .eq('id', state.currentUserId)
        if (error) {
            console.warn('[Config] Não deu para salvar no banco (rode sql/perfil/preferencias.sql):', error.message)
            mostrarAviso('Salvo só neste computador — as colunas de preferência ainda não existem no banco.')
        }
    } catch (e) {
        console.warn('[Config] salvarPreferencias:', e.message)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Aplicação ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** O véu é o gradiente escuro de body::before — ver css/base.css. */
function aplicarVeu() {
    const v = Math.max(0, Math.min(1, Number(state.veuOpacidade ?? VEU_PADRAO)))
    document.documentElement.style.setProperty('--veu-opacidade', String(v))
}

/** Avisa a sala da cor nova para os cursores dos outros mudarem na hora. */
function emitirCor() {
    if (state.socket) state.socket.emit('set_cursor_color', { color: state.cursorColor })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel ───────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Atalho para montar elementos, no mesmo estilo dos outros módulos. */
function el(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

function initConfig() {
    const btn = document.getElementById('configToggle')
    if (!btn || btn.dataset.inited) return
    btn.dataset.inited = '1'

    construirPainel()

    btn.addEventListener('click', e => {
        e.stopPropagation()
        painelAberto ? fecharPainel() : abrirPainel()
    })

    document.addEventListener('click', e => {
        if (painelAberto && !e.target.closest('#configPanel') && !e.target.closest('#configToggle')) {
            fecharPainel()
        }
    })
}

function construirPainel() {
    if (document.getElementById('configPanel')) return

    const painel = document.createElement('div')
    painel.id = 'configPanel'

    painel.appendChild(el('div', 'cfg-title', '⚙ Configurações'))

    // ── Cor do cursor ────────────────────────────────────────────────────────
    const secCor = el('div', 'cfg-sec')
    secCor.appendChild(el('div', 'cfg-label', 'Cor do meu cursor'))
    secCor.appendChild(el('div', 'cfg-hint', 'É assim que os outros jogadores veem o seu ponteiro.'))

    const grade = el('div', 'cfg-cores')
    CORES_CURSOR.forEach(c => {
        const sw = el('button', 'cfg-cor')
        sw.type = 'button'
        sw.style.background = c.hex
        sw.title = c.nome
        sw.dataset.hex = c.hex.toLowerCase()
        sw.addEventListener('click', () => escolherCor(c.hex))
        grade.appendChild(sw)
    })
    secCor.appendChild(grade)

    // Cor livre, para quem quiser uma fora da paleta
    const livre = el('div', 'cfg-cor-livre')
    const inputCor = document.createElement('input')
    inputCor.type = 'color'
    inputCor.id = 'cfgCorLivre'
    inputCor.className = 'cfg-cor-input'
    inputCor.addEventListener('input', () => escolherCor(inputCor.value))
    livre.appendChild(el('span', 'cfg-cor-livre-label', 'Outra cor'))
    livre.appendChild(inputCor)
    secCor.appendChild(livre)

    // Prévia do cursor
    const previa = el('div', 'cfg-previa')
    const dot = el('span', 'cfg-previa-dot')
    dot.id = 'cfgPreviaDot'
    previa.appendChild(dot)
    previa.appendChild(el('span', 'cfg-previa-txt', 'seu cursor'))
    secCor.appendChild(previa)

    painel.appendChild(secCor)

    // ── Véu do fundo ─────────────────────────────────────────────────────────
    const secVeu = el('div', 'cfg-sec')
    secVeu.appendChild(el('div', 'cfg-label', 'Escurecer o fundo'))
    secVeu.appendChild(el('div', 'cfg-hint',
        'Reduz o filtro que fica por cima da cena e dos vídeos. Só muda na sua tela.'))

    const linha = el('div', 'cfg-slider-row')
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = 'cfgVeuSlider'
    slider.className = 'cfg-slider'
    slider.min = '0'; slider.max = '100'; slider.step = '5'
    slider.addEventListener('input', () => {
        state.veuOpacidade = parseInt(slider.value, 10) / 100
        aplicarVeu()
        atualizarRotuloVeu()
    })
    // Só grava quando o jogador solta, para não martelar o banco a cada pixel
    slider.addEventListener('change', () => salvarPreferencias())
    linha.appendChild(slider)

    const val = el('span', 'cfg-slider-val')
    val.id = 'cfgVeuVal'
    linha.appendChild(val)
    secVeu.appendChild(linha)

    const atalhos = el('div', 'cfg-atalhos')
    ;[['Limpo', 0], ['Leve', 0.35], ['Padrão', 1]].forEach(([nome, v]) => {
        const b = el('button', 'cfg-atalho', nome)
        b.type = 'button'
        b.addEventListener('click', () => {
            state.veuOpacidade = v
            aplicarVeu(); sincronizarPainel(); salvarPreferencias()
        })
        atalhos.appendChild(b)
    })
    secVeu.appendChild(atalhos)

    painel.appendChild(secVeu)

    const aviso = el('div', 'cfg-aviso')
    aviso.id = 'cfgAviso'
    painel.appendChild(aviso)

    document.body.appendChild(painel)
}

function escolherCor(hex) {
    state.cursorColor = hex
    sincronizarPainel()
    emitirCor()
    salvarPreferencias()
}

function abrirPainel() {
    sincronizarPainel()
    document.getElementById('configPanel').classList.add('aberto')
    painelAberto = true
}

function fecharPainel() {
    document.getElementById('configPanel')?.classList.remove('aberto')
    painelAberto = false
}

/** Põe os controles em sincronia com o estado atual. */
function sincronizarPainel() {
    const painel = document.getElementById('configPanel')
    if (!painel) return

    const cor = state.cursorColor || COR_PADRAO
    painel.querySelectorAll('.cfg-cor').forEach(sw => {
        sw.classList.toggle('ativa', sw.dataset.hex === cor.toLowerCase())
    })

    const inputCor = document.getElementById('cfgCorLivre')
    if (inputCor) inputCor.value = cor

    const dot = document.getElementById('cfgPreviaDot')
    if (dot) {
        dot.style.background = cor
        dot.style.boxShadow = `0 0 8px ${cor}`
    }

    const slider = document.getElementById('cfgVeuSlider')
    if (slider) slider.value = String(Math.round((state.veuOpacidade ?? VEU_PADRAO) * 100))
    atualizarRotuloVeu()
}

function atualizarRotuloVeu() {
    const val = document.getElementById('cfgVeuVal')
    if (val) val.textContent = Math.round((state.veuOpacidade ?? VEU_PADRAO) * 100) + '%'
}

let avisoTimer = null
function mostrarAviso(msg) {
    const caixa = document.getElementById('cfgAviso')
    if (!caixa) return
    caixa.textContent = msg
    caixa.classList.add('visivel')
    clearTimeout(avisoTimer)
    avisoTimer = setTimeout(() => caixa.classList.remove('visivel'), 6000)
}

/** Mostra o botão de engrenagem — chamado ao entrar na sala. */
function showConfigButton() {
    const btn = document.getElementById('configToggle')
    if (btn) {
        btn.style.display = 'flex'
        btn.style.alignItems = 'center'
        btn.style.justifyContent = 'center'
    }
}

module.exports = {
    initConfig, carregarPreferencias, aplicarVeu, emitirCor, showConfigButton,
    CORES_CURSOR, COR_PADRAO, VEU_PADRAO,
}
