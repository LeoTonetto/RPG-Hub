// ══════════════════════════════════════════════════════════════════════════════
// src/dndMagiasUI.js — TELA DE MAGIAS (no espírito do Baldur's Gate 3)
//
// Grade de ícones por nível de magia, com busca, e um painel de detalhe que
// mostra a magia sob o mouse ou a última clicada. Usada na criação, na subida
// de nível e (só o detalhe) na ficha.
//
// Ícones: game-icons.net (CC BY 3.0), em assets/icones. Viram máscara CSS, então
// ficam na cor da sala.
// ══════════════════════════════════════════════════════════════════════════════

const dnd = require('./dnd')
const D = require('./dndDados')

const NOME_NIVEL = n => (n === 0 ? 'Truque' : `${n}º nível`)

// Estado de cada seletor (aba, busca, magia em destaque), por vaga: o
// componente é redesenhado a cada clique e não pode perder isso
const estado = {}

/**
 * Ícone do pacote game-icons ("autor/nome"), pintado com a cor do texto.
 * O endereço vai absoluto: url() relativo dentro de variável CSS é resolvido
 * a partir da folha de estilo que usa a variável (css/), não da página.
 */
function icone(nome, cls) {
    const el = document.createElement('span')
    el.className = 'dm-icone' + (cls ? ' ' + cls : '')
    if (nome) {
        const href = new URL(`assets/icones/${nome.replace('/', '-')}.svg`, document.baseURI).href
        el.style.setProperty('--icone', `url("${href}")`)
    }
    el.setAttribute('aria-hidden', 'true')
    return el
}

/**
 * Seletor de magias para uma vaga.
 *   opts.trocas      — subida de nível: quantas magias antigas pode trocar
 *   opts.originais   — o que a vaga tinha antes da subida
 */
function seletor(alvo, vaga, aoMudar, opts = {}) {
    const st = estado[vaga.key] = estado[vaga.key] || { aba: null, busca: '', foco: null }
    const opcoes = dnd.opcoesDaVaga(alvo, vaga)
    const sel = new Set(alvo.escolhas[vaga.key] || [])
    const originais = new Set(opts.originais || [])
    const removidas = [...originais].filter(id => !sel.has(id)).length
    const podeTirarOriginal = removidas < (opts.trocas || 0)

    const niveis = [...new Set(opcoes.map(o => o.magia.nivel))].sort((a, b) => a - b)
    if (st.aba == null || (st.aba !== 'escolhidas' && !niveis.includes(st.aba))) st.aba = niveis[0] ?? 0

    const wrap = mk('div', 'dm-seletor')

    // ── Abas por nível ───────────────────────────────────────────────────────
    const topo = mk('div', 'dm-topo')
    const abas = mk('div', 'dm-abas')
    const aba = (id, rot, conta) => {
        const b = mk('button', 'dm-aba' + (st.aba === id ? ' on' : ''))
        b.type = 'button'
        b.appendChild(mk('span', null, rot))
        if (conta) b.appendChild(mk('b', null, String(conta)))
        b.addEventListener('click', () => { st.aba = id; aoMudar() })
        return b
    }
    niveis.forEach(n => abas.appendChild(aba(n, n === 0 ? 'Truques' : `${n}º`, opcoes.filter(o => o.magia.nivel === n && sel.has(o.id)).length)))
    if (sel.size) abas.appendChild(aba('escolhidas', 'Escolhidas', sel.size))
    topo.appendChild(abas)

    const busca = document.createElement('input')
    busca.type = 'search'
    busca.className = 'room-input dm-busca'
    busca.placeholder = 'Buscar magia'
    busca.setAttribute('aria-label', 'Buscar magia')
    busca.value = st.busca
    busca.addEventListener('input', () => {
        st.busca = busca.value
        // Filtra no lugar, sem redesenhar: o campo não perde o foco
        filtrar(grade, st.busca)
    })
    busca.addEventListener('keydown', e => e.stopPropagation())
    topo.appendChild(busca)
    wrap.appendChild(topo)

    if (opts.trocas) {
        wrap.appendChild(mk('div', 'dm-trocas', podeTirarOriginal
            ? `Pode trocar ${opts.trocas - removidas} magia já conhecida: desmarque uma e escolha outra.`
            : 'Troca usada neste nível.'))
    }

    // ── Grade e detalhe ──────────────────────────────────────────────────────
    const corpo = mk('div', 'dm-corpo')
    const grade = mk('div', 'dm-grade')
    const detalhe = mk('div', 'dm-detalhe')

    const visiveis = st.aba === 'escolhidas' ? opcoes.filter(o => sel.has(o.id)) : opcoes.filter(o => o.magia.nivel === st.aba)
    visiveis.forEach(o => {
        const on = sel.has(o.id)
        const travadaOriginal = on && originais.has(o.id) && !podeTirarOriginal
        const b = mk('button', 'dm-tile' + (on ? ' on' : '') + (o.bloqueado && !on ? ' bloqueado' : ''))
        b.type = 'button'
        b.dataset.busca = semAcento(o.nome)
        b.title = o.bloqueado && !on ? `${o.nome}: ${o.motivo}` : o.nome
        b.appendChild(icone(o.magia.icone))
        b.appendChild(mk('span', 'dm-tile-nome', o.nome))
        if (o.magia.concentracao) b.appendChild(mk('span', 'dm-tile-marca', 'C'))
        b.addEventListener('mouseenter', () => desenharDetalhe(detalhe, o.magia, o.bloqueado && !on ? o.motivo : null))
        b.addEventListener('focus', () => desenharDetalhe(detalhe, o.magia, o.bloqueado && !on ? o.motivo : null))
        b.addEventListener('click', () => {
            st.foco = o.id
            if ((o.bloqueado && !on) || travadaOriginal) {
                desenharDetalhe(detalhe, o.magia, travadaOriginal ? 'já trocou uma magia neste nível' : o.motivo)
                return piscar(wrap)
            }
            let novo = [...sel]
            if (on) novo = novo.filter(x => x !== o.id)
            else if (vaga.qtd === 1) novo = [o.id]
            else if (novo.length < vaga.qtd) novo.push(o.id)
            else return piscar(wrap)
            alvo.escolhas[vaga.key] = novo
            aoMudar()
        })
        grade.appendChild(b)
    })
    if (!visiveis.length) grade.appendChild(mk('div', 'dm-vazio', 'Nenhuma magia aqui.'))
    filtrar(grade, st.busca)

    const foco = (st.foco && opcoes.find(o => o.id === st.foco)) || visiveis.find(o => sel.has(o.id)) || visiveis[0]
    if (foco) desenharDetalhe(detalhe, foco.magia, foco.bloqueado && !sel.has(foco.id) ? foco.motivo : null)

    corpo.appendChild(grade)
    corpo.appendChild(detalhe)
    wrap.appendChild(corpo)
    wrap.appendChild(mk('div', 'dm-creditos', 'Ícones: game-icons.net (CC BY 3.0)'))
    return wrap
}

