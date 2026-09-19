// ══════════════════════════════════════════════════════════════════════════════
// src/calicoCreate.js — CRIADOR DE PERSONAGEM GUIADO DO SISTEMA CALICO
//
// Renderiza dentro de #systemFields (o mesmo container que os outros sistemas
// usam). characters.js delega para cá quando o sistema escolhido é 'calico'.
//
// Regra de ouro (spec §12, P0): não deixa salvar ficha inválida. Toda a
// validação vem de calico.js — este arquivo é só UI e estado do formulário.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const C = require('./calico')

// ── Estado do formulário ──────────────────────────────────────────────────────
let form = null

// Conteúdo carregado do Supabase (com fallback nos seeds de calico.js)
let perfisCache = null
let ocupacoesCache = null

function perfis() { return perfisCache || C.PERFIS }
function ocupacoes() { return ocupacoesCache || C.OCUPACOES }

function resetForm() {
    form = {
        arranjo: null,                   // id do arranjo de atributos escolhido
        atributos: {},                   // { fisico: 'd8', ... }
        perfil: null,
        ocupacao: null,
        pericias: C.periciasIniciais(),
        aptidaoEspecializacao: null,
        arma: null,
        // Perícias marcadas pelo jogador, por slot
        slotD8: null,                    // key da perícia elevada em 2 passos
        slotsD6: [],                     // keys das perícias elevadas em 1 passo
        aberto: { pericias: true },
    }
}

/**
 * Carrega perfis e ocupações do Supabase. Se a tabela não existir, estiver
 * vazia ou o banco não responder, mantém os seeds de calico.js — a criação de
 * ficha nunca pode travar por causa disso.
 */
