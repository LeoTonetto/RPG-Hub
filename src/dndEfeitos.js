// ══════════════════════════════════════════════════════════════════════════════
// src/dndEfeitos.js — EFEITOS EM ALIADOS E MARCAS EM CRIATURAS (D&D)
//
// Decidido com o mestre (2026-11-03):
//   • quem conjura ou usa a habilidade escolhe os alvos, e o efeito aparece no
//     card deles; o que cada um faz está em dndDados (EFEITOS e MARCAS);
//   • bônus fixos entram sozinhos (Bênção +1d4, Escudo da Fé +2 CA, Ajuda,
//     Velocidade, Arma Mágica, auras); o dado guardado (Inspiração de Bardo,
//     Orientação, Resistência) o app oferece depois do d20, e o dono decide;
//   • na batalha, o que dura até 1 minuto conta em rodadas (acaba no começo
//     do turno de quem conjurou, 10 rodadas depois) e cai com a concentração;
//     fora da batalha dura até alguém tirar ou até o descanso que passe da
//     duração;
//   • as auras do paladino: ele marca quem está perto.
//
// Quem grava: o servidor só deixa o dono (e o mestre) mexer na ficha. Por
// isso o efeito vai pelo servidor ('dnd_efeito') e o app do DONO do alvo
// grava em stats.efeitos_recebidos — um escritor só, ninguém sobrescreve
// ninguém. As marcas em criaturas ficam na ficha de quem lançou (stats.marcas),
// e quem o paladino pôs na aura, na ficha dele (stats.aura_aliados).
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const D = require('./dndDados')

const combate = () => require('./dndCombate')
const sheet = () => require('./dndSheet')
const estado = () => require('./dndEstadoUI')

const uid = () => Math.random().toString(36).slice(2, 10)
const dado = lados => 1 + Math.floor(Math.random() * lados)
const meu = id => state.playerCharacters.find(c => c.id === id) || null
const charPorId = id => estado().charPorId(id)

