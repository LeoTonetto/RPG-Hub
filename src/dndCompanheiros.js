// ══════════════════════════════════════════════════════════════════════════════
// src/dndCompanheiros.js — FORMA SELVAGEM E ALIADOS (painel 🐾 Criaturas)
//
// Decidido com o mestre (2026-11-03): a Forma Selvagem transforma de verdade
// (stats.forma = { id, pv }: a ficha passa a usar CA, FOR/DES/CON e ataques da
// besta, e o dano vai primeiro para os PV dela); familiar, companheiro animal,
// montaria e mortos-vivos ganham mini-ficha aqui, com PV e ataques.
//
// stats.companheiros: [{ id, criatura, nome, tipo, pv }]
// As fichas vêm de dndCriaturas.js (Apêndice D).
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const CR = require('./dndCriaturas')
const magiasUI = require('./dndMagiasUI')

const sheet = () => require('./dndSheet')
const combate = () => require('./dndCombate')

function chat(message) {
    if (state.socket) state.socket.emit('chat_message', { playerName: '🐾 Criaturas', message, type: 'text' })
}

/** A ficha tem algo para este painel? */
function temCriaturas(stats, f) {
    return (stats.classe === 'druida' && f.nivel >= 2) || CR.aliadosPossiveis(stats, f).length > 0
        || (stats.companheiros || []).length > 0 || !!state.isRoomMaster
}

function abrirPainel(stats, canEdit) {
    const char = state.statPopupChar
    if (!char) return
    const { body } = sheet().painel('dndCriaturas', '🐾 Criaturas', 'ds-painel-magia')
    body.innerHTML = ''
    const f = dnd.calcular(stats)
    if (stats.classe === 'druida' && f.nivel >= 2) body.appendChild(secaoFormaSelvagem(char, stats, f, canEdit))
    body.appendChild(secaoAliados(char, stats, f, canEdit))
}

function redesenhar(char) {
    const el = document.getElementById('dndCriaturas')
    const aberto = state.statPopupChar
    if (!el || !el.classList.contains('visible') || !aberto || aberto.id !== char.id) return
    abrirPainel(aberto.stats || {}, !!state.isRoomMaster || state.playerCharacters.some(c => c.id === aberto.id))
}

// ── Forma Selvagem ────────────────────────────────────────────────────────────

