// ══════════════════════════════════════════════════════════════════════════════
// src/dndRolagem.js — ROLAGENS DA FICHA DE D&D
//
// O app rola aqui e manda o resultado pronto ao servidor ('dnd_roll'), que só
// formata a linha do chat e distribui — o mesmo caminho do Calico. Todo mundo
// vê o resultado em tela grande; a rolagem secreta do mestre (o interruptor do
// dado) fica só com ele.
//
// O modo Normal / Vantagem / Desvantagem vale para a próxima rolagem de d20 e
// volta para Normal depois dela: vantagem é situacional, e esquecer ligada
// estragaria as rolagens seguintes.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')

const MODOS = [
    { id: 'desvantagem', nome: 'Desvantagem' },
    { id: 'normal', nome: 'Normal' },
    { id: 'vantagem', nome: 'Vantagem' },
]

let modo = 'normal'
// Cada seletor na tela se registra aqui; os que saíram da página (painel
// redesenhado) são descartados na próxima troca
let ouvintes = []

const dado = lados => 1 + Math.floor(Math.random() * lados)
const sinal = n => (n >= 0 ? '+' : '') + n

function definirModo(m) {
    modo = m
    ouvintes = ouvintes.filter(o => o.el.isConnected)
    ouvintes.forEach(o => o.pintar(modo))
}

/** Botões Desvantagem / Normal / Vantagem, sempre em sincronia entre si. */
function seletorModo() {
    const w = document.createElement('div')
    w.className = 'dr-modo'
    w.setAttribute('role', 'group')
    w.setAttribute('aria-label', 'Modo da próxima rolagem')
    const botoes = MODOS.map(m => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'dr-modo-btn ' + m.id
        b.textContent = m.nome
        b.addEventListener('click', () => definirModo(m.id))
        w.appendChild(b)
        return b
    })
    const pintar = atual => botoes.forEach((b, i) => {
        const on = MODOS[i].id === atual
        b.classList.toggle('on', on)
        b.setAttribute('aria-pressed', String(on))
    })
    pintar(modo)
    ouvintes = ouvintes.filter(o => o.el.isConnected)
    ouvintes.push({ el: w, pintar })
    return w
}

function secreto() {
    try { return require('./dice').isSecretRoll() } catch (e) { return false }
}

/**
 * Um d20 no modo pedido: { dados, natural, sorte }. `sortudo` (halfling):
 * o 1 natural é rolado de novo, uma vez, e vale o novo.
 */
function rolarD20(m, sortudo) {
    const dados = [{ lados: 20, valor: dado(20) }]
    if (m !== 'normal') dados.push({ lados: 20, valor: dado(20) })
    const escolher = () => (m === 'vantagem' ? Math.max(...dados.map(d => d.valor)) : m === 'desvantagem' ? Math.min(...dados.map(d => d.valor)) : dados[0].valor)
    let natural = escolher()
    let sorte = false
    if (sortudo && natural === 1) {
        const i = dados.findIndex(d => d.valor === 1)
        dados[i] = { lados: 20, valor: dado(20) }
        natural = escolher()
        sorte = true
    }
    return { dados, natural, sorte }
}

/**
 * Junta o modo do seletor com o que o livro aplica sozinho (auto: vem de
 * dndCondicoes.modoAutomatico). Vantagem e desvantagem juntas se anulam.
 * Devolve { modo, motivo } — o motivo vai no rótulo, para a mesa ver.
 */
function resolverModo(escolhido, auto) {
    const v = [...((auto && auto.vantagem) || [])]
    const d = [...((auto && auto.desvantagem) || [])]
    const temV = v.length || escolhido === 'vantagem'
    const temD = d.length || escolhido === 'desvantagem'
    if (temV && temD) return { modo: 'normal', motivo: (v.length || d.length) ? 'vantagem e desvantagem se anulam' : '' }
    if (temV) return { modo: 'vantagem', motivo: v.join(', ') }
    if (temD) return { modo: 'desvantagem', motivo: d.join(', ') }
    return { modo: 'normal', motivo: '' }
}

const comMotivo = (rotulo, r, extras) => {
    const partes = [r.motivo ? `${r.modo === 'normal' ? '' : r.modo + ': '}${r.motivo}` : '', ...(extras || [])].filter(Boolean)
    return partes.length ? `${rotulo} · ${partes.join(' · ')}` : rotulo
}

/**
 * "8d6", "1d4+1", "3d4+3": rola tudo. `multiplicador` dobra os dados no crítico.
 * Só no primeiro grupo (o dado da arma):
 *   extraPrimeiro — dados a mais (Crítico Brutal, Ataques Selvagens)
 *   rerrolarAte   — rola de novo uma vez o que sair até esse valor (Combate com Armas Grandes)
 */
