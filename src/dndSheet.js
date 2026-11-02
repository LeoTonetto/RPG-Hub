// ══════════════════════════════════════════════════════════════════════════════
// src/dndSheet.js — FICHA DO D&D 5e NA SALA
//
// statPopup.js delega para cá quando o personagem aberto é do sistema 'dnd'.
// A ficha mostra o que o motor (dnd.js) calcula; o que se mexe durante o jogo
// (PV, PV temporários, usos de recurso, espaços de magia, inspiração,
// armadura vestida) é gravado em stats e sincronizado com a sala.
//
// Permissões:
//   dono    — mexe nos recursos do jogo e sobe de nível quando liberado
//   mestre  — mexe em tudo e libera a subida de nível
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const D = require('./dndDados')
const { makeDraggable } = require('./hud')
const magiasUI = require('./dndMagiasUI')
const rolagem = require('./dndRolagem')

// Magias de cura que somam o atributo de conjuração ao dado
const CURA_SOMA_ATRIBUTO = new Set(['curar-ferimentos', 'palavra-curativa', 'curar-ferimentos-em-massa', 'palavra-curativa-em-massa', 'oracao-curativa'])

function isDnd(char) {
    return !!char && char.system === 'dnd'
}

function ehMeu(charId) {
    return state.playerCharacters.some(c => c.id === charId)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Ficha principal ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Chamado por statPopup.js. Monta o corpo da ficha dentro de `container`. */
function buildSheet(container, stats, canEdit) {
    container.classList.add('dnd-sheet')
    segurarCliques(container, () => container.classList.contains('dnd-sheet'))
    const char = state.statPopupChar
    if (!char) return
    const meu = ehMeu(char.id)
    const mestre = !!state.isRoomMaster
    const f = dnd.calcular(stats)
    if (canEdit) sincronizarDerivados(stats, f)

    const titulo = mk('div', 'ds-titulo')
    const { classe } = dnd.fontes(stats)
    if (classe && classe.icone) titulo.appendChild(magiasUI.icone(classe.icone, 'ds-titulo-icone'))
    titulo.appendChild(mk('span', null, f.titulo || 'Personagem sem classe'))
    container.appendChild(titulo)
    if (stats.alinhamento) {
        const al = D.ALINHAMENTOS.find(a => a.key === stats.alinhamento)
        if (al) container.appendChild(mk('div', 'ds-subtitulo', al.nome))
    }

    // ── Subida de nível e pendências ─────────────────────────────────────────
    const liberado = stats.nivel_liberado && stats.nivel_liberado > (stats.nivel || 1)
    if (liberado && (meu || mestre)) {
        const b = mk('button', 'ds-subir', `⬆ Subir para o nível ${(stats.nivel || 1) + 1}`)
        b.addEventListener('click', () => require('./dndCreate').abrirNivel(char, 'subir'))
        container.appendChild(b)
    }
    if (f.pendencias.length && (meu || mestre)) {
        const b = mk('button', 'ds-pendente', `✎ ${f.pendencias.length} escolha(s) pendente(s)`)
        b.title = f.pendencias.map(p => p.rotulo).join('\n')
        b.addEventListener('click', () => require('./dndCreate').abrirNivel(char, 'completar'))
        container.appendChild(b)
    }
    if (mestre && (stats.nivel || 1) < dnd.NIVEL_MAX) {
        const linha = mk('div', 'ds-mestre')
        if (liberado) {
            linha.appendChild(mk('span', null, `Nível ${stats.nivel_liberado} liberado`))
            const cancelar = mk('button', 'ds-link', 'cancelar')
            cancelar.addEventListener('click', () => { commit('nivel_liberado', null); reabrirFicha() })
            linha.appendChild(cancelar)
        } else {
            const b = mk('button', 'ds-liberar', `⬆ Liberar nível ${(stats.nivel || 1) + 1}`)
            b.title = 'O jogador faz as escolhas da subida pela ficha'
            b.addEventListener('click', () => liberarNivel(char, (stats.nivel || 1) + 1))
            linha.appendChild(b)
        }
        container.appendChild(linha)
    }

    // ── PV ───────────────────────────────────────────────────────────────────
    container.appendChild(blocoPV(stats, f, canEdit))

    // ── Números principais ───────────────────────────────────────────────────
    const chips = mk('div', 'ds-chips')
    chips.appendChild(chip('CA', f.ca, f.caDetalhe + (f.semProfArmadura ? '\n⚠ Sem proficiência nessa armadura: desvantagem em testes de FOR e DES e não pode conjurar.' : ''), f.semProfArmadura ? 'alerta' : ''))
    // Iniciativa rola direto: é a rolagem mais comum fora das perícias
    const inic = chip('Inic.', dnd.sinal(f.iniciativa), (f.vantagemIniciativa ? 'Vantagem em iniciativa. ' : '') + 'Clique para rolar', 'clicavel' + (f.vantagemIniciativa ? ' vantagem' : ''))
    inic.addEventListener('click', () => rolarTeste(char, 'Iniciativa', f.iniciativa, f.vantagemIniciativa ? 'vantagem' : null))
    chips.appendChild(inic)
    chips.appendChild(chip('Desloc.', fmtMetros(f.deslocamento), 'Deslocamento de caminhada'))
    chips.appendChild(chip('Prof.', dnd.sinal(f.prof), 'Bônus de proficiência'))
    chips.appendChild(chip('Perc.', f.percepcaoPassiva, 'Percepção passiva'))
    const insp = chip('Insp.', stats.inspiracao ? '★' : '☆', canEdit ? 'Inspiração (clique para alternar)' : 'Inspiração', stats.inspiracao ? 'ativo' : '')
    if (canEdit) {
        insp.classList.add('clicavel')
        insp.addEventListener('click', () => { commit('inspiracao', !stats.inspiracao); reabrirFicha() })
    }
    chips.appendChild(insp)
    container.appendChild(chips)

    // ── Atributos e testes de resistência ────────────────────────────────────
    const grade = mk('div', 'ds-attrs')
    D.ATRIBUTOS.forEach(a => {
        const t = mk('div', 'ds-attr')
        t.title = `${a.nome} ${f.atributos[a.key]}\nTeste de resistência ${dnd.sinal(f.resistencias[a.key].bonus)}${f.resistencias[a.key].prof ? ' (proficiente)' : ''}`
        t.appendChild(mk('span', 'ds-attr-abrev', a.abrev))
        t.appendChild(mk('b', 'ds-attr-mod', dnd.sinal(f.mods[a.key])))
        t.appendChild(mk('span', 'ds-attr-valor', String(f.atributos[a.key])))
        t.appendChild(mk('span', 'ds-attr-res' + (f.resistencias[a.key].prof ? ' prof' : ''), `RES ${dnd.sinal(f.resistencias[a.key].bonus)}`))
        grade.appendChild(t)
    })
    container.appendChild(grade)

    const extras = []
    if (f.infoClasse) extras.push(f.infoClasse)
    if (f.visaoEscuro) extras.push(`Visão no escuro ${fmtMetros(f.visaoEscuro)}`)
    if (f.resistenciasDano.length) extras.push(`Resiste: ${f.resistenciasDano.join(', ')}`)
    if (extras.length) container.appendChild(mk('div', 'ds-extras', extras.join(' · ')))

    // ── Painéis ──────────────────────────────────────────────────────────────
    const linha = mk('div', 'sp-subpanel-row ds-botoes')
    // O botão principal, como no Calico: perícias e testes com o dado do lado
    const testes = mk('button', 'cs-roll-btn ds-testes-btn', '🎲 Perícias & Testes')
    testes.addEventListener('click', () => abrirPainelPericias(stats))
    container.appendChild(testes)

    linha.appendChild(botaoPainel('📜 Características', () => abrirPainelCaracteristicas(stats)))
    linha.appendChild(botaoPainel('⚡ Recursos', () => abrirPainelRecursos(stats, canEdit)))
    if (f.conjuracao || f.magias.length) linha.appendChild(botaoPainel('✦ Magias', () => abrirPainelMagia(stats, canEdit)))
    linha.appendChild(botaoPainel('🛡 Equipamento', () => abrirPainelEquipamento(stats, canEdit)))
    linha.appendChild(botaoPainel('🗣 Proficiências', () => abrirPainelProficiencias(stats)))
    container.appendChild(linha)

    if (canEdit) {
        const descanso = mk('div', 'ds-descanso')
        const curto = mk('button', 'ds-descanso-btn', '☕ Descanso curto')
        curto.title = 'Recupera usos de descanso curto e os espaços de magia de pacto'
        curto.addEventListener('click', () => descansar('curto'))
        const longo = mk('button', 'ds-descanso-btn', '🌙 Descanso longo')
        longo.title = 'Recupera PV, todos os usos, espaços de magia e metade dos Dados de Vida'
        longo.addEventListener('click', () => descansar('longo'))
        descanso.appendChild(curto)
        descanso.appendChild(longo)
        container.appendChild(descanso)
    }
}

/**
 * hp_max e ca ficam gravados em stats porque o card e a sala leem de lá.
 * Se a regra mudou desde a última gravação (atualização do app, armadura
 * trocada por outro cliente), corrige aqui.
 */
function sincronizarDerivados(stats, f) {
    if (stats.hp_max !== f.pvMax) commit('hp_max', f.pvMax)
    if (stats.ca !== f.ca) commit('ca', f.ca)
}

function blocoPV(stats, f, canEdit) {
    const wrap = mk('div', 'ds-pv')
    const max = f.pvMax
    const hp = Math.max(0, Math.min(stats.hp ?? max, max))
    const temp = stats.hp_temp || 0

    const topo = mk('div', 'ds-pv-topo')
    topo.appendChild(mk('span', 'ds-pv-rotulo', '❤ PV'))
    const valor = mk('span', 'ds-pv-valor')
    valor.appendChild(mk('b', null, String(hp)))
    valor.appendChild(mk('span', null, ` / ${max}`))
    if (temp) valor.appendChild(mk('span', 'ds-pv-temp', ` +${temp}`))
    topo.appendChild(valor)
    wrap.appendChild(topo)

    const barra = mk('div', 'ds-pv-barra')
    const fill = mk('div', 'ds-pv-fill')
    fill.style.width = `${max ? Math.round((hp / max) * 100) : 0}%`
    barra.appendChild(fill)
    if (temp) {
        const t = mk('div', 'ds-pv-fill-temp')
        t.style.width = `${Math.min(100, Math.round((temp / max) * 100))}%`
        barra.appendChild(t)
    }
    wrap.appendChild(barra)

    if (canEdit) {
        // Dano consome primeiro os PV temporários, como manda o livro
        const ctl = mk('div', 'ds-pv-ctl')
        const qtd = document.createElement('input')
        qtd.type = 'number'
        qtd.min = '1'
        qtd.value = '1'
        qtd.className = 'sp-stat-input ds-pv-qtd'
        qtd.title = 'Quantidade'
        qtd.addEventListener('keydown', e => e.stopPropagation())
        const valorQtd = () => Math.max(1, parseInt(qtd.value, 10) || 1)

        const dano = mk('button', 'ds-pv-btn dano', 'Dano')
        dano.addEventListener('click', () => {
            let n = valorQtd()
            let t = stats.hp_temp || 0
            const absorvido = Math.min(t, n)
            t -= absorvido
            n -= absorvido
            if (absorvido) commit('hp_temp', t)
            if (n) commit('hp', Math.max(0, (stats.hp ?? max) - n))
            reabrirFicha()
        })
        const cura = mk('button', 'ds-pv-btn cura', 'Cura')
        cura.addEventListener('click', () => { commit('hp', Math.min(max, (stats.hp ?? 0) + valorQtd())); reabrirFicha() })
        const tempBtn = mk('button', 'ds-pv-btn', 'Temp.')
        tempBtn.title = 'PV temporários não somam: fica o maior'
        tempBtn.addEventListener('click', () => { commit('hp_temp', Math.max(stats.hp_temp || 0, valorQtd())); reabrirFicha() })

        ctl.appendChild(dano)
        ctl.appendChild(qtd)
        ctl.appendChild(cura)
        ctl.appendChild(tempBtn)
        wrap.appendChild(ctl)
    }
    return wrap
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painéis ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function abrirPainelPericias(stats) {
    const { body } = painel('dndPericias', '🎲 Perícias & Testes', 'ds-painel-testes')
    body.innerHTML = ''
    const char = state.statPopupChar
    const f = dnd.calcular(stats)

    body.appendChild(rolagem.seletorModo())

    const secao = titulo => body.appendChild(mk('div', 'ds-grupo', titulo))
    const linhaRolavel = (nome, sub, bonus, marca, cls) => {
        const l = mk('div', 'ds-rola' + (cls ? ' ' + cls : ''))
        l.appendChild(mk('span', 'ds-rola-marca', marca || ''))
        l.appendChild(mk('span', 'ds-rola-nome', nome))
        if (sub) l.appendChild(mk('span', 'ds-rola-sub', sub))
        l.appendChild(mk('b', 'ds-rola-bonus', dnd.sinal(bonus)))
        const b = mk('button', 'ds-rola-dado', '🎲')
        b.title = `Rolar ${nome} (d20 ${dnd.sinal(bonus)})`
        b.setAttribute('aria-label', b.title)
        b.addEventListener('click', () => rolarTeste(char, nome, bonus))
        l.appendChild(b)
        body.appendChild(l)
    }

    secao('Perícias')
    D.PERICIAS.forEach(p => {
        const per = f.pericias[p.key]
        linhaRolavel(p.nome, D.ATRIBUTO_POR_KEY[p.attr].abrev, per.bonus,
            per.especialista ? '◆' : per.prof ? '●' : per.meia ? '◐' : '○', per.prof ? 'prof' : '')
    })

    secao('Testes de resistência')
    D.ATRIBUTOS.forEach(a => {
        const r = f.resistencias[a.key]
        linhaRolavel(`Resistência de ${a.nome}`, a.abrev, r.bonus, r.prof ? '●' : '○', r.prof ? 'prof' : '')
    })

    secao('Atributos')
    D.ATRIBUTOS.forEach(a => linhaRolavel(`Teste de ${a.nome}`, a.abrev, f.mods[a.key], ''))

    body.appendChild(mk('div', 'ds-legenda', '● proficiente · ◆ especialista · ◐ metade da proficiência'))
    body.appendChild(mk('div', 'ds-extras', `Percepção passiva ${f.percepcaoPassiva} · Investigação passiva ${f.investigacaoPassiva}`))
}

function rolarTeste(char, rotulo, bonus, forcarModo) {
    rolagem.testeD20({ personagem: char ? char.name : '?', rotulo, bonus, forcarModo: forcarModo || undefined })
}

function abrirPainelCaracteristicas(stats) {
    const { body } = painel('dndCaract', '📜 Características', 'ds-painel-largo')
    body.innerHTML = ''
    const f = dnd.calcular(stats)
    let origemAtual = null
    f.caracteristicas.forEach(c => {
        const grupo = c.origem.split(' · ')[0]
        if (grupo !== origemAtual) {
            body.appendChild(mk('div', 'ds-grupo', grupo))
            origemAtual = grupo
        }
        const item = mk('div', 'ds-caract')
        const cab = mk('div', 'ds-caract-cab')
        cab.appendChild(mk('b', null, c.nome))
        const nivel = c.origem.split(' · ')[1]
        if (nivel) cab.appendChild(mk('span', 'ds-muted', nivel))
        item.appendChild(cab)
        if (c.escolhidos) item.appendChild(mk('div', 'ds-caract-escolha', c.escolhidos))
        item.appendChild(mk('div', 'ds-caract-desc', c.desc))
        body.appendChild(item)
    })
}

function abrirPainelRecursos(stats, canEdit) {
    const { body } = painel('dndRecursos', '⚡ Recursos')
    body.innerHTML = ''
    const f = dnd.calcular(stats)
    const usados = stats.recursos_usados || {}

    if (!f.recursos.length) body.appendChild(mk('div', 'ds-muted', 'Nenhum recurso com usos limitados.'))
    f.recursos.forEach(r => {
        const linha = mk('div', 'ds-recurso')
        const cab = mk('div', 'ds-recurso-cab')
        cab.appendChild(mk('b', null, r.nome))
        cab.appendChild(mk('span', 'ds-muted', [r.dado, r.info, r.recarga === 'curto' ? 'descanso curto' : 'descanso longo'].filter(Boolean).join(' · ')))
        linha.appendChild(cab)
        if (r.max == null) {
            linha.appendChild(mk('div', 'ds-muted', 'Ilimitado'))
        } else {
            const usado = Math.min(r.max, usados[r.id] || 0)
            linha.appendChild(contador(r.max, usado, canEdit, novo => {
                commit('recursos_usados', { ...(stats.recursos_usados || {}), [r.id]: novo })
                abrirPainelRecursos(statsAtuais(), canEdit)
            }, r.pontos))
        }
        body.appendChild(linha)
    })

    // Dados de Vida: gastos no descanso curto para curar
    const dv = mk('div', 'ds-recurso')
    const cab = mk('div', 'ds-recurso-cab')
    cab.appendChild(mk('b', null, `Dados de Vida (d${f.dadoVida})`))
    cab.appendChild(mk('span', 'ds-muted', `cada um cura 1d${f.dadoVida} ${dnd.sinal(f.mods.con)} · metade volta no descanso longo`))
    dv.appendChild(cab)
    dv.appendChild(contador(f.nivel, Math.min(f.nivel, stats.dados_vida_usados || 0), canEdit, novo => {
        commit('dados_vida_usados', novo)
        abrirPainelRecursos(statsAtuais(), canEdit)
    }))
    body.appendChild(dv)
}

// Magia em destaque no painel (a última clicada), por personagem
const magiaEmFoco = {}

function abrirPainelMagia(stats, canEdit) {
    const { body } = painel('dndMagia', '✦ Magias', 'ds-painel-magia')
    body.innerHTML = ''
    const char = state.statPopupChar
    const f = dnd.calcular(stats)
    const cj = f.conjuracao
    const usados = stats.espacos_usados || {}

    if (cj) {
        const nums = mk('div', 'ds-chips')
        nums.appendChild(chip('CD', cj.cd, `8 + proficiência + ${D.ATRIBUTO_POR_KEY[cj.atributo].nome}`))
        nums.appendChild(chip('Ataque', dnd.sinal(cj.ataque), 'Jogada de ataque com magia'))
        nums.appendChild(chip('Atrib.', D.ATRIBUTO_POR_KEY[cj.atributo].abrev, D.ATRIBUTO_POR_KEY[cj.atributo].nome))
        body.appendChild(nums)

        // Espaços de magia: bolinhas por nível, como no BG3
        const espacos = mk('div', 'ds-espacos')
        cj.espacos.forEach((qtd, i) => {
            const n = i + 1
            const linha = mk('div', 'ds-espaco')
            linha.appendChild(mk('span', 'ds-espaco-nivel', `${n}º`))
            linha.appendChild(contador(qtd, Math.min(qtd, usados[n] || 0), canEdit, novo => {
                commit('espacos_usados', { ...(stats.espacos_usados || {}), [n]: novo })
                abrirPainelMagia(statsAtuais(), canEdit)
            }))
            espacos.appendChild(linha)
        })
        if (cj.pacto) {
            const linha = mk('div', 'ds-espaco')
            linha.appendChild(mk('span', 'ds-espaco-nivel', `Pacto ${cj.pacto.nivel}º`))
            linha.appendChild(contador(cj.pacto.qtd, Math.min(cj.pacto.qtd, usados.pacto || 0), canEdit, novo => {
                commit('espacos_usados', { ...(stats.espacos_usados || {}), pacto: novo })
                abrirPainelMagia(statsAtuais(), canEdit)
            }))
            espacos.appendChild(linha)
        }
        if (espacos.childNodes.length) body.appendChild(espacos)
    }

    if (!f.magias.length) {
        body.appendChild(mk('div', 'ds-muted', 'Nenhuma magia escolhida ainda.'))
        if (f.pendencias.some(p => p.tipo === 'magia')) body.appendChild(mk('div', 'ds-legenda', 'Use "escolhas pendentes" na ficha para escolher.'))
        return
    }

    // Lista por nível, com ícone
    const lista = mk('div', 'ds-magias')
    let nivelAtual = null
    const foco = f.magias.find(m => m.id === magiaEmFoco[char.id]) || f.magias[0]
    f.magias.forEach(m => {
        if (m.nivel !== nivelAtual) {
            nivelAtual = m.nivel
            lista.appendChild(mk('div', 'ds-grupo', m.nivel === 0 ? 'Truques' : `${m.nivel}º nível`))
        }
        const b = mk('button', 'ds-magia' + (m.id === foco.id ? ' on' : ''))
        b.type = 'button'
        b.appendChild(magiasUI.icone(m.icone))
        b.appendChild(mk('span', 'ds-magia-nome', m.nome))
        const tags = []
        if (m.concentracao) tags.push('C')
        if (m.ritual) tags.push('R')
        if (m.sempre) tags.push('★')
        if (tags.length) b.appendChild(mk('span', 'ds-magia-tags', tags.join(' ')))
        b.title = `${m.nome} — ${m.origem}`
        b.addEventListener('click', () => { magiaEmFoco[char.id] = m.id; abrirPainelMagia(statsAtuais(), canEdit) })
        lista.appendChild(b)
    })
    body.appendChild(lista)
    body.appendChild(mk('div', 'ds-legenda', 'C concentração · R ritual · ★ vem da raça ou da subclasse'))

    // Detalhe da magia em foco, com as ações
    const det = mk('div', 'dm-detalhe ds-magia-det')
    magiasUI.desenharDetalhe(det, foco, null, acoesDaMagia(char, stats, f, foco, canEdit))
    body.appendChild(det)
}

/** Conjurar (gasta o espaço e rola o efeito), ataque e dano/cura. */
function acoesDaMagia(char, stats, f, m, canEdit) {
    const w = mk('div', 'ds-magia-acoes')
    const nome = char ? char.name : '?'
    const linhaInfo = mk('div', 'ds-magia-info', `${m.origem} · ${D.ATRIBUTO_POR_KEY[m.atributo].abrev} · CD ${m.cd}${m.ataque ? ` · ataque ${dnd.sinal(m.ataqueBonus)}` : ''}${m.usos ? ` · ${m.usos}` : ''}`)
    w.appendChild(linhaInfo)

    // Truques crescem nos níveis 5, 11 e 17
    const tier = f.nivel >= 17 ? 4 : f.nivel >= 11 ? 3 : f.nivel >= 5 ? 2 : 1

    // Espaços em que dá para conjurar (o da magia ou acima). Magia racial com
    // uso por descanso ("1 vez por descanso longo") não gasta espaço.
    const cj = f.conjuracao
    const usados = stats.espacos_usados || {}
    const usaEspaco = m.nivel > 0 && !m.usos
    const opcoes = []
    if (usaEspaco && cj) {
        cj.espacos.forEach((qtd, i) => {
            const n = i + 1
            if (n >= m.nivel && qtd - (usados[n] || 0) > 0) opcoes.push({ id: String(n), nivel: n, rotulo: `${n}º nível (${qtd - (usados[n] || 0)} livre${qtd - (usados[n] || 0) > 1 ? 's' : ''})` })
        })
        if (cj.pacto && cj.pacto.nivel >= m.nivel && cj.pacto.qtd - (usados.pacto || 0) > 0) {
            opcoes.push({ id: 'pacto', nivel: cj.pacto.nivel, rotulo: `Pacto ${cj.pacto.nivel}º (${cj.pacto.qtd - (usados.pacto || 0)} livre)` })
        }
    }

    const linha = mk('div', 'ds-magia-botoes')
    let sel = null
    if (usaEspaco && opcoes.length) {
        sel = document.createElement('select')
        sel.className = 'dc-select ds-magia-espaco'
        sel.setAttribute('aria-label', 'Espaço de magia')
        opcoes.forEach(o => sel.appendChild(new Option(o.rotulo, o.id)))
        linha.appendChild(sel)
    }
    const nivelEscolhido = () => (sel ? opcoes.find(o => o.id === sel.value).nivel : m.nivel)

    const expressaoDe = base => {
        if (!base) return null
        const [dados] = base.split(' ')
        const acima = Math.max(0, nivelEscolhido() - m.nivel)
        // Mísseis Mágicos: três dardos de 1d4 + 1, mais um por nível acima
        if (m.id === 'misseis-magicos') return `${3 + acima}d4+${3 + acima}`
        if (m.nivel === 0 && m.escalaTruque) return dados.replace(/^(\d+)d/, (_, q) => `${q * tier}d`)
        if (!acima || !m.superior) return dados
        return `${dados}+${m.superior.replace(/^(\d+)d/, (_, q) => `${q * acima}d`)}`
    }
    const tipoDano = m.dano ? m.dano.split(' ').slice(1).join(' ') : ''
    // Magia com teste de resistência: o rótulo já diz a CD para a mesa
    const rotuloEfeito = m.resistencia ? `${m.nome} (CD ${m.cd} ${D.ATRIBUTO_POR_KEY[m.resistencia].abrev})` : m.nome
    const rolarEfeito = critico => {
        if (m.dano) rolagem.rolarDados({ personagem: nome, rotulo: rotuloEfeito, expressao: expressaoDe(m.dano), multiplicador: critico ? 2 : 1, tipo: 'dano', tipoDano })
        else if (m.cura) rolagem.rolarDados({ personagem: nome, rotulo: m.nome, expressao: expressaoDe(m.cura), bonus: CURA_SOMA_ATRIBUTO.has(m.id) ? f.mods[m.atributo] : 0, tipo: 'cura' })
    }
    // Conjurar uma magia de ataque rola ataque e dano juntos, como no BG3
    const conjurarComAtaque = () => {
        if (m.dano) rolagem.magiaComAtaque({ personagem: nome, rotulo: m.nome, bonusAtaque: m.ataqueBonus, expressao: expressaoDe(m.dano), tipoDano })
        else rolagem.testeD20({ personagem: nome, rotulo: `${m.nome} (ataque)`, bonus: m.ataqueBonus, tipo: 'ataque' })
    }

    if (canEdit) {
        const conjurar = mk('button', 'ds-magia-btn principal', 'Conjurar')
        conjurar.disabled = usaEspaco && !opcoes.length
        conjurar.title = usaEspaco && !opcoes.length ? 'Sem espaço de magia livre' : 'Avisa a mesa, gasta o espaço e rola o efeito'
        conjurar.addEventListener('click', () => {
            let onde = ''
            if (usaEspaco && sel) {
                const o = opcoes.find(x => x.id === sel.value)
                commit('espacos_usados', { ...(stats.espacos_usados || {}), [o.id]: (usados[o.id] || 0) + 1 })
                onde = ` (espaço de ${o.nivel}º nível)`
            }
            if (state.socket) state.socket.emit('chat_message', { playerName: '✦ Magia', message: `${nome} conjurou ${m.nome}${onde}.`, type: 'text' })
            // Em batalha, gasta a ação, a ação bônus ou a reação conforme o tempo da magia
            if (char) require('./dndCombate').aoConjurar(char, m)
            if (m.ataque) conjurarComAtaque()
            else rolarEfeito(false)
            abrirPainelMagia(statsAtuais(), canEdit)
        })
        linha.appendChild(conjurar)
    }
    if (m.ataque) {
        const atq = mk('button', 'ds-magia-btn', `🎲 Ataque ${dnd.sinal(m.ataqueBonus)}`)
        atq.addEventListener('click', () => rolagem.testeD20({ personagem: nome, rotulo: `${m.nome} (ataque)`, bonus: m.ataqueBonus, tipo: 'ataque' }))
        linha.appendChild(atq)
    }
    if (m.dano || m.cura) {
        const efeito = mk('button', 'ds-magia-btn', m.dano ? `🎲 Dano` : `🎲 Cura`)
        efeito.title = m.dano ? `${expressaoDe(m.dano)} ${tipoDano}` : expressaoDe(m.cura)
        efeito.addEventListener('click', () => rolarEfeito(false))
        linha.appendChild(efeito)
        if (m.dano && m.ataque) {
            const crit = mk('button', 'ds-magia-btn', '✦ Crítico')
            crit.title = 'Dano com os dados dobrados'
            crit.addEventListener('click', () => rolarEfeito(true))
            linha.appendChild(crit)
        }
    }
    w.appendChild(linha)
    return w
}

function abrirPainelEquipamento(stats, canEdit) {
    const { body } = painel('dndEquip', '🛡 Equipamento')
    body.innerHTML = ''
    const f = dnd.calcular(stats)
    const eq = stats.equipamento || {}

    body.appendChild(mk('span', 'input-label', 'Armadura vestida'))
    const sel = document.createElement('select')
    sel.className = 'dc-select'
    sel.disabled = !canEdit
    sel.appendChild(new Option('Sem armadura', ''))
    Object.entries(D.ARMADURAS).forEach(([id, a]) => {
        const prof = f.proficiencias.armaduras.includes(a.tipo)
        sel.appendChild(new Option(`${a.nome} · CA ${a.ca}${prof ? '' : ' · sem proficiência'}`, id))
    })
    sel.value = eq.armadura || ''
    sel.addEventListener('change', () => salvarEquipamento(stats, { ...eq, armadura: sel.value || null }))
    body.appendChild(sel)

    const lbl = mk('label', 'dc-check')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = !!eq.escudo
    cb.disabled = !canEdit
    cb.addEventListener('change', () => salvarEquipamento(stats, { ...eq, escudo: cb.checked }))
    lbl.appendChild(cb)
    lbl.appendChild(mk('span', null, 'Escudo (+2 CA)' + (f.proficiencias.armaduras.includes('escudo') ? '' : ' · sem proficiência')))
    body.appendChild(lbl)

    body.appendChild(mk('div', 'ds-extras', `CA ${f.ca}: ${f.caDetalhe}`))
    if (f.armadura && f.armadura.furtividade) body.appendChild(mk('div', 'ds-legenda', 'Esta armadura dá desvantagem em Furtividade.'))
    if (f.armadura && f.armadura.forca && f.atributos.for < f.armadura.forca) body.appendChild(mk('div', 'ds-legenda', `Exige FOR ${f.armadura.forca}: −3 m de deslocamento.`))
    body.appendChild(mk('div', 'ds-legenda', 'Armas, ataques e inventário entram na etapa de equipamento.'))
}

function salvarEquipamento(stats, novo) {
    commit('equipamento', novo)
    const f = dnd.calcular({ ...stats, equipamento: novo })
    commit('ca', f.ca)
    reabrirFicha()
    abrirPainelEquipamento(statsAtuais(), true)
}

function abrirPainelProficiencias(stats) {
    const { body } = painel('dndProf', '🗣 Proficiências')
    body.innerHTML = ''
    const p = dnd.calcular(stats).proficiencias
    const armas = [
        ...p.categoriasArma.map(c => D.CATEGORIAS_ARMA[c]),
        ...p.armas.filter(id => D.ARMAS[id] && !p.categoriasArma.includes(D.ARMAS[id].cat)).map(id => D.ARMAS[id].nome),
    ]
    ;[
        ['Armaduras', p.armaduras.map(t => D.TIPOS_ARMADURA[t])],
        ['Armas', armas],
        ['Ferramentas', p.ferramentas],
        ['Idiomas', p.idiomas],
    ].forEach(([rot, itens]) => {
        body.appendChild(mk('div', 'ds-grupo', rot))
        body.appendChild(mk('div', 'ds-caract-desc', itens.length ? itens.join(', ') : 'Nenhuma'))
    })
}

// ── Descanso ──────────────────────────────────────────────────────────────────

function descansar(tipo) {
    const stats = statsAtuais()
    if (!stats) return
    const f = dnd.calcular(stats)
    const usados = { ...(stats.recursos_usados || {}) }
    f.recursos.forEach(r => { if (tipo === 'longo' || r.recarga === 'curto') delete usados[r.id] })
    commit('recursos_usados', usados)

    const espacos = { ...(stats.espacos_usados || {}) }
    if (tipo === 'longo') Object.keys(espacos).forEach(k => delete espacos[k])
    else delete espacos.pacto
    commit('espacos_usados', espacos)

    if (tipo === 'longo') {
        commit('hp', f.pvMax)
        commit('hp_temp', 0)
        const recupera = Math.max(1, Math.floor(f.nivel / 2))
        commit('dados_vida_usados', Math.max(0, (stats.dados_vida_usados || 0) - recupera))
    }
    if (state.socket) {
        const char = state.statPopupChar
        state.socket.emit('chat_message', {
            playerName: '⚙ Sistema',
            message: `${tipo === 'longo' ? '🌙' : '☕'} ${char ? char.name : 'Alguém'} fez um descanso ${tipo}.`,
            type: 'text',
        })
    }
    reabrirFicha()
    const visivel = id => { const el = document.getElementById(id); return el && el.classList.contains('visible') }
    if (visivel('dndRecursos')) abrirPainelRecursos(statsAtuais(), true)
    if (visivel('dndMagia')) abrirPainelMagia(statsAtuais(), true)
}

// ── Mestre libera a subida ────────────────────────────────────────────────────

function liberarNivel(char, nivel) {
    commit('nivel_liberado', nivel)
    if (state.socket) {
        state.socket.emit('chat_message', {
            playerName: '⚙ Sistema',
            message: `⬆ O mestre liberou o nível ${nivel} para ${char.name}. Abra a ficha para subir.`,
            type: 'text',
        })
    }
    reabrirFicha()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Gravação ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function statsAtuais() {
    return state.statPopupChar ? state.statPopupChar.stats : null
}

function commit(campo, valor) {
    require('./statPopup').commitStatChange(campo, valor)
}

/**
 * Grava vários campos de um personagem sem depender do popup aberto — a
 * subida de nível acontece num modal próprio, e o popup pode ter fechado.
 */
function gravar(charId, campos) {
    const entry = state.allCharsCache.find(e => e.character.id === charId)
    const meu = state.playerCharacters.find(c => c.id === charId)
    const { updateCardStat } = require('./characters')
    Object.entries(campos).forEach(([k, v]) => {
        if (entry && entry.character.stats) entry.character.stats[k] = copia(v)
        if (meu && meu.stats) meu.stats[k] = copia(v)
        updateCardStat(charId, k, v)
        if (state.socket) state.socket.emit('stat_update', { charId, field: k, value: v, ownerName: state.playerName })
    })
    const stats = (meu && meu.stats) || (entry && entry.character.stats)
    if (stats && state.supabase) {
        state.supabase.from('characters').update({ stats }).eq('id', charId)
            .then(({ error }) => { if (error) console.warn('[D&D] Supabase:', error.message) })
    }
}

/**
 * O dono grava a ficha quando recebe de fora algo que precisa sobreviver a
 * ele fechar o app — a liberação de nível vem do mestre, e o banco pode não
 * deixar o mestre gravar ficha alheia.
 */
function persistirSeForMeu(charId) {
    const meu = state.playerCharacters.find(c => c.id === charId)
    if (!meu || !state.supabase) return
    state.supabase.from('characters').update({ stats: meu.stats }).eq('id', charId)
        .then(({ error }) => { if (error) console.warn('[D&D] Supabase:', error.message) })
}

/** Redesenha a ficha sem mexer na posição do popup. */
function reabrirFicha() {
    const container = document.getElementById('statDynamicRows')
    const char = state.statPopupChar
    if (!container || !char || !isDnd(char)) return
    const entry = state.allCharsCache.find(e => e.character.id === char.id)
    if (entry) state.statPopupChar = entry.character
    const ownerName = entry ? entry.playerName : state.playerName
    const canEdit = state.isRoomMaster || ownerName === state.playerName
    container.innerHTML = ''
    buildSheet(container, state.statPopupChar.stats || {}, canEdit)
}

/** Chamado por socket.js quando outro cliente altera esta ficha. */
function onRemoteStatUpdate(charId) {
    if (!state.statPopupChar || state.statPopupChar.id !== charId) return
    reabrirFicha()
    const stats = statsAtuais()
    const entry = state.allCharsCache.find(e => e.character.id === charId)
    const canEdit = state.isRoomMaster || (entry ? entry.playerName : state.playerName) === state.playerName
    const visivel = id => { const el = document.getElementById(id); return el && el.classList.contains('visible') }
    if (visivel('dndRecursos')) abrirPainelRecursos(stats, canEdit)
    if (visivel('dndMagia')) abrirPainelMagia(stats, canEdit)
    if (visivel('dndEquip')) abrirPainelEquipamento(stats, canEdit)
    if (visivel('dndPericias')) abrirPainelPericias(stats)
    if (visivel('dndCaract')) abrirPainelCaracteristicas(stats)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Infraestrutura de painéis (mesmo modelo do Calico) ───────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function painel(id, titulo, extraCls) {
    let el = document.getElementById(id)
    if (!el) {
        el = document.createElement('div')
        el.id = id
        el.className = 'subpanel dnd-panel' + (extraCls ? ' ' + extraCls : '')
        const header = mk('div', 'subpanel-header')
        header.appendChild(mk('span', 'subpanel-title', titulo))
        const close = mk('button', 'subpanel-close', '✕')
        close.addEventListener('click', () => el.classList.remove('visible'))
        header.appendChild(close)
        el.appendChild(header)
        el.appendChild(mk('div', 'subpanel-body'))
        document.body.appendChild(el)
        makeDraggable(el, header)
        segurarCliques(el)
    }
    el.querySelector('.subpanel-title').textContent = titulo
    posicionar(el)
    return { el, body: el.querySelector('.subpanel-body') }
}

function posicionar(panel) {
    const statPopup = document.getElementById('statPopup')
    const jaVisivel = panel.classList.contains('visible')
    panel.classList.add('visible')
    if (jaVisivel) return
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
    document.querySelectorAll('.dnd-panel').forEach(p => p.classList.remove('visible'))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * A ficha se redesenha dentro do próprio clique (gastar um uso, trocar a
 * armadura...). Quando o evento chega ao document, o botão clicado já saiu
 * da página, e o "clicou fora, fecha a ficha" de statPopup.js fecharia tudo.
 * O Calico resolve com stopPropagation em cada botão; aqui o contêiner, que
 * não é redesenhado, segura o clique uma vez só.
 */
function segurarCliques(el, quando) {
    if (el.dataset.dndCliques) return
    el.dataset.dndCliques = '1'
    el.addEventListener('click', e => { if (!quando || quando()) e.stopPropagation() })
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

function chip(rotulo, valor, titulo, cls) {
    const c = mk('div', 'ds-chip' + (cls ? ' ' + cls : ''))
    c.title = titulo || ''
    c.appendChild(mk('b', null, String(valor)))
    c.appendChild(mk('span', null, rotulo))
    return c
}

function botaoPainel(label, onClick) {
    const btn = mk('button', 'sp-subpanel-btn', label)
    btn.addEventListener('click', onClick)
    return btn
}

/**
 * Bolinhas de uso: cheia = disponível. Clique numa cheia gasta, numa vazia
 * devolve. Reservas grandes (Cura pelas Mãos, chi alto) viram número com −/+.
 */
function contador(max, usado, editavel, aoMudar, emPontos) {
    const restante = max - usado
    if (emPontos || max > 12) {
        const w = mk('div', 'ds-contador-num')
        const menos = mk('button', 'sp-adj-btn', '−')
        menos.disabled = !editavel || restante <= 0
        menos.title = 'Gastar'
        menos.addEventListener('click', () => aoMudar(usado + 1))
        const mais = mk('button', 'sp-adj-btn', '+')
        mais.disabled = !editavel || usado <= 0
        mais.title = 'Recuperar'
        mais.addEventListener('click', () => aoMudar(usado - 1))
        w.appendChild(menos)
        w.appendChild(mk('b', null, `${restante} / ${max}`))
        w.appendChild(mais)
        return w
    }
    const w = mk('div', 'ds-pips')
    for (let i = 0; i < max; i++) {
        const cheio = i < restante
        const p = mk('button', 'ds-pip' + (cheio ? ' cheio' : ''))
        p.disabled = !editavel
        p.title = cheio ? 'Disponível (clique para gastar)' : 'Gasto (clique para recuperar)'
        p.addEventListener('click', () => aoMudar(cheio ? usado + 1 : usado - 1))
        w.appendChild(p)
    }
    return w
}

function fmtMetros(m) { return `${String(m).replace('.', ',')} m` }
function copia(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v }

module.exports = {
    buildSheet, fecharPaineis, onRemoteStatUpdate, isDnd, reabrirFicha, gravar, persistirSeForMeu, segurarCliques,
}
