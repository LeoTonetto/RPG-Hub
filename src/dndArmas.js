// ══════════════════════════════════════════════════════════════════════════════
// src/dndArmas.js — ARMAS E ATAQUES DO D&D
//
// Decidido com o mestre (2026-11-02):
//   • painel Armas na ficha: o jogador escolhe com qual arma ataca (um ladino
//     com arco e adaga escolhe a cada ataque);
//   • o pacote inicial do livro entra na criação; depois disso, quem dá e
//     tira armas é o MESTRE (do catálogo do livro ou das armas da mesa,
//     guardadas no Supabase);
//   • ataque e dano rolam juntos; o que depende de acertar (Ataque Furtivo,
//     Destruição Divina, manobras, Ataque Atordoante...) vira botão no
//     resultado, para o jogador usar quando o mestre disser que acertou;
//   • munição não é contada.
//
// Em batalha, o primeiro ataque gasta a Ação e os seguintes (Ataque Extra)
// vêm de graça até acabar a conta; ataques bônus gastam a Ação Bônus. A
// conta dos ataques fica só neste app: o servidor guarda a economia do turno
// (Ação, Ação Bônus, Reação), não quantos ataques sobraram.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const D = require('./dndDados')
const conteudo = require('./dndConteudo')
const rolagem = require('./dndRolagem')
const magiasUI = require('./dndMagiasUI')
const CD = require('./dndCondicoes')
const CR = require('./dndCriaturas')

const armaEmFoco = {}        // charId → id da arma em destaque
const opcoesDasArmas = {}    // `${charId}:${armaId}` → { duasMaos, arremesso, poderoso, favorito }
const turnos = {}            // charId → o que já aconteceu no turno atual
const rascunhoPacote = {}    // charId → cópia da ficha para escolher o pacote (personagem antigo)
let ultimo = null            // o último ataque feito neste app, para os extras depois do acerto
let darArmaAberto = false
let avisoDarArma = ''
let tirarArma = null         // id da arma esperando a confirmação para sair da ficha

const combate = () => require('./dndCombate')
const sheet = () => require('./dndSheet')

// Efeitos que ficam ligados até alguém desligar ou a batalha acabar
const EFEITOS_DE_BATALHA = ['furia', 'arma-sagrada', 'bordao-mistico', 'frenesi']

// ══════════════════════════════════════════════════════════════════════════════
// ── Turno ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** É o turno deste personagem numa batalha em andamento? */
function noMeuTurno(char) {
    const cb = combate()
    return cb.emBatalha() && cb.turnoDoChar(char.id)
}

/** O que já aconteceu no turno: ataques que sobram, extras de "uma vez por turno". */
function turnoDe(char) {
    const chave = noMeuTurno(char) ? combate().chaveDoTurno() : 'fora'
    let t = turnos[char.id]
    if (!t || t.chave !== chave) {
        t = turnos[char.id] = { chave, restantes: 0, atacou: false, usados: new Set(), descuidado: false, rajada: 0 }
    }
    return t
}

/** Para o painel "Seu turno": quantos ataques da ação ainda sobram. */
function ataquesRestantes(char) {
    const t = turnos[char.id]
    return t && noMeuTurno(char) && t.chave === combate().chaveDoTurno() ? t.restantes : 0
}

function chat(message, playerName = '⚔ Ataque') {
    if (state.socket) state.socket.emit('chat_message', { playerName, message, type: 'text' })
}

