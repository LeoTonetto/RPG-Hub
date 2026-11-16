// ══════════════════════════════════════════════════════════════════════════════
// src/dndBaralho.js — BARALHO DAS SURPRESAS (D&D, Guia do Mestre)
//
// Decidido com o mestre (2026-11-16):
//   • as 22 cartas, sempre (o livro tem também a versão de 13);
//   • o mestre clica em "Puxar carta" quando um jogador pede: sai uma carta
//     ao acaso entre as que restam e aparece em tela grande para todos, com o
//     efeito; não diz quem puxou;
//   • a carta puxada NÃO volta ao baralho (no livro volta, menos o Tolo e o
//     Bufão). O mestre vê quais já saíram, pode marcar e desmarcar cada uma e
//     resetar o baralho para outra campanha;
//   • o app só mostra o efeito: quem aplica na ficha é o mestre.
//
// Quem guarda as cartas que saíram é o app do mestre, na tabela dnd_baralhos
// do Supabase (sql/dnd/05_baralho.sql), com o localStorage de reserva.
// Os efeitos são resumos com palavras nossas; o texto completo está no livro.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const magiasUI = require('./dndMagiasUI')

const CHAVE_LOCAL = 'dndBaralho'

// tom: bom, ruim ou misto (a cor da borda da carta)
const CARTAS = [
    { id: 'vizir', nome: 'Vizir', naipe: 'Ás de ouros', icone: 'delapouite/wizard-face', tom: 'bom',
        efeito: 'Uma vez, dentro de um ano, você medita sobre uma pergunta e recebe a resposta verdadeira, junto com o jeito de usá-la.' },
    { id: 'sol', nome: 'Sol', naipe: 'Rei de ouros', icone: 'lorc/sun', tom: 'bom',
        efeito: 'Você ganha 50.000 XP, e um item maravilhoso sorteado pelo mestre aparece nas suas mãos.' },
    { id: 'lua', nome: 'Lua', naipe: 'Rainha de ouros', icone: 'lorc/moon', tom: 'bom', rolar: '1d3',
        efeito: 'Você pode conjurar a magia desejo 1d3 vezes.' },
    { id: 'estrela', nome: 'Estrela', naipe: 'Valete de ouros', icone: 'lorc/star-swirl', tom: 'bom',
        efeito: '+2 em um valor de habilidade à sua escolha. Pode passar de 20, até 24.' },
    { id: 'cometa', nome: 'Cometa', naipe: 'Dois de ouros', icone: 'lorc/comet-spark', tom: 'bom',
        efeito: 'Se você vencer sozinho o próximo monstro (ou grupo de monstros) hostil que encontrar, ganha XP para subir um nível. Senão, nada acontece.' },
    { id: 'parcas', nome: 'As Parcas', naipe: 'Ás de copas', icone: 'caro-asercion/spinning-wheel', tom: 'bom',
        efeito: 'A realidade se refaz: você apaga um acontecimento como se ele nunca tivesse ocorrido. Pode usar agora ou a qualquer momento antes de morrer.' },
    { id: 'trono', nome: 'Trono', naipe: 'Rei de copas', icone: 'delapouite/throne-king', tom: 'bom',
        efeito: 'Proficiência em Persuasão, com o bônus de proficiência dobrado nela. E você passa a ter direito a um pequeno forte, hoje tomado por monstros que precisa expulsar.' },
    { id: 'chave', nome: 'Chave', naipe: 'Rainha de copas', icone: 'lorc/skeleton-key', tom: 'bom',
        efeito: 'Uma arma mágica rara (ou mais rara), de um tipo com que você é proficiente, aparece nas suas mãos. O mestre escolhe qual.' },
    { id: 'cavaleiro', nome: 'Cavaleiro', naipe: 'Valete de copas', icone: 'lorc/visored-helm', tom: 'bom',
        efeito: 'Um guerreiro de 4º nível, da sua raça, surge a até 9 m e passa a servi-lo com lealdade até a morte. Você o controla.' },
    { id: 'gema', nome: 'Gema', naipe: 'Dois de copas', icone: 'lorc/cut-diamond', tom: 'bom',
        efeito: 'Aparecem aos seus pés 25 joias de 2.000 po cada, ou 15 gemas de 1.000 po cada.' },
    { id: 'garras', nome: 'Garras', naipe: 'Ás de paus', icone: 'lorc/crossed-claws', tom: 'ruim',
        efeito: 'Todo item mágico que você veste ou carrega se desintegra. Artefatos não são destruídos, mas desaparecem.' },
    { id: 'vacuo', nome: 'O Vácuo', naipe: 'Rei de paus', icone: 'lorc/vortex', tom: 'ruim', ultima: true,
        efeito: 'Sua alma é arrancada e presa num objeto, num lugar guardado por seres poderosos; seu corpo fica incapacitado. Desejo não traz a alma de volta, só revela onde ela está. Você não puxa mais cartas.' },
    { id: 'chamas', nome: 'Chamas', naipe: 'Rainha de paus', icone: 'delapouite/devil-mask', tom: 'ruim',
        efeito: 'Um diabo poderoso vira seu inimigo. Ele quer arruinar sua vida e saborear seu sofrimento antes de tentar matá-lo, até que um dos dois morra.' },
    { id: 'cranio', nome: 'Crânio', naipe: 'Valete de paus', icone: 'sbed/death-skull', tom: 'ruim',
        efeito: 'Surge o avatar da morte e luta contra você até um dos dois cair. Quem tentar ajudar invoca o próprio avatar. Quem ele mata não pode voltar à vida.',
        extra: 'Avatar da morte: CA 20 · PV metade do máximo de quem puxou · voo 18 m, atravessa objetos · foice: 1d8+3 cortante + 1d8 necrótico.' },
    { id: 'idiota', nome: 'Idiota', naipe: 'Dois de paus', icone: 'delapouite/dunce-cap', tom: 'ruim', rolar: '1d4+1',
        efeito: 'Sua Inteligência cai 1d4+1, para sempre (mínimo 1). Você pode puxar uma carta a mais além das declaradas.' },
    { id: 'masmorra', nome: 'Masmorra', naipe: 'Ás de espadas', icone: 'lorc/imprisoned', tom: 'ruim', ultima: true,
        efeito: 'Você some, preso em animação suspensa numa esfera fora do mundo, até alguém encontrá-lo; o que você carregava fica no lugar. Adivinhação não o encontra (desejo revela onde). Você não puxa mais cartas.' },
    { id: 'ruina', nome: 'Ruína', naipe: 'Rei de espadas', icone: 'delapouite/castle-ruins', tom: 'ruim',
        efeito: 'Você perde toda a riqueza que carrega ou possui, menos os itens mágicos: dinheiro, negócios, imóveis e terras, e até os documentos que provavam a posse.' },
    { id: 'euriale', nome: 'Euríale', naipe: 'Rainha de espadas', icone: 'cathelineau/medusa-head', tom: 'ruim',
        efeito: 'O olhar de medusa da carta o amaldiçoa: −2 em todos os testes de resistência. Só um deus ou a carta As Parcas desfaz a maldição.' },
    { id: 'ladino', nome: 'Ladino', naipe: 'Valete de espadas', icone: 'darkzaitzev/hooded-assassin', tom: 'ruim',
        efeito: 'Um personagem do mestre vira seu inimigo em segredo. Você só descobre quem é quando ele (ou alguém) revelar. Só desejo ou intervenção divina acaba com a hostilidade.' },
    { id: 'balanca', nome: 'Balança', naipe: 'Dois de espadas', icone: 'lorc/scales', tom: 'misto',
        efeito: 'Sua tendência se inverte: leal vira caótico, bom vira mau, e vice-versa. Quem é neutro não muda.' },
    { id: 'tolo', nome: 'Tolo', naipe: 'Coringa vermelho', icone: 'delapouite/jester-hat', tom: 'ruim',
        efeito: 'Você perde 10.000 XP (sem perder nível) e puxa outra carta. As duas contam como uma só das cartas declaradas.' },
    { id: 'bufao', nome: 'Bufão', naipe: 'Coringa preto', icone: 'delapouite/card-joker', tom: 'bom',
        efeito: 'Você ganha 10.000 XP, ou pode puxar duas cartas a mais além das declaradas.' },
]
const POR_ID = Object.fromEntries(CARTAS.map(c => [c.id, c]))

