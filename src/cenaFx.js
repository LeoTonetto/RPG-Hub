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

// Agrupados como aparecem no painel
const EFEITOS = [
    { id: 'preto',     nome: 'Tela preta',        grupo: 'Tela' },
    { id: 'cinema',    nome: 'Bordas de cinema',  grupo: 'Tela' },
    { id: 'granulado', nome: 'Granulado',         grupo: 'Tela' },
    { id: 'camera',    nome: 'Câmera passeando',  grupo: 'Câmera' },
    { id: 'balanco',   nome: 'Balanço',           grupo: 'Câmera' },
    { id: 'voo',       nome: 'Voo',               grupo: 'Câmera' },
    { id: 'blur',      nome: 'Desfoque',          grupo: 'Câmera' },
    { id: 'neblina',   nome: 'Neblina',           grupo: 'Ambiente' },
    { id: 'poeira',    nome: 'Poeira',            grupo: 'Ambiente' },
    { id: 'chuva',     nome: 'Chuva',             grupo: 'Ambiente' },
    { id: 'brasas',    nome: 'Brasas',            grupo: 'Ambiente' },
    { id: 'folhas',    nome: 'Folhas',            grupo: 'Ambiente' },
    { id: 'tocha',     nome: 'Luz de tocha',      grupo: 'Ambiente' },
    { id: 'concussao', nome: 'Concussão',         grupo: 'Tensão' },
    { id: 'sangue',    nome: 'Bordas de sangue',  grupo: 'Tensão' },
    { id: 'movimento', nome: 'Correria',          grupo: 'Tensão' },
]
// 'suave' é o crossfade de sempre; fica fora de "Transição agora" (sem imagem nova não faz nada)
const TRANSICAO_SUAVE = { id: 'suave', nome: 'Suave' }
const TRANSICOES = [
    { id: 'fade_preto',  nome: 'Fade preto' },
    { id: 'fade_branco', nome: 'Fade branco' },
    { id: 'despertar',   nome: 'Despertar' },
    { id: 'desfoque',    nome: 'Desfoque' },
    { id: 'iris',        nome: 'Íris' },
    { id: 'varredura',   nome: 'Varredura' },
    { id: 'zoom',        nome: 'Zoom' },
    { id: 'dissolver',   nome: 'Dissolver lento' },
    { id: 'lembranca',   nome: 'Lembrança' },
    { id: 'fumaca',      nome: 'Fumaça' },
    { id: 'corte',       nome: 'Corte seco' },
]
const nomeTransicao = id => ([TRANSICAO_SUAVE, ...TRANSICOES].find(t => t.id === id) || TRANSICAO_SUAVE).nome

// Quanto cada força vale em cada efeito
const FORCA = {
    balanco:   [0, 1, 2, 3.5],
    concussao: [0, 1, 1.8, 2.8],
    movimento: [0, 1, 1.8, 2.8],
    voo:       [0, 1, 1.6, 2.3],
    cinema:    [0, 8, 11, 15],          // vh
    blur:      [0, 2, 5, 10],           // px
    sangue:    [0, 1.3, 1.15, 1.0],     // escala: menor = borda mais grossa
    granulado: [0, 0.25, 0.4, 0.6],     // opacidade
    neblina:   [0, 0.4, 0.65, 0.9],     // opacidade
    tocha:     [0, 0.55, 0.8, 1],       // opacidade
}

