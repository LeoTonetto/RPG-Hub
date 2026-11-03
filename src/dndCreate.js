// ══════════════════════════════════════════════════════════════════════════════
// src/dndCreate.js — CRIAÇÃO DE PERSONAGEM E SUBIDA DE NÍVEL DO D&D 5e
//
// A criação é um passo a passo no estilo do Baldur's Gate 3: raça, classe,
// antecedente, atributos, perícias, magias, equipamento e resumo. Cada passo mostra só as escolhas
// dele; o motor (dnd.js) diz quais vagas existem, que opções valem e o que
// ainda falta. characters.js chama render/validar/montarStats, como faz com o
// Calico.
//
// A subida de nível usa o mesmo componente de escolha, num modal próprio que
// o jogador abre pela ficha depois que o mestre libera o nível.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const D = require('./dndDados')
const { CLASSES } = require('./dndClasses')
const conteudo = require('./dndConteudo')
const magiasUI = require('./dndMagiasUI')

const PASSOS = [
    { id: 'raca', nome: 'Raça' },
    { id: 'classe', nome: 'Classe' },
    { id: 'antecedente', nome: 'Antecedente' },
    { id: 'atributos', nome: 'Atributos' },
    { id: 'pericias', nome: 'Perícias' },
    { id: 'magias', nome: 'Magias' },
    { id: 'equipamento', nome: 'Equipamento' },
    { id: 'resumo', nome: 'Resumo' },
]
const PASSOS_DE_ESCOLHA = PASSOS.slice(0, -1)

// Ordem padrão para sugerir atributos depois dos principais da classe
const ORDEM_SUGERIDA = ['con', 'des', 'sab', 'for', 'car', 'int']

let ficha = null
let passo = 0
let rolagensFeitas = 0
let containerAtual = null

function resetForm() {
    ficha = dnd.novaFicha()
    ficha.atribuicao = {}   // padrão e rolagem: atributo → índice do valor
    passo = 0
    rolagensFeitas = 0
    magiasUI.reiniciar()
}

let ouvindoConteudo = false

function render(container) {
    if (!ficha) resetForm()
    containerAtual = container
    // Magias e talentos chegam do Supabase depois; quando chegarem, redesenha
    if (!ouvindoConteudo) {
        ouvindoConteudo = true
        conteudo.aoCarregar(() => { if (containerAtual && containerAtual.isConnected) redesenhar() })
    }
    conteudo.carregar()
    redesenhar()
}

function redesenhar() {
    const c = containerAtual
    if (!c) return
    c.innerHTML = ''
    c.classList.add('dnd-create')
    c.appendChild(barraDePassos())
    const corpo = mk('div', 'dc-corpo')
    const desenhar = { raca: passoRaca, classe: passoClasse, antecedente: passoAntecedente, atributos: passoAtributos, pericias: passoPericias, magias: passoMagias, equipamento: passoEquipamento, resumo: passoResumo }
    desenhar[PASSOS[passo].id](corpo)
    c.appendChild(corpo)
    c.appendChild(navegacao())
}

function mudou() {
    dnd.limparEscolhasInvalidas(ficha)
    redesenhar()
}