function secaoFormaSelvagem(char, stats, f, canEdit) {
    const w = mk('div', 'dk-secao')
    w.appendChild(mk('div', 'ds-grupo', 'Forma Selvagem'))
    const lim = CR.limitesDaForma(f.nivel, stats.subclasse)
    const nd = lim.nd < 1 ? `1/${Math.round(1 / lim.nd)}` : String(lim.nd)
    w.appendChild(mk('div', 'ds-legenda', `Até ND ${nd}${lim.natacao ? '' : ', sem natação'}${lim.voo ? '' : ', sem voo'}. Dura ${Math.max(1, Math.floor(f.nivel / 2))} h. ${stats.subclasse === 'lua' ? 'Ação bônus (Círculo da Lua).' : 'Gasta a ação.'}`))

    // Transformar, voltar e curar são habilidades (dndHabilidades): o custo e
    // as travas do turno são os mesmos aqui e no palco da batalha
    const H = require('./dndHabilidades')
    const hab = id => H.lista(char).find(h => h.id === id)
    const trava = h => (h ? H.motivo(char, h, 1) : 'Indisponível')
    const usarHab = (h, valores) => {
        const m = H.usar(char, h, valores)
        if (m) combate().aviso(m)
        sheet().reabrirFicha()
        abrirPainel(state.statPopupChar.stats, canEdit)
    }

    if (f.forma) {
        w.appendChild(fichaCriatura(f.forma, { pv: f.forma.pv, pvMax: f.forma.pvMax }))
        if (canEdit) {
            const linha = mk('div', 'ds-magia-botoes')
            const hVoltar = hab('forma-voltar')
            const voltar = mk('button', 'ds-magia-btn', 'Voltar à forma normal')
            const tv = trava(hVoltar)
            voltar.disabled = !!tv
            voltar.title = tv || 'Gasta a ação bônus'
            voltar.addEventListener('click', () => usarHab(hVoltar))
            linha.appendChild(voltar)
            // Forma Selvagem de Combate (Lua): espaço de magia vira cura de 1d8 por nível
            const hCurar = hab('forma-curar')
            const livres = dnd.espacosLivres(stats, f, 1)
            if (hCurar && livres.length) {
                const sel = document.createElement('select')
                sel.className = 'dc-select'
                sel.setAttribute('aria-label', 'Espaço de magia')
                livres.forEach(e => sel.appendChild(new Option(`${e.nivel}º · ${e.nivel}d8`, e.id)))
                const curar = mk('button', 'ds-magia-btn', 'Curar com espaço')
                const tc = trava(hCurar)
                curar.disabled = !!tc
                curar.title = tc || 'Gasta a ação bônus e o espaço; cura 1d8 por nível dele'
                curar.addEventListener('click', () => usarHab(hCurar, { espaco: livres.find(x => x.id === sel.value) }))
                linha.appendChild(sel)
                linha.appendChild(curar)
            }
            w.appendChild(linha)
        }
        return w
    }

    if (!canEdit) return w
    const formas = CR.formasPermitidas(f.nivel, stats.subclasse)
    const hForma = hab('forma-selvagem')
    const linha = mk('div', 'ds-magia-botoes')
    const sel = document.createElement('select')
    sel.className = 'dc-select'
    sel.setAttribute('aria-label', 'Besta')
    formas.forEach(c => sel.appendChild(new Option(`${c.nome} · ND ${c.nd} · CA ${c.ca} · ${c.pv} PV`, c.id)))
    const ir = mk('button', 'ds-magia-btn principal', 'Transformar')
    const tf = trava(hForma)
    ir.disabled = !formas.length || !!tf
    ir.title = tf || `Gasta um uso de Forma Selvagem e ${stats.subclasse === 'lua' ? 'a ação bônus' : 'a ação'}`
    // O druida mantém a concentração na forma, mas não conjura
    ir.addEventListener('click', () => usarHab(hForma, { besta: sel.value }))
    linha.appendChild(sel)
    linha.appendChild(ir)
    w.appendChild(linha)
    return w
}

// ── Aliados ───────────────────────────────────────────────────────────────────