let atuais = {}           // { id: força } — o que está na tela agora
const timersDesliga = {}  // efeitos com rampa de saída esperam para tirar a classe
const sorteio = (a, b) => a + Math.random() * (b - a)
const umDe = lista => lista[Math.floor(Math.random() * lista.length)]

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
        const antes = atuais[id] || 0
        clearTimeout(timersDesliga[id])

        // Ao ligar, cada efeito sorteia o próprio jeito (ritmo, vento, lugar da luz)
        if (n && !antes) variar(id)

        if (id === 'balanco')   body.style.setProperty('--fx-bal', FORCA.balanco[n])
        if (id === 'concussao') body.style.setProperty('--fx-con', FORCA.concussao[n])
        if (id === 'movimento') body.style.setProperty('--fx-mov', FORCA.movimento[n])
        if (id === 'voo')       { body.style.setProperty('--fx-voo', FORCA.voo[n]); avancoVoo(n, seco) }
        if (id === 'cinema' && n)    body.style.setProperty('--fx-cinema-h', FORCA.cinema[n] + 'vh')
        if (id === 'blur')           body.style.setProperty('--fx-blur', FORCA.blur[n] + 'px')
        if (id === 'sangue' && n)    body.style.setProperty('--fx-sangue-escala', FORCA.sangue[n])
        if (id === 'granulado' && n) { garantirGrao(); body.style.setProperty('--fx-gran-op', FORCA.granulado[n]) }
        if (id === 'neblina' && n)   { garantirNeblina(); body.style.setProperty('--fx-neb-op', FORCA.neblina[n]) }
        if (id === 'tocha' && n)     body.style.setProperty('--fx-tocha-op', FORCA.tocha[n])
        if (id === 'camera')         camera(n, seco)
        if (SISTEMAS[id])            particulas(id, n, seco)

        if (n) { body.classList.add('fxon-' + id); return }

        // Os que mexem a imagem precisam da animação viva enquanto a força
        // desce até zero, senão a imagem pula de volta para o lugar.
        const comRampa = ['balanco', 'concussao', 'movimento', 'voo'].includes(id)
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
    if (novo.voo)       zoom = Math.max(zoom, 1.03 + 0.022 * FORCA.voo[novo.voo])
    if (novo.blur)      zoom = Math.max(zoom, 1 + FORCA.blur[novo.blur] * 0.006)
    body.style.setProperty('--fx-zoom', zoom)

    if (seco) {
        void camada.offsetWidth
        requestAnimationFrame(() => { body.classList.remove('fxon-seco'); camada.classList.remove('fx-seco') })
    }

    atuais = novo
    renderPainel()
}

/**
 * Sorteia de novo o "jeito" de um efeito. Roda quando ele liga e a cada troca
 * de cena: é o que impede duas cenas calmas de se mexerem exatamente igual.
 */
function variar(id) {
    const body = document.body
    if (id === 'balanco') {
        body.style.setProperty('--fx-bal-dur', sorteio(5.5, 9.5).toFixed(1) + 's')
        body.style.setProperty('--fx-bal-dir', umDe(['alternate', 'alternate-reverse']))
        body.style.setProperty('--fx-bal-atraso', -sorteio(0, 8).toFixed(1) + 's')
    }
    if (id === 'neblina') {
        body.style.setProperty('--fx-neb-dur1', sorteio(70, 110).toFixed(0) + 's')
        body.style.setProperty('--fx-neb-dur2', sorteio(120, 180).toFixed(0) + 's')
        body.style.setProperty('--fx-neb-dir', umDe(['normal', 'reverse']))
        body.style.setProperty('--fx-neb-alt', sorteio(45, 75).toFixed(0) + '%')
    }
    if (id === 'tocha') {
        const [x, y] = umDe([[18, 88], [82, 85], [50, 100], [12, 45], [88, 50], [30, 95], [70, 95]])
        body.style.setProperty('--fx-tocha-x', x + '%')
        body.style.setProperty('--fx-tocha-y', y + '%')
    }
    if (id === 'voo') {
        body.style.setProperty('--fx-voo-dur', sorteio(9, 14).toFixed(1) + 's')
        body.style.setProperty('--fx-voo-dir', umDe(['alternate', 'alternate-reverse']))
        body.style.setProperty('--fx-voo-atraso', -sorteio(0, 12).toFixed(1) + 's')
    }
    if (id === 'camera') novoTrajeto()
    if (SISTEMAS[id]) SISTEMAS[id].variar()
    if (id === 'voo') novoVoo()     // depois do sorteio do ponto de fuga, que ele usa
}

/** Troca de cena: tudo que está ligado ganha um jeito novo. */
function variarTudo() {
    Object.keys(atuais).forEach(variar)
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

// ── Neblina: textura de nuvem que emenda nas laterais, gerada uma vez ────────
let texturaNeblina = null
function gerarTexturaNeblina() {
    if (texturaNeblina) return texturaNeblina
    const W = 1024, H = 512
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')
    for (let i = 0; i < 90; i++) {
        const x = Math.random() * W, y = H * (0.25 + Math.random() * 0.75)
        const r = 60 + Math.random() * 170, a = 0.04 + Math.random() * 0.1
        // Desenha também deslocado de uma largura: a textura repete sem emenda
        for (const dx of [-W, 0, W]) {
            const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r)
            g.addColorStop(0, `rgba(225, 228, 232, ${a})`)
            g.addColorStop(1, 'rgba(225, 228, 232, 0)')
            ctx.fillStyle = g
            ctx.fillRect(x + dx - r, y - r, r * 2, r * 2)
        }
    }
    texturaNeblina = c.toDataURL()
    return texturaNeblina
}
function garantirNeblina() {
    const camadas = document.querySelectorAll('#cenaFx .fx-neblina i, #cenaFx .fx-fumaca')
    if (!camadas.length || camadas[0].style.backgroundImage) return
    const url = `url(${gerarTexturaNeblina()})`
    camadas.forEach(el => { el.style.backgroundImage = url })
}