function rolarExpressao(expressao, bonus = 0, multiplicador = 1, { extraPrimeiro = 0, rerrolarAte = 0, rerrolarMenores = 0 } = {}) {
    const grupos = []
    let fixo = bonus
    String(expressao).replace(/\s/g, '').replace(/-/g, '+-').split('+').forEach(parte => {
        const m = parte.match(/^(\d*)d(\d+)$/i)
        if (m) grupos.push({ qtd: (parseInt(m[1] || '1', 10)) * multiplicador, lados: parseInt(m[2], 10) })
        else if (/^-?\d+$/.test(parte)) fixo += parseInt(parte, 10)
    })
    if (grupos.length && extraPrimeiro) grupos[0].qtd += extraPrimeiro
    const dados = []
    grupos.forEach((g, gi) => {
        for (let i = 0; i < g.qtd && i < 60; i++) {
            let v = dado(g.lados)
            if (gi === 0 && rerrolarAte && v <= rerrolarAte) v = dado(g.lados)
            dados.push({ lados: g.lados, valor: v })
        }
    })
    // Magia Potencializada: rola de novo os N dados mais baixos (só os abaixo da média)
    if (rerrolarMenores) {
        dados.map((d, i) => ({ d, i })).filter(x => x.d.valor <= x.d.lados / 2)
            .sort((a, b) => a.d.valor - b.d.valor).slice(0, rerrolarMenores)
            .forEach(x => { dados[x.i] = { lados: x.d.lados, valor: dado(x.d.lados) } })
    }
    return {
        dados, bonus: fixo,
        total: Math.max(0, dados.reduce((s, d) => s + d.valor, 0) + fixo),
        expressao: grupos.map(g => `${g.qtd}d${g.lados}`).join(' + ') + (fixo ? ` ${sinal(fixo)}` : ''),
    }
}

/** O modo vale para uma rolagem só; depois volta para Normal. */
function consumirModo(forcarModo) {
    const m = forcarModo || modo
    if (!forcarModo && modo !== 'normal') definirModo('normal')
    return m
}

/**
 * Teste de d20 (perícia, atributo, resistência, iniciativa, ataque).
 * `forcarModo` vale só para esta rolagem (ex.: iniciativa com vantagem).
 */
function testeD20({ personagem, rotulo, bonus, tipo = 'teste', forcarModo, auto }) {
    const r = resolverModo(consumirModo(forcarModo), auto)
    // Falha automática (atordoado, paralisado... em FOR e DES): nem rola
    if (auto && auto.falha) {
        const res = { personagem, rotulo: `${rotulo} · ${auto.falha}`, tipo, modo: 'normal', dados: [], natural: 0, bonus: 0, total: 0, critico: false, falha: true, secreto: secreto() }
        enviar(res)
        return res
    }
    const { dados, natural, sorte } = rolarD20(r.modo, auto && auto.sortudo)
    const extras = []
    if (sorte) extras.push('Sortudo: rolou de novo o 1')
    let usado = natural
    if (auto && auto.minimo && natural < auto.minimo) { usado = auto.minimo; extras.push(`Talento Confiável: o d20 conta ${auto.minimo}`) }
    let total = usado + bonus
    if (auto && auto.piso && total < auto.piso) { total = auto.piso; extras.push(`Força Indomável: ${auto.piso}`) }
    const res = {
        personagem, rotulo: comMotivo(rotulo, r, extras), tipo, modo: r.modo, dados, natural, bonus, total,
        critico: natural === 20, falha: natural === 1, secreto: secreto(),
    }
    enviar(res)
    return res
}

/** Dano ou cura avulsos. */
function rolarDados({ personagem, rotulo, expressao, bonus = 0, multiplicador = 1, tipo = 'dano', tipoDano = '', extraPrimeiro = 0, rerrolarAte = 0, rerrolarMenores = 0 }) {
    const r = rolarExpressao(expressao, bonus, multiplicador, { extraPrimeiro, rerrolarAte, rerrolarMenores })
    const res = {
        personagem, rotulo, tipo, tipoDano, ...r,
        critico: multiplicador > 1 && tipo === 'dano', secreto: secreto(),
    }
    enviar(res)
    return res
}

/**
 * Magia de ataque, como no BG3: rola o ataque e o dano de uma vez. Num 20
 * natural os dados de dano dobram; num 1 natural o dano nem é rolado.
 */
