// ══════════════════════════════════════════════════════════════════════════════
// src/config.js — PREFERÊNCIAS DO JOGADOR
//
// Três coisas:
//   • cor do cursor — cada jogador escolhe a sua; os outros veem essa cor
//   • opacidade do véu — o escurecido que fica por cima da cena de fundo
//   • tamanho da interface — escala tudo junto, sem mexer no layout
//
// As duas primeiras ficam em `profiles` no Supabase, para acompanhar a conta em
// qualquer máquina, com localStorage como espelho local. Se as colunas ainda não
// existirem no banco (sql/perfil/preferencias.sql), tudo continua funcionando
// só com o localStorage — a preferência apenas não viaja entre computadores.
//
// O tamanho da interface fica SÓ no localStorage de propósito: depende do
// monitor, não da pessoa. O que é confortável num notebook não é numa TV.
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

// ══════════════════════════════════════════════════════════════════════════════
// ── TAMANHO DA INTERFACE ─────────────────────────────────────────────────────
//
// Usa o zoom do Electron (webFrame.setZoomFactor), e não font-size no CSS.
//
// A diferença importa: a interface é cheia de medidas fixas em px — o card da
// ficha tem 290px, os campos de PV/PD 46px, as bolhas de NPC têm posição
// calculada. Mexer só na fonte quebraria todos esses encaixes. O zoom escala
// TUDO na mesma proporção, então o layout continua exatamente como foi
// desenhado, só que maior. Zero risco de quebrar tela.
//
// 1 continua sendo o padrão: quem não mexer não vê diferença nenhuma.
// ══════════════════════════════════════════════════════════════════════════════
const ZOOM_PADRAO = 1
const ZOOM_MIN = 0.8
const ZOOM_MAX = 1.6

const PRESETS_ZOOM = [
    { fator: 0.9, nome: 'Compacto', dica: 'Cabe mais coisa na tela' },
    { fator: 1.0, nome: 'Padrão', dica: 'Como sempre foi' },
    { fator: 1.15, nome: 'Grande', dica: 'Textos mais legíveis' },
    { fator: 1.3, nome: 'Maior', dica: 'Para telas distantes' },
    { fator: 1.5, nome: 'Máximo', dica: 'Para quem tem dificuldade de leitura' },
]

const CHAVE_COR = 'cursorColor'
const CHAVE_VEU = 'veuOpacidade'
const CHAVE_ZOOM = 'zoomInterface'
const CHAVE_CURSOR_PROPRIO = 'cursorProprio'

// Começa desligado: quem não mexer continua com o cursor do sistema, como
// sempre foi. Os OUTROS jogadores já viam o ponteiro da plataforma — o que
// faltava era você enxergar o seu igual.
const CURSOR_PROPRIO_PADRAO = false

let painelAberto = false

// ══════════════════════════════════════════════════════════════════════════════
// ── Leitura e escrita das preferências ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function lerLocal() {
    try {
        return {
            cor: localStorage.getItem(CHAVE_COR) || COR_PADRAO,
            veu: parseFloat(localStorage.getItem(CHAVE_VEU) ?? VEU_PADRAO),
            zoom: parseFloat(localStorage.getItem(CHAVE_ZOOM) ?? ZOOM_PADRAO),
            cursorProprio: localStorage.getItem(CHAVE_CURSOR_PROPRIO) === 'true',
        }
    } catch (e) {
        return {
            cor: COR_PADRAO, veu: VEU_PADRAO, zoom: ZOOM_PADRAO,
            cursorProprio: CURSOR_PROPRIO_PADRAO,
        }
    }
}