function secaoAliados(char, stats, f, canEdit) {
    const w = mk('div', 'dk-secao')
    w.appendChild(mk('div', 'ds-grupo', 'Aliados'))
    const lista = stats.companheiros || []
    if (!lista.length) w.appendChild(mk('div', 'ds-muted', 'Nenhum familiar, companheiro, montaria ou morto-vivo.'))

    lista.forEach(al => {
        const ficha = CR.fichaDoAliado(al, f)
        if (!ficha) return
        const card = mk('div', 'dk-aliado')
        const cab = mk('div', 'dk-aliado-cab')
        cab.appendChild(mk('b', null, ficha.nome))
        cab.appendChild(mk('span', 'ds-muted', `${CR.TIPOS_DE_ALIADO[al.tipo] || 'Criatura'} · ${CR.criatura(al.criatura).nome}`))
        card.appendChild(cab)
        const pv = Math.max(0, Math.min(al.pv ?? ficha.pv, ficha.pvMax))
        card.appendChild(fichaCriatura(ficha, { pv, pvMax: ficha.pvMax }, canEdit ? {
            atacar: at => require('./dndArmas').ataqueDeCriatura(char, ficha.nome, at, { tipo: 'livre' }),
            mudarPv: novo => mudarAliado(char, al.id, { pv: Math.max(0, Math.min(ficha.pvMax, novo)) }),
        } : null))
        if (ficha.nota) card.appendChild(mk('div', 'ds-legenda', ficha.nota))
        if (al.tipo === 'familiar') card.appendChild(mk('div', 'ds-legenda', 'O familiar não ataca; ajuda (Ajudar) e entrega magias de toque. No Pacto da Corrente, troque um ataque seu por um ataque dele com a reação.'))
        if (canEdit) {
            const tirar = mk('button', 'ds-link', 'dispensar')
            tirar.addEventListener('click', () => {
                sheet().gravar(char.id, { companheiros: (stats.companheiros || []).filter(x => x.id !== al.id) })
                chat(`${ficha.nome} deixa ${char.name}.`)
                abrirPainel(state.statPopupChar.stats, canEdit)
            })
            card.appendChild(tirar)
        }
        w.appendChild(card)
    })

    if (!canEdit) return w
    // O que dá para chamar: o que a ficha permite; o mestre pode dar qualquer criatura
    const grupos = CR.aliadosPossiveis(stats, f)
    if (state.isRoomMaster) grupos.push({ tipo: 'outro', origem: 'Mestre', ids: CR.todas().map(c => c.id) })
    if (!grupos.length) return w
    const sel = document.createElement('select')
    sel.className = 'dc-select'
    sel.setAttribute('aria-label', 'Criatura')
    grupos.forEach(g => {
        const og = document.createElement('optgroup')
        og.label = `${CR.TIPOS_DE_ALIADO[g.tipo]} · ${g.origem}`
        g.ids.forEach(id => { const c = CR.criatura(id); if (c) og.appendChild(new Option(`${c.nome} (ND ${c.nd})`, `${g.tipo}:${id}`)) })
        sel.appendChild(og)
    })
    const nome = document.createElement('input')
    nome.className = 'room-input'
    nome.placeholder = 'Nome (opcional)'
    nome.setAttribute('aria-label', 'Nome do aliado')
    nome.addEventListener('keydown', e => e.stopPropagation())
    const add = mk('button', 'ds-magia-btn principal', '+ Chamar')
    add.addEventListener('click', () => {
        const [tipo, id] = sel.value.split(':')
        const c = CR.criatura(id)
        if (!c) return
        const novo = { id: 'k' + Math.random().toString(36).slice(2, 8), criatura: id, tipo, nome: nome.value.trim().slice(0, 30) || '' }
        const ficha = CR.fichaDoAliado(novo, f)
        novo.pv = ficha.pv
        // Companheiro animal e familiar: só um de cada por vez (LdJ p. 119 e p. 241)
        const atuais = (stats.companheiros || []).filter(x => (tipo === 'companheiro' || tipo === 'familiar') ? x.tipo !== tipo : true)
        sheet().gravar(char.id, { companheiros: [...atuais, novo] })
        chat(`${char.name} chama ${novo.nome || c.nome.toLowerCase()} (${CR.TIPOS_DE_ALIADO[tipo].toLowerCase()}).`)
        abrirPainel(state.statPopupChar.stats, canEdit)
    })
    w.appendChild(sel)
    w.appendChild(nome)
    w.appendChild(add)
    return w
}

function mudarAliado(char, id, campos) {
    const atual = (state.statPopupChar && state.statPopupChar.id === char.id ? state.statPopupChar : char).stats || {}
    sheet().gravar(char.id, { companheiros: (atual.companheiros || []).map(x => (x.id === id ? { ...x, ...campos } : x)) })
    redesenhar(char)
}

/** Mini-ficha: CA, PV (com −/+), deslocamento, atributos e ataques. */
function fichaCriatura(c, { pv, pvMax }, acoes) {
    const w = mk('div', 'dk-ficha')
    const nums = mk('div', 'dk-nums')
    nums.appendChild(mk('span', null, `CA ${c.ca}`))
    const pvEl = mk('span', 'dk-pv')
    if (acoes && acoes.mudarPv) {
        const menos = mk('button', 'sp-adj-btn', '−')
        menos.title = 'Dano'
        const qtd = document.createElement('input')
        qtd.type = 'number'
        qtd.min = '1'
        qtd.value = '1'
        qtd.className = 'sp-stat-input dk-qtd'
        qtd.setAttribute('aria-label', 'Quantidade')
        qtd.addEventListener('keydown', e => e.stopPropagation())
        const mais = mk('button', 'sp-adj-btn', '+')
        mais.title = 'Cura'
        menos.addEventListener('click', () => acoes.mudarPv(pv - (parseInt(qtd.value, 10) || 1)))
        mais.addEventListener('click', () => acoes.mudarPv(pv + (parseInt(qtd.value, 10) || 1)))
        pvEl.appendChild(mk('b', null, `${pv}/${pvMax} PV`))
        pvEl.appendChild(menos)
        pvEl.appendChild(qtd)
        pvEl.appendChild(mais)
    } else {
        pvEl.appendChild(mk('b', null, `${pv}/${pvMax} PV`))
    }
    nums.appendChild(pvEl)
    nums.appendChild(mk('span', null, c.deslocamento))
    w.appendChild(nums)
    const at = ['for', 'des', 'con', 'int', 'sab', 'car'].map(k => `${k.toUpperCase()} ${c.atributos[k]} (${dnd.sinal(CR.mod(c.atributos[k]))})`).join(' · ')
    w.appendChild(mk('div', 'ds-legenda', at))
    if (c.sentidos || c.pericias) w.appendChild(mk('div', 'ds-legenda', [c.pericias, c.sentidos].filter(Boolean).join(' · ')))
    if (c.tracos && c.tracos.length) w.appendChild(mk('div', 'ds-legenda', `Traços: ${c.tracos.join(', ')}${c.pag ? ` (LdJ p. ${c.pag})` : ''}`))
    ;(c.ataques || []).forEach(a => {
        const linha = mk('div', 'da-forma-ataque')
        linha.appendChild(mk('b', null, a.nome))
        linha.appendChild(mk('span', null, `${dnd.sinal(a.bonus)} · ${a.dano} ${a.tipoDano}${a.extra ? ` · ${a.extra}` : ''}`))
        if (acoes && acoes.atacar) {
            const b = mk('button', 'ds-magia-btn', '⚔')
            b.title = `Atacar com ${a.nome}`
            b.setAttribute('aria-label', b.title)
            b.addEventListener('click', () => acoes.atacar(a))
            linha.appendChild(b)
        }
        w.appendChild(linha)
    })
    return w
}

