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
const D = require('./dndDados')
const CD = require('./dndCondicoes')

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

/** A entrada do personagem na batalha (a dele, não a do familiar ou companheiro). */
function entradaDoChar(charId) {
    return emBatalha() ? state.combate.ordem.find(e => e.charId === charId && e.tipo === 'pj') || null : null
}

/** É a vez deste personagem? (a vez do aliado dele não conta) */
function turnoDoChar(charId) {
    const atual = entradaAtual()
    return !!atual && atual.tipo === 'pj' && atual.charId === charId
}

/**
 * Pode gastar isto agora? Devolve '' ou o motivo. Fora da batalha tudo vale,
 * e o mestre não é travado (liberdade da mesa).
 *   custo: 'acao' | 'bonus' | 'reacao' | 'livre'
 */
function podeGastar(char, custo) {
    if (!emBatalha() || state.isRoomMaster || custo === 'livre' || !custo) return ''
    const ent = entradaDoChar(char.id)
    if (!ent) return ''
    const st = (charDaEntrada(ent) || char).stats || {}
    if (CD.semAcoes(st)) return 'Incapacitado: sem ações nem reações'
    if (CD.caido(st)) return 'A 0 PV: só o teste contra a morte'
    if (ent.surpreso) return 'Surpreso: não age nem reage até o primeiro turno passar'
    const ec = economia(ent.id)
    if (!ec) return ''
    if (custo === 'reacao') return ec.reacaoUsada ? 'A reação já foi usada nesta rodada' : ''
    if (!turnoDoChar(char.id)) return 'Não é o seu turno'
    if (custo === 'acao') return ec.acoesUsadas >= ec.acoes ? 'A ação já foi usada neste turno' : ''
    if (custo === 'bonus') return ec.bonusUsada ? 'A ação bônus já foi usada neste turno' : ''
    return ''
}

/** Gasta a ação, a ação bônus ou a reação (só numa batalha, no turno certo). */
function gastarCusto(char, custo) {
    if (!emBatalha()) return
    const ent = entradaDoChar(char.id)
    const ec = ent && economia(ent.id)
    if (!ec) return
    if (custo === 'acao') gastar(ent.id, 'acoesUsadas', Math.min(ec.acoes, ec.acoesUsadas + 1))
    else if (custo === 'bonus') gastar(ent.id, 'bonusUsada', true)
    else if (custo === 'reacao') gastar(ent.id, 'reacaoUsada', true)
}

/** O custo de conjurar uma magia pelo tempo de conjuração (Acelerada vira bônus). */
function custoDaMagia(magia, acelerada) {
    const t = (magia.tempo || '').toLowerCase()
    if (t.includes('reação')) return 'reacao'
    if (t.includes('bônus') || (acelerada && /^1 ação/.test(t))) return 'bonus'
    return 'acao'   // 1 ação, ou mais (1 minuto...): na batalha ocupa a ação
}

/** Muda a cada turno e a cada rodada: serve para "uma vez por turno". */
function chaveDoTurno() {
    return emBatalha() ? `${state.combate.rodada}:${state.combate.turno}` : 'fora'
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
    // Muda aqui mesmo e o servidor confirma depois: sem isso a tela fica um
    // passo atrás e mostra liberado o que já foi gasto
    const ec = economia(id)
    if (ec && campo in ec) {
        ec[campo] = typeof ec[campo] === 'boolean' ? !!valor : Math.max(0, Math.min(4, Math.round(+valor) || 0))
        redesenharEconomia()
    }
    emitir('combate_gastar', { id, campo, valor })
}

/** Redesenha barra, palco e painéis da ficha depois do clique que gastou. */
let redesenhoMarcado = false
function redesenharEconomia() {
    if (redesenhoMarcado) return
    redesenhoMarcado = true
    setTimeout(() => {
        redesenhoMarcado = false
        if (!emBatalha()) return
        desenharBarra()
        desenharTurno()
        atualizarFichaAberta()
    }, 0)
}

/**
 * A ficha aberta mostra botões travados ou livres conforme a economia do
 * turno: quando ela muda (gasto, turno novo), os painéis abertos se refazem.
 * Não mexe enquanto alguém digita ou escolhe num campo dos painéis.
 */
let economiaDaFicha = ''
function atualizarFichaAberta() {
    const char = state.statPopupChar
    const ent = char && entradaDoChar(char.id)
    if (!ent) { economiaDaFicha = ''; return }
    const assinatura = `${char.id}|${chaveDoTurno()}|${JSON.stringify(economia(ent.id))}`
    if (assinatura === economiaDaFicha) return
    const foco = document.activeElement
    if (foco && /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName) && foco.closest('[id^="dnd"]')) return
    economiaDaFicha = assinatura
    require('./dndSheet').atualizarPaineisAbertos()
}

/**
 * Para o clique: '' se pode gastar; senão mostra o motivo num aviso e o
 * devolve (o botão podia estar desenhado antes da economia mudar).
 */
function travado(char, custo) {
    const m = podeGastar(char, custo)
    if (m) aviso(m)
    return m
}

function podeMexer(ent) {
    return !!state.isRoomMaster || (ent && minhaEntrada() && minhaEntrada().id === ent.id)
}