function chat(message, playerName = '✦ Magia') {
    if (state.socket) state.socket.emit('chat_message', { playerName, message, type: 'text' })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Duração ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Na batalha, até 1 minuto: acaba no começo do turno de quem conjurou, 10 rodadas depois. */
function expiracao(def, fonte) {
    const cb = combate()
    if (!cb.emBatalha() || !def.minutos || def.minutos > 1) return null
    const ent = cb.entradaDoChar(fonte.id) || cb.entradaAtual()
    return { rodada: state.combate.rodada + def.minutos * 10, entrada: ent ? ent.id : null }
}

function expirou(exp) {
    if (!exp) return false
    // Contava em rodadas e a batalha acabou: acaba junto
    if (!combate().emBatalha()) return true
    const r = state.combate.rodada
    if (r !== exp.rodada) return r > exp.rodada
    const idx = state.combate.ordem.findIndex(e => e.id === exp.entrada)
    return idx < 0 || state.combate.turno >= idx
}

/** A concentração de quem conjurou ainda segura o efeito? */
function concAtiva(conc, fonteId) {
    if (!conc) return true
    const fonte = charPorId(fonteId)
    if (!fonte) return true   // quem conjurou saiu da sala: fica até alguém tirar
    const c = (fonte.stats || {}).concentracao
    return !!c && c.id === conc
}

function ativo(e) {
    return !!D.EFEITOS[e.tipo] && !expirou(e.expira) && concAtiva(e.conc, e.fonte)
}

/** Os efeitos em vigor no personagem (para card, ficha e rolagens). */
function ativos(stats) {
    return (stats.efeitos_recebidos || []).filter(ativo)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Aplicar e tirar ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Põe o efeito nos alvos. fonte: quem conjurou ou usou; alvos: [charId].
 *   opts: { nivel, dado, valor, armas: { charId: armaId }, bravura, silencioso }
 */
function aplicar(fonte, tipo, alvos, opts = {}) {
    const def = D.EFEITOS[tipo]
    if (!def || !alvos.length) return
    alvos.forEach(id => enviar({ acao: 'add', charId: id, efeito: {
        uid: uid(), tipo, fonte: fonte.id, fonteNome: fonte.name,
        nivel: opts.nivel || null, dado: opts.dado || def.dado || null, valor: opts.valor ?? null,
        armaId: (opts.armas || {})[id] || null, bravura: !!opts.bravura,
        conc: def.conc ? def.magia : null, minutos: def.minutos || null, expira: expiracao(def, fonte),
    } }))
    if (!opts.silencioso) chat(`${def.icone} ${fonte.name}: ${def.nome} em ${alvos.map(id => (charPorId(id) || {}).name || '?').join(', ')}.`)
}

/** Tira um efeito (pelo uid, ou o tipo que veio de uma fonte: as auras). */
function remover(charId, { uid: id, tipo, fonte }) {
    enviar({ acao: 'remove', charId, uid: id || null, tipo: tipo || null, fonte: fonte || null })
}

/** O dono grava; para o personagem de outro jogador, vai pelo servidor. */
function enviar(p) {
    if (meu(p.charId)) return aoReceber(p)
    if (state.socket) state.socket.emit('dnd_efeito', p)
}

/** Chegou um efeito para um personagem meu (do servidor, ou meu mesmo). */
function aoReceber(p) {
    const char = meu(p.charId)
    if (!char) return
    const lista = (char.stats || {}).efeitos_recebidos || []
    if (p.acao === 'add' && p.efeito && D.EFEITOS[p.efeito.tipo]) {
        // A mesma magia (ou aura) de quem já tinha posto: fica a nova
        const e = p.efeito
        gravarLista(char, [...lista.filter(x => !(x.tipo === e.tipo && x.fonte === e.fonte)), e])
    } else if (p.acao === 'remove') {
        gravarLista(char, lista.filter(x => !(p.uid ? x.uid === p.uid : x.tipo === p.tipo && x.fonte === p.fonte)))
    }
}

/** Grava a lista nova; a Ajuda mexe nos PV atuais, e a Velocidade avisa quando acaba. */
function gravarLista(char, nova) {
    const st = char.stats || {}
    const antes = dnd.calcular(st)
    const depois = dnd.calcular({ ...st, efeitos_recebidos: nova })
    const campos = { efeitos_recebidos: nova }
    // Ajuda: os PV atuais sobem junto; quando acaba, não passam do máximo novo
    if (depois.pvAjuda > antes.pvAjuda) campos.hp = (st.hp ?? antes.pvMax) + (depois.pvAjuda - antes.pvAjuda)
    else if (depois.pvAjuda < antes.pvAjuda) campos.hp = Math.min(st.hp ?? depois.pvMax, depois.pvMax)
    const tinhaVelocidade = (st.efeitos_recebidos || []).some(e => e.tipo === 'velocidade')
    sheet().gravar(char.id, campos)
    if (tinhaVelocidade && !nova.some(e => e.tipo === 'velocidade')) {
        chat(`⚡ A Velocidade de ${char.name} acaba: não se move nem age até depois do próximo turno dele.`, '⚔ Batalha')
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── O que acabou (cada dono limpa os seus) ───────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Tira dos meus personagens o que acabou: rodadas, concentração de quem
 * conjurou, fim da batalha. Chamado a cada mudança da batalha e quando
 * alguém muda de concentração.
 */
function limparMeus() {
    state.playerCharacters.forEach(char => {
        const st = char.stats || {}
        const lista = st.efeitos_recebidos || []
        const vivos = lista.filter(ativo)
        if (vivos.length !== lista.length) gravarLista(char, vivos)
        // As marcas que ele lançou: só na batalha, até acabar o tempo ou a concentração
        const marcas = st.marcas || []
        const vivas = combate().emBatalha() ? marcas.filter(m => !expirou(m.expira) && concAtiva(m.conc, char.id)) : []
        if (vivas.length !== marcas.length) sheet().gravar(char.id, { marcas: vivas })
    })
}

/** Começo do turno de um personagem meu: Heroísmo dá os PV temporários. */
function aoComecarTurno(char) {
    const st = char.stats || {}
    const h = ativos(st).filter(e => e.tipo === 'heroismo').reduce((m, e) => Math.max(m, e.valor || 0), 0)
    if (h > (st.hp_temp || 0)) {
        sheet().gravar(char.id, { hp_temp: h })
        chat(`🦁 Heroísmo: ${char.name} fica com ${h} PV temporários.`, '⚔ Batalha')
    }
}

/** Descanso: some o que dura até 1 hora (curto) ou até 8 horas (longo). As auras ficam. */
function aoDescansar(char, tipo) {
    if (!meu(char.id)) return
    const limite = tipo === 'longo' ? 480 : 60
    const lista = (char.stats || {}).efeitos_recebidos || []
    const fica = lista.filter(e => !e.minutos || e.minutos > limite)
    if (fica.length !== lista.length) gravarLista(char, fica)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Dado guardado: depois do d20 ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Depois de um d20 meu (dndRolagem): oferece o que pode somar. Pelo livro, o
 * jogador decide depois de ver o dado e antes de o mestre dizer se passou.
 */
function aoRolar(res) {
    const char = state.playerCharacters.find(c => c.name === res.personagem)
    if (!char) return
    const st = char.stats || {}
    const f = dnd.calcular(st)
    const cb = combate()
    const ctx = res.contexto
    const total = res.ataque ? res.ataque.total : res.total
    const ops = []
    ativos(st).forEach(e => {
        const def = D.EFEITOS[e.tipo]
        if (!def.guardado || !e.dado) return
        if (def.guardado.includes(ctx)) ops.push({ rotulo: `${def.nome} (+1${e.dado})`, nome: def.nome, dado: e.dado, usar: () => remover(char.id, { uid: e.uid }) })
        // Inspiração em Combate (bardo da Bravura): também no dano de arma
        if (e.tipo === 'inspiracao-bardo' && e.bravura && res.arma && !res.falha) {
            ops.push({ rotulo: `Inspiração no dano (+1${e.dado})`, nome: 'Inspiração em Combate', dado: e.dado, noDano: true, usar: () => remover(char.id, { uid: e.uid }) })
        }
    })
    // Ataque Dirigido (clérigo da Guerra, 2º): +10 no próprio ataque, com Canalizar Divindade
    if (ctx === 'ataque' && st.classe === 'clerigo' && st.subclasse === 'guerra' && f.nivel >= 2 && cb.recursoLivre(char, f, 'canalizar')) {
        ops.push({ rotulo: 'Ataque Dirigido (+10)', nome: 'Ataque Dirigido', fixo: 10, usar: () => cb.gastarRecurso(char, 'canalizar') })
    }
    // Sorte do Próprio Obscuro (bruxo do Corruptor, 6º): +1d10 num teste ou resistência
    if (['pericia', 'atributo', 'resistencia', 'iniciativa'].includes(ctx) && st.classe === 'bruxo' && st.subclasse === 'corruptor'
        && f.nivel >= 6 && cb.recursoLivre(char, f, 'sorte-obscuro')) {
        ops.push({ rotulo: 'Sorte do Obscuro (+1d10)', nome: 'Sorte do Próprio Obscuro', dado: 'd10', usar: () => cb.gastarRecurso(char, 'sorte-obscuro') })
    }
    if (!ops.length) return
    cb.perguntar({
        titulo: `${char.name} tirou ${total}`,
        texto: 'Somar um dado guardado? Decida antes de o mestre dizer se passou.',
        opcoes: ops.map(o => ({ rotulo: o.rotulo, acao: () => somar(char, res, o, total) })),
    })
}

function somar(char, res, o, total) {
    o.usar()
    const v = o.fixo || dado(parseInt(o.dado.slice(1), 10))
    const base = o.noDano ? res.total : total
    const quanto = o.fixo ? `+${v}` : `1${o.dado} = ${v}`
    chat(`${char.name} soma ${quanto} (${o.nome})${o.noDano ? ' no dano' : ''}: ${base} → ${base + v}.`, '🎲 Dados')
}

// ── Prodígio (mago adivinho): troca um d20 por um dos valores do dia ──

const d20Guardado = {}   // nome do personagem → valor para o próximo d20 dele

/** Usa o valor i de stats.prodigio: no próximo d20 do próprio adivinho, ou avisa a mesa. */
function usarProdigio(char, i, noMeu) {
    const st = (meu(char.id) || char).stats || {}
    const valores = [...(st.prodigio || [])]
    const v = valores[i]
    if (!v) return
    valores.splice(i, 1)
    sheet().gravar(char.id, { prodigio: valores, recursos_usados: { ...(st.recursos_usados || {}), prodigio: ((st.recursos_usados || {}).prodigio || 0) + 1 } })
    if (noMeu) {
        d20Guardado[char.name] = v
        chat(`🔮 ${char.name} usa Prodígio: o próximo d20 dele será ${v}.`)
    } else {
        chat(`🔮 ${char.name} usa Prodígio: a próxima jogada de ataque, teste ou resistência que ele escolher (de outra criatura) vira ${v} no d20.`)
    }
}

/** dndRolagem pergunta antes de rolar: há um d20 guardado para este personagem? */
function tirarD20Guardado(personagem) {
    const v = d20Guardado[personagem]
    delete d20Guardado[personagem]
    return v || null
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Magias e habilidades que põem efeito ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** O grupo (personagens de D&D na sala), para escolher os alvos. */
function grupo() {
    const vistos = new Set()
    return state.allCharsCache.filter(e => e.character.system === 'dnd').map(e => e.character)
        .concat(state.playerCharacters.filter(c => c.system === 'dnd'))
        .filter(c => !vistos.has(c.id) && vistos.add(c.id))
        .map(c => ({ id: c.id, nome: c.name }))
}

/** Conjurou uma magia: se ela põe efeito ou marca, pergunta os alvos. */
function aoConjurar(char, magia, nivel) {
    const tipo = Object.keys(D.EFEITOS).find(k => D.EFEITOS[k].magia === magia.id)
    if (tipo) return lancar(char, tipo, { nivel })
    const marca = Object.keys(D.MARCAS).find(k => D.MARCAS[k].magia === magia.id)
    if (marca) return marcar(char, marca, { nivel })
    return null
}

async function lancar(char, tipo, opts = {}) {
    const def = D.EFEITOS[tipo]
    if (def.soEmSi) return aplicar(char, tipo, [char.id], opts)
    const max = def.alvos(opts.nivel || 1)
    const opcoes = grupo().filter(o => def.si || o.id !== char.id)
    const r = await escolher({
        titulo: def.nome, texto: `${def.desc} Até ${max === 1 ? '1 alvo' : `${max} alvos`}.`, max, opcoes,
        armasDe: def.comArma ? id => dnd.armasDoPersonagem((charPorId(id) || {}).stats || {}).filter(a => a.base !== dnd.DESARMADO)
            .map(a => ({ id: a.id, nome: a.nome || (D.ARMAS[a.base] || {}).nome || a.base })) : null,
    })
    if (!r || !r.ids.length) return
    // Heroísmo: os PV temporários de cada turno são o atributo de magia de quem conjurou
    const f = dnd.calcular(char.stats || {})
    const valor = tipo === 'heroismo' && f.conjuracao ? f.mods[f.conjuracao.atributo] : opts.valor
    aplicar(char, tipo, r.ids, { ...opts, valor, armas: r.armas })
}

// ── Marcas em criaturas (Perdição, Marca do Caçador, Bruxaria, Voto de Inimizade) ──

function criaturasDaBatalha() {
    return combate().emBatalha() ? state.combate.ordem.filter(e => e.tipo === 'criatura' && !e.charId) : []
}

async function marcar(char, tipo, opts = {}) {
    const def = D.MARCAS[tipo]
    const criaturas = criaturasDaBatalha()
    // Fora da batalha não há criatura no palco: fica só o aviso
    if (!criaturas.length) { chat(`${def.icone} ${char.name}: ${def.nome}. ${def.desc}`); return }
    const max = def.alvos(opts.nivel || 1)
    const r = await escolher({ titulo: def.nome, texto: `${def.desc} Até ${max === 1 ? '1 criatura' : `${max} criaturas`}.`, max, opcoes: criaturas.map(e => ({ id: e.id, nome: e.nome })) })
    if (!r || !r.ids.length) return
    const st = (meu(char.id) || char).stats || {}
    // A mesma magia de novo substitui a anterior
    const marcas = (st.marcas || []).filter(m => m.tipo !== tipo)
    marcas.push({ uid: uid(), tipo, alvos: r.ids, conc: def.conc ? def.magia : null, expira: expiracao(def, char), nivel: opts.nivel || null })
    sheet().gravar(char.id, { marcas })
    chat(`${def.icone} ${char.name}: ${def.nome} em ${r.ids.map(id => (criaturas.find(e => e.id === id) || {}).nome).join(', ')}.`)
}

/** Marca do Caçador e Bruxaria: o alvo caiu, a marca vai para outra criatura (ação bônus). */
async function moverMarca(char, tipo) {
    const st = (meu(char.id) || char).stats || {}
    const m = (st.marcas || []).find(x => x.tipo === tipo)
    if (!m) return
    const def = D.MARCAS[tipo]
    const criaturas = criaturasDaBatalha()
    const r = await escolher({ titulo: `Mover ${def.nome}`, texto: 'Para qual criatura?', max: 1, opcoes: criaturas.map(e => ({ id: e.id, nome: e.nome })) })
    if (!r || !r.ids.length) return
    sheet().gravar(char.id, { marcas: (st.marcas || []).map(x => (x.uid === m.uid ? { ...x, alvos: r.ids } : x)) })
    chat(`${def.icone} ${char.name} move ${def.nome} para ${(criaturas.find(e => e.id === r.ids[0]) || {}).nome}.`)
}

/** As marcas que alguém pôs nesta criatura: [{ tipo, def, dono }]. */
function marcasDaCriatura(entradaId) {
    const out = []
    const vistos = new Set()
    state.allCharsCache.map(e => e.character).concat(state.playerCharacters).forEach(c => {
        if (vistos.has(c.id)) return
        vistos.add(c.id)
        ;((c.stats || {}).marcas || []).forEach(m => {
            if (D.MARCAS[m.tipo] && (m.alvos || []).includes(entradaId) && !expirou(m.expira) && concAtiva(m.conc, c.id)) {
                out.push({ tipo: m.tipo, def: D.MARCAS[m.tipo], dono: c.name })
            }
        })
    })
    return out
}

// ── Auras do paladino ──

/** O paladino marca quem está perto (3 m; 9 m no 18º). */
async function escolherAura(paladino) {
    const st = (meu(paladino.id) || paladino).stats || {}
    const f = dnd.calcular(st)
    if (st.classe !== 'paladino' || f.nivel < 6) return
    const atuais = st.aura_aliados || []
    const raio = f.nivel >= 18 ? '9 m' : '3 m'
    const r = await escolher({
        titulo: 'Aura do paladino', max: 99, marcados: atuais,
        texto: `Quem está a até ${raio} de ${paladino.name}? Ganha +${Math.max(1, f.mods.car)} nas resistências${f.nivel >= 10 ? ' e não pode ser amedrontado' : ''}.`,
        opcoes: grupo().filter(o => o.id !== paladino.id),
    })
    if (!r) return
    const valor = Math.max(1, f.mods.car)
    r.ids.forEach(id => {
        aplicar(paladino, 'aura-protecao', [id], { valor, silencioso: true })
        if (f.nivel >= 10) aplicar(paladino, 'aura-coragem', [id], { silencioso: true })
    })
    atuais.filter(id => !r.ids.includes(id)).forEach(id => {
        remover(id, { tipo: 'aura-protecao', fonte: paladino.id })
        remover(id, { tipo: 'aura-coragem', fonte: paladino.id })
    })
    sheet().gravar(paladino.id, { aura_aliados: r.ids })
    const nomes = r.ids.map(id => (charPorId(id) || {}).name).filter(Boolean)
    chat(`🔆 Aura de ${paladino.name}: ${nomes.length ? nomes.join(', ') : 'ninguém por perto'}.`)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Tela ─────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Janela de escolher alvos. Devolve uma Promise com { ids, armas } (ou null
 * se fechou). armasDe(id): as armas do alvo (Arma Mágica); marcados: já vêm
 * ligados (aura).
 */
function escolher({ titulo, texto, max, opcoes, armasDe, marcados }) {
    return new Promise(resolve => {
        document.getElementById('dndAlvos')?.remove()
        const ov = mk('div', 'cb-overlay')
        ov.id = 'dndAlvos'
        sheet().segurarCliques(ov)
        const card = mk('div', 'connect-card cb-anuncio de-alvos')
        const fim = valor => { ov.remove(); resolve(valor) }
        const fechar = mk('button', 'char-modal-close-btn', '✕')
        fechar.addEventListener('click', () => fim(null))
        card.appendChild(fechar)
        card.appendChild(mk('h1', 'card-title', titulo))
        if (texto) card.appendChild(mk('div', 'de-alvos-texto', texto))
        const lista = mk('div', 'de-alvos-lista')
        const linhas = opcoes.map(o => {
            const l = mk('label', 'dc-check de-alvo')
            const c = document.createElement('input')
            c.type = 'checkbox'
            c.checked = (marcados || []).includes(o.id)
            l.appendChild(c)
            l.appendChild(mk('span', null, o.nome))
            let sel = null
            if (armasDe) {
                const armas = armasDe(o.id)
                sel = document.createElement('select')
                sel.className = 'dc-select'
                sel.setAttribute('aria-label', `Arma de ${o.nome}`)
                armas.forEach(a => sel.appendChild(new Option(a.nome, a.id)))
                if (!armas.length) { c.disabled = true; l.title = 'Sem arma' }
                l.appendChild(sel)
            }
            lista.appendChild(l)
            return { o, c, sel }
        })
        if (!opcoes.length) lista.appendChild(mk('div', 'dc-muted', 'Ninguém para escolher.'))
        card.appendChild(lista)
        const ok = mk('button', 'btn-primary', 'Aplicar')
        // Até o máximo: o resto fica travado
        const atualizar = () => {
            const n = linhas.filter(x => x.c.checked).length
            linhas.forEach(x => { if (!x.c.checked && !(armasDe && x.sel && !x.sel.options.length)) x.c.disabled = n >= max })
            ok.disabled = !n && !marcados
        }
        linhas.forEach(x => x.c.addEventListener('change', atualizar))
        atualizar()
        ok.addEventListener('click', () => {
            const escolhidos = linhas.filter(x => x.c.checked)
            fim({ ids: escolhidos.map(x => x.o.id), armas: Object.fromEntries(escolhidos.filter(x => x.sel).map(x => [x.o.id, x.sel.value])) })
        })
        card.appendChild(ok)
        ov.appendChild(card)
        ov.addEventListener('mousedown', e => { if (e.target === ov) fim(null) })
        document.body.appendChild(ov)
    })
}

/** Ícones dos efeitos em vigor, para os cards: [{ icone, titulo }]. */
function icones(stats) {
    return ativos(stats).map(e => {
        const def = D.EFEITOS[e.tipo]
        return { icone: def.icone, titulo: `${def.nome}${e.dado ? ` (1${e.dado})` : ''} — de ${e.fonteNome}${restante(e)}` }
    })
}

function restante(e) {
    if (e.expira && combate().emBatalha()) {
        const n = e.expira.rodada - state.combate.rodada
        return n > 0 ? ` · ${n} rodada${n > 1 ? 's' : ''}` : ' · última rodada'
    }
    return e.conc ? ' · concentração' : e.minutos ? ` · ${e.minutos >= 60 ? `${e.minutos / 60} h` : `${e.minutos} min`}` : ''
}

/** Chips da ficha: cada efeito com o que faz e o ✕ (dono, mestre ou quem pôs). */
function chipsDaFicha(char, stats) {
    return ativos(stats).map(e => {
        const def = D.EFEITOS[e.tipo]
        const chip = mk('span', 'de-chip efeito', `${def.icone} ${def.nome}${e.dado ? ` 1${e.dado}` : ''}`)
        chip.title = `${def.desc} De ${e.fonteNome}${restante(e)}.`
        const pode = state.isRoomMaster || meu(char.id) || meu(e.fonte)
        if (pode) {
            const x = mk('button', 'de-chip-x', '✕')
            x.title = `Tirar ${def.nome}`
            x.setAttribute('aria-label', x.title)
            x.addEventListener('click', () => { remover(char.id, { uid: e.uid }); setTimeout(() => sheet().reabrirFicha(), 50) })
            chip.appendChild(x)
        }
        return chip
    })
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = {
    aplicar, remover, aoReceber, ativos, limparMeus, aoComecarTurno, aoDescansar, aoRolar,
    aoConjurar, lancar, marcar, moverMarca, marcasDaCriatura, escolherAura, escolher,
    icones, chipsDaFicha, usarProdigio, tirarD20Guardado,
}
