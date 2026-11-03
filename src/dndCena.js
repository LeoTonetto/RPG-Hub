// ══════════════════════════════════════════════════════════════════════════════
// src/dndCena.js — PALCO DA BATALHA (D&D)
//
// Decidido com o mestre (2026-11-03): enquanto a batalha está ligada, a sala
// vira um palco, como em Pokémon, Omori ou Persona:
//   • o fundo escurece; as criaturas ficam em cima (com barra de PV se o
//     mestre deu PV a elas: os jogadores veem só a barra, o mestre o número);
//   • o grupo fica embaixo, no lugar dos cards, com foto, PV, condições e a
//     economia do turno; clicar abre a ficha, e o 🎲 abre os testes;
//   • quem está no turno vê o menu de comandos 2×2: Atacar, Magia, Item e
//     Ações, que reaproveitam o que a ficha já faz;
//   • chat, ficha e testes continuam funcionando (o palco não bloqueia nada).
// Acaba quando o mestre encerra a batalha.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const D = require('./dndDados')
const CD = require('./dndCondicoes')
const magiasUI = require('./dndMagiasUI')

const combate = () => require('./dndCombate')
const armas = () => require('./dndArmas')
const sheet = () => require('./dndSheet')

let menu = 'principal'   // principal | atacar | magia | item | acoes
let magiaFoco = null
let chaveVista = null    // muda a cada turno: o menu volta ao principal

// ══════════════════════════════════════════════════════════════════════════════
// ── Desenho ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function desenhar() {
    const cb = combate()
    if (!cb.emBatalha() || state.roomSystem !== 'dnd') return limpar()
    document.body.classList.add('em-batalha')
    let palco = document.getElementById('cenaBatalha')
    if (!palco) {
        palco = mk('div')
        palco.id = 'cenaBatalha'
        palco.appendChild(mk('div', 'cn-inimigos'))
        palco.appendChild(mk('div', 'cn-grupo'))
        palco.appendChild(mk('div', 'cn-menu-area'))
        sheet().segurarCliques(palco)
        document.body.appendChild(palco)
    }
    const chave = cb.chaveDoTurno()
    if (chave !== chaveVista) { chaveVista = chave; menu = 'principal'; magiaFoco = null }
    desenharInimigos(palco.querySelector('.cn-inimigos'))
    desenharGrupo(palco.querySelector('.cn-grupo'))
    desenharMenu(palco.querySelector('.cn-menu-area'))
}

function limpar() {
    document.body.classList.remove('em-batalha')
    const p = document.getElementById('cenaBatalha')
    if (p) p.remove()
    menu = 'principal'
    chaveVista = null
}

/** Alguma ficha mudou (PV, condição, economia): redesenha se ela está na batalha. */
function aoMudarFicha(charId) {
    const cb = combate()
    if (!cb.emBatalha() || !document.getElementById('cenaBatalha')) return
    if (state.combate.ordem.some(e => e.charId === charId)) desenhar()
}

// ── Criaturas ─────────────────────────────────────────────────────────────────

