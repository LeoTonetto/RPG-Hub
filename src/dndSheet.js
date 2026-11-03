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
const CD = require('./dndCondicoes')

const estadoUI = () => require('./dndEstadoUI')

// Atributo de cada ferramenta no teste (o mestre pode pedir outro)
const ATRIBUTO_FERRAMENTA = {
    'Ferramentas de ladrão': 'des', 'Kit de falsificação': 'des', 'Kit de disfarce': 'car', 'Kit de herbalismo': 'sab',
    'Kit de venenos': 'int', 'Ferramentas de navegador': 'sab', 'Veículos (terrestres)': 'des', 'Veículos (aquáticos)': 'des',
}
const atributoDaFerramenta = nome => ATRIBUTO_FERRAMENTA[nome]
    || (D.FERRAMENTAS.instrumentos.includes(nome) ? 'car' : D.FERRAMENTAS.jogos.includes(nome) ? 'sab' : 'int')

// Custo da Metamágica em pontos de feitiçaria (LdJ p. 77); Duplicada custa o nível da magia
const CUSTO_METAMAGIA = { acelerada: 2, aumentada: 3, cuidadosa: 1, distante: 1, duplicada: null, estendida: 1, potencializada: 1, sutil: 1 }
// Pontos para criar um espaço de magia (Conjuração Flexível)
const CUSTO_ESPACO = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 }

// Magias de ataque cujo dano está só no texto do livro
const DANO_DO_TEXTO = {
    // O tipo da Orbe Cromática quem escolhe é o conjurador, entre estes (LdJ p. 266)
    'orbe-cromatica': { dano: '3d8 ácido', superior: '1d8', tipos: ['ácido', 'frio', 'fogo', 'elétrico', 'veneno', 'trovejante'] },
    'arma-espiritual': { dano: '1d8 energia' },                       // + atributo; ver expressaoDe
}

// Magias de cura que somam o atributo de conjuração ao dado
const CURA_SOMA_ATRIBUTO = new Set(['curar-ferimentos', 'palavra-curativa', 'curar-ferimentos-em-massa', 'palavra-curativa-em-massa', 'oracao-curativa'])

// A última magia que cada personagem conjurou (Colheita Sinistra)
const ultimaMagia = {}

function chat(message, playerName = '✦ Magia') {
    if (state.socket) state.socket.emit('chat_message', { playerName, message, type: 'text' })
}

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

    // ── PV, Forma Selvagem, 0 PV, condições e concentração ────────────────────
    container.appendChild(blocoPV(stats, f, canEdit))
    container.appendChild(estadoUI().blocoEstado(char, stats, f, canEdit))

    // ── Números principais ───────────────────────────────────────────────────
    const chips = mk('div', 'ds-chips')
    chips.appendChild(chip('CA', f.ca, f.caDetalhe + (f.semProfArmadura ? '\n⚠ Sem proficiência nessa armadura: desvantagem em testes de FOR e DES e não pode conjurar.' : ''), f.semProfArmadura ? 'alerta' : ''))
    // Iniciativa rola direto: é a rolagem mais comum fora das perícias
    const inic = chip('Inic.', dnd.sinal(f.iniciativa), (f.vantagemIniciativa ? 'Vantagem em iniciativa. ' : '') + 'Clique para rolar', 'clicavel' + (f.vantagemIniciativa ? ' vantagem' : ''))
    inic.addEventListener('click', () => rolarTeste(char, 'Iniciativa', f.iniciativa, { tipo: 'iniciativa', atributo: 'des' }, f.vantagemIniciativa ? 'vantagem em iniciativa' : null))
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
    linha.appendChild(botaoPainel('⚔ Armas', () => require('./dndArmas').abrirPainel(stats, canEdit)))
    if (f.conjuracao || f.magias.length) linha.appendChild(botaoPainel('✦ Magias', () => abrirPainelMagia(stats, canEdit)))
    linha.appendChild(botaoPainel('🛡 Equipamento', () => abrirPainelEquipamento(stats, canEdit)))
    // Forma Selvagem, familiar, companheiro, montaria, mortos-vivos
    if (require('./dndCompanheiros').temCriaturas(stats, f)) linha.appendChild(botaoPainel('🐾 Criaturas', () => require('./dndCompanheiros').abrirPainel(stats, canEdit)))
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

        // Ajuste à mão: sem tipo de dano. O tipo vem da arma, da magia ou do
        // ataque da criatura (no "Aplicar dano" da batalha, com a resistência)
        const dano = mk('button', 'ds-pv-btn dano', 'Dano')
        dano.addEventListener('click', () => {
            const char = state.statPopupChar
            if (!char) return
            estadoUI().danoNoPersonagem(char, valorQtd())
            reabrirFicha()
        })
        const cura = mk('button', 'ds-pv-btn cura', 'Cura')
        cura.addEventListener('click', () => {
            const char = state.statPopupChar
            if (!char) return
            estadoUI().curaNoPersonagem(char, valorQtd())
            reabrirFicha()
        })
        const tempBtn = mk('button', 'ds-pv-btn', 'Temp.')
        tempBtn.title = 'PV temporários não somam: fica o maior'
        tempBtn.addEventListener('click', () => { commit('hp_temp', Math.max(stats.hp_temp || 0, valorQtd())); reabrirFicha() })

        ctl.appendChild(dano)
        ctl.appendChild(qtd)
        ctl.appendChild(cura)
        ctl.appendChild(tempBtn)
        // Dano de queda (mestre): 1d6 de concussão a cada 3 m, até 20d6, e cai (LdJ p. 183)
        if (state.isRoomMaster) {
            const queda = mk('button', 'ds-pv-btn', '🪂')
            queda.title = 'Queda: o número é a altura em metros (1d6 de concussão a cada 3 m, até 20d6; cai no chão)'
            queda.setAttribute('aria-label', 'Dano de queda')
            queda.addEventListener('click', () => {
                const char = state.statPopupChar
                const n = Math.min(20, Math.floor(valorQtd() / 3))
                if (!char || !n) return
                const r = rolagem.rolarDados({ personagem: char.name, rotulo: `Queda de ${valorQtd()} m`, expressao: `${n}d6`, tipo: 'dano', tipoDano: 'concussão' })
                estadoUI().danoNoPersonagem(char, r.total, { tipo: 'concussão' })
                const st = (estadoUI().charPorId(char.id) || char).stats || {}
                if (r.total > 0 && !(st.condicoes || []).includes('caido')) gravar(char.id, { condicoes: [...(st.condicoes || []), 'caido'] })
                reabrirFicha()
            })
            ctl.appendChild(queda)
        }
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
    // ctx diz ao motor que rolagem é, para aplicar sozinho o que o livro manda
    // (armadura, condições, Fúria...). A marca V/D avisa antes de rolar.
    const linhaRolavel = (nome, sub, bonus, marca, cls, ctx) => {
        const l = mk('div', 'ds-rola' + (cls ? ' ' + cls : ''))
        l.appendChild(mk('span', 'ds-rola-marca', marca || ''))
        const nomeEl = mk('span', 'ds-rola-nome', nome)
        l.appendChild(nomeEl)
        if (sub) l.appendChild(mk('span', 'ds-rola-sub', sub))
        const auto = ctx ? CD.modoAutomatico(stats, f, ctx) : null
        if (auto && (auto.falha || auto.vantagem.length || auto.desvantagem.length)) {
            const txt = auto.falha ? 'F' : auto.vantagem.length && auto.desvantagem.length ? '=' : auto.vantagem.length ? 'V' : 'D'
            const tag = mk('span', 'ds-rola-auto ' + txt, txt)
            tag.title = auto.falha || [...auto.vantagem.map(x => 'vantagem: ' + x), ...auto.desvantagem.map(x => 'desvantagem: ' + x)].join('\n')
            nomeEl.appendChild(tag)
        }
        l.appendChild(mk('b', 'ds-rola-bonus', dnd.sinal(bonus)))
        const b = mk('button', 'ds-rola-dado', '🎲')
        b.title = `Rolar ${nome} (d20 ${dnd.sinal(bonus)})`
        b.setAttribute('aria-label', b.title)
        b.addEventListener('click', () => rolarTeste(char, nome, bonus, ctx))
        l.appendChild(b)
        body.appendChild(l)
    }

    secao('Perícias')
    D.PERICIAS.forEach(p => {
        const per = f.pericias[p.key]
        linhaRolavel(p.nome, D.ATRIBUTO_POR_KEY[p.attr].abrev, per.bonus,
            per.especialista ? '◆' : per.prof ? '●' : per.meia ? '◐' : '○', per.prof ? 'prof' : '',
            { tipo: 'pericia', atributo: p.attr, pericia: p.key })
    })

    secao('Testes de resistência')
    // Vantagens contra veneno, magia, encantamento, medo: o mestre diz a origem no pedido de teste
    const contra = CD.vantagensContra(stats, f)
    if (contra.length) body.appendChild(mk('div', 'ds-legenda', 'Vantagem ' + contra.map(v => `contra ${({ veneno: 'veneno', magia: 'magia', encantamento: 'ser enfeitiçado', medo: 'ser amedrontado' })[v.origem]} (${v.nome})`).join(' · ')))
    D.ATRIBUTOS.forEach(a => {
        const r = f.resistencias[a.key]
        linhaRolavel(`Resistência de ${a.nome}`, a.abrev, r.bonus, r.prof ? '●' : '○', r.prof ? 'prof' : '', { tipo: 'resistencia', atributo: a.key })
    })

    secao('Atributos')
    D.ATRIBUTOS.forEach(a => linhaRolavel(`Teste de ${a.nome}`, a.abrev, f.mods[a.key], '', '', { tipo: 'atributo', atributo: a.key }))

    // Ferramentas em que é proficiente (o atributo é o mais comum; o mestre pode pedir outro)
    const ferramentas = f.proficiencias.ferramentas
    if (ferramentas.length) {
        secao('Ferramentas')
        const espec = new Set(Object.entries(stats.escolhas || {}).filter(([k]) => /especializ|aptidao/.test(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [])))
        ferramentas.forEach(nome => {
            const attr = atributoDaFerramenta(nome)
            const dobra = espec.has(nome)
            linhaRolavel(nome, D.ATRIBUTO_POR_KEY[attr].abrev, f.mods[attr] + f.prof * (dobra ? 2 : 1), dobra ? '◆' : '●', 'prof', { tipo: 'atributo', atributo: attr })
        })
    }

    body.appendChild(mk('div', 'ds-legenda', '● proficiente · ◆ especialista · ◐ metade da proficiência · V/D vantagem ou desvantagem automática'))
    body.appendChild(mk('div', 'ds-extras', `Percepção passiva ${f.percepcaoPassiva} · Investigação passiva ${f.investigacaoPassiva}`))
}

