// src/cenaFx.js
// ── EFEITOS DE CENA ───────────────────────────────────────────────────────────
//
// Dois tipos, que somam:
//
//   • CONTÍNUOS: ficam ligados até o mestre desligar (balanço, sangue, poeira…).
//     Cada um tem força 1, 2 ou 3. O servidor guarda o conjunto, então quem
//     entra no meio já vê o mesmo clima. Evento: `cena_fx { efeitos }`.
//
//   • TRANSIÇÕES: rodam uma vez (fade preto, despertar…). Podem levar junto uma
//     cena nova e/ou um conjunto novo de efeitos, que entram no instante em que
//     a tela está coberta. Evento: `cena_transicao { tipo, cena?, efeitos? }`.
//
// Tudo mexe só na imagem de fundo (#cenaPalco) e na camada logo acima dela
// (#cenaFx). O HUD fica intacto. O visual está em css/cenaFx.css. As listas de
// ids se repetem em server/handlers.js, que descarta o que não conhece.

const state = require('./state')
const { prepararCena } = require('./scene')

const EFEITOS = [
    { id: 'preto',     nome: 'Tela preta' },
    { id: 'cinema',    nome: 'Bordas de cinema' },
    { id: 'balanco',   nome: 'Balanço' },
    { id: 'concussao', nome: 'Concussão' },
    { id: 'sangue',    nome: 'Bordas de sangue' },
    { id: 'blur',      nome: 'Desfoque' },
    { id: 'granulado', nome: 'Granulado' },
    { id: 'poeira',    nome: 'Poeira' },
    { id: 'movimento', nome: 'Correria' },
]
// 'suave' é o crossfade de sempre; fica fora de "Transição agora" (sem imagem nova não faz nada)
const TRANSICAO_SUAVE = { id: 'suave', nome: 'Suave' }
const TRANSICOES = [
    { id: 'fade_preto',  nome: 'Fade preto' },
    { id: 'fade_branco', nome: 'Fade branco' },
    { id: 'despertar',   nome: 'Despertar' },
    { id: 'desfoque',    nome: 'Desfoque' },
    { id: 'corte',       nome: 'Corte seco' },
]
const nomeTransicao = id => ([TRANSICAO_SUAVE, ...TRANSICOES].find(t => t.id === id) || TRANSICAO_SUAVE).nome

// Quanto cada força vale em cada efeito
const FORCA = {
    balanco:   [0, 1, 2, 3.5],
    concussao: [0, 1, 1.8, 2.8],
    movimento: [0, 1, 1.8, 2.8],
    cinema:    [0, 8, 11, 15],          // vh
    blur:      [0, 2, 5, 10],           // px
    sangue:    [0, 1.3, 1.15, 1.0],   // escala: menor = borda mais grossa
    granulado: [0, 0.25, 0.4, 0.6],     // opacidade
    poeira:    [0, 35, 75, 130],        // partículas
}

let atuais = {}           // { id: força } — o que está na tela agora
const timersDesliga = {}  // efeitos com rampa de saída esperam para tirar a classe

