// ══════════════════════════════════════════════════════════════════════════════
// src/dndConteudo.js — MAGIAS, TALENTOS E ARMAS DA MESA DO D&D
//
// A fonte é o Supabase (tabelas dnd_magias e dnd_talentos, ver
// sql/dnd/01_magias_talentos.sql). Lá o mestre pode cadastrar magias e
// talentos da casa. Enquanto o banco não responde, ou se ele cair, vale a
// cópia que vem com o app (src/dados/*.json), gerada do Livro do Jogador.
//
// As armas do livro ficam no próprio app (dndDados.js). As da mesa (uma
// espada +1, um machado que causa fogo) o mestre cadastra pelo app, na
// tabela dnd_armas (sql/dnd/02_armas.sql); sem a tabela, ele ainda dá a
// arma ao personagem, só não fica guardada para reusar.
//
// O motor (dnd.js) e as telas leem tudo por aqui, nunca direto do JSON.
// ══════════════════════════════════════════════════════════════════════════════

const MAGIAS_LOCAIS = require('./dados/dndMagias.json')
const TALENTOS_LOCAIS = require('./dados/dndTalentos.json')

let magias = MAGIAS_LOCAIS
let magiaPorId = indexar(magias)
let talentos = converterTalentos(TALENTOS_LOCAIS)
let origem = 'local'
let armasMesa = []
let carregamento = null
const ouvintes = []

function indexar(lista) {
    return Object.fromEntries(lista.map(m => [m.id, m]))
}

/** Linha da tabela (ou do JSON local) → o formato que o motor usa. */
function converterTalentos(linhas) {
    const mapa = {}
    linhas.forEach(t => {
        mapa[t.id] = {
            nome: t.nome,
            desc: t.descricao || '',
            req: t.requisito || undefined,
            aumento: t.aumento || undefined,
            escolhas: t.escolhas || undefined,
            icone: t.icone || null,
            pag: t.pagina ?? t.pag ?? null,
            homebrew: !!t.homebrew,
            ...(t.efeitos || {}),
        }
    })
    return mapa
}

function converterMagia(l) {
    return {
        id: l.id, nome: l.nome, nivel: l.nivel, escola: l.escola, ritual: !!l.ritual,
        tempo: l.tempo, alcance: l.alcance, componentes: l.componentes, material: l.material,
        duracao: l.duracao, concentracao: !!l.concentracao, classes: l.classes || [],
        ataque: l.ataque, resistencia: l.resistencia, dano: l.dano, cura: l.cura, superior: l.superior,
        escalaTruque: !!l.escala_truque, resumo: l.resumo || '', pag: l.pagina, icone: l.icone,
        homebrew: !!l.homebrew,
    }
}

/**
 * Busca no Supabase uma vez por sessão. Quem precisar redesenhar quando os
 * dados chegarem se registra em aoCarregar().
 */
function carregar() {
    if (carregamento) return carregamento
    carregamento = (async () => {
        const state = require('./state')
        if (!state.supabase) return
        try {
            const [rm, rt] = await Promise.all([
                state.supabase.from('dnd_magias').select('*').eq('ativo', true),
                state.supabase.from('dnd_talentos').select('*').eq('ativo', true),
            ])
            if (rm.error || rt.error) throw new Error((rm.error || rt.error).message)
            if (rm.data && rm.data.length) {
                magias = rm.data.map(converterMagia).sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, 'pt'))
                magiaPorId = indexar(magias)
            }
            if (rt.data && rt.data.length) talentos = converterTalentos(rt.data)
            origem = 'supabase'
            ouvintes.forEach(fn => { try { fn() } catch (e) { console.warn('[D&D] ouvinte:', e.message) } })
        } catch (e) {
            // Sem as tabelas ou sem rede, o app segue com a cópia local
            console.warn('[D&D] Magias e talentos do Supabase indisponíveis, usando a cópia local:', e.message)
        }
        // As armas da mesa vêm à parte: a tabela pode ainda não existir
        try {
            const ra = await state.supabase.from('dnd_armas').select('*').eq('ativo', true).order('nome')
            if (ra.error) throw new Error(ra.error.message)
            armasMesa = (ra.data || []).map(converterArma)
            ouvintes.forEach(fn => { try { fn() } catch (e) { console.warn('[D&D] ouvinte:', e.message) } })
        } catch (e) {
            console.warn('[D&D] Armas da mesa indisponíveis:', e.message)
        }
    })()
    return carregamento
}

function converterArma(l) {
    return {
        id: l.id, nome: l.nome, base: l.base, bonus: l.bonus || 0,
        dano: l.dano || null, tipoDano: l.tipo_dano || null, danoExtra: l.dano_extra || null, nota: l.nota || '',
    }
}

/** Guarda uma arma da mesa no Supabase para reusar. Devolve o erro, se houver. */
async function salvarArmaDaMesa(arma) {
    const state = require('./state')
    if (!state.supabase) return 'sem conexão com o banco'
    const linha = {
        id: arma.id, nome: arma.nome, base: arma.base, bonus: arma.bonus || 0,
        dano: arma.dano || null, tipo_dano: arma.tipoDano || null, dano_extra: arma.danoExtra || null, nota: arma.nota || null,
    }
    const { error } = await state.supabase.from('dnd_armas').insert(linha)
    if (error) return error.message
    armasMesa = [...armasMesa.filter(a => a.id !== arma.id), converterArma(linha)].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
    return null
}

function aoCarregar(fn) {
    if (typeof fn === 'function') ouvintes.push(fn)
}

module.exports = {
    carregar, aoCarregar,
    todasMagias: () => magias,
    magia: id => magiaPorId[id] || null,
    talentos: () => talentos,
    armasDaMesa: () => armasMesa,
    salvarArmaDaMesa,
    origem: () => origem,
}
