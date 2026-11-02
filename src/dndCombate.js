// ══════════════════════════════════════════════════════════════════════════════
// src/dndCombate.js — MODO DE BATALHA DO D&D
//
// Fluxo (decidido com o mestre em 2026-11-02):
//   • o mestre clica "⚔ Batalha", põe as criaturas (só nome e iniciativa) e
//     inicia; o app dele rola a iniciativa de todos os personagens;
//   • a barra no topo mostra a ordem; cada turno tem Ação, Ação Bônus e
//     Reação, que se gastam ao conjurar ou à mão; a reação volta no começo do
//     próprio turno;
//   • o jogador encerra o próprio turno, o mestre passa qualquer um;
//   • o mestre anuncia o que as criaturas fazem (conjura magia, ataca, sai do
//     alcance) e o app oferece a reação a quem pode: Contramágica, Escudo
//     Arcano, Esquiva Sobrenatural, Aparar, Duelista Defensivo, ataque de
//     oportunidade e Repreensão Infernal.
//
// O servidor guarda o estado (server/handlers.js, combate_*); aqui é só tela
// e a decisão de cada jogador sobre a própria reação.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const conteudo = require('./dndConteudo')
const rolagem = require('./dndRolagem')
const magiasUI = require('./dndMagiasUI')

const ICONE_CRIATURA = 'sbed/death-skull'
const PROMPT_MS = 30000

let editandoOrdem = false
let anuncioAtual = null      // mestre: o último ataque/magia anunciado e as respostas
const respostas = {}         // anuncioId → [respostas]
let promptTimer = null

// ══════════════════════════════════════════════════════════════════════════════
// ── Estado e utilidades ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function emitir(ev, dados) {
    if (state.socket) state.socket.emit(ev, dados)
}

function emBatalha() {
    return !!(state.combate && state.combate.ordem && state.combate.ordem.length)
}

function entradaAtual() {
    return emBatalha() ? state.combate.ordem[state.combate.turno] : null
}

/** A entrada da batalha que é do meu personagem ativo. */
function minhaEntrada() {
    if (!emBatalha()) return null
    return state.combate.ordem.find(e => e.tipo === 'pj' && state.playerCharacters.some(c => c.id === e.charId)) || null
}

function charDaEntrada(ent) {
    if (!ent || !ent.charId) return null
    const meu = state.playerCharacters.find(c => c.id === ent.charId)
    if (meu) return meu
    const cache = state.allCharsCache.find(x => x.character.id === ent.charId)
    return cache ? cache.character : null
}

function economia(id) {
    return (state.combate && state.combate.economia && state.combate.economia[id]) || null
}

function gastar(id, campo, valor) {
    emitir('combate_gastar', { id, campo, valor })
}

function podeMexer(ent) {
    return !!state.isRoomMaster || (ent && minhaEntrada() && minhaEntrada().id === ent.id)
}

/** Espaços de magia livres a partir de um nível: [{ id: '3' | 'pacto', nivel }] */
function espacosLivres(stats, f, minimo) {
    const cj = f.conjuracao
    const usados = stats.espacos_usados || {}
    const livres = []
    if (!cj) return livres
    cj.espacos.forEach((qtd, i) => { const n = i + 1; if (n >= minimo && qtd - (usados[n] || 0) > 0) livres.push({ id: String(n), nivel: n }) })
    if (cj.pacto && cj.pacto.nivel >= minimo && cj.pacto.qtd - (usados.pacto || 0) > 0) livres.push({ id: 'pacto', nivel: cj.pacto.nivel })
    return livres
}

function gastarEspaco(char, espaco) {
    const usados = { ...(char.stats.espacos_usados || {}) }
    usados[espaco.id] = (usados[espaco.id] || 0) + 1
    require('./dndSheet').gravar(char.id, { espacos_usados: usados })
}

function gastarRecurso(char, id) {
    const usados = { ...(char.stats.recursos_usados || {}) }
    usados[id] = (usados[id] || 0) + 1
    require('./dndSheet').gravar(char.id, { recursos_usados: usados })
}