async function carregarConteudo() {
    if (!state.supabase) return
    try {
        const [{ data: pf }, { data: oc }] = await Promise.all([
            state.supabase.from('calico_perfis').select('*').eq('ativo', true).order('ordem'),
            state.supabase.from('calico_ocupacoes').select('*').eq('ativo', true).order('ordem'),
        ])
        if (pf && pf.length) {
            perfisCache = pf.map(r => ({
                id: r.id, nome: r.nome, icon: r.icon || '◆', descricao: r.descricao || '',
                habilidadeNome: r.habilidade_nome, habilidadeTexto: r.habilidade_texto,
                placeholder: !!r.placeholder,
            }))
        }
        if (oc && oc.length) {
            ocupacoesCache = oc.map(r => ({
                id: r.id, nome: r.nome, icon: r.icon || '◆',
                habilidadeNome: r.habilidade_nome, habilidadeTexto: r.habilidade_texto,
            }))
        }
        console.log(`[Calico] Conteúdo: ${perfis().length} perfis, ${ocupacoes().length} ocupações` +
            (perfisCache ? ' (do Supabase)' : ' (seed local)'))
    } catch (e) {
        console.warn('[Calico] Tabelas de conteúdo indisponíveis, usando seed local:', e.message)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Render principal ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function render(container, onChange) {
    if (!form) resetForm()
    container.innerHTML = ''
    container.classList.add('calico-create')

    container.appendChild(secaoIntro())
    container.appendChild(secaoAtributos(container, onChange))
    container.appendChild(secaoPerfil(container, onChange))
    container.appendChild(secaoOcupacao(container, onChange))
    container.appendChild(secaoPericias(container, onChange))
    container.appendChild(secaoArma(container, onChange))
    container.appendChild(secaoDerivados())
    container.appendChild(secaoStatus())
}

function rerender(container, onChange) { render(container, onChange) }

// ── Intro ─────────────────────────────────────────────────────────────────────
function secaoIntro() {
    const box = mk('div', 'system-info-box calico-intro')
    box.appendChild(mk('div', 'calico-intro-line',
        'Todo teste é 2 dados somados contra uma DT. A DT padrão é 7.'))
    box.appendChild(mk('div', 'calico-intro-sub',
        'Atributos e perícias são dados, não números: d4 → d6 → d8 → d10 → d12.'))
    return box
}

// ── 1. Atributos ──────────────────────────────────────────────────────────────
function secaoAtributos(container, onChange) {
    const sec = bloco('① Atributos', 'Escolha um arranjo e distribua entre os três')

    const arranjos = mk('div', 'calico-arranjos')
    C.CALICO_CONFIG.orcamentoCriacao.arranjosAtributos.forEach(arr => {
        const btn = mk('button', 'calico-arranjo-btn' + (form.arranjo === arr.id ? ' active' : ''))
        btn.type = 'button'
        btn.appendChild(mk('span', 'calico-arranjo-nome', arr.label))
        btn.appendChild(mk('span', 'calico-arranjo-dados', arr.dados.join(' · ')))
        btn.addEventListener('click', () => {
            form.arranjo = arr.id
            form.atributos = {}
            // Pré-distribui na ordem FÍSICO / MENTE / EMOÇÃO; o jogador ajusta depois
            C.ATRIBUTOS.forEach((a, i) => { form.atributos[a.key] = arr.dados[i] })
            rerender(container, onChange); onChange()
        })
        arranjos.appendChild(btn)
    })
    sec.appendChild(arranjos)

    if (form.arranjo) {
        const arr = C.CALICO_CONFIG.orcamentoCriacao.arranjosAtributos.find(a => a.id === form.arranjo)
        const disponiveis = [...arr.dados]

        const grid = mk('div', 'calico-attr-grid')
        C.ATRIBUTOS.forEach(attr => {
            const row = mk('div', 'calico-attr-row')
            row.appendChild(mk('span', 'calico-attr-icon', attr.icon))

            const info = mk('div', 'calico-attr-info')
            info.appendChild(mk('span', 'calico-attr-label', attr.label))
            const atual = form.atributos[attr.key]
            info.appendChild(mk('span', 'calico-attr-escala', atual ? C.ESCALA_ATRIBUTO[atual] : attr.descricao))
            row.appendChild(info)

            // Botões com os dados do arranjo; trocar um dado faz swap com quem o tinha
            const opts = mk('div', 'calico-die-opts')
            const unicos = [...new Set(disponiveis)]
            unicos.forEach(dado => {
                const b = mk('button', 'calico-die-btn' + (form.atributos[attr.key] === dado ? ' active' : ''), dado)
                b.type = 'button'
                b.addEventListener('click', () => {
                    trocarAtributo(attr.key, dado)
                    rerender(container, onChange); onChange()
                })
                opts.appendChild(b)
            })
            row.appendChild(opts)
            grid.appendChild(row)
        })
        sec.appendChild(grid)
    }

    return sec
}

/** Atribui `dado` a `key`, trocando com o atributo que já o tinha (swap). */
function trocarAtributo(key, dado) {
    const anterior = form.atributos[key]
    const dono = C.ATRIBUTOS.map(a => a.key).find(k => k !== key && form.atributos[k] === dado)
    form.atributos[key] = dado
    if (dono) form.atributos[dono] = anterior
    // Mudar atributo pode estourar o teto de uma perícia já marcada — reavalia
    limparPericiasAcimaDoTeto()
}

function limparPericiasAcimaDoTeto() {
    if (Object.keys(form.atributos).length < C.ATRIBUTOS.length) return
    if (form.slotD8 && C.periciaExcedeTeto(form.slotD8, form.pericias[form.slotD8], form.atributos)) {
        desmarcarPericia(form.slotD8)
    }
    form.slotsD6.slice().forEach(k => {
        if (C.periciaExcedeTeto(k, form.pericias[k], form.atributos)) desmarcarPericia(k)
    })
}

// ── 2. Perfil ─────────────────────────────────────────────────────────────────
function secaoPerfil(container, onChange) {
    const sec = bloco('② Perfil', 'Substitui as classes. Concede uma habilidade')
    const lista = mk('div', 'calico-choice-list')

    perfis().forEach(p => {
        const card = mk('button', 'calico-choice' + (form.perfil === p.id ? ' active' : ''))
        card.type = 'button'
        const head = mk('div', 'calico-choice-head')
        head.appendChild(mk('span', 'calico-choice-icon', p.icon))
        head.appendChild(mk('span', 'calico-choice-nome', p.nome))
        if (p.placeholder) {
            const tag = mk('span', 'calico-tag-placeholder', 'texto provisório')
            tag.title = 'Habilidade em placeholder — substitua pelo texto oficial do PDF do playtest (spec §4.1)'
            head.appendChild(tag)
        }
        card.appendChild(head)
        if (p.descricao) card.appendChild(mk('div', 'calico-choice-desc', p.descricao))
        card.appendChild(mk('div', 'calico-choice-hab', `⚡ ${p.habilidadeNome}: ${p.habilidadeTexto}`))
        card.addEventListener('click', () => {
            form.perfil = form.perfil === p.id ? null : p.id
            rerender(container, onChange); onChange()
        })
        lista.appendChild(card)
    })

    sec.appendChild(lista)
    return sec
}

// ── 3. Ocupação ───────────────────────────────────────────────────────────────
function secaoOcupacao(container, onChange) {
    const sec = bloco('③ Ocupação', 'O que você fazia antes de tudo desandar')
    const lista = mk('div', 'calico-choice-list calico-ocupacoes')

    ocupacoes().forEach(o => {
        const card = mk('button', 'calico-choice compact' + (form.ocupacao === o.id ? ' active' : ''))
        card.type = 'button'
        const head = mk('div', 'calico-choice-head')
        head.appendChild(mk('span', 'calico-choice-icon', o.icon))
        head.appendChild(mk('span', 'calico-choice-nome', o.nome))
        card.appendChild(head)
        card.appendChild(mk('div', 'calico-choice-hab', `⚡ ${o.habilidadeNome}: ${o.habilidadeTexto}`))
        card.addEventListener('click', () => {
            form.ocupacao = form.ocupacao === o.id ? null : o.id
            rerender(container, onChange); onChange()
        })
        lista.appendChild(card)
    })

    sec.appendChild(lista)
    return sec
}

// ── 4. Perícias ───────────────────────────────────────────────────────────────
function secaoPericias(container, onChange) {
    const orc = C.CALICO_CONFIG.orcamentoCriacao
    const restaD8 = orc.periciasD8 - (form.slotD8 ? 1 : 0)
    const restaD6 = orc.periciasD6 - form.slotsD6.length

    const sec = bloco('④ Perícias', 'Todas começam em d4. Pontaria já vem em d6, de graça')

    // Contadores de orçamento
    const conta = mk('div', 'calico-budget')
    conta.appendChild(badgeOrcamento('Especialista (d8)', restaD8, orc.periciasD8))
    conta.appendChild(badgeOrcamento('Treinada (d6)', restaD6, orc.periciasD6))
    sec.appendChild(conta)

    const attrPronto = Object.keys(form.atributos).length === C.ATRIBUTOS.length
    if (!attrPronto) {
        sec.appendChild(mk('div', 'calico-hint', 'Escolha os atributos primeiro — eles definem o teto de cada perícia.'))
        return sec
    }

    const grid = mk('div', 'calico-pericia-grid')
    C.PERICIAS.forEach(p => {
        grid.appendChild(linhaPericia(p, restaD8, restaD6, container, onChange))
    })
    sec.appendChild(grid)

    // Especialização de Aptidão — só aparece quando Aptidão foi treinada
    if (C.indiceDado(form.pericias.aptidao) > C.indiceDado('d4')) {
        const espec = mk('div', 'calico-espec')
        espec.appendChild(mk('div', 'calico-espec-title', 'Especialização de Aptidão'))
        const opts = mk('div', 'calico-espec-opts')
        C.APTIDAO_ESPECIALIZACOES.forEach(e => {
            const b = mk('button', 'calico-espec-btn' + (form.aptidaoEspecializacao === e.key ? ' active' : ''), e.label)
            b.type = 'button'
            b.title = e.desc
            b.addEventListener('click', () => {
                form.aptidaoEspecializacao = e.key
                rerender(container, onChange); onChange()
            })
            opts.appendChild(b)
        })
        espec.appendChild(opts)
        sec.appendChild(espec)
    }

    return sec
}

function linhaPericia(p, restaD8, restaD6, container, onChange) {
    const base = C.periciasIniciais()
    const atual = form.pericias[p.key]
    const passos = C.passosEntre(base[p.key], atual)
    const teto = C.tetoDaPericia(p.key, form.atributos)
    const gratuita = base[p.key] !== 'd4'

    const row = mk('div', 'calico-pericia-row' + (passos > 0 ? ' marcada' : ''))

    row.appendChild(mk('span', 'calico-pericia-icon', p.icon))

    const info = mk('div', 'calico-pericia-info')
    const nomeWrap = mk('div', 'calico-pericia-nome-wrap')
    nomeWrap.appendChild(mk('span', 'calico-pericia-nome', p.label))
    nomeWrap.appendChild(mk('span', 'calico-pericia-attr', C.ATRIBUTOS.find(a => a.key === p.attr).label))
    if (gratuita) {
        const g = mk('span', 'calico-pericia-gratis', 'grátis')
        g.title = 'Bônus de ambientação: é 1890, todo mundo atira (spec §6.6)'
        nomeWrap.appendChild(g)
    }
    if (p.naoSugerir) {
        const n = mk('span', 'calico-pericia-aviso', '⚠')
        n.title = 'Nesta campanha ninguém sabe o que é o paranormal. Ocultismo deve começar d4.'
        nomeWrap.appendChild(n)
    }
    info.appendChild(nomeWrap)
    info.appendChild(mk('div', 'calico-pericia-desc', p.desc))
    row.appendChild(info)

    // Valor atual + o que ele significa na escala
    const valWrap = mk('div', 'calico-pericia-val-wrap')
    const val = mk('span', 'calico-pericia-val' + (passos > 0 ? ' up' : ''), atual)
    valWrap.appendChild(val)
    valWrap.appendChild(mk('span', 'calico-pericia-escala', C.ESCALA_PERICIA[atual]))
    row.appendChild(valWrap)

    // Botões de slot
    const acoes = mk('div', 'calico-pericia-acoes')

    const ehD8 = form.slotD8 === p.key
    const ehD6 = form.slotsD6.includes(p.key)

    const btn6 = mk('button', 'calico-slot-btn' + (ehD6 ? ' active' : ''), '+1')
    btn6.type = 'button'
    btn6.title = ehD6 ? 'Remover treinamento' : `Treinar: +1 passo (${atual} → ${C.passoDado(atual, 1)})`
    const bloqueio6 = motivoBloqueio(p, 1, ehD6)
    btn6.disabled = !!bloqueio6 || (!ehD6 && restaD6 <= 0)
    if (bloqueio6) btn6.title = bloqueio6
    btn6.addEventListener('click', () => {
        if (ehD6) desmarcarPericia(p.key); else marcarPericia(p.key, 1)
        rerender(container, onChange); onChange()
    })
    acoes.appendChild(btn6)

    const btn8 = mk('button', 'calico-slot-btn wide' + (ehD8 ? ' active' : ''), '+2')
    btn8.type = 'button'
    btn8.title = ehD8 ? 'Remover especialização' : `Especialista: +2 passos (${atual} → ${C.passoDado(atual, 2)})`
    const bloqueio8 = motivoBloqueio(p, 2, ehD8)
    btn8.disabled = !!bloqueio8 || (!ehD8 && restaD8 <= 0)
    if (bloqueio8) btn8.title = bloqueio8
    btn8.addEventListener('click', () => {
        if (ehD8) desmarcarPericia(p.key); else marcarPericia(p.key, 2)
        rerender(container, onChange); onChange()
    })
    acoes.appendChild(btn8)

    row.appendChild(acoes)

    // Teto atingido — deixa explícito por quê
    if (C.indiceDado(atual) >= C.indiceDado(teto)) {
        row.classList.add('no-teto')
        row.title = `Teto ${teto}: uma perícia não pode passar do atributo-base em mais de ${C.CALICO_CONFIG.maxPassosAcimaDoAtributoBase} passos.`
    }

    return row
}

/** Retorna o motivo pelo qual o slot não pode ser aplicado, ou null. */
function motivoBloqueio(p, passos, jaMarcada) {
    if (jaMarcada) return null
    // Uma perícia só ocupa um slot de cada vez
    if (form.slotD8 === p.key || form.slotsD6.includes(p.key)) {
        return 'Esta perícia já usa um slot. Remova-o antes de trocar.'
    }
    const alvo = C.passoDado(form.pericias[p.key], passos)
    if (C.periciaExcedeTeto(p.key, alvo, form.atributos)) {
        const teto = C.tetoDaPericia(p.key, form.atributos)
        const attrLabel = C.ATRIBUTOS.find(a => a.key === p.attr).label
        return `Bloqueado: ${alvo} passa do teto ${teto} (${attrLabel} ${form.atributos[p.attr]} + ${C.CALICO_CONFIG.maxPassosAcimaDoAtributoBase} passos).`
    }
    return null
}

function marcarPericia(key, passos) {
    const base = C.periciasIniciais()
    form.pericias[key] = C.passoDado(base[key], passos)
    if (passos === 2) form.slotD8 = key
    else if (!form.slotsD6.includes(key)) form.slotsD6.push(key)
}

function desmarcarPericia(key) {
    const base = C.periciasIniciais()
    form.pericias[key] = base[key]
    if (form.slotD8 === key) form.slotD8 = null
    form.slotsD6 = form.slotsD6.filter(k => k !== key)
    if (key === 'aptidao') form.aptidaoEspecializacao = null
}

function badgeOrcamento(label, resta, total) {
    const b = mk('div', 'calico-budget-badge' + (resta === 0 ? ' done' : ''))
    b.appendChild(mk('span', 'calico-budget-label', label))
    b.appendChild(mk('span', 'calico-budget-val', `${total - resta}/${total}`))
    return b
}

// ── 5. Arma inicial ───────────────────────────────────────────────────────────
function secaoArma(container, onChange) {
    const sec = bloco('⑤ Arma inicial', 'Uma arma de fogo, com 2 recargas completas')

    const lista = mk('div', 'calico-arma-list')
    C.ARMAS_INICIAIS.forEach(a => {
        const card = mk('button', 'calico-arma' + (form.arma === a.id ? ' active' : ''))
        card.type = 'button'
        const head = mk('div', 'calico-arma-head')
        head.appendChild(mk('span', 'calico-arma-nome', a.nome))
        head.appendChild(mk('span', 'calico-arma-dano', a.dano))
        card.appendChild(head)
        const meta = mk('div', 'calico-arma-meta')
        meta.textContent = `${a.capacidade} tiros · ${a.recargaLabel}`
        card.appendChild(meta)
        if (a.nota) card.appendChild(mk('div', 'calico-arma-nota', a.nota))
        card.addEventListener('click', () => {
            form.arma = form.arma === a.id ? null : a.id
            rerender(container, onChange); onChange()
        })
        lista.appendChild(card)
    })
    sec.appendChild(lista)

    const eq = mk('div', 'calico-hint')
    eq.textContent = 'Todo personagem também começa com: ' + C.EQUIPAMENTO_INICIAL.join(', ').toLowerCase() +
        '. Mais 3 itens de texto livre ligados à ocupação, aprovados pelo mestre — adicione-os pelo inventário depois.'
    sec.appendChild(eq)

    return sec
}

// ── 6. Derivados ──────────────────────────────────────────────────────────────
function secaoDerivados() {
    const sec = mk('div', 'calico-derivados')
    const temFisico = !!form.atributos.fisico
    const temEmocao = !!form.atributos.emocao

    const pv = mk('div', 'calico-deriv pv')
    pv.appendChild(mk('span', 'calico-deriv-label', '❤ PV'))
    pv.appendChild(mk('span', 'calico-deriv-val', temFisico ? String(C.pvMaximo(form.atributos.fisico, 1)) : '—'))
    pv.appendChild(mk('span', 'calico-deriv-formula', temFisico ? `FÍSICO ${form.atributos.fisico}` : 'depende do Físico'))
    sec.appendChild(pv)

    // §14 — PD recebe o mesmo destaque visual do PV, nunca menos
    const pd = mk('div', 'calico-deriv pd')
    pd.appendChild(mk('span', 'calico-deriv-label', '🕯 PD'))
    pd.appendChild(mk('span', 'calico-deriv-val', temEmocao ? String(C.pdMaximo(form.atributos.emocao, 1)) : '—'))
    pd.appendChild(mk('span', 'calico-deriv-formula', temEmocao ? `EMOÇÃO ${form.atributos.emocao}` : 'depende da Emoção'))
    sec.appendChild(pd)

    const nv = mk('div', 'calico-deriv nv')
    nv.appendChild(mk('span', 'calico-deriv-label', '✦ Nível'))
    nv.appendChild(mk('span', 'calico-deriv-val', '1'))
    nv.appendChild(mk('span', 'calico-deriv-formula', 'sobe por arco, não por XP'))
    sec.appendChild(nv)

    return sec
}

// ── 7. Status da validação ────────────────────────────────────────────────────
function secaoStatus() {
    const box = mk('div', 'calico-status')
    const v = validar('__previa__')

    if (v.valido) {
        box.classList.add('ok')
        box.appendChild(mk('div', 'calico-status-line', '✓ Ficha completa e dentro do orçamento.'))
    } else {
        const pendencias = [...v.erros, ...v.avisos].filter(m => m !== 'O nome do personagem é obrigatório.')
        if (pendencias.length === 0) {
            box.classList.add('ok')
            box.appendChild(mk('div', 'calico-status-line', '✓ Só falta o nome do personagem.'))
        } else {
            box.classList.add(v.erros.length ? 'error' : 'pending')
            pendencias.slice(0, 5).forEach(m => box.appendChild(mk('div', 'calico-status-line', '• ' + m)))
        }
    }
    return box
}

// ══════════════════════════════════════════════════════════════════════════════
// ── API consumida por characters.js ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Valida o formulário atual. `nome` vem do campo comum do modal. */
function validar(nome) {
    return C.validarCriacao({
        nome,
        perfil: form && form.perfil,
        ocupacao: form && form.ocupacao,
        atributos: (form && form.atributos) || {},
        pericias: (form && form.pericias) || {},
        aptidaoEspecializacao: form && form.aptidaoEspecializacao,
        arma: form && form.arma,
    })
}

/** Monta o `stats` final para gravar em characters.stats. */
function montarStats() {
    return C.montarStats({
        perfil: form.perfil,
        ocupacao: form.ocupacao,
        atributos: form.atributos,
        pericias: form.pericias,
        aptidaoEspecializacao: form.aptidaoEspecializacao,
        arma: form.arma,
        nivel: 1,
    }, { perfis: perfis(), ocupacoes: ocupacoes() })
}

/** Itens de texto livre que devem entrar no inventário do personagem novo. */
function itensIniciais() {
    const itens = C.EQUIPAMENTO_INICIAL.slice()
    const armaDef = C.ARMAS_POR_ID[form.arma]
    if (armaDef) {
        itens.unshift(armaDef.nome)
        itens.push(`Munição de ${armaDef.nome} — 2 recargas`)
    }
    return itens
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

function bloco(titulo, sub) {
    const sec = mk('div', 'calico-sec')
    const head = mk('div', 'calico-sec-head')
    head.appendChild(mk('span', 'calico-sec-title', titulo))
    if (sub) head.appendChild(mk('span', 'calico-sec-sub', sub))
    sec.appendChild(head)
    return sec
}

module.exports = { resetForm, render, validar, montarStats, itensIniciais, carregarConteudo }
