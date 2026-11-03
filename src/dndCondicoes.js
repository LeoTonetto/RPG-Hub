// ══════════════════════════════════════════════════════════════════════════════
// src/dndCondicoes.js — ESTADO DO PERSONAGEM EM JOGO (D&D 5e)
//
// Regras do livro que mudam durante a sessão, sem tela nenhuma aqui:
//   • condições (Apêndice A) e exaustão, e o que elas fazem nas rolagens;
//   • vantagem e desvantagem que o livro manda aplicar sozinhas (armadura
//     sem proficiência, Furtividade de armadura pesada, Fúria, Sortudo...);
//   • dano: resistência, PV temporários, Forma Selvagem, cair a 0 PV, morte
//     instantânea, teste de concentração; e cura;
//   • testes contra a morte (LdJ cap. 9).
//
// O que fica em stats:
//   condicoes: [id]          exaustao: 0..6
//   morte: { sucessos, falhas, estavel, morto } enquanto estiver a 0 PV
//   concentracao: { id, nome } da magia que está mantendo
//   forma: { id, pv } na Forma Selvagem (a criatura vem de dndCriaturas.js)
//
// As funções devolvem os CAMPOS a gravar; quem chama grava (dndSheet.gravar)
// e cuida do chat. Assim o mestre e o dono aplicam o dano do mesmo jeito.
// ══════════════════════════════════════════════════════════════════════════════

const D = require('./dndDados')

// Condições que implicam outras (LdJ, Apêndice A)
const IMPLICA = {
    inconsciente: ['incapacitado', 'caido'],
    atordoado: ['incapacitado'],
    paralisado: ['incapacitado'],
    petrificado: ['incapacitado'],
}
const FISICOS = ['concussão', 'cortante', 'perfurante']

// Vantagem em resistência contra uma origem (o mestre diz no pedido de teste)
const VANTAGEM_CONTRA = {
    veneno: [{ nome: 'Resiliência Anã', vale: s => s.raca === 'anao' }, { nome: 'Resiliência dos Robustos', vale: s => s.raca === 'halfling' && s.subraca === 'robusto' }],
    encantamento: [{ nome: 'Ancestral Feérico', vale: s => s.raca === 'elfo' || s.raca === 'meio-elfo' }],
    medo: [{ nome: 'Bravura', vale: s => s.raca === 'halfling' }],
    magia: [{ nome: 'Esperteza Gnômica', vale: (s, attr) => s.raca === 'gnomo' && ['int', 'sab', 'car'].includes(attr) },
        { nome: 'Resistência à Magia', vale: (s, attr, f) => s.classe === 'mago' && s.subclasse === 'abjuracao' && f.nivel >= 14 }],
}

/** As vantagens raciais (e de classe) em resistência que este personagem tem: [{ origem, nome }]. */
function vantagensContra(stats, f) {
    const out = []
    Object.entries(VANTAGEM_CONTRA).forEach(([origem, lista]) => lista.forEach(v => {
        if (v.vale(stats, 'int', f) || v.vale(stats, 'for', f)) out.push({ origem, nome: v.nome })
    }))
    return out
}

/** As condições em vigor, já com as que vêm junto (inconsciente → caído...). */
function condicoesAtivas(stats) {
    const lista = new Set((stats.condicoes || []).filter(c => D.CONDICOES[c]))
    ;[...lista].forEach(c => (IMPLICA[c] || []).forEach(x => lista.add(x)))
    return [...lista]
}

function temCondicao(stats, id) {
    return condicoesAtivas(stats).includes(id)
}

/** Sem ações nem reações (incapacitado, atordoado, inconsciente...). */
function semAcoes(stats) {
    return condicoesAtivas(stats).some(c => D.CONDICOES[c].efeitos.semAcoes)
}