/** Botões de ataque do aliado, para o turno dele na batalha. */
function ataquesDoAliado(char, aliadoId) {
    const st = char.stats || {}
    const al = (st.companheiros || []).find(x => x.id === aliadoId)
    if (!al) return []
    const ficha = CR.fichaDoAliado(al, dnd.calcular(st))
    return (ficha ? ficha.ataques : []).map(at => ({ rotulo: `⚔ ${at.nome} ${dnd.sinal(at.bonus)}`, acao: () => require('./dndArmas').ataqueDeCriatura(char, ficha.nome, at, { tipo: 'livre' }) }))
}

// ── Cardzinho ao lado do card do personagem ───────────────────────────────────

/**
 * Os aliados do personagem em cardzinhos (ícone, nome e PV), para ficar ao
 * lado do card dele na sala e no palco da batalha. Duas linhas; mais aliados
 * abrem novas colunas. Devolve null se ele não tem aliados.
 *   opts.atualId: id do aliado que está no turno (destaque no palco)
 *   opts.aoClicar(el): abre a ficha (só dono e mestre)
 */
function cardsDosAliados(char, { atualId, aoClicar } = {}) {
    const st = char.stats || {}
    const f = dnd.calcular(st)
    const w = mk('div', 'aliados-mini')
    w.dataset.donoId = char.id
    ;(st.companheiros || []).forEach(al => {
        const ficha = CR.fichaDoAliado(al, f)
        if (!ficha) return
        const pv = Math.max(0, Math.min(al.pv ?? ficha.pv, ficha.pvMax))
        const c = mk('div', 'aliado-mini' + (pv <= 0 ? ' caido' : '') + (atualId === al.id ? ' atual' : ''))
        c.title = `${ficha.nome} · ${CR.TIPOS_DE_ALIADO[al.tipo] || 'Criatura'} de ${char.name} · CA ${ficha.ca} · ${pv}/${ficha.pvMax} PV`
        c.appendChild(magiasUI.icone(CR.icone(al.criatura), 'aliado-mini-icone'))
        const info = mk('div', 'aliado-mini-info')
        info.appendChild(mk('b', null, ficha.nome))
        const barra = mk('div', 'aliado-mini-barra')
        const fill = mk('div')
        fill.style.width = `${Math.round((pv / ficha.pvMax) * 100)}%`
        barra.appendChild(fill)
        info.appendChild(barra)
        info.appendChild(mk('span', null, `${pv}/${ficha.pvMax}`))
        c.appendChild(info)
        if (aoClicar) {
            c.classList.add('clicavel')
            c.addEventListener('click', ev => { ev.stopPropagation(); aoClicar(c) })
        }
        w.appendChild(c)
    })
    if (!w.childNodes.length) return null
    w.style.setProperty('--linhas', String(Math.min(2, w.childNodes.length)))
    return w
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = { temCriaturas, abrirPainel, ataquesDoAliado, fichaCriatura, cardsDosAliados }
