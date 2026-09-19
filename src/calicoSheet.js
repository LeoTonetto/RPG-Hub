// ══════════════════════════════════════════════════════════════════════════════
// src/calicoSheet.js — FICHA, ROLADOR E PAINÉIS DO SISTEMA CALICO
//
// statPopup.js delega para cá quando o personagem aberto é do sistema 'calico'.
// Os painéis são criados sob demanda e reaproveitam o CSS .subpanel que já
// existe, mais a classe .calico-panel (que statPopup.js usa para não fechar o
// popup quando o clique é dentro de um deles).
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const C = require('./calico')
const { makeDraggable } = require('./hud')

// ══════════════════════════════════════════════════════════════════════════════
// ── PERMISSÕES ───────────────────────────────────────────────────────────────
//
// Duas coisas diferentes, que antes estavam no mesmo balaio:
//
//   FICHA     — o que foi distribuído na criação: atributos, perícias, nível,
//               habilidades, quais armas o personagem tem. Só o MESTRE mexe.
//               Sem isso, o jogador redistribui a ficha no meio da sessão.
//
//   RECURSOS  — o que muda durante o jogo: PV, PD, munição, condições,
//               contadores de teste de morte. O dono do personagem mexe.
// ══════════════════════════════════════════════════════════════════════════════
function podeEditarFicha() {
    return !!state.isRoomMaster
}

// ── Estado do rolador ─────────────────────────────────────────────────────────
//
// Enxuto de propósito. Modificadores situacionais e DT saíram da tela: o mestre
// anuncia na mesa e a conta de "passou ou não" é feita em voz alta. O app só
// entrega os dados, a soma, a RA e a RB — e marca crítico e falha crítica, que
// não dependem de DT nenhuma.
//
// O único controle que sobrou é o de passos, porque no Calico um modificador
// TROCA O DADO (d6 vira d8): não dá para aplicar depois da rolagem, na mão.
let roller = null

function resetRoller() {
    roller = {
        pericia: 'pontaria',
        atributoForcado: null,   // null = usa o atributo-base da perícia
        passos: 0,               // ajuste anunciado pelo mestre, de −2 a +2
        secreto: false,          // rolagem escondida da mesa (só o mestre)
        ultimo: null,            // último resultado, para a rolagem de falha crítica
    }
}

// Teto do controle de passos, alinhado com o teto situacional da spec §1.4
const PASSOS_MIN = -C.CALICO_CONFIG.tetoPassosSituacionais
const PASSOS_MAX = C.CALICO_CONFIG.tetoPassosSituacionais

// ══════════════════════════════════════════════════════════════════════════════
// ── Popup principal ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Chamado por statPopup.js. Monta o corpo da ficha dentro de `container`. */
function buildSheet(container, stats, canEdit) {
    if (!roller) resetRoller()
    container.classList.add('calico-sheet')

    // ── PV e PD lado a lado, mesmo peso visual (§14) ─────────────────────────
    const recursos = mk('div', 'cs-recursos')
    recursos.appendChild(barraRecurso('❤', 'PV', 'hp', 'hp_max', stats, canEdit, 'pv'))
    recursos.appendChild(barraRecurso('🕯', 'PD', 'sanity', 'sanity_max', stats, canEdit, 'pd'))
    container.appendChild(recursos)

    // ── Identidade: nível, perfil, ocupação ──────────────────────────────────
    container.appendChild(linhaIdentidade(stats, canEdit))

    // ── Atributos sempre visíveis: são metade de todo teste ──────────────────
    const ficha = podeEditarFicha()
    const attrRow = mk('div', 'cs-attr-row')
    C.ATRIBUTOS.forEach(a => {
        const chip = mk('div', 'cs-attr-chip')
        chip.title = `${a.label} — ${C.ESCALA_ATRIBUTO[stats[a.key]] || a.descricao}`
            + (ficha ? '\nClique para ajustar.' : '')
        chip.appendChild(mk('span', 'cs-attr-chip-icon', a.icon))
        chip.appendChild(mk('span', 'cs-attr-chip-label', a.label))
        const val = mk('span', 'cs-attr-chip-val', stats[a.key] || 'd6')
        val.dataset.calicoAttr = a.key
        chip.appendChild(val)
        // Atributo é build: só o mestre ajusta
        if (ficha) {
            chip.classList.add('editavel')
            chip.addEventListener('click', () => abrirPainelAtributos(stats, true))
        }
        attrRow.appendChild(chip)
    })
    container.appendChild(attrRow)

    // ── Botão principal: perícias e testes, numa tela só ─────────────────────
    const rollBtn = mk('button', 'cs-roll-btn', '🎲 Perícias & Testes')
    rollBtn.addEventListener('click', () => abrirPainelTestes(stats))
    container.appendChild(rollBtn)

    // ── Condições ativas ─────────────────────────────────────────────────────
    const cond = stats.condicoes || []
    if (cond.length) {
        const row = mk('div', 'cs-cond-row')
        cond.forEach(id => {
            const def = C.CONDICAO_POR_ID[id]
            if (!def) return
            const chip = mk('span', 'cs-cond-chip', `${def.icon} ${def.nome}`)
            chip.title = def.efeito
            row.appendChild(chip)
        })
        container.appendChild(row)
    }

    // ── Testes de morte em andamento: avisa alto quando ativo ────────────────
    const tm = stats.testes_morte || { vigor: 0, disciplina: 0 }
    if (tm.vigor > 0 || tm.disciplina > 0) {
        const alerta = mk('div', 'cs-morte-alerta')
        if (tm.vigor > 0) alerta.appendChild(mk('div', 'cs-morte-line',
            `💀 Vigor: ${tm.vigor} teste(s) feito(s) — próxima DT ${C.dtTesteDeMorte(tm.vigor)}`))
        if (tm.disciplina > 0) alerta.appendChild(mk('div', 'cs-morte-line',
            `🕯 Disciplina: ${tm.disciplina} teste(s) feito(s) — próxima DT ${C.dtTesteDeMorte(tm.disciplina)}`))
        alerta.addEventListener('click', () => abrirPainelMorte(stats, canEdit))
        container.appendChild(alerta)
    }

    // ── Botões de painel ─────────────────────────────────────────────────────
    const linha = mk('div', 'sp-subpanel-row')
    linha.appendChild(botaoPainel('⚡ Habilidades', () => abrirPainelHabilidades(stats, ficha)))
    linha.appendChild(botaoPainel('🔫 Armas', () => abrirPainelArmas(stats, canEdit)))
    linha.appendChild(botaoPainel('🩸 Condições', () => abrirPainelCondicoes(stats, canEdit)))
    linha.appendChild(botaoPainel('💀 Morte', () => abrirPainelMorte(stats, canEdit)))
    container.appendChild(linha)
}

