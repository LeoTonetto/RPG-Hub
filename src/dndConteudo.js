// ══════════════════════════════════════════════════════════════════════════════
// src/dndConteudo.js — MAGIAS E TALENTOS DO D&D
//
// A fonte é o Supabase (tabelas dnd_magias e dnd_talentos, ver
// sql/dnd/01_magias_talentos.sql). Lá o mestre pode cadastrar magias e
// talentos da casa. Enquanto o banco não responde, ou se ele cair, vale a
// cópia que vem com o app (src/dados/*.json), gerada do Livro do Jogador.
//
// O motor (dnd.js) e as telas leem tudo por aqui, nunca direto do JSON.
// ══════════════════════════════════════════════════════════════════════════════

const MAGIAS_LOCAIS = require('./dados/dndMagias.json')
const TALENTOS_LOCAIS = require('./dados/dndTalentos.json')

let magias = MAGIAS_LOCAIS
let magiaPorId = indexar(magias)
let talentos = converterTalentos(TALENTOS_LOCAIS)
let origem = 'local'
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
    })()
    return carregamento
}

function aoCarregar(fn) {
    if (typeof fn === 'function') ouvintes.push(fn)
}

module.exports = {
    carregar, aoCarregar,
    todasMagias: () => magias,
    magia: id => magiaPorId[id] || null,
    talentos: () => talentos,
    origem: () => origem,
}