let puxadas = null      // [{ id, quando }] — só no app do mestre
let carregando = null

function noDnd() {
    return state.roomSystem === 'dnd'
}

function chat(message) {
    if (state.socket) state.socket.emit('chat_message', { playerName: '🃏 Baralho', message, type: 'text' })
}

function rolar(expr) {
    const m = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(expr)
    if (!m) return null
    let total = +(m[3] || 0)
    for (let i = 0; i < +m[1]; i++) total += 1 + Math.floor(Math.random() * +m[2])
    return total
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Guardar (app do mestre) ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function carregar() {
    if (puxadas) return Promise.resolve(puxadas)
    if (carregando) return carregando
    carregando = (async () => {
        let lista = null
        if (state.supabase && state.currentUserId) {
            const { data, error } = await state.supabase.from('dnd_baralhos').select('puxadas').eq('dono', state.currentUserId).maybeSingle()
            if (error) console.warn('[Baralho] Supabase:', error.message)
            else if (data) lista = data.puxadas
        }
        if (!lista) {
            try { lista = JSON.parse(localStorage.getItem(CHAVE_LOCAL) || '[]') } catch (e) { lista = [] }
        }
        puxadas = (Array.isArray(lista) ? lista : []).filter(p => POR_ID[p.id])
        carregando = null
        return puxadas
    })()
    return carregando
}

async function salvar() {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(puxadas)) } catch (e) { /* sem localStorage */ }
    if (state.supabase && state.currentUserId) {
        const { error } = await state.supabase.from('dnd_baralhos').upsert({ dono: state.currentUserId, puxadas, atualizado_em: new Date().toISOString() })
        if (error) console.warn('[Baralho] Supabase:', error.message)
    }
}

