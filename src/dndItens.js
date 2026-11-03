// ══════════════════════════════════════════════════════════════════════════════
// src/dndItens.js — ITENS DO D&D NO INVENTÁRIO DO APP
//
// Decidido com o mestre (2026-11-03): os itens do D&D usam o mesmo Inventário
// do Calico (tabelas items e inventory), separados por sistema (coluna
// items.sistema, ver sql/dnd/03_itens_bolsa.sql). As armas e armaduras ficam
// nos painéis próprios da ficha; o dinheiro vai para a bolsa do grupo.
//
// O pacote inicial guarda os itens como texto em stats.itens ("Pacote de
// aventureiro", "Aljava com 20 flechas"). entregarItens() abre cada pacote no
// que ele contém (LdJ p. 151), acha os itens no catálogo e põe no inventário.
// Se o catálogo ainda não tiver os itens do D&D, o texto fica na ficha e o
// painel Equipamento oferece tentar de novo.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')

// O que vem em cada pacote (LdJ p. 151)
const PACOTES = {
    'Pacote de artista': [['Mochila'], ['Saco de dormir'], ['Fantasia', 2], ['Vela', 5], ['Ração (1 dia)', 5], ['Cantil'], ['Kit de disfarce']],
    'Pacote de assaltante': [['Mochila'], ['Esferas de metal (saco com 1.000)'], ['Linha (3 m)'], ['Sino'], ['Vela', 5], ['Pé de cabra'], ['Martelo'], ['Píton', 10],
        ['Lanterna coberta'], ['Frasco de óleo', 2], ['Ração (1 dia)', 5], ['Caixa de fogo'], ['Cantil'], ['Corda de cânhamo (15 m)']],
    'Pacote de aventureiro': [['Mochila'], ['Pé de cabra'], ['Martelo'], ['Píton', 10], ['Tocha', 10], ['Caixa de fogo'], ['Ração (1 dia)', 10], ['Cantil'], ['Corda de cânhamo (15 m)']],
    'Pacote de diplomata': [['Baú'], ['Estojo para mapas ou pergaminhos', 2], ['Roupas finas'], ['Vidro de tinta'], ['Caneta tinteiro'], ['Lâmpada'], ['Frasco de óleo', 2],
        ['Folha de papel', 5], ['Vidro de perfume'], ['Parafina'], ['Sabão']],
    'Pacote de estudioso': [['Mochila'], ['Livro de estudo'], ['Vidro de tinta'], ['Caneta tinteiro'], ['Folha de pergaminho', 10], ['Saquinho de areia'], ['Faca pequena']],
    'Pacote de explorador': [['Mochila'], ['Saco de dormir'], ['Kit de refeição'], ['Caixa de fogo'], ['Tocha', 10], ['Ração (1 dia)', 10], ['Cantil'], ['Corda de cânhamo (15 m)']],
    'Pacote de sacerdote': [['Mochila'], ['Cobertor'], ['Vela', 10], ['Caixa de fogo'], ['Caixa de esmolas'], ['Bloco de incenso', 2], ['Incensário'], ['Vestes'], ['Ração (1 dia)', 2], ['Cantil']],
}

// Poções de cura (Guia do Mestre): usar uma rola a cura sozinho. O mestre
// dá pelo Inventário; o SQL já põe estas no catálogo.
const POCOES = {
    'Poção de Cura': '2d4+2',
    'Poção de Cura Maior': '4d4+4',
    'Poção de Cura Superior': '8d4+8',
    'Poção de Cura Suprema': '10d4+20',
}

// Textos do pacote da classe e do antecedente que viram outro nome no catálogo
const TEXTOS = {
    '20 virotes': [['Virote', 20]],
    '20 flechas': [['Flecha', 20]],
    'Aljava com 20 flechas': [['Aljava'], ['Flecha', 20]],
    'Outro instrumento musical': [['Instrumento musical']],
    'Livro de preces ou conta de orações': [['Livro de preces']],
    '5 varetas de incenso': [['Vareta de incenso', 5]],
    '15 m de corda de seda': [['Corda de seda (15 m)']],
    'Trajes comuns': [['Roupas comuns']],
    'Trajes finos': [['Roupas finas']],
    'Vidro de tinta escura': [['Vidro de tinta']],
    'Dados de osso ou baralho': [['Dados de osso']],
}

// Ícone de cada item no catálogo (o Inventário aceita emoji)
const ICONES = [
    [/mochila|saco de dormir|baú|estojo|algibeira|aljava|bolsa/i, '🎒'], [/ração|cantil|kit de refeição/i, '🍞'], [/tocha|vela|lanterna|lâmpada|caixa de fogo|óleo|parafina/i, '🕯'],
    [/corda|linha/i, '🪢'], [/pé de cabra|martelo|píton|pá|pote|ferramentas|kit/i, '🛠'], [/flecha|virote/i, '🏹'], [/símbolo|livro de preces|incens|esmolas|vestes/i, '✝'],
    [/poção/i, '🧪'], [/foco|grimório|componentes/i, '🔮'], [/alaúde|instrumento/i, '🎵'], [/roupas|fantasia|traje|vestimentas/i, '👘'], [/tinta|caneta|pena|papel|pergaminho|livro|carta|mapa|areia/i, '📜'],
    [/anel|insígnia|amuleto|perfume|sino|esferas|dados|troféu|fetiche|lembrança|presente/i, '💍'], [/faca/i, '🔪'], [/rato/i, '🐀'], [/armadilha/i, '🪤'], [/sabão|cobertor/i, '🧺'],
]
function iconeDoItem(nome) {
    const achou = ICONES.find(([re]) => re.test(nome))
    return achou ? achou[1] : '📦'
}