/** Teste de d20 da ficha, com o que o livro aplica sozinho (ver dndCondicoes). */
function rolarTeste(char, rotulo, bonus, ctx, vantagemExtra) {
    const stats = (char && char.stats) || {}
    const auto = ctx ? CD.modoAutomatico(stats, dnd.calcular(stats), ctx) : null
    if (auto && vantagemExtra) auto.vantagem.push(vantagemExtra)
    rolagem.testeD20({ personagem: char ? char.name : '?', rotulo, bonus, auto })
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
        // O que se usa com este recurso (gasta a ação ou a ação bônus certa)
        const char = state.statPopupChar
        if (canEdit && char) {
            const habs = require('./dndHabilidades').doRecurso(char, r.id)
            if (habs.length) {
                const usar = mk('div', 'ds-recurso-usar')
                habs.forEach(h => usar.appendChild(require('./dndHabilidades').botaoDe(char, h, () => { reabrirFicha(); abrirPainelRecursos(statsAtuais(), canEdit) })))
                linha.appendChild(usar)
            }
        }
        body.appendChild(linha)
    })

    // Dados de Vida: gastos no descanso curto para curar
    const dv = mk('div', 'ds-recurso')
    const cab = mk('div', 'ds-recurso-cab')
    cab.appendChild(mk('b', null, `Dados de Vida (d${f.dadoVida})`))
    cab.appendChild(mk('span', 'ds-muted', `cada um cura 1d${f.dadoVida} ${dnd.sinal(f.mods.con)} · metade volta no descanso longo`))
    dv.appendChild(cab)
    const dvUsados = Math.min(f.nivel, stats.dados_vida_usados || 0)
    dv.appendChild(contador(f.nivel, dvUsados, canEdit, novo => {
        commit('dados_vida_usados', novo)
        abrirPainelRecursos(statsAtuais(), canEdit)
    }))
    // Gastar no descanso curto: rola o dado + CON e cura (Resistente: no mínimo 2 × CON)
    if (canEdit) {
        const gastar = mk('button', 'ds-magia-btn', `🎲 Gastar 1 Dado de Vida (1d${f.dadoVida} ${dnd.sinal(f.mods.con)})`)
        const naBatalha = require('./dndCombate').emBatalha() && !state.isRoomMaster
        gastar.disabled = dvUsados >= f.nivel || (stats.hp ?? f.pvMax) >= f.pvMax || CD.morto(stats) || naBatalha
        gastar.title = naBatalha ? 'Dados de Vida só no descanso curto, fora da batalha' : gastar.disabled ? 'Sem Dados de Vida, ou já com os PV cheios' : 'Num descanso curto'
        gastar.addEventListener('click', () => {
            const char = state.statPopupChar
            if (!char) return
            const r = rolagem.rolarDados({ personagem: char.name, rotulo: 'Dado de Vida', expressao: `1d${f.dadoVida}`, bonus: f.mods.con, tipo: 'cura' })
            let cura = Math.max(0, r.total)
            if (f.talentos.includes('resistente')) cura = Math.max(cura, 2 * Math.max(1, f.mods.con))
            // Canção de Descanso (bardo): o dado da canção a mais, uma vez
            const cancao = require('./dndEfeitos').ativos(stats).find(e => e.tipo === 'cancao-descanso' && e.dado)
            if (cancao) {
                const rc = rolagem.rolarDados({ personagem: char.name, rotulo: `Canção de Descanso (${cancao.fonteNome})`, expressao: '1' + cancao.dado, tipo: 'cura' })
                cura += rc.total
                require('./dndEfeitos').remover(char.id, { uid: cancao.uid })
            }
            commit('dados_vida_usados', dvUsados + 1)
            estadoUI().curaNoPersonagem(char, cura)
            reabrirFicha()
            abrirPainelRecursos(statsAtuais(), canEdit)
        })
        dv.appendChild(gastar)
    }
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
    const extras = stats.espacos_extras || {}

    if (cj) {
        const nums = mk('div', 'ds-chips')
        nums.appendChild(chip('CD', cj.cd, `8 + proficiência + ${D.ATRIBUTO_POR_KEY[cj.atributo].nome}`))
        nums.appendChild(chip('Ataque', dnd.sinal(cj.ataque), 'Jogada de ataque com magia'))
        nums.appendChild(chip('Atrib.', D.ATRIBUTO_POR_KEY[cj.atributo].abrev, D.ATRIBUTO_POR_KEY[cj.atributo].nome))
        body.appendChild(nums)

        // Espaços de magia: bolinhas por nível, como no BG3 (os criados com
        // pontos de feitiçaria entram como bolinhas a mais até o descanso longo)
        const espacos = mk('div', 'ds-espacos')
        cj.espacos.forEach((qtd, i) => {
            const n = i + 1
            const total = qtd + (extras[n] || 0)
            const linha = mk('div', 'ds-espaco')
            linha.appendChild(mk('span', 'ds-espaco-nivel', `${n}º`))
            linha.appendChild(contador(total, Math.min(total, usados[n] || 0), canEdit, novo => {
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
        if (canEdit) {
            const feit = secaoFeiticaria(stats, f)
            if (feit) body.appendChild(feit)
            const rec = secaoRecuperacaoArcana(stats, f)
            if (rec) body.appendChild(rec)
        }
    }
    if (f.semConjurar) body.appendChild(mk('div', 'da-alerta', 'Na Forma Selvagem não dá para conjurar.'))
    else if (f.semProfArmadura) body.appendChild(mk('div', 'da-alerta', 'Vestindo armadura sem proficiência: não dá para conjurar.'))

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
        const b = mk('button', 'ds-magia' + (m.id === foco.id ? ' on' : '') + (stats.concentracao && stats.concentracao.id === m.id ? ' conc' : ''))
        b.type = 'button'
        b.appendChild(magiasUI.icone(m.icone))
        b.appendChild(mk('span', 'ds-magia-nome', m.nome))
        const tags = []
        if (m.concentracao) tags.push('C')
        if (m.ritual) tags.push('R')
        if (m.sempre) tags.push('★')
        if (m.usos) tags.push(m.semEspaco && !m.recurso ? '∞' : '1×')
        if (tags.length) b.appendChild(mk('span', 'ds-magia-tags', tags.join(' ')))
        b.title = `${m.nome} — ${m.origem}`
        b.addEventListener('click', () => { magiaEmFoco[char.id] = m.id; abrirPainelMagia(statsAtuais(), canEdit) })
        lista.appendChild(b)
    })
    body.appendChild(lista)
    body.appendChild(mk('div', 'ds-legenda', 'C concentração · R ritual · ★ vem da raça, subclasse ou invocação · ∞ à vontade · 1× uma vez por descanso longo'))

    // Detalhe da magia em foco, com as ações
    const det = mk('div', 'dm-detalhe ds-magia-det')
    magiasUI.desenharDetalhe(det, foco, null, acoesDaMagia(char, stats, f, foco, canEdit))
    body.appendChild(det)
}

/** Feiticeiro: pontos de feitiçaria ↔ espaços de magia (Conjuração Flexível). */
function secaoFeiticaria(stats, f) {
    const feit = f.recursos.find(r => r.id === 'feiticaria')
    if (!feit) return null
    const usados = (stats.recursos_usados || {}).feiticaria || 0
    const pontos = feit.max - usados
    const w = mk('div', 'ds-feiticaria')
    w.appendChild(mk('div', 'ds-grupo', `Pontos de feitiçaria · ${pontos} / ${feit.max}`))
    const linha = mk('div', 'ds-magia-botoes')
    const criar = document.createElement('select')
    criar.className = 'dc-select'
    criar.setAttribute('aria-label', 'Nível do espaço a criar')
    const maxNivel = Math.min(5, f.conjuracao.espacos.length)
    for (let n = 1; n <= maxNivel; n++) criar.appendChild(new Option(`${n}º nível (${CUSTO_ESPACO[n]} pontos)`, String(n)))
    const char = state.statPopupChar
    const travaBonus = char ? require('./dndCombate').podeGastar(char, 'bonus') : ''
    const bCriar = mk('button', 'ds-magia-btn', 'Criar espaço')
    bCriar.disabled = !!travaBonus
    bCriar.title = travaBonus || 'Ação bônus. O espaço criado some no descanso longo.'
    bCriar.addEventListener('click', () => {
        const n = parseInt(criar.value, 10)
        if (CUSTO_ESPACO[n] > pontos) return
        commit('recursos_usados', { ...(stats.recursos_usados || {}), feiticaria: usados + CUSTO_ESPACO[n] })
        commit('espacos_extras', { ...(stats.espacos_extras || {}), [n]: ((stats.espacos_extras || {})[n] || 0) + 1 })
        if (state.statPopupChar) require('./dndCombate').gastarCusto(state.statPopupChar, 'bonus')
        abrirPainelMagia(statsAtuais(), true)
    })
    linha.appendChild(criar)
    linha.appendChild(bCriar)
    w.appendChild(linha)

    const livres = dnd.espacosLivres(stats, f, 1).filter(e => e.id !== 'pacto')
    if (livres.length) {
        const l2 = mk('div', 'ds-magia-botoes')
        const conv = document.createElement('select')
        conv.className = 'dc-select'
        conv.setAttribute('aria-label', 'Espaço a converter')
        livres.forEach(e => conv.appendChild(new Option(`Espaço de ${e.nivel}º → ${e.nivel} ponto(s)`, e.id)))
        const bConv = mk('button', 'ds-magia-btn', 'Virar pontos')
        bConv.disabled = !!travaBonus
        bConv.title = travaBonus || 'Ação bônus: gasta o espaço e ganha pontos iguais ao nível dele'
        bConv.addEventListener('click', () => {
            const e = livres.find(x => x.id === conv.value)
            commit('espacos_usados', { ...(stats.espacos_usados || {}), [e.id]: ((stats.espacos_usados || {})[e.id] || 0) + 1 })
            commit('recursos_usados', { ...(stats.recursos_usados || {}), feiticaria: Math.max(0, usados - e.nivel) })
            if (state.statPopupChar) require('./dndCombate').gastarCusto(state.statPopupChar, 'bonus')
            abrirPainelMagia(statsAtuais(), true)
        })
        l2.appendChild(conv)
        l2.appendChild(bConv)
        w.appendChild(l2)
    }
    return w
}

/**
 * Recuperação Arcana (mago) e Recuperação Natural (druida da Terra): uma vez
 * por dia, depois de um descanso curto.
 */
function secaoRecuperacaoArcana(stats, f) {
    const rec = f.recursos.find(r => r.id === 'recuperacao-arcana' || r.id === 'recuperacao-natural')
    if (!rec || (stats.recursos_usados || {})[rec.id]) return null
    const usados = stats.espacos_usados || {}
    const gastos = f.conjuracao.espacos.map((q, i) => ({ nivel: i + 1, usados: Math.min(q, usados[i + 1] || 0) })).filter(e => e.usados > 0 && e.nivel <= 5)
    if (!gastos.length) return null
    const limite = Math.ceil(f.nivel / 2)
    const w = mk('div', 'ds-feiticaria')
    w.appendChild(mk('div', 'ds-grupo', `${rec.nome} · até ${limite} nível(is) de espaço`))
    const campos = gastos.map(e => {
        const linha = mk('label', 'ds-recupera')
        linha.appendChild(mk('span', null, `${e.nivel}º nível`))
        const i = document.createElement('input')
        i.type = 'number'
        i.min = '0'
        i.max = String(e.usados)
        i.value = '0'
        i.className = 'sp-stat-input'
        i.addEventListener('keydown', ev => ev.stopPropagation())
        linha.appendChild(i)
        w.appendChild(linha)
        return { e, i }
    })
    const aviso = mk('div', 'da-alerta')
    w.appendChild(aviso)
    const b = mk('button', 'ds-magia-btn', 'Recuperar espaços')
    b.title = 'Depois de um descanso curto; nenhum espaço de 6º nível ou mais'
    b.addEventListener('click', () => {
        const escolha = campos.map(({ e, i }) => ({ nivel: e.nivel, qtd: Math.max(0, Math.min(e.usados, parseInt(i.value, 10) || 0)) }))
        const soma = escolha.reduce((s, x) => s + x.nivel * x.qtd, 0)
        if (!soma) return
        if (soma > limite) { aviso.textContent = `Passou do limite: ${soma} de ${limite} níveis.`; return }
        const novos = { ...usados }
        escolha.forEach(x => { novos[x.nivel] = Math.max(0, (novos[x.nivel] || 0) - x.qtd) })
        commit('espacos_usados', novos)
        commit('recursos_usados', { ...(stats.recursos_usados || {}), [rec.id]: 1 })
        const char = state.statPopupChar
        if (char && state.socket) state.socket.emit('chat_message', { playerName: '✦ Magia', message: `${char.name} usa ${rec.nome} (${soma} nível(is) de espaço).`, type: 'text' })
        abrirPainelMagia(statsAtuais(), true)
    })
    w.appendChild(b)
    return w
}

/**
 * Conjurar (gasta o espaço e rola o efeito), ritual, ataque e dano/cura.
 * Grava no próprio personagem (não no popup aberto): o palco da batalha usa
 * a mesma coisa. `aoMudar` redesenha quem chamou (padrão: o painel Magias).
 */
function acoesDaMagia(char, stats, f, m, canEdit, { aoMudar } = {}) {
    // Dano que o livro descreve no texto e o dado da magia não traz
    if (!m.dano && DANO_DO_TEXTO[m.id]) m = { ...m, ...DANO_DO_TEXTO[m.id] }
    const w = mk('div', 'ds-magia-acoes')
    const atual = () => (estadoUI().charPorId(char.id) || char).stats || {}
    const salvar = (campo, valor) => gravar(char.id, { [campo]: valor })
    const refazer = () => (aoMudar ? aoMudar() : abrirPainelMagia(statsAtuais(), canEdit))
    const nome = char ? char.name : '?'
    const linhaInfo = mk('div', 'ds-magia-info', `${m.origem} · ${D.ATRIBUTO_POR_KEY[m.atributo].abrev} · CD ${m.cd}${m.ataque ? ` · ataque ${dnd.sinal(m.ataqueBonus)}` : ''}${m.usos ? ` · ${m.usos}` : ''}`)
    w.appendChild(linhaInfo)
    const cb = require('./dndCombate')

    // Truques crescem nos níveis 5, 11 e 17
    const tier = f.nivel >= 17 ? 4 : f.nivel >= 11 ? 3 : f.nivel >= 5 ? 2 : 1

    // Espaços em que dá para conjurar (o da magia ou acima). Magia de "1 vez
    // por descanso longo" (raça, Arcana Mística, Iniciado) e as à vontade das
    // invocações não gastam espaço.
    const usaEspaco = m.nivel > 0 && !m.semEspaco
    const opcoes = usaEspaco ? dnd.espacosLivres(stats, f, m.nivel).map(e => ({
        ...e, rotulo: `${e.id === 'pacto' ? `Pacto ${e.nivel}º` : `${e.nivel}º nível`} (${e.livres} livre${e.livres > 1 ? 's' : ''})`,
    })) : []
    const usoLivre = !m.recurso || !((stats.recursos_usados || {})[m.recurso])
    const nivelBase = m.nivelFixo || m.nivel

    const linha = mk('div', 'ds-magia-botoes')
    let sel = null
    if (usaEspaco && opcoes.length) {
        sel = document.createElement('select')
        sel.className = 'dc-select ds-magia-espaco'
        sel.setAttribute('aria-label', 'Espaço de magia')
        opcoes.forEach(o => sel.appendChild(new Option(o.rotulo, o.id)))
        linha.appendChild(sel)
    }
    const nivelEscolhido = () => (sel ? opcoes.find(o => o.id === sel.value).nivel : nivelBase)

    // Rajada Mística: um raio por patamar (5º, 11º, 17º), cada um com o seu
    // ataque; a Explosão Agonizante soma o Carisma em cada raio
    const rajada = m.id === 'rajada-mistica'
    const raios = rajada ? tier : 1
    const agonizante = rajada && dnd.escolhidos(stats, 'invocacoes').includes('explosao-agonizante')
    const expressaoDe = base => {
        if (!base) return null
        if (rajada) return agonizante ? `1d10${f.mods.car >= 0 ? '+' : ''}${f.mods.car}` : '1d10'
        const [dados] = base.split(' ')
        const acima = Math.max(0, nivelEscolhido() - m.nivel)
        // Mísseis Mágicos: três dardos de 1d4 + 1, mais um por nível acima
        if (m.id === 'misseis-magicos') return `${3 + acima}d4+${3 + acima}`
        // Arma Espiritual: 1d8 + atributo, +1d8 a cada dois níveis acima do 2º
        if (m.id === 'arma-espiritual') return `${1 + Math.floor(acima / 2)}d8${f.mods[m.atributo] >= 0 ? '+' : ''}${f.mods[m.atributo]}`
        if (m.nivel === 0 && m.escalaTruque) return dados.replace(/^(\d+)d/, (_, q) => `${q * tier}d`)
        if (!acima || !m.superior) return dados
        return `${dados}+${m.superior.replace(/^(\d+)d/, (_, q) => `${q * acima}d`)}`
    }
    // O tipo do dano vem da magia; quando o livro deixa escolher (Orbe
    // Cromática), a escolha fica limitada aos tipos que a magia permite
    let seletorTipo = null
    if (m.tipos) {
        seletorTipo = document.createElement('select')
        seletorTipo.className = 'dc-select ds-magia-espaco'
        seletorTipo.setAttribute('aria-label', 'Tipo de dano da magia')
        m.tipos.forEach(t => seletorTipo.appendChild(new Option(`Dano de ${t}`, t)))
        linha.appendChild(seletorTipo)
    }
    const tipoDe = () => (seletorTipo ? seletorTipo.value : m.dano ? m.dano.split(' ').slice(1).join(' ') : '')
    const tipoDano = tipoDe()
    // Afinidade Elemental (feiticeiro dracônico, 6º): soma CAR ao dano do tipo do ancestral
    const ancestral = stats.classe === 'feiticeiro' && stats.subclasse === 'draconica' && f.nivel >= 6
        && D.OPCOES['ancestrais-draconicos'].find(o => o.id === ((stats.escolhas || {})['nv1:ancestral'] || [])[0])
    const bonusAfinidade = () => (ancestral && tipoDe() === ancestral.dano ? f.mods.car : 0)
    // Conjuração Poderosa (clérigo da Luz e do Conhecimento, 8º): +SAB no dano dos truques de clérigo
    const poderosa = stats.classe === 'clerigo' && ['luz', 'conhecimento'].includes(stats.subclasse) && f.nivel >= 8
        && m.nivel === 0 && m.atributo === 'sab' && m.dano ? f.mods.sab : 0
    // Evocação Potencializada (mago evocador, 10º): +INT numa rolagem de dano de magia de evocação
    const potencializada = stats.classe === 'mago' && stats.subclasse === 'evocacao' && f.nivel >= 10
        && /evoca/.test(m.escola || '') && m.dano ? f.mods.int : 0
    // Truque Potente (mago evocador, 6º): truque com resistência causa metade se o alvo passar
    const truquePotente = stats.classe === 'mago' && stats.subclasse === 'evocacao' && f.nivel >= 6 && m.nivel === 0 && m.resistencia && m.dano
    /** O que soma no dano: o primeiro raio leva Afinidade e Evocação Potencializada; todos levam Conjuração Poderosa. */
    const extraDano = primeiro => {
        const partes = []
        if (primeiro && bonusAfinidade()) partes.push(['Afinidade Elemental', bonusAfinidade()])
        if (primeiro && potencializada) partes.push(['Evocação Potencializada', potencializada])
        if (poderosa) partes.push(['Conjuração Poderosa', poderosa])
        return { soma: partes.reduce((s, p) => s + p[1], 0), rotulo: partes.map(p => ` + ${p[0]}`).join('') }
    }
    // Cura: Discípulo da Vida (+2 + nível), Cura Suprema (os dados no máximo)
    const vida = stats.classe === 'clerigo' && stats.subclasse === 'vida'
    const curaExtra = () => (vida && m.nivel >= 1 ? 2 + nivelEscolhido() : 0)
    const maximo = expr => String(expr).replace(/(\d*)d(\d+)/g, (_, q, l) => String((parseInt(q || '1', 10)) * parseInt(l, 10)))
    const autoAtaque = () => CD.modoAutomatico(stats, f, { tipo: 'ataque', atributo: m.atributo })
    // Magia com teste de resistência: o rótulo já diz a CD para a mesa
    const rotuloEfeito = m.resistencia ? `${m.nome} (CD ${m.cd} ${D.ATRIBUTO_POR_KEY[m.resistencia].abrev})` : m.nome
    const rolarEfeito = (critico, opc = {}) => {
        if (m.dano) {
            const ex = extraDano(true)
            rolagem.rolarDados({ personagem: nome, rotulo: rotuloEfeito + ex.rotulo + (truquePotente ? ' · metade se passar (Truque Potente)' : ''), expressao: expressaoDe(m.dano), bonus: ex.soma, multiplicador: critico ? 2 : 1, tipo: 'dano', tipoDano: tipoDe(), rerrolarMenores: opc.potencializada || 0 })
        } else if (m.cura) {
            const extra = curaExtra()
            const suprema = vida && f.nivel >= 17
            const expr = suprema ? maximo(expressaoDe(m.cura)) : expressaoDe(m.cura)
            rolagem.rolarDados({ personagem: nome, rotulo: m.nome + (extra ? ' + Discípulo da Vida' : '') + (suprema ? ' (Cura Suprema: dados no máximo)' : ''), expressao: expr,
                bonus: (CURA_SOMA_ATRIBUTO.has(m.id) ? f.mods[m.atributo] : 0) + extra, tipo: 'cura' })
            // Curandeiro Abençoado (6º): curando outra criatura, quem conjurou também recupera 2 + nível
            if (vida && f.nivel >= 6 && m.nivel >= 1 && char) {
                const quanto = 2 + nivelEscolhido()
                cb.perguntar({ titulo: 'Curandeiro Abençoado', texto: `Curou outra criatura além de você? Você recupera ${quanto} PV.`,
                    opcoes: [{ rotulo: `Recuperar ${quanto} PV`, principal: true, acao: () => { estadoUI().curaNoPersonagem(estadoUI().charPorId(char.id) || char, quanto); chat(`${nome} recupera ${quanto} PV (Curandeiro Abençoado).`) } }] })
            }
        }
    }
    // Conjurar uma magia de ataque rola ataque e dano juntos, como no BG3
    const conjurarComAtaque = (opc = {}) => {
        const vezes = raios * (opc.duplicada ? 2 : 1)
        for (let i = 1; i <= vezes; i++) {
            const rot = vezes > 1 ? `${m.nome} (${rajada ? 'raio' : 'alvo'} ${i}/${vezes})` : m.nome
            // Afinidade Elemental e Evocação Potencializada valem para uma rolagem de dano só
            const ex = extraDano(i === 1)
            const expr = expressaoDe(m.dano)
            if (m.dano) rolagem.magiaComAtaque({ personagem: nome, rotulo: rot + ex.rotulo, bonusAtaque: m.ataqueBonus, expressao: ex.soma ? `${expr}+${ex.soma}` : expr, tipoDano: tipoDe(), auto: autoAtaque(), rerrolarMenores: opc.potencializada || 0 })
            else rolagem.testeD20({ personagem: nome, rotulo: `${rot} (ataque)`, bonus: m.ataqueBonus, tipo: 'ataque', auto: autoAtaque() })
        }
    }
    void tipoDano

    // Metamágica do feiticeiro
    const metas = stats.classe === 'feiticeiro' ? dnd.escolhidos(stats, 'metamagia') : []
    const feit = f.recursos.find(r => r.id === 'feiticaria')
    const pontos = feit ? feit.max - ((stats.recursos_usados || {}).feiticaria || 0) : 0
    const marcadas = new Set()
    const custoMeta = id => (id === 'duplicada' ? Math.max(1, m.nivel) : CUSTO_METAMAGIA[id] || 1)

    let avisoConj = null
    let atualizarConj = () => {}
    if (canEdit) {
        let base = ''
        if (f.semConjurar) base = 'Na Forma Selvagem não dá para conjurar'
        else if (f.semProfArmadura) base = 'Vestindo armadura sem proficiência, não dá para conjurar'
        else if (CD.semAcoes(stats)) base = 'Incapacitado: sem ações'
        else if (usaEspaco && !opcoes.length) base = 'Sem espaço de magia livre'
        else if (!usoLivre) base = 'Já usada; volta no descanso longo'

        const conjurar = mk('button', 'ds-magia-btn principal', 'Conjurar')
        // Na batalha: a ação, a ação bônus ou a reação que a magia pede tem que
        // estar livre. A Magia Acelerada troca a ação pela ação bônus.
        atualizarConj = () => {
            const acel = marcadas.has('acelerada')
            const custoTxt = { acao: 'gasta a ação', bonus: 'gasta a ação bônus', reacao: 'gasta a reação' }[cb.custoDaMagia(m, acel)]
            const bloqueio = base || (char ? cb.podeGastar(char, cb.custoDaMagia(m, acel)) || cb.regraMagiaBonus(char, m, acel) : '')
            conjurar.disabled = !!bloqueio
            conjurar.title = bloqueio || `Avisa a mesa, gasta o espaço e rola o efeito (na batalha, ${custoTxt})`
        }
        atualizarConj()
        avisoConj = mk('div', 'da-alerta')
        conjurar.addEventListener('click', () => {
            const custo = [...marcadas].reduce((s, id) => s + custoMeta(id), 0)
            if (custo > pontos) return
            // A Magia Acelerada muda o custo: confere de novo
            const trava = char ? cb.podeGastar(char, cb.custoDaMagia(m, marcadas.has('acelerada'))) : ''
            if (trava) { avisoConj.textContent = trava; return }
            let onde = ''
            if (usaEspaco && sel) {
                const o = opcoes.find(x => x.id === sel.value)
                salvar('espacos_usados', { ...(atual().espacos_usados || {}), [o.id]: ((atual().espacos_usados || {})[o.id] || 0) + 1 })
                onde = ` (espaço de ${o.nivel}º nível)`
            }
            if (m.recurso) salvar('recursos_usados', { ...(atual().recursos_usados || {}), [m.recurso]: 1 })
            if (custo) salvar('recursos_usados', { ...(atual().recursos_usados || {}), feiticaria: ((atual().recursos_usados || {}).feiticaria || 0) + custo })
            const metaNomes = [...marcadas].map(id => (D.OPCOES.metamagias.find(o => o.id === id) || {}).nome).filter(Boolean)
            if (state.socket) state.socket.emit('chat_message', { playerName: '✦ Magia', message: `${nome} conjurou ${m.nome}${onde}${metaNomes.length ? ` com ${metaNomes.join(', ')}` : ''}.`, type: 'text' })
            // Em batalha, gasta a ação, a ação bônus ou a reação conforme o tempo da magia
            if (char) cb.aoConjurar(char, m, { acelerada: marcadas.has('acelerada') })
            if (char && m.concentracao) estadoUI().concentrar(char, m)
            // Bênção, Escudo da Fé, Perdição...: escolhe os alvos (dndEfeitos)
            if (char) require('./dndEfeitos').aoConjurar(char, m, usaEspaco && sel ? nivelEscolhido() : m.nivel)
            // Bordão Místico muda a clava ou o bordão no painel de armas
            if (m.id === 'bordao-mistico') salvar('efeitos', { ...(atual().efeitos || {}), 'bordao-mistico': true })
            // Armadura de Agathys: 5 PV temporários por nível; quem acerta corpo-a-corpo
            // enquanto eles duram sofre o mesmo tanto de frio (dndCombate.aplicarDano)
            if (m.id === 'armadura-de-agathys') {
                const nv = nivelEscolhido()
                salvar('hp_temp', Math.max(atual().hp_temp || 0, 5 * nv))
                salvar('efeitos', { ...(atual().efeitos || {}), agathys: nv })
            }
            const opc = { duplicada: marcadas.has('duplicada'), potencializada: marcadas.has('potencializada') ? Math.max(1, f.mods.car) : 0 }
            // Para a Colheita Sinistra: a última magia conjurada
            if (char) ultimaMagia[char.id] = { nivel: usaEspaco && sel ? nivelEscolhido() : m.nivel, escola: m.escola || '', nome: m.nome }
            const destruicao = D.DESTRUICOES[m.id]
            if (destruicao) {
                const dados = destruicao.semDano ? null : expressaoDe(m.dano)
                const cd = m.resistencia ? `${m.cd} ${D.ATRIBUTO_POR_KEY[m.resistencia].abrev}` : null
                salvar('efeitos', { ...(atual().efeitos || {}), destruicao: {
                    id: m.id, nome: m.nome, dados, tipo: dados ? tipoDe() : '', cd, corpo: destruicao.corpo,
                    desc: `${dados ? `+${dados} ${tipoDe()}. ` : ''}${cd ? `O alvo faz ${cd} ` : ''}${destruicao.efeito}.`,
                } })
                chat(`${nome} prepara ${m.nome}: o próximo acerto ${destruicao.corpo ? 'corpo-a-corpo ' : 'com arma '}${dados ? `causa +${dados} ${tipoDe()}` : 'prende o alvo'}.`)
            } else if (Object.values(D.EFEITOS).some(e => e.magia === m.id && e.danoArma)) {
                // Auxílio Divino: o dano entra em cada acerto com arma (dndEfeitos), não agora
            } else if (m.ataque) conjurarComAtaque(opc)
            else rolarEfeito(false, opc)
            // Proteção Arcana (mago abjurador, 2º): abjuração de 1º+ cria a proteção ou a recarrega
            if (char && stats.classe === 'mago' && stats.subclasse === 'abjuracao' && f.nivel >= 2 && m.nivel >= 1 && /abjura/.test(m.escola || '')) {
                const max = 2 * f.nivel + f.mods.int
                if (!atual().protecao_criada) {
                    salvar('protecao_arcana', { pv: max, max })
                    salvar('protecao_criada', true)
                    chat(`🔷 ${nome} ergue a Proteção Arcana (${max} PV).`)
                } else {
                    const novo = Math.min(max, ((atual().protecao_arcana || {}).pv || 0) + 2 * (usaEspaco && sel ? nivelEscolhido() : m.nivel))
                    salvar('protecao_arcana', { pv: novo, max })
                    chat(`🔷 A Proteção Arcana de ${nome} volta a ${novo}/${max}.`)
                }
            }
            // Surto de Magia Selvagem (a mesa decidiu: sempre rola o d20)
            if (char) require('./dndHabilidades').aposConjurarSelvagem(char, m)
            refazer()
        })
        linha.appendChild(conjurar)

        // Ritual: sem gastar espaço, 10 minutos a mais (bardo, clérigo, druida, mago)
        if (m.ritual && f.conjuracao && f.conjuracao.ritual && !f.semConjurar) {
            const ritual = mk('button', 'ds-magia-btn', '📜 Ritual')
            const emBatalha = cb.emBatalha() && !state.isRoomMaster
            ritual.disabled = emBatalha
            ritual.title = emBatalha ? 'Ritual leva 10 minutos a mais: não cabe numa batalha' : 'Sem gastar espaço; leva 10 minutos a mais'
            ritual.addEventListener('click', () => {
                if (state.socket) state.socket.emit('chat_message', { playerName: '✦ Magia', message: `${nome} conjura ${m.nome} como ritual (10 minutos a mais, sem gastar espaço).`, type: 'text' })
                if (char && m.concentracao) estadoUI().concentrar(char, m)
                refazer()
            })
            linha.appendChild(ritual)
        }
    }
    if (m.ataque) {
        const atq = mk('button', 'ds-magia-btn', `🎲 Ataque ${dnd.sinal(m.ataqueBonus)}`)
        atq.addEventListener('click', () => rolagem.testeD20({ personagem: nome, rotulo: `${m.nome} (ataque)`, bonus: m.ataqueBonus, tipo: 'ataque', auto: autoAtaque() }))
        linha.appendChild(atq)
    }
    if (m.dano || m.cura) {
        const efeito = mk('button', 'ds-magia-btn', m.dano ? `🎲 Dano` : `🎲 Cura`)
        efeito.title = m.dano ? `${expressaoDe(m.dano)} ${tipoDano}${raios > 1 ? ` por raio (${raios} raios)` : ''}` : expressaoDe(m.cura)
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
    if (canEdit && avisoConj) w.appendChild(avisoConj)

    // Metamágica: marca antes de conjurar
    if (canEdit && metas.length && m.nivel >= 0) {
        const box = mk('div', 'ds-metamagia')
        box.appendChild(mk('span', 'ds-grupo', `Metamágica · ${pontos} ponto(s)`))
        metas.forEach(id => {
            const op = D.OPCOES.metamagias.find(o => o.id === id)
            if (!op) return
            const custo = custoMeta(id)
            const lbl = mk('label', 'dc-check')
            const c = document.createElement('input')
            c.type = 'checkbox'
            c.disabled = custo > pontos
            c.addEventListener('change', () => {
                if (c.checked) marcadas.add(id); else marcadas.delete(id)
                if (id === 'acelerada') atualizarConj()
            })
            lbl.appendChild(c)
            lbl.appendChild(mk('span', null, `${op.nome} (${custo})`))
            lbl.title = op.desc || ''
            box.appendChild(lbl)
        })
        w.appendChild(box)
    }
    return w
}

// Armaduras como as armas (decidido com o mestre em 2026-11-03): o personagem
// veste o que tem; quem dá e tira é o mestre.
let darArmaduraAberto = false

function abrirPainelEquipamento(stats, canEdit) {
    const { body } = painel('dndEquip', '🛡 Equipamento')
    body.innerHTML = ''
    const char = state.statPopupChar
    const f = dnd.calcular(stats)
    const mestre = !!state.isRoomMaster
    const possui = dnd.armadurasDoPersonagem(stats)
    const armaduras = possui.filter(a => a.base !== 'escudo')
    const escudos = possui.filter(a => a.base === 'escudo')
    const vestida = dnd.armaduraVestida(stats)
    const escudo = dnd.escudoEmpunhado(stats)
    const nomeDe = a => a.nome || (a.base === 'escudo' ? 'Escudo' : D.ARMADURAS[a.base].nome) + (a.bonus ? ` +${a.bonus}` : '')

    body.appendChild(mk('span', 'input-label', 'Armadura vestida'))
    const sel = document.createElement('select')
    sel.className = 'dc-select'
    // Na batalha não dá para trocar de armadura: vestir leva minutos (LdJ p. 146)
    const cbt = require('./dndCombate')
    const travaArmadura = cbt.emBatalha() && !state.isRoomMaster ? 'Vestir ou tirar armadura leva minutos: não dá na batalha' : ''
    sel.disabled = !canEdit || !!f.forma || !!travaArmadura
    if (travaArmadura) sel.title = travaArmadura
    sel.appendChild(new Option('Sem armadura', ''))
    armaduras.forEach(a => {
        const def = D.ARMADURAS[a.base]
        const prof = f.proficiencias.armaduras.includes(def.tipo)
        sel.appendChild(new Option(`${nomeDe(a)} · CA ${def.ca + (a.bonus || 0)}${prof ? '' : ' · sem proficiência'}`, a.id))
    })
    sel.value = vestida ? vestida.id : ''
    sel.addEventListener('change', () => salvarEquipamento(stats, { ...(stats.equipamento || {}), armadura: sel.value || null }))
    body.appendChild(sel)
    if (!armaduras.length) body.appendChild(mk('div', 'ds-legenda', 'Nenhuma armadura. Quem dá armadura é o mestre.'))

    if (escudos.length) {
        const lbl = mk('label', 'dc-check')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = !!escudo
        // Pôr ou tirar o escudo gasta a ação
        const travaEscudo = char ? cbt.podeGastar(char, 'acao') : ''
        cb.disabled = !canEdit || !!f.forma || !!travaEscudo
        lbl.title = travaEscudo || 'Pôr ou tirar o escudo gasta a ação na batalha'
        cb.addEventListener('change', () => {
            if (char) cbt.gastarCusto(char, 'acao')
            salvarEquipamento(stats, { ...(stats.equipamento || {}), escudo: cb.checked ? escudos[0].id : null })
        })
        lbl.appendChild(cb)
        lbl.appendChild(mk('span', null, `${nomeDe(escudos[0])} (+${2 + (escudos[0].bonus || 0)} CA)` + (f.proficiencias.armaduras.includes('escudo') ? '' : ' · sem proficiência')))
        body.appendChild(lbl)
    }

    body.appendChild(mk('div', 'ds-extras', `CA ${f.ca}: ${f.caDetalhe}`))
    if (f.armadura && f.armadura.furtividade) body.appendChild(mk('div', 'ds-legenda', 'Esta armadura dá desvantagem em Furtividade (o app aplica sozinho).'))
    if (f.armadura && f.armadura.forca && f.atributos.for < f.armadura.forca) body.appendChild(mk('div', 'ds-legenda', `Exige FOR ${f.armadura.forca}: −3 m de deslocamento.`))
    if (f.semProfArmadura) body.appendChild(mk('div', 'da-alerta', 'Sem proficiência: desvantagem em tudo de FOR e DES e não conjura magias.'))

    // O que o personagem tem, com o mestre podendo tirar
    if (possui.length && mestre) {
        body.appendChild(mk('div', 'ds-grupo', 'Na ficha'))
        possui.forEach(a => {
            const linha = mk('div', 'da-mestre')
            linha.appendChild(mk('span', null, nomeDe(a)))
            const tirar = mk('button', 'ds-link', 'tirar')
            tirar.addEventListener('click', () => {
                const lista = possui.filter(x => x.id !== a.id)
                const eq = { ...(stats.equipamento || {}) }
                if (eq.armadura === a.id) eq.armadura = null
                if (eq.escudo === a.id) eq.escudo = null
                commit('armaduras', lista)
                salvarEquipamento(statsAtuais(), eq)
                if (state.socket && char) state.socket.emit('chat_message', { playerName: '⚙ Sistema', message: `O mestre tirou ${nomeDe(a)} de ${char.name}.`, type: 'text' })
            })
            linha.appendChild(tirar)
            body.appendChild(linha)
        })
    }
    if (mestre && char) body.appendChild(formDarArmadura(char, stats, possui))

    // Itens do pacote que ainda não foram para o Inventário
    if (Array.isArray(stats.itens) && stats.itens.length) {
        body.appendChild(mk('div', 'ds-grupo', 'Itens do pacote (fora do inventário)'))
        body.appendChild(mk('div', 'ds-caract-desc', stats.itens.join(' · ')))
        if (canEdit && char) {
            const b = mk('button', 'ds-magia-btn', '📦 Mandar para o inventário')
            const aviso = mk('div', 'ds-legenda')
            b.addEventListener('click', async () => {
                b.disabled = true
                const n = await require('./dndItens').entregarDaFicha(char)
                aviso.textContent = n > 0 ? `${n} item(ns) no inventário.` : 'O catálogo de itens do D&D ainda não está no banco (rode sql/dnd/03_itens_bolsa.sql no Supabase).'
                b.disabled = false
                if (n > 0) abrirPainelEquipamento(statsAtuais(), canEdit)
            })
            body.appendChild(b)
            body.appendChild(aviso)
        }
    }
    body.appendChild(mk('div', 'ds-legenda', 'As armas ficam no painel ⚔ Armas; os outros itens, no 📦 Inventário.'))
}

function formDarArmadura(char, stats, possui) {
    const w = mk('div', 'da-dar')
    if (!darArmaduraAberto) {
        const abrir = mk('button', 'ds-magia-btn', '+ Dar armadura ou escudo')
        abrir.addEventListener('click', () => { darArmaduraAberto = true; abrirPainelEquipamento(stats, true) })
        w.appendChild(abrir)
        return w
    }
    w.appendChild(mk('div', 'ds-grupo', `Dar a ${char.name}`))
    const sel = document.createElement('select')
    sel.className = 'dc-select'
    sel.setAttribute('aria-label', 'Armadura')
    Object.entries(D.TIPOS_ARMADURA).forEach(([tipo, rot]) => {
        const g = document.createElement('optgroup')
        g.label = rot
        if (tipo === 'escudo') g.appendChild(new Option(`Escudo · ${D.textoPreco(D.PRECO_ESCUDO)}`, 'escudo'))
        else Object.entries(D.ARMADURAS).filter(([, a]) => a.tipo === tipo).forEach(([id, a]) => g.appendChild(new Option(`${a.nome} · CA ${a.ca} · ${D.textoPreco(a.preco)}`, id)))
        sel.appendChild(g)
    })
    w.appendChild(sel)
    const bonus = document.createElement('select')
    bonus.className = 'dc-select'
    bonus.setAttribute('aria-label', 'Bônus mágico')
    ;['Sem bônus', '+1', '+2', '+3'].forEach((t, i) => bonus.appendChild(new Option(t, String(i))))
    w.appendChild(bonus)
    const nome = document.createElement('input')
    nome.className = 'room-input'
    nome.placeholder = 'Nome (opcional)'
    nome.setAttribute('aria-label', 'Nome')
    nome.addEventListener('keydown', e => e.stopPropagation())
    w.appendChild(nome)
    const lbl = mk('label', 'dc-check')
    const cobrar = document.createElement('input')
    cobrar.type = 'checkbox'
    lbl.appendChild(cobrar)
    lbl.appendChild(mk('span', null, 'Cobrar o preço do livro da bolsa do grupo'))
    w.appendChild(lbl)
    const linha = mk('div', 'ds-magia-botoes')
    const dar = mk('button', 'ds-magia-btn principal', `Dar a ${char.name}`)
    dar.addEventListener('click', () => {
        const b = parseInt(bonus.value, 10) || 0
        const item = { id: 'r' + Math.random().toString(36).slice(2, 9), base: sel.value }
        if (b) item.bonus = b
        if (nome.value.trim()) item.nome = nome.value.trim().slice(0, 60)
        const rotulo = item.nome || (sel.value === 'escudo' ? 'Escudo' : D.ARMADURAS[sel.value].nome) + (b ? ` +${b}` : '')
        commit('armaduras', [...possui, item])
        if (state.socket) state.socket.emit('chat_message', { playerName: '⚙ Sistema', message: `O mestre deu ${rotulo} a ${char.name}.`, type: 'text' })
        if (cobrar.checked) require('./dndBolsa').cobrar(sel.value === 'escudo' ? D.PRECO_ESCUDO : D.ARMADURAS[sel.value].preco, `${rotulo} para ${char.name}`)
        darArmaduraAberto = false
        abrirPainelEquipamento(statsAtuais(), true)
    })
    const cancelar = mk('button', 'ds-magia-btn', 'Cancelar')
    cancelar.addEventListener('click', () => { darArmaduraAberto = false; abrirPainelEquipamento(stats, true) })
    linha.appendChild(dar)
    linha.appendChild(cancelar)
    w.appendChild(linha)
    return w
}

function salvarEquipamento(stats, novo) {
    // Ficha antiga: a lista de armaduras nasce com o que ela já vestia
    if (!Array.isArray(stats.armaduras)) commit('armaduras', dnd.armadurasDoPersonagem(stats))
    commit('equipamento', novo)
    const f = dnd.calcular({ ...statsAtuais(), equipamento: novo })
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
    // O que dura até o descanso (Bênção, Inspiração, Ajuda...) acaba antes de tudo
    if (state.statPopupChar) require('./dndEfeitos').aoDescansar(state.statPopupChar, tipo)
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

    // A CD da Fúria Implacável volta a 10 em qualquer descanso
    if ((stats.efeitos || {}).implacavelCd) {
        const ef = { ...stats.efeitos }
        delete ef.implacavelCd
        commit('efeitos', ef)
    }
    if (tipo === 'longo') {
        // A 0 PV o descanso longo não cura (é preciso ter ao menos 1 PV)
        if ((stats.hp ?? 1) > 0) commit('hp', f.pvMax)
        commit('hp_temp', 0)
        const recupera = Math.max(1, Math.floor(f.nivel / 2))
        commit('dados_vida_usados', Math.max(0, (stats.dados_vida_usados || 0) - recupera))
        // Um nível de exaustão a menos; os espaços criados com feitiçaria somem
        if (stats.exaustao) commit('exaustao', stats.exaustao - 1)
        if (stats.espacos_extras) commit('espacos_extras', {})
        if (stats.protecao_arcana || stats.protecao_criada) { commit('protecao_arcana', null); commit('protecao_criada', false) }
        // Prodígio (mago adivinho): os d20 do dia (3 no 14º)
        if (stats.classe === 'mago' && stats.subclasse === 'adivinhacao' && f.nivel >= 2) {
            const valores = Array.from({ length: f.nivel >= 14 ? 3 : 2 }, () => 1 + Math.floor(Math.random() * 20))
            commit('prodigio', valores)
            chat(`🔮 Prodígio de ${(state.statPopupChar || {}).name}: ${valores.join(' e ')}.`)
        }
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
    if (visivel('dndArmas')) require('./dndArmas').abrirPainel(statsAtuais(), true)
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
    // O palco da batalha mostra PV, condições e economia de todo o grupo
    try { require('./dndCena').aoMudarFicha(charId) } catch (e) { /* palco fechado */ }
    // Mudou de concentração: o que ela segurava (Bênção, Perdição...) acaba
    if ('concentracao' in campos) setTimeout(() => require('./dndEfeitos').limparMeus(), 0)
    const stats = (meu && meu.stats) || (entry && entry.character.stats)
    if (stats && state.supabase) {
        state.supabase.from('characters').update({ stats }).eq('id', charId)
            .then(({ error }) => { if (error) console.warn('[D&D] Supabase:', error.message) })
    }
}

/**
 * O dono grava a ficha quando recebe de fora algo que precisa sobreviver a
 * ele fechar o app — a liberação de nível e as armas vêm do mestre, e o banco
 * pode não deixar o mestre gravar ficha alheia. Cada mudança chega como um
 * stat_update por campo; a gravação espera a rajada terminar.
 */
const gravacoesPendentes = {}
function persistirSeForMeu(charId) {
    const meu = state.playerCharacters.find(c => c.id === charId)
    if (!meu || !state.supabase) return
    clearTimeout(gravacoesPendentes[charId])
    gravacoesPendentes[charId] = setTimeout(() => {
        delete gravacoesPendentes[charId]
        state.supabase.from('characters').update({ stats: meu.stats }).eq('id', charId)
            .then(({ error }) => { if (error) console.warn('[D&D] Supabase:', error.message) })
    }, 400)
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
    atualizarPaineis(canEdit)
}

/** Os painéis abertos acompanham a ficha (dano numa besta, uso gasto, arma dada). */
function atualizarPaineis(canEdit) {
    const stats = statsAtuais()
    if (!stats) return
    const visivel = id => { const el = document.getElementById(id); return el && el.classList.contains('visible') }
    if (visivel('dndRecursos')) abrirPainelRecursos(stats, canEdit)
    if (visivel('dndMagia')) abrirPainelMagia(stats, canEdit)
    if (visivel('dndEquip')) abrirPainelEquipamento(stats, canEdit)
    if (visivel('dndArmas')) require('./dndArmas').abrirPainel(stats, canEdit)
    if (visivel('dndCriaturas')) require('./dndCompanheiros').abrirPainel(stats, canEdit)
    if (visivel('dndCondicoes') && state.statPopupChar) estadoUI().abrirPainelCondicoes(state.statPopupChar, canEdit)
    if (visivel('dndPericias')) abrirPainelPericias(stats)
    if (visivel('dndCaract')) abrirPainelCaracteristicas(stats)
}

/** Refaz os painéis abertos da ficha (a economia do turno mudou). */
function atualizarPaineisAbertos() {
    const char = state.statPopupChar
    if (!char || !isDnd(char)) return
    const entry = state.allCharsCache.find(e => e.character.id === char.id)
    const ownerName = entry ? entry.playerName : state.playerName
    atualizarPaineis(state.isRoomMaster || ownerName === state.playerName)
}

/** Chamado por socket.js quando outro cliente altera esta ficha. */
function onRemoteStatUpdate(charId) {
    if (!state.statPopupChar || state.statPopupChar.id !== charId) return
    reabrirFicha()
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
        el.setAttribute('role', 'dialog')
        el.setAttribute('aria-label', titulo)
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
    buildSheet, fecharPaineis, onRemoteStatUpdate, isDnd, reabrirFicha, gravar, persistirSeForMeu, segurarCliques, painel,
    acoesDaMagia, abrirPainelPericias, atualizarPaineisAbertos, ultimaMagiaDe: id => ultimaMagia[id] || null,
}