function opcoesDe(char, item) {
    const k = `${char.id}:${item.id}`
    if (!opcoesDasArmas[k]) opcoesDasArmas[k] = {}
    return opcoesDasArmas[k]
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Ataque ───────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Ataque da besta (Forma Selvagem) ou de um aliado: bônus e dano da ficha
 * da criatura. `dono` é quem rola (o personagem).
 */
function ataqueDeCriatura(dono, nomeCriatura, at, { tipo = 'acao', rotuloExtra = '' } = {}) {
    const stats = dono.stats || {}
    const f = dnd.calcular(stats)
    const d = CR.separarDano(at.dano)
    const a = {
        nome: `${nomeCriatura}: ${at.nome}`, bonus: at.bonus, expressao: /d/.test(d.dados) ? d.dados : '0', bonusDano: /d/.test(d.dados) ? d.bonus : parseInt(d.dados, 10) || 0,
        tipo: at.tipoDano, extras: [], critMin: 20, dadosCritExtra: 0, rerrolarAte: 0, corpo: at.tipo === 'corpo', atributo: at.tipo === 'corpo' ? 'for' : 'des',
        semDano: false, acuidade: false, armaDistancia: at.tipo === 'distancia', item: null, def: null,
    }
    if (tipo === 'acao') contarAtaqueDaAcao(dono, stats, f, { base: 'criatura' })
    const res = rolarAtaque(dono, stats, f, a, turnoDe(dono), rotuloExtra + (at.extra ? ` [${at.extra}]` : ''))
    if (combate().emBatalha()) combate().atualizarTurno()
    return res
}

/**
 * Ataca com a arma e rola o dano junto.
 *   tipo: 'acao' (ação de Ataque) | 'bonus' | 'reacao' | 'livre' (sem custo)
 */
function atacar(char, item, { tipo = 'acao', op = {}, rotuloExtra = '' } = {}) {
    const stats = char.stats || {}
    const f = dnd.calcular(stats)
    const a = dnd.ataqueComArma(stats, item, { ...opcoesDe(char, item), ...op }, f)
    if (!a) return null
    const t = turnoDe(char)
    const cb = combate()
    const ent = cb.entradaDoChar(char.id)
    const ec = ent ? cb.economia(ent.id) : null

    if (ec && noMeuTurno(char)) {
        if (tipo === 'acao') {
            contarAtaqueDaAcao(char, stats, f, item)
        } else if (tipo === 'bonus') {
            cb.gastar(ent.id, 'bonusUsada', true)
        }
    }
    return rolarAtaque(char, stats, f, a, t, rotuloExtra)
}

/** Gasta um ataque da ação de Ataque (o primeiro gasta a Ação e abre a conta do Ataque Extra). */
function contarAtaqueDaAcao(char, stats, f, item) {
    const t = turnoDe(char)
    const cb = combate()
    const ent = cb.entradaDoChar(char.id)
    const ec = ent ? cb.economia(ent.id) : null
    if (!ec || !noMeuTurno(char)) return
    if (t.restantes > 0) t.restantes--
    else {
        // Uma ação de Ataque nova: gasta a Ação e abre a conta do Ataque Extra
        if (ec.acoesUsadas < ec.acoes) cb.gastar(ent.id, 'acoesUsadas', ec.acoesUsadas + 1)
        let n = dnd.ataquesPorAcao(stats, f)
        if (stats.classe === 'bruxo' && !item.pacto) n = 1          // Lâmina Sedenta: só a arma do pacto
        if (item.base === 'rede') n = 1                              // a rede faz um ataque só
        // Batedor do Subterrâneo: um ataque a mais no primeiro turno da batalha
        if (stats.classe === 'patrulheiro' && stats.subclasse === 'rastreador' && f.nivel >= 3
            && state.combate.rodada === 1 && !t.batedor) { n += 1; t.batedor = true }
        t.restantes = n - 1
    }
    t.atacou = true
}

/** Agarrar e Empurrar trocam um ataque da ação de Ataque por um teste (dndCombate). */
function usarAtaqueDaAcao(char) {
    const stats = char.stats || {}
    contarAtaqueDaAcao(char, stats, dnd.calcular(stats), { base: dnd.DESARMADO })
    const cb = combate()
    if (cb.emBatalha()) cb.atualizarTurno()
    redesenhar(char)
}

/** Rola o ataque já calculado, com o que o livro aplica sozinho. */
function rolarAtaque(char, stats, f, a, t, rotuloExtra) {
    const cb = combate()
    // Condições, exaustão, armadura sem proficiência e Sortudo; Descuidado dá vantagem
    const auto = CD.modoAutomatico(stats, f, { tipo: 'ataque', atributo: a.atributo })
    if (t.descuidado && a.corpo && a.atributo === 'for') auto.vantagem.push('descuidado')

    const tiposExtras = a.extras.map(e => e.tipo).filter(Boolean)
    const rotulo = `${a.nome}${rotuloExtra}${tiposExtras.length ? ` (+${tiposExtras.join(', ')})` : ''}`
    const res = a.semDano
        ? rolagem.testeD20({ personagem: char.name, rotulo, bonus: a.bonus, tipo: 'ataque', auto })
        : rolagem.ataqueComArma({
            personagem: char.name, rotulo, bonusAtaque: a.bonus, expressao: a.expressao, bonusDano: a.bonusDano,
            tipoDano: a.tipo, critMin: a.critMin, dadosCritExtra: a.dadosCritExtra, rerrolarAte: a.rerrolarAte, auto,
        })
    ultimo = {
        charId: char.id, ataque: a, critico: !!res.critico && !res.falha, falha: !!res.falha,
        total: res.ataque ? res.ataque.total : res.total, dano: res.ataque ? res.total : null, usados: new Set(),
    }
    redesenhar(char)
    if (cb.emBatalha()) cb.atualizarTurno()
    return res
}

function atacarBonus(char, b, item) {
    const stats = char.stats || {}
    const cb = combate()
    const f = dnd.calcular(stats)
    if (b.recurso) {
        if (!cb.recursoLivre(char, f, b.recurso)) return
        cb.gastarRecurso(char, b.recurso)
    }
    if (b.id === 'frenesi' && !(stats.efeitos || {}).frenesi) {
        sheet().gravar(char.id, { efeitos: { ...(stats.efeitos || {}), frenesi: true } })
    }
    if (b.golpes > 1) turnoDe(char).rajada = b.golpes - 1
    atacar(char, item, { tipo: 'bonus', op: b.op || {}, rotuloExtra: ` (${b.nome})` })
}

/** Um extra depois do acerto: rola o dado a mais e gasta o que tiver que gastar. */
function usarExtra(char, ex, { espaco, mortoVivo } = {}) {
    if (!ultimo || ultimo.charId !== char.id) return
    const stats = char.stats || {}
    const f = dnd.calcular(stats)
    const cb = combate()
    if (ex.recurso) {
        if (!cb.recursoLivre(char, f, ex.recurso)) return
        cb.gastarRecurso(char, ex.recurso)
    }
    let dados = ex.dados
    if (ex.espaco) {
        if (!espaco) return
        cb.gastarEspaco(char, espaco)
        // 2d8 no espaço de 1º, +1d8 por nível acima, no máximo 5d8; +1d8 contra morto-vivo ou corruptor
        dados = `${Math.min(5, 1 + espaco.nivel)}d8` + (mortoVivo ? '+1d8' : '')
    }
    const nome = char.name
    if (dados && ex.noAtaque) {
        const r = rolagem.rolarDados({ personagem: nome, rotulo: `${ex.nome} (soma à jogada de ataque)`, expressao: dados, tipo: 'dano' })
        ultimo.total += r.total
        chat(`${nome} usa ${ex.nome}: o ataque vai a ${ultimo.total}.`)
    } else if (dados) {
        rolagem.rolarDados({
            personagem: nome,
            rotulo: ex.nome + (ex.cd ? ` (CD ${ex.cd})` : '') + (ex.outroAlvo ? ' — outra criatura' : '') + (espaco ? ` (${espaco.nivel}º)` : ''),
            expressao: dados, multiplicador: ultimo.critico && !ex.outroAlvo ? 2 : 1, tipo: 'dano', tipoDano: ex.tipo || '',
        })
    } else {
        chat(`${nome} usa ${ex.nome}. ${ex.desc}`)
    }
    ultimo.usados.add(ex.id)
    if (ex.uso === 'turno' && noMeuTurno(char)) turnoDe(char).usados.add(ex.id)
    redesenhar(char)
}

// ── Efeitos ligados (Fúria, Arma Sagrada, Bordão Místico) e Descuidado ────────

function efeitosDisponiveis(stats, f) {
    const lista = []
    const nv = f.nivel
    if (stats.classe === 'barbaro') {
        lista.push({ id: 'furia', nome: 'Fúria', recurso: 'furia', custo: 'bonus',
            bloqueio: f.armadura && f.armadura.tipo === 'pesada' ? 'Não funciona com armadura pesada' : '',
            desc: 'Vantagem em FOR, dano a mais nos ataques corpo-a-corpo de FOR, resistência a concussão, cortante e perfurante.' })
        if (nv >= 2) lista.push({ id: 'descuidado', nome: 'Descuidado', turno: true,
            desc: 'Vantagem nos ataques corpo-a-corpo de FOR deste turno; ataques contra você também têm vantagem.' })
    }
    if (stats.classe === 'paladino' && stats.subclasse === 'devocao' && nv >= 3) {
        lista.push({ id: 'arma-sagrada', nome: 'Arma Sagrada', recurso: 'canalizar', custo: 'acao',
            desc: `Canalizar Divindade: soma ${dnd.sinal(Math.max(1, f.mods.car))} aos ataques com arma por 1 minuto.` })
    }
    if (f.talentos.includes('ambidestro')) {
        lista.push({ id: 'duas-armas', nome: 'Duas armas em mãos', desc: 'Ambidestro: +1 na CA com uma arma corpo-a-corpo em cada mão.' })
    }
    if (f.magias.some(m => m.id === 'bordao-mistico')) {
        lista.push({ id: 'bordao-mistico', nome: 'Bordão Místico', custo: 'bonus',
            desc: 'Clava ou bordão usam o atributo de magia e causam d8 por 1 minuto.' })
    }
    return lista
}

function alternarEfeito(char, ef) {
    const stats = char.stats || {}
    const cb = combate()
    if (ef.turno) {
        const t = turnoDe(char)
        t.descuidado = !t.descuidado
        if (t.descuidado) chat(`${char.name} ataca de forma descuidada: vantagem nos ataques de FOR, e os inimigos têm vantagem contra ele.`)
        return redesenhar(char)
    }
    const efeitos = { ...(stats.efeitos || {}) }
    if (efeitos[ef.id]) {
        delete efeitos[ef.id]
        let msg = `${ef.nome} de ${char.name} termina.`
        if (ef.id === 'furia' && efeitos.frenesi) { delete efeitos.frenesi; msg += ' Frenesi: 1 nível de exaustão.' }
        sheet().gravar(char.id, { efeitos })
        chat(msg)
    } else {
        const f = dnd.calcular(stats)
        if (ef.recurso && !cb.recursoLivre(char, f, ef.recurso)) return
        if (ef.recurso) cb.gastarRecurso(char, ef.recurso)
        const ent = cb.entradaDoChar(char.id)
        const ec = ent ? cb.economia(ent.id) : null
        if (ec && noMeuTurno(char)) {
            if (ef.custo === 'bonus') cb.gastar(ent.id, 'bonusUsada', true)
            else if (ef.custo === 'acao' && ec.acoesUsadas < ec.acoes) cb.gastar(ent.id, 'acoesUsadas', ec.acoesUsadas + 1)
        }
        efeitos[ef.id] = true
        sheet().gravar(char.id, { efeitos })
        if (ef.id !== 'duas-armas') chat(ef.id === 'furia' ? `🔥 ${char.name} entra em fúria!` : `${char.name}: ${ef.nome}.`)
    }
    // A CA muda com o Ambidestro: o card e a ficha leem stats.ca
    if (ef.id === 'duas-armas') {
        const ca = dnd.calcular((state.statPopupChar && state.statPopupChar.id === char.id ? state.statPopupChar : char).stats || {}).ca
        sheet().gravar(char.id, { ca })
        sheet().reabrirFicha()
    }
    redesenhar(char)
}

/** Chamado por dndCombate quando a batalha acaba: a fúria e afins terminam. */
function aoFimDaBatalha() {
    state.playerCharacters.forEach(c => {
        const ef = (c.stats && c.stats.efeitos) || {}
        const ligados = EFEITOS_DE_BATALHA.filter(k => ef[k])
        if (!ligados.length) return
        const novo = { ...ef }
        ligados.forEach(k => delete novo[k])
        sheet().gravar(c.id, { efeitos: novo })
        if (ef.furia) chat(`A fúria de ${c.name} termina com a batalha.` + (ef.frenesi ? ' Frenesi: 1 nível de exaustão.' : ''))
    })
    Object.keys(turnos).forEach(k => delete turnos[k])
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel ───────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function podeEditar(char) {
    return !!state.isRoomMaster || state.playerCharacters.some(c => c.id === char.id)
}

function redesenhar(char) {
    // O palco da batalha mostra o último ataque e os extras também
    if (combate().emBatalha()) combate().atualizarTurno()
    const el = document.getElementById('dndArmas')
    const aberto = state.statPopupChar
    if (!el || !el.classList.contains('visible') || !aberto || aberto.id !== char.id) return
    abrirPainel(aberto.stats || {}, podeEditar(aberto))
}

function abrirPainel(stats, canEdit) {
    const char = state.statPopupChar
    if (!char) return
    const { body } = sheet().painel('dndArmas', '⚔ Armas', 'ds-painel-magia ds-painel-armas')
    body.innerHTML = ''
    const meu = state.playerCharacters.some(c => c.id === char.id)
    const mestre = !!state.isRoomMaster

    // Personagem criado antes das armas: o dono escolhe o pacote do livro aqui
    if (!Array.isArray(stats.armas)) {
        desenharPacotePendente(body, char, stats, meu)
        if (mestre) body.appendChild(formDarArma(char, stats))
        return
    }

    const f = dnd.calcular(stats)
    const t = turnoDe(char)
    const n = dnd.ataquesPorAcao(stats, f)

    // Forma Selvagem: só os ataques da besta
    if (f.forma) {
        body.appendChild(mk('div', 'da-topo', `🐾 ${f.forma.nome} · Forma Selvagem`))
        if (canEdit) body.appendChild(rolagem.seletorModo())
        if (f.forma.ataquesMultiplos) body.appendChild(mk('div', 'ds-legenda', `Ataques Múltiplos: ${f.forma.ataquesMultiplos}.`))
        f.forma.ataques.forEach(at => {
            const linha = mk('div', 'da-forma-ataque')
            linha.appendChild(mk('b', null, at.nome))
            linha.appendChild(mk('span', null, `${dnd.sinal(at.bonus)} · ${at.dano} ${at.tipoDano}${at.extra ? ` · ${at.extra}` : ''}`))
            if (canEdit) {
                const b = mk('button', 'ds-magia-btn principal', '⚔ Atacar')
                b.addEventListener('click', () => ataqueDeCriatura(char, f.forma.nome, at))
                linha.appendChild(b)
            }
            body.appendChild(linha)
        })
        if (!f.forma.ataques.length) body.appendChild(mk('div', 'ds-muted', 'Esta forma não tem ataques.'))
        if (ultimo && ultimo.charId === char.id && canEdit) body.appendChild(secaoUltimo(char, stats, f))
        return
    }

    const topo = mk('div', 'da-topo')
    topo.appendChild(mk('span', null, n > 1 ? `Ação de Ataque: ${n} ataques` : 'Ação de Ataque: 1 ataque'))
    if (noMeuTurno(char) && t.restantes > 0) topo.appendChild(mk('b', 'da-restam', `restam ${t.restantes}`))
    body.appendChild(topo)
    if (canEdit) body.appendChild(rolagem.seletorModo())

    // Fúria, Descuidado, Arma Sagrada...
    const efeitos = efeitosDisponiveis(stats, f)
    if (efeitos.length) {
        const linha = mk('div', 'da-efeitos')
        efeitos.forEach(ef => {
            const ligado = ef.turno ? t.descuidado : !!(stats.efeitos || {})[ef.id]
            const b = mk('button', 'da-efeito' + (ligado ? ' on' : ''), (ligado ? '● ' : '○ ') + ef.nome)
            b.type = 'button'
            b.setAttribute('aria-pressed', String(ligado))
            const semUso = !ligado && ef.recurso && !combate().recursoLivre(char, f, ef.recurso)
            if (!ligado && CD.semAcoes(stats) && ef.custo) ef.bloqueio = 'Incapacitado'
            b.disabled = !canEdit || (!ligado && (!!ef.bloqueio || semUso))
            b.title = ef.bloqueio || (semUso ? 'Sem usos restantes' : ef.desc)
            b.addEventListener('click', () => alternarEfeito(char, ef))
            linha.appendChild(b)
        })
        body.appendChild(linha)
    }

    // Lista de armas
    const armas = dnd.armasDoPersonagem(stats)
    const foco = armas.find(a => a.id === armaEmFoco[char.id]) || armas[0]
    const lista = mk('div', 'ds-magias da-armas')
    armas.forEach(item => {
        const a = dnd.ataqueComArma(stats, item, opcoesDe(char, item), f)
        const b = mk('button', 'ds-magia da-arma' + (item.id === foco.id ? ' on' : ''))
        b.type = 'button'
        b.appendChild(magiasUI.icone(a.icone))
        const txt = mk('span', 'da-arma-txt')
        txt.appendChild(mk('span', 'ds-magia-nome', a.nome + ((item.qtd || 1) > 1 ? ` ×${item.qtd}` : '')))
        txt.appendChild(mk('span', 'da-arma-sub', dnd.textoDoDano(a)))
        b.appendChild(txt)
        b.appendChild(mk('span', 'da-arma-bonus' + (a.proficiente ? '' : ' sem-prof'), dnd.sinal(a.bonus)))
        b.title = a.proficiente ? a.nome : `${a.nome} — sem proficiência`
        b.addEventListener('click', () => { armaEmFoco[char.id] = item.id; tirarArma = null; abrirPainel(stats, canEdit) })
        lista.appendChild(b)
    })
    body.appendChild(lista)
    if (armas.length === 1) body.appendChild(mk('div', 'ds-legenda', 'Sem armas na ficha. Quem dá armas é o mestre.'))

    body.appendChild(detalhe(char, stats, f, foco, canEdit, mestre))
    if (canEdit) {
        const bonus = secaoBonus(char, stats, f, foco)
        if (bonus) body.appendChild(bonus)
        if (ultimo && ultimo.charId === char.id) body.appendChild(secaoUltimo(char, stats, f))
    }
    if (mestre) body.appendChild(formDarArma(char, stats))
}

function detalhe(char, stats, f, item, canEdit, mestre) {
    const op = opcoesDe(char, item)
    const a = dnd.ataqueComArma(stats, item, op, f)
    const def = a.def
    const det = mk('div', 'da-det')

    const cab = mk('div', 'da-det-cab')
    cab.appendChild(magiasUI.icone(a.icone, 'da-det-icone'))
    const nomes = mk('div', 'da-det-nomes')
    nomes.appendChild(mk('div', 'da-det-nome', a.nome))
    const sub = []
    if (item.nome && D.ARMAS[item.base]) sub.push(D.ARMAS[item.base].nome)
    if (def.cat) sub.push(def.cat === 'marcial' ? 'arma marcial' : 'arma simples')
    sub.push(def.distancia ? 'à distância' : 'corpo-a-corpo')
    nomes.appendChild(mk('div', 'da-det-sub', sub.join(' · ')))
    cab.appendChild(nomes)
    det.appendChild(cab)

    const props = D.textoPropriedades(def)
    if (props) det.appendChild(mk('div', 'ds-magia-info', props))
    if (def.especial) det.appendChild(mk('div', 'ds-legenda', def.especial))
    if (item.nota) det.appendChild(mk('div', 'ds-legenda', item.nota))
    if (!a.proficiente) det.appendChild(mk('div', 'da-alerta', 'Sem proficiência: não soma o bônus de proficiência no ataque.'))

    // Como empunha: duas mãos, arremesso, −5/+10, inimigo favorito
    const opcoes = []
    if (a.pode.duasMaos) opcoes.push(['duasMaos', `Com as duas mãos (${def.versatil})`])
    if (a.pode.arremesso) opcoes.push(['arremesso', `Arremessar (${String(def.alcance[0]).replace('.', ',')}/${String(def.alcance[1]).replace('.', ',')} m)`])
    if (a.pode.poderoso) opcoes.push(['poderoso', '−5 no ataque, +10 no dano'])
    if (a.pode.favorito) opcoes.push(['favorito', `Contra o inimigo favorito (+${f.nivel >= 6 ? 4 : 2})`])
    if (opcoes.length) {
        const w = mk('div', 'da-opcoes')
        opcoes.forEach(([k, rot]) => {
            const lbl = mk('label', 'dc-check')
            const cb = document.createElement('input')
            cb.type = 'checkbox'
            cb.checked = !!op[k]
            cb.addEventListener('change', () => { op[k] = cb.checked; if (k === 'arremesso' && cb.checked) op.duasMaos = false; abrirPainel(stats, canEdit) })
            lbl.appendChild(cb)
            lbl.appendChild(mk('span', null, rot))
            w.appendChild(lbl)
        })
        det.appendChild(w)
    }
    // Pacto da Lâmina: a arma do pacto tem proficiência e conta para as invocações
    if (stats.classe === 'bruxo' && dnd.escolhidos(stats, 'pacto').includes('lamina') && a.corpo && item.base !== dnd.DESARMADO && canEdit) {
        const lbl = mk('label', 'dc-check')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = !!item.pacto
        cb.addEventListener('change', () => {
            const armas = (stats.armas || []).map(x => ({ ...x, pacto: x.id === item.id ? cb.checked : false }))
            sheet().gravar(char.id, { armas })
            abrirPainel(state.statPopupChar.stats, canEdit)
        })
        lbl.appendChild(cb)
        lbl.appendChild(mk('span', null, 'Arma do pacto'))
        det.appendChild(lbl)
    }

    const nums = mk('div', 'da-numeros')
    nums.appendChild(numero('Ataque', dnd.sinal(a.bonus)))
    nums.appendChild(numero('Dano', dnd.textoDoDano(a)))
    det.appendChild(nums)
    if (a.notas.length) det.appendChild(mk('div', 'ds-legenda', a.notas.join(' · ')))

    if (canEdit) {
        const linha = mk('div', 'ds-magia-botoes')
        const atq = mk('button', 'ds-magia-btn principal', '⚔ Atacar')
        atq.disabled = CD.semAcoes(stats) || CD.caido(stats)
        atq.title = atq.disabled ? 'Incapacitado ou a 0 PV' : 'Rola o ataque e o dano juntos' + (noMeuTurno(char) ? '; gasta a Ação no primeiro ataque' : '')
        atq.addEventListener('click', () => atacar(char, item, { tipo: 'acao' }))
        linha.appendChild(atq)
        const so = mk('button', 'ds-magia-btn', `🎲 Ataque ${dnd.sinal(a.bonus)}`)
        so.title = 'Só a jogada de ataque, sem gastar nada'
        so.addEventListener('click', () => rolagem.testeD20({ personagem: char.name, rotulo: `${a.nome} (ataque)`, bonus: a.bonus, tipo: 'ataque' }))
        linha.appendChild(so)
        if (!a.semDano) {
            const dano = mk('button', 'ds-magia-btn', '🎲 Dano')
            dano.addEventListener('click', () => rolagem.rolarDados({ personagem: char.name, rotulo: a.nome, expressao: a.expressao, bonus: a.bonusDano, tipo: 'dano', tipoDano: a.tipo, rerrolarAte: a.rerrolarAte }))
            linha.appendChild(dano)
            const crit = mk('button', 'ds-magia-btn', '✦ Crítico')
            crit.title = 'Dano com os dados dobrados'
            crit.addEventListener('click', () => rolagem.rolarDados({ personagem: char.name, rotulo: a.nome, expressao: a.expressao, bonus: a.bonusDano, multiplicador: 2, tipo: 'dano', tipoDano: a.tipo, extraPrimeiro: a.dadosCritExtra, rerrolarAte: a.rerrolarAte }))
            linha.appendChild(crit)
        }
        det.appendChild(linha)
    }

    // Mestre: quantidade e tirar da ficha
    if (mestre && item.base !== dnd.DESARMADO) {
        const linha = mk('div', 'da-mestre')
        const qtd = item.qtd || 1
        const menos = mk('button', 'sp-adj-btn', '−')
        menos.title = 'Uma a menos'
        menos.disabled = qtd <= 1
        menos.addEventListener('click', () => mudarArma(char, item.id, { qtd: qtd - 1 }))
        const mais = mk('button', 'sp-adj-btn', '+')
        mais.title = 'Uma a mais'
        mais.addEventListener('click', () => mudarArma(char, item.id, { qtd: qtd + 1 }))
        linha.appendChild(menos)
        linha.appendChild(mk('b', null, `×${qtd}`))
        linha.appendChild(mais)
        const tirar = mk('button', 'ds-magia-btn perigo', tirarArma === item.id ? 'Tirar mesmo?' : '✕ Tirar da ficha')
        tirar.addEventListener('click', () => {
            if (tirarArma !== item.id) { tirarArma = item.id; return abrirPainel(stats, true) }
            tirarArma = null
            sheet().gravar(char.id, { armas: (stats.armas || []).filter(x => x.id !== item.id) })
            chat(`O mestre tirou ${a.nome} de ${char.name}.`, '⚙ Sistema')
            abrirPainel(state.statPopupChar.stats, true)
        })
        linha.appendChild(tirar)
        det.appendChild(linha)
    }
    return det
}

function mudarArma(char, id, campos) {
    const stats = char.stats || {}
    sheet().gravar(char.id, { armas: (stats.armas || []).map(x => (x.id === id ? { ...x, ...campos } : x)) })
    abrirPainel(state.statPopupChar.stats, podeEditar(char))
}

/** Ataques da ação bônus que a ficha permite, com a arma em foco quando ela serve. */
function secaoBonus(char, stats, f, foco) {
    const lista = dnd.ataquesBonus(stats, f)
    const t = turnoDe(char)
    if (!lista.length && !t.rajada) return null
    const cb = combate()
    const ent = cb.entradaDoChar(char.id)
    const ec = ent ? cb.economia(ent.id) : null
    const emTurno = !!ec && noMeuTurno(char)
    const w = mk('div', 'da-secao')
    w.appendChild(mk('div', 'ds-grupo', 'Ação bônus'))
    const armas = dnd.armasDoPersonagem(stats)

    // Rajada de Golpes: o segundo golpe já foi pago
    if (t.rajada > 0) {
        const b = mk('button', 'ds-magia-btn principal', '⚔ Segundo golpe da Rajada')
        b.addEventListener('click', () => {
            t.rajada--
            atacar(char, armas[armas.length - 1], { tipo: 'livre', rotuloExtra: ' (Rajada de Golpes)' })
        })
        w.appendChild(b)
    }
    lista.forEach(bn => {
        const item = bn.armas.includes(foco.id) ? foco : armas.find(a => bn.armas.includes(a.id))
        if (!item) return
        const nomeArma = item.base === dnd.DESARMADO ? 'desarmado' : (item.nome || D.ARMAS[item.base].nome).toLowerCase()
        const b = mk('button', 'ds-magia-btn da-bonus', `⚔ ${bn.nome}` + (bn.armas.length > 1 || item.base !== dnd.DESARMADO ? ` · ${nomeArma}` : ''))
        let motivo = ''
        if (bn.recurso && !cb.recursoLivre(char, f, bn.recurso)) motivo = 'Sem usos restantes'
        else if (emTurno && ec.bonusUsada) motivo = 'A ação bônus já foi usada neste turno'
        else if (emTurno && bn.apos === 'ataque' && !t.atacou) motivo = 'Primeiro use a ação de Ataque'
        b.disabled = !!motivo
        b.title = motivo || bn.desc
        b.addEventListener('click', () => atacarBonus(char, bn, item))
        w.appendChild(b)
    })
    return w
}

/** O último ataque e os extras que dependem de ter acertado. */
function secaoUltimo(char, stats, f) {
    const u = ultimo
    const w = mk('div', 'da-ultimo' + (u.critico ? ' critico' : '') + (u.falha ? ' falha' : ''))
    w.appendChild(mk('div', 'ds-grupo', `Último ataque · ${u.ataque.nome}`))
    let linha = `${u.total} no ataque`
    if (u.falha) linha += ' · 1 natural, errou'
    else if (u.dano != null) linha += ` · ${u.dano} de dano`
    if (u.critico) linha += ' · ✦ crítico'
    w.appendChild(mk('div', 'da-ultimo-linha', linha))
    if (u.falha) return w

    const cb = combate()
    const emTurno = noMeuTurno(char)
    const t = turnoDe(char)
    const extras = dnd.extrasDoAcerto(stats, u.ataque, f)
    if (extras.length) w.appendChild(mk('div', 'ds-legenda', 'Se o mestre disser que acertou:'))
    extras.forEach(ex => {
        const row = mk('div', 'da-extra')
        let sel = null
        let mortoVivo = null
        let motivo = ''
        if (u.usados.has(ex.id)) motivo = 'Já usado neste ataque'
        else if (ex.uso === 'turno' && emTurno && t.usados.has(ex.id)) motivo = 'Uma vez por turno'
        else if (ex.recurso && !cb.recursoLivre(char, f, ex.recurso)) motivo = 'Sem usos restantes'
        if (ex.espaco) {
            const livres = cb.espacosLivres(stats, f, 1)
            if (!livres.length && !motivo) motivo = 'Sem espaço de magia'
            if (livres.length) {
                sel = document.createElement('select')
                sel.className = 'dc-select'
                sel.setAttribute('aria-label', 'Espaço de magia')
                livres.forEach(e => sel.appendChild(new Option(e.id === 'pacto' ? `Pacto ${e.nivel}º` : `${e.nivel}º · ${Math.min(5, 1 + e.nivel)}d8`, e.id)))
            }
        }
        const rotulo = ex.nome + (ex.dados && !ex.espaco ? ` +${ex.dados}${ex.noAtaque ? ' no ataque' : ''}` : '')
        const b = mk('button', 'ds-magia-btn', rotulo)
        b.disabled = !!motivo
        b.title = motivo || ex.desc || ''
        b.addEventListener('click', () => {
            const espaco = sel ? cb.espacosLivres(stats, f, 1).find(e => e.id === sel.value) : null
            usarExtra(char, ex, { espaco, mortoVivo: mortoVivo && mortoVivo.checked })
        })
        row.appendChild(b)
        if (sel) row.appendChild(sel)
        if (ex.espaco && sel) {
            const lbl = mk('label', 'dc-check')
            mortoVivo = document.createElement('input')
            mortoVivo.type = 'checkbox'
            lbl.appendChild(mortoVivo)
            lbl.appendChild(mk('span', null, 'Morto-vivo ou corruptor'))
            row.appendChild(lbl)
        }
        w.appendChild(row)
    })
    // Ataque Coordenado (Conclave da Besta, 5º): o companheiro ataca com a reação dele
    const companheiro = stats.classe === 'patrulheiro' && stats.subclasse === 'besta' && f.nivel >= 5
        && (stats.companheiros || []).find(x => x.tipo === 'companheiro')
    if (companheiro && u.ataque.item) {
        const ficha = CR.fichaDoAliado(companheiro, f)
        const at = ficha && ficha.ataques.find(x => x.tipo === 'corpo')
        if (at) {
            const usado = emTurno && t.usados.has('coordenado')
            const b = mk('button', 'ds-magia-btn', `🐾 ${ficha.nome} ataca (Ataque Coordenado)`)
            b.disabled = usado
            b.title = usado ? 'O companheiro já usou a reação' : 'Quando você usa a ação de Ataque, o companheiro ataca com a reação dele'
            b.addEventListener('click', () => {
                if (emTurno) t.usados.add('coordenado')
                ataqueDeCriatura(char, ficha.nome, at, { tipo: 'livre', rotuloExtra: ' (Ataque Coordenado)' })
            })
            w.appendChild(b)
        }
    }
    // Rajada do Rastreador: ao errar, outro ataque (uma vez por turno)
    if (stats.classe === 'patrulheiro' && stats.subclasse === 'rastreador' && f.nivel >= 11) {
        const usado = emTurno && t.usados.has('rajada-rastreador')
        const b = mk('button', 'ds-magia-btn', 'Errou? Rajada do Rastreador')
        b.disabled = usado
        b.title = usado ? 'Uma vez por turno' : 'Faz outro ataque com a mesma arma'
        b.addEventListener('click', () => {
            if (emTurno) t.usados.add('rajada-rastreador')
            atacar(char, u.ataque.item, { tipo: 'livre', rotuloExtra: ' (Rajada do Rastreador)' })
        })
        w.appendChild(b)
    }
    return w
}

// ── Mestre: dar arma ──────────────────────────────────────────────────────────

const novaId = () => 'a' + Math.random().toString(36).slice(2, 9)

function formDarArma(char, stats) {
    const w = mk('div', 'da-dar')
    if (!darArmaAberto) {
        const abrir = mk('button', 'ds-magia-btn', '+ Dar arma')
        abrir.title = 'Só o mestre dá e tira armas'
        abrir.addEventListener('click', () => { darArmaAberto = true; avisoDarArma = ''; abrirPainel(stats, true) })
        w.appendChild(abrir)
        if (avisoDarArma) w.appendChild(mk('div', 'ds-legenda', avisoDarArma))
        return w
    }
    w.appendChild(mk('div', 'ds-grupo', `Dar arma a ${char.name}`))
    const sel = document.createElement('select')
    sel.className = 'dc-select'
    sel.setAttribute('aria-label', 'Arma')
    const mesa = conteudo.armasDaMesa()
    if (mesa.length) {
        const g = document.createElement('optgroup')
        g.label = 'Armas da mesa'
        mesa.forEach(m => g.appendChild(new Option(m.nome, 'mesa:' + m.id)))
        sel.appendChild(g)
    }
    Object.entries(D.CATEGORIAS_ARMA).forEach(([cat, rot]) => {
        const g = document.createElement('optgroup')
        g.label = rot
        Object.entries(D.ARMAS).filter(([, a]) => a.cat === cat).forEach(([id, a]) => g.appendChild(new Option(`${a.nome} · ${D.textoPreco(a.preco)}`, id)))
        sel.appendChild(g)
    })
    w.appendChild(rotulado('Arma', sel))

    const campo = (rot, ph, tipo = 'text') => {
        const i = document.createElement('input')
        i.className = 'room-input'
        i.type = tipo
        if (ph) i.placeholder = ph
        i.addEventListener('keydown', e => e.stopPropagation())
        w.appendChild(rotulado(rot, i))
        return i
    }
    const nome = campo('Nome', 'opcional: Lâmina do Alvorecer')
    const bonus = document.createElement('select')
    bonus.className = 'dc-select'
    ;['Sem bônus', '+1', '+2', '+3'].forEach((t, i) => bonus.appendChild(new Option(t, String(i))))
    w.appendChild(rotulado('Bônus mágico (ataque e dano)', bonus))
    const extra = campo('Dano extra', 'opcional: 1d6 fogo')
    const qtd = campo('Quantidade', '', 'number')
    qtd.min = '1'
    qtd.value = '1'
    const nota = campo('Nota', 'opcional')
    const lbl = mk('label', 'dc-check')
    const guardar = document.createElement('input')
    guardar.type = 'checkbox'
    lbl.appendChild(guardar)
    lbl.appendChild(mk('span', null, 'Guardar no catálogo da mesa'))
    w.appendChild(lbl)
    // Compra: o preço do livro sai da bolsa do grupo
    const lblCobrar = mk('label', 'dc-check')
    const cobrar = document.createElement('input')
    cobrar.type = 'checkbox'
    lblCobrar.appendChild(cobrar)
    const txtCobrar = mk('span', null, '')
    lblCobrar.appendChild(txtCobrar)
    w.appendChild(lblCobrar)
    const atualizarPreco = () => {
        const base = D.ARMAS[sel.value]
        txtCobrar.textContent = base ? `Cobrar ${D.textoPreco(base.preco)} da bolsa do grupo` : 'Cobrar da bolsa do grupo'
        lblCobrar.style.display = base ? '' : 'none'
    }
    sel.addEventListener('change', atualizarPreco)
    atualizarPreco()
    const erro = mk('div', 'da-alerta')
    erro.setAttribute('role', 'alert')
    w.appendChild(erro)

    // Arma da mesa já vem pronta: os campos de personalizar não valem para ela
    const travar = () => {
        const daMesa = sel.value.startsWith('mesa:')
        ;[nome, bonus, extra, nota, guardar].forEach(x => { x.disabled = daMesa })
    }
    sel.addEventListener('change', travar)
    travar()

    const linha = mk('div', 'ds-magia-botoes')
    const dar = mk('button', 'ds-magia-btn principal', `Dar a ${char.name}`)
    dar.addEventListener('click', () => {
        const n = Math.max(1, Math.min(99, parseInt(qtd.value, 10) || 1))
        let item
        if (sel.value.startsWith('mesa:')) {
            const m = mesa.find(x => 'mesa:' + x.id === sel.value)
            item = { id: novaId(), base: m.base, qtd: n, nome: m.nome, bonus: m.bonus || 0, dano: m.dano, tipoDano: m.tipoDano, danoExtra: m.danoExtra, nota: m.nota }
        } else {
            const textoExtra = extra.value.trim()
            if (textoExtra && !/^(\d+d\d+|\d+)(\s+\S.*)?$/.test(textoExtra)) {
                erro.textContent = 'Escreva o dano extra como "1d6 fogo".'
                return extra.focus()
            }
            const b = parseInt(bonus.value, 10) || 0
            const base = D.ARMAS[sel.value]
            item = { id: novaId(), base: sel.value, qtd: n }
            if (nome.value.trim()) item.nome = nome.value.trim().slice(0, 60)
            else if (b) item.nome = `${base.nome} +${b}`
            if (b) item.bonus = b
            if (textoExtra) item.danoExtra = textoExtra.slice(0, 30)
            if (nota.value.trim()) item.nota = nota.value.trim().slice(0, 200)
        }
        Object.keys(item).forEach(k => { if (item[k] == null || item[k] === '') delete item[k] })
        sheet().gravar(char.id, { armas: [...(Array.isArray(stats.armas) ? stats.armas : []), item] })
        const nomeArma = item.nome || D.ARMAS[item.base].nome
        chat(`O mestre deu ${n > 1 ? `${n} × ` : ''}${nomeArma} a ${char.name}.`, '⚙ Sistema')
        if (cobrar.checked && D.ARMAS[sel.value]) require('./dndBolsa').cobrar(D.ARMAS[sel.value].preco * n, `${n > 1 ? `${n} × ` : ''}${nomeArma} para ${char.name}`)
        armaEmFoco[char.id] = item.id
        darArmaAberto = false
        avisoDarArma = ''
        const personalizada = item.nome || item.bonus || item.danoExtra
        if (guardar.checked && !guardar.disabled && personalizada) {
            avisoDarArma = 'Guardando no catálogo da mesa…'
            conteudo.salvarArmaDaMesa({ ...item, id: 'mesa-' + novaId(), nome: nomeArma }).then(err => {
                avisoDarArma = err ? `Não deu para guardar no catálogo (${err}). Rode sql/dnd/02_armas.sql no Supabase.` : `${nomeArma} entrou no catálogo da mesa.`
                if (state.statPopupChar && state.statPopupChar.id === char.id) redesenhar(char)
            })
        }
        abrirPainel(state.statPopupChar.stats, true)
    })
    linha.appendChild(dar)
    const cancelar = mk('button', 'ds-magia-btn', 'Cancelar')
    cancelar.addEventListener('click', () => { darArmaAberto = false; abrirPainel(stats, true) })
    linha.appendChild(cancelar)
    w.appendChild(linha)
    return w
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Pacote inicial ───────────────────────────────────────────────────────────
// Usado no passo Equipamento da criação e na ficha de quem foi criado antes.
// ══════════════════════════════════════════════════════════════════════════════

const LETRAS = 'abcdef'

/** Grupos (a)/(b)/(c) da classe; as respostas vão para alvo.pacote. */
function pacoteUI(alvo, aoMudar) {
    const w = mk('div', 'da-pacote')
    const grupos = dnd.gruposDoPacote(alvo)
    const f = dnd.calcular(alvo)
    if (!alvo.pacote) {
        // Começa com a primeira opção que vale em cada grupo
        alvo.pacote = { escolha: grupos.map(g => Math.max(0, g.findIndex(o => dnd.opcaoDoPacoteValida(alvo, o, f)))), armas: {} }
    }
    const p = alvo.pacote
    if (!p.armas) p.armas = {}

    // Ouro inicial no lugar do pacote (LdJ p. 143): rola uma vez e compra depois
    const riqueza = dnd.RIQUEZA_INICIAL[alvo.classe]
    if (riqueza) {
        const [qtd, mult] = riqueza
        const modos = mk('div', 'dc-asi-abas')
        ;[['pacote', 'Pacote do livro'], ['ouro', `Ouro inicial (${qtd}d4${mult > 1 ? ` × ${mult}` : ''} po)`]].forEach(([id, rot]) => {
            const b = mk('button', 'dc-aba' + ((p.modo || 'pacote') === id ? ' on' : ''), rot)
            b.type = 'button'
            b.addEventListener('click', () => { p.modo = id; aoMudar() })
            modos.appendChild(b)
        })
        w.appendChild(modos)
        if (p.modo === 'ouro') {
            const box = mk('div', 'da-grupo')
            box.appendChild(mk('div', 'ds-legenda', 'No lugar do pacote da classe e do antecedente, o personagem começa só com ouro, que vai para a bolsa do grupo; o mestre vende o equipamento depois.'))
            if (p.ouro) box.appendChild(mk('div', 'da-ultimo-linha', `💰 ${p.ouro} po (rolado: ${p.ouroDados || '—'})`))
            else {
                const rolar = mk('button', 'ds-magia-btn principal', `🎲 Rolar ${qtd}d4${mult > 1 ? ` × ${mult}` : ''}`)
                rolar.addEventListener('click', () => {
                    const dados = Array.from({ length: qtd }, () => 1 + Math.floor(Math.random() * 4))
                    p.ouro = dados.reduce((s, x) => s + x, 0) * mult
                    p.ouroDados = dados.join(', ')
                    if (state.socket) state.socket.emit('chat_message', { playerName: '🎲 Dados', message: `Ouro inicial: ${qtd}d4(${p.ouroDados})${mult > 1 ? ` × ${mult}` : ''} = ${p.ouro} po`, type: 'roll' })
                    aoMudar()
                })
                box.appendChild(rolar)
            }
            w.appendChild(box)
            return w
        }
    }

    grupos.forEach((grupo, g) => {
        const fixo = grupo.length === 1
        const bloco = mk('div', 'da-grupo' + (fixo ? ' fixo' : ''))
        bloco.appendChild(mk('div', 'da-grupo-titulo', fixo ? 'Também recebe' : `Escolha ${g + 1}`))
        grupo.forEach((o, i) => {
            const on = fixo || p.escolha[g] === i
            const valida = dnd.opcaoDoPacoteValida(alvo, o, f)
            const linha = mk('div', 'da-opcao-linha')
            const b = mk('button', 'da-opcao' + (on ? ' on' : ''))
            b.type = 'button'
            b.disabled = fixo || (!valida && !on)
            if (!fixo) {
                b.setAttribute('role', 'radio')
                b.setAttribute('aria-checked', String(on))
                b.appendChild(mk('span', 'da-opcao-letra', `(${LETRAS[i]})`))
            }
            const icones = (o.armas || []).map(a => D.ARMAS[Array.isArray(a) ? a[0] : a].icone)
            if (o.escolher) icones.push('lorc/crossed-swords')
            if (icones.length) b.appendChild(magiasUI.icone(icones[0]))
            b.appendChild(mk('span', 'da-opcao-nome', dnd.rotuloDaOpcao(o)))
            if (!valida) b.appendChild(mk('span', 'dc-opcao-motivo', 'pede proficiência'))
            b.addEventListener('click', () => {
                if (p.escolha[g] === i) return
                p.escolha[g] = i
                Object.keys(p.armas).forEach(k => { if (k.startsWith(`${g}:`)) delete p.armas[k] })
                aoMudar()
            })
            linha.appendChild(b)

            // "Qualquer arma ...": um seletor por arma
            if (on && o.escolher) {
                o.escolher.forEach((e, k) => {
                    const chave = `${g}:${k}`
                    const valores = p.armas[chave] || []
                    for (let q = 0; q < (e.qtd || 1); q++) {
                        const s = document.createElement('select')
                        s.className = 'dc-select da-escolher'
                        s.setAttribute('aria-label', 'Arma')
                        s.appendChild(new Option('Escolha a arma…', ''))
                        dnd.armasParaEscolher(e).forEach(x => {
                            const prof = f.proficiencias.categoriasArma.includes(D.ARMAS[x.id].cat) || f.proficiencias.armas.includes(x.id)
                            s.appendChild(new Option(x.nome + (prof ? '' : ' · sem proficiência'), x.id))
                        })
                        s.value = valores[q] || ''
                        s.addEventListener('change', () => {
                            const novo = (p.armas[chave] || []).slice()
                            novo[q] = s.value
                            p.armas[chave] = novo
                            aoMudar()
                        })
                        linha.appendChild(s)
                    }
                })
            }
            bloco.appendChild(linha)
        })
        w.appendChild(bloco)
    })

    const ant = D.EQUIPAMENTO_ANTECEDENTE[alvo.antecedente]
    if (ant) {
        const bloco = mk('div', 'da-grupo fixo')
        bloco.appendChild(mk('div', 'da-grupo-titulo', 'Do antecedente'))
        const itens = [...(ant.armas || []).map(id => D.ARMAS[id].nome), ...(ant.itens || [])]
        bloco.appendChild(mk('div', 'ds-caract-desc', itens.join(', ')))
        w.appendChild(bloco)
    }
    return w
}

/** O que a ficha ficaria com o pacote escolhido: armas com ataque e dano, e a CA. */
function previaDoPacote(alvo) {
    const w = mk('div', 'da-previa')
    if (dnd.faltaNoPacote(alvo)) return w
    const s = dnd.aplicarPacote(JSON.parse(JSON.stringify(alvo)))
    const f = dnd.calcular(s)
    w.appendChild(mk('div', 'ds-grupo', 'Como fica'))
    dnd.armasDoPersonagem(s).forEach(item => {
        const a = dnd.ataqueComArma(s, item, {}, f)
        const linha = mk('div', 'da-previa-arma')
        linha.appendChild(magiasUI.icone(a.icone))
        linha.appendChild(mk('span', null, a.nome + ((item.qtd || 1) > 1 ? ` ×${item.qtd}` : '')))
        linha.appendChild(mk('b', null, `${dnd.sinal(a.bonus)} · ${dnd.textoDoDano(a)}`))
        w.appendChild(linha)
    })
    w.appendChild(mk('div', 'ds-extras', `CA ${f.ca}: ${f.caDetalhe}`))
    return w
}

function desenharPacotePendente(body, char, stats, meu) {
    body.appendChild(mk('div', 'ds-caract-desc', 'Este personagem foi criado antes das armas.'))
    if (!meu) {
        body.appendChild(mk('div', 'ds-legenda', 'O jogador escolhe o equipamento inicial do livro por aqui. Se você der uma arma antes, essa escolha some.'))
        return
    }
    body.appendChild(mk('div', 'ds-legenda', 'Escolha o equipamento inicial do livro (classe e antecedente). Depois disso, armas novas vêm do mestre.'))
    let r = rascunhoPacote[char.id]
    if (!r) r = rascunhoPacote[char.id] = { ...JSON.parse(JSON.stringify(stats)), pacote: null }
    const redesenharAqui = () => abrirPainel(state.statPopupChar.stats, true)
    body.appendChild(pacoteUI(r, redesenharAqui))
    body.appendChild(previaDoPacote(r))
    const falta = dnd.faltaNoPacote(r)
    const ok = mk('button', 'ds-magia-btn principal', 'Confirmar equipamento')
    ok.disabled = !!falta
    ok.title = falta || 'Grava as armas, a armadura e os itens na ficha'
    ok.addEventListener('click', () => {
        if (dnd.faltaNoPacote(r)) return
        const novo = dnd.aplicarPacote(JSON.parse(JSON.stringify(r)))
        const ca = dnd.calcular({ ...stats, armaduras: novo.armaduras, equipamento: novo.equipamento }).ca
        sheet().gravar(char.id, {
            armas: novo.armas, itens: novo.itens, armaduras: novo.armaduras, equipamento: novo.equipamento, ca,
            moedas_iniciais: novo.moedas_iniciais || {},
        })
        delete rascunhoPacote[char.id]
        // Itens para o Inventário e o ouro para a bolsa do grupo
        require('./dndItens').entregarDaFicha(state.playerCharacters.find(c => c.id === char.id) || char).catch(() => {})
        require('./dndBolsa').entregarMoedasIniciais()
        sheet().reabrirFicha()
        abrirPainel(state.statPopupChar.stats, true)
    })
    body.appendChild(ok)
    if (falta) body.appendChild(mk('div', 'ds-legenda', falta))
}

// ── Peças ─────────────────────────────────────────────────────────────────────

function numero(rotulo, valor) {
    const n = mk('div', 'da-numero')
    n.appendChild(mk('b', null, valor))
    n.appendChild(mk('span', null, rotulo))
    return n
}

function rotulado(rotulo, campo) {
    const w = mk('label', 'da-campo')
    w.appendChild(mk('span', 'input-label', rotulo))
    w.appendChild(campo)
    return w
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = {
    abrirPainel, atacar, ataqueDeCriatura, usarAtaqueDaAcao, pacoteUI, previaDoPacote, aoFimDaBatalha, ataquesRestantes,
    // usados pelo palco da batalha (dndCena.js)
    secaoBonus, secaoUltimo, efeitosDisponiveis, alternarEfeito, turnoDe,
    temUltimo: charId => !!ultimo && ultimo.charId === charId,
}