function filtrar(grade, termo) {
    const t = semAcento(termo || '')
    grade.querySelectorAll('.dm-tile').forEach(b => { b.hidden = !!t && !b.dataset.busca.includes(t) })
}

/** Painel de detalhe de uma magia. `extra` acrescenta botões (ficha). */
function desenharDetalhe(el, m, aviso, extra) {
    el.innerHTML = ''
    if (!m) return el
    const cab = mk('div', 'dm-det-cab')
    cab.appendChild(icone(m.icone, 'grande'))
    const tit = mk('div', 'dm-det-titulo')
    tit.appendChild(mk('b', null, m.nome))
    const sub = [`${NOME_NIVEL(m.nivel)} de ${m.escola}`]
    if (m.ritual) sub.push('ritual')
    if (m.concentracao) sub.push('concentração')
    tit.appendChild(mk('span', null, sub.join(' · ')))
    cab.appendChild(tit)
    el.appendChild(cab)

    if (aviso) el.appendChild(mk('div', 'dm-det-aviso', aviso))

    const linhas = mk('div', 'dm-det-linhas')
    ;[['Tempo', m.tempo], ['Alcance', m.alcance], ['Componentes', m.componentes + (m.material ? ` (${m.material})` : '')], ['Duração', m.duracao]]
        .forEach(([r, v]) => {
            const l = mk('div', 'dm-det-linha')
            l.appendChild(mk('span', null, r))
            l.appendChild(mk('span', null, v || '—'))
            linhas.appendChild(l)
        })
    el.appendChild(linhas)

    const mec = []
    if (m.ataque) mec.push(m.ataque === 'corpo' ? 'Ataque corpo-a-corpo' : 'Ataque à distância')
    if (m.resistencia) mec.push(`Teste de ${D.ATRIBUTO_POR_KEY[m.resistencia].abrev}`)
    if (m.dano) mec.push(`Dano ${m.dano}`)
    if (m.cura) mec.push(`Cura ${m.cura}`)
    if (m.superior) mec.push(`+${m.superior} por nível acima`)
    if (m.escalaTruque) mec.push('cresce nos níveis 5, 11 e 17')
    if (mec.length) el.appendChild(mk('div', 'dm-det-mec', mec.join(' · ')))

    if (m.resumo) el.appendChild(mk('p', 'dm-det-resumo', m.resumo))
    const rod = mk('div', 'dm-det-rodape')
    rod.appendChild(mk('span', null, m.homebrew ? 'Magia da mesa' : `LdJ p. ${m.pag}`))
    rod.appendChild(mk('span', null, (m.classes || []).map(c => dnd.NOME_DA_LISTA[c] || c).join(', ')))
    el.appendChild(rod)
    if (extra) el.appendChild(extra)
    return el
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

function semAcento(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function piscar(el) {
    el.classList.remove('piscar')
    void el.offsetWidth
    el.classList.add('piscar')
}

/** Esquece o estado dos seletores (nova criação ou nova subida). */
function reiniciar() {
    Object.keys(estado).forEach(k => delete estado[k])
}

module.exports = { seletor, desenharDetalhe, icone, reiniciar, NOME_NIVEL }