function magiaComAtaque({ personagem, rotulo, bonusAtaque, expressao, tipoDano = '', auto, rerrolarMenores = 0 }) {
    const r = resolverModo(consumirModo(), auto)
    const m = r.modo
    const atq = rolarD20(m, auto && auto.sortudo)
    rotulo = comMotivo(rotulo, r, atq.sorte ? ['Sortudo: rolou de novo o 1'] : [])
    const critico = atq.natural === 20
    const falha = atq.natural === 1
    const dano = falha ? { dados: [], bonus: 0, total: 0, expressao: '' } : rolarExpressao(expressao, 0, critico ? 2 : 1, { rerrolarMenores })
    const res = {
        personagem, rotulo, tipo: 'magia', tipoDano, modo: m,
        ataque: { dados: atq.dados, natural: atq.natural, bonus: bonusAtaque, total: atq.natural + bonusAtaque },
        ...dano, critico, falha, secreto: secreto(),
    }
    enviar(res)
    return res
}

/**
 * Ataque com arma: mesmo caminho da magia de ataque (ataque e dano juntos),
 * com o que as armas têm a mais — crítico com 19 ou 18 (Campeão), dados
 * extras no crítico e rolar de novo 1 e 2 no dado da arma.
 * `forcarModo` vale só para esta rolagem (Ataque Descuidado) e o seletor
 * volta para Normal do mesmo jeito.
 */
function ataqueComArma({ personagem, rotulo, bonusAtaque, expressao, bonusDano = 0, tipoDano = '', critMin = 20, dadosCritExtra = 0, rerrolarAte = 0, forcarModo, auto }) {
    const r = resolverModo(consumirModo(forcarModo), auto)
    const m = r.modo
    const atq = rolarD20(m, auto && auto.sortudo)
    rotulo = comMotivo(rotulo, r, atq.sorte ? ['Sortudo: rolou de novo o 1'] : [])
    const critico = atq.natural >= critMin
    const falha = atq.natural === 1
    const dano = falha
        ? { dados: [], bonus: 0, total: 0, expressao: '' }
        : rolarExpressao(expressao, bonusDano, critico ? 2 : 1, { extraPrimeiro: critico ? dadosCritExtra : 0, rerrolarAte })
    const res = {
        personagem, rotulo, tipo: 'magia', tipoDano, modo: m,
        ataque: { dados: atq.dados, natural: atq.natural, bonus: bonusAtaque, total: atq.natural + bonusAtaque },
        ...dano, critico, falha, secreto: secreto(),
    }
    enviar(res)
    return res
}

// ── Envio ─────────────────────────────────────────────────────────────────────
// O servidor confirma cada rolagem (dnd_ack). Servidor antigo, que ainda não
// conhece 'dnd_roll' (a VPS antes de atualizar), não confirma: aí o app mostra
// a rolagem aqui mesmo e manda a linha pelo chat comum, para nada se perder.
const pendentes = {}
const ESPERA_ACK_MS = 1500

function enviar(res) {
    res.id = Math.random().toString(36).slice(2, 10)
    if (!state.socket) return mostrar(res)
    state.socket.emit('dnd_roll', res)
    pendentes[res.id] = setTimeout(() => {
        delete pendentes[res.id]
        console.warn('[D&D] Servidor não confirmou a rolagem; mostrando aqui e mandando pelo chat.')
        mostrar(res)
        if (!res.secreto && state.socket) {
            state.socket.emit('chat_message', { playerName: '🎲 Dados', message: linhaDeChat(res), type: 'roll' })
        }
    }, ESPERA_ACK_MS)
}

/** Chamado por socket.js quando o servidor confirma. */
function confirmar(id) {
    clearTimeout(pendentes[id])
    delete pendentes[id]
}