// ══════════════════════════════════════════════════════════════════════════════
// ── CONTÍNUOS ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Põe na tela exatamente o conjunto `efeitos`. `seco` pula as rampas. */
function aplicarEfeitos(efeitos, { seco = false } = {}) {
    const novo = {}
    EFEITOS.forEach(({ id }) => {
        const n = Math.round(+((efeitos || {})[id]) || 0)
        if (n > 0) novo[id] = Math.min(3, n)
    })

    const body = document.body
    const camada = document.getElementById('cenaFx')
    if (!camada) return
    if (seco) { body.classList.add('fxon-seco'); camada.classList.add('fx-seco') }

    EFEITOS.forEach(({ id }) => {
        const n = novo[id] || 0
        clearTimeout(timersDesliga[id])

        // Força em variável CSS
        if (id === 'balanco')   body.style.setProperty('--fx-bal', FORCA.balanco[n])
        if (id === 'concussao') body.style.setProperty('--fx-con', FORCA.concussao[n])
        if (id === 'movimento') body.style.setProperty('--fx-mov', FORCA.movimento[n])
        if (id === 'cinema' && n)    body.style.setProperty('--fx-cinema-h', FORCA.cinema[n] + 'vh')
        if (id === 'blur')           body.style.setProperty('--fx-blur', FORCA.blur[n] + 'px')
        if (id === 'sangue' && n)    body.style.setProperty('--fx-sangue-escala', FORCA.sangue[n])
        if (id === 'granulado' && n) { garantirGrao(); body.style.setProperty('--fx-gran-op', FORCA.granulado[n]) }
        if (id === 'poeira')         poeira(n)

        if (n) { body.classList.add('fxon-' + id); return }

        // Os que mexem a imagem precisam da animação viva enquanto a força
        // desce até zero, senão a imagem pula de volta para o lugar.
        const comRampa = ['balanco', 'concussao', 'movimento'].includes(id)
        if (comRampa && !seco && body.classList.contains('fxon-' + id)) {
            timersDesliga[id] = setTimeout(() => body.classList.remove('fxon-' + id), 1700)
        } else {
            body.classList.remove('fxon-' + id)
        }
    })

    // Zoom de segurança: quanto a imagem mexe, tanto ela cresce para não mostrar borda
    let zoom = 1
    if (novo.balanco)   zoom = Math.max(zoom, 1.025 + 0.015 * FORCA.balanco[novo.balanco])
    if (novo.concussao) zoom = Math.max(zoom, 1.04 + 0.02 * FORCA.concussao[novo.concussao])
    if (novo.movimento) zoom = Math.max(zoom, 1.05 + 0.02 * FORCA.movimento[novo.movimento])
    if (novo.blur)      zoom = Math.max(zoom, 1 + FORCA.blur[novo.blur] * 0.006)
    body.style.setProperty('--fx-zoom', zoom)

    if (seco) {
        void camada.offsetWidth
        requestAnimationFrame(() => { body.classList.remove('fxon-seco'); camada.classList.remove('fx-seco') })
    }

    atuais = novo
    renderPainel()
}

// ── Granulado: um ladrilho de ruído gerado uma vez ───────────────────────────
let graoPronto = false
function garantirGrao() {
    if (graoPronto) return
    const el = document.querySelector('#cenaFx .fx-granulado')
    if (!el) return
    const c = document.createElement('canvas')
    c.width = c.height = 220
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(220, 220)
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    el.style.backgroundImage = `url(${c.toDataURL()})`
    graoPronto = true
}

