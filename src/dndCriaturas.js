// ══════════════════════════════════════════════════════════════════════════════
// src/dndCriaturas.js — CRIATURAS DO APÊNDICE D (D&D 5e)
//
// As fichas vêm do Apêndice D do Livro do Jogador (src/dados/dndCriaturas.json,
// gerado do livro: números e ataques; os traços só pelo nome e a página). Três
// companheiros do Conclave da Besta que o livro cita mas não traz (doninha
// gigante, gorila, texugo gigante) usam a ficha do SRD 5.1.
//
// Decidido com o mestre (2026-11-03): a Forma Selvagem transforma de verdade
// (a ficha usa PV, CA, atributos físicos e ataques da besta) e familiar,
// companheiro, montaria e mortos-vivos ganham mini-ficha no painel do dono.
// ══════════════════════════════════════════════════════════════════════════════

const LISTA = require('./dados/dndCriaturas.json')
const POR_ID = Object.fromEntries(LISTA.map(c => [c.id, c]))

// De onde vem cada tipo de criatura do personagem
const FAMILIARES = ['coruja', 'corvo', 'falcao', 'gato', 'morcego', 'rato', 'sapo', 'serpente-venenosa']
const FAMILIARES_DO_PACTO = ['diabrete', 'pseudodragao', 'quasit', 'sprite']
const COMPANHEIROS = ['doninha-gigante', 'javali', 'gorila', 'lobo', 'mula', 'pantera', 'texugo-gigante', 'urso-negro']
const MONTARIAS = ['cavalo-de-guerra', 'cavalo-de-montaria', 'mastim']
const MORTOS_VIVOS = ['esqueleto', 'zumbi']

const TIPOS_DE_ALIADO = {
    familiar: 'Familiar', companheiro: 'Companheiro animal', montaria: 'Montaria', 'morto-vivo': 'Morto-vivo', outro: 'Criatura',
}

function criatura(id) { return POR_ID[id] || null }
function todas() { return LISTA }

const mod = v => Math.floor((v - 10) / 2)

/** "9 m, escalada 9 m" → 9 (o deslocamento de caminhada). */
function deslocamentoBase(texto) {
    const m = String(texto || '').match(/^([\d,]+) ?m/)
    return m ? parseFloat(m[1].replace(',', '.')) : 0
}

/** "1d6+3" → { dados: '1d6', bonus: 3 }; "1" → { dados: '1', bonus: 0 } */
function separarDano(dano) {
    const m = String(dano || '').match(/^(\d+d\d+)([+-]\d+)?$/)
    return m ? { dados: m[1], bonus: parseInt(m[2] || '0', 10) } : { dados: String(dano || '0'), bonus: 0 }
}

// ── Forma Selvagem (LdJ p. 67) ────────────────────────────────────────────────

/** Até que ND e com que deslocamentos o druida pode se transformar. */
function limitesDaForma(nivel, subclasse) {
    if (nivel < 2) return null
    let nd = nivel >= 8 ? 1 : nivel >= 4 ? 0.5 : 0.25
    // Círculo da Lua: ND 1 desde o 2º; no 6º, nível dividido por 3
    if (subclasse === 'lua') nd = Math.max(1, nivel >= 6 ? Math.floor(nivel / 3) : 1)
    return { nd, voo: nivel >= 8, natacao: nivel >= 4 }
}

/** Bestas em que o druida pode se transformar agora. */
function formasPermitidas(nivel, subclasse) {
    const lim = limitesDaForma(nivel, subclasse)
    if (!lim) return []
    return LISTA.filter(c => c.tipo === 'Besta' && c.ndValor <= lim.nd && (lim.voo || !c.voo) && (lim.natacao || !c.natacao))
}

// ── Aliados do personagem ─────────────────────────────────────────────────────

/** Criaturas que o personagem pode ter, e de onde vem cada grupo. */
function aliadosPossiveis(stats, f) {
    const conhece = id => f.magias.some(m => m.id === id)
    const grupos = []
    const pacto = stats.classe === 'bruxo' && f.nivel >= 3 && ((stats.escolhas || {})['nv3:pacto'] || [])[0] === 'corrente'
    if (conhece('convocar-familiar') || pacto) grupos.push({ tipo: 'familiar', origem: pacto ? 'Pacto da Corrente' : 'Convocar Familiar', ids: pacto ? [...FAMILIARES, ...FAMILIARES_DO_PACTO] : FAMILIARES })
    if (stats.classe === 'patrulheiro' && stats.subclasse === 'besta' && f.nivel >= 3) grupos.push({ tipo: 'companheiro', origem: 'Conclave da Besta', ids: COMPANHEIROS })
    if (conhece('convocar-montaria')) grupos.push({ tipo: 'montaria', origem: 'Convocar Montaria', ids: MONTARIAS })
    if (conhece('animar-mortos')) grupos.push({ tipo: 'morto-vivo', origem: 'Animar Mortos', ids: MORTOS_VIVOS })
    return grupos
}

/**
 * A ficha da criatura como ela joga ao lado do personagem. O companheiro do
 * Conclave da Besta muda (LdJ p. 119): usa a proficiência do patrulheiro,
 * soma a proficiência na CA e no dano, é proficiente em todas as
 * resistências, perde os Ataques Múltiplos e ganha um Dado de Vida por nível
 * do patrulheiro depois do 3º.
 */
function fichaDoAliado(aliado, f) {
    const base = criatura(aliado.criatura)
    if (!base) return null
    const ficha = JSON.parse(JSON.stringify(base))
    ficha.nome = aliado.nome || base.nome
    ficha.tipoAliado = aliado.tipo
    if (aliado.tipo === 'companheiro' && f) {
        const profBase = 2
        const prof = f.prof
        ficha.ca = base.ca + prof
        ficha.ataquesMultiplos = ''
        ficha.ataques = base.ataques.map(a => {
            const d = separarDano(a.dano)
            return { ...a, bonus: a.bonus - profBase + prof, dano: /d/.test(d.dados) ? `${d.dados}${d.bonus + prof >= 0 ? '+' : ''}${d.bonus + prof}` : String(parseInt(d.dados, 10) + prof) }
        })
        const dv = String(base.dadosVida).match(/^(\d+)d(\d+)/)
        if (dv) {
            const n = parseInt(dv[1], 10) + Math.max(0, f.nivel - 3)
            const lados = parseInt(dv[2], 10)
            ficha.pv = Math.max(1, Math.floor(n * (lados + 1) / 2) + n * mod(base.atributos.con))
            ficha.dadosVida = `${n}d${lados}`
        }
        ficha.resistenciasTodas = true
        ficha.nota = 'Usa sua proficiência (inclusive na CA e no dano), é proficiente em todas as resistências e não tem Ataques Múltiplos.'
    }
    ficha.pvMax = ficha.pv
    return ficha
}

module.exports = {
    criatura, todas, mod, deslocamentoBase, separarDano,
    limitesDaForma, formasPermitidas, aliadosPossiveis, fichaDoAliado,
    TIPOS_DE_ALIADO, FAMILIARES, FAMILIARES_DO_PACTO, COMPANHEIROS, MONTARIAS, MORTOS_VIVOS,
}
