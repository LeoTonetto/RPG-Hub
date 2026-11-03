// ══════════════════════════════════════════════════════════════════════════════
// src/dndEstadoUI.js — VIDA, MORTE, CONDIÇÕES E CONCENTRAÇÃO NA TELA (D&D)
//
// As regras estão em dndCondicoes.js; aqui é o que a ficha e a batalha
// mostram e o que acontece ao clicar. Dano e cura passam sempre por
// danoNoPersonagem / curaNoPersonagem, venham da ficha (dono ou mestre) ou
// do resultado de um ataque na batalha.
//
// O teste de concentração é do dono: quem aplica o dano grava
// stats.concentracao_pendente = { cd }, e o app do dono pergunta (socket.js
// avisa aqui quando o campo chega). Testes contra a morte são públicos
// (decidido com o mestre em 2026-11-03).
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const D = require('./dndDados')
const CD = require('./dndCondicoes')
const rolagem = require('./dndRolagem')

const sheet = () => require('./dndSheet')

function chat(message, playerName = '⚙ Sistema') {
    if (state.socket) state.socket.emit('chat_message', { playerName, message, type: 'text' })
}

function ehMeu(charId) {
    return state.playerCharacters.some(c => c.id === charId)
}

/** O personagem mais atual que este app conhece. */
function charPorId(charId) {
    const meu = state.playerCharacters.find(c => c.id === charId)
    if (meu) return meu
    const e = state.allCharsCache.find(x => x.character.id === charId)
    return e ? e.character : null
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Dano e cura ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** op: { tipo, critico, magico, fonte } — fonte só aparece no chat. */
function danoNoPersonagem(char, qtd, op = {}) {
    const stats = char.stats || {}
    const f = dnd.calcular(stats)
    const r = CD.aplicarDano(stats, f, qtd, op)
    const campos = { ...r.campos }
    if (r.concentracao) campos.concentracao_pendente = { cd: r.concentracao, quando: Date.now() }
    if (Object.keys(campos).length) sheet().gravar(char.id, campos)
    const partes = [`sofre ${r.dano}${op.tipo ? ` de ${op.tipo}` : ''}`, ...r.eventos]
    chat(`${char.name} ${partes.join(' · ')}.`)
    try { require('./characters').flashCard(char.id, 'red') } catch (e) { /* card fora da tela */ }
    if (r.implacavel) furiaImplacavel(char, r.implacavel)
    if (r.concentracao && ehMeu(char.id)) pedirConcentracao(char.id)
    return r
}

function curaNoPersonagem(char, qtd) {
    const stats = char.stats || {}
    const f = dnd.calcular(stats)
    const campos = CD.curar(stats, f, qtd)
    if (!Object.keys(campos).length) return
    const voltou = (stats.hp ?? 1) <= 0 && !stats.forma
    sheet().gravar(char.id, campos)
    if (voltou) chat(`${char.name} recupera a consciência.`)
    try { require('./characters').flashCard(char.id, 'blue') } catch (e) { /* card fora da tela */ }
}

/** Fúria Implacável: resistência de CON contra a CD, que sobe 5 a cada uso. */
function furiaImplacavel(char, cd) {
    const stats = char.stats || {}
    const f = dnd.calcular(stats)
    const r = rolagem.testeD20({
        personagem: char.name, rotulo: `Fúria Implacável (CD ${cd} CON)`, bonus: f.resistencias.con.bonus, tipo: 'teste',
        auto: CD.modoAutomatico(stats, f, { tipo: 'resistencia', atributo: 'con' }),
    })
    const passou = r.total >= cd
    sheet().gravar(char.id, CD.resultadoImplacavel(stats, passou))
    chat(passou ? `${char.name} se recusa a cair: fica com 1 PV (Fúria Implacável).` : `${char.name} cai inconsciente.`)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Concentração ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Pergunta ao dono pelo teste de concentração pendente. */
function pedirConcentracao(charId) {
    const char = charPorId(charId)
    if (!char || !ehMeu(charId)) return
    const st = char.stats || {}
    const pend = st.concentracao_pendente
    if (!pend || !st.concentracao) return
    require('./dndCombate').perguntar({
        titulo: '◉ Concentração',
        texto: `${char.name} sofreu dano mantendo ${st.concentracao.nome}: teste de resistência de CON, CD ${pend.cd}.`,
        opcoes: [{ rotulo: '🎲 Rolar CON', principal: true, acao: () => testeConcentracao(char) }],
        semRecusa: true,
    })
}

function testeConcentracao(char) {
    const stats = char.stats || {}
    const pend = stats.concentracao_pendente
    if (!pend || !stats.concentracao) return
    const f = dnd.calcular(stats)
    const auto = CD.modoAutomatico(stats, f, { tipo: 'resistencia', atributo: 'con' })
    if (f.talentos.includes('conjurador-de-guerra')) auto.vantagem.push('Conjurador de Guerra')
    const r = rolagem.testeD20({ personagem: char.name, rotulo: `Concentração em ${stats.concentracao.nome} (CD ${pend.cd})`, bonus: f.resistencias.con.bonus, tipo: 'teste', auto })
    const manteve = r.total >= pend.cd
    sheet().gravar(char.id, manteve ? { concentracao_pendente: null } : { concentracao_pendente: null, concentracao: null })
    chat(manteve ? `${char.name} mantém a concentração em ${stats.concentracao.nome}.` : `${char.name} perde a concentração em ${stats.concentracao.nome}.`)
    sheet().reabrirFicha()
}

/** Ao conjurar uma magia de concentração: a anterior acaba. */
function concentrar(char, magia) {
    const stats = char.stats || {}
    const { campos, anterior } = CD.concentrarEm(stats, magia)
    sheet().gravar(char.id, campos)
    if (anterior && anterior.id !== magia.id) chat(`${char.name} deixa de se concentrar em ${anterior.nome}.`)
}

function encerrarConcentracao(char) {
    const c = (char.stats || {}).concentracao
    if (!c) return
    sheet().gravar(char.id, { concentracao: null, concentracao_pendente: null })
    chat(`${char.name} encerra a concentração em ${c.nome}.`)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Testes contra a morte ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function testeMorte(char) {
    const stats = char.stats || {}
    if (!CD.caido(stats) || (stats.morte && stats.morte.estavel)) return
    const f = dnd.calcular(stats)
    const r = rolagem.testeD20({ personagem: char.name, rotulo: 'Teste contra a morte', bonus: 0, tipo: 'teste', auto: CD.modoAutomatico(stats, f, { tipo: 'morte' }) })
    const { campos, texto } = CD.testeContraMorte(stats, r.natural)
    sheet().gravar(char.id, campos)
    chat(`💀 ${char.name}: ${texto}.`)
    sheet().reabrirFicha()
}

function estabilizar(char) {
    sheet().gravar(char.id, CD.estabilizar(char.stats || {}))
    chat(`${char.name} foi estabilizado (continua inconsciente a 0 PV).`)
    sheet().reabrirFicha()
}

/** Mestre: tira o "morto" da ficha (ressurreição, decisão da mesa). */
function reviver(char) {
    sheet().gravar(char.id, { morte: null, hp: 1, condicoes: CD.semCondicao(char.stats || {}, 'inconsciente') })
    chat(`${char.name} volta à vida com 1 PV.`)
    sheet().reabrirFicha()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Blocos da ficha ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Forma Selvagem, 0 PV, condições e concentração, logo abaixo dos PV. */
function blocoEstado(char, stats, f, canEdit) {
    const w = mk('div', 'de-estado')

    // Forma Selvagem: a barra da besta vem primeiro
    if (f.forma) {
        const fs = mk('div', 'de-forma')
        const cab = mk('div', 'de-forma-cab')
        cab.appendChild(mk('b', null, `🐾 ${f.forma.nome}`))
        cab.appendChild(mk('span', null, `${f.forma.pv} / ${f.forma.pvMax} PV da forma`))
        fs.appendChild(cab)
        const barra = mk('div', 'ds-pv-barra')
        const fill = mk('div', 'ds-pv-fill de-forma-fill')
        fill.style.width = `${Math.round((f.forma.pv / f.forma.pvMax) * 100)}%`
        barra.appendChild(fill)
        fs.appendChild(barra)
        if (canEdit) {
            const b = mk('button', 'ds-link', 'voltar à forma normal')
            b.title = 'Gasta a ação bônus'
            b.addEventListener('click', () => {
                const H = require('./dndHabilidades')
                const h = H.lista(char).find(x => x.id === 'forma-voltar')
                const m = h ? H.usar(char, h) : ''
                if (m) require('./dndCombate').aviso(m)
                sheet().reabrirFicha()
            })
            fs.appendChild(b)
        }
        w.appendChild(fs)
    }

    // 0 PV: testes contra a morte
    if (CD.morto(stats)) {
        const m = mk('div', 'de-morte morto')
        m.appendChild(mk('b', null, '💀 Morto'))
        if (state.isRoomMaster) {
            const b = mk('button', 'ds-link', 'reviver (mestre)')
            b.addEventListener('click', () => reviver(char))
            m.appendChild(b)
        }
        w.appendChild(m)
    } else if (CD.caido(stats)) {
        const morte = stats.morte || { sucessos: 0, falhas: 0 }
        const m = mk('div', 'de-morte')
        m.appendChild(mk('b', null, morte.estavel ? '💤 Estável a 0 PV' : '💀 Morrendo'))
        const pips = mk('div', 'de-morte-pips')
        const linha = (rot, n, cls) => {
            const l = mk('span', 'de-morte-linha')
            l.appendChild(mk('span', null, rot))
            for (let i = 0; i < 3; i++) l.appendChild(mk('span', `de-pip ${cls}${i < n ? ' on' : ''}`))
            pips.appendChild(l)
        }
        linha('Sucessos', morte.sucessos || 0, 'ok')
        linha('Falhas', morte.falhas || 0, 'falha')
        m.appendChild(pips)
        if (canEdit && !morte.estavel) {
            const botoes = mk('div', 'de-morte-botoes')
            const rolar = mk('button', 'ds-magia-btn principal', '🎲 Teste contra a morte')
            rolar.title = '10 ou mais é sucesso; 1 natural, duas falhas; 20 natural, volta com 1 PV'
            rolar.addEventListener('click', () => testeMorte(char))
            botoes.appendChild(rolar)
            const est = mk('button', 'ds-magia-btn', 'Estabilizar')
            est.title = 'Medicina CD 10 de um aliado, Poupar os Moribundos ou kit de primeiros-socorros'
            est.addEventListener('click', () => estabilizar(char))
            botoes.appendChild(est)
            m.appendChild(botoes)
        }
        w.appendChild(m)
    }

    // Condições, exaustão e concentração
    const ativas = CD.condicoesAtivas(stats).filter(c => (stats.condicoes || []).includes(c))
    const chips = mk('div', 'de-chips')
    ativas.forEach(c => {
        const cond = D.CONDICOES[c]
        const chip = mk('span', 'de-chip', `${cond.icone} ${cond.nome}`)
        chip.title = cond.resumo
        chips.appendChild(chip)
    })
    if (stats.exaustao) {
        const chip = mk('span', 'de-chip alerta', `😩 Exaustão ${stats.exaustao}`)
        chip.title = D.EXAUSTAO.slice(1, stats.exaustao + 1).join(' · ')
        chips.appendChild(chip)
    }
    if (stats.concentracao) {
        const chip = mk('span', 'de-chip conc', `◉ ${stats.concentracao.nome}`)
        chip.title = 'Concentrando'
        if (canEdit) {
            const x = mk('button', 'de-chip-x', '✕')
            x.title = 'Encerrar a concentração'
            x.setAttribute('aria-label', 'Encerrar a concentração')
            x.addEventListener('click', () => { encerrarConcentracao(char); sheet().reabrirFicha() })
            chip.appendChild(x)
        }
        chips.appendChild(chip)
        if (stats.concentracao_pendente && ehMeu(char.id)) {
            const b = mk('button', 'ds-magia-btn principal', `🎲 Concentração (CD ${stats.concentracao_pendente.cd})`)
            b.addEventListener('click', () => testeConcentracao(char))
            chips.appendChild(b)
        }
    }
    // Proteção Arcana (abjurador)
    if (stats.protecao_arcana && stats.protecao_arcana.max) {
        const pa = stats.protecao_arcana
        const chip = mk('span', 'de-chip efeito', `🔷 Proteção Arcana ${pa.pv}/${pa.max}`)
        chip.title = 'Sofre o dano antes de você. Abjuração de 1º nível ou mais recarrega 2 por nível da magia.'
        chips.appendChild(chip)
    }
    // Prodígio (adivinho): cada d20 guardado, para usar antes de uma jogada
    ;(stats.prodigio || []).forEach((v, i) => {
        const b = mk('button', 'de-chip de-chip-add', `🔮 ${v}`)
        b.title = 'Prodígio: troca uma jogada de ataque, teste ou resistência por este valor (antes de rolar)'
        b.disabled = !canEdit
        b.addEventListener('click', () => require('./dndCombate').perguntar({
            titulo: `Prodígio: ${v}`, texto: 'Trocar uma jogada de ataque, teste ou resistência por este valor, antes de rolar.',
            opcoes: [
                { rotulo: 'No meu próximo d20', principal: true, acao: () => { require('./dndEfeitos').usarProdigio(char, i, true); sheet().reabrirFicha() } },
                { rotulo: 'Na jogada de outra criatura', acao: () => { require('./dndEfeitos').usarProdigio(char, i, false); sheet().reabrirFicha() } },
            ],
        }))
        chips.appendChild(b)
    })
    // Intervenção Divina atendida: só o mestre libera (7 dias de jogo)
    if (stats.intervencao_bloqueada) {
        const chip = mk('span', 'de-chip alerta', '🙏 Intervenção atendida')
        chip.title = 'Só pode pedir de novo depois de 7 dias de jogo'
        if (state.isRoomMaster) {
            const x = mk('button', 'de-chip-x', 'liberar')
            x.title = 'Passaram os 7 dias: pode pedir de novo'
            x.addEventListener('click', () => {
                const usados = { ...(stats.recursos_usados || {}) }
                delete usados.intervencao
                sheet().gravar(char.id, { intervencao_bloqueada: false, recursos_usados: usados })
                sheet().reabrirFicha()
            })
            chip.appendChild(x)
        }
        chips.appendChild(chip)
    }
    // Efeitos que outros puseram (Bênção, Inspiração...), com o ✕ para tirar
    require('./dndEfeitos').chipsDaFicha(char, stats).forEach(c => chips.appendChild(c))
    // Paladino (6º): quem está na aura
    if (canEdit && stats.classe === 'paladino' && f.nivel >= 6) {
        const n = (stats.aura_aliados || []).length
        const aura = mk('button', 'de-chip de-chip-add', `🔆 Aura · ${n}`)
        aura.title = 'Quem está perto (Aura de Proteção)'
        aura.addEventListener('click', () => require('./dndEfeitos').escolherAura(char).then(() => sheet().reabrirFicha()))
        chips.appendChild(aura)
    }
    if (canEdit) {
        const add = mk('button', 'de-chip de-chip-add', ativas.length || stats.exaustao ? '✎' : '+ Condição')
        add.title = 'Condições e exaustão'
        add.addEventListener('click', () => abrirPainelCondicoes(char, canEdit))
        chips.appendChild(add)
    }
    if (chips.childNodes.length) w.appendChild(chips)
    return w
}

function abrirPainelCondicoes(char, canEdit) {
    const { body } = sheet().painel('dndCondicoes', '🩹 Condições')
    body.innerHTML = ''
    const stats = (charPorId(char.id) || char).stats || {}
    const lista = mk('div', 'de-cond-lista')
    Object.entries(D.CONDICOES).forEach(([id, c]) => {
        const on = (stats.condicoes || []).includes(id)
        const b = mk('button', 'de-cond' + (on ? ' on' : ''))
        b.type = 'button'
        b.disabled = !canEdit
        b.setAttribute('aria-pressed', String(on))
        b.appendChild(mk('span', 'de-cond-icone', c.icone))
        const txt = mk('span', 'de-cond-txt')
        txt.appendChild(mk('b', null, c.nome))
        txt.appendChild(mk('span', null, c.resumo))
        b.appendChild(txt)
        b.addEventListener('click', () => {
            const atual = (charPorId(char.id) || char).stats || {}
            const novo = on ? CD.semCondicao(atual, id) : [...(atual.condicoes || []), id]
            const campos = { condicoes: novo }
            // Incapacitado não mantém concentração
            if (!on && D.CONDICOES[id].efeitos.semAcoes && atual.concentracao) { campos.concentracao = null; chat(`${char.name} perde a concentração em ${atual.concentracao.nome}.`) }
            sheet().gravar(char.id, campos)
            chat(`${char.name} ${on ? 'não está mais' : 'está'} ${c.nome.toLowerCase()}.`)
            abrirPainelCondicoes(char, canEdit)
            sheet().reabrirFicha()
        })
        lista.appendChild(b)
    })
    body.appendChild(lista)

    // Exaustão 0..6
    const ex = stats.exaustao || 0
    body.appendChild(mk('div', 'ds-grupo', 'Exaustão'))
    const linha = mk('div', 'de-exaustao')
    const menos = mk('button', 'sp-adj-btn', '−')
    menos.disabled = !canEdit || ex <= 0
    const mais = mk('button', 'sp-adj-btn', '+')
    mais.disabled = !canEdit || ex >= 6
    const mudar = n => {
        const campos = { exaustao: n }
        if (n >= 6) campos.morte = { sucessos: 0, falhas: 3, estavel: false, morto: true }
        sheet().gravar(char.id, campos)
        chat(n >= 6 ? `${char.name} morre de exaustão.` : `${char.name}: exaustão ${n}.`)
        abrirPainelCondicoes(char, canEdit)
        sheet().reabrirFicha()
    }
    menos.addEventListener('click', () => mudar(ex - 1))
    mais.addEventListener('click', () => mudar(ex + 1))
    linha.appendChild(menos)
    linha.appendChild(mk('b', null, String(ex)))
    linha.appendChild(mais)
    body.appendChild(linha)
    body.appendChild(mk('div', 'ds-legenda', ex ? D.EXAUSTAO.slice(1, ex + 1).join(' · ') : 'Sem exaustão. O descanso longo tira um nível.'))
}

/** socket.js chama quando um campo de ficha de D&D muda por outro app. */
function aoMudarCampo(charId, campo, valor) {
    if (campo === 'concentracao_pendente' && valor && ehMeu(charId)) pedirConcentracao(charId)
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = {
    danoNoPersonagem, curaNoPersonagem, pedirConcentracao, testeConcentracao, concentrar, encerrarConcentracao,
    testeMorte, estabilizar, reviver, blocoEstado, abrirPainelCondicoes, aoMudarCampo, charPorId,
}