/** Espaços de magia livres a partir de um nível: [{ id: '3' | 'pacto', nivel }] */
function espacosLivres(stats, f, minimo) {
    return dnd.espacosLivres(stats, f, minimo)
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
    if (antes && !state.combate) require('./dndArmas').aoFimDaBatalha()
    desenharBarra()
    desenharTurno()
    desenharResultado()
    atualizarBotaoMestre()
    atualizarFichaAberta()
    // Efeitos que contavam rodadas (ou a batalha que acabou)
    require('./dndEfeitos').limparMeus()

    // Começou o meu turno: um aviso rápido
    const atual = entradaAtual()
    const mudouTurno = !antes || antes.turno !== (state.combate && state.combate.turno) || antes.rodada !== (state.combate && state.combate.rodada)
    if (atual && mudouTurno && minhaEntrada() && atual.id === minhaEntrada().id) {
        const char = charDaEntrada(atual)
        const st = (char && char.stats) || {}
        const ef = st.efeitos || {}
        if (char && (ef.esquivando || ef.desengajou || ef.nevoa)) {
            const novo = { ...ef }
            delete novo.esquivando
            delete novo.desengajou
            const campos = { efeitos: novo }
            if (ef.nevoa) {
                delete novo.nevoa
                campos.condicoes = (st.condicoes || []).filter(c => c !== 'invisivel')
            }
            require('./dndSheet').gravar(char.id, campos)
        }
        aviso(CD.caido(st) && !(st.morte && st.morte.estavel) ? `💀 ${atual.nome}: teste contra a morte!` : `⚔ Seu turno, ${atual.nome}!`)
        if (char) require('./dndEfeitos').aoComecarTurno(char)
    }
}