function desenharInimigos(el) {
    el.innerHTML = ''
    const cb = combate()
    const atual = cb.entradaAtual()
    state.combate.ordem.filter(e => e.tipo === 'criatura' && !e.charId).forEach(e => {
        const temPv = e.pvMax != null
        const caida = temPv && (e.pv ?? e.pvMax) <= 0
        const card = mk('div', 'cn-cr' + (atual && atual.id === e.id ? ' atual' : '') + (caida ? ' caida' : ''))
        const topo = mk('div', 'cn-cr-topo')
        topo.appendChild(magiasUI.icone('sbed/death-skull', 'cn-cr-icone'))
        topo.appendChild(mk('b', 'cn-cr-nome', e.nome))
        topo.appendChild(mk('span', 'cn-ini', String(e.iniciativa)))
        card.appendChild(topo)
        if (temPv) {
            const pv = Math.max(0, e.pv ?? e.pvMax)
            const barra = mk('div', 'cn-barra')
            const fill = mk('div', 'cn-barra-fill inimigo')
            fill.style.width = `${Math.round((pv / e.pvMax) * 100)}%`
            barra.appendChild(fill)
            card.appendChild(barra)
            // O número só para o mestre, com os botões de dano e cura
            if (state.isRoomMaster) {
                const linha = mk('div', 'cn-cr-pv')
                const qtd = document.createElement('input')
                qtd.type = 'number'
                qtd.min = '1'
                qtd.className = 'room-input cn-qtd'
                qtd.placeholder = 'qtd'
                qtd.setAttribute('aria-label', `Dano ou cura em ${e.nome}`)
                qtd.addEventListener('keydown', ev => ev.stopPropagation())
                const n = () => Math.max(1, parseInt(qtd.value, 10) || 0)
                const dano = mk('button', 'sp-adj-btn', '−')
                dano.title = 'Dano'
                dano.addEventListener('click', () => { if (qtd.value) mudarPvCriatura(e, pv - n()) })
                const cura = mk('button', 'sp-adj-btn', '+')
                cura.title = 'Cura'
                cura.addEventListener('click', () => { if (qtd.value) mudarPvCriatura(e, Math.min(e.pvMax, pv + n())) })
                linha.appendChild(mk('span', 'cn-cr-num', `${pv}/${e.pvMax}`))
                linha.appendChild(dano)
                linha.appendChild(qtd)
                linha.appendChild(cura)
                card.appendChild(linha)
            }
        } else if (state.isRoomMaster) {
            const dar = mk('button', 'ds-link', 'dar PV')
            dar.title = 'Para os jogadores verem a barra de vida'
            dar.addEventListener('click', () => darPv(card, e))
            card.appendChild(dar)
        }
        el.appendChild(card)
    })
}

function darPv(card, e) {
    // Campo no próprio card (sem prompt do navegador)
    const linha = mk('div', 'cn-cr-pv')
    const i = document.createElement('input')
    i.type = 'number'
    i.min = '1'
    i.className = 'room-input cn-qtd'
    i.placeholder = 'PV'
    i.setAttribute('aria-label', `PV de ${e.nome}`)
    i.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') ok.click() })
    const ok = mk('button', 'sp-adj-btn', '✓')
    ok.addEventListener('click', () => {
        const v = parseInt(i.value, 10)
        if (v > 0 && state.socket) state.socket.emit('combate_pv', { id: e.id, pv: v, pvMax: v })
    })
    linha.appendChild(i)
    linha.appendChild(ok)
    card.querySelector('.ds-link').replaceWith(linha)
    i.focus()
}

function mudarPvCriatura(e, pv) {
    if (!state.socket) return
    state.socket.emit('combate_pv', { id: e.id, pv: Math.max(0, pv) })
    if (pv <= 0) state.socket.emit('chat_message', { playerName: '⚔ Batalha', message: `${e.nome} cai!`, type: 'text' })
}

// ── Grupo ─────────────────────────────────────────────────────────────────────