/**
 * ["Pacote de aventureiro", "Algibeira com 15 po"] →
 * { itens: [[nome, qtd]], moedas: { po: 15 } }, com os iguais somados.
 */
function expandir(lista) {
    const qtds = new Map()
    const moedas = {}
    const dar = (nome, qtd = 1) => qtds.set(nome, (qtds.get(nome) || 0) + qtd)
    ;(lista || []).forEach(texto => {
        const t = String(texto).trim()
        const so = t.match(/^(\d+) (po|pp|pc|pe|pl)$/)
        if (so) { moedas[so[2]] = (moedas[so[2]] || 0) + parseInt(so[1], 10); return }
        const algibeira = t.match(/^Algibeira com (\d+) (po|pp|pc)$/)
        if (algibeira) { dar('Algibeira'); moedas[algibeira[2]] = (moedas[algibeira[2]] || 0) + parseInt(algibeira[1], 10); return }
        if (PACOTES[t]) return PACOTES[t].forEach(([n, q]) => dar(n, q || 1))
        if (TEXTOS[t]) return TEXTOS[t].forEach(([n, q]) => dar(n, q || 1))
        const comQtd = t.match(/^(\d+) (.+)$/)
        if (comQtd) return dar(comQtd[2], parseInt(comQtd[1], 10))
        dar(t)
    })
    return { itens: [...qtds.entries()], moedas }
}

/** Todos os nomes que o catálogo precisa ter (para o SQL de sementes). */
function todosOsNomes() {
    const D = require('./dndDados')
    const { CLASSES } = require('./dndClasses')
    const textos = new Set()
    Object.values(CLASSES).forEach(c => (c.equipamentoInicial || []).forEach(g => g.forEach(o => (o.itens || []).forEach(i => textos.add(i)))))
    Object.values(D.EQUIPAMENTO_ANTECEDENTE).forEach(a => (a.itens || []).forEach(i => textos.add(i)))
    Object.keys(PACOTES).forEach(p => textos.add(p))
    const nomes = new Set(expandir([...textos]).itens.map(([n]) => n))
    Object.keys(POCOES).forEach(n => nomes.add(n))
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt'))
}

/**
 * Põe os itens de stats.itens no Inventário do personagem. Devolve quantos
 * entraram, ou -1 se o catálogo não tem os itens do D&D (SQL não rodado).
 */
async function entregarItens(charId, lista) {
    if (!state.supabase || !lista || !lista.length) return 0
    const { itens } = expandir(lista)
    if (!itens.length) return 0
    const nomes = itens.map(([n]) => n)
    let { data: catalogo, error } = await state.supabase.from('items').select('id, name, photo, icon, viewable').in('name', nomes).eq('sistema', 'dnd')
    if (error) return -1
    if (!catalogo || !catalogo.length) return -1
    const porNome = Object.fromEntries(catalogo.map(i => [i.name, i]))
    const { data: atuais } = await state.supabase.from('inventory').select('id, item_id, quantity').eq('character_id', charId)
    let entregues = 0
    for (const [nome, qtd] of itens) {
        const item = porNome[nome]
        if (!item) continue
        const ja = (atuais || []).find(x => x.item_id === item.id)
        const r = ja
            ? await state.supabase.from('inventory').update({ quantity: ja.quantity + qtd }).eq('id', ja.id)
            : await state.supabase.from('inventory').insert({ character_id: charId, item_id: item.id, quantity: qtd })
        if (!r.error) entregues++
    }
    // Recarrega do banco e avisa a sala, como o Inventário faz ao adicionar
    const inv = require('./inventory')
    const lista2 = await inv.loadCharInventoryFromDB(charId)
    inv.handleInventoryUpdate({ charId, items: lista2 })
    if (state.socket) state.socket.emit('inventory_update', { charId, items: lista2 })
    return entregues
}

/**
 * Entrega e limpa a lista de texto da ficha. Chamado ao criar o personagem e
 * pelo botão do painel Equipamento.
 */
async function entregarDaFicha(char) {
    const lista = (char.stats || {}).itens || []
    const n = await entregarItens(char.id, lista)
    if (n > 0) require('./dndSheet').gravar(char.id, { itens: [] })
    return n
}

/**
 * Usa um item do inventário (menu Item da batalha): tira 1, avisa a mesa e,
 * se for poção de cura, rola e cura. Quem chama gasta a Ação.
 * `item` é a linha do inventário em memória ({ inventoryId, quantity, name }).
 */
async function usarItem(char, item) {
    const inv = require('./inventory')
    const restante = (item.quantity || 1) - 1
    if (state.supabase) {
        const r = restante > 0
            ? await state.supabase.from('inventory').update({ quantity: restante }).eq('id', item.inventoryId)
            : await state.supabase.from('inventory').delete().eq('id', item.inventoryId)
        if (r.error) console.warn('[D&D] Inventário:', r.error.message)
    }
    const lista = (state.inventories[char.id] || [])
        .map(i => (i.inventoryId === item.inventoryId ? { ...i, quantity: restante } : i))
        .filter(i => i.quantity > 0)
    inv.handleInventoryUpdate({ charId: char.id, items: lista })
    if (state.socket) {
        state.socket.emit('inventory_update', { charId: char.id, items: lista })
        state.socket.emit('chat_message', { playerName: '🎒 Item', message: `${char.name} usa ${item.name}.`, type: 'text' })
    }
    const cura = POCOES[item.name]
    if (cura) {
        const r = require('./dndRolagem').rolarDados({ personagem: char.name, rotulo: item.name, expressao: cura, tipo: 'cura' })
        require('./dndEstadoUI').curaNoPersonagem(char, r.total)
    }
}

module.exports = { PACOTES, POCOES, expandir, todosOsNomes, iconeDoItem, entregarItens, entregarDaFicha, usarItem }
