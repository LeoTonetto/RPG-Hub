// ══════════════════════════════════════════════════════════════════════════════
// src/dndTestes.js — TESTES PEDIDOS PELO MESTRE (D&D)
//
// Decidido com o mestre (2026-11-03): o mestre escolhe o teste (perícia,
// atributo ou resistência), a CD, quem rola (todos ou alguns) e, se quiser,
// a origem (veneno, magia, encantamento, medo). Cada jogador recebe um aviso
// e rola com um clique; a vantagem racial entra sozinha pela origem
// (dndCondicoes.modoAutomatico). O mestre vê a lista e, no teste em grupo,
// se metade ou mais passou (LdJ, Testes em Grupo).
//
// A CD fica só no app do mestre: os jogadores mandam o total e ele confere.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const D = require('./dndDados')
const CD = require('./dndCondicoes')
const rolagem = require('./dndRolagem')

const combate = () => require('./dndCombate')

const ORIGENS = { '': 'Nenhuma', veneno: 'Veneno', magia: 'Magia', encantamento: 'Ser enfeitiçado', medo: 'Ser amedrontado' }
const pedidos = {}        // mestre: id → { cd, alvos, grupo, rotulo, respostas: { charId: { total, nome } } }
let pedidoAberto = null   // o que a caixa do mestre está mostrando

function chat(message) {
    if (state.socket) state.socket.emit('chat_message', { playerName: '🎲 Teste', message, type: 'text' })
}

/** Nome do teste: "Furtividade", "Resistência de Destreza", "Força". */
function rotuloDe(tipo, chave) {
    if (tipo === 'pericia') return (D.PERICIAS.find(p => p.key === chave) || {}).nome || chave
    const a = D.ATRIBUTO_POR_KEY[chave]
    return tipo === 'resistencia' ? `Resistência de ${a.nome}` : `Teste de ${a.nome}`
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Mestre: pedir ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function abrirPedido() {
    document.getElementById('dndPedirTeste')?.remove()
    const ov = mk('div', 'cb-overlay')
    ov.id = 'dndPedirTeste'
    require('./dndSheet').segurarCliques(ov)
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove() })
    const card = mk('div', 'connect-card cb-anuncio')
    const fechar = mk('button', 'char-modal-close-btn', '✕')
    fechar.addEventListener('click', () => ov.remove())
    card.appendChild(fechar)
    card.appendChild(mk('h1', 'card-title', 'Pedir teste'))

    const campo = (rotulo, el) => { const w = mk('label', 'cb-campo'); w.appendChild(mk('span', 'input-label', rotulo)); w.appendChild(el); return w }
    const select = (opcoes, aria) => {
        const s = document.createElement('select')
        s.className = 'dc-select'
        s.setAttribute('aria-label', aria)
        opcoes.forEach(([v, t]) => s.appendChild(new Option(t, v)))
        return s
    }
    const tipo = select([['pericia', 'Perícia'], ['resistencia', 'Resistência'], ['atributo', 'Atributo']], 'Tipo de teste')
    const chave = select([], 'Qual')
    const preencher = () => {
        chave.innerHTML = ''
        const ops = tipo.value === 'pericia' ? D.PERICIAS.map(p => [p.key, p.nome]) : D.ATRIBUTOS.map(a => [a.key, a.nome])
        ops.forEach(([v, t]) => chave.appendChild(new Option(t, v)))
    }
    tipo.addEventListener('change', preencher)
    preencher()
    const cd = document.createElement('input')
    cd.type = 'number'
    cd.className = 'room-input cb-num'
    cd.value = '12'
    cd.setAttribute('aria-label', 'CD')
    cd.addEventListener('keydown', e => e.stopPropagation())
    const origem = select(Object.entries(ORIGENS), 'Origem')
    origem.title = 'Contra o quê: liga as vantagens raciais (anão contra veneno, elfo contra encantamento...)'
    ;[campo('Teste', tipo), campo('Qual', chave), campo('CD (só você vê)', cd), campo('Origem', origem)].forEach(x => card.appendChild(x))

    card.appendChild(mk('div', 'dc-subtitulo', 'Quem rola'))
    const lista = mk('div', 'de-alvos-lista')
    const pjs = state.allCharsCache.filter(e => e.character.system === 'dnd')
    const marcas = pjs.map(e => {
        const l = mk('label', 'dc-check de-alvo')
        const c = document.createElement('input')
        c.type = 'checkbox'
        c.checked = true
        l.appendChild(c)
        l.appendChild(mk('span', null, e.character.name))
        l.appendChild(mk('span', 'dc-muted', e.playerName))
        lista.appendChild(l)
        return { id: e.character.id, c }
    })
    if (!pjs.length) lista.appendChild(mk('div', 'dc-muted', 'Nenhum personagem de D&D na sala.'))
    card.appendChild(lista)
    const grupoL = mk('label', 'dc-check')
    const grupo = document.createElement('input')
    grupo.type = 'checkbox'
    grupoL.appendChild(grupo)
    grupoL.appendChild(mk('span', null, 'Teste em grupo (passa se metade ou mais passar)'))
    card.appendChild(grupoL)

    const ok = mk('button', 'btn-primary', '🎲 Pedir')
    ok.addEventListener('click', () => {
        const alvos = marcas.filter(m => m.c.checked).map(m => m.id)
        if (!alvos.length) return
        const id = Math.random().toString(36).slice(2, 10)
        const p = { id, tipo: tipo.value, chave: chave.value, origem: origem.value, alvos, grupo: grupo.checked }
        p.rotulo = rotuloDe(p.tipo, p.chave)
        pedidos[id] = { ...p, cd: parseInt(cd.value, 10) || 10, respostas: {} }
        pedidoAberto = id
        if (state.socket) state.socket.emit('dnd_pedir_teste', p)
        ov.remove()
        desenharResultado()
    })
    card.appendChild(ok)
    ov.appendChild(card)
    document.body.appendChild(ov)
}