function desenharGrupo(el) {
    el.innerHTML = ''
    const cb = combate()
    const atual = cb.entradaAtual()
    state.combate.ordem.filter(e => e.tipo === 'pj' || (e.tipo === 'criatura' && e.charId)).forEach(e => {
        const char = cb.charDaEntrada(e)
        if (!char) return
        const st = char.stats || {}
        const meu = state.playerCharacters.some(c => c.id === char.id)
        const aliado = e.tipo === 'criatura'
        const card = mk('div', 'cn-pj' + (atual && atual.id === e.id ? ' atual' : '') + (meu ? ' meu' : '') + (aliado ? ' aliado' : '')
            + (CD.morto(st) && !aliado ? ' morto' : CD.caido(st) && !aliado ? ' caido' : ''))

        // Foto (ou ícone da classe; pata para o aliado)
        const foto = mk('div', 'cn-foto')
        if (!aliado && char.photo) { const img = document.createElement('img'); img.src = char.photo; img.alt = ''; foto.appendChild(img) }
        else {
            const cls = dnd.fontes(st).classe
            foto.appendChild(magiasUI.icone(aliado ? 'lorc/wolf-head' : (cls && cls.icone) || 'lorc/crossed-swords'))
        }
        card.appendChild(foto)

        const info = mk('div', 'cn-info')
        info.appendChild(mk('b', 'cn-nome', e.nome))
        if (aliado) {
            const al = (st.companheiros || []).find(x => e.id.endsWith(':' + x.id))
            const ficha = al && require('./dndCriaturas').fichaDoAliado(al, dnd.calcular(st))
            if (ficha) info.appendChild(barraPv(Math.max(0, al.pv ?? ficha.pv), ficha.pvMax, 0, ''))
        } else {
            const f = dnd.calcular(st)
            if (f.forma) info.appendChild(barraPv(f.forma.pv, f.forma.pvMax, 0, 'forma', `🐾 ${f.forma.nome}`))
            info.appendChild(barraPv(Math.max(0, st.hp ?? f.pvMax), f.pvMax, st.hp_temp || 0, ''))
            // Condições, concentração, 0 PV
            const marcas = []
            if (CD.morto(st)) marcas.push('💀 morto')
            else if (CD.caido(st)) {
                const m = st.morte || {}
                marcas.push(m.estavel ? '💤 estável' : `💀 ${m.sucessos || 0}✓ ${m.falhas || 0}✗`)
            }
            ;(st.condicoes || []).forEach(c => { if (D.CONDICOES[c] && !(c === 'inconsciente' && CD.caido(st))) marcas.push(D.CONDICOES[c].icone) })
            if (st.exaustao) marcas.push(`😩${st.exaustao}`)
            if (st.concentracao) marcas.push('◉')
            if ((st.efeitos || {}).furia) marcas.push('🔥')
            if ((st.efeitos || {}).esquivando) marcas.push('🛡')
            if (marcas.length) {
                const linha = mk('div', 'cn-marcas', marcas.join(' '))
                linha.title = [
                    ...(st.condicoes || []).map(c => D.CONDICOES[c] && D.CONDICOES[c].nome).filter(Boolean),
                    st.concentracao ? `Concentrando: ${st.concentracao.nome}` : '',
                ].filter(Boolean).join(' · ')
                info.appendChild(linha)
            }
            info.appendChild(cb.fichas(e, true))
        }
        card.appendChild(info)

        // Clicar abre a ficha (dono e mestre); o 🎲 abre direto os testes
        const pode = meu || state.isRoomMaster
        if (pode && !aliado) {
            card.classList.add('clicavel')
            card.title = 'Abrir a ficha'
            card.addEventListener('click', ev => { if (!ev.target.closest('button')) abrirFicha(char, card) })
            const testes = mk('button', 'cn-testes', '🎲')
            testes.title = 'Perícias e testes (resistência, atributo, ferramentas)'
            testes.setAttribute('aria-label', `Testes de ${char.name}`)
            testes.addEventListener('click', () => abrirFicha(char, card, 'pericias'))
            card.appendChild(testes)
        }
        el.appendChild(card)
    })
}

function barraPv(pv, max, temp, cls, rotulo) {
    const w = mk('div', 'cn-pv')
    const barra = mk('div', 'cn-barra')
    const fill = mk('div', 'cn-barra-fill ' + (cls || ''))
    fill.style.width = `${max ? Math.round((Math.min(pv, max) / max) * 100) : 0}%`
    barra.appendChild(fill)
    if (temp) {
        const t = mk('div', 'cn-barra-temp')
        t.style.width = `${Math.min(100, Math.round((temp / max) * 100))}%`
        barra.appendChild(t)
    }
    w.appendChild(barra)
    w.appendChild(mk('span', 'cn-pv-num', `${rotulo ? rotulo + ' ' : ''}${pv}/${max}${temp ? ` +${temp}` : ''}`))
    return w
}