// ── Câmera passeando: aproxima e desliza devagar, para um lado sorteado ───────
// Cada trecho vai de onde a imagem está até um ponto novo; ao chegar, sorteia
// o próximo. A força define o quanto aproxima e a velocidade.
const cam = { forca: 0, anim: null, pos: { s: 1, x: 0, y: 0 }, saida: null }
const CAMERA = [null,
    { s: [1.04, 1.09], dur: [34, 46] },
    { s: [1.06, 1.14], dur: [24, 34] },
    { s: [1.09, 1.2],  dur: [16, 24] },
]
function alvoCamera() {
    const cfg = CAMERA[cam.forca]
    const s = sorteio(cfg.s[0], cfg.s[1])
    const folga = (s - 1) / 2 / s * 100 * 0.9      // quanto dá para deslizar sem mostrar borda (em % da imagem)
    return { s, x: sorteio(-folga, folga), y: sorteio(-folga, folga) }
}
const tCamera = p => `scale(${p.s.toFixed(4)}) translate(${p.x.toFixed(3)}%, ${p.y.toFixed(3)}%)`
function posAtualCamera() {
    const el = document.getElementById('fxCamera')
    const m = new DOMMatrix(getComputedStyle(el).transform)
    const s = m.a || 1
    // translate em % do próprio elemento, aplicado depois do scale
    return { s, x: m.e / s / el.offsetWidth * 100, y: m.f / s / el.offsetHeight * 100 }
}
function trechoCamera() {
    const el = document.getElementById('fxCamera')
    if (!el || !cam.forca) return
    const de = cam.pos, para = alvoCamera()
    const cfg = CAMERA[cam.forca]
    const anterior = cam.anim
    cam.anim = el.animate([{ transform: tCamera(de) }, { transform: tCamera(para) }],
        { duration: sorteio(cfg.dur[0], cfg.dur[1]) * 1000, easing: 'ease-in-out', fill: 'forwards' })
    if (anterior) anterior.cancel()
    cam.pos = para
    cam.anim.onfinish = () => trechoCamera()
}
function camera(n, seco) {
    const el = document.getElementById('fxCamera')
    if (!el) return
    clearTimeout(cam.saida)
    if (n) {
        const mudouForca = cam.forca !== n
        cam.forca = n
        if (!cam.anim || mudouForca) { if (cam.anim) cam.pos = posAtualCamera(); trechoCamera() }
        return
    }
    if (!cam.forca) return
    cam.forca = 0
    const anterior = cam.anim
    if (!anterior) return
    if (seco) { anterior.cancel(); cam.anim = null; cam.pos = { s: 1, x: 0, y: 0 }; return }
    // Volta ao enquadramento normal sem pulo
    const de = posAtualCamera()
    cam.anim = el.animate([{ transform: tCamera(de) }, { transform: 'none' }], { duration: 2500, easing: 'ease-in-out', fill: 'forwards' })
    anterior.cancel()
    cam.pos = { s: 1, x: 0, y: 0 }
    const saindo = cam.anim
    saindo.onfinish = () => { saindo.cancel(); if (cam.anim === saindo) cam.anim = null }
}
/** Recomeça de um enquadramento novo (usado com a tela coberta, na troca de cena). */
function novoTrajeto() {
    if (!cam.forca) return
    const anterior = cam.anim
    if (anterior) anterior.onfinish = null
    cam.anim = null
    cam.pos = alvoCamera()
    trechoCamera()
    if (anterior) anterior.cancel()
}