// ── Poeira: partículas num canvas, só desenhando enquanto ligada ─────────────
const pz = { raf: 0, parts: [], alvo: 0, parar: 0 }
function poeira(n) {
    const canvas = document.querySelector('#cenaFx .fx-poeira')
    if (!canvas) return
    clearTimeout(pz.parar)

    if (!n) {
        // Espera o fade da camada antes de parar de desenhar
        if (pz.raf) pz.parar = setTimeout(() => { cancelAnimationFrame(pz.raf); pz.raf = 0 }, 1400)
        return
    }

    pz.alvo = FORCA.poeira[n]
    while (pz.parts.length < pz.alvo) pz.parts.push(novaParticula(true))
    pz.parts.length = pz.alvo
    if (pz.raf) return

    const ctx = canvas.getContext('2d')
    const escala = Math.min(window.devicePixelRatio || 1, 1.5)
    let ultimo = performance.now()

    const quadro = agora => {
        const w = Math.round(window.innerWidth * escala), h = Math.round(window.innerHeight * escala)
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
        const dt = Math.min(50, agora - ultimo) / 16.67
        ultimo = agora
        ctx.clearRect(0, 0, w, h)
        const t = agora / 1000

        pz.parts.forEach(p => {
            p.x += (p.vx + Math.sin(t * p.f + p.fase) * 0.15) * dt / 1000
            p.y += (p.vy + Math.cos(t * p.f * 0.7 + p.fase) * 0.12) * dt / 1000
            if (p.x > 1.05 || p.x < -0.05 || p.y < -0.05 || p.y > 1.05) Object.assign(p, novaParticula(false))

            const brilho = p.a * (0.55 + 0.45 * Math.sin(t * p.pisca + p.fase))
            const x = p.x * w, y = p.y * h, r = p.r * escala
            if (p.r > 3) {
                const g = ctx.createRadialGradient(x, y, 0, x, y, r)
                g.addColorStop(0, `rgba(255, 238, 205, ${brilho * 0.35})`)
                g.addColorStop(1, 'rgba(255, 238, 205, 0)')
                ctx.fillStyle = g
            } else {
                ctx.fillStyle = `rgba(255, 242, 215, ${brilho})`
            }
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
        })
        pz.raf = requestAnimationFrame(quadro)
    }
    pz.raf = requestAnimationFrame(quadro)
}
function novaParticula(qualquerLugar) {
    const grande = Math.random() < 0.12
    return {
        x: qualquerLugar ? Math.random() : (Math.random() < 0.5 ? -0.03 : Math.random()),
        y: qualquerLugar ? Math.random() : (Math.random() < 0.5 ? 1.03 : Math.random()),
        r: grande ? 5 + Math.random() * 8 : 0.9 + Math.random() * 2,
        a: grande ? 0.55 + Math.random() * 0.4 : 0.35 + Math.random() * 0.5,
        vx: 0.12 + Math.random() * 0.4,     // milésimos da tela por quadro (~1-3% da tela por segundo)
        vy: -(0.04 + Math.random() * 0.2),
        f: 0.3 + Math.random() * 0.8,
        pisca: 0.8 + Math.random() * 2.2,
        fase: Math.random() * Math.PI * 2,
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TRANSIÇÕES ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const espera = ms => new Promise(r => setTimeout(r, ms))
// Toda animação de transição fica registrada para ser cancelada no fim. Não
// basta el.getAnimations(): uma animação com fill 'forwards' que o Chromium
// marcou como substituída some dessa lista, mas volta a valer quando a que a
// substituiu é cancelada — as pálpebras ficavam fechadas depois do despertar.
const emCurso = new Set()
const animar = (el, quadros, opcoes) => {
    const a = el.animate(quadros, { fill: 'forwards', ...opcoes })
    emCurso.add(a)
    return a.finished
}
function encerrarAnimacoes() {
    emCurso.forEach(a => a.cancel())
    emCurso.clear()
}

// Uma de cada vez: se o mestre clicar duas seguidas, a segunda espera a primeira
let fila = Promise.resolve()
function receberTransicao(pacote) {
    fila = fila.then(() => executarTransicao(pacote || {}))
        .catch(e => console.warn('[CenaFx] Transição falhou:', e))
        .finally(encerrarAnimacoes)
}

async function executarTransicao({ tipo, cena, efeitos }) {
    // O download da cena começa junto com o escurecer
    const preparo = cena ? prepararCena(cena).catch(e => { console.warn('[CenaFx] Cena não carregou:', e.message); return null }) : null

    // Com a tela coberta: troca a imagem e os efeitos sem rampa
    const trocar = async () => {
        if (preparo) {
            const pronta = await Promise.race([preparo, espera(10000).then(() => null)])
            if (pronta) pronta({ instantaneo: true })
        }
        if (efeitos) aplicarEfeitos(efeitos, { seco: true })
    }

    const cortina = document.querySelector('#cenaFx .fx-cortina')
    const olho = document.querySelector('#cenaFx .fx-olho')
    const palco = document.getElementById('cenaPalco')

    if (tipo === 'fade_preto' || tipo === 'fade_branco') {
        const branco = tipo === 'fade_branco'
        cortina.style.background = branco ? '#fff' : '#000'
        await animar(cortina, [{ opacity: 0 }, { opacity: 1 }], { duration: branco ? 550 : 900, easing: 'ease-in' })
        await trocar()
        await espera(branco ? 120 : 300)
        await animar(cortina, [{ opacity: 1 }, { opacity: 0 }], { duration: branco ? 1700 : 1200, easing: 'ease-out' })
        encerrarAnimacoes()
        return
    }

    if (tipo === 'desfoque') {
        await animar(palco, [{ filter: 'blur(0px) brightness(1)' }, { filter: 'blur(22px) brightness(0.7)' }], { duration: 650, easing: 'ease-in' })
        await trocar()
        await animar(palco, [{ filter: 'blur(22px) brightness(0.7)' }, { filter: 'blur(0px) brightness(1)' }], { duration: 1000, easing: 'ease-out' })
        encerrarAnimacoes()
        return
    }

    if (tipo === 'despertar') {
        // Fecha os olhos (rápido; se a tela já está preta, nem dá para ver)
        await animar(olho, [
            { '--fx-olho': '160vh', opacity: 0 },
            { '--fx-olho': '0px', opacity: 1 },
        ], { duration: 450, easing: 'ease-in' })
        await trocar()
        // Abre um pouco, pisca de volta, e abre de vez, enquanto a vista desembaça
        await Promise.all([
            animar(olho, [
                { offset: 0,    '--fx-olho': '0px',   opacity: 1 },
                { offset: 0.07, '--fx-olho': '0px',   opacity: 1, easing: 'ease-out' },
                { offset: 0.25, '--fx-olho': '17vh',  opacity: 1, easing: 'ease-in-out' },
                { offset: 0.34, '--fx-olho': '13vh',  opacity: 1, easing: 'ease-in' },
                { offset: 0.42, '--fx-olho': '0px',   opacity: 1 },
                { offset: 0.52, '--fx-olho': '0px',   opacity: 1, easing: 'ease-out' },
                { offset: 0.72, '--fx-olho': '42vh',  opacity: 1, easing: 'ease-in-out' },
                { offset: 0.85, '--fx-olho': '75vh',  opacity: 1, easing: 'ease-out' },
                { offset: 1,    '--fx-olho': '170vh', opacity: 0 },
            ], { duration: 6500 }),
            animar(palco, [
                { offset: 0,    filter: 'blur(12px) brightness(0.5)' },
                { offset: 0.25, filter: 'blur(9px) brightness(0.75)' },
                { offset: 0.42, filter: 'blur(9px) brightness(0.5)' },
                { offset: 0.72, filter: 'blur(4px) brightness(0.85)' },
                { offset: 1,    filter: 'blur(0px) brightness(1)' },
            ], { duration: 7200, easing: 'ease-out' }),
        ])
        encerrarAnimacoes()
        return
    }


    if (tipo === 'suave') {
        // O crossfade de sempre, com os efeitos entrando em rampa junto
        const pronta = preparo ? await preparo : null
        if (pronta) pronta()
        if (efeitos) aplicarEfeitos(efeitos)
        return
    }

    // corte seco (e qualquer tipo desconhecido)
    await trocar()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MOMENTÂNEOS ──────────────────────────────────────────────────────────────
//
// Um clique, um susto: rodam por cima de tudo que estiver ligado e somem
// sozinhos. Não ficam guardados no servidor. Usam camadas só deles (#fxGolpe,
// .fx-flash, .fx-golpe-sangue, .fx-brilho) para não brigar com os contínuos
// nem com uma transição em andamento. Sem fill: ao terminar, tudo volta ao
// valor do CSS por conta própria.
// ══════════════════════════════════════════════════════════════════════════════

const MOMENTOS = [
    { id: 'flechada',  nome: 'Flechada',  icone: '🏹' },
    { id: 'golpe',     nome: 'Golpe',     icone: '👊' },
    { id: 'explosao',  nome: 'Explosão',  icone: '💥' },
    { id: 'relampago', nome: 'Relâmpago', icone: '⚡' },
    { id: 'tontura',   nome: 'Tontura',   icone: '💫' },
    { id: 'susto',     nome: 'Susto',     icone: '❗' },
    { id: 'cura',      nome: 'Cura',      icone: '✨' },
    { id: 'apagao',    nome: 'Piscar',    icone: '👁' },
]

/** Tremor que vai morrendo: `forca` em px, `n` sacudidas. */
function quadrosTremor(forca, n, giro = 0.4) {
    const q = []
    for (let i = 0; i <= n; i++) {
        const k = i === n ? 0 : forca * (1 - i / n)
        const lado = i % 2 ? 1 : -1
        const x = lado * k * (0.6 + Math.random() * 0.4)
        const y = (Math.random() - 0.5) * k
        const r = lado * giro * (k / forca)
        q.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)` })
    }
    return q
}

function executarMomento(tipo) {
    const golpe = document.getElementById('fxGolpe')
    const golpeFiltro = document.getElementById('fxGolpeFiltro')
    const flash = document.querySelector('#cenaFx .fx-flash')
    const sangue = document.querySelector('#cenaFx .fx-golpe-sangue')
    const brilho = document.querySelector('#cenaFx .fx-brilho')
    if (!golpe || !flash) return
    const pisca = (cor, quadros, duracao) => {
        flash.style.background = cor
        flash.animate(quadros, { duration: duracao, easing: 'ease-out' })
    }

    switch (tipo) {
        case 'flechada':
            pisca('#fff', [{ opacity: 0 }, { opacity: 0.85, offset: 0.08 }, { opacity: 0 }], 420)
            sangue.animate([{ opacity: 0 }, { opacity: 1, offset: 0.05 }, { opacity: 0.9, offset: 0.35 }, { opacity: 0 }], { duration: 2200, easing: 'ease-out' })
            golpe.animate(quadrosTremor(10, 6), { duration: 320, easing: 'ease-out' })
            break
        case 'golpe':
            pisca('#000', [{ opacity: 0 }, { opacity: 0.55, offset: 0.1 }, { opacity: 0 }], 500)
            sangue.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.08 }, { opacity: 0 }], { duration: 1300, easing: 'ease-out' })
            golpe.animate(quadrosTremor(22, 9, 0.8), { duration: 520, easing: 'ease-out' })
            golpeFiltro.animate([{ filter: 'blur(3px)' }, { filter: 'blur(0px)' }], { duration: 400, easing: 'ease-out' })
            break
        case 'explosao':
            pisca('#fff6e0', [{ opacity: 0 }, { opacity: 1, offset: 0.04 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], 1900)
            golpe.animate(quadrosTremor(30, 16, 1.2), { duration: 1100, easing: 'ease-out' })
            golpeFiltro.animate([
                { filter: 'blur(9px) brightness(1.6)' },
                { filter: 'blur(3px) brightness(1.1)', offset: 0.4 },
                { filter: 'blur(0px) brightness(1)' },
            ], { duration: 2400, easing: 'ease-out' })
            break
        case 'relampago':
            pisca('#eef4ff', [
                { opacity: 0 }, { opacity: 0.9, offset: 0.05 }, { opacity: 0.1, offset: 0.13 },
                { opacity: 0.75, offset: 0.2 }, { opacity: 0.05, offset: 0.45 }, { opacity: 0 },
            ], 1100)
            break
        case 'tontura':
            golpe.animate([
                { transform: 'rotate(0deg) scale(1) translateX(0px)' },
                { transform: 'rotate(-1.2deg) scale(1.04) translateX(-14px)', offset: 0.25 },
                { transform: 'rotate(1deg) scale(1.05) translateX(12px)', offset: 0.55 },
                { transform: 'rotate(-0.4deg) scale(1.02) translateX(-5px)', offset: 0.8 },
                { transform: 'rotate(0deg) scale(1) translateX(0px)' },
            ], { duration: 2800, easing: 'ease-in-out' })
            golpeFiltro.animate([
                { filter: 'blur(0px)' }, { filter: 'blur(5px)', offset: 0.25 }, { filter: 'blur(6px)', offset: 0.55 },
                { filter: 'blur(3px)', offset: 0.8 }, { filter: 'blur(0px)' },
            ], { duration: 2800, easing: 'ease-in-out' })
            break
        case 'susto':
            golpe.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.09)', offset: 0.18 }, { transform: 'scale(1)' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' })
            pisca('radial-gradient(ellipse at 50% 50%, transparent 35%, #000 100%)', [{ opacity: 0 }, { opacity: 0.85, offset: 0.15 }, { opacity: 0 }], 900)
            break
        case 'cura':
            brilho.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 2200, easing: 'ease-in-out' })
            break
        case 'apagao':
            pisca('#000', [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], 700)
            break
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PAINEL DO MESTRE ─────────────────────────────────────────────────────────
//
// Duas abas: ROTEIRO (sessões com as cenas prontas, em src/cenaRoteiro.js) e
// EFEITOS (contínuos e transições à mão). Os momentâneos ficam numa faixa fixa
// no topo, visíveis nas duas abas, porque são usados no calor da cena.
// ══════════════════════════════════════════════════════════════════════════════

const CHAVE_ULTIMA_FORCA = 'cenaFx.forca'
const CHAVE_ABA = 'cenaFx.aba'

function lerLocal(chave, padrao) {
    try { const v = JSON.parse(localStorage.getItem(chave)); return v ?? padrao } catch (e) { return padrao }
}
function gravarLocal(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)) } catch (e) { /* sem armazenamento: só não lembra */ }
}

function souMestre() { return !!(state.socket && state.isRoomMaster) }
function emitirEfeitos(efeitos) { if (souMestre()) state.socket.emit('cena_fx', { efeitos }) }
function emitirTransicao(pacote) { if (souMestre()) state.socket.emit('cena_transicao', pacote) }
function emitirMomento(tipo) { if (souMestre()) state.socket.emit('cena_momento', { tipo }) }

/** Uma transição revela a cena: a tela preta não sobrevive a ela. */
function semPreto(efeitos) { const e = { ...efeitos }; delete e.preto; return e }

/** Liga/desliga/troca a força de um efeito num conjunto, lembrando a última força usada. */
function alternarEm(conjunto, id, forca) {
    const ultimas = lerLocal(CHAVE_ULTIMA_FORCA, {})
    const novo = { ...conjunto }
    if (forca == null) {
        if (novo[id]) delete novo[id]
        else novo[id] = id === 'preto' ? 1 : (ultimas[id] || 1)
    } else if (novo[id] === forca) {
        delete novo[id]
    } else {
        novo[id] = forca
    }
    if (novo[id]) { ultimas[id] = novo[id]; gravarLocal(CHAVE_ULTIMA_FORCA, ultimas) }
    return novo
}

/** As linhas "nome + I II III" — usadas na aba Efeitos e no editor de cena do roteiro. */
function htmlLinhasEfeitos(valores, attr = 'data-efeito') {
    return EFEITOS.map(({ id, nome }) => {
        const n = valores[id] || 0
        const forcas = id === 'preto' ? '' : [1, 2, 3].map(f =>
            `<button class="cfx-n${n === f ? ' ativo' : ''}" ${attr}="${id}" data-forca="${f}" title="${nome}: força ${f}" aria-label="${nome}: força ${f}">${'I'.repeat(f)}</button>`).join('')
        return `<div class="cfx-efeito${n ? ' ligado' : ''}">
            <button class="cfx-b" ${attr}="${id}" aria-pressed="${!!n}">${nome}</button>${forcas}
        </div>`
    }).join('')
}

/** "Fade preto · Balanço II + Bordas de cinema I" */
function resumoCena(transicao, efeitos) {
    const ef = Object.entries(efeitos || {}).map(([id, n]) => {
        const e = EFEITOS.find(x => x.id === id)
        return e ? e.nome + (id === 'preto' ? '' : ' ' + 'I'.repeat(n)) : null
    }).filter(Boolean)
    return [nomeTransicao(transicao || 'suave'), ef.length ? ef.join(' + ') : 'sem efeitos'].join(' · ')
}

function montarPainel() {
    let painel = document.getElementById('cenaFxPainel')
    if (painel) return painel

    painel = document.createElement('div')
    painel.id = 'cenaFxPainel'
    painel.setAttribute('role', 'dialog')
    painel.setAttribute('aria-label', 'Cenas e efeitos')
    painel.innerHTML = `
        <div class="cfx-topo">
            <div class="cfx-abas" role="tablist">
                <button class="cfx-aba" role="tab" data-aba="roteiro">Roteiro</button>
                <button class="cfx-aba" role="tab" data-aba="efeitos">Efeitos</button>
            </div>
            <button class="cfx-fechar" data-acao="fechar" title="Fechar (Esc)" aria-label="Fechar">✕</button>
        </div>

        <div class="cfx-secao">Na hora</div>
        <div class="cfx-momentos">
            ${MOMENTOS.map(m => `<button class="cfx-b cfx-momento" data-momento="${m.id}" title="${m.nome}"><span aria-hidden="true">${m.icone}</span>${m.nome}</button>`).join('')}
        </div>

        <div class="cfx-corpo" data-corpo="roteiro" id="cfxRoteiro"></div>

        <div class="cfx-corpo" data-corpo="efeitos">
            <div class="cfx-secao">Efeitos contínuos</div>
            <div id="cfxEfeitos"></div>
            <div class="cfx-grade"><button class="cfx-b largo" data-acao="limpar">Desligar todos</button></div>

            <div class="cfx-secao">Transição agora (sem trocar a imagem)</div>
            <div class="cfx-grade">
                ${TRANSICOES.map(t => `<button class="cfx-b" data-transicao="${t.id}">${t.nome}</button>`).join('')}
            </div>
        </div>
    `
    document.body.appendChild(painel)

    // Só os controles das partes fixas; o roteiro trata os cliques dele
    painel.addEventListener('click', e => {
        const b = e.target.closest('button')
        if (!b || b.closest('#cfxRoteiro')) return
        if (b.dataset.aba) return mostrarAba(b.dataset.aba)
        if (b.dataset.momento) return emitirMomento(b.dataset.momento)
        if (b.dataset.efeito) return emitirEfeitos(alternarEm(atuais, b.dataset.efeito, b.dataset.forca ? +b.dataset.forca : null))
        if (b.dataset.transicao) return emitirTransicao({ tipo: b.dataset.transicao, efeitos: semPreto(atuais) })
        const acao = b.dataset.acao
        if (acao === 'fechar') return abrirPainel(false)
        if (acao === 'limpar') return emitirEfeitos({})
    })
    painel.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !e.target.closest('input, select')) abrirPainel(false)
    })

    require('./cenaRoteiro').montar(painel.querySelector('#cfxRoteiro'))
    mostrarAba(lerLocal(CHAVE_ABA, 'roteiro'))
    return painel
}

function mostrarAba(aba) {
    const painel = document.getElementById('cenaFxPainel')
    if (!painel) return
    if (aba !== 'efeitos') aba = 'roteiro'
    painel.querySelectorAll('.cfx-aba').forEach(b => {
        const ativa = b.dataset.aba === aba
        b.classList.toggle('ativa', ativa)
        b.setAttribute('aria-selected', String(ativa))
    })
    painel.querySelectorAll('.cfx-corpo').forEach(c => { c.hidden = c.dataset.corpo !== aba })
    gravarLocal(CHAVE_ABA, aba)
}

function renderPainel() {
    const painel = document.getElementById('cenaFxPainel')
    if (!painel) return
    painel.querySelector('#cfxEfeitos').innerHTML = htmlLinhasEfeitos(atuais)
}

function escapar(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function abrirPainel(abrir) {
    const painel = montarPainel()
    const aberto = abrir ?? !painel.classList.contains('aberto')
    painel.classList.toggle('aberto', aberto)
    document.getElementById('cenaFxBtn')?.classList.toggle('aberto', aberto)
    if (aberto) { renderPainel(); require('./cenaRoteiro').aoAbrir(); painel.querySelector('.cfx-aba.ativa')?.focus() }
    else document.getElementById('cenaFxBtn')?.focus()
}

/** Chamado quando a sala diz quem é o mestre. */
function initCenaFx() {
    const btn = document.getElementById('cenaFxBtn')
    if (!btn) return
    btn.style.display = state.isRoomMaster ? 'block' : 'none'
    if (!state.isRoomMaster) document.getElementById('cenaFxPainel')?.classList.remove('aberto')
    if (btn.dataset.inited) return
    btn.dataset.inited = '1'
    btn.addEventListener('click', () => abrirPainel())
}

/** Ao entrar numa sala: nada da sala anterior fica na tela. */
function limparCenaFx() { aplicarEfeitos({}, { seco: true }) }

module.exports = {
    initCenaFx, limparCenaFx, aplicarEfeitos, receberTransicao, executarMomento,
    emitirTransicao, emitirEfeitos, alternarEm, htmlLinhasEfeitos, resumoCena, escapar,
    efeitosAtuais: () => ({ ...atuais }),
    EFEITOS, TRANSICOES, TRANSICAO_SUAVE, MOMENTOS,
}