function gravarLocal(cor, veu, zoom) {
    try {
        localStorage.setItem(CHAVE_COR, cor)
        localStorage.setItem(CHAVE_VEU, String(veu))
        if (zoom != null) localStorage.setItem(CHAVE_ZOOM, String(zoom))
        localStorage.setItem(CHAVE_CURSOR_PROPRIO, String(!!state.cursorProprio))
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
    // O zoom fica só no localStorage: depende do monitor, não da pessoa
    state.zoom = Number.isFinite(local.zoom) ? local.zoom : ZOOM_PADRAO
    state.cursorProprio = !!local.cursorProprio

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
    aplicarZoom()
    aplicarCursor()
    gravarLocal(state.cursorColor, state.veuOpacidade, state.zoom)
}

/** Grava no banco sem travar a interface: o valor local já foi aplicado. */
async function salvarPreferencias() {
    gravarLocal(state.cursorColor, state.veuOpacidade, state.zoom)
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

/**
 * Escala a interface inteira.
 *
 * webFrame.setZoomFactor escala layout, textos, imagens e espaçamentos na mesma
 * proporção — é o mesmo mecanismo do Ctrl+= do navegador. Por isso NÃO quebra
 * nada: as medidas fixas em px da ficha e dos painéis continuam com a relação
 * entre si intacta.
 *
 * Fora do Electron (se um dia o app rodar no navegador) cai no zoom do CSS,
 * que tem o mesmo efeito visual.
 */
function aplicarZoom() {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(state.zoom) || ZOOM_PADRAO))
    try {
        const { webFrame } = require('electron')
        if (webFrame && typeof webFrame.setZoomFactor === 'function') {
            webFrame.setZoomFactor(z)
            return
        }
    } catch (e) { /* não é Electron; usa o fallback abaixo */ }

    try { document.body.style.zoom = z } catch (e) { }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CURSOR DA PLATAFORMA ─────────────────────────────────────────────────────
//
// Os outros jogadores sempre viram o seu ponteiro desenhado pelo app — quem via
// o cursor do Windows era só você, porque o render de cursores pula o próprio
// socket (nao faria sentido a rede devolver a sua propria posicao).
//
// Ligando isto, o cursor do sistema some e o app desenha o seu na mesma cor que
// a mesa enxerga. O desenho e LOCAL, direto no mousemove: nao passa pela rede,
// entao nao tem atraso nenhum.
// ══════════════════════════════════════════════════════════════════════════════
let meuCursorEl = null
let cursorOuvindo = false

function aplicarCursor() {
    const ligado = !!state.cursorProprio
    document.body.classList.toggle('cursor-plataforma', ligado)

    if (!ligado) {
        if (meuCursorEl) { meuCursorEl.remove(); meuCursorEl = null }
        return
    }

    if (!meuCursorEl) {
        meuCursorEl = document.createElement('div')
        meuCursorEl.id = 'meuCursor'
        meuCursorEl.className = 'cursor cursor-proprio'
        const ponto = document.createElement('div')
        ponto.className = 'cursor-dot'
        meuCursorEl.appendChild(ponto)
        document.body.appendChild(meuCursorEl)
    }

    // Mesma cor que os outros veem. Busca pela classe, e nao por firstChild:
    // se um dia o ponteiro ganhar outro elemento dentro, isto nao quebra.
    const cor = state.cursorColor || COR_PADRAO
    const ponto = meuCursorEl.querySelector('.cursor-dot')
    if (ponto) {
        ponto.style.background = cor
        ponto.style.boxShadow = `0 0 6px ${cor}`
    }

    // Um listener so, registrado na primeira vez. addEventListener de proposito:
    // socket.js usa document.onmousemove, e sobrescrever aquilo derrubaria os
    // cursores dos outros jogadores.
    if (!cursorOuvindo) {
        cursorOuvindo = true
        document.addEventListener('mousemove', e => {
            if (!meuCursorEl) return
            meuCursorEl.style.left = e.clientX + 'px'
            meuCursorEl.style.top = e.clientY + 'px'
        })
    }
}

function alternarCursorProprio(ligado) {
    state.cursorProprio = !!ligado
    aplicarCursor()
    sincronizarPainel()
    salvarPreferencias()
}

function definirZoom(fator) {
    state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(fator) || ZOOM_PADRAO))
    aplicarZoom()
    sincronizarPainel()
    salvarPreferencias()
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

    // Usar esse ponteiro também na própria tela
    const troca = el('label', 'cfg-check')
    const check = document.createElement('input')
    check.type = 'checkbox'
    check.id = 'cfgCursorProprio'
    check.addEventListener('change', () => alternarCursorProprio(check.checked))
    troca.appendChild(check)
    const txt = el('span', 'cfg-check-txt')
    txt.appendChild(el('span', 'cfg-check-nome', 'Usar este ponteiro na minha tela'))
    txt.appendChild(el('span', 'cfg-check-sub',
        'Desmarcado, você vê o cursor do Windows. Os outros jogadores veem o da plataforma de qualquer jeito.'))
    troca.appendChild(txt)
    secCor.appendChild(troca)

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

    // ── Tamanho da interface ─────────────────────────────────────────────────
    const secZoom = el('div', 'cfg-sec')
    secZoom.appendChild(el('div', 'cfg-label', 'Tamanho da interface'))
    secZoom.appendChild(el('div', 'cfg-hint',
        'Aumenta textos, botões e painéis juntos, na mesma proporção. Só muda na sua tela.'))

    const presets = el('div', 'cfg-zoom-opts')
    PRESETS_ZOOM.forEach(p => {
        const b = el('button', 'cfg-zoom-opt')
        b.type = 'button'
        b.dataset.fator = String(p.fator)
        b.title = p.dica
        b.appendChild(el('span', 'cfg-zoom-nome', p.nome))
        b.appendChild(el('span', 'cfg-zoom-pct', Math.round(p.fator * 100) + '%'))
        b.addEventListener('click', () => definirZoom(p.fator))
        presets.appendChild(b)
    })
    secZoom.appendChild(presets)

    // Ajuste fino, para quem quiser um valor entre os presets
    const fino = el('div', 'cfg-zoom-fino')
    fino.appendChild(botaoZoom('−', -0.05, 'Diminuir um pouco'))
    const atual = el('span', 'cfg-zoom-atual')
    atual.id = 'cfgZoomAtual'
    fino.appendChild(atual)
    fino.appendChild(botaoZoom('+', 0.05, 'Aumentar um pouco'))
    secZoom.appendChild(fino)

    painel.appendChild(secZoom)

    const aviso = el('div', 'cfg-aviso')
    aviso.id = 'cfgAviso'
    painel.appendChild(aviso)

    document.body.appendChild(painel)
}