function barraRecurso(icone, rotulo, key, maxKey, stats, canEdit, cls) {
    const wrap = mk('div', `cs-recurso ${cls}`)

    const head = mk('div', 'cs-recurso-head')
    head.appendChild(mk('span', 'cs-recurso-icon', icone))
    head.appendChild(mk('span', 'cs-recurso-label', rotulo))
    wrap.appendChild(head)

    const ctrl = mk('div', 'cs-recurso-ctrl')
    ctrl.appendChild(adjBtn('−', canEdit, () => ajustar(key, -1)))
    ctrl.appendChild(numInput(key, stats[key] ?? 0, canEdit))
    ctrl.appendChild(mk('span', 'cs-recurso-sep', '/'))
    // O máximo é derivado do atributo e do nível (§6.2), então é ficha, não
    // recurso: o jogador acompanha o valor, mas quem mexe é o mestre.
    const maxInput = numInput(maxKey, stats[maxKey] ?? 0, podeEditarFicha())
    if (!podeEditarFicha()) maxInput.title = 'Vem do atributo e do nível — só o mestre ajusta'
    ctrl.appendChild(maxInput)
    ctrl.appendChild(adjBtn('+', canEdit, () => ajustar(key, 1)))
    wrap.appendChild(ctrl)

    // Barra visual
    const track = mk('div', 'cs-recurso-track')
    const fill = mk('div', 'cs-recurso-fill')
    const max = stats[maxKey] || 1
    fill.style.width = Math.max(0, Math.min(100, ((stats[key] ?? 0) / max) * 100)) + '%'
    fill.dataset.calicoFill = key
    track.appendChild(fill)
    wrap.appendChild(track)

    if ((stats[key] ?? 1) <= 0) {
        wrap.classList.add('zerado')
        const aviso = mk('div', 'cs-recurso-zero',
            key === 'hp' ? 'Teste de Vigor a cada dano' : 'Teste de Disciplina a cada dano')
        wrap.appendChild(aviso)
    }

    return wrap
}

function linhaIdentidade(stats, canEdit) {
    const row = mk('div', 'cs-ident')
    // Nível é build: quem concede é o mestre, ao fim de um arco (§10)
    const ficha = podeEditarFicha()

    const nivelWrap = mk('div', 'cs-nivel')
    nivelWrap.appendChild(mk('span', 'cs-nivel-label', 'NÍVEL'))
    const nivelCtrl = mk('div', 'cs-nivel-ctrl')
    if (ficha) nivelCtrl.appendChild(adjBtn('−', true, () => mudarNivel(-1), 'sp-adj-xs'))
    const nivelVal = mk('span', 'cs-nivel-val', String(stats.nivel || 1))
    nivelVal.dataset.calicoNivel = '1'
    nivelCtrl.appendChild(nivelVal)
    if (ficha) nivelCtrl.appendChild(adjBtn('+', true, () => mudarNivel(1), 'sp-adj-xs'))
    nivelWrap.appendChild(nivelCtrl)
    row.appendChild(nivelWrap)

    const tags = mk('div', 'cs-ident-tags')
    const perfil = C.PERFIS.find(p => p.id === stats.perfil)
    const ocup = C.OCUPACOES.find(o => o.id === stats.ocupacao)
    if (perfil) {
        const t = mk('span', 'cs-ident-tag', `${perfil.icon} ${perfil.nome}`)
        t.title = `${perfil.habilidadeNome}: ${perfil.habilidadeTexto}`
        tags.appendChild(t)
    }
    if (ocup) {
        const t = mk('span', 'cs-ident-tag', `${ocup.icon} ${ocup.nome}`)
        t.title = `${ocup.habilidadeNome}: ${ocup.habilidadeTexto}`
        tags.appendChild(t)
    }
    row.appendChild(tags)

    return row
}

/** Nível mudou → PV e PD máximos recalculam (§6.2). */
function mudarNivel(delta) {
    const stats = statsAtuais()
    if (!stats) return
    const novo = Math.max(1, Math.min(C.CALICO_CONFIG.nivelMaximo, (stats.nivel || 1) + delta))
    if (novo === stats.nivel) return
    commit('nivel', novo)
    recalcularDerivados({ ...stats, nivel: novo })
    reabrirFicha()
}

/**
 * §6.2 — PV e PD máximos são derivados; recalculam sozinhos quando o atributo
 * ou o nível mudam. O valor atual é cortado se passar do novo máximo.
 */