/** A mesma linha que o servidor monta (ver server/handlers.js). */
function linhaDeChat(res) {
    const valores = d => d.map(x => x.valor).join(', ')
    const soma = n => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`)
    const d20 = (dados, m, bonus, total) => `d20(${valores(dados)})${m && m !== 'normal' ? ' ' + m : ''}${bonus ? ` ${soma(bonus)}` : ''} = ${total}`
    let corpo
    if (res.tipo === 'magia') {
        corpo = `ataque ${d20(res.ataque.dados, res.modo, res.ataque.bonus, res.ataque.total)}`
            + (res.falha ? '  ✗ 1 natural' : ` · dano ${res.expressao}(${valores(res.dados)}) = ${res.total}${res.tipoDano ? ` de ${res.tipoDano}` : ''}${res.critico ? '  ✦ crítico' : ''}`)
    } else if (res.tipo === 'dano' || res.tipo === 'cura') {
        corpo = `${res.expressao}(${valores(res.dados)}) = ${res.total}` + (res.tipo === 'cura' ? ' de cura' : res.tipoDano ? ` de ${res.tipoDano}` : '') + (res.critico ? '  ✦ crítico' : '')
    } else {
        corpo = d20(res.dados, res.modo, res.bonus, res.total) + (res.critico ? '  ✦ 20 natural' : res.falha ? '  ✗ 1 natural' : '')
    }
    return `${res.personagem || '?'} — ${res.rotulo}: ${corpo}`
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Resultado em tela grande ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
let timer = null

function mostrar(res) {
    let el = document.getElementById('dndRollOverlay')
    if (!el) {
        el = document.createElement('div')
        el.id = 'dndRollOverlay'
        el.setAttribute('role', 'status')
        el.setAttribute('aria-live', 'polite')
        el.addEventListener('click', () => el.classList.remove('show'))
        document.body.appendChild(el)
    }
    el.innerHTML = ''
    el.className = res.falha ? 'falha' : res.critico ? 'critico' : res.tipo === 'cura' ? 'cura' : ''

    el.appendChild(mk('div', 'dro-quem', res.personagem || '—'))
    el.appendChild(mk('div', 'dro-rotulo', res.rotulo || ''))

    // Magia com ataque: a linha do ataque vem antes do dano
    if (res.tipo === 'magia' && res.ataque) {
        const a = res.ataque
        const atq = mk('div', 'dro-ataque')
        atq.appendChild(mk('span', null, 'Ataque'))
        atq.appendChild(mk('span', 'dro-ataque-dados', `d20 ${a.dados.map(d => d.valor).join(' / ')}${res.modo && res.modo !== 'normal' ? ` (${res.modo})` : ''} ${sinal(a.bonus)}`))
        atq.appendChild(mk('b', null, String(a.total)))
        el.appendChild(atq)
        if (res.falha) {
            el.appendChild(mk('div', 'dro-notas', '✗ 1 NATURAL · ERROU'))
            el.classList.add('show')
            clearTimeout(timer)
            timer = setTimeout(() => el.classList.remove('show'), 5000)
            return
        }
        el.appendChild(mk('div', 'dro-sub', 'Dano'))
    }

    const dados = mk('div', 'dro-dados')
    const descartado = res.tipo !== 'magia' && res.modo && res.modo !== 'normal' && res.dados.length === 2
        ? (res.dados[0].valor === res.natural ? 1 : 0) : -1
    res.dados.slice(0, 24).forEach((d, i) => {
        const die = mk('div', 'dro-dado' + (i === descartado ? ' descartado' : '') + (d.lados === 20 && d.valor === 20 ? ' vinte' : '') + (d.lados === 20 && d.valor === 1 ? ' um' : ''))
        die.appendChild(mk('b', null, String(d.valor)))
        die.appendChild(mk('span', null, 'd' + d.lados))
        dados.appendChild(die)
    })
    if (res.dados.length > 24) dados.appendChild(mk('div', 'dro-mais', `+${res.dados.length - 24}`))
    el.appendChild(dados)

    const linha = mk('div', 'dro-total')
    if (res.bonus) linha.appendChild(mk('span', 'dro-bonus', `${sinal(res.bonus)} =`))
    linha.appendChild(mk('b', null, String(res.total)))
    if (res.tipoDano) linha.appendChild(mk('span', 'dro-tipo', res.tipoDano))
    el.appendChild(linha)

    const notas = []
    if (res.tipo !== 'magia' && res.modo === 'vantagem') notas.push('vantagem')
    if (res.tipo !== 'magia' && res.modo === 'desvantagem') notas.push('desvantagem')
    if (res.secreto) notas.push('secreta')
    if (res.critico && (res.tipo === 'dano' || res.tipo === 'magia')) notas.push('✦ CRÍTICO')
    else if (res.critico) notas.push('✦ 20 NATURAL')
    if (res.falha) notas.push(res.dados.length ? '✗ 1 NATURAL' : '✗ FALHA AUTOMÁTICA')
    if (res.tipo === 'cura') notas.push('cura')
    if (notas.length) el.appendChild(mk('div', 'dro-notas', notas.join(' · ')))

    el.classList.add('show')
    clearTimeout(timer)
    timer = setTimeout(() => el.classList.remove('show'), 5000)
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = {
    testeD20, rolarDados, magiaComAtaque, ataqueComArma, rolarD20, resolverModo, seletorModo, definirModo, mostrar, confirmar, linhaDeChat,
    modoAtual: () => modo,
}