// ── Voo: avança devagar em direção a um ponto da imagem (o destino) ─────────
// O ponto é o mesmo de onde as nuvens saem (SISTEMAS.voo). Chega perto e para;
// a sensação de seguir voando fica com as nuvens e o vento.
const voo = { forca: 0, anim: null }
const AVANCO_VOO = [null, { s: 1.08, dur: 80 }, { s: 1.13, dur: 60 }, { s: 1.2, dur: 45 }]
function escalaAtual(el) { return new DOMMatrix(getComputedStyle(el).transform).a || 1 }
function avancoVoo(n, seco) {
    const el = document.getElementById('fxVooAvanco')
    if (!el) return
    if (n) {
        if (voo.forca === n && voo.anim) return
        voo.forca = n
        const de = voo.anim ? escalaAtual(el) : 1
        const cfg = AVANCO_VOO[n]
        const anterior = voo.anim
        // Mudando a força no meio, o tempo é proporcional ao que falta
        const falta = Math.max(0.15, Math.abs(cfg.s - de) / (cfg.s - 1))
        voo.anim = el.animate([{ transform: `scale(${de})` }, { transform: `scale(${cfg.s})` }],
            { duration: cfg.dur * 1000 * falta, easing: 'cubic-bezier(.35,0,.55,1)', fill: 'forwards' })
        if (anterior) anterior.cancel()
        return
    }
    if (!voo.forca) return
    voo.forca = 0
    const anterior = voo.anim
    voo.anim = null
    if (!anterior) return
    if (seco) { anterior.cancel(); return }
    const saindo = el.animate([{ transform: `scale(${escalaAtual(el)})` }, { transform: 'none' }],
        { duration: 2500, easing: 'ease-in-out', fill: 'forwards' })
    anterior.cancel()
    saindo.onfinish = () => saindo.cancel()
}
/** Cena nova (ou acabou de ligar): o destino muda e o avanço recomeça de longe. */
function novoVoo() {
    const el = document.getElementById('fxVooAvanco')
    if (!el) return
    const s = SISTEMAS.voo
    el.style.transformOrigin = `${(s.fx * 100).toFixed(1)}% ${(s.fy * 100).toFixed(1)}%`
    if (!voo.forca) return
    const n = voo.forca
    if (voo.anim) voo.anim.cancel()
    voo.anim = null; voo.forca = 0
    avancoVoo(n)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PARTÍCULAS ───────────────────────────────────────────────────────────────
//
// Um só canvas para todos os sistemas (poeira, chuva, brasas, folhas). Cada
// sistema tem a própria opacidade, que sobe e desce em rampa, e o desenho só
// roda enquanto algum está visível. Posições em fração da tela, velocidades em
// fração da tela por segundo.
// ══════════════════════════════════════════════════════════════════════════════

const PALETAS_FOLHA = [
    ['#b5541c', '#d9822b', '#8e3b12', '#c9a227', '#6f2a0c'],   // outono
    ['#4f7a2a', '#6b9a34', '#3d5e22', '#87a84a', '#2f4a1a'],   // verde
    ['#8a6a3a', '#a68450', '#6e5230', '#b89a62', '#5a4325'],   // seca
]

const SISTEMAS = {
    poeira: {
        qtd: [0, 35, 75, 130],
        vento: 1,
        variar() { this.vento = umDe([1, -1]) * sorteio(0.6, 1.4) },
        nova(qualquer) {
            const grande = Math.random() < 0.12
            const daBorda = this.vento > 0 ? -0.03 : 1.03
            return {
                x: qualquer ? Math.random() : (Math.random() < 0.5 ? daBorda : Math.random()),
                y: qualquer ? Math.random() : (Math.random() < 0.5 ? 1.03 : Math.random()),
                r: grande ? 5 + Math.random() * 8 : 0.9 + Math.random() * 2,
                a: grande ? 0.55 + Math.random() * 0.4 : 0.35 + Math.random() * 0.5,
                vx: (0.007 + Math.random() * 0.024) * this.vento,
                vy: -(0.0025 + Math.random() * 0.012),
                f: 0.3 + Math.random() * 0.8, pisca: 0.8 + Math.random() * 2.2, fase: Math.random() * 6.3,
            }
        },
        mover(p, dt, t) {
            p.x += (p.vx + Math.sin(t * p.f + p.fase) * 0.009) * dt
            p.y += (p.vy + Math.cos(t * p.f * 0.7 + p.fase) * 0.007) * dt
            return p.x > -0.05 && p.x < 1.05 && p.y > -0.05 && p.y < 1.05
        },
        desenhar(ctx, ps, w, h, t, esc, alfa) {
            ps.forEach(p => {
                const brilho = alfa * p.a * (0.55 + 0.45 * Math.sin(t * p.pisca + p.fase))
                const x = p.x * w, y = p.y * h, r = p.r * esc
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
        },
    },

    chuva: {
        qtd: [0, 140, 300, 560],
        angulo: 0.15,
        variar() { this.angulo = umDe([1, -1]) * sorteio(0.05, 0.3) },
        nova(qualquer) {
            const perto = Math.random() < 0.35
            const v = perto ? sorteio(1.7, 2.3) : sorteio(1.1, 1.5)
            return {
                x: Math.random() * 1.3 - 0.15, y: qualquer ? Math.random() : -Math.random() * 0.2,
                v, len: perto ? sorteio(0.045, 0.07) : sorteio(0.02, 0.035), perto,
            }
        },
        mover(p, dt) {
            p.y += p.v * dt
            p.x += p.v * Math.tan(this.angulo) * dt * 0.56   // 0.56 ≈ altura/largura de uma tela 16:9
            return p.y < 1.08
        },
        desenhar(ctx, ps, w, h, t, esc, alfa) {
            const dx = Math.tan(this.angulo) * 0.56
            for (const perto of [false, true]) {
                ctx.strokeStyle = `rgba(200, 212, 230, ${alfa * (perto ? 0.38 : 0.2)})`
                ctx.lineWidth = (perto ? 1.4 : 0.8) * esc
                ctx.beginPath()
                ps.forEach(p => {
                    if (p.perto !== perto) return
                    const x = p.x * w, y = p.y * h
                    ctx.moveTo(x, y)
                    ctx.lineTo(x - dx * p.len * w, y - p.len * h)
                })
                ctx.stroke()
            }
        },
    },

    brasas: {
        qtd: [0, 22, 48, 90],
        vento: 0,
        variar() { this.vento = sorteio(-0.025, 0.025) },
        nova(qualquer) {
            const vida = sorteio(4, 9)
            return {
                x: Math.random(), y: qualquer ? sorteio(0.3, 1.05) : sorteio(1.0, 1.08),
                vy: -sorteio(0.05, 0.14), r: sorteio(0.9, 2.6), vida, idade: qualquer ? Math.random() * vida : 0,
                f: sorteio(0.6, 1.6), fase: Math.random() * 6.3, cor: umDe(['255, 170, 70', '255, 120, 40', '255, 210, 120']),
            }
        },
        mover(p, dt, t) {
            p.idade += dt
            p.y += p.vy * dt
            p.x += (this.vento + Math.sin(t * p.f + p.fase) * 0.018) * dt
            return p.idade < p.vida && p.y > -0.05
        },
        desenhar(ctx, ps, w, h, t, esc, alfa) {
            ctx.save()
            ctx.globalCompositeOperation = 'lighter'
            ps.forEach(p => {
                const vida = Math.min(1, p.idade / 0.8, (p.vida - p.idade) / 1.5)
                const a = alfa * Math.max(0, vida) * (0.6 + 0.4 * Math.sin(t * 9 * p.f + p.fase))
                const x = p.x * w, y = p.y * h, r = p.r * esc
                const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4)
                g.addColorStop(0, `rgba(${p.cor}, ${a})`)
                g.addColorStop(0.25, `rgba(${p.cor}, ${a * 0.45})`)
                g.addColorStop(1, `rgba(${p.cor}, 0)`)
                ctx.fillStyle = g
                ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8)
            })
            ctx.restore()
        },
    },

    folhas: {
        qtd: [0, 10, 22, 40],
        paleta: PALETAS_FOLHA[0], vento: 0.02,
        variar() { this.paleta = umDe(PALETAS_FOLHA); this.vento = umDe([1, -1]) * sorteio(0.01, 0.05) },
        nova(qualquer) {
            return {
                x: Math.random() * 1.2 - 0.1, y: qualquer ? Math.random() : -0.05,
                vy: sorteio(0.035, 0.08), tam: sorteio(8, 15), giro: sorteio(-1.5, 1.5), ang: Math.random() * 6.3,
                bal: sorteio(0.02, 0.05), f: sorteio(0.5, 1.2), fase: Math.random() * 6.3,
                vira: sorteio(1, 3), cor: umDe(this.paleta),
            }
        },
        mover(p, dt, t) {
            p.y += p.vy * dt
            p.x += (this.vento + Math.cos(t * p.f + p.fase) * p.bal) * dt
            p.ang += p.giro * dt
            return p.y < 1.06 && p.x > -0.15 && p.x < 1.15
        },
        desenhar(ctx, ps, w, h, t, esc, alfa) {
            ps.forEach(p => {
                const s = p.tam * esc
                ctx.save()
                ctx.translate(p.x * w, p.y * h)
                ctx.rotate(p.ang)
                ctx.scale(1, Math.cos(t * p.vira + p.fase))    // folha virando no ar
                ctx.globalAlpha = alfa * 0.9
                ctx.fillStyle = p.cor
                ctx.beginPath()
                ctx.moveTo(-s, 0)
                ctx.quadraticCurveTo(0, -s * 0.55, s, 0)
                ctx.quadraticCurveTo(0, s * 0.55, -s, 0)
                ctx.fill()
                ctx.restore()
            })
        },
    },

    // Nuvens e rajadas de vento vindo de um ponto de fuga em direção à câmera.
    // Cada partícula tem uma posição no espaço (ângulo e raio em volta do eixo
    // de voo) e uma profundidade z que diminui: projetada, ela acelera e cresce
    // ao passar, como num voo de verdade. O raio mínimo deixa o centro (o
    // destino) livre. Acompanha a inclinação da câmera lendo o #fxVoo.
    voo: {
        qtd: [0, 34, 60, 95],
        fx: 0.5, fy: 0.45, n: 1,
        variar() { this.fx = sorteio(0.42, 0.58); this.fy = sorteio(0.38, 0.5) },
        nova(qualquer) {
            const nuvem = Math.random() < 0.13
            return {
                nuvem, ang: Math.random() * Math.PI * 2,
                raio: nuvem ? sorteio(0.9, 1.7) : sorteio(0.35, 1.3),
                z: qualquer ? sorteio(0.4, 4) : sorteio(3.2, 4.2),
                tam: sorteio(0.3, 0.6), a: nuvem ? sorteio(0.18, 0.38) : sorteio(0.14, 0.32),
                vel: nuvem ? sorteio(0.45, 0.7) : sorteio(0.9, 1.4),
                sprite: Math.floor(Math.random() * 3), giro: Math.random() * 6.3,
            }
        },
        mover(p, dt) {
            p.z -= p.vel * [0, 0.6, 0.85, 1.15][this.n] * dt
            const d = p.raio / p.z
            return p.z > 0.12 && d < (p.nuvem ? 2.2 : 1.4)
        },
        desenhar(ctx, ps, w, h, t, esc, alfa) {
            const sprites = spritesNuvem()
            const cx = this.fx * w, cy = this.fy * h
            ctx.save()
            // A mesma inclinação e balanço da imagem
            const el = document.getElementById('fxVoo')
            if (el) {
                const m = new DOMMatrix(getComputedStyle(el).transform)
                ctx.translate(w / 2 + m.e * esc, h / 2 + m.f * esc)
                ctx.rotate(Math.atan2(m.b, m.a))
                ctx.translate(-w / 2, -h / 2)
            }
            const proj = (p, z) => {
                const d = p.raio / z * h * 0.5
                return [cx + Math.cos(p.ang) * d * 1.25, cy + Math.sin(p.ang) * d]
            }
            // Surge já fora do centro (o destino fica limpo) e some quando passa raspando
            const fade = (p, perto) => {
                const d = p.raio / p.z
                return Math.max(0, Math.min(1, (4.2 - p.z) / 1.2, (p.z - 0.12) / 0.35, (d - perto) / perto))
            }

            ps.forEach(p => {
                if (!p.nuvem) return
                const [x, y] = proj(p, p.z)
                const r = p.tam / p.z * h * 0.5
                ctx.globalAlpha = alfa * p.a * fade(p, 0.45)
                ctx.save()
                ctx.translate(x, y); ctx.rotate(p.giro)
                ctx.drawImage(sprites[p.sprite], -r * 1.6, -r, r * 3.2, r * 2)
                ctx.restore()
            })
            // Rajadas: um traço do ponto atual até onde estava um pouco antes
            ctx.globalAlpha = 1
            ctx.lineCap = 'round'
            ps.forEach(p => {
                if (p.nuvem) return
                const [x1, y1] = proj(p, p.z)
                const [x0, y0] = proj(p, p.z + 0.35 + 0.2 * this.n)
                const a = alfa * p.a * fade(p, 0.22)
                ctx.strokeStyle = `rgba(236, 242, 250, ${a})`
                ctx.lineWidth = Math.min(3, 0.6 + 0.5 / p.z) * esc
                ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
            })
            ctx.restore()
        },
    },
}
Object.values(SISTEMAS).forEach(s => { s.parts = []; s.alvo = 0; s.alfa = 0; s.ligado = false })

// Três tufos de nuvem desenhados uma vez; o voo só os estica e posiciona
let nuvens = null
function spritesNuvem() {
    if (nuvens) return nuvens
    nuvens = [0, 1, 2].map(() => {
        const c = document.createElement('canvas')
        c.width = 320; c.height = 200
        const ctx = c.getContext('2d')
        for (let i = 0; i < 16; i++) {
            const x = sorteio(70, 250), y = sorteio(60, 140), r = sorteio(30, 70)
            const g = ctx.createRadialGradient(x, y, 0, x, y, r)
            g.addColorStop(0, 'rgba(240, 244, 250, 0.32)')
            g.addColorStop(0.6, 'rgba(232, 238, 246, 0.14)')
            g.addColorStop(1, 'rgba(232, 238, 246, 0)')
            ctx.fillStyle = g
            ctx.fillRect(x - r, y - r, r * 2, r * 2)
        }
        return c
    })
    return nuvens
}

const motor = { raf: 0, ultimo: 0 }
function particulas(id, n, seco) {
    const s = SISTEMAS[id]
    s.ligado = !!n
    if (n) {
        s.n = n
        s.alvo = s.qtd[n]
        while (s.parts.length < s.alvo) s.parts.push(s.nova(true))
        if (seco) s.alfa = 1
    } else if (seco) {
        s.alfa = 0; s.parts.length = 0
    }
    if (!motor.raf && Object.values(SISTEMAS).some(x => x.ligado || x.alfa > 0)) {
        motor.ultimo = performance.now()
        motor.raf = requestAnimationFrame(quadroParticulas)
    }
}
function quadroParticulas(agora) {
    const canvas = document.querySelector('#cenaFx .fx-particulas')
    if (!canvas) { motor.raf = 0; return }
    const esc = Math.min(window.devicePixelRatio || 1, 1.5)
    const w = Math.round(window.innerWidth * esc), h = Math.round(window.innerHeight * esc)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    const dt = Math.min(0.05, (agora - motor.ultimo) / 1000)
    motor.ultimo = agora
    const t = agora / 1000
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)

    let algum = false
    Object.values(SISTEMAS).forEach(s => {
        // Rampa de entrada e saída (~1,2 s)
        s.alfa = Math.max(0, Math.min(1, s.alfa + (s.ligado ? dt : -dt) / 1.2))
        if (!s.ligado && s.alfa === 0) { s.parts.length = 0; return }
        algum = true
        for (let i = 0; i < s.parts.length; i++) {
            if (!s.mover(s.parts[i], dt, t)) {
                // Saiu da tela: renasce na borda, ou some se a força baixou
                if (s.parts.length > s.alvo) { s.parts.splice(i--, 1); continue }
                s.parts[i] = s.nova(false)
            }
        }
        s.desenhar(ctx, s.parts, w, h, t, esc, s.alfa)
    })
    motor.raf = algum ? requestAnimationFrame(quadroParticulas) : 0
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
        if (cena) variarTudo()   // lugar novo: câmera, vento e luz sorteiam de novo
    }

    const cortina = document.querySelector('#cenaFx .fx-cortina')
    const olho = document.querySelector('#cenaFx .fx-olho')
    const palco = document.getElementById('cenaPalco')
    const iris = document.querySelector('#cenaFx .fx-iris')
    const fumaca = document.querySelector('#cenaFx .fx-fumaca')

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
        if (cena) variarTudo()
        return
    }

    if (tipo === 'iris') {
        // Círculo que fecha no centro, como o fim de um filme antigo
        await animar(iris, [{ '--fx-iris': '120vmax', opacity: 1 }, { '--fx-iris': '0vmax', opacity: 1 }], { duration: 850, easing: 'cubic-bezier(.55,0,.75,.3)' })
        await trocar()
        await espera(250)
        await animar(iris, [{ '--fx-iris': '0vmax', opacity: 1 }, { '--fx-iris': '120vmax', opacity: 1 }], { duration: 1000, easing: 'cubic-bezier(.25,.7,.45,1)' })
        return
    }

    if (tipo === 'varredura') {
        // Uma cortina preta atravessa a tela; a cena nova aparece atrás dela
        const lado = Math.random() < 0.5
        const [entra, cobre, sai] = lado
            ? ['inset(0 100% 0 0)', 'inset(0 0 0 0)', 'inset(0 0 0 100%)']
            : ['inset(0 0 0 100%)', 'inset(0 0 0 0)', 'inset(0 100% 0 0)']
        cortina.style.background = '#000'
        await animar(cortina, [{ clipPath: entra, opacity: 1 }, { clipPath: cobre, opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)' })
        await trocar()
        await animar(cortina, [{ clipPath: cobre, opacity: 1 }, { clipPath: sai, opacity: 1 }], { duration: 750, easing: 'cubic-bezier(.65,0,.35,1)' })
        return
    }

    if (tipo === 'zoom') {
        // Mergulha na imagem até borrar, e a nova chega de perto
        await animar(palco, [
            { transform: 'scale(1)', filter: 'blur(0px) brightness(1)' },
            { transform: 'scale(1.6)', filter: 'blur(16px) brightness(1.3)' },
        ], { duration: 650, easing: 'cubic-bezier(.6,0,.9,.5)' })
        await trocar()
        await animar(palco, [
            { transform: 'scale(1.35)', filter: 'blur(14px) brightness(1.3)' },
            { transform: 'scale(1)', filter: 'blur(0px) brightness(1)' },
        ], { duration: 950, easing: 'cubic-bezier(.15,.6,.3,1)' })
        return
    }

    if (tipo === 'dissolver') {
        // Crossfade longo: uma imagem derrete na outra
        const pronta = preparo ? await preparo : null
        if (pronta) pronta({ duracao: 3200 })
        if (efeitos) aplicarEfeitos(efeitos)
        if (cena) variarTudo()
        await espera(3200)
        return
    }

    if (tipo === 'lembranca') {
        // Flashback: clareia, amarela e borra; a cena nova surge do claro
        cortina.style.background = '#f6ead0'
        await Promise.all([
            animar(palco, [{ filter: 'sepia(0) blur(0px) brightness(1)' }, { filter: 'sepia(0.9) blur(7px) brightness(1.5)' }], { duration: 1000, easing: 'ease-in' }),
            animar(cortina, [{ opacity: 0 }, { opacity: 0.92 }], { duration: 1000, easing: 'ease-in' }),
        ])
        await trocar()
        await espera(200)
        await Promise.all([
            animar(palco, [{ filter: 'sepia(0.9) blur(7px) brightness(1.5)' }, { filter: 'sepia(0) blur(0px) brightness(1)' }], { duration: 1800, easing: 'ease-out' }),
            animar(cortina, [{ opacity: 0.92 }, { opacity: 0 }], { duration: 1500, easing: 'ease-out' }),
        ])
        return
    }

    if (tipo === 'fumaca') {
        // Fumaça sobe e cobre tudo; quando dissipa, o lugar é outro
        garantirNeblina()
        cortina.style.background = '#58544f'
        await Promise.all([
            animar(fumaca, [
                { opacity: 0, backgroundPosition: '0% 120%', transform: 'scale(1)' },
                { opacity: 1, backgroundPosition: '30% 40%', transform: 'scale(1.3)' },
            ], { duration: 1400, easing: 'ease-in' }),
            animar(cortina, [{ opacity: 0 }, { opacity: 0 , offset: 0.4 }, { opacity: 0.96 }], { duration: 1400, easing: 'ease-in' }),
            animar(palco, [{ filter: 'blur(0px)' }, { filter: 'blur(10px)' }], { duration: 1400, easing: 'ease-in' }),
        ])
        await trocar()
        await Promise.all([
            animar(fumaca, [
                { opacity: 1, backgroundPosition: '30% 40%', transform: 'scale(1.3)' },
                { opacity: 0, backgroundPosition: '60% -40%', transform: 'scale(1.6)' },
            ], { duration: 2200, easing: 'ease-out' }),
            animar(cortina, [{ opacity: 0.96 }, { opacity: 0 }], { duration: 1300, easing: 'ease-out' }),
            animar(palco, [{ filter: 'blur(10px)' }, { filter: 'blur(0px)' }], { duration: 1800, easing: 'ease-out' }),
        ])
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
    { id: 'rasante',   nome: 'Rasante',   icone: '🦅' },
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
        case 'rasante': {
            // Mergulho: cai inclinando para um lado e sobe de volta
            const lado = Math.random() < 0.5 ? 1 : -1
            golpe.animate([
                { transform: 'translateY(0) rotate(0deg) scale(1)' },
                { transform: `translateY(-2.2%) rotate(${-1.4 * lado}deg) scale(1.1)`, offset: 0.35, easing: 'ease-in-out' },
                { transform: `translateY(1%) rotate(${0.6 * lado}deg) scale(1.06)`, offset: 0.7, easing: 'ease-in-out' },
                { transform: 'translateY(0) rotate(0deg) scale(1)' },
            ], { duration: 2200, easing: 'cubic-bezier(.4,0,.3,1)' })
            golpeFiltro.animate([
                { filter: 'blur(0px) brightness(1)' }, { filter: 'blur(2.5px) brightness(1.12)', offset: 0.35 }, { filter: 'blur(0px) brightness(1)' },
            ], { duration: 2200, easing: 'ease-in-out' })
            break
        }
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
    return EFEITOS.map(({ id, nome, grupo }, i) => {
        const titulo = i === 0 || EFEITOS[i - 1].grupo !== grupo ? `<div class="cfx-grupo">${grupo}</div>` : ''
        const n = valores[id] || 0
        const forcas = id === 'preto' ? '' : [1, 2, 3].map(f =>
            `<button class="cfx-n${n === f ? ' ativo' : ''}" ${attr}="${id}" data-forca="${f}" title="${nome}: força ${f}" aria-label="${nome}: força ${f}">${'I'.repeat(f)}</button>`).join('')
        return titulo + `<div class="cfx-efeito${n ? ' ligado' : ''}">
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