function botaoZoom(rotulo, passo, dica) {
    const b = el('button', 'cfg-zoom-passo', rotulo)
    b.type = 'button'
    b.title = dica
    b.addEventListener('click', () => definirZoom((Number(state.zoom) || ZOOM_PADRAO) + passo))
    return b
}

function escolherCor(hex) {
    state.cursorColor = hex
    aplicarCursor()          // o proprio ponteiro acompanha a cor nova
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

    const check = document.getElementById('cfgCursorProprio')
    if (check) check.checked = !!state.cursorProprio

    const slider = document.getElementById('cfgVeuSlider')
    if (slider) slider.value = String(Math.round((state.veuOpacidade ?? VEU_PADRAO) * 100))
    atualizarRotuloVeu()

    // ── Zoom ────────────────────────────────────────────────────────────────
    const z = Number(state.zoom) || ZOOM_PADRAO
    painel.querySelectorAll('.cfg-zoom-opt').forEach(b => {
        b.classList.toggle('ativa', Math.abs(parseFloat(b.dataset.fator) - z) < 0.001)
    })
    const atual = document.getElementById('cfgZoomAtual')
    if (atual) atual.textContent = Math.round(z * 100) + '%'

    painel.querySelectorAll('.cfg-zoom-passo').forEach(b => {
        const rotulo = b.textContent
        b.disabled = (rotulo === '+' && z >= ZOOM_MAX - 0.001)
            || (rotulo === '−' && z <= ZOOM_MIN + 0.001)
    })
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
    initConfig, carregarPreferencias, aplicarVeu, aplicarZoom, definirZoom,
    aplicarCursor, alternarCursorProprio,
    emitirCor, showConfigButton,
    CORES_CURSOR, COR_PADRAO, VEU_PADRAO,
    PRESETS_ZOOM, ZOOM_PADRAO, ZOOM_MIN, ZOOM_MAX,
}