function recalcularDerivados(stats) {
    const pvMax = C.pvMaximo(stats.fisico, stats.nivel || 1)
    const pdMax = C.pdMaximo(stats.emocao, stats.nivel || 1)

    if (stats.hp_max !== pvMax) {
        commit('hp_max', pvMax)
        if ((stats.hp ?? 0) > pvMax) commit('hp', pvMax)
    }
    if (stats.sanity_max !== pdMax) {
        commit('sanity_max', pdMax)
        if ((stats.sanity ?? 0) > pdMax) commit('sanity', pdMax)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel: ATRIBUTOS ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function abrirPainelAtributos(stats, canEdit) {
    const { body } = painel('calicoAttr', '💪 Atributos')
    body.innerHTML = ''

    C.ATRIBUTOS.forEach(a => {
        const row = mk('div', 'subp-row calico-die-row')
        row.appendChild(mk('span', 'subp-icon', a.icon))

        const info = mk('div', 'calico-die-row-info')
        info.appendChild(mk('span', 'subp-name', a.label))
        info.appendChild(mk('span', 'calico-die-row-escala', C.ESCALA_ATRIBUTO[stats[a.key]] || ''))
        row.appendChild(info)

        row.appendChild(seletorDado(stats[a.key] || 'd6', canEdit, novo => {
            commit(a.key, novo)
            // Físico governa PV, Emoção governa PD
            recalcularDerivados({ ...statsAtuais(), [a.key]: novo })
            reabrirFicha()
            abrirPainelAtributos(statsAtuais(), canEdit)
        }))

        body.appendChild(row)
    })

    const nota = mk('div', 'calico-panel-note',
        'Físico define o PV e Emoção define o PD — mudar um recalcula o outro na hora.')
    body.appendChild(nota)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel: PERÍCIAS & TESTES ────────────────────────────────────────────────
//
// Uma tela só. Todo teste do Calico é atributo + perícia, então a lista de
// perícias É o rolador: cada linha tem o seu dadinho de rolar.
//
// O que NÃO está aqui, de propósito:
//   • lista de modificadores situacionais — o mestre anuncia na mesa
//   • DT e veredito de sucesso/falha — o mestre anuncia e a conta é em voz alta
// Sobram os dados, a soma, a RA e a RB. Crítico e falha crítica continuam
// marcados, porque não dependem de DT nenhuma (§1.6).
//
// Quem mexe no valor das perícias é só o mestre: era isso que deixava o jogador
// redistribuir a ficha no meio da sessão.
// ══════════════════════════════════════════════════════════════════════════════
function abrirPainelTestes(stats) {
    const { body } = painel('calicoTestes', '🎲 Perícias & Testes', 'wide')
    body.innerHTML = ''

    const ficha = podeEditarFicha()
    const pericias = stats.pericias || C.periciasIniciais()
    const atributos = { fisico: stats.fisico, mente: stats.mente, emocao: stats.emocao }

    // ── Atributos: mostram o dado e permitem forçar um atributo diferente ────
    // Por padrão cada perícia rola com o seu atributo-base. O mestre às vezes
    // pede outro (ex.: FÍSICO + Percepção para iniciativa, §7.2) — aí é só
    // fixar o atributo aqui antes de rolar.
    const attrRow = mk('div', 'ct-attrs')
    C.ATRIBUTOS.forEach(a => {
        const fixado = roller.atributoForcado === a.key
        const chip = mk('button', 'ct-attr' + (fixado ? ' fixado' : ''))
        chip.type = 'button'
        chip.title = fixado
            ? `Fixado: todos os testes vão usar ${a.label}. Clique para soltar.`
            : `Clique para forçar ${a.label} em vez do atributo-base da perícia`
        chip.appendChild(mk('span', 'ct-attr-icon', a.icon))
        chip.appendChild(mk('span', 'ct-attr-label', a.label))
        chip.appendChild(mk('span', 'ct-attr-dado', stats[a.key] || 'd6'))
        chip.addEventListener('click', () => {
            roller.atributoForcado = fixado ? null : a.key
            abrirPainelTestes(statsAtuais())
        })
        attrRow.appendChild(chip)
    })
    body.appendChild(attrRow)

    if (roller.atributoForcado) {
        const aviso = mk('div', 'ct-aviso')
        aviso.textContent = `Atributo fixado em ${C.ATRIBUTOS.find(a => a.key === roller.atributoForcado).label} — clique de novo para voltar ao automático.`
        body.appendChild(aviso)
    }

    // ── Passos ───────────────────────────────────────────────────────────────
    // Único modificador que sobrou na tela, e por um motivo concreto: no Calico
    // um modificador troca o dado (d6 vira d8), então não dá para aplicar depois
    // da rolagem. O mestre anuncia "sobe um passo" e o jogador clica no +.
    const passosRow = mk('div', 'ct-passos' + (roller.passos !== 0 ? ' ativo' : ''))
    passosRow.appendChild(mk('span', 'ct-passos-label', 'Passos'))
    passosRow.appendChild(adjBtn('−', roller.passos > PASSOS_MIN, () => {
        roller.passos = Math.max(PASSOS_MIN, roller.passos - 1)
        abrirPainelTestes(statsAtuais())
    }, 'sp-adj-sm'))
    passosRow.appendChild(mk('span', 'ct-passos-val',
        (roller.passos > 0 ? '+' : '') + roller.passos))
    passosRow.appendChild(adjBtn('+', roller.passos < PASSOS_MAX, () => {
        roller.passos = Math.min(PASSOS_MAX, roller.passos + 1)
        abrirPainelTestes(statsAtuais())
    }, 'sp-adj-sm'))
    passosRow.appendChild(mk('span', 'ct-passos-dica',
        roller.passos === 0 ? 'sem modificador' : 'aplicado no dado da perícia'))
    body.appendChild(passosRow)

    // ── Rolagem secreta — só o mestre ────────────────────────────────────────
    if (state.isRoomMaster) {
        const sec = mk('label', 'cr-mod cr-secreto' + (roller.secreto ? ' ativo' : ''))
        const secCb = document.createElement('input')
        secCb.type = 'checkbox'
        secCb.checked = roller.secreto
        secCb.addEventListener('change', () => {
            roller.secreto = secCb.checked
            abrirPainelTestes(statsAtuais())
        })
        sec.appendChild(secCb)
        sec.appendChild(mk('span', 'cr-mod-passos', roller.secreto ? '🙈' : '👁'))
        sec.appendChild(mk('span', 'cr-mod-label',
            roller.secreto ? 'Secreta — a mesa não vê nada' : 'Rolagem secreta'))
        body.appendChild(sec)
    } else if (roller.secreto) {
        roller.secreto = false   // deixou de ser mestre
    }

    // ── Saída da última rolagem, logo acima da lista ─────────────────────────
    const saida = mk('div', 'cr-saida')
    saida.id = 'crSaida'
    body.appendChild(saida)
    if (roller.ultimo) renderResultado(saida, roller.ultimo)

    // ── As 20 perícias ───────────────────────────────────────────────────────
    const lista = mk('div', 'ct-lista')
    C.PERICIAS.forEach(p => {
        lista.appendChild(linhaPericiaTeste(p, stats, pericias, atributos, ficha, body))
    })
    body.appendChild(lista)

    body.appendChild(mk('div', 'calico-panel-note', ficha
        ? `Você é o mestre: pode ajustar o dado de cada perícia. Teto de ${C.CALICO_CONFIG.maxPassosAcimaDoAtributoBase} passos acima do atributo-base.`
        : 'O valor das perícias é ajustado pelo mestre.'))
}

function linhaPericiaTeste(p, stats, pericias, atributos, ficha, body) {
    const valor = pericias[p.key] || 'd4'
    const teto = C.tetoDaPericia(p.key, atributos)
    const attrDef = C.ATRIBUTOS.find(a => a.key === p.attr)
    const attrUsado = roller.atributoForcado || p.attr
    const attrUsadoDef = C.ATRIBUTOS.find(a => a.key === attrUsado)

    const row = mk('div', 'ct-row')
    row.appendChild(mk('span', 'ct-row-icon', p.icon))

    const info = mk('div', 'ct-row-info')
    let nome = p.label
    if (p.key === 'aptidao' && stats.aptidao_especializacao) {
        const espec = C.APTIDAO_ESPECIALIZACOES.find(e => e.key === stats.aptidao_especializacao)
        if (espec) nome = `${p.label} (${espec.label})`
    }
    info.appendChild(mk('span', 'ct-row-nome', nome))
    info.appendChild(mk('span', 'ct-row-attr' + (roller.atributoForcado ? ' forcado' : ''),
        attrUsadoDef.label))
    row.appendChild(info)

    if (ficha) {
        row.appendChild(seletorDado(valor, true, novo => {
            if (C.periciaExcedeTeto(p.key, novo, atributos)) {
                flashPanelNote(body, `${p.label} não passa de ${teto} com ${attrDef.label} ${atributos[p.attr]}.`)
                return
            }
            commit('pericias', { ...pericias, [p.key]: novo })
            abrirPainelTestes(statsAtuais())
        }, teto))
    } else {
        const estatico = mk('span', 'ct-row-dado', valor)
        estatico.title = C.ESCALA_PERICIA[valor] || ''
        row.appendChild(estatico)
    }

    // O dadinho de rolar — é isto que o jogador usa
    const dadoFinal = C.passoDado(valor, roller.passos)
    const roll = mk('button', 'ct-roll' + (roller.secreto ? ' secreto' : ''),
        roller.secreto ? '🙈' : '🎲')
    roll.title = `Rolar ${attrUsadoDef.label} ${stats[attrUsado] || 'd6'} + ${p.label} ${dadoFinal}`
        + (roller.passos ? `  (${valor} com ${roller.passos > 0 ? '+' : ''}${roller.passos} passo${Math.abs(roller.passos) > 1 ? 's' : ''})` : '')
    roll.addEventListener('click', e => {
        e.stopPropagation()
        roller.pericia = p.key
        executarRolagem(statsAtuais())
    })
    row.appendChild(roll)

    return row
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Execução da rolagem ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Monta os dois dados do teste: atributo + perícia (com os passos aplicados). */
function montarDados(stats) {
    const pericias = stats.pericias || C.periciasIniciais()
    const periciaDef = C.PERICIA_POR_KEY[roller.pericia]
    const attrKey = roller.atributoForcado || periciaDef.attr
    const attrDef = C.ATRIBUTOS.find(a => a.key === attrKey)

    const dadoAttr = stats[attrKey] || 'd6'
    const dadoPericiaBase = pericias[roller.pericia] || 'd4'
    // Os passos alteram o dado da perícia, que é o que a ação representa (§1.4)
    const dadoPericia = C.passoDado(dadoPericiaBase, roller.passos)

    return {
        attrKey, attrDef, periciaDef,
        dadoAttr, dadoPericiaBase, dadoPericia,
        dados: [
            { dado: dadoAttr, origem: attrDef.label },
            { dado: dadoPericia, origem: periciaDef.label },
        ],
    }
}

function executarRolagem(stats) {
    const m = montarDados(stats)

    // Sem DT: o app não julga sucesso nem falha, só entrega os números
    const res = C.rolarTeste({ dados: m.dados, dt: null })
    res.contexto = {
        atributo: m.attrDef.label,
        pericia: m.periciaDef.label,
        personagem: state.statPopupChar ? state.statPopupChar.name : state.playerName,
        passos: roller.passos,
        dadoPericiaBase: m.dadoPericiaBase,
    }
    res.secreto = !!(roller.secreto && state.isRoomMaster)
    roller.ultimo = res

    const saida = document.querySelector('#calicoTestes #crSaida')
    if (saida) renderResultado(saida, res)

    // Compartilha o resultado com a sala
    if (state.socket) state.socket.emit('calico_roll', serializar(res))
}

function serializar(res) {
    return {
        contexto: res.contexto,
        rolados: res.rolados.map(d => ({ dado: d.dado, valor: d.valor, origem: d.origem, somado: d.somado })),
        soma: res.soma, ra: res.ra, rb: res.rb,
        critico: res.critico, valorCritico: res.valorCritico,
        falhaCritica: res.falhaCritica,
        // O servidor só honra isto se quem enviou for o mestre da sala
        secreto: !!(roller && roller.secreto && state.isRoomMaster),
    }
}

function renderResultado(saida, res) {
    saida.innerHTML = ''
    saida.className = 'cr-saida ' +
        (res.falhaCritica ? 'falha-critica' : res.critico ? 'critico' : 'neutro')
        + (res.secreto ? ' secreto' : '')

    if (res.secreto) {
        saida.appendChild(mk('div', 'cr-secreto-tag', '🙈 Secreta — a mesa não viu esta rolagem'))
    }

    const ctx = res.contexto || {}
    const cab = mk('div', 'cr-cabecalho')
    cab.textContent = `${ctx.atributo || ''} + ${ctx.pericia || ''}`
    if (ctx.passos) {
        cab.textContent += `  (${ctx.dadoPericiaBase} ${ctx.passos > 0 ? '+' : ''}${ctx.passos} passo${Math.abs(ctx.passos) > 1 ? 's' : ''})`
    }
    saida.appendChild(cab)

    // Dados individuais — RA e RB dependem disso, o jogador precisa ver
    const dadosRow = mk('div', 'cr-dados')
    res.rolados.forEach(d => {
        const die = mk('div', 'cr-die' + (d.somado ? '' : ' descartado'))
        die.title = `${d.origem} — ${d.dado}${d.somado ? '' : ' (não somado)'}`
        die.appendChild(mk('span', 'cr-die-val', String(d.valor)))
        die.appendChild(mk('span', 'cr-die-tipo', d.dado))
        dadosRow.appendChild(die)
    })
    saida.appendChild(dadosRow)

    const linha = mk('div', 'cr-res-linha')
    linha.appendChild(chip('SOMA', res.soma, 'soma'))
    linha.appendChild(chip('RA', res.ra))
    linha.appendChild(chip('RB', res.rb))
    saida.appendChild(linha)

    // Só o que não depende de DT (§1.6)
    if (res.critico) {
        saida.appendChild(mk('div', 'cr-veredito', `✦ SUCESSO CRÍTICO (${res.valorCritico} repetido)`))
        saida.appendChild(mk('div', 'cr-nota',
            'Sucesso automático, independentemente da DT. Em investigação, concede uma informação adicional.'))
    } else if (res.falhaCritica) {
        saida.appendChild(mk('div', 'cr-veredito', '✗ FALHA CRÍTICA'))
    }

    // §1.6 — na falha crítica, oferecer a rolagem de 1d8 da tabela
    if (res.falhaCritica) {
        const btn = mk('button', 'cr-fc-btn', '🎲 Rolar 1d8 na tabela de falha crítica')
        btn.addEventListener('click', () => {
            const fc = C.rolarFalhaCritica()
            btn.remove()
            const box = mk('div', 'cr-fc-result')
            box.appendChild(mk('div', 'cr-fc-nome', `${fc.valor} — ${fc.nome}`))
            box.appendChild(mk('div', 'cr-fc-efeito', fc.efeito))
            if (fc.aplicar && fc.aplicar.tipo === 'dano') {
                const perda = C.rolarDado(fc.aplicar.dado)
                const campo = fc.aplicar.recurso === 'pv' ? 'hp' : 'sanity'
                box.appendChild(mk('div', 'cr-fc-aplicado', `Rolado ${fc.aplicar.dado}: perde ${perda} ${fc.aplicar.recurso.toUpperCase()}`))
                const atual = statsAtuais()
                if (atual) {
                    commit(campo, Math.max(0, (atual[campo] ?? 0) - perda))
                    reabrirFicha()
                }
            }
            saida.appendChild(box)
            // Numa rolagem secreta a mesa não soube nem que houve o teste, então
            // a consequência também não pode aparecer no chat de todo mundo.
            if (state.socket && !res.secreto) {
                state.socket.emit('chat_message', {
                    playerName: '⚙ Sistema',
                    message: `Falha crítica de ${res.contexto ? res.contexto.personagem : '?'} — ${fc.valor}: ${fc.nome}. ${fc.efeito}`,
                    type: 'text',
                })
            }
        })
        saida.appendChild(btn)
    }
}

function chip(label, valor, cls) {
    const c = mk('span', 'cr-chip' + (cls ? ' ' + cls : ''))
    c.appendChild(mk('span', 'cr-chip-label', label))
    c.appendChild(mk('span', 'cr-chip-val', String(valor)))
    return c
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel: ARMAS E MUNIÇÃO (§7.7) ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function abrirPainelArmas(stats, canEdit) {
    const { body } = painel('calicoArmas', '🔫 Armas', 'wide')
    body.innerHTML = ''

    const armas = stats.armas || []

    if (armas.length === 0) body.appendChild(mk('div', 'subp-empty', 'Nenhuma arma.'))

    armas.forEach((a, idx) => {
        const card = mk('div', 'ca-arma')

        const head = mk('div', 'ca-arma-head')
        head.appendChild(mk('span', 'ca-arma-nome', a.nome))
        head.appendChild(mk('span', 'ca-arma-dano', `${a.dano} · ${a.tipo}`))
        if (podeEditarFicha()) {
            const del = mk('button', 'subp-hab-del', '✕')
            del.addEventListener('click', () => {
                const novas = armas.filter((_, i) => i !== idx)
                commit('armas', novas)
                abrirPainelArmas(statsAtuais(), canEdit)
            })
            head.appendChild(del)
        }
        card.appendChild(head)

        if (a.capacidade) {
            const linha = mk('div', 'ca-municao')
            linha.appendChild(adjBtn('−', canEdit, () => {
                const novas = armas.map((w, i) => i === idx ? { ...w, municao: Math.max(0, (w.municao ?? 0) - 1) } : w)
                commit('armas', novas)
                abrirPainelArmas(statsAtuais(), canEdit)
            }, 'sp-adj-sm'))

            const contador = mk('div', 'ca-contador' + ((a.municao ?? 0) === 0 ? ' vazia' : ''))
            contador.appendChild(mk('span', 'ca-contador-val', String(a.municao ?? 0)))
            contador.appendChild(mk('span', 'ca-contador-cap', `/${a.capacidade}`))
            linha.appendChild(contador)

            linha.appendChild(adjBtn('+', canEdit, () => {
                const novas = armas.map((w, i) => i === idx ? { ...w, municao: Math.min(w.capacidade, (w.municao ?? 0) + 1) } : w)
                commit('armas', novas)
                abrirPainelArmas(statsAtuais(), canEdit)
            }, 'sp-adj-sm'))

            const recarregar = mk('button', 'ca-recarregar', '↻ Recarregar')
            recarregar.disabled = !canEdit || (a.municao ?? 0) >= a.capacidade || (a.recargas ?? 0) <= 0
            recarregar.title = a.recargaLabel || 'Recarregar'
            recarregar.addEventListener('click', () => {
                const novas = armas.map((w, i) => i === idx
                    ? { ...w, municao: w.capacidade, recargas: Math.max(0, (w.recargas ?? 0) - 1) }
                    : w)
                commit('armas', novas)
                abrirPainelArmas(statsAtuais(), canEdit)
            })
            linha.appendChild(recarregar)
            card.appendChild(linha)

            const meta = mk('div', 'ca-arma-meta')
            meta.textContent = `${a.recargaLabel || ''} · ${a.recargas ?? 0} recarga(s) na bolsa`
            card.appendChild(meta)

            // Balas visuais — dá pra ver o tambor esvaziando
            const tambor = mk('div', 'ca-tambor')
            for (let i = 0; i < a.capacidade; i++) {
                tambor.appendChild(mk('span', 'ca-bala' + (i < (a.municao ?? 0) ? ' cheia' : '')))
            }
            card.appendChild(tambor)
        } else {
            card.appendChild(mk('div', 'ca-arma-meta', 'Sem munição'))
        }

        if (a.nota) card.appendChild(mk('div', 'ca-arma-nota', a.nota))
        body.appendChild(card)
    })

    // Quais armas o personagem tem é build; quem adiciona ou remove é o mestre.
    // O contador de munição acima continua nas mãos de quem atira.
    if (podeEditarFicha()) {
        const add = mk('div', 'ca-add')
        const sel = document.createElement('select')
        sel.className = 'cr-select'
        const ph = document.createElement('option')
        ph.textContent = '+ Adicionar arma…'
        ph.value = ''
        sel.appendChild(ph)
        C.ARMAS.forEach(def => {
            const o = document.createElement('option')
            o.value = def.id
            o.textContent = `${def.nome} — ${def.dano}`
            sel.appendChild(o)
        })
        sel.addEventListener('change', () => {
            if (!sel.value) return
            const def = C.ARMAS_POR_ID[sel.value]
            commit('armas', [...armas, C.instanciarArma(def)])
            abrirPainelArmas(statsAtuais(), canEdit)
        })
        add.appendChild(sel)
        body.appendChild(add)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel: CONDIÇÕES (§7.8) ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function abrirPainelCondicoes(stats, canEdit) {
    const { body } = painel('calicoCond', '🩸 Condições', 'wide')
    body.innerHTML = ''

    const ativas = stats.condicoes || []

    C.CONDICOES.forEach(c => {
        const on = ativas.includes(c.id)
        const row = mk('div', 'cc-cond' + (on ? ' ativa' : ''))

        const head = mk('div', 'cc-cond-head')
        head.appendChild(mk('span', 'cc-cond-icon', c.icon))
        head.appendChild(mk('span', 'cc-cond-nome', c.nome))
        const toggle = mk('button', 'cc-toggle' + (on ? ' on' : ''), on ? 'Ativa' : 'Aplicar')
        toggle.disabled = !canEdit
        toggle.addEventListener('click', () => {
            const novas = on ? ativas.filter(x => x !== c.id) : [...ativas, c.id]
            commit('condicoes', novas)
            reabrirFicha()
            abrirPainelCondicoes(statsAtuais(), canEdit)
        })
        head.appendChild(toggle)
        row.appendChild(head)

        row.appendChild(mk('div', 'cc-cond-efeito', c.efeito))
        body.appendChild(row)
    })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel: TESTES DE MORTE (§7.9 / §7.10) ───────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function abrirPainelMorte(stats, canEdit) {
    const { body } = painel('calicoMorte', '💀 Testes de morte', 'wide')
    body.innerHTML = ''

    const tm = stats.testes_morte || { vigor: 0, disciplina: 0 }

    Object.values(C.TESTES_DE_MORTE).forEach(def => {
        const feitos = tm[def.key] || 0
        const dt = C.dtTesteDeMorte(feitos)

        const card = mk('div', 'cm-card')
        const head = mk('div', 'cm-head')
        head.appendChild(mk('span', 'cm-nome', `${def.label} (${def.recurso} 0)`))
        head.appendChild(mk('span', 'cm-dt', `DT ${dt}`))
        card.appendChild(head)

        card.appendChild(mk('div', 'cm-gatilho', def.gatilho))
        card.appendChild(mk('div', 'cm-falha', `Falhou → ${def.falha}`))

        const ctrl = mk('div', 'cm-ctrl')
        ctrl.appendChild(mk('span', 'cm-contador', `${feitos} teste(s) feito(s)`))

        const rolar = mk('button', 'cm-rolar', `🎲 Rolar ${def.label}`)
        rolar.disabled = !canEdit
        rolar.title = `Rola ${def.atributo.toUpperCase()} + ${def.label} e conta mais um teste. A DT ${dt} fica aqui para você comparar.`
        rolar.addEventListener('click', () => {
            // Teste de morte é o teste da perícia, sem passos e sem atributo forçado
            roller.pericia = def.pericia
            roller.atributoForcado = def.atributo
            roller.passos = 0
            // Conta o teste antes de rolar: a próxima DT já sobe +3
            commit('testes_morte', { ...tm, [def.key]: feitos + 1 })
            abrirPainelTestes(statsAtuais())
            executarRolagem(statsAtuais())
            abrirPainelMorte(statsAtuais(), canEdit)
        })
        ctrl.appendChild(rolar)

        // §7.9 — o contador reseta ao fim do combate, desde que tenha recuperado 1 PV
        const reset = mk('button', 'cm-reset', '↺ Zerar')
        reset.disabled = !canEdit || feitos === 0
        reset.title = 'Reseta ao fim do combate, desde que o personagem tenha recuperado ao menos 1 PV'
        reset.addEventListener('click', () => {
            commit('testes_morte', { ...tm, [def.key]: 0 })
            reabrirFicha()
            abrirPainelMorte(statsAtuais(), canEdit)
        })
        ctrl.appendChild(reset)

        card.appendChild(ctrl)
        body.appendChild(card)
    })

    body.appendChild(mk('div', 'calico-panel-note',
        'A DT do primeiro teste é 7 e sobe +3 a cada teste já feito. O contador zera ao fim do combate, se o personagem tiver recuperado ao menos 1 PV.'))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel: HABILIDADES ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function abrirPainelHabilidades(stats, canEdit) {
    const { body } = painel('calicoHab', '⚡ Habilidades', 'wide')
    body.innerHTML = ''

    const habs = stats.habilidades || []
    if (habs.length === 0) body.appendChild(mk('div', 'subp-empty', 'Nenhuma habilidade.'))

    habs.forEach((h, idx) => {
        const item = mk('div', 'subp-hab-item')
        const head = mk('div', 'subp-hab-header')
        head.appendChild(mk('span', 'subp-hab-name', h.nome || 'Sem nome'))
        if (h.origem) {
            const tag = mk('span', 'ch-origem', h.origem === 'perfil' ? 'perfil' : h.origem === 'ocupacao' ? 'ocupação' : h.origem)
            head.appendChild(tag)
        }
        if (canEdit) {
            const del = mk('button', 'subp-hab-del', '✕')
            del.addEventListener('click', () => {
                commit('habilidades', habs.filter((_, i) => i !== idx))
                abrirPainelHabilidades(statsAtuais(), canEdit)
            })
            head.appendChild(del)
        }
        item.appendChild(head)
        if (h.descricao) item.appendChild(mk('div', 'subp-hab-desc', h.descricao))
        if (h.placeholder) {
            const aviso = mk('div', 'ch-placeholder', '⚠ Texto provisório — substituir pelo oficial do playtest')
            item.appendChild(aviso)
        }
        body.appendChild(item)
    })

    if (canEdit) {
        const addBtn = mk('button', 'subp-add-btn', '+ Nova Habilidade')
        addBtn.addEventListener('click', () => {
            const form = formHabilidade(habs, canEdit)
            body.insertBefore(form, addBtn)
        })
        body.appendChild(addBtn)
    }
}

function formHabilidade(habs, canEdit) {
    const form = mk('div', 'subp-hab-form')

    const nameIn = document.createElement('input')
    nameIn.className = 'subp-hab-input'
    nameIn.placeholder = 'Nome da habilidade'
    nameIn.maxLength = 60
    nameIn.addEventListener('keydown', e => e.stopPropagation())

    const descIn = document.createElement('textarea')
    descIn.className = 'subp-hab-textarea'
    descIn.placeholder = 'Descrição'
    descIn.maxLength = 400
    descIn.rows = 3
    descIn.addEventListener('keydown', e => e.stopPropagation())

    const btns = mk('div', 'subp-hab-btns')
    const save = mk('button', 'subp-hab-save', '✓ Salvar')
    const cancel = mk('button', 'subp-hab-cancel', 'Cancelar')

    save.addEventListener('click', () => {
        const nome = nameIn.value.trim()
        if (!nome) return
        commit('habilidades', [...habs, { origem: 'manual', nome, descricao: descIn.value.trim() }])
        form.remove()
        abrirPainelHabilidades(statsAtuais(), canEdit)
    })
    cancel.addEventListener('click', () => form.remove())

    btns.appendChild(save); btns.appendChild(cancel)
    form.appendChild(nameIn); form.appendChild(descIn); form.appendChild(btns)
    return form
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Infraestrutura de painéis ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const painesAbertos = {}

function painel(id, titulo, extraCls) {
    let el = document.getElementById(id)
    if (!el) {
        el = document.createElement('div')
        el.id = id
        el.className = 'subpanel calico-panel' + (extraCls ? ' ' + extraCls : '')

        const header = mk('div', 'subpanel-header')
        header.appendChild(mk('span', 'subpanel-title', titulo))
        const close = mk('button', 'subpanel-close', '✕')
        close.addEventListener('click', () => el.classList.remove('visible'))
        header.appendChild(close)
        el.appendChild(header)

        el.appendChild(mk('div', 'subpanel-body'))
        document.body.appendChild(el)
        makeDraggable(el, header)
        painesAbertos[id] = el
    }
    el.querySelector('.subpanel-title').textContent = titulo
    posicionar(el)
    return { el, body: el.querySelector('.subpanel-body') }
}

function posicionar(panel) {
    const statPopup = document.getElementById('statPopup')
    const jaVisivel = panel.classList.contains('visible')
    panel.classList.add('visible')
    if (jaVisivel) return   // não reposiciona um painel que o usuário já arrastou

    panel.style.visibility = 'hidden'
    requestAnimationFrame(() => {
        const sp = statPopup.getBoundingClientRect()
        const pw = panel.offsetWidth
        const ph = panel.offsetHeight
        let left = sp.right + 10
        if (left + pw > window.innerWidth - 8) left = sp.left - pw - 10
        left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
        const top = Math.max(8, Math.min(sp.top, window.innerHeight - ph - 8))
        panel.style.left = left + 'px'
        panel.style.top = top + 'px'
        panel.style.visibility = 'visible'
    })
}

/** Chamado por statPopup.js ao fechar a ficha. */
function fecharPaineis() {
    document.querySelectorAll('.calico-panel').forEach(p => p.classList.remove('visible'))
    if (roller) roller.ultimo = null
}

function flashPanelNote(body, msg) {
    let nota = body.querySelector('.calico-panel-flash')
    if (!nota) {
        nota = mk('div', 'calico-panel-flash')
        body.insertBefore(nota, body.firstChild)
    }
    nota.textContent = '⚠ ' + msg
    nota.classList.remove('piscar')
    void nota.offsetWidth
    nota.classList.add('piscar')
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Ponte com statPopup.js ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function statsAtuais() {
    return state.statPopupChar ? state.statPopupChar.stats : null
}

function commit(campo, valor) {
    const { commitStatChange } = require('./statPopup')
    commitStatChange(campo, valor)
}

/** Redesenha a ficha sem mexer na posição do popup nem nos painéis abertos. */
function reabrirFicha() {
    const container = document.getElementById('statDynamicRows')
    const char = state.statPopupChar
    if (!container || !char) return
    const entry = state.allCharsCache.find(e => e.character.id === char.id)
    const ownerName = entry ? entry.playerName : state.playerName
    const canEdit = state.isRoomMaster || ownerName === state.playerName
    container.innerHTML = ''
    buildSheet(container, char.stats || {}, canEdit)
}

/**
 * Chamado por socket.js quando outro cliente altera um stat do personagem que
 * está aberto aqui. Campos estruturados (perícias, armas, condições…) precisam
 * de um redesenho; os numéricos simples statPopup.js já atualiza sozinho.
 */
function onRemoteStatUpdate(charId, field) {
    if (!state.statPopupChar || state.statPopupChar.id !== charId) return
    if (!isCalico(state.statPopupChar)) return
    reabrirFicha()
    // Painéis abertos que mostram esse campo também precisam se redesenhar
    const stats = statsAtuais()
    const entry = state.allCharsCache.find(e => e.character.id === charId)
    const ownerName = entry ? entry.playerName : state.playerName
    const canEdit = state.isRoomMaster || ownerName === state.playerName
    const visivel = id => { const el = document.getElementById(id); return el && el.classList.contains('visible') }
    if (field === 'armas' && visivel('calicoArmas')) abrirPainelArmas(stats, canEdit)
    if (field === 'pericias' && visivel('calicoTestes')) abrirPainelTestes(stats)
    if (field === 'condicoes' && visivel('calicoCond')) abrirPainelCondicoes(stats, canEdit)
    if (field === 'habilidades' && visivel('calicoHab')) abrirPainelHabilidades(stats, canEdit)
    if (field === 'testes_morte' && visivel('calicoMorte')) abrirPainelMorte(stats, canEdit)
}

function isCalico(char) {
    return !!char && char.system === 'calico'
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Exibição do resultado de teste para a sala inteira ───────────────────────
// ══════════════════════════════════════════════════════════════════════════════
let overlayTimer = null

function mostrarRolagemNaSala(res) {
    let el = document.getElementById('calicoRollOverlay')
    if (!el) {
        el = document.createElement('div')
        el.id = 'calicoRollOverlay'
        document.body.appendChild(el)
    }
    el.innerHTML = ''
    el.className = res.falhaCritica ? 'falha-critica' : res.critico ? 'critico' : 'neutro'

    const ctx = res.contexto || {}
    el.appendChild(mk('div', 'cro-quem', ctx.personagem || '—'))
    let teste = `${ctx.atributo || ''} + ${ctx.pericia || ''}`
    if (ctx.passos) teste += `  ${ctx.passos > 0 ? '+' : ''}${ctx.passos} passo${Math.abs(ctx.passos) > 1 ? 's' : ''}`
    el.appendChild(mk('div', 'cro-teste', teste))

    const dados = mk('div', 'cro-dados')
    ;(res.rolados || []).forEach(d => {
        const die = mk('div', 'cro-die' + (d.somado ? '' : ' descartado'))
        die.appendChild(mk('span', 'cro-die-val', String(d.valor)))
        die.appendChild(mk('span', 'cro-die-tipo', d.dado))
        dados.appendChild(die)
    })
    el.appendChild(dados)

    // Sem DT e sem veredito: quem compara é a mesa
    const nums = mk('div', 'cro-nums')
    nums.appendChild(mk('span', 'cro-soma', String(res.soma)))
    el.appendChild(nums)

    el.appendChild(mk('div', 'cro-ra-rb', `RA ${res.ra} · RB ${res.rb}`))

    if (res.falhaCritica) el.appendChild(mk('div', 'cro-veredito', '✗ FALHA CRÍTICA'))
    else if (res.critico) el.appendChild(mk('div', 'cro-veredito', '✦ CRÍTICO'))

    el.classList.add('show')
    clearTimeout(overlayTimer)
    overlayTimer = setTimeout(() => el.classList.remove('show'), 6000)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

function botaoPainel(label, onClick) {
    const btn = mk('button', 'sp-subpanel-btn', label)
    btn.addEventListener('click', onClick)
    return btn
}

function adjBtn(label, enabled, onClick, extraCls) {
    const btn = document.createElement('button')
    btn.className = 'sp-adj-btn' + (extraCls ? ' ' + extraCls : '')
    btn.textContent = label
    btn.disabled = !enabled
    btn.addEventListener('click', e => { e.stopPropagation(); onClick() })
    return btn
}

function numInput(key, value, enabled) {
    const input = document.createElement('input')
    input.className = 'sp-stat-input'
    input.type = 'number'
    input.min = '0'
    input.value = value
    input.disabled = !enabled
    input.dataset.statKey = key
    input.addEventListener('change', () => {
        const v = Math.max(0, parseInt(input.value) || 0)
        input.value = v
        commit(key, v)
        reabrirFicha()
    })
    input.addEventListener('keydown', e => e.stopPropagation())
    return input
}

function ajustar(campo, delta) {
    const stats = statsAtuais()
    if (!stats) return
    const novo = Math.max(0, (stats[campo] ?? 0) + delta)
    commit(campo, novo)
    reabrirFicha()
}

/** Seletor de dado na escala d4…d12, com teto opcional. */
function seletorDado(valor, canEdit, onPick, teto) {
    const wrap = mk('div', 'calico-die-opts')
    C.ESCALA_DADOS.forEach(d => {
        const b = mk('button', 'calico-die-btn' + (valor === d ? ' active' : ''), d)
        b.type = 'button'
        b.disabled = !canEdit || (teto && C.indiceDado(d) > C.indiceDado(teto))
        if (teto && C.indiceDado(d) > C.indiceDado(teto)) b.title = `Acima do teto ${teto}`
        b.addEventListener('click', e => { e.stopPropagation(); onPick(d) })
        wrap.appendChild(b)
    })
    return wrap
}

module.exports = {
    buildSheet, fecharPaineis, onRemoteStatUpdate, isCalico,
    mostrarRolagemNaSala, resetRoller,
}