function irPara(i) {
    passo = Math.max(0, Math.min(PASSOS.length - 1, i))
    redesenhar()
    containerAtual?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

// ── Barra de passos e navegação ───────────────────────────────────────────────

function passoCompleto(id) {
    const { raca, classe } = dnd.fontes(ficha)
    switch (id) {
        case 'raca': return !!raca && (!raca.subracas || !!ficha.subraca) && vagasDoPasso('raca').every(v => dnd.vagaCompleta(ficha, v))
        case 'classe': return !!classe && vagasDoPasso('classe').every(v => dnd.vagaCompleta(ficha, v))
        case 'antecedente': return !!ficha.antecedente && vagasDoPasso('antecedente').every(v => dnd.vagaCompleta(ficha, v))
        case 'atributos': return atributosValidos().ok
        case 'pericias': return !!classe && vagasDoPasso('pericias').every(v => dnd.vagaCompleta(ficha, v))
        case 'magias': return !!classe && vagasDoPasso('magias').every(v => dnd.vagaCompleta(ficha, v))
        case 'equipamento': return !!classe && !dnd.faltaNoPacote(ficha)
        case 'resumo': return PASSOS_DE_ESCOLHA.every(p => passoCompleto(p.id))
    }
    return false
}

function barraDePassos() {
    const barra = mk('div', 'dc-passos')
    PASSOS.forEach((p, i) => {
        const b = mk('button', 'dc-passo' + (i === passo ? ' atual' : '') + (passoCompleto(p.id) ? ' feito' : ''))
        b.type = 'button'
        b.appendChild(mk('span', 'dc-passo-num', passoCompleto(p.id) && i !== passo ? '✓' : String(i + 1)))
        b.appendChild(mk('span', 'dc-passo-nome', p.nome))
        b.addEventListener('click', () => irPara(i))
        barra.appendChild(b)
    })
    return barra
}

function navegacao() {
    const nav = mk('div', 'dc-nav')
    const voltar = mk('button', 'btn-ghost dc-nav-btn', '← Voltar')
    voltar.type = 'button'
    voltar.disabled = passo === 0
    voltar.addEventListener('click', () => irPara(passo - 1))
    nav.appendChild(voltar)

    const atual = PASSOS[passo]
    const status = mk('span', 'dc-nav-status', passoCompleto(atual.id) ? '' : faltaNoPasso(atual.id))
    nav.appendChild(status)

    if (passo < PASSOS.length - 1) {
        const avancar = mk('button', 'btn-secondary dc-nav-btn', `${PASSOS[passo + 1].nome} →`)
        avancar.type = 'button'
        avancar.addEventListener('click', () => irPara(passo + 1))
        nav.appendChild(avancar)
    } else {
        nav.appendChild(mk('span', 'dc-nav-dica', 'Dê um nome e invoque o personagem abaixo'))
    }
    return nav
}

function faltaNoPasso(id) {
    const { raca, classe } = dnd.fontes(ficha)
    if (id === 'raca' && !raca) return 'Escolha uma raça'
    if (id === 'raca' && raca.subracas && !ficha.subraca) return 'Escolha a sub-raça'
    if (id === 'classe' && !classe) return 'Escolha uma classe'
    if (id === 'antecedente' && !ficha.antecedente) return 'Escolha um antecedente'
    if (id === 'atributos') return atributosValidos().msg
    if ((id === 'pericias' || id === 'magias' || id === 'equipamento') && !classe) return 'Escolha a classe antes'
    if (id === 'equipamento') return dnd.faltaNoPacote(ficha)
    const v = vagasDoPasso(id).find(x => !dnd.vagaCompleta(ficha, x))
    return v ? `Falta: ${v.rotulo}` : ''
}

// Qual passo mostra cada vaga do 1º nível
function vagasDoPasso(id) {
    const todas = dnd.vagasDeEscolha(ficha, 1)
    const ehPericia = v => v.tipo === 'pericia' || v.tipo === 'especializacao'
    return todas.filter(v => {
        const k = v.key
        // Toda magia, venha de onde vier (classe, raça, domínio), fica no passo Magias
        if (v.tipo === 'magia') return id === 'magias'
        if (k.startsWith('raca:') || k.startsWith('subraca:')) return id === 'raca'
        if (k === 'antecedente:substituta' || k === 'classe:pericias') return id === 'pericias'
        if (k.startsWith('antecedente:')) return id === 'antecedente'
        if (k.startsWith('classe:') || k.startsWith('nv') || k === 'subclasse') return ehPericia(v) ? id === 'pericias' : id === 'classe'
        return false
    })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Passo 1: Raça ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function passoRaca(corpo) {
    corpo.appendChild(titulo('Escolha sua raça', 'Define bônus de atributo, deslocamento, sentidos e traços. LdJ cap. 2.'))
    const grade = mk('div', 'dc-grade')
    Object.entries(D.RACAS).forEach(([id, r]) => {
        grade.appendChild(cartao({
            nome: r.nome, sub: textoBonus(r.concede.atributos) + ` · ${fmtMetros(r.deslocamento)}`, desc: r.resumo,
            ativo: ficha.raca === id,
            onClick: () => {
                if (ficha.raca === id) return
                ficha.raca = id
                const subs = Object.keys(r.subracas || {})
                ficha.subraca = subs.length === 1 ? subs[0] : null
                mudou()
            },
        }))
    })
    corpo.appendChild(grade)

    const { raca, subraca } = dnd.fontes(ficha)
    if (!raca) return

    if (raca.subracas) {
        corpo.appendChild(subtitulo('Sub-raça'))
        const subs = mk('div', 'dc-grade dc-grade-2')
        Object.entries(raca.subracas).forEach(([id, s]) => {
            subs.appendChild(cartao({
                nome: s.nome, sub: textoBonus(s.concede.atributos),
                desc: (s.tracos || []).map(t => t.nome).join(' · '),
                ativo: ficha.subraca === id,
                onClick: () => { ficha.subraca = id; mudou() },
            }))
        })
        corpo.appendChild(subs)
    }

    corpo.appendChild(listaTracos([...(raca.tracos || []), ...((subraca && subraca.tracos) || [])], `LdJ p. ${raca.pag}`))
    vagasDoPasso('raca').forEach(v => corpo.appendChild(renderVaga(ficha, v, mudou)))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Passo 2: Classe ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function passoClasse(corpo) {
    corpo.appendChild(titulo('Escolha sua classe', 'Define PV, proficiências, magia e o que você ganha a cada nível. LdJ cap. 3.'))
    const grade = mk('div', 'dc-grade')
    Object.entries(CLASSES).forEach(([id, c]) => {
        grade.appendChild(cartao({
            nome: c.nome,
            sub: `d${c.dadoVida} · ${c.atributosChave.map(k => D.ATRIBUTO_POR_KEY[k].abrev).join(', ')}`,
            desc: c.resumo,
            icone: c.icone,
            ativo: ficha.classe === id,
            onClick: () => {
                if (ficha.classe === id) return
                ficha.classe = id
                ficha.subclasse = null
                ficha.pacote = null      // o pacote inicial é da classe
                mudou()
            },
        }))
    })
    corpo.appendChild(grade)

    const { classe } = dnd.fontes(ficha)
    if (!classe) return

    const f = dnd.calcular(ficha)
    const info = mk('div', 'dc-info')
    info.appendChild(linhaInfo('Pontos de vida', `${classe.dadoVida} + CON no 1º nível; ${classe.dadoVida / 2 + 1} + CON por nível depois`))
    info.appendChild(linhaInfo('Testes de resistência', classe.resistencias.map(k => D.ATRIBUTO_POR_KEY[k].nome).join(', ')))
    info.appendChild(linhaInfo('Armaduras', classe.armaduras.length ? classe.armaduras.map(t => D.TIPOS_ARMADURA[t]).join(', ') : 'Nenhuma'))
    info.appendChild(linhaInfo('Armas', textoArmas(classe.armas)))
    if (classe.conjuracao) {
        const cj = classe.conjuracao
        info.appendChild(linhaInfo('Magia', `${D.ATRIBUTO_POR_KEY[cj.atributo].nome}` + (cj.inicio > 1 ? ` · a partir do ${cj.inicio}º nível` : '')))
    }
    info.appendChild(linhaInfo('Subclasse', `${classe.subclasse.rotulo} no ${classe.subclasse.nivel}º nível`))
    corpo.appendChild(info)

    corpo.appendChild(listaTracos(
        dnd.caracteristicasPorNivel(ficha, 1).map(x => ({ nome: x.nome, desc: x.desc })),
        `Características do 1º nível · LdJ p. ${classe.pag}`,
    ))
    if (f.conjuracao) corpo.appendChild(notaMagia(f.conjuracao))
    vagasDoPasso('classe').forEach(v => corpo.appendChild(renderVaga(ficha, v, mudou)))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Passo 3: Antecedente ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function passoAntecedente(corpo) {
    corpo.appendChild(titulo('Escolha seu antecedente', 'De onde o personagem vem: duas perícias, ferramentas ou idiomas e uma característica. LdJ cap. 4.'))
    const grade = mk('div', 'dc-grade')
    Object.entries(D.ANTECEDENTES).forEach(([id, a]) => {
        grade.appendChild(cartao({
            nome: a.nome,
            sub: (a.concede.pericias || []).map(k => D.PERICIA_POR_KEY[k].nome).join(', '),
            desc: a.caracteristica.nome,
            ativo: ficha.antecedente === id,
            onClick: () => { ficha.antecedente = id; mudou() },
        }))
    })
    corpo.appendChild(grade)

    const { antecedente } = dnd.fontes(ficha)
    if (!antecedente) return
    const info = mk('div', 'dc-info')
    info.appendChild(linhaInfo('Perícias', (antecedente.concede.pericias || []).map(k => D.PERICIA_POR_KEY[k].nome).join(', ')))
    if (antecedente.concede.ferramentas) info.appendChild(linhaInfo('Ferramentas', antecedente.concede.ferramentas.join(', ')))
    corpo.appendChild(info)
    corpo.appendChild(listaTracos([antecedente.caracteristica], `LdJ p. ${antecedente.pag}`))
    vagasDoPasso('antecedente').forEach(v => corpo.appendChild(renderVaga(ficha, v, mudou)))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Passo 4: Atributos ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function poolDoMetodo() {
    if (ficha.metodo === 'padrao') return dnd.CONJUNTO_PADRAO
    if (ficha.metodo === 'rolagem') return (ficha.rolagens || []).map(r => r.soma)
    return null
}

/** Copia a atribuição (padrão/rolagem) para os valores-base. */
function aplicarAtribuicao() {
    const pool = poolDoMetodo()
    if (!pool) return
    D.TODOS_ATRIBUTOS.forEach(k => {
        const i = ficha.atribuicao[k]
        ficha.atributos_base[k] = i != null && pool[i] != null ? pool[i] : 8
    })
}

function atributosValidos() {
    if (ficha.metodo === 'compra') {
        const custo = dnd.custoCompra(ficha.atributos_base)
        if (custo > dnd.COMPRA_PONTOS) return { ok: false, msg: `Passou ${custo - dnd.COMPRA_PONTOS} pontos do limite` }
        if (custo < dnd.COMPRA_PONTOS) return { ok: false, msg: `Faltam ${dnd.COMPRA_PONTOS - custo} pontos para distribuir` }
        return { ok: true, msg: '' }
    }
    if (ficha.metodo === 'rolagem' && !(ficha.rolagens && ficha.rolagens.length === 6)) return { ok: false, msg: 'Role os atributos' }
    const usados = D.TODOS_ATRIBUTOS.map(k => ficha.atribuicao[k]).filter(i => i != null)
    if (usados.length < 6) return { ok: false, msg: `Distribua os valores (${6 - usados.length} faltando)` }
    return { ok: true, msg: '' }
}

function trocarMetodo(m) {
    if (ficha.metodo === m) return
    ficha.metodo = m
    ficha.atribuicao = {}
    D.TODOS_ATRIBUTOS.forEach(k => { ficha.atributos_base[k] = 8 })
    mudou()
}

function sugerirDistribuicao() {
    const { classe } = dnd.fontes(ficha)
    const ordem = [...new Set([...(classe ? classe.atributosChave : []), ...ORDEM_SUGERIDA])]
    if (ficha.metodo === 'compra') {
        ordem.forEach((k, i) => { ficha.atributos_base[k] = dnd.CONJUNTO_PADRAO[i] })
    } else {
        const pool = poolDoMetodo() || []
        const indices = pool.map((v, i) => i).sort((a, b) => pool[b] - pool[a])
        ficha.atribuicao = {}
        ordem.forEach((k, i) => { if (indices[i] != null) ficha.atribuicao[k] = indices[i] })
        aplicarAtribuicao()
    }
    mudou()
}

function rolarAtributos() {
    ficha.rolagens = Array.from({ length: 6 }, () => dnd.rolar4d6())
    ficha.atribuicao = {}
    aplicarAtribuicao()
    rolagensFeitas++

    // A rolagem vai para o chat: o mestre vê quantas vezes cada um rolou
    if (state.socket) {
        const valores = ficha.rolagens.map(r => r.soma).join(', ')
        state.socket.emit('chat_message', {
            playerName: '🎲 Dados',
            message: `${state.playerName} rolou atributos de D&D (${rolagensFeitas}ª rolagem): ${valores}`,
            type: 'roll',
        })
    }
    mudou()
}

function passoAtributos(corpo) {
    corpo.appendChild(titulo('Defina os atributos', 'Os bônus da raça entram sozinhos. LdJ cap. 1 e 7.'))

    const metodos = mk('div', 'dc-metodos')
    Object.entries(dnd.METODOS).forEach(([id, m]) => {
        const b = mk('button', 'backend-opt' + (ficha.metodo === id ? ' ativo' : ''))
        b.type = 'button'
        b.appendChild(mk('span', 'backend-opt-nome', m.nome))
        b.appendChild(mk('span', 'backend-opt-sub', m.desc))
        b.addEventListener('click', () => trocarMetodo(id))
        metodos.appendChild(b)
    })
    corpo.appendChild(metodos)

    const { classe } = dnd.fontes(ficha)
    const acoes = mk('div', 'dc-attr-acoes')
    if (ficha.metodo === 'rolagem') {
        const rolar = mk('button', 'btn-secondary dc-btn-pequeno', ficha.rolagens ? '🎲 Rolar de novo' : '🎲 Rolar 4d6 × 6')
        rolar.type = 'button'
        rolar.title = 'A rolagem aparece no chat da mesa'
        rolar.addEventListener('click', rolarAtributos)
        acoes.appendChild(rolar)
    }
    if (classe && (ficha.metodo !== 'rolagem' || ficha.rolagens)) {
        const sug = mk('button', 'btn-ghost dc-btn-pequeno', `Sugerir para ${classe.nome}`)
        sug.type = 'button'
        sug.addEventListener('click', sugerirDistribuicao)
        acoes.appendChild(sug)
    }
    corpo.appendChild(acoes)

    if (ficha.metodo === 'rolagem' && ficha.rolagens) {
        const dados = mk('div', 'dc-rolagens')
        ficha.rolagens.forEach(r => {
            const menor = Math.min(...r.dados)
            let descartou = false
            const el = mk('span', 'dc-rolagem')
            el.appendChild(mk('b', null, String(r.soma)))
            el.appendChild(mk('small', null, r.dados.map(d => {
                if (d === menor && !descartou) { descartou = true; return `(${d})` }
                return String(d)
            }).join(' ')))
            dados.appendChild(el)
        })
        corpo.appendChild(dados)
    }

    const finais = dnd.atributosFinais(ficha)
    const pool = poolDoMetodo()
    const tabela = mk('div', 'dc-attr-tabela')
    const cab = mk('div', 'dc-attr-linha cab')
    ;['Atributo', 'Base', 'Raça', 'Total', 'Mod'].forEach(t => cab.appendChild(mk('span', null, t)))
    tabela.appendChild(cab)

    D.ATRIBUTOS.forEach(a => {
        const linha = mk('div', 'dc-attr-linha' + (classe && classe.atributosChave.includes(a.key) ? ' chave' : ''))
        const nome = mk('span', 'dc-attr-nome')
        nome.appendChild(mk('b', null, a.abrev))
        nome.appendChild(mk('small', null, a.nome))
        linha.appendChild(nome)

        const ctl = mk('span', 'dc-attr-ctl')
        if (ficha.metodo === 'compra') {
            const v = ficha.atributos_base[a.key]
            const custoMais = (dnd.CUSTO_COMPRA[v + 1] ?? 99) - dnd.CUSTO_COMPRA[v]
            const resta = dnd.COMPRA_PONTOS - dnd.custoCompra(ficha.atributos_base)
            ctl.appendChild(botaoAjuste('−', v > 8, () => { ficha.atributos_base[a.key] = v - 1; mudou() }))
            ctl.appendChild(mk('b', 'dc-attr-base', String(v)))
            ctl.appendChild(botaoAjuste('+', v < 15 && custoMais <= resta, () => { ficha.atributos_base[a.key] = v + 1; mudou() }))
        } else if (pool && pool.length) {
            const sel = document.createElement('select')
            sel.className = 'dc-select'
            sel.appendChild(new Option('—', ''))
            const usadosPorOutros = new Set(D.TODOS_ATRIBUTOS.filter(k => k !== a.key).map(k => ficha.atribuicao[k]).filter(i => i != null))
            pool.forEach((val, i) => {
                const o = new Option(String(val), String(i))
                o.disabled = usadosPorOutros.has(i)
                sel.appendChild(o)
            })
            sel.value = ficha.atribuicao[a.key] != null ? String(ficha.atribuicao[a.key]) : ''
            sel.addEventListener('change', () => {
                if (sel.value === '') delete ficha.atribuicao[a.key]
                else ficha.atribuicao[a.key] = parseInt(sel.value, 10)
                aplicarAtribuicao()
                mudou()
            })
            ctl.appendChild(sel)
        } else {
            ctl.appendChild(mk('span', 'dc-muted', '—'))
        }
        linha.appendChild(ctl)

        const racial = finais[a.key] - ficha.atributos_base[a.key]
        linha.appendChild(mk('span', 'dc-attr-racial', racial ? dnd.sinal(racial) : ''))
        linha.appendChild(mk('b', 'dc-attr-total', String(finais[a.key])))
        linha.appendChild(mk('span', 'dc-attr-mod', dnd.sinal(dnd.mod(finais[a.key]))))
        tabela.appendChild(linha)
    })
    corpo.appendChild(tabela)

    if (ficha.metodo === 'compra') {
        const resta = dnd.COMPRA_PONTOS - dnd.custoCompra(ficha.atributos_base)
        corpo.appendChild(mk('div', 'dc-pontos' + (resta < 0 ? ' erro' : ''), `Pontos restantes: ${resta} de ${dnd.COMPRA_PONTOS}`))
    }
    if (classe) {
        corpo.appendChild(mk('p', 'dc-dica', `Para ${classe.nome}, os atributos mais importantes são ${classe.atributosChave.map(k => D.ATRIBUTO_POR_KEY[k].nome).join(' e ')}.`))
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Passo 5: Perícias ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function passoPericias(corpo) {
    corpo.appendChild(titulo('Perícias', 'As que já vêm da raça e do antecedente aparecem marcadas; escolha as da classe.'))
    const { classe } = dnd.fontes(ficha)
    if (!classe) {
        corpo.appendChild(mk('p', 'dc-dica', 'Escolha a classe primeiro.'))
        return
    }
    vagasDoPasso('pericias').forEach(v => corpo.appendChild(renderVaga(ficha, v, mudou)))
    corpo.appendChild(tabelaPericias(dnd.calcular(ficha)))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Passo 6: Magias ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function passoMagias(corpo) {
    corpo.appendChild(titulo('Magias', 'Passe o mouse para ver cada magia; clique para escolher. LdJ cap. 10 e 11.'))
    const { classe } = dnd.fontes(ficha)
    if (!classe) {
        corpo.appendChild(mk('p', 'dc-dica', 'Escolha a classe primeiro.'))
        return
    }
    const f = dnd.calcular(ficha)
    if (f.conjuracao) corpo.appendChild(notaMagia(f.conjuracao))

    // Magias que já vêm prontas (domínio, juramento, raça)
    const sempre = f.magias.filter(m => m.sempre)
    if (sempre.length) {
        const w = mk('div', 'dc-sempre')
        w.appendChild(mk('span', 'dc-subtitulo', 'Já conhece'))
        const fila = mk('div', 'dc-sempre-fila')
        sempre.forEach(m => {
            const chip = mk('span', 'dc-sempre-chip')
            chip.title = `${m.nome} — ${m.origem}`
            chip.appendChild(magiasUI.icone(m.icone))
            chip.appendChild(mk('span', null, m.nome))
            fila.appendChild(chip)
        })
        w.appendChild(fila)
        corpo.appendChild(w)
    }

    const vagas = vagasDoPasso('magias')
    if (!vagas.length) {
        corpo.appendChild(mk('p', 'dc-dica', f.conjuracao || sempre.length
            ? 'Nada para escolher no 1º nível.'
            : `${classe.nome} não conjura magias no 1º nível. Nada para escolher aqui.`))
        return
    }
    vagas.forEach(v => corpo.appendChild(renderVaga(ficha, v, mudou)))
}

function tabelaPericias(f) {
    const lista = mk('div', 'dc-pericias')
    D.PERICIAS.forEach(p => {
        const per = f.pericias[p.key]
        const linha = mk('div', 'dc-pericia' + (per.prof ? ' prof' : ''))
        linha.appendChild(mk('span', 'dc-pericia-marca', per.especialista ? '◆' : per.prof ? '●' : per.meia ? '◐' : '○'))
        linha.appendChild(mk('span', 'dc-pericia-nome', p.nome))
        linha.appendChild(mk('span', 'dc-pericia-attr', D.ATRIBUTO_POR_KEY[p.attr].abrev))
        linha.appendChild(mk('b', 'dc-pericia-bonus', dnd.sinal(per.bonus)))
        lista.appendChild(linha)
    })
    return lista
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Passo 7: Equipamento ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function passoEquipamento(corpo) {
    corpo.appendChild(titulo('Equipamento inicial', 'O pacote da classe e o do antecedente, como no livro. Depois, armas novas vêm do mestre.'))
    const { classe } = dnd.fontes(ficha)
    if (!classe) {
        corpo.appendChild(mk('div', 'dc-muted', 'Escolha a classe antes.'))
        return
    }
    const armasUI = require('./dndArmas')
    corpo.appendChild(armasUI.pacoteUI(ficha, mudou))
    corpo.appendChild(armasUI.previaDoPacote(ficha))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Passo 8: Resumo ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function passoResumo(corpo) {
    corpo.appendChild(titulo('Resumo', 'Confira o personagem. Tudo aqui foi calculado a partir das suas escolhas.'))
    const faltando = PASSOS_DE_ESCOLHA.filter(p => !passoCompleto(p.id))
    if (faltando.length) {
        const aviso = mk('div', 'dc-faltando')
        aviso.appendChild(mk('span', null, 'Ainda falta: '))
        faltando.forEach(p => {
            const link = mk('button', 'dc-link', `${p.nome} (${faltaNoPasso(p.id)})`)
            link.type = 'button'
            link.addEventListener('click', () => irPara(PASSOS.indexOf(p)))
            aviso.appendChild(link)
        })
        corpo.appendChild(aviso)
    }
    const { classe } = dnd.fontes(ficha)
    if (!classe || !ficha.raca) return

    // Os números já contam com o equipamento escolhido (armadura e escudo)
    const comPacote = dnd.faltaNoPacote(ficha) ? ficha : dnd.aplicarPacote(JSON.parse(JSON.stringify(ficha)))
    const f = dnd.calcular(comPacote)
    corpo.appendChild(mk('div', 'dc-resumo-titulo', f.titulo))

    const numeros = mk('div', 'dc-numeros')
    ;[['PV', f.pvMax], ['CA', f.ca], ['Iniciativa', dnd.sinal(f.iniciativa)], ['Desloc.', fmtMetros(f.deslocamento)], ['Prof.', dnd.sinal(f.prof)], ['Percepção passiva', f.percepcaoPassiva]]
        .forEach(([r, v]) => {
            const n = mk('div', 'dc-numero')
            n.appendChild(mk('b', null, String(v)))
            n.appendChild(mk('span', null, r))
            numeros.appendChild(n)
        })
    corpo.appendChild(numeros)

    if (comPacote !== ficha) {
        const armas = dnd.armasDoPersonagem(comPacote).filter(a => a.base !== dnd.DESARMADO)
            .map(a => (D.ARMAS[a.base].nome + ((a.qtd || 1) > 1 ? ` ×${a.qtd}` : '')))
        const eq = mk('div', 'dc-info')
        eq.appendChild(linhaInfo('Armas', armas.join(', ') || 'Nenhuma'))
        eq.appendChild(linhaInfo('Armadura', f.caDetalhe))
        corpo.appendChild(eq)
    }

    const info = mk('div', 'dc-info')
    info.appendChild(linhaInfo('Atributos', D.ATRIBUTOS.map(a => `${a.abrev} ${f.atributos[a.key]} (${dnd.sinal(f.mods[a.key])})`).join(' · ')))
    info.appendChild(linhaInfo('Testes de resistência', D.ATRIBUTOS.filter(a => f.resistencias[a.key].prof).map(a => `${a.nome} ${dnd.sinal(f.resistencias[a.key].bonus)}`).join(', ')))
    info.appendChild(linhaInfo('Perícias', D.PERICIAS.filter(p => f.pericias[p.key].prof).map(p => `${p.nome} ${dnd.sinal(f.pericias[p.key].bonus)}`).join(', ')))
    info.appendChild(linhaInfo('Idiomas', f.proficiencias.idiomas.join(', ')))
    if (f.proficiencias.ferramentas.length) info.appendChild(linhaInfo('Ferramentas', f.proficiencias.ferramentas.join(', ')))
    if (f.visaoEscuro) info.appendChild(linhaInfo('Sentidos', `Visão no escuro ${fmtMetros(f.visaoEscuro)}`))
    if (f.resistenciasDano.length) info.appendChild(linhaInfo('Resistência a dano', f.resistenciasDano.join(', ')))
    corpo.appendChild(info)
    if (f.conjuracao) corpo.appendChild(notaMagia(f.conjuracao))

    // Identidade: tendência e personalidade (opcionais)
    corpo.appendChild(subtitulo('Tendência e personalidade'))
    const tend = document.createElement('select')
    tend.className = 'dc-select'
    tend.appendChild(new Option('Tendência…', ''))
    D.ALINHAMENTOS.forEach(a => tend.appendChild(new Option(a.nome, a.key)))
    tend.value = ficha.alinhamento || ''
    tend.addEventListener('change', () => { ficha.alinhamento = tend.value || null })
    corpo.appendChild(tend)

    const pers = mk('div', 'dc-personalidade')
    ;[['tracos', 'Traços de personalidade'], ['ideais', 'Ideais'], ['vinculos', 'Vínculos'], ['defeitos', 'Defeitos']].forEach(([k, rot]) => {
        const wrap = mk('label', 'dc-campo')
        wrap.appendChild(mk('span', 'input-label', rot))
        const ta = document.createElement('textarea')
        ta.className = 'room-input dc-textarea'
        ta.rows = 2
        ta.value = ficha.personalidade[k] || ''
        ta.addEventListener('input', () => { ficha.personalidade[k] = ta.value })
        ta.addEventListener('keydown', e => e.stopPropagation())
        wrap.appendChild(ta)
        pers.appendChild(wrap)
    })
    corpo.appendChild(pers)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Ponte com characters.js ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function validar(nome) {
    const erros = []
    if (!nome) erros.push('Dê um nome ao personagem.')
    PASSOS_DE_ESCOLHA.forEach(p => { if (!passoCompleto(p.id)) erros.push(`${p.nome}: ${faltaNoPasso(p.id)}`) })
    return { valido: erros.length === 0, erros, avisos: [] }
}

function montarStats() {
    const s = JSON.parse(JSON.stringify(ficha))
    delete s.atribuicao
    dnd.aplicarPacote(s)
    dnd.materializar(s)
    s.hp = s.hp_max
    return s
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COMPONENTE DE ESCOLHA ────────────────────────────────────────────────────
// Desenha uma vaga (o que o motor chama de escolha) e grava a resposta em
// `alvo`. Usado na criação e na subida de nível.
// ══════════════════════════════════════════════════════════════════════════════

function renderVaga(alvo, vaga, aoMudar, opts) {
    const completa = dnd.vagaCompleta(alvo, vaga)
    const bloco = mk('div', 'dc-vaga' + (completa ? ' completa' : '') + (vaga.tipo === 'magia' ? ' dc-vaga-magia' : ''))
    const cab = mk('div', 'dc-vaga-cab')
    cab.appendChild(mk('span', 'dc-vaga-rotulo', vaga.rotulo))
    const valor = dnd.valorDaVaga(alvo, vaga)
    if (vaga.tipo !== 'asi') cab.appendChild(mk('span', 'dc-vaga-conta', `${(valor || []).length}/${vaga.qtd}`))
    bloco.appendChild(cab)
    if (vaga.origem) bloco.appendChild(mk('div', 'dc-vaga-origem', vaga.origem))

    if (vaga.tipo === 'asi') {
        bloco.appendChild(renderAsi(alvo, vaga, aoMudar))
        return bloco
    }
    if (vaga.tipo === 'magia') {
        bloco.appendChild(magiasUI.seletor(alvo, vaga, aoMudar, opts))
        return bloco
    }

    const opcoes = dnd.opcoesDaVaga(alvo, vaga)
    const sel = new Set(valor || [])
    const comDescricao = vaga.tipo === 'subclasse' || (vaga.tipo === 'opcao' && opcoes.some(o => o.desc && o.desc.length > 30))
    const lista = mk('div', comDescricao ? 'dc-opcoes-lista' : 'dc-chips')

    opcoes.forEach(o => {
        const on = sel.has(o.id)
        const b = mk('button', (comDescricao ? 'dc-opcao' : 'dc-chip') + (on ? ' on' : ''))
        b.type = 'button'
        b.disabled = !!o.bloqueado && !on
        b.title = o.bloqueado ? o.motivo : (o.desc || '')
        b.appendChild(mk('span', 'dc-opcao-nome', o.nome))
        if (comDescricao && o.desc) b.appendChild(mk('span', 'dc-opcao-desc', o.desc))
        else if (!comDescricao && o.desc && o.desc.length <= 12) b.appendChild(mk('small', null, o.desc))
        if (o.bloqueado && !on) b.appendChild(mk('span', 'dc-opcao-motivo', o.motivo))
        b.addEventListener('click', () => {
            let novo = [...sel]
            if (on) novo = novo.filter(x => x !== o.id)
            else if (vaga.qtd === 1) novo = [o.id]
            else if (novo.length < vaga.qtd) novo.push(o.id)
            else return piscar(bloco)
            if (vaga.tipo === 'subclasse') alvo.subclasse = novo[0] || null
            else alvo.escolhas[vaga.key] = novo
            aoMudar()
        })
        lista.appendChild(b)
    })
    bloco.appendChild(lista)
    return bloco
}

function renderAsi(alvo, vaga, aoMudar) {
    const wrap = mk('div', 'dc-asi')
    const v = alvo.escolhas[vaga.key] || null
    const modo = v ? v.tipo : 'atributos'

    const abas = mk('div', 'dc-asi-abas')
    ;[['atributos', '+2 em atributos'], ['talento', 'Talento']].forEach(([id, rot]) => {
        const b = mk('button', 'dc-aba' + (modo === id ? ' on' : ''), rot)
        b.type = 'button'
        b.addEventListener('click', () => {
            if (modo === id && v) return
            alvo.escolhas[vaga.key] = id === 'atributos' ? { tipo: 'atributos', valores: {} } : { tipo: 'talento', talento: null }
            aoMudar()
        })
        abas.appendChild(b)
    })
    wrap.appendChild(abas)

    if (modo === 'atributos') {
        const valores = (v && v.valores) || {}
        const gasto = Object.values(valores).reduce((a, b) => a + b, 0)
        const antes = dnd.atributosFinais(alvo, vaga.key)
        const linhas = mk('div', 'dc-asi-attrs')
        D.ATRIBUTOS.forEach(a => {
            const q = valores[a.key] || 0
            const linha = mk('div', 'dc-asi-attr')
            linha.appendChild(mk('span', 'dc-asi-nome', a.nome))
            linha.appendChild(mk('span', 'dc-muted', String(antes[a.key])))
            linha.appendChild(botaoAjuste('−', q > 0, () => ajustarAsi(alvo, vaga, a.key, -1, aoMudar)))
            linha.appendChild(mk('b', 'dc-asi-q', q ? dnd.sinal(q) : '0'))
            linha.appendChild(botaoAjuste('+', gasto < 2 && q < 2 && antes[a.key] + q < 20, () => ajustarAsi(alvo, vaga, a.key, 1, aoMudar)))
            linha.appendChild(mk('b', 'dc-asi-final', String(Math.min(20, antes[a.key] + q))))
            linhas.appendChild(linha)
        })
        wrap.appendChild(linhas)
        wrap.appendChild(mk('small', 'dc-muted', `Distribuídos: ${gasto} de 2 · máximo 20 por atributo`))
    } else {
        const lista = mk('div', 'dc-opcoes-lista dc-talentos')
        dnd.opcoesDaVaga(alvo, vaga).forEach(o => {
            const on = v && v.talento === o.id
            const b = mk('button', 'dc-opcao' + (on ? ' on' : ''))
            b.type = 'button'
            b.disabled = !!o.bloqueado && !on
            b.appendChild(mk('span', 'dc-opcao-nome', o.nome))
            b.appendChild(mk('span', 'dc-opcao-desc', o.desc))
            if (o.bloqueado && !on) b.appendChild(mk('span', 'dc-opcao-motivo', o.motivo))
            b.addEventListener('click', () => {
                alvo.escolhas[vaga.key] = { tipo: 'talento', talento: on ? null : o.id }
                aoMudar()
            })
            lista.appendChild(b)
        })
        wrap.appendChild(lista)
    }
    return wrap
}

function ajustarAsi(alvo, vaga, key, delta, aoMudar) {
    const v = alvo.escolhas[vaga.key] && alvo.escolhas[vaga.key].tipo === 'atributos'
        ? alvo.escolhas[vaga.key] : { tipo: 'atributos', valores: {} }
    const novo = Math.max(0, (v.valores[key] || 0) + delta)
    if (novo) v.valores[key] = novo
    else delete v.valores[key]
    alvo.escolhas[vaga.key] = v
    aoMudar()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SUBIDA DE NÍVEL ──────────────────────────────────────────────────────────
// modo 'subir'     — nível + 1, com as escolhas novas e o que muda
// modo 'completar' — mesmo nível, só para responder escolhas pendentes
// ══════════════════════════════════════════════════════════════════════════════

let nivelCtx = null

function abrirNivel(char, modo = 'subir') {
    const original = JSON.parse(JSON.stringify(char.stats || {}))
    const alvoNivel = modo === 'subir' ? (original.nivel || 1) + 1 : (original.nivel || 1)
    const rascunho = JSON.parse(JSON.stringify(original))
    rascunho.nivel = alvoNivel
    rascunho.escolhas = rascunho.escolhas || {}
    nivelCtx = { charId: char.id, nome: char.name, original, rascunho, alvoNivel, modo }

    let overlay = document.getElementById('dndNivelModal')
    if (!overlay) {
        overlay = mk('div')
        overlay.id = 'dndNivelModal'
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) fecharNivel() })
        // O modal se redesenha a cada escolha; sem isto, o clique chegaria
        // ao document com o botão já fora da página e fecharia a ficha
        require('./dndSheet').segurarCliques(overlay)
        document.body.appendChild(overlay)
    }
    overlay.style.display = 'flex'
    desenharNivel()
}

function fecharNivel() {
    const overlay = document.getElementById('dndNivelModal')
    if (overlay) overlay.style.display = 'none'
    nivelCtx = null
}

function vagasDoNivel() {
    const { rascunho, alvoNivel, modo } = nivelCtx
    const vagas = dnd.vagasDeEscolha(rascunho, alvoNivel)
    // As listas de truques e magias (pool) aparecem em todo nível: ou crescem,
    // ou o jogador pode trocar uma magia, como manda a mesa
    if (modo === 'subir') return vagas.filter(v => v.nivel === alvoNivel || v.pool)
    // Completar: tudo que ainda está sem resposta, e o que já foi respondido
    // naquela mesma rodada continua visível para poder trocar
    return vagas.filter(v => !dnd.vagaCompleta(nivelCtx.original, v))
}

function desenharNivel() {
    const overlay = document.getElementById('dndNivelModal')
    if (!overlay || !nivelCtx) return
    const { original, rascunho, alvoNivel, modo, nome } = nivelCtx
    dnd.limparEscolhasInvalidas(rascunho)

    const anterior = overlay.querySelector('.connect-card')
    const scroll = anterior?.scrollTop || 0
    overlay.innerHTML = ''
    // A animação de entrada só na abertura: o cartão é refeito a cada escolha
    // e piscaria a cada clique
    const card = mk('div', 'connect-card dnd-nivel-card' + (anterior ? ' sem-entrada' : ''))
    const fechar = mk('button', 'char-modal-close-btn', '✕')
    fechar.title = 'Fechar'
    fechar.addEventListener('click', fecharNivel)
    card.appendChild(fechar)

    const antes = dnd.calcular(original)
    const depois = dnd.calcular(rascunho)
    card.appendChild(mk('div', 'card-icon', modo === 'subir' ? '⬆' : '✎'))
    card.appendChild(mk('h1', 'card-title', modo === 'subir' ? `Nível ${alvoNivel}` : 'Escolhas pendentes'))
    card.appendChild(mk('p', 'card-subtitle', `${nome} · ${depois.titulo}`))

    const corpo = mk('div', 'dnd-create dn-corpo')

    if (modo === 'subir') {
        const ganhos = mk('div', 'dc-numeros')
        const pv = depois.pvMax - antes.pvMax
        const itens = [['PV máx.', `${antes.pvMax} → ${depois.pvMax}`, `+${pv}`]]
        if (depois.prof !== antes.prof) itens.push(['Proficiência', `${dnd.sinal(antes.prof)} → ${dnd.sinal(depois.prof)}`])
        if (depois.infoClasse && depois.infoClasse !== antes.infoClasse) itens.push(['Classe', depois.infoClasse])
        itens.forEach(([r, v, destaque]) => {
            const n = mk('div', 'dc-numero')
            n.appendChild(mk('b', null, destaque || v))
            n.appendChild(mk('span', null, destaque ? `${r} (${v})` : r))
            ganhos.appendChild(n)
        })
        corpo.appendChild(ganhos)
        const { classe } = dnd.fontes(rascunho)
        if (classe) corpo.appendChild(mk('p', 'dc-dica', `PV pelo valor fixo do livro: ${classe.dadoVida / 2 + 1} (d${classe.dadoVida}) + CON ${dnd.sinal(depois.mods.con)}, mais bônus de raça e talentos.`))

        const novas = dnd.caracteristicasPorNivel(rascunho, alvoNivel).filter(x => x.nivel === alvoNivel)
        if (novas.length) {
            corpo.appendChild(subtitulo('O que você ganha'))
            corpo.appendChild(listaTracos(novas.map(x => ({ nome: x.nome, desc: x.desc }))))
        }

        const mudancas = mudancasDeNivel(antes, depois)
        if (mudancas.length) {
            const box = mk('div', 'dc-info')
            mudancas.forEach(([r, v]) => box.appendChild(linhaInfo(r, v)))
            corpo.appendChild(box)
        }
    }

    const vagas = vagasDoNivel()
    if (!vagas.length && modo === 'subir') corpo.appendChild(mk('p', 'dc-dica', 'Nenhuma escolha neste nível: é só confirmar.'))
    vagas.forEach(v => {
        // Ao subir, pode trocar uma magia já conhecida (truques não se trocam)
        const opts = modo === 'subir' && v.pool && v.id === 'conhecidas'
            ? { trocas: 1, originais: (nivelCtx.original.escolhas || {})[v.key] || [] }
            : modo === 'subir' && v.pool ? { trocas: 0, originais: (nivelCtx.original.escolhas || {})[v.key] || [] } : undefined
        corpo.appendChild(renderVaga(rascunho, v, desenharNivel, opts))
    })
    card.appendChild(corpo)

    const falta = vagas.filter(v => !dnd.vagaCompleta(rascunho, v))
    const nav = mk('div', 'dc-nav')
    const cancelar = mk('button', 'btn-ghost dc-nav-btn', 'Cancelar')
    cancelar.type = 'button'
    cancelar.addEventListener('click', fecharNivel)
    nav.appendChild(cancelar)
    nav.appendChild(mk('span', 'dc-nav-status', falta.length ? `Falta: ${falta[0].rotulo}` : ''))
    const ok = mk('button', 'btn-primary dc-nav-btn', modo === 'subir' ? `Confirmar nível ${alvoNivel}` : 'Salvar escolhas')
    ok.type = 'button'
    ok.disabled = falta.length > 0
    ok.addEventListener('click', confirmarNivel)
    nav.appendChild(ok)
    card.appendChild(nav)

    overlay.appendChild(card)
    card.scrollTop = scroll
}

function mudancasDeNivel(antes, depois) {
    const m = []
    const ca = antes.conjuracao, cd = depois.conjuracao
    if (cd) {
        const esp = e => (e || []).map((q, i) => `${q}×${i + 1}º`).join(' ') || '—'
        if (!ca || esp(ca.espacos) !== esp(cd.espacos)) m.push(['Espaços de magia', esp(cd.espacos)])
        if (cd.pacto && (!ca || !ca.pacto || ca.pacto.qtd !== cd.pacto.qtd || ca.pacto.nivel !== cd.pacto.nivel)) m.push(['Magia de pacto', `${cd.pacto.qtd} espaço(s) de ${cd.pacto.nivel}º nível`])
        if (cd.truques && (!ca || ca.truques !== cd.truques)) m.push(['Truques conhecidos', String(cd.truques)])
        if (cd.magias && (!ca || ca.magias !== cd.magias)) m.push(['Magias', `${ca ? ca.magias : 0} → ${cd.magias}`])
        if (cd.arcana.length && (!ca || ca.arcana.length !== cd.arcana.length)) m.push(['Arcana mística', cd.arcana.map(n => n + 'º').join(', ')])
    }
    const porId = Object.fromEntries(antes.recursos.map(r => [r.id, r]))
    depois.recursos.forEach(r => {
        const a = porId[r.id]
        const txt = `${r.max == null ? '∞' : r.max}${r.dado ? ' · ' + r.dado : ''}${r.info ? ' · ' + r.info : ''}`
        const txtA = a ? `${a.max == null ? '∞' : a.max}${a.dado ? ' · ' + a.dado : ''}${a.info ? ' · ' + a.info : ''}` : null
        if (txt !== txtA) m.push([r.nome, txtA ? `${txtA} → ${txt}` : txt])
    })
    return m
}

function confirmarNivel() {
    if (!nivelCtx) return
    const { charId, original, rascunho, alvoNivel, modo } = nivelCtx
    // O botão já fica desabilitado; isto garante que nada salva pela metade
    if (vagasDoNivel().some(v => !dnd.vagaCompleta(rascunho, v))) return
    const antes = dnd.calcular(original)
    const depois = dnd.materializar(rascunho)
    // Os PV ganhos entram nos PV atuais também
    const ganho = Math.max(0, depois.pvMax - antes.pvMax)
    const campos = {
        nivel: rascunho.nivel,
        subclasse: rascunho.subclasse || null,
        escolhas: rascunho.escolhas,
        hp_max: depois.pvMax,
        ca: depois.ca,
        hp: Math.min(depois.pvMax, (original.hp ?? antes.pvMax) + ganho),
    }
    if (modo === 'subir') {
        // Se o mestre liberou mais de um nível, a liberação continua valendo
        campos.nivel_liberado = original.nivel_liberado && original.nivel_liberado > alvoNivel ? original.nivel_liberado : null
    }
    require('./dndSheet').gravar(charId, campos)

    if (modo === 'subir' && state.socket) {
        const { classe } = dnd.fontes(rascunho)
        state.socket.emit('chat_message', {
            playerName: '⚙ Sistema',
            message: `⬆ ${nivelCtx.nome} subiu para o nível ${alvoNivel}${classe ? ` de ${classe.nome}` : ''} (+${ganho} PV).`,
            type: 'text',
        })
    }
    fecharNivel()
    require('./dndSheet').reabrirFicha()
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Peças de interface ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

function titulo(t, sub) {
    const w = mk('div', 'dc-titulo')
    w.appendChild(mk('h2', null, t))
    if (sub) w.appendChild(mk('p', null, sub))
    return w
}

function subtitulo(t) { return mk('div', 'dc-subtitulo', t) }

function cartao({ nome, sub, desc, icone, ativo, onClick }) {
    const b = mk('button', 'dc-cartao' + (ativo ? ' on' : '') + (icone ? ' com-icone' : ''))
    b.type = 'button'
    if (icone) b.appendChild(magiasUI.icone(icone, 'dc-cartao-icone'))
    b.appendChild(mk('span', 'dc-cartao-nome', nome))
    if (sub) b.appendChild(mk('span', 'dc-cartao-sub', sub))
    if (desc) b.appendChild(mk('span', 'dc-cartao-desc', desc))
    b.addEventListener('click', onClick)
    return b
}

function listaTracos(tracos, rodape) {
    const w = mk('div', 'dc-tracos')
    tracos.forEach(t => {
        const l = mk('div', 'dc-traco')
        l.appendChild(mk('b', null, t.nome))
        l.appendChild(mk('span', null, t.desc))
        w.appendChild(l)
    })
    if (rodape) w.appendChild(mk('div', 'dc-rodape', rodape))
    return w
}

function linhaInfo(rotulo, valor) {
    const l = mk('div', 'dc-info-linha')
    l.appendChild(mk('span', 'dc-info-rotulo', rotulo))
    l.appendChild(mk('span', 'dc-info-valor', valor || '—'))
    return l
}

function notaMagia(cj) {
    const partes = [`CD ${cj.cd}`, `ataque ${dnd.sinal(cj.ataque)}`]
    if (cj.truques) partes.push(`${cj.truques} truques`)
    if (cj.magias) partes.push(`${cj.magias} magias`)
    if (cj.espacos.length) partes.push(`espaços: ${cj.espacos.map((q, i) => `${q}×${i + 1}º`).join(' ')}`)
    if (cj.pacto) partes.push(`${cj.pacto.qtd} espaço(s) de pacto de ${cj.pacto.nivel}º`)
    const w = mk('div', 'dc-magia-nota')
    w.appendChild(mk('b', null, `✦ Magia (${D.ATRIBUTO_POR_KEY[cj.atributo].nome})`))
    w.appendChild(mk('span', null, partes.join(' · ')))
    return w
}

function botaoAjuste(txt, habilitado, onClick) {
    const b = mk('button', 'sp-adj-btn', txt)
    b.type = 'button'
    b.disabled = !habilitado
    b.addEventListener('click', e => { e.stopPropagation(); onClick() })
    return b
}

function textoBonus(attrs) {
    const e = Object.entries(attrs || {})
    if (e.length === 6) return '+1 em todos'
    return e.map(([k, n]) => `${dnd.sinal(n)} ${D.ATRIBUTO_POR_KEY[k].abrev}`).join(', ')
}

function textoArmas(armas) {
    const partes = (armas.categorias || []).map(c => D.CATEGORIAS_ARMA[c])
    ;(armas.lista || []).forEach(id => partes.push(D.ARMAS[id].nome.toLowerCase()))
    return partes.join(', ') || 'Nenhuma'
}

function fmtMetros(m) { return `${String(m).replace('.', ',')} m` }

function piscar(el) {
    el.classList.remove('piscar')
    void el.offsetWidth
    el.classList.add('piscar')
}

module.exports = {
    resetForm, render, validar, montarStats,
    abrirNivel, fecharNivel, renderVaga, tabelaPericias, fmtMetros,
}