function semCondicao(stats, id) {
    return (stats.condicoes || []).filter(c => c !== id)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Vantagem e desvantagem automáticas ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * O que o livro manda aplicar sozinho numa rolagem de d20.
 *   ctx.tipo: 'ataque' | 'pericia' | 'atributo' | 'resistencia' | 'iniciativa' | 'morte'
 *   ctx.atributo: 'for'...'car' (do teste, ou o do ataque)
 *   ctx.pericia: chave da perícia
 * Devolve { vantagem: [motivos], desvantagem: [motivos], falha, minimo, piso, sortudo,
 *           dadosExtras: [{ nome, expressao }] (Bênção), contexto: ctx.tipo }.
 */
function modoAutomatico(stats, f, ctx) {
    const r = { vantagem: [], desvantagem: [], falha: '', minimo: 0, piso: 0, sortudo: false, dadosExtras: [], contexto: ctx.tipo }
    const tipo = ctx.tipo
    const attr = ctx.atributo
    const ehTeste = tipo === 'pericia' || tipo === 'atributo' || tipo === 'iniciativa'
    const efeitos = stats.efeitos || {}

    // Efeitos recebidos: imunidade a condição (Heroísmo, Aura de Coragem),
    // vantagem (Velocidade) e dados que somam sozinhos (Bênção)
    const recebidos = (stats.efeitos_recebidos || []).map(e => ({ e, def: D.EFEITOS[e.tipo] })).filter(x => x.def)
    const imune = new Set(recebidos.flatMap(x => x.def.imune || []))
    recebidos.forEach(({ def }) => {
        if (tipo === 'resistencia' && (def.vantagemRes || []).includes(attr)) r.vantagem.push(def.nome.toLowerCase())
        if (tipo === 'pericia' && (def.vantagemPericia || []).includes(ctx.pericia)) r.vantagem.push(def.nome.toLowerCase())
        if (def.fixo && def.fixo.contextos.includes(tipo) && !r.dadosExtras.some(d => d.nome === def.nome)) r.dadosExtras.push({ nome: def.nome, expressao: def.fixo.expressao })
    })

    condicoesAtivas(stats).filter(c => !imune.has(c)).forEach(c => {
        const e = D.CONDICOES[c].efeitos
        const nome = D.CONDICOES[c].nome.toLowerCase()
        if (tipo === 'ataque' && e.ataque) r[e.ataque].push(nome)
        if (ehTeste && e.testes) r[e.testes].push(nome)
        if (tipo === 'resistencia' && (e.falhaRes || []).includes(attr)) r.falha = `${D.CONDICOES[c].nome}: falha em resistências de ${attr.toUpperCase()}`
        if (tipo === 'resistencia' && (e.desvRes || []).includes(attr)) r.desvantagem.push(nome)
    })

    const ex = stats.exaustao || 0
    if (ex >= 1 && ehTeste) r.desvantagem.push(`exaustão ${ex}`)
    if (ex >= 3 && (tipo === 'ataque' || tipo === 'resistencia' || tipo === 'morte')) r.desvantagem.push(`exaustão ${ex}`)

    // Armadura sem proficiência: desvantagem no que usa FOR ou DES
    if (f.semProfArmadura && (attr === 'for' || attr === 'des') && tipo !== 'morte') r.desvantagem.push('armadura sem proficiência')
    // Armaduras que atrapalham a Furtividade (a Maestria em Armadura Média tira isso da média)
    if (tipo === 'pericia' && ctx.pericia === 'furtividade' && f.armadura && f.armadura.furtividade) {
        const maestria = f.armadura.tipo === 'media' && f.talentos.includes('maestria-armadura-media')
        if (!maestria) r.desvantagem.push(`${f.armadura.nome.toLowerCase()} na Furtividade`)
    }
    // Vantagem racial contra a origem do teste (anão contra veneno, elfo contra encantamento...)
    if (tipo === 'resistencia' && ctx.origem) {
        ;(VANTAGEM_CONTRA[ctx.origem] || []).filter(v => v.vale(stats, attr, f)).forEach(v => r.vantagem.push(v.nome.toLowerCase()))
    }
    // Fúria: vantagem em testes e resistências de Força
    if (efeitos.furia && attr === 'for' && (ehTeste || tipo === 'resistencia')) r.vantagem.push('fúria')
    // Esquivar: vantagem nas resistências de DES até o próximo turno
    if (efeitos.esquivando && tipo === 'resistencia' && attr === 'des') r.vantagem.push('esquivando')
    // Talento Confiável (ladino 11º): perícia proficiente nunca rola menos de 10
    if (tipo === 'pericia' && stats.classe === 'ladino' && f.nivel >= 11 && f.pericias[ctx.pericia] && f.pericias[ctx.pericia].prof) r.minimo = 10
    // Força Indomável (bárbaro 18º): teste de FOR nunca fica abaixo do valor de Força
    if (ehTeste && attr === 'for' && stats.classe === 'barbaro' && f.nivel >= 18) r.piso = f.atributos.for
    // Sortudo (halfling): rola de novo o 1 natural em ataque, teste ou resistência
    if (stats.raca === 'halfling') r.sortudo = true
    return r
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Dano e cura ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Resistências e imunidades a tipo de dano neste momento. */
function defesasContraDano(stats, f) {
    const resiste = new Set(f.resistenciasDano || [])
    const imune = new Set()
    const efeitos = stats.efeitos || {}
    if (efeitos.furia && stats.classe === 'barbaro' && !(f.armadura && f.armadura.tipo === 'pesada')) FISICOS.forEach(t => resiste.add(t))
    if (stats.classe === 'monge' && f.nivel >= 10) imune.add('veneno')     // Pureza Corporal
    const tudo = temCondicao(stats, 'petrificado')
    return { resiste, imune, tudo }
}

/**
 * Aplica `qtd` de dano. op: { tipo, critico, magico } quando o tipo vem da
 * fonte; ou, no dano de criatura que o mestre aplica, { imune, resistente,
 * fisicoNaoMagico } marcados por ele.
 * Devolve { campos, eventos: [texto], dano (depois da resistência),
 *           concentracao: CD do teste ou 0, implacavel: CD da Fúria Implacável ou 0 }.
 */
function aplicarDano(stats, f, qtd, op = {}) {
    const campos = {}
    const eventos = []
    let dano = Math.max(0, Math.floor(qtd) || 0)
    const tipo = op.tipo || ''
    const { resiste, imune, tudo } = defesasContraDano(stats, f)
    if ((tipo && imune.has(tipo)) || op.imune) { eventos.push(tipo ? `imune a ${tipo}` : 'imune'); dano = 0 }
    else if ((tipo && resiste.has(tipo)) || op.resistente || tudo) { dano = Math.floor(dano / 2); eventos.push(tipo ? `resistência a ${tipo}` : 'resistência') }
    // Maestria em Armadura Pesada: −3 no dano físico não mágico, de armadura pesada
    const fisicoNaoMagico = op.fisicoNaoMagico || (FISICOS.includes(tipo) && !op.magico)
    if (dano && fisicoNaoMagico && f.armadura && f.armadura.tipo === 'pesada' && f.talentos.includes('maestria-armadura-pesada')) {
        dano = Math.max(0, dano - 3)
        eventos.push('Maestria em Armadura Pesada −3')
    }
    const sofrido = dano
    const res = { campos, eventos, dano: sofrido, concentracao: 0, implacavel: 0 }
    if (!dano) return res

    const morte = stats.morte || null
    if (morte && morte.morto) return res
    const hp = stats.hp ?? f.pvMax

    // Já caído: cada dano é uma falha no teste contra a morte (crítico vale duas)
    if (hp <= 0 && !stats.forma) {
        if (dano >= f.pvMax) {
            campos.morte = { sucessos: 0, falhas: 3, estavel: false, morto: true }
            eventos.push('morte: o dano passou dos PV máximos')
        } else {
            const falhas = Math.min(3, ((morte && morte.falhas) || 0) + (op.critico ? 2 : 1))
            campos.morte = { sucessos: (morte && morte.sucessos) || 0, falhas, estavel: false, morto: falhas >= 3 }
            eventos.push(falhas >= 3 ? 'morreu (3 falhas)' : `falha no teste contra a morte (${falhas}/3)`)
        }
        return res
    }

    // Proteção Arcana (mago abjurador): a proteção sofre o dano primeiro
    const protecao = stats.protecao_arcana
    if (dano && protecao && protecao.pv > 0) {
        const absorvido = Math.min(protecao.pv, dano)
        dano -= absorvido
        campos.protecao_arcana = { ...protecao, pv: protecao.pv - absorvido }
        eventos.push(`Proteção Arcana absorve ${absorvido}`)
    }

    // Forma Selvagem: os PV da besta vão primeiro; o que passar vai para o druida
    if (stats.forma) {
        const pvForma = stats.forma.pv || 0
        if (dano < pvForma) { campos.forma = { ...stats.forma, pv: pvForma - dano }; dano = 0 }
        else { dano -= pvForma; campos.forma = null; eventos.push('volta à forma normal') }
    }

    // PV temporários
    let temp = stats.hp_temp || 0
    if (temp && dano) {
        const absorvido = Math.min(temp, dano)
        temp -= absorvido
        dano -= absorvido
        campos.hp_temp = temp
        if (!temp && (stats.efeitos || {}).agathys) {
            campos.efeitos = { ...stats.efeitos }
            delete campos.efeitos.agathys
        }
    }

    let caiu = false
    if (dano) {
        const restante = hp - dano
        if (restante > 0) campos.hp = restante
        else if (-restante >= f.pvMax) {
            // Dano que passa dos PV máximos mata na hora (LdJ p. 197)
            campos.hp = 0
            campos.morte = { sucessos: 0, falhas: 3, estavel: false, morto: true }
            eventos.push('morte instantânea')
            caiu = true
        } else if (stats.raca === 'meio-orc' && !((stats.recursos_usados || {})['resistencia-implacavel'])) {
            campos.hp = 1
            campos.recursos_usados = { ...(stats.recursos_usados || {}), 'resistencia-implacavel': 1 }
            eventos.push('Resistência Implacável: fica com 1 PV')
        } else {
            campos.hp = 0
            caiu = true
            // Fúria Implacável (bárbaro 11º, em fúria): o app rola a resistência de CON
            if (stats.classe === 'barbaro' && f.nivel >= 11 && (stats.efeitos || {}).furia) {
                res.implacavel = (stats.efeitos || {}).implacavelCd || 10
            } else {
                campos.morte = { sucessos: 0, falhas: 0, estavel: false, morto: false }
                campos.condicoes = [...new Set([...(stats.condicoes || []), 'inconsciente'])]
                eventos.push('cai inconsciente')
            }
        }
    }

    // Concentração: cair encerra; senão, teste de CON CD 10 ou metade do dano
    if (stats.concentracao) {
        if (caiu && !res.implacavel) { campos.concentracao = null; eventos.push(`perde a concentração em ${stats.concentracao.nome}`) }
        else res.concentracao = Math.max(10, Math.floor(sofrido / 2))
    }
    return res
}

/** Depois da Fúria Implacável: passou fica com 1 PV, falhou cai. */
function resultadoImplacavel(stats, passou) {
    const efeitos = { ...(stats.efeitos || {}), implacavelCd: ((stats.efeitos || {}).implacavelCd || 10) + 5 }
    if (passou) return { hp: 1, efeitos }
    return {
        hp: 0, efeitos,
        morte: { sucessos: 0, falhas: 0, estavel: false, morto: false },
        condicoes: [...new Set([...(stats.condicoes || []), 'inconsciente'])],
        concentracao: null,
    }
}

/** Cura: a partir de 0 PV, a criatura volta a si e os testes zeram. */
function curar(stats, f, qtd) {
    const n = Math.max(0, Math.floor(qtd) || 0)
    if (!n || (stats.morte && stats.morte.morto)) return {}
    if (stats.forma) {
        const max = stats.forma.pvMax || stats.forma.pv
        return { forma: { ...stats.forma, pv: Math.min(max, (stats.forma.pv || 0) + n) } }
    }
    const campos = { hp: Math.min(f.pvMax, Math.max(0, stats.hp ?? 0) + n) }
    if ((stats.hp ?? 1) <= 0) {
        campos.morte = null
        campos.condicoes = semCondicao(stats, 'inconsciente')
    }
    return campos
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Testes contra a morte ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function caido(stats) {
    return (stats.hp ?? 1) <= 0 && !(stats.morte && stats.morte.morto)
}

function morto(stats) {
    return !!(stats.morte && stats.morte.morto)
}

/** Resultado de um teste contra a morte (d20 puro: 10 ou mais é sucesso). */
function testeContraMorte(stats, natural) {
    const m = { sucessos: 0, falhas: 0, estavel: false, morto: false, ...(stats.morte || {}) }
    if (natural === 20) {
        return { campos: { hp: 1, morte: null, condicoes: semCondicao(stats, 'inconsciente') }, texto: '20 natural: volta com 1 PV!' }
    }
    if (natural === 1) m.falhas += 2
    else if (natural >= 10) m.sucessos += 1
    else m.falhas += 1
    m.falhas = Math.min(3, m.falhas)
    let texto = `${m.sucessos} sucesso(s), ${m.falhas} falha(s)`
    if (m.falhas >= 3) { m.morto = true; texto = 'morreu' }
    else if (m.sucessos >= 3) { m.estavel = true; texto = 'estável (continua inconsciente a 0 PV)' }
    return { campos: { morte: m }, texto }
}

function estabilizar(stats) {
    return { morte: { ...(stats.morte || {}), sucessos: 3, estavel: true } }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Concentração ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Começar a se concentrar numa magia encerra a anterior. */
function concentrarEm(stats, magia) {
    return { campos: { concentracao: { id: magia.id, nome: magia.nome } }, anterior: stats.concentracao || null }
}

module.exports = {
    condicoesAtivas, temCondicao, semAcoes, semCondicao,
    modoAutomatico, vantagensContra, defesasContraDano, aplicarDano, resultadoImplacavel, curar,
    caido, morto, testeContraMorte, estabilizar, concentrarEm,
}