function limpar() {
    state.combate = null
    editandoOrdem = false
    anuncioAtual = null
    ;['combateBarra', 'combateTurno', 'combateSetup', 'combateAnuncio', 'combateResultado', 'combatePrompt']
        .forEach(id => { const el = document.getElementById(id); if (el) el.remove() })
    require('./dndCena').limpar()
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
    // Pedir teste (perícia, resistência, em grupo): com ou sem batalha
    let teste = document.getElementById('testeMasterBtn')
    if (!teste) {
        teste = btn.cloneNode(false)
        teste.id = 'testeMasterBtn'
        delete teste.dataset.inited
        teste.textContent = '🎲 Pedir teste'
        teste.addEventListener('click', () => require('./dndTestes').abrirPedido())
        btn.after(teste)
    }
    teste.style.display = btn.style.display
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
    const surpresos = new Set()
    const caixaSurpresa = (ligado, aoMudar) => {
        const l = mk('label', 'dc-check cb-surpresa')
        l.title = 'Surpreendido: perde o primeiro turno e só reage depois dele'
        const c = document.createElement('input')
        c.type = 'checkbox'
        c.checked = ligado
        c.addEventListener('change', () => aoMudar(c.checked))
        l.appendChild(c)
        l.appendChild(mk('span', null, 'surpreso'))
        return l
    }
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
        listaPj.appendChild(caixaSurpresa(false, v => { if (v) surpresos.add(character.id); else surpresos.delete(character.id) }))
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
            const pv = document.createElement('input')
            pv.className = 'room-input cb-ini'
            pv.type = 'number'
            pv.min = '1'
            pv.placeholder = 'PV'
            pv.title = 'Opcional: os jogadores veem só a barra'
            pv.setAttribute('aria-label', 'PV da criatura (opcional)')
            pv.value = c.pv || ''
            pv.addEventListener('input', () => { c.pv = pv.value })
            pv.addEventListener('keydown', e => e.stopPropagation())
            const d20 = mk('button', 'sp-adj-btn cb-d20', '🎲')
            d20.type = 'button'
            d20.title = 'Rolar um d20 (some o bônus da criatura)'
            d20.addEventListener('click', () => { c.iniciativa = String(1 + Math.floor(Math.random() * 20)); ini.value = c.iniciativa })
            const tirar = mk('button', 'sp-adj-btn', '✕')
            tirar.type = 'button'
            tirar.title = 'Remover'
            tirar.addEventListener('click', () => { criaturasRascunho.splice(i, 1); desenharCriaturas() })
            l.appendChild(nome); l.appendChild(ini); l.appendChild(d20); l.appendChild(pv)
            l.appendChild(caixaSurpresa(!!c.surpreso, v => { c.surpreso = v }))
            l.appendChild(tirar)
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
        const ordem = montarOrdem(pjs.filter(x => marcados.has(x.character.id)), surpresos)
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
function montarOrdem(pjs, surpresos = new Set()) {
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
            surpreso: surpresos.has(character.id),
        }
    })
    // Familiar e companheiro animal rolam a própria iniciativa (LdJ p. 119, p. 241)
    pjs.forEach(({ playerName, character }) => {
        ;((character.stats || {}).companheiros || []).filter(a => a.tipo === 'companheiro' || a.tipo === 'familiar').forEach(a => {
            const cr = require('./dndCriaturas').criatura(a.criatura)
            if (!cr) return
            const des = require('./dndCriaturas').mod(cr.atributos.des)
            const r = rolagem.rolarD20('normal')
            const total = r.natural + des
            const nome = `${a.nome || cr.nome} (${character.name})`
            linhas.push(`${nome} d20(${r.natural}) ${dnd.sinal(des)} = ${total}`)
            ordem.push({ id: `al:${character.id}:${a.id}`, tipo: 'criatura', nome, charId: character.id, dono: playerName, iniciativa: total, desempate: des + 0.4 + Math.random() / 100,
                surpreso: surpresos.has(character.id) })
        })
    })
    criaturasRascunho.filter(c => c.nome.trim()).forEach(c => {
        const pv = parseInt(c.pv, 10) > 0 ? parseInt(c.pv, 10) : null
        ordem.push({
            id: 'cr:' + Math.random().toString(36).slice(2, 9), tipo: 'criatura', nome: c.nome.trim(),
            iniciativa: parseInt(c.iniciativa, 10) || 0, desempate: Math.random() / 100, pv, pvMax: pv,
            surpreso: !!c.surpreso,
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
            // O aliado (al:dono:id) usa o ícone da criatura dele
            const aliado = e.tipo === 'criatura' && e.charId
                && ((ch && ch.stats && ch.stats.companheiros) || []).find(x => e.id.endsWith(':' + x.id))
            const icone = aliado ? require('./dndCriaturas').icone(aliado.criatura)
                : e.tipo === 'criatura' && e.charId ? 'lorc/paw' : e.tipo === 'criatura' ? ICONE_CRIATURA : (cls && cls.icone) || 'lorc/crossed-swords'
            foto.appendChild(magiasUI.icone(icone))
        }
        foto.appendChild(mk('span', 'cb-ini', String(e.iniciativa)))
        el.appendChild(foto)
        el.appendChild(mk('div', 'cb-nome', e.nome))
        if (e.tipo === 'pj') el.appendChild(fichas(e, true))
        // O que o mestre precisa saber ao atacar este personagem
        if (e.tipo === 'pj') {
            const marcas = marcasDoAlvo(charDaEntrada(e))
            if (marcas.length) {
                const m = mk('div', 'cb-marcas', marcas.map(x => x.icone).join(''))
                m.title = marcas.map(x => x.texto).join('\n')
                el.appendChild(m)
            }
        }

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
    const pv = document.createElement('input')
    pv.className = 'room-input cb-ini'
    pv.type = 'number'
    pv.min = '1'
    pv.placeholder = 'PV'
    pv.setAttribute('aria-label', 'PV da criatura nova (opcional)')
    pv.addEventListener('keydown', e => e.stopPropagation())
    const add = botao('+ Entrar na ordem', 'Acrescentar a criatura na ordem', () => {
        if (!nome.value.trim()) return nome.focus()
        const vida = parseInt(pv.value, 10) > 0 ? parseInt(pv.value, 10) : null
        const ordem = ordenar([...state.combate.ordem, {
            id: 'cr:' + Math.random().toString(36).slice(2, 9), tipo: 'criatura', nome: nome.value.trim(),
            iniciativa: parseInt(ini.value, 10) || 0, desempate: Math.random() / 100, pv: vida, pvMax: vida,
        }])
        emitir('combate_ordem', { ordem })
    })
    f.appendChild(nome); f.appendChild(ini); f.appendChild(pv); f.appendChild(add)
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

/**
 * O turno agora acontece no palco da batalha (dndCena.js): menu de comandos
 * de quem joga, o grupo embaixo e as criaturas em cima. Aqui só repassa.
 */
function desenharTurno() {
    const velho = document.getElementById('combateTurno')
    if (velho) velho.remove()
    require('./dndCena').desenhar()
}

/** Abre a ficha do personagem já no painel de armas. */
function abrirArmas(char) {
    const card = document.querySelector(`.char-card[data-char-id="${char.id}"]`)
    if (!card) return
    if (!state.statPopupChar || state.statPopupChar.id !== char.id || !document.getElementById('statPopup').classList.contains('visible')) card.click()
    const atual = state.statPopupChar
    if (atual && atual.id === char.id) require('./dndArmas').abrirPainel(atual.stats || {}, true)
}

/** Chamado pela ficha ao conjurar: gasta a ação certa conforme o tempo da magia. */
function aoConjurar(char, magia, opc = {}) {
    if (!emBatalha() || !entradaDoChar(char.id)) return
    const custo = custoDaMagia(magia, opc.acelerada)
    if (turnoDoChar(char.id)) {
        const r = magiasDoTurno(char)
        if (custo === 'bonus') r.bonus = true
        else if (custo === 'acao') r.outras.push({ nivel: magia.nivel, tempo: (magia.tempo || '').toLowerCase() })
    }
    gastarCusto(char, custo)
}

// Magias do turno, para a regra da magia de ação bônus (LdJ p. 202)
const turnoMagias = {}
function magiasDoTurno(char) {
    const chave = chaveDoTurno()
    if (!turnoMagias[char.id] || turnoMagias[char.id].chave !== chave) turnoMagias[char.id] = { chave, bonus: false, outras: [] }
    return turnoMagias[char.id]
}

/**
 * Quem conjura uma magia com ação bônus só pode conjurar, no mesmo turno,
 * um truque de 1 ação. Devolve o motivo do bloqueio ou ''.
 */
function regraMagiaBonus(char, magia, acelerada) {
    if (!emBatalha() || !turnoDoChar(char.id)) return ''
    const r = magiasDoTurno(char)
    const t = (magia.tempo || '').toLowerCase()
    const ehBonus = custoDaMagia(magia, acelerada) === 'bonus'
    if (ehBonus && r.outras.some(o => o.nivel > 0 || !/^1 ação/.test(o.tempo))) return 'Já conjurou outra magia neste turno: a de ação bônus só junto com um truque de 1 ação'
    if (!ehBonus && !t.includes('reação') && r.bonus && !(magia.nivel === 0 && /^1 ação/.test(t))) return 'Conjurou magia de ação bônus neste turno: agora só um truque de 1 ação'
    return ''
}

/** Gasta a ação bônus do personagem, se for o turno dele numa batalha. */
function gastarBonusDe(char) {
    const ent = entradaDoChar(char.id)
    if (ent && turnoDoChar(char.id)) gastar(ent.id, 'bonusUsada', true)
}

/** Para o mestre: o que muda num ataque contra este personagem agora. */
function marcasDoAlvo(char) {
    if (!char) return []
    const st = char.stats || {}
    const out = []
    if (CD.morto(st)) return [{ icone: '💀', texto: 'Morto' }]
    if (CD.caido(st)) out.push({ icone: '💀', texto: 'A 0 PV: ataque a 1,5 m é crítico; cada acerto é uma falha no teste contra a morte (crítico, duas)' })
    const ef = st.efeitos || {}
    if (ef.esquivando) out.push({ icone: '🛡', texto: 'Esquivando: ataques contra ele com desvantagem' })
    if (ef.desengajou) out.push({ icone: '🏃', texto: 'Desengajou: sem ataque de oportunidade contra ele' })
    if (ef.furia) out.push({ icone: '🔥', texto: 'Em fúria: resistência a concussão, cortante e perfurante' })
    CD.condicoesAtivas(st).forEach(c => {
        const cond = D.CONDICOES[c]
        if (cond.efeitos.contra) out.push({ icone: cond.icone, texto: `${cond.nome}: ataques contra ele com ${cond.efeitos.contra}` })
    })
    if (st.concentracao) out.push({ icone: '◉', texto: `Concentrando em ${st.concentracao.nome}` })
    return out
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Anúncios do mestre ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

let abaAnuncio = 'ataque'

/** `aba`: 'ataque' | 'magia' | 'oportunidade' (o palco abre direto na certa). */
function abrirAnuncio(aba) {
    if (typeof aba === 'string') abaAnuncio = aba
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
        // Cobertura do alvo (LdJ p. 196): meia +2, três quartos +5 na CA
        const cobertura = document.createElement('select')
        cobertura.className = 'dc-select'
        cobertura.setAttribute('aria-label', 'Cobertura do alvo')
        ;[['0', 'Sem cobertura'], ['2', 'Meia cobertura (+2 CA)'], ['5', 'Três quartos (+5 CA)']].forEach(([v, t]) => cobertura.appendChild(new Option(t, v)))
        const dicas = mk('div', 'cb-dicas')
        const mostrarDicas = () => {
            const ent = pjs.find(p => p.id === valorDe(alvo))
            const marcas = marcasDoAlvo(ent && charDaEntrada(ent))
            dicas.textContent = marcas.length ? marcas.map(m => `${m.icone} ${m.texto}`).join(' · ') : ''
        }
        alvo.querySelector('select').addEventListener('change', mostrarDicas)
        mostrarDicas()
        ;[cr, alvo, dicas, total, corpo, rotulado('Cobertura', cobertura)].forEach(x => form.appendChild(x))
        enviar = () => ({ tipo: 'ataque', criatura: valorDe(cr) || 'Criatura', alvoId: valorDe(alvo), total: +valorDe(total) || 0, corpo: cb.checked, cobertura: +cobertura.value || 0 })
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
        // Perdição na criatura que ataca: −1d4 no ataque (LdJ)
        const cr = state.combate.ordem.find(e => e.tipo === 'criatura' && !e.charId && e.nome === a.criatura)
        if (a.tipo === 'ataque' && cr && require('./dndEfeitos').marcasDaCriatura(cr.id).some(m => m.tipo === 'perdicao')) {
            anuncioAtual.perdicao = 1 + Math.floor(Math.random() * 4)
            emitir('chat_message', { playerName: '✦ Magia', message: `☠ Perdição: ${a.criatura} tira ${anuncioAtual.perdicao} do ataque (${a.total} → ${a.total - anuncioAtual.perdicao}).`, type: 'text' })
        }
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
        // Com cobertura, a CA sobe (meia +2, três quartos +5)
        const ca = char ? dnd.calcular(char.stats || {}).ca + (a.cobertura || 0) : null
        // Reação com desvantagem: o mestre rola o ataque de novo e fica o menor.
        // Palavras de Interrupção tiram o dado do total.
        const desvantagem = lista.some(r => r.efeito === 'desvantagem')
        const esperandoSegundo = desvantagem && a.segundoTotal == null
        const diminui = lista.filter(r => r.efeito === 'diminui').reduce((s, r) => s + r.reducao, 0) + (a.perdicao || 0)
        const total = Math.min(a.total, a.segundoTotal ?? a.total) - diminui
        const errouPorReacao = lista.some(r => r.efeito === 'erra')
        const acertou = ca != null && total >= ca && !errouPorReacao
        el.appendChild(mk('div', 'cb-res-titulo', `${a.criatura} → ${alvo.nome}`))
        const rotuloTotal = total !== a.total ? `Ataque ${total} (era ${a.total})` : `Ataque ${a.total}`
        el.appendChild(mk('div', 'cb-res-linha ' + (esperandoSegundo ? '' : acertou ? 'acerto' : 'erro'),
            ca == null ? `${rotuloTotal} (CA desconhecida)` : esperandoSegundo ? `${rotuloTotal} contra CA ${ca}: falta o 2º total` : `${rotuloTotal} contra CA ${ca}: ${acertou ? 'ACERTOU' : 'ERROU'}`))
        lista.forEach(r => el.appendChild(mk('div', 'cb-res-reacao', `⚡ ${r.nome}: ${r.texto}`)))
        if (a.perdicao) el.appendChild(mk('div', 'cb-res-reacao', `☠ Perdição: −${a.perdicao} no ataque`))
        if (esperandoSegundo) {
            const linha = mk('div', 'cb-dano')
            const inp2 = document.createElement('input')
            inp2.type = 'number'
            inp2.className = 'room-input cb-num'
            inp2.placeholder = '2º total'
            inp2.setAttribute('aria-label', 'Segundo total do ataque (desvantagem)')
            inp2.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') usar.click() })
            const usar = botao('Usar o menor', 'Desvantagem: role o ataque de novo e digite o total', () => {
                const v = parseInt(inp2.value, 10)
                if (Number.isNaN(v)) return
                a.segundoTotal = v
                desenharResultado()
            }, 'principal')
            linha.appendChild(mk('span', 'dc-muted', 'Desvantagem: role de novo'))
            linha.appendChild(inp2)
            linha.appendChild(usar)
            el.appendChild(linha)
            return
        }

        // Armadura de Agathys: acerto corpo-a-corpo enquanto há PV temporários dela
        if (acertou && char && a.corpo) {
            const st = char.stats || {}
            if ((st.efeitos || {}).agathys && (st.hp_temp || 0) > 0) el.appendChild(mk('div', 'dc-muted', `Armadura de Agathys: ${a.criatura} sofre ${5 * st.efeitos.agathys} de frio ao aplicar o dano.`))
        }

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
            const marca = (rot, titulo) => {
                const l = mk('label', 'dc-check')
                l.title = titulo
                const c = document.createElement('input')
                c.type = 'checkbox'
                l.appendChild(c)
                l.appendChild(mk('span', null, rot))
                return { l, c }
            }
            // O tipo do dano é o do ataque da criatura, que só o mestre conhece:
            // em vez de escolher um tipo, ele marca se o alvo resiste ou é imune
            // (a ficha diz a quê) e se foi golpe físico não mágico
            const fa = dnd.calcular(char.stats || {})
            const def = CD.defesasContraDano(char.stats || {}, fa)
            const crit = marca('crítico', 'Num personagem a 0 PV, conta duas falhas')
            const imune = def.imune.size ? marca(`imune a ${[...def.imune].join(', ')}`, 'O dano é de um tipo a que o alvo é imune: zera') : null
            const resiste = def.resiste.size && !def.tudo ? marca(`resiste a ${[...def.resiste].join(', ')}`, 'O dano é de um tipo a que o alvo resiste: metade') : null
            const fisico = fa.armadura && fa.armadura.tipo === 'pesada' && fa.talentos.includes('maestria-armadura-pesada')
                ? marca('golpe físico não mágico', 'Maestria em Armadura Pesada: −3 em concussão, cortante ou perfurante de arma não mágica') : null
            const aplicar = botao('Aplicar dano', 'Resistência, PV temporários, Forma Selvagem e 0 PV, como manda o livro', () => {
                let dano = Math.max(0, parseInt(inp.value, 10) || 0)
                if (metade) dano = Math.floor(dano / 2)
                dano = Math.max(0, dano - reducao)
                aplicarDano(alvo, char, dano, a.criatura, {
                    corpo: !!a.corpo, critico: crit.c.checked, imune: !!(imune && imune.c.checked),
                    resistente: !!(resiste && resiste.c.checked), fisicoNaoMagico: !!(fisico && fisico.c.checked),
                })
                anuncioAtual = null
                desenharResultado()
            }, 'principal')
            linha.appendChild(inp)
            linha.appendChild(aplicar)
            el.appendChild(linha)
            const extras = mk('div', 'cb-dano')
            ;[crit, imune, resiste, fisico].filter(Boolean).forEach(m => extras.appendChild(m.l))
            el.appendChild(extras)
            const notas = []
            if (metade) notas.push('metade (Esquiva Sobrenatural)')
            lista.filter(r => r.efeito === 'reduz').forEach(r => notas.push(`−${r.reducao} (${r.reacao === 'defletir' ? 'Defletir Projéteis' : 'Aparar'})`))
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

function aplicarDano(alvo, char, dano, criatura, op = {}) {
    // Armadura de Agathys: quem acerta corpo-a-corpo enquanto ela tem os PV
    // temporários sofre 5 de frio por nível da magia (mesmo com dano zerado)
    const st = char.stats || {}
    const agathys = op.corpo && (st.efeitos || {}).agathys && (st.hp_temp || 0) > 0 ? 5 * st.efeitos.agathys : 0
    if (dano > 0) {
        const r = require('./dndEstadoUI').danoNoPersonagem(char, dano, { ...op, fonte: criatura })
        emitir('combate_anuncio', { tipo: 'dano', criatura, alvoId: alvo.id, dano: r.dano, tipoDano: op.tipo || '', corpo: !!op.corpo })
    }
    if (agathys) {
        emitir('chat_message', { playerName: '✦ Magia', message: `Armadura de Agathys: ${criatura} sofre ${agathys} de frio.`, type: 'text' })
        const cr = state.combate.ordem.find(e => e.tipo === 'criatura' && !e.charId && e.nome === criatura && e.pvMax != null)
        if (cr) emitir('combate_pv', { id: cr.id, pv: Math.max(0, (cr.pv ?? cr.pvMax) - agathys) })
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Reações do jogador ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** O que o MEU personagem pode fazer em resposta a este anúncio. */
function opcoesDeReacao(a) {
    const ent = minhaEntrada()
    if (!ent) return []
    const ec = economia(ent.id)
    if (!ec || ec.reacaoUsada || ent.surpreso) return []
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

    if (a.tipo === 'ataque') {
        const alvoEnt = state.combate.ordem.find(e => e.id === a.alvoId)
        const alvoChar = alvoEnt && charDaEntrada(alvoEnt)
        const caAlvo = alvoChar ? dnd.calcular(alvoChar.stats || {}).ca + (a.cobertura || 0) : null
        if (caAlvo != null && a.total < caAlvo) return []   // errou: não precisa de reação
        const sub = stats.subclasse
        // Palavras de Interrupção (bardo do Conhecimento, 3º): tira um dado de inspiração do ataque
        const insp = stats.classe === 'bardo' && sub === 'conhecimento' && f.nivel >= 3 && recursoLivre(char, f, 'inspiracao-bardo')
        if (insp) ops.push({ id: 'interrupcao', rotulo: 'Palavras de Interrupção', recurso: insp, nota: `gasta uma inspiração: −1${insp.dado || 'd6'} no ataque (até 18 m)` })
        // Dobrar a Sorte (feiticeiro Selvagem, 6º): 2 pontos de feitiçaria, −1d4 no ataque
        const feit = stats.classe === 'feiticeiro' && sub === 'selvagem' && f.nivel >= 6 && f.recursos.find(r => r.id === 'feiticaria')
        if (feit && feit.max - ((stats.recursos_usados || {}).feiticaria || 0) >= 2) ops.push({ id: 'dobrar', rotulo: 'Dobrar a Sorte', nota: '2 pontos de feitiçaria: −1d4 no ataque' })
        if (a.alvoId !== ent.id) {
            // Estilo Proteção: com escudo, desvantagem no ataque contra quem está a até 1,5 m
            if (f.estilos.includes('protecao') && dnd.escudoEmpunhado(stats)) ops.push({ id: 'protecao', rotulo: 'Proteção', nota: `se estiver a até 1,5 m de ${alvoEnt ? alvoEnt.nome : 'o alvo'}: desvantagem no ataque` })
            // Labareda Aprimorada (clérigo da Luz, 6º): protege também quem está a até 9 m
            const lab = stats.classe === 'clerigo' && sub === 'luz' && f.nivel >= 6 && recursoLivre(char, f, 'labareda')
            if (lab) ops.push({ id: 'labareda', rotulo: 'Labareda Protetora', recurso: lab, nota: `desvantagem no ataque contra ${alvoEnt ? alvoEnt.nome : 'o alvo'} (até 9 m)` })
            return ops
        }
        const ca = f.ca + (a.cobertura || 0)
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
        // Inspiração em Combate (bardo da Bravura): o dado guardado vai na CA contra este ataque
        const inspCa = require('./dndEfeitos').ativos(stats).find(e => e.tipo === 'inspiracao-bardo' && e.bravura && e.dado)
        if (inspCa) ops.push({ id: 'insp-ca', rotulo: 'Inspiração na CA', efeitoUid: inspCa.uid, dado: inspCa.dado, nota: `+1${inspCa.dado} na CA contra este ataque (gasta a inspiração)` })
        // Labareda Protetora (clérigo da Luz, 1º) e Proteção Entrópica (bruxo do Grande Antigo, 6º)
        const lab = stats.classe === 'clerigo' && sub === 'luz' && recursoLivre(char, f, 'labareda')
        if (lab) ops.push({ id: 'labareda', rotulo: 'Labareda Protetora', recurso: lab, nota: 'desvantagem no ataque (o mestre rola de novo)' })
        const entropica = stats.classe === 'bruxo' && sub === 'grande-antigo' && f.nivel >= 6 && recursoLivre(char, f, 'protecao-entropica')
        if (entropica) ops.push({ id: 'entropica', rotulo: 'Proteção Entrópica', recurso: entropica, nota: 'desvantagem no ataque; se errar, vantagem no seu próximo ataque contra ela' })
        // Defletir Projéteis (monge, 3º): só contra ataque à distância com arma
        if (!a.corpo && stats.classe === 'monge' && f.nivel >= 3) ops.push({ id: 'defletir', rotulo: 'Defletir Projéteis', nota: `reduz o dano em 1d10 ${dnd.sinal(f.mods.des + f.nivel)}` })
        // Ira da Tormenta (clérigo da Tempestade, 1º): quem acerta corpo-a-corpo sofre 2d8; o livro deixa escolher o tipo
        const ira = a.corpo && stats.classe === 'clerigo' && sub === 'tempestade' && recursoLivre(char, f, 'ira-tormenta')
        if (ira) {
            const cd = f.conjuracao ? f.conjuracao.cd : 8 + f.prof + f.mods.sab
            ;['elétrico', 'trovejante'].forEach(tipo => ops.push({ id: 'ira', tipoDano: tipo, cd, rotulo: `Ira da Tormenta (${tipo})`, recurso: ira, nota: `2d8 em ${a.criatura}, DES CD ${cd} para metade` }))
        }
    }

    if (a.tipo === 'oportunidade' && a.alvoId === ent.id) {
        ops.push({ id: 'oportunidade', rotulo: 'Ataque de oportunidade', armas: armasCorpo(stats), nota: `atacar ${a.criatura}` })
    }

    if (a.tipo === 'dano' && a.alvoId === ent.id) {
        const ri = magia('repreensao-infernal')
        if (ri) {
            const racial = ri.sempre && recursoLivre(char, f, 'racial:repreensao-infernal')
            const livres = espacosLivres(stats, f, 1)
            if (racial || livres.length) ops.push({ id: 'repreensao', rotulo: 'Repreensão Infernal', magia: ri, racial: !!racial, espacos: racial ? [] : livres, nota: `${a.criatura} faz teste de DES` })
        }
        // Névoa de Fuga (bruxo da Arquifada, 6º)
        const nevoa = stats.classe === 'bruxo' && stats.subclasse === 'arquifada' && f.nivel >= 6 && recursoLivre(char, f, 'nevoa-fuga')
        if (nevoa) ops.push({ id: 'nevoa', rotulo: 'Névoa de Fuga', recurso: nevoa, nota: 'fica invisível até o seu próximo turno e se teleporta até 18 m' })
        // Retaliação (bárbaro Furioso, 14º): ataque corpo-a-corpo em quem causou o dano a 1,5 m
        if (a.corpo && stats.classe === 'barbaro' && stats.subclasse === 'furioso' && f.nivel >= 14) {
            ops.push({ id: 'retaliacao', rotulo: 'Retaliação', armas: armasCorpo(stats), nota: `atacar ${a.criatura}` })
        }
    }
    return ops
}

/** Armas corpo-a-corpo (e o golpe desarmado), para ataque de oportunidade e Retaliação. */
function armasCorpo(stats) {
    return dnd.armasDoPersonagem(stats).filter(x => x.base === dnd.DESARMADO || !D.ARMAS[x.base].distancia)
        .map(x => ({ id: x.id, nome: x.base === dnd.DESARMADO ? 'Golpe desarmado' : (x.nome || D.ARMAS[x.base].nome), item: x }))
}

function oferecerReacao(a) {
    const ops = opcoesDeReacao(a)
    if (!ops.length) return
    const ent = minhaEntrada()
    const el = overlayPrompt()
    el.innerHTML = ''
    const titulo = {
        magia: `${a.criatura} está conjurando ${a.magia}${a.nivel ? ` (${a.nivel}º nível)` : ''}`,
        ataque: a.alvoId === (ent && ent.id) ? `${a.criatura} acerta você com ${a.total} no ataque`
            : `${a.criatura} acerta ${((state.combate.ordem.find(e => e.id === a.alvoId)) || {}).nome || 'um aliado'} com ${a.total} no ataque`,
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
        if (op.armas && op.armas.length > 1) {
            sel = document.createElement('select')
            sel.className = 'dc-select'
            sel.setAttribute('aria-label', 'Arma')
            op.armas.forEach(x => sel.appendChild(new Option(x.nome, x.id)))
        }
        const b = botao(op.rotulo, op.nota || '', () => {
            const espaco = op.espacos && op.espacos.length ? op.espacos.find(e => e.id === (sel ? sel.value : op.espacos[0].id)) : null
            const arma = op.armas && op.armas.length ? op.armas.find(x => x.id === (sel ? sel.value : op.armas[0].id)) : null
            usarReacao(a, ent, op, espaco, arma)
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

function usarReacao(a, ent, op, espaco, arma) {
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
    } else if (op.id === 'oportunidade' || op.id === 'retaliacao') {
        const rotulo = op.id === 'retaliacao' ? 'Retaliação' : 'ataque de oportunidade'
        texto = `${rotulo} em ${a.criatura}${arma ? ` com ${arma.nome.toLowerCase()}` : ''}.`
        // A reação é marcada pelo servidor ao receber combate_reacao
        if (arma) require('./dndArmas').atacar(char, arma.item, { tipo: 'reacao', rotuloExtra: op.id === 'retaliacao' ? ' (Retaliação)' : ' (oportunidade)' })
    } else if (op.id === 'insp-ca') {
        require('./dndEfeitos').remover(char.id, { uid: op.efeitoUid })
        const r = rolagem.rolarDados({ personagem: nome, rotulo: 'Inspiração em Combate (na CA)', expressao: '1' + op.dado })
        efeito = a.total < f.ca + r.total ? 'erra' : 'nada'
        texto = `Inspiração em Combate: +${r.total} na CA (${f.ca + r.total}), ${efeito === 'erra' ? 'o ataque erra' : 'o ataque ainda acerta'}.`
    } else if (op.id === 'dobrar') {
        const st = char.stats || {}
        require('./dndSheet').gravar(char.id, { recursos_usados: { ...(st.recursos_usados || {}), feiticaria: ((st.recursos_usados || {}).feiticaria || 0) + 2 } })
        const r = rolagem.rolarDados({ personagem: nome, rotulo: `Dobrar a Sorte (−no ataque de ${a.criatura})`, expressao: '1d4' })
        efeito = 'diminui'
        reducao = r.total
        texto = `Dobrar a Sorte: −${r.total} no ataque de ${a.criatura}.`
    } else if (op.id === 'interrupcao') {
        gastarRecurso(char, op.recurso.id)
        const r = rolagem.rolarDados({ personagem: nome, rotulo: `Palavras de Interrupção (−no ataque de ${a.criatura})`, expressao: '1' + (op.recurso.dado || 'd6') })
        efeito = 'diminui'
        reducao = r.total
        texto = `Palavras de Interrupção: −${r.total} no ataque de ${a.criatura}.`
    } else if (op.id === 'protecao' || op.id === 'labareda' || op.id === 'entropica') {
        if (op.recurso) gastarRecurso(char, op.recurso.id)
        efeito = 'desvantagem'
        texto = {
            protecao: `Proteção: desvantagem no ataque de ${a.criatura}.`,
            labareda: `Labareda Protetora: desvantagem no ataque de ${a.criatura}.`,
            entropica: `Proteção Entrópica: desvantagem no ataque de ${a.criatura}; se errar, ${nome} tem vantagem no próximo ataque contra ela.`,
        }[op.id]
    } else if (op.id === 'defletir') {
        const r = rolagem.rolarDados({ personagem: nome, rotulo: 'Defletir Projéteis (reduz o dano)', expressao: '1d10', bonus: f.mods.des + f.nivel })
        efeito = 'reduz'
        reducao = r.total
        texto = `Defletir Projéteis: reduz o dano em ${r.total}.`
        setTimeout(() => oferecerDevolver(char, r.total, a.criatura), 400)
    } else if (op.id === 'ira') {
        gastarRecurso(char, op.recurso.id)
        rolagem.rolarDados({ personagem: nome, rotulo: `Ira da Tormenta em ${a.criatura} (DES CD ${op.cd}, metade se passar)`, expressao: '2d8', tipo: 'dano', tipoDano: op.tipoDano })
        texto = `Ira da Tormenta: ${a.criatura} faz DES CD ${op.cd} (2d8 ${op.tipoDano}, metade se passar).`
    } else if (op.id === 'nevoa') {
        gastarRecurso(char, op.recurso.id)
        const st = char.stats || {}
        const condicoes = (st.condicoes || []).includes('invisivel') ? st.condicoes : [...(st.condicoes || []), 'invisivel']
        // Some no começo do próximo turno dele (aoEstado)
        require('./dndSheet').gravar(char.id, { condicoes, efeitos: { ...(st.efeitos || {}), nevoa: true } })
        texto = 'Névoa de Fuga: fica invisível até o próximo turno e se teleporta até 18 m.'
    } else if (op.id === 'repreensao') {
        let dados = '3d10'   // racial: conjurada como 2º nível
        if (op.racial) gastarRecurso(char, 'racial:repreensao-infernal')
        else { gastarEspaco(char, espaco); dados = `${1 + espaco.nivel}d10` }
        rolagem.rolarDados({ personagem: nome, rotulo: `Repreensão Infernal em ${a.criatura} (CD ${op.magia.cd} DES)`, expressao: dados, tipo: 'dano', tipoDano: 'fogo' })
        texto = `Repreensão Infernal em ${a.criatura} (${dados} de fogo, CD ${op.magia.cd} DES para metade).`
    }
    emitir('combate_reacao', { anuncioId: a.id, entradaId: ent.id, reacao: op.id, texto, efeito, reducao })
}

/**
 * Defletir Projéteis: se o dano ficou em 0, o monge pega o projétil e pode
 * devolver com 1 chi (ataque à distância de arma de monge, 6/18 m).
 */
function oferecerDevolver(char, reducao, criatura) {
    const f = dnd.calcular(char.stats || {})
    if (!recursoLivre(char, f, 'chi')) return
    const dado = require('./dndClasses').porNivel([[1, 'd4'], [5, 'd6'], [11, 'd8'], [17, 'd10']], f.nivel)
    perguntar({
        titulo: 'Defletir Projéteis',
        texto: `Se o dano foi ${reducao} ou menos, você pegou o projétil. Devolver em ${criatura} gastando 1 chi?`,
        opcoes: [{ rotulo: 'Devolver (1 chi)', principal: true, acao: () => {
            gastarRecurso(char, 'chi')
            rolagem.ataqueComArma({ personagem: char.name, rotulo: `Projétil devolvido em ${criatura}`, bonusAtaque: f.mods.des + f.prof, expressao: '1' + dado, bonusDano: f.mods.des, tipoDano: '' })
        } }],
    })
}

/**
 * Pergunta rápida no canto (teste de concentração). Fica separada do prompt
 * de reação para um não apagar o outro.
 *   opcoes: [{ rotulo, acao, principal }] · semRecusa: sem o botão "Agora não"
 */
function perguntar({ titulo, texto, opcoes, semRecusa }) {
    let el = document.getElementById('dndPergunta')
    if (!el) {
        el = mk('div')
        el.id = 'dndPergunta'
        el.setAttribute('role', 'alertdialog')
        segurar(el)
        document.body.appendChild(el)
    }
    el.innerHTML = ''
    el.setAttribute('aria-label', titulo)
    el.appendChild(mk('div', 'cb-prompt-titulo', titulo))
    el.appendChild(mk('div', 'cb-prompt-texto', texto))
    const linha = mk('div', 'cb-prompt-op')
    const fechar = () => el.classList.remove('show')
    opcoes.forEach(o => linha.appendChild(botao(o.rotulo, o.titulo || '', () => { fechar(); o.acao() }, o.principal ? 'principal' : '')))
    if (!semRecusa) linha.appendChild(botao('Agora não', '', fechar))
    el.appendChild(linha)
    el.classList.add('show')
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

module.exports = {
    aoEstado, aoAnuncio, aoReacao, aoConjurar, atualizarBotaoMestre, limpar, minhaEntrada,
    regraMagiaBonus, gastarBonusDe, perguntar, marcasDoAlvo,
    // usados pelo palco da batalha (dndCena.js)
    entradaAtual, charDaEntrada, fichas, abrirAnuncio, abrirArmas, podeMexer,
    podeGastar, gastarCusto, custoDaMagia, travado, aviso,
    // usados pelo painel de armas (dndArmas.js)
    emBatalha, entradaDoChar, turnoDoChar, chaveDoTurno, economia, gastar,
    gastarRecurso, gastarEspaco, espacosLivres, recursoLivre,
    atualizarTurno: () => desenharTurno(),
}