/** Resposta de um jogador chegou (o mestre confere com a CD). */
function aoResposta(r) {
    const p = pedidos[r.pedidoId]
    if (!p || !state.isRoomMaster) return
    p.respostas[r.charId] = { total: r.total, nome: r.nome, falha: r.falha }
    if (pedidoAberto === r.pedidoId) desenharResultado()
}

function desenharResultado() {
    let el = document.getElementById('dndTesteResultado')
    const p = pedidos[pedidoAberto]
    if (!p) { if (el) el.remove(); return }
    if (!el) {
        el = mk('div')
        el.id = 'dndTesteResultado'
        require('./dndSheet').segurarCliques(el)
        document.body.appendChild(el)
    }
    el.innerHTML = ''
    const fechar = mk('button', 'subpanel-close', '✕')
    fechar.addEventListener('click', () => { pedidoAberto = null; desenharResultado() })
    el.appendChild(fechar)
    el.appendChild(mk('div', 'cb-res-titulo', `${p.rotulo} · CD ${p.cd}${p.origem ? ` · contra ${ORIGENS[p.origem].toLowerCase()}` : ''}${p.grupo ? ' · em grupo' : ''}`))
    let passaram = 0
    let chegaram = 0
    p.alvos.forEach(id => {
        const r = p.respostas[id]
        const nome = r ? r.nome : ((state.allCharsCache.find(e => e.character.id === id) || {}).character || {}).name || '?'
        if (!r) { el.appendChild(mk('div', 'cb-res-reacao', `… ${nome}: esperando`)); return }
        chegaram++
        const passou = !r.falha && r.total >= p.cd
        if (passou) passaram++
        el.appendChild(mk('div', 'cb-res-linha ' + (passou ? 'acerto' : 'erro'), `${passou ? '✔' : '✖'} ${nome}: ${r.total}`))
    })
    if (p.grupo && chegaram === p.alvos.length) {
        const ok = passaram * 2 >= p.alvos.length
        el.appendChild(mk('div', 'cb-res-titulo', `Grupo: ${passaram} de ${p.alvos.length} passaram · ${ok ? 'PASSOU' : 'FALHOU'}`))
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Jogador: rolar o que o mestre pediu ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function aoPedido(p) {
    const meus = state.playerCharacters.filter(c => (p.alvos || []).includes(c.id))
    meus.forEach(char => {
        combate().perguntar({
            titulo: 'O mestre pede um teste',
            texto: `${char.name}: ${p.rotulo}${p.origem ? ` contra ${ORIGENS[p.origem].toLowerCase()}` : ''}${p.grupo ? ' (em grupo)' : ''}.`,
            opcoes: [{ rotulo: '🎲 Rolar', principal: true, acao: () => rolar(char, p) }],
        })
    })
}

function rolar(char, p) {
    const st = char.stats || {}
    const f = dnd.calcular(st)
    let bonus = 0
    let ctx
    if (p.tipo === 'pericia') {
        const per = D.PERICIAS.find(x => x.key === p.chave)
        bonus = f.pericias[p.chave].bonus
        ctx = { tipo: 'pericia', atributo: per.attr, pericia: p.chave }
    } else if (p.tipo === 'resistencia') {
        bonus = f.resistencias[p.chave].bonus
        ctx = { tipo: 'resistencia', atributo: p.chave }
    } else {
        bonus = f.mods[p.chave]
        ctx = { tipo: 'atributo', atributo: p.chave }
    }
    ctx.origem = p.origem || ''
    const res = rolagem.testeD20({ personagem: char.name, rotulo: `${p.rotulo} (pedido do mestre)`, bonus, auto: CD.modoAutomatico(st, f, ctx) })
    if (state.socket) state.socket.emit('dnd_resposta_teste', { pedidoId: p.id, charId: char.id, nome: char.name, total: res.total, falha: !!(res.falha && !res.dados.length) })
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = { abrirPedido, aoPedido, aoResposta, ORIGENS }