function recursoLivre(char, f, id) {
    const r = f.recursos.find(x => x.id === id)
    if (!r) return null
    const usado = (char.stats.recursos_usados || {})[id] || 0
    return r.max == null || r.max - usado > 0 ? r : null
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Chegada do estado ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

let esperandoServidor = null

function aoEstado(estado) {
    const antes = state.combate
    state.combate = estado && estado.ordem && estado.ordem.length ? estado : null
    clearTimeout(esperandoServidor)
    if (!state.combate) { editandoOrdem = false; anuncioAtual = null }
    desenharBarra()
    desenharTurno()
    desenharResultado()
    atualizarBotaoMestre()

    // Começou o meu turno: um aviso rápido
    const atual = entradaAtual()
    const mudouTurno = !antes || antes.turno !== (state.combate && state.combate.turno) || antes.rodada !== (state.combate && state.combate.rodada)
    if (atual && mudouTurno && minhaEntrada() && atual.id === minhaEntrada().id) aviso(`⚔ Seu turno, ${atual.nome}!`)
}

function limpar() {
    state.combate = null
    editandoOrdem = false
    anuncioAtual = null
    ;['combateBarra', 'combateTurno', 'combateSetup', 'combateAnuncio', 'combateResultado', 'combatePrompt']
        .forEach(id => { const el = document.getElementById(id); if (el) el.remove() })
    atualizarBotaoMestre()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Botão do mestre e montagem da batalha ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function atualizarBotaoMestre() {
    const btn = document.getElementById('combateMasterBtn')
    if (!btn) return
    btn.style.display = state.isRoomMaster && state.roomSystem === 'dnd' ? 'block' : 'none'
    btn.textContent = emBatalha() ? '⚔ Batalha em andamento' : '⚔ Iniciar batalha'
    if (!btn.dataset.inited) {
        btn.dataset.inited = '1'
        btn.addEventListener('click', () => { if (!emBatalha()) abrirMontagem() })
    }
}

// Criaturas da montagem ficam guardadas enquanto o app estiver aberto
let criaturasRascunho = [{ nome: '', iniciativa: '' }]

function abrirMontagem() {
    const ov = overlay('combateSetup')
    ov.innerHTML = ''
    const card = mk('div', 'connect-card cb-setup')
    const fechar = mk('button', 'char-modal-close-btn', '✕')
    fechar.title = 'Fechar'
    fechar.addEventListener('click', () => ov.remove())
    card.appendChild(fechar)
    card.appendChild(mk('div', 'card-icon', '⚔'))
    card.appendChild(mk('h1', 'card-title', 'Iniciar batalha'))
    card.appendChild(mk('p', 'card-subtitle', 'O app rola a iniciativa dos personagens; as criaturas entram com o número que você der.'))

    // Personagens na sala
    card.appendChild(mk('div', 'dc-subtitulo', 'Personagens'))
    const pjs = state.allCharsCache.filter(x => x.character.system === 'dnd')
    const marcados = new Set(pjs.map(x => x.character.id))
    const listaPj = mk('div', 'cb-setup-lista')
    if (!pjs.length) listaPj.appendChild(mk('div', 'dc-muted', 'Nenhum personagem de D&D na sala.'))
    pjs.forEach(({ playerName, character }) => {
        const f = dnd.calcular(character.stats || {})
        const l = mk('label', 'cb-setup-pj')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = true
        cb.addEventListener('change', () => { if (cb.checked) marcados.add(character.id); else marcados.delete(character.id) })
        l.appendChild(cb)
        l.appendChild(mk('span', 'cb-setup-nome', character.name))
        l.appendChild(mk('span', 'dc-muted', playerName))
        l.appendChild(mk('b', null, `${dnd.sinal(f.iniciativa)}${f.vantagemIniciativa ? ' · vantagem' : ''}`))
        listaPj.appendChild(l)
    })
    card.appendChild(listaPj)

    // Criaturas
    card.appendChild(mk('div', 'dc-subtitulo', 'Criaturas'))
    const listaCr = mk('div', 'cb-setup-lista')
    const desenharCriaturas = () => {
        listaCr.innerHTML = ''
        criaturasRascunho.forEach((c, i) => {
            const l = mk('div', 'cb-setup-cr')
            const nome = document.createElement('input')
            nome.className = 'room-input'
            nome.placeholder = 'Nome (ex.: 3 Goblins)'
            nome.setAttribute('aria-label', 'Nome da criatura')
            nome.value = c.nome
            nome.addEventListener('input', () => { c.nome = nome.value })
            nome.addEventListener('keydown', e => e.stopPropagation())
            const ini = document.createElement('input')
            ini.className = 'room-input cb-ini'
            ini.type = 'number'
            ini.placeholder = 'Inic.'
            ini.setAttribute('aria-label', 'Iniciativa')
            ini.value = c.iniciativa
            ini.addEventListener('input', () => { c.iniciativa = ini.value })
            ini.addEventListener('keydown', e => e.stopPropagation())
            const d20 = mk('button', 'sp-adj-btn cb-d20', '🎲')
            d20.type = 'button'
            d20.title = 'Rolar um d20 (some o bônus da criatura)'
            d20.addEventListener('click', () => { c.iniciativa = String(1 + Math.floor(Math.random() * 20)); ini.value = c.iniciativa })
            const tirar = mk('button', 'sp-adj-btn', '✕')
            tirar.type = 'button'
            tirar.title = 'Remover'
            tirar.addEventListener('click', () => { criaturasRascunho.splice(i, 1); desenharCriaturas() })
            l.appendChild(nome); l.appendChild(ini); l.appendChild(d20); l.appendChild(tirar)
            listaCr.appendChild(l)
        })
        const mais = mk('button', 'btn-ghost cb-mais', '+ Adicionar criatura')
        mais.type = 'button'
        mais.addEventListener('click', () => { criaturasRascunho.push({ nome: '', iniciativa: '' }); desenharCriaturas() })
        listaCr.appendChild(mais)
    }
    desenharCriaturas()
    card.appendChild(listaCr)

    const info = mk('div', 'info-box')
    card.appendChild(info)
    const iniciar = mk('button', 'btn-primary', '⚔ Rolar iniciativa e começar')
    iniciar.type = 'button'
    iniciar.addEventListener('click', () => {
        const ordem = montarOrdem(pjs.filter(x => marcados.has(x.character.id)))
        if (!ordem.length) { info.textContent = 'Inclua ao menos um personagem ou criatura.'; info.className = 'info-box visible error'; return }
        emitir('combate_iniciar', { ordem })
        // Servidor antigo não conhece a batalha: avisa em vez de ficar parado
        esperandoServidor = setTimeout(() => {
            info.textContent = 'O servidor desta sala ainda não tem o modo de batalha. Atualize o servidor da VPS (ou crie a sala pelo ngrok).'
            info.className = 'info-box visible error'
        }, 2500)
        const fecharAoComecar = setInterval(() => { if (emBatalha()) { clearInterval(fecharAoComecar); ov.remove() } }, 200)
        setTimeout(() => clearInterval(fecharAoComecar), 3000)
    })
    card.appendChild(iniciar)
    ov.appendChild(card)
}

/** Rola a iniciativa dos personagens e junta com as criaturas, já ordenado. */
function montarOrdem(pjs) {
    const linhas = []
    const ordem = pjs.map(({ playerName, character }) => {
        const f = dnd.calcular(character.stats || {})
        const { dados, natural } = rolagem.rolarD20(f.vantagemIniciativa ? 'vantagem' : 'normal')
        const total = natural + f.iniciativa
        linhas.push(`${character.name} d20(${dados.map(d => d.valor).join(', ')}) ${dnd.sinal(f.iniciativa)} = ${total}`)
        // Empate: maior Destreza primeiro; personagens antes de criaturas
        return {
            id: 'pj:' + character.id, tipo: 'pj', nome: character.name, charId: character.id, dono: playerName,
            foto: character.photo || null, iniciativa: total, desempate: f.mods.des + 0.5 + Math.random() / 100,
        }
    })
    criaturasRascunho.filter(c => c.nome.trim()).forEach(c => {
        ordem.push({
            id: 'cr:' + Math.random().toString(36).slice(2, 9), tipo: 'criatura', nome: c.nome.trim(),
            iniciativa: parseInt(c.iniciativa, 10) || 0, desempate: Math.random() / 100,
        })
    })
    if (linhas.length) emitir('chat_message', { playerName: '🎲 Dados', message: `Iniciativa — ${linhas.join(' · ')}`, type: 'roll' })
    return ordenar(ordem)
}

function ordenar(ordem) {
    return ordem.slice().sort((a, b) => b.iniciativa - a.iniciativa || b.desempate - a.desempate)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Barra de iniciativa ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function desenharBarra() {
    let barra = document.getElementById('combateBarra')
    if (!emBatalha()) { if (barra) barra.remove(); return }
    if (!barra) {
        barra = mk('div')
        barra.id = 'combateBarra'
        barra.setAttribute('role', 'region')
        barra.setAttribute('aria-label', 'Ordem de iniciativa')
        segurar(barra)
        document.body.appendChild(barra)
    }
    barra.innerHTML = ''
    const c = state.combate
    const atual = entradaAtual()

    barra.appendChild(mk('div', 'cb-rodada', `Rodada ${c.rodada}`))
    const fila = mk('div', 'cb-fila')
    c.ordem.forEach((e, i) => {
        const el = mk('div', 'cb-ent' + (e.id === atual.id ? ' atual' : '') + (e.tipo === 'criatura' ? ' criatura' : '') + (minhaEntrada() && minhaEntrada().id === e.id ? ' minha' : ''))
        el.title = `${e.nome} — iniciativa ${e.iniciativa}`
        const foto = mk('div', 'cb-foto')
        if (e.foto) { const img = document.createElement('img'); img.src = e.foto; img.alt = ''; foto.appendChild(img) }
        else {
            const ch = charDaEntrada(e)
            const cls = ch && dnd.fontes(ch.stats || {}).classe
            foto.appendChild(magiasUI.icone(e.tipo === 'criatura' ? ICONE_CRIATURA : (cls && cls.icone) || 'lorc/crossed-swords'))
        }
        foto.appendChild(mk('span', 'cb-ini', String(e.iniciativa)))
        el.appendChild(foto)
        el.appendChild(mk('div', 'cb-nome', e.nome))
        if (e.tipo === 'pj') el.appendChild(fichas(e, true))

        // Mestre ajustando a ordem
        if (editandoOrdem && state.isRoomMaster) {
            const ctl = mk('div', 'cb-ctl')
            ctl.appendChild(botao('◀', 'Mover para antes', () => mover(i, -1)))
            ctl.appendChild(botao('▶', 'Mover para depois', () => mover(i, 1)))
            ctl.appendChild(botao('✕', 'Tirar da batalha', () => tirar(i)))
            el.appendChild(ctl)
        }
        fila.appendChild(el)
    })
    barra.appendChild(fila)

    const acoes = mk('div', 'cb-acoes')
    if (state.isRoomMaster) {
        acoes.appendChild(botao('▶ Próximo', 'Passar para o próximo da ordem', () => emitir('combate_proximo'), 'principal'))
        acoes.appendChild(botao('📣 Anunciar', 'O que a criatura faz: conjura, ataca, sai do alcance', () => abrirAnuncio()))
        acoes.appendChild(botao(editandoOrdem ? '✓ Ordem' : '✎ Ordem', 'Mover, tirar ou acrescentar na ordem', () => { editandoOrdem = !editandoOrdem; desenharBarra() }))
        acoes.appendChild(botao('✕ Encerrar', 'Encerrar a batalha', () => confirmarEncerrar(acoes), 'perigo'))
    } else if (minhaEntrada() && atual.id === minhaEntrada().id) {
        acoes.appendChild(botao('Encerrar turno ▶', 'Passar a vez', () => emitir('combate_proximo'), 'principal'))
    }
    barra.appendChild(acoes)

    if (editandoOrdem && state.isRoomMaster) barra.appendChild(formNovaCriatura())
}

/** Ação / Bônus / Reação como fichas. `mini` = na barra; senão, no painel do turno. */
function fichas(ent, mini) {
    const ec = economia(ent.id) || { acoes: 1, acoesUsadas: 0 }
    const w = mk('div', mini ? 'cb-fichas' : 'cb-fichas grandes')
    const editavel = podeMexer(ent)
    const ficha = (rotulo, curto, disponivel, onToggle, cls) => {
        const b = mk('button', `cb-ficha ${cls}${disponivel ? ' livre' : ' gasta'}`, mini ? curto : rotulo)
        b.type = 'button'
        b.disabled = !editavel
        b.title = `${rotulo}: ${disponivel ? 'disponível' : 'gasta'}${editavel ? ' (clique para alternar)' : ''}`
        b.setAttribute('aria-pressed', String(!disponivel))
        b.addEventListener('click', onToggle)
        w.appendChild(b)
    }
    for (let i = 0; i < ec.acoes; i++) {
        const livre = i >= ec.acoesUsadas
        ficha(ec.acoes > 1 ? `Ação ${i + 1}` : 'Ação', 'A', livre, () => gastar(ent.id, 'acoesUsadas', livre ? ec.acoesUsadas + 1 : ec.acoesUsadas - 1), 'acao')
    }
    ficha('Ação bônus', 'B', !ec.bonusUsada, () => gastar(ent.id, 'bonusUsada', !ec.bonusUsada), 'bonus')
    ficha('Reação', 'R', !ec.reacaoUsada, () => gastar(ent.id, 'reacaoUsada', !ec.reacaoUsada), 'reacao')
    return w
}

function mover(i, delta) {
    const ordem = state.combate.ordem.slice()
    const j = i + delta
    if (j < 0 || j >= ordem.length) return
    ;[ordem[i], ordem[j]] = [ordem[j], ordem[i]]
    emitir('combate_ordem', { ordem })
}

function tirar(i) {
    const ordem = state.combate.ordem.slice()
    if (ordem.length <= 1) return
    ordem.splice(i, 1)
    emitir('combate_ordem', { ordem })
}

function formNovaCriatura() {
    const f = mk('div', 'cb-nova')
    const nome = document.createElement('input')
    nome.className = 'room-input'
    nome.placeholder = 'Criatura nova'
    nome.setAttribute('aria-label', 'Nome da criatura nova')
    nome.addEventListener('keydown', e => e.stopPropagation())
    const ini = document.createElement('input')
    ini.className = 'room-input cb-ini'
    ini.type = 'number'
    ini.placeholder = 'Inic.'
    ini.setAttribute('aria-label', 'Iniciativa da criatura nova')
    ini.addEventListener('keydown', e => e.stopPropagation())
    const add = botao('+ Entrar na ordem', 'Acrescentar a criatura na ordem', () => {
        if (!nome.value.trim()) return nome.focus()
        const ordem = ordenar([...state.combate.ordem, {
            id: 'cr:' + Math.random().toString(36).slice(2, 9), tipo: 'criatura', nome: nome.value.trim(),
            iniciativa: parseInt(ini.value, 10) || 0, desempate: Math.random() / 100,
        }])
        emitir('combate_ordem', { ordem })
    })
    f.appendChild(nome); f.appendChild(ini); f.appendChild(add)
    return f
}

function confirmarEncerrar(onde) {
    // Confirmação no lugar, sem confirm(): o botão vira "Encerrar mesmo?"
    const b = [...onde.querySelectorAll('button')].find(x => x.textContent.includes('Encerrar'))
    if (b && b.dataset.confirmar) return emitir('combate_encerrar')
    if (b) {
        b.dataset.confirmar = '1'
        b.textContent = 'Encerrar mesmo?'
        setTimeout(() => { if (b.isConnected) { delete b.dataset.confirmar; b.textContent = '✕ Encerrar' } }, 3000)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Painel "Seu turno" ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function desenharTurno() {
    let el = document.getElementById('combateTurno')
    const minha = minhaEntrada()
    const atual = entradaAtual()
    if (!emBatalha() || !minha || atual.id !== minha.id) { if (el) el.remove(); return }
    if (!el) {
        el = mk('div')
        el.id = 'combateTurno'
        segurar(el)
        document.body.appendChild(el)
    }
    el.innerHTML = ''
    el.appendChild(mk('div', 'cb-turno-titulo', `Seu turno · ${minha.nome}`))
    el.appendChild(fichas(minha, false))

    // Surto de Ação: uma ação a mais neste turno
    const char = charDaEntrada(minha)
    if (char) {
        const f = dnd.calcular(char.stats || {})
        const surto = recursoLivre(char, f, 'surto-acao')
        if (surto) {
            const ec = economia(minha.id)
            el.appendChild(botao('+1 Ação (Surto de Ação)', 'Gasta um uso de Surto de Ação', () => {
                gastarRecurso(char, 'surto-acao')
                gastar(minha.id, 'acoes', (ec ? ec.acoes : 1) + 1)
                emitir('chat_message', { playerName: '⚔ Batalha', message: `${minha.nome} usa Surto de Ação.`, type: 'text' })
            }))
        }
    }
    el.appendChild(botao('Encerrar turno ▶', 'Passar a vez', () => emitir('combate_proximo'), 'principal'))
}

/** Chamado pela ficha ao conjurar: gasta a ação certa conforme o tempo da magia. */
function aoConjurar(char, magia) {
    if (!emBatalha()) return
    const ent = state.combate.ordem.find(e => e.charId === char.id)
    if (!ent) return
    const ec = economia(ent.id)
    if (!ec) return
    const t = (magia.tempo || '').toLowerCase()
    if (t.includes('reação')) gastar(ent.id, 'reacaoUsada', true)
    else if (t.includes('bônus')) gastar(ent.id, 'bonusUsada', true)
    else if (/^1 ação/.test(t)) gastar(ent.id, 'acoesUsadas', Math.min(ec.acoes, ec.acoesUsadas + 1))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Anúncios do mestre ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

let abaAnuncio = 'ataque'

function abrirAnuncio() {
    const ov = overlay('combateAnuncio')
    ov.innerHTML = ''
    const card = mk('div', 'connect-card cb-anuncio')
    const fechar = mk('button', 'char-modal-close-btn', '✕')
    fechar.addEventListener('click', () => ov.remove())
    card.appendChild(fechar)
    card.appendChild(mk('h1', 'card-title', 'Anunciar'))

    const abas = mk('div', 'dc-asi-abas')
    ;[['ataque', '⚔ Ataca'], ['magia', '✦ Conjura magia'], ['oportunidade', '🏃 Sai do alcance']].forEach(([id, rot]) => {
        const b = mk('button', 'dc-aba' + (abaAnuncio === id ? ' on' : ''), rot)
        b.type = 'button'
        b.addEventListener('click', () => { abaAnuncio = id; abrirAnuncio() })
        abas.appendChild(b)
    })
    card.appendChild(abas)

    const criaturas = state.combate.ordem.filter(e => e.tipo === 'criatura')
    const pjs = state.combate.ordem.filter(e => e.tipo === 'pj')
    const atual = entradaAtual()
    const form = mk('div', 'cb-form')

    const campoCriatura = () => {
        const sel = document.createElement('select')
        sel.className = 'dc-select'
        sel.setAttribute('aria-label', 'Criatura')
        criaturas.forEach(c => sel.appendChild(new Option(c.nome, c.nome)))
        sel.appendChild(new Option('Outra criatura…', ''))
        if (atual && atual.tipo === 'criatura') sel.value = atual.nome
        return rotulado('Criatura', sel)
    }
    const campoAlvo = () => {
        const sel = document.createElement('select')
        sel.className = 'dc-select'
        sel.setAttribute('aria-label', 'Alvo')
        pjs.forEach(p => sel.appendChild(new Option(p.nome, p.id)))
        return rotulado('Alvo', sel)
    }
    const numero = (rot, ph) => {
        const i = document.createElement('input')
        i.type = 'number'
        i.className = 'room-input cb-num'
        i.placeholder = ph || ''
        i.setAttribute('aria-label', rot)
        i.addEventListener('keydown', e => e.stopPropagation())
        return rotulado(rot, i)
    }
    const valorDe = w => w.querySelector('select, input').value

    let enviar
    if (abaAnuncio === 'ataque') {
        const cr = campoCriatura(), alvo = campoAlvo(), total = numero('Total do ataque', 'ex.: 17')
        const corpo = mk('label', 'dc-check')
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true
        corpo.appendChild(cb); corpo.appendChild(mk('span', null, 'Corpo-a-corpo'))
        ;[cr, alvo, total, corpo].forEach(x => form.appendChild(x))
        enviar = () => ({ tipo: 'ataque', criatura: valorDe(cr) || 'Criatura', alvoId: valorDe(alvo), total: +valorDe(total) || 0, corpo: cb.checked })
    } else if (abaAnuncio === 'magia') {
        const cr = campoCriatura()
        const nome = document.createElement('input')
        nome.className = 'room-input'
        nome.placeholder = 'Nome da magia'
        nome.setAttribute('list', 'cbListaMagias')
        nome.addEventListener('keydown', e => e.stopPropagation())
        const lista = document.createElement('datalist')
        lista.id = 'cbListaMagias'
        conteudo.todasMagias().forEach(m => lista.appendChild(new Option(m.nome)))
        const nivel = numero('Nível', 'ex.: 3')
        nome.addEventListener('change', () => {
            const m = conteudo.todasMagias().find(x => x.nome.toLowerCase() === nome.value.trim().toLowerCase())
            if (m) nivel.querySelector('input').value = m.nivel
        })
        ;[cr, rotulado('Magia', nome), nivel].forEach(x => form.appendChild(x))
        form.appendChild(lista)
        enviar = () => ({ tipo: 'magia', criatura: valorDe(cr) || 'Criatura', magia: nome.value.trim() || 'uma magia', nivel: +valorDe(nivel) || 0 })
    } else {
        const cr = campoCriatura(), alvo = campoAlvo()
        ;[cr, alvo].forEach(x => form.appendChild(x))
        enviar = () => ({ tipo: 'oportunidade', criatura: valorDe(cr) || 'Criatura', alvoId: valorDe(alvo) })
    }
    card.appendChild(form)

    const ok = mk('button', 'btn-primary', '📣 Anunciar à mesa')
    ok.type = 'button'
    ok.addEventListener('click', () => {
        const a = enviar()
        if ((a.tipo === 'ataque' || a.tipo === 'oportunidade') && !a.alvoId) return
        anuncioAtual = { ...a, aguardando: true }
        emitir('combate_anuncio', a)
        ov.remove()
    })
    card.appendChild(ok)
    ov.appendChild(card)
}

/** Chegou um anúncio do servidor (todos recebem). */
function aoAnuncio(a) {
    if (state.isRoomMaster && anuncioAtual && anuncioAtual.aguardando && anuncioAtual.tipo === a.tipo) {
        anuncioAtual = { ...a }
        respostas[a.id] = []
        desenharResultado()
    }
    oferecerReacao(a)
}

function aoReacao(r) {
    ;(respostas[r.anuncioId] = respostas[r.anuncioId] || []).push(r)
    if (anuncioAtual && anuncioAtual.id === r.anuncioId) desenharResultado()
}

// ── Resultado para o mestre: acertou?, reações e dano ─────────────────────────
function desenharResultado() {
    let el = document.getElementById('combateResultado')
    const a = anuncioAtual
    if (!state.isRoomMaster || !emBatalha() || !a || a.aguardando || a.tipo === 'dano') { if (el) el.remove(); return }
    if (!el) {
        el = mk('div')
        el.id = 'combateResultado'
        segurar(el)
        document.body.appendChild(el)
    }
    el.innerHTML = ''
    const alvo = state.combate.ordem.find(e => e.id === a.alvoId)
    const lista = respostas[a.id] || []
    const fechar = mk('button', 'subpanel-close', '✕')
    fechar.addEventListener('click', () => { anuncioAtual = null; desenharResultado() })
    el.appendChild(fechar)

    if (a.tipo === 'ataque' && alvo) {
        const char = charDaEntrada(alvo)
        const ca = char ? dnd.calcular(char.stats || {}).ca : null
        const errouPorReacao = lista.some(r => r.efeito === 'erra')
        const acertou = ca != null && a.total >= ca && !errouPorReacao
        el.appendChild(mk('div', 'cb-res-titulo', `${a.criatura} → ${alvo.nome}`))
        el.appendChild(mk('div', 'cb-res-linha ' + (acertou ? 'acerto' : 'erro'),
            ca == null ? `Ataque ${a.total} (CA desconhecida)` : `Ataque ${a.total} contra CA ${ca}: ${acertou ? 'ACERTOU' : 'ERROU'}`))
        lista.forEach(r => el.appendChild(mk('div', 'cb-res-reacao', `⚡ ${r.nome}: ${r.texto}`)))

        if (acertou && char) {
            const metade = lista.some(r => r.efeito === 'metade')
            const reducao = lista.filter(r => r.efeito === 'reduz').reduce((s, r) => s + r.reducao, 0)
            const linha = mk('div', 'cb-dano')
            const inp = document.createElement('input')
            inp.type = 'number'
            inp.min = '0'
            inp.className = 'room-input cb-num'
            inp.placeholder = 'Dano'
            inp.setAttribute('aria-label', 'Dano do ataque')
            inp.addEventListener('keydown', e => e.stopPropagation())
            const aplicar = botao('Aplicar dano', 'Desconta dos PV do alvo (PV temporários primeiro)', () => {
                let dano = Math.max(0, parseInt(inp.value, 10) || 0)
                if (metade) dano = Math.floor(dano / 2)
                dano = Math.max(0, dano - reducao)
                aplicarDano(alvo, char, dano, a.criatura)
                anuncioAtual = null
                desenharResultado()
            }, 'principal')
            linha.appendChild(inp)
            linha.appendChild(aplicar)
            el.appendChild(linha)
            const notas = []
            if (metade) notas.push('metade (Esquiva Sobrenatural)')
            if (reducao) notas.push(`−${reducao} (Aparar)`)
            if (notas.length) el.appendChild(mk('div', 'dc-muted', `O app já aplica: ${notas.join(', ')}`))
        }
    } else if (a.tipo === 'magia') {
        el.appendChild(mk('div', 'cb-res-titulo', `${a.criatura} conjura ${a.magia}${a.nivel ? ` (${a.nivel}º)` : ''}`))
        if (!lista.length) el.appendChild(mk('div', 'dc-muted', 'Esperando quem tiver Contramágica…'))
        lista.forEach(r => el.appendChild(mk('div', 'cb-res-reacao ' + (r.efeito === 'anula' ? 'acerto' : ''), `⚡ ${r.nome}: ${r.texto}`)))
        if (lista.some(r => r.efeito === 'anula')) el.appendChild(mk('div', 'cb-res-linha acerto', 'A magia foi anulada.'))
    } else if (a.tipo === 'oportunidade' && alvo) {
        el.appendChild(mk('div', 'cb-res-titulo', `${a.criatura} sai do alcance de ${alvo.nome}`))
        if (!lista.length) el.appendChild(mk('div', 'dc-muted', 'Esperando a decisão do jogador…'))
        lista.forEach(r => el.appendChild(mk('div', 'cb-res-reacao', `⚡ ${r.nome}: ${r.texto}`)))
    }
}

function aplicarDano(alvo, char, dano, criatura) {
    if (dano <= 0) return
    const st = char.stats || {}
    let temp = st.hp_temp || 0
    const absorvido = Math.min(temp, dano)
    temp -= absorvido
    const hp = Math.max(0, (st.hp ?? st.hp_max ?? 0) - (dano - absorvido))
    require('./dndSheet').gravar(char.id, { hp_temp: temp, hp })
    require('./characters').flashCard(char.id, 'red')
    emitir('combate_anuncio', { tipo: 'dano', criatura, alvoId: alvo.id, dano })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Reações do jogador ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** O que o MEU personagem pode fazer em resposta a este anúncio. */
function opcoesDeReacao(a) {
    const ent = minhaEntrada()
    if (!ent) return []
    const ec = economia(ent.id)
    if (!ec || ec.reacaoUsada) return []
    const char = charDaEntrada(ent)
    if (!char) return []
    const stats = char.stats || {}
    const f = dnd.calcular(stats)
    const magia = id => f.magias.find(m => m.id === id)
    const ops = []

    if (a.tipo === 'magia') {
        const cm = magia('contramagica')
        const livres = cm ? espacosLivres(stats, f, 3) : []
        if (cm && livres.length) ops.push({ id: 'contramagica', rotulo: 'Contramágica', espacos: livres, magia: cm })
    }

    if (a.tipo === 'ataque' && a.alvoId === ent.id) {
        const ca = f.ca
        if (a.total < ca) return []   // errou: não precisa de reação
        const ea = magia('escudo-arcano')
        const livres1 = ea ? espacosLivres(stats, f, 1) : []
        if (ea && livres1.length) ops.push({ id: 'escudo', rotulo: 'Escudo Arcano', espacos: livres1, nota: a.total < ca + 5 ? 'o ataque erra' : 'não basta: o ataque ainda acerta' })
        const esc = stats.escolhas || {}
        const esquiva = (stats.classe === 'ladino' && f.nivel >= 5)
            || (stats.classe === 'patrulheiro' && stats.subclasse === 'cacador' && (esc['nv15:defesa-superior'] || []).includes('esquiva'))
        if (esquiva) ops.push({ id: 'esquiva', rotulo: 'Esquiva Sobrenatural', nota: 'metade do dano' })
        const temAparar = Object.entries(esc).some(([k, v]) => /manobras$/.test(k) && Array.isArray(v) && v.includes('aparar'))
        const dadoSup = recursoLivre(char, f, 'superioridade') || recursoLivre(char, f, 'superioridade-talento')
        if (a.corpo && temAparar && dadoSup) ops.push({ id: 'aparar', rotulo: 'Aparar', recurso: dadoSup, nota: `reduz ${dadoSup.dado || 'd6'} + DES` })
        const duelista = dnd.talentosEscolhidos(stats).some(t => t.id === 'duelista-defensivo')
        if (a.corpo && duelista) ops.push({ id: 'duelista', rotulo: 'Duelista Defensivo', nota: a.total < ca + f.prof ? 'o ataque erra (com arma de acuidade)' : 'não basta' })
    }

    if (a.tipo === 'oportunidade' && a.alvoId === ent.id) {
        ops.push({ id: 'oportunidade', rotulo: 'Ataque de oportunidade', nota: `atacar ${a.criatura}` })
    }

    if (a.tipo === 'dano' && a.alvoId === ent.id) {
        const ri = magia('repreensao-infernal')
        if (ri) {
            const racial = ri.sempre && recursoLivre(char, f, 'racial:repreensao-infernal')
            const livres = espacosLivres(stats, f, 1)
            if (racial || livres.length) ops.push({ id: 'repreensao', rotulo: 'Repreensão Infernal', magia: ri, racial: !!racial, espacos: racial ? [] : livres, nota: `${a.criatura} faz teste de DES` })
        }
    }
    return ops
}

function oferecerReacao(a) {
    const ops = opcoesDeReacao(a)
    if (!ops.length) return
    const ent = minhaEntrada()
    const el = overlayPrompt()
    el.innerHTML = ''
    const titulo = {
        magia: `${a.criatura} está conjurando ${a.magia}${a.nivel ? ` (${a.nivel}º nível)` : ''}`,
        ataque: `${a.criatura} acerta você com ${a.total} no ataque`,
        oportunidade: `${a.criatura} saiu do seu alcance`,
        dano: `${a.criatura} causou ${a.dano} de dano em você`,
    }[a.tipo]
    el.appendChild(mk('div', 'cb-prompt-titulo', '⚡ Reação disponível'))
    el.appendChild(mk('div', 'cb-prompt-texto', titulo))

    ops.forEach(op => {
        const linha = mk('div', 'cb-prompt-op')
        let sel = null
        if (op.espacos && op.espacos.length > 1) {
            sel = document.createElement('select')
            sel.className = 'dc-select'
            sel.setAttribute('aria-label', 'Espaço de magia')
            op.espacos.forEach(e => sel.appendChild(new Option(e.id === 'pacto' ? `Pacto ${e.nivel}º` : `${e.nivel}º nível`, e.id)))
        }
        const b = botao(op.rotulo, op.nota || '', () => {
            const espaco = op.espacos && op.espacos.length ? op.espacos.find(e => e.id === (sel ? sel.value : op.espacos[0].id)) : null
            usarReacao(a, ent, op, espaco)
            fecharPrompt()
        }, 'principal')
        linha.appendChild(b)
        if (sel) linha.appendChild(sel)
        if (op.nota) linha.appendChild(mk('span', 'dc-muted', op.nota))
        el.appendChild(linha)
    })
    el.appendChild(botao('Não usar', 'Deixar passar', fecharPrompt))
    el.classList.add('show')
    clearTimeout(promptTimer)
    promptTimer = setTimeout(fecharPrompt, PROMPT_MS)
}

function usarReacao(a, ent, op, espaco) {
    const char = charDaEntrada(ent)
    if (!char) return
    const f = dnd.calcular(char.stats || {})
    const nome = char.name
    let texto = '', efeito = 'nada', reducao = 0

    if (op.id === 'contramagica') {
        gastarEspaco(char, espaco)
        if (!a.nivel || espaco.nivel >= a.nivel) {
            texto = `Contramágica (${espaco.nivel}º) anula ${a.magia}.`
            efeito = 'anula'
        } else {
            const cd = 10 + a.nivel
            const r = rolagem.testeD20({ personagem: nome, rotulo: `Contramágica contra ${a.magia} (CD ${cd})`, bonus: f.mods[op.magia.atributo] })
            efeito = r.total >= cd ? 'anula' : 'falha'
            texto = `Contramágica (${espaco.nivel}º): ${r.total} contra CD ${cd}, ${efeito === 'anula' ? 'anula' : 'não anula'} ${a.magia}.`
        }
    } else if (op.id === 'escudo') {
        gastarEspaco(char, espaco)
        efeito = a.total < f.ca + 5 ? 'erra' : 'nada'
        texto = `Escudo Arcano (+5 CA até o próximo turno): ${efeito === 'erra' ? 'o ataque erra' : 'o ataque ainda acerta'}.`
    } else if (op.id === 'esquiva') {
        efeito = 'metade'
        texto = 'Esquiva Sobrenatural: sofre metade do dano.'
    } else if (op.id === 'aparar') {
        gastarRecurso(char, op.recurso.id)
        const r = rolagem.rolarDados({ personagem: nome, rotulo: 'Aparar (reduz o dano)', expressao: '1' + (op.recurso.dado || 'd6'), bonus: f.mods.des, tipo: 'dano' })
        efeito = 'reduz'
        reducao = r.total
        texto = `Aparar: reduz o dano em ${r.total}.`
    } else if (op.id === 'duelista') {
        efeito = a.total < f.ca + f.prof ? 'erra' : 'nada'
        texto = `Duelista Defensivo (+${f.prof} CA): ${efeito === 'erra' ? 'o ataque erra' : 'o ataque ainda acerta'}.`
    } else if (op.id === 'oportunidade') {
        texto = `ataque de oportunidade em ${a.criatura}.`
    } else if (op.id === 'repreensao') {
        let dados = '3d10'   // racial: conjurada como 2º nível
        if (op.racial) gastarRecurso(char, 'racial:repreensao-infernal')
        else { gastarEspaco(char, espaco); dados = `${1 + espaco.nivel}d10` }
        rolagem.rolarDados({ personagem: nome, rotulo: `Repreensão Infernal em ${a.criatura} (CD ${op.magia.cd} DES)`, expressao: dados, tipo: 'dano', tipoDano: 'fogo' })
        texto = `Repreensão Infernal em ${a.criatura} (${dados} de fogo, CD ${op.magia.cd} DES para metade).`
    }
    emitir('combate_reacao', { anuncioId: a.id, entradaId: ent.id, reacao: op.id, texto, efeito, reducao })
}

function overlayPrompt() {
    let el = document.getElementById('combatePrompt')
    if (!el) {
        el = mk('div')
        el.id = 'combatePrompt'
        el.setAttribute('role', 'alertdialog')
        el.setAttribute('aria-label', 'Reação disponível')
        segurar(el)
        document.body.appendChild(el)
    }
    return el
}

function fecharPrompt() {
    clearTimeout(promptTimer)
    const el = document.getElementById('combatePrompt')
    if (el) el.classList.remove('show')
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Peças ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function overlay(id) {
    let ov = document.getElementById(id)
    if (!ov) {
        ov = mk('div', 'cb-overlay')
        ov.id = id
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove() })
        segurar(ov)
        document.body.appendChild(ov)
    }
    return ov
}

function rotulado(rotulo, campo) {
    const w = mk('label', 'cb-campo')
    w.appendChild(mk('span', 'input-label', rotulo))
    w.appendChild(campo)
    return w
}

function botao(texto, titulo, onClick, cls) {
    const b = mk('button', 'cb-btn' + (cls ? ' ' + cls : ''), texto)
    b.type = 'button'
    if (titulo) b.title = titulo
    b.addEventListener('click', onClick)
    return b
}

let avisoTimer = null
function aviso(texto) {
    let el = document.getElementById('combateAviso')
    if (!el) {
        el = mk('div')
        el.id = 'combateAviso'
        el.setAttribute('role', 'status')
        document.body.appendChild(el)
    }
    el.textContent = texto
    el.classList.add('show')
    clearTimeout(avisoTimer)
    avisoTimer = setTimeout(() => el.classList.remove('show'), 2500)
}

/** As telas da batalha se redesenham no clique; ver segurarCliques em dndSheet. */
function segurar(el) {
    require('./dndSheet').segurarCliques(el)
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = { aoEstado, aoAnuncio, aoReacao, aoConjurar, atualizarBotaoMestre, limpar, minhaEntrada }