function restantes() {
    const fora = new Set((puxadas || []).map(p => p.id))
    return CARTAS.filter(c => !fora.has(c.id))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Mestre: botão e painel ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function desenharBotao() {
    let b = document.getElementById('dndBaralhoBtn')
    if (!noDnd() || !state.socket || !state.isRoomMaster) {
        if (b) b.remove()
        document.getElementById('dndBaralhoPainel')?.remove()
        return
    }
    if (!b) {
        b = document.createElement('button')
        b.id = 'dndBaralhoBtn'
        b.type = 'button'
        b.textContent = '🃏 Baralho'
        b.title = 'Baralho das Surpresas'
        b.addEventListener('click', e => {
            e.stopPropagation()
            const p = document.getElementById('dndBaralhoPainel')
            if (p) p.remove()
            else carregar().then(desenharPainel)
        })
        document.body.appendChild(b)
    }
}

function desenharPainel() {
    let p = document.getElementById('dndBaralhoPainel')
    if (!p) {
        p = mk('div')
        p.id = 'dndBaralhoPainel'
        p.setAttribute('role', 'dialog')
        p.setAttribute('aria-label', 'Baralho das Surpresas')
        p.addEventListener('click', e => e.stopPropagation())
        document.body.appendChild(p)
    }
    p.innerHTML = ''
    const sobra = restantes()
    const cab = mk('div', 'dbr-cab')
    cab.appendChild(mk('b', null, '🃏 Baralho das Surpresas'))
    cab.appendChild(mk('span', null, `${sobra.length} de ${CARTAS.length} no baralho`))
    const fechar = mk('button', 'subpanel-close', '✕')
    fechar.addEventListener('click', () => p.remove())
    cab.appendChild(fechar)
    p.appendChild(cab)

    const puxar = mk('button', 'btn-primary dbr-puxar', sobra.length ? '🃏 Puxar uma carta' : 'O baralho acabou')
    puxar.disabled = !sobra.length
    puxar.title = 'Sai uma carta ao acaso entre as que restam, e todos veem'
    puxar.addEventListener('click', puxarCarta)
    p.appendChild(puxar)

    // Cada carta com o ✔ de "já saiu": o mestre pode marcar ou desmarcar à mão
    p.appendChild(mk('div', 'ds-legenda', 'Marcadas já saíram e não voltam. Desmarque para devolver uma carta.'))
    const lista = mk('div', 'dbr-lista')
    const fora = new Map((puxadas || []).map(x => [x.id, x]))
    CARTAS.forEach(c => {
        const l = mk('label', 'dbr-carta tom-' + c.tom + (fora.has(c.id) ? ' saiu' : ''))
        const chk = document.createElement('input')
        chk.type = 'checkbox'
        chk.checked = fora.has(c.id)
        chk.setAttribute('aria-label', `${c.nome} já saiu`)
        chk.addEventListener('change', () => {
            if (chk.checked) puxadas.push({ id: c.id, quando: new Date().toISOString(), manual: true })
            else puxadas = puxadas.filter(x => x.id !== c.id)
            salvar()
            desenharPainel()
        })
        l.appendChild(chk)
        l.appendChild(magiasUI.icone(c.icone, 'dbr-carta-icone'))
        l.appendChild(mk('span', 'dbr-carta-nome', c.nome))
        l.title = `${c.naipe} · ${c.efeito}`
        lista.appendChild(l)
    })
    p.appendChild(lista)

    const reset = mk('button', 'btn-ghost dbr-reset', '↺ Resetar o baralho')
    reset.title = 'Devolve todas as cartas (para outra campanha)'
    reset.disabled = !(puxadas || []).length
    reset.addEventListener('click', () => {
        // Confirma no próprio botão: o segundo clique reseta
        if (reset.dataset.confirma) {
            puxadas = []
            salvar()
            chat('O baralho foi resetado: as 22 cartas estão de volta.')
            desenharPainel()
            return
        }
        reset.dataset.confirma = '1'
        reset.textContent = `Devolver as ${(puxadas || []).length} cartas que saíram? Clique de novo`
        setTimeout(() => { if (reset.isConnected) { delete reset.dataset.confirma; reset.textContent = '↺ Resetar o baralho' } }, 4000)
    })
    p.appendChild(reset)
}

async function puxarCarta() {
    await carregar()
    const sobra = restantes()
    if (!sobra.length) return
    const c = sobra[Math.floor(Math.random() * sobra.length)]
    puxadas.push({ id: c.id, quando: new Date().toISOString() })
    salvar()
    const rolado = c.rolar ? rolar(c.rolar) : null
    if (state.socket) state.socket.emit('dnd_carta', { id: c.id, rolado })
    chat(`Saiu do Baralho das Surpresas: ${c.nome}${rolado != null ? ` (${c.rolar} = ${rolado})` : ''}. Restam ${sobra.length - 1}.`)
    desenharPainel()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Todos: a carta em tela grande ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function mostrar({ id, rolado } = {}) {
    const c = POR_ID[id]
    if (!c) return
    document.getElementById('dndCartaTela')?.remove()
    const ov = mk('div')
    ov.id = 'dndCartaTela'
    ov.setAttribute('role', 'dialog')
    ov.setAttribute('aria-label', `Carta: ${c.nome}`)
    const carta = mk('div', 'dbr-grande tom-' + c.tom)
    const verso = mk('div', 'dbr-face dbr-verso')
    verso.appendChild(magiasUI.icone('lorc/star-swirl', 'dbr-verso-icone'))
    const frente = mk('div', 'dbr-face dbr-frente')
    frente.appendChild(mk('div', 'dbr-naipe', c.naipe))
    frente.appendChild(magiasUI.icone(c.icone, 'dbr-grande-icone'))
    frente.appendChild(mk('div', 'dbr-nome', c.nome))
    frente.appendChild(mk('div', 'dbr-efeito', c.efeito))
    if (rolado != null) frente.appendChild(mk('div', 'dbr-rolado', `${c.rolar}: ${rolado}`))
    if (c.extra) frente.appendChild(mk('div', 'dbr-extra', c.extra))
    carta.appendChild(verso)
    carta.appendChild(frente)
    ov.appendChild(carta)
    ov.appendChild(mk('div', 'dbr-dica', 'Clique para fechar'))
    ov.addEventListener('click', () => ov.remove())
    document.body.appendChild(ov)
    // Vira a carta logo depois de aparecer de costas
    setTimeout(() => carta.classList.add('virada'), 450)
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = { CARTAS, desenharBotao, mostrar, puxarCarta }