/** Abre a ficha presa ao card do palco (os cards da barra somem na batalha). */
function abrirFicha(char, ancora, painel) {
    const entry = state.allCharsCache.find(e => e.character.id === char.id)
    const dono = entry ? entry.playerName : state.playerName
    require('./statPopup').openStatPopup(entry ? entry.character : char, dono, ancora)
    const stats = (state.statPopupChar && state.statPopupChar.stats) || char.stats || {}
    const canEdit = !!state.isRoomMaster || dono === state.playerName
    if (painel === 'pericias') sheet().abrirPainelPericias(stats)
    if (painel === 'armas') armas().abrirPainel(stats, canEdit)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Menu de comandos ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function desenharMenu(area) {
    area.innerHTML = ''
    const cb = combate()
    const atual = cb.entradaAtual()
    if (!atual) return
    const meuPj = atual.tipo === 'pj' && state.playerCharacters.some(c => c.id === atual.charId)
    const meuAliado = atual.tipo === 'criatura' && atual.charId && state.playerCharacters.some(c => c.id === atual.charId)
    const criaturaDoMestre = atual.tipo === 'criatura' && !atual.charId && state.isRoomMaster

    // Quem não está no turno vê só de quem é a vez
    if (!meuPj && !meuAliado && !criaturaDoMestre) {
        area.appendChild(mk('div', 'cn-vez', `Vez de ${atual.nome}`))
        return
    }
    const box = mk('div', 'cn-menu')
    box.setAttribute('role', 'region')
    box.setAttribute('aria-label', 'Comandos do turno')
    area.appendChild(box)

    if (criaturaDoMestre) return menuDoMestre(box, atual)
    const char = cb.charDaEntrada(atual)
    if (!char) return
    if (meuAliado) return menuDoAliado(box, atual, char)

    const st = char.stats || {}
    const f = dnd.calcular(st)
    const cab = mk('div', 'cn-menu-cab')
    cab.appendChild(mk('b', null, `Vez de ${atual.nome}`))
    cab.appendChild(mk('span', null, `Rodada ${state.combate.rodada}`))
    box.appendChild(cab)
    box.appendChild(cb.fichas(atual, false))

    // A 0 PV o turno é só o teste contra a morte
    if (CD.caido(st)) {
        const estavel = st.morte && st.morte.estavel
        box.appendChild(mk('div', 'cn-nota', estavel ? 'Estável a 0 PV: nada a fazer até ser curado.' : 'A 0 PV: role o teste contra a morte.'))
        if (!estavel) box.appendChild(botao('💀 Teste contra a morte', 'cn-grande', () => require('./dndEstadoUI').testeMorte(char)))
        box.appendChild(botao('Encerrar turno ▶', 'cn-encerrar', () => state.socket.emit('combate_proximo')))
        return
    }
    if (CD.semAcoes(st)) box.appendChild(mk('div', 'cn-nota', 'Incapacitado: sem ações nem reações neste turno.'))

    const corpo = mk('div', 'cn-menu-corpo')
    box.appendChild(corpo)
    const ir = m => () => { menu = m; magiaFoco = null; desenhar() }
    const voltar = titulo => {
        const linha = mk('div', 'cn-sub-cab')
        linha.appendChild(botao('◀ Voltar', 'cn-voltar', ir('principal')))
        linha.appendChild(mk('b', null, titulo))
        corpo.appendChild(linha)
    }

    if (menu === 'principal') {
        const grade = mk('div', 'cn-grade')
        const semMagia = !f.magias.length || f.semConjurar
        grade.appendChild(comando('⚔', 'Atacar', 'atacar', ir('atacar')))
        grade.appendChild(comando('✦', 'Magia', 'magia', ir('magia'), semMagia ? (f.semConjurar ? 'Na Forma Selvagem não conjura' : 'Sem magias') : ''))
        grade.appendChild(comando('🎒', 'Item', 'item', ir('item')))
        grade.appendChild(comando('🛡', 'Ações', 'acoes', ir('acoes')))
        corpo.appendChild(grade)
        const restam = armas().ataquesRestantes(char)
        if (restam > 0) corpo.appendChild(mk('div', 'cn-nota', `Ação de Ataque: ${restam === 1 ? 'resta 1 ataque' : `restam ${restam} ataques`}`))
    } else if (menu === 'atacar') {
        voltar('Atacar')
        menuAtacar(corpo, char, st, f)
    } else if (menu === 'magia') {
        voltar('Magia')
        menuMagia(corpo, char, st, f)
    } else if (menu === 'item') {
        voltar('Item')
        menuItem(corpo, char, atual)
    } else if (menu === 'acoes') {
        voltar('Ações')
        menuAcoes(corpo, char, atual, f)
    }
    box.appendChild(botao('Encerrar turno ▶', 'cn-encerrar', () => state.socket.emit('combate_proximo')))
}

function comando(icone, nome, cls, onClick, bloqueio) {
    const b = mk('button', `cn-cmd ${cls}`)
    b.type = 'button'
    b.appendChild(mk('span', 'cn-cmd-icone', icone))
    b.appendChild(mk('span', 'cn-cmd-nome', nome))
    b.disabled = !!bloqueio
    if (bloqueio) b.title = bloqueio
    b.addEventListener('click', onClick)
    return b
}

// ── Atacar ────────────────────────────────────────────────────────────────────

function menuAtacar(corpo, char, st, f) {
    const A = armas()
    // Fúria, Descuidado, Arma Sagrada...
    const efeitos = A.efeitosDisponiveis(st, f)
    if (efeitos.length) {
        const linha = mk('div', 'da-efeitos')
        const t = A.turnoDe(char)
        efeitos.forEach(ef => {
            const ligado = ef.turno ? t.descuidado : !!(st.efeitos || {})[ef.id]
            const b = mk('button', 'da-efeito' + (ligado ? ' on' : ''), (ligado ? '● ' : '○ ') + ef.nome)
            b.type = 'button'
            b.title = ef.desc
            b.setAttribute('aria-pressed', String(ligado))
            b.addEventListener('click', () => { A.alternarEfeito(char, ef); desenhar() })
            linha.appendChild(b)
        })
        corpo.appendChild(linha)
    }

    const lista = mk('div', 'cn-lista')
    if (f.forma) {
        f.forma.ataques.forEach(at => {
            lista.appendChild(itemLista(null, at.nome, `${dnd.sinal(at.bonus)} · ${at.dano} ${at.tipoDano}`, () => A.ataqueDeCriatura(char, f.forma.nome, at)))
        })
    } else {
        dnd.armasDoPersonagem(st).forEach(item => {
            const a = dnd.ataqueComArma(st, item, {}, f)
            const qtd = (item.qtd || 1) > 1 ? ` ×${item.qtd}` : ''
            lista.appendChild(itemLista(a.icone, a.nome + qtd, `${dnd.sinal(a.bonus)} · ${dnd.textoDoDano(a)}`, () => A.atacar(char, item, { tipo: 'acao' }),
                CD.semAcoes(st) ? 'Incapacitado' : ''))
        })
    }
    corpo.appendChild(lista)
    const opcoes = botao('⚙ Opções das armas (duas mãos, arremessar, −5/+10)', 'cn-link', () => {
        const card = [...document.querySelectorAll('#cenaBatalha .cn-pj.meu')][0]
        abrirFicha(char, card || document.body, 'armas')
    })
    corpo.appendChild(opcoes)

    const bonus = f.forma ? null : A.secaoBonus(char, st, f, dnd.armasDoPersonagem(st)[0])
    if (bonus) corpo.appendChild(bonus)
    // O último ataque e os extras "se acertou" (Furtivo, Destruição, manobras...)
    if (A.temUltimo(char.id)) corpo.appendChild(A.secaoUltimo(char, st, f))
}

// ── Magia ─────────────────────────────────────────────────────────────────────

function menuMagia(corpo, char, st, f) {
    const cj = f.conjuracao
    if (cj) {
        const usados = st.espacos_usados || {}
        const extras = st.espacos_extras || {}
        const pips = []
        cj.espacos.forEach((qtd, i) => {
            const n = i + 1
            const total = qtd + (extras[n] || 0)
            const livres = Math.max(0, total - (usados[n] || 0))
            if (total) pips.push(`${n}º ${'●'.repeat(livres)}${'○'.repeat(total - livres)}`)
        })
        if (cj.pacto) pips.push(`Pacto ${cj.pacto.nivel}º ${'●'.repeat(Math.max(0, cj.pacto.qtd - (usados.pacto || 0)))}${'○'.repeat(Math.min(cj.pacto.qtd, usados.pacto || 0))}`)
        if (pips.length) corpo.appendChild(mk('div', 'cn-espacos', pips.join('   ')))
        corpo.appendChild(mk('div', 'cn-nota', `CD ${cj.cd} · ataque ${dnd.sinal(cj.ataque)}${st.concentracao ? ` · concentrando em ${st.concentracao.nome}` : ''}`))
    }
    const foco = magiaFoco && f.magias.find(m => m.id === magiaFoco)
    if (foco) {
        const det = mk('div', 'dm-detalhe cn-magia-det')
        const acoes = sheet().acoesDaMagia(char, st, f, foco, true, { aoMudar: () => desenhar() })
        magiasUI.desenharDetalhe(det, foco, null, acoes)
        const outra = botao('◀ Outra magia', 'cn-link', () => { magiaFoco = null; desenhar() })
        corpo.appendChild(outra)
        corpo.appendChild(det)
        return
    }
    const lista = mk('div', 'cn-lista')
    let nivel = null
    const livres = dnd.espacosLivres(st, f, 1)
    f.magias.forEach(m => {
        if (m.nivel !== nivel) {
            nivel = m.nivel
            lista.appendChild(mk('div', 'ds-grupo', m.nivel === 0 ? 'Truques' : `${m.nivel}º nível`))
        }
        // Sem espaço livre (e sem uso próprio), a magia aparece apagada
        let bloqueio = ''
        if (m.nivel > 0 && !m.semEspaco && !livres.some(e => e.nivel >= m.nivel)) bloqueio = 'Sem espaço de magia livre'
        if (m.recurso && (st.recursos_usados || {})[m.recurso]) bloqueio = 'Já usada; volta no descanso longo'
        const tags = [m.tempo && /bônus/i.test(m.tempo) ? 'bônus' : m.tempo && /reação/i.test(m.tempo) ? 'reação' : '', m.concentracao ? 'C' : '', m.ataque ? 'ataque' : m.resistencia ? `CD ${m.cd}` : ''].filter(Boolean).join(' · ')
        lista.appendChild(itemLista(m.icone, m.nome, tags, () => { magiaFoco = m.id; desenhar() }, bloqueio, true))
    })
    corpo.appendChild(lista)
}

// ── Item ──────────────────────────────────────────────────────────────────────

function menuItem(corpo, char, ent) {
    const inv = state.inventories[char.id]
    if (inv === undefined) {
        corpo.appendChild(mk('div', 'cn-nota', 'Carregando o inventário…'))
        require('./inventory').loadCharInventoryFromDB(char.id).then(itens => {
            state.inventories[char.id] = itens
            desenhar()
        })
        return
    }
    if (!inv.length) {
        corpo.appendChild(mk('div', 'cn-nota', 'Inventário vazio. Quem dá itens é o mestre.'))
        return
    }
    const cb = combate()
    const ec = cb.economia(ent.id) || { acoes: 1, acoesUsadas: 0 }
    const semAcao = ec.acoesUsadas >= ec.acoes
    const pocoes = require('./dndItens').POCOES
    corpo.appendChild(mk('div', 'cn-nota', 'Usar um item gasta a Ação.'))
    const lista = mk('div', 'cn-lista')
    inv.forEach(item => {
        const b = mk('button', 'cn-item')
        b.type = 'button'
        b.appendChild(mk('span', 'cn-item-icone', item.icon && !/^(http|\/)/.test(item.icon) ? item.icon : '📦'))
        const txt = mk('span', 'cn-item-txt')
        txt.appendChild(mk('b', null, item.name + ((item.quantity || 1) > 1 ? ` ×${item.quantity}` : '')))
        if (pocoes[item.name]) txt.appendChild(mk('span', null, `cura ${pocoes[item.name]}`))
        b.appendChild(txt)
        b.disabled = semAcao
        b.title = semAcao ? 'A ação já foi usada' : 'Usar (gasta a Ação)'
        b.addEventListener('click', async () => {
            b.disabled = true
            cb.gastar(ent.id, 'acoesUsadas', Math.min(ec.acoes, ec.acoesUsadas + 1))
            await require('./dndItens').usarItem(char, item)
            desenhar()
        })
        lista.appendChild(b)
    })
    corpo.appendChild(lista)
}

// ── Ações ─────────────────────────────────────────────────────────────────────

function menuAcoes(corpo, char, ent, f) {
    const cb = combate()
    corpo.appendChild(cb.acoesDeCombate(ent, char))
    // Surto de Ação: uma ação a mais neste turno
    const surto = cb.recursoLivre(char, f, 'surto-acao')
    if (surto) {
        corpo.appendChild(botao('+1 Ação (Surto de Ação)', 'cn-link', () => {
            const ec = cb.economia(ent.id)
            cb.gastarRecurso(char, 'surto-acao')
            cb.gastar(ent.id, 'acoes', (ec ? ec.acoes : 1) + 1)
            if (state.socket) state.socket.emit('chat_message', { playerName: '⚔ Batalha', message: `${char.name} usa Surto de Ação.`, type: 'text' })
        }))
    }
}

// ── Aliado e criatura do mestre ───────────────────────────────────────────────

function menuDoAliado(box, ent, dono) {
    box.appendChild(mk('div', 'cn-menu-cab', `Vez de ${ent.nome}`))
    const lista = mk('div', 'cn-lista')
    require('./dndCompanheiros').ataquesDoAliado(dono, ent.id.split(':')[2]).forEach(b => lista.appendChild(itemLista('lorc/wolf-head', b.rotulo.replace(/^⚔ /, ''), 'ataque e dano', b.acao)))
    if (!lista.childNodes.length) box.appendChild(mk('div', 'cn-nota', 'Sem ataques: ajuda, se move ou espera.'))
    box.appendChild(lista)
    box.appendChild(botao('Encerrar turno ▶', 'cn-encerrar', () => state.socket.emit('combate_proximo')))
}

function menuDoMestre(box, ent) {
    const cab = mk('div', 'cn-menu-cab')
    cab.appendChild(mk('b', null, `Vez de ${ent.nome}`))
    cab.appendChild(mk('span', null, `Rodada ${state.combate.rodada}`))
    box.appendChild(cab)
    const cb = combate()
    const grade = mk('div', 'cn-grade')
    grade.appendChild(comando('⚔', 'Ataca', 'atacar', () => cb.abrirAnuncio('ataque')))
    grade.appendChild(comando('✦', 'Conjura', 'magia', () => cb.abrirAnuncio('magia')))
    grade.appendChild(comando('🏃', 'Sai do alcance', 'item', () => cb.abrirAnuncio('oportunidade')))
    grade.appendChild(comando('▶', 'Próximo', 'acoes', () => state.socket.emit('combate_proximo')))
    box.appendChild(grade)
    box.appendChild(mk('div', 'cn-nota', 'Os jogadores veem as reações que puderem usar.'))
}

// ── Peças ─────────────────────────────────────────────────────────────────────

function itemLista(icone, nome, sub, onClick, bloqueio, comIcone) {
    const b = mk('button', 'cn-opcao')
    b.type = 'button'
    if (icone) b.appendChild(magiasUI.icone(icone))
    else if (comIcone !== false) b.appendChild(mk('span', 'cn-opcao-vazio'))
    const txt = mk('span', 'cn-opcao-txt')
    txt.appendChild(mk('b', null, nome))
    if (sub) txt.appendChild(mk('span', null, sub))
    b.appendChild(txt)
    b.disabled = !!bloqueio
    if (bloqueio) b.title = bloqueio
    b.addEventListener('click', onClick)
    return b
}

function botao(texto, cls, onClick) {
    const b = mk('button', 'cn-btn ' + (cls || ''), texto)
    b.type = 'button'
    b.addEventListener('click', onClick)
    return b
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = { desenhar, limpar, aoMudarFicha }
