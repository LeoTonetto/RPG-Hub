// ══════════════════════════════════════════════════════════════════════════════
// src/dnd.js — MOTOR DE REGRAS DO D&D 5e
//
// A ficha guarda só o que o jogador decidiu (raça, classe, antecedente,
// atributos-base e as escolhas de cada fonte). Todo o resto — modificadores,
// perícias, CA, PV, espaços de magia, recursos — sai de calcular(stats),
// sempre a partir dessas decisões. Assim subir de nível ou trocar uma escolha
// nunca deixa número velho para trás.
//
// As escolhas ficam em stats.escolhas, numa chave por "vaga":
//   raca:idioma · subraca:idioma · antecedente:idiomas · classe:pericias
//   nv3:manobras · nv4:asi · nv4:talento:aumento · nv4:talento:idiomas
// A subclasse fica em stats.subclasse.
//
// Regras decididas com o mestre (2026-11-02): atributos pelos três métodos do
// livro com bônus racial fixo; PV por nível pelo valor fixo; o mestre libera a
// subida de nível; talentos permitidos; sem multiclasse e sem humano variante.
// ══════════════════════════════════════════════════════════════════════════════

const D = require('./dndDados')
const { CLASSES, porNivel } = require('./dndClasses')
const { LISTAS } = require('./dndListas')
const C = require('./dndConteudo')
const CR = require('./dndCriaturas')

const NIVEL_MAX = 20

// Atributo de conjuração de cada lista de magias (usado nas magias que vêm
// de talento ou de outra classe, como no Iniciado em Magia)
const ATRIBUTO_DA_LISTA = { bardo: 'car', bruxo: 'car', clerigo: 'sab', druida: 'sab', feiticeiro: 'car', mago: 'int', paladino: 'car', patrulheiro: 'sab' }
const NOME_DA_LISTA = { bardo: 'bardo', bruxo: 'bruxo', clerigo: 'clérigo', druida: 'druida', feiticeiro: 'feiticeiro', mago: 'mago', paladino: 'paladino', patrulheiro: 'patrulheiro', todas: 'qualquer classe' }
const talentos = () => C.talentos()

// ── Atributos ─────────────────────────────────────────────────────────────────
const COMPRA_PONTOS = 27
const CUSTO_COMPRA = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
const CONJUNTO_PADRAO = [15, 14, 13, 12, 10, 8]
const METODOS = {
    compra: { nome: 'Compra de pontos', desc: '27 pontos para distribuir; cada valor entre 8 e 15.' },
    padrao: { nome: 'Conjunto padrão', desc: 'Distribua 15, 14, 13, 12, 10 e 8.' },
    rolagem: { nome: 'Rolar 4d6', desc: 'Seis rolagens de 4d6, descartando o menor dado. A rolagem vai para o chat.' },
}

const mod = v => Math.floor(((v ?? 10) - 10) / 2)
const proficiencia = nivel => 2 + Math.floor((Math.max(1, nivel) - 1) / 4)
const sinal = n => (n >= 0 ? '+' : '') + n

// Espaços de magia do conjurador completo, do 1º ao 20º nível
const ESPACOS_COMPLETO = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

// Deslocamento extra do monge sem armadura, em metros
const MOVIMENTO_MONGE = [[2, 3], [6, 4.5], [10, 6], [14, 7.5], [18, 9]]

// ══════════════════════════════════════════════════════════════════════════════
// ── Ficha nova ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function novaFicha() {
    return {
        sistema: 'dnd5e-v1',
        nivel: 1,
        raca: null, subraca: null, classe: null, subclasse: null, antecedente: null,
        metodo: 'compra',
        atributos_base: { for: 8, des: 8, con: 8, int: 8, sab: 8, car: 8 },
        rolagens: null,            // valores do 4d6, quando o método é rolagem
        escolhas: {},
        alinhamento: null,
        personalidade: { tracos: '', ideais: '', vinculos: '', defeitos: '' },
        equipamento: { armadura: null, escudo: false },
        armas: [],                 // ver ataqueComArma
        itens: [],                 // o resto do pacote inicial, em texto
        efeitos: {},               // fúria, arma sagrada: o que está ligado agora
        hp: 1, hp_max: 1, hp_temp: 0, ca: 10,
        recursos_usados: {}, espacos_usados: {}, dados_vida_usados: 0,
        inspiracao: false,
        nivel_liberado: null,      // o mestre liberou a subida para este nível
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Fontes ───────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function fontes(stats) {
    const raca = D.RACAS[stats.raca] || null
    const subraca = raca && raca.subracas ? raca.subracas[stats.subraca] || null : null
    const classe = CLASSES[stats.classe] || null
    const subclasse = classe && classe.subclasses ? classe.subclasses[stats.subclasse] || null : null
    const antecedente = D.ANTECEDENTES[stats.antecedente] || null
    return { raca, subraca, classe, subclasse, antecedente }
}

/** Características de classe e subclasse que o personagem tem, nível a nível. */
function caracteristicasPorNivel(stats, ateNivel) {
    const { classe, subclasse } = fontes(stats)
    const lista = []
    if (!classe) return lista
    for (let n = 1; n <= ateNivel; n++) {
        ;(classe.niveis[n] || []).forEach(f => lista.push({ ...f, nivel: n, origem: classe.nome }))
        if (subclasse && n >= classe.subclasse.nivel) {
            ;(subclasse.niveis[n] || []).forEach(f => lista.push({ ...f, nivel: n, origem: subclasse.nome }))
        }
    }
    return lista
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Vagas de escolha ─────────────────────────────────────────────────────────
// Cada vaga é uma decisão que o jogador precisa tomar. A criação mostra as do
// 1º nível; a subida de nível mostra as do nível novo.
// ══════════════════════════════════════════════════════════════════════════════

function vagasDeEscolha(stats, ateNivel = stats.nivel || 1) {
    const { raca, subraca, classe, antecedente } = fontes(stats)
    const vagas = []
    const add = (key, nivel, origem, e, extra) => vagas.push({ key, nivel, origem, ...e, ...(extra || {}) })

    if (raca) (raca.escolhas || []).forEach(e => add('raca:' + e.id, 1, raca.nome, e))
    if (subraca) (subraca.escolhas || []).forEach(e => add('subraca:' + e.id, 1, subraca.nome, e))
    if (antecedente) (antecedente.escolhas || []).forEach(e => add('antecedente:' + e.id, 1, antecedente.nome, e))

    // Mesma perícia fixa vinda de duas fontes: o livro manda escolher outra
    const repetidas = periciasFixasRepetidas(stats)
    if (repetidas > 0) {
        add('antecedente:substituta', 1, 'Perícia repetida', {
            id: 'substituta', rotulo: `Perícia no lugar da repetida (${repetidas})`, tipo: 'pericia', qtd: repetidas,
        })
    }

    if (classe) {
        add('classe:pericias', 1, classe.nome, { id: 'pericias', rotulo: 'Perícias da classe', tipo: 'pericia', qtd: classe.pericias.qtd, de: classe.pericias.de })
        ;(classe.escolhasIniciais || []).forEach(e => add('classe:' + e.id, 1, classe.nome, e))

        for (let n = 1; n <= ateNivel; n++) {
            if (n === classe.subclasse.nivel) {
                add('subclasse', n, classe.nome, { id: 'subclasse', rotulo: classe.subclasse.rotulo, tipo: 'subclasse', qtd: 1 })
            }
            caracteristicasPorNivel(stats, n).filter(f => f.nivel === n).forEach(f => {
                ;(f.escolhas || []).forEach(e => add(`nv${n}:${e.id}`, n, `${f.origem} · ${f.nome}`, e))
            })
            if (classe.asi.includes(n)) {
                const key = `nv${n}:asi`
                add(key, n, classe.nome, { id: 'asi', rotulo: 'Incremento no Valor de Habilidade ou talento', tipo: 'asi', qtd: 1 })
                // O talento escolhido pode trazer escolhas próprias
                const asi = (stats.escolhas || {})[key]
                const talento = asi && asi.tipo === 'talento' ? talentos()[asi.talento] : null
                if (talento) {
                    const origemT = `Talento · ${talento.nome}`
                    if (talento.aumento && talento.aumento.de) {
                        add(`nv${n}:talento:aumento`, n, origemT, { id: 'aumento', rotulo: '+1 em', tipo: 'atributo', qtd: 1, de: talento.aumento.de })
                    }
                    ;(talento.escolhas || []).forEach(e => add(`nv${n}:talento:${e.id}`, n, origemT, e))
                    // Iniciado em Magia: as magias dependem da classe escolhida
                    const lista = asi.talento === 'iniciado-em-magia' && ((stats.escolhas || {})[`nv${n}:talento:classe`] || [])[0]
                    if (lista) {
                        add(`nv${n}:talento:truques`, n, origemT, { id: 'truques', rotulo: `Truques de ${NOME_DA_LISTA[lista]}`, tipo: 'magia', qtd: 2, lista, nivelMin: 0, nivelMax: 0, atributo: ATRIBUTO_DA_LISTA[lista] })
                        add(`nv${n}:talento:magia`, n, origemT, { id: 'magia', rotulo: `Magia de 1º nível de ${NOME_DA_LISTA[lista]}`, tipo: 'magia', qtd: 1, lista, nivelMin: 1, nivelMax: 1, atributo: ATRIBUTO_DA_LISTA[lista] })
                    }
                }
            }
        }

        // Pacto do Tomo: três truques de qualquer classe no Livro das Sombras
        if (ateNivel >= 3 && stats.classe === 'bruxo' && ((stats.escolhas || {})['nv3:pacto'] || [])[0] === 'tomo') {
            add('nv3:tomo', 3, 'Bruxo · Pacto do Tomo', { id: 'tomo', rotulo: 'Truques do Livro das Sombras', tipo: 'magia', qtd: 3, lista: 'todas', nivelMin: 0, nivelMax: 0 })
        }

        // Truques e magias da classe: uma lista só, que cresce com o nível.
        // `pool` avisa a subida de nível que estas vagas valem em todo nível.
        const totais = totaisDeMagia(stats, ateNivel)
        if (totais) {
            const origemM = `${classe.nome} · Conjuração`
            if (totais.truques) {
                add('magias:truques', totais.inicio, origemM, { id: 'truques', rotulo: 'Truques', tipo: 'magia', qtd: totais.truques, lista: totais.lista, nivelMin: 0, nivelMax: 0, pool: true })
            }
            if (totais.magias) {
                add('magias:conhecidas', totais.inicio, origemM, {
                    id: 'conhecidas', rotulo: 'Magias', tipo: 'magia', qtd: totais.magias, lista: totais.lista,
                    nivelMin: 1, nivelMax: totais.nivelMax, pool: true,
                    escolas: totais.escolas, livres: totais.livres, expandida: totais.expandida,
                })
            }
        }
    }
    return vagas
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Magias ───────────────────────────────────────────────────────────────────
// A mesa não usa preparação: todo conjurador escolhe uma lista fixa e troca
// uma magia a cada nível. A quantidade vem da tabela da classe ou, para
// clérigo, druida, mago e paladino, de atributo + nível (o que o livro dá
// para preparar).
// ══════════════════════════════════════════════════════════════════════════════

function conjuracaoNoNivel(stats, nivel) {
    const { classe, subclasse } = fontes(stats)
    const conj = (subclasse && subclasse.conjuracao) || (classe && classe.conjuracao)
    if (!conj || nivel < (conj.inicio || 1)) return null
    return conj
}

function totaisDeMagia(stats, nivel = stats.nivel || 1) {
    const { subclasse } = fontes(stats)
    const conj = conjuracaoNoNivel(stats, nivel)
    if (!conj) return null
    const m = mod(atributosFinais({ ...stats, nivel })[conj.atributo])

    let truques = conj.truques ? conj.truques[nivel - 1] : 0
    if (subclasse && subclasse.truquesExtras) truques += subclasse.truquesExtras

    let magias = conj.conhecidas ? conj.conhecidas[nivel - 1]
        : conj.porAtributo === 'nivel' ? Math.max(1, m + nivel)
            : conj.porAtributo === 'meio' ? Math.max(1, m + Math.floor(nivel / 2)) : 0
    // Segredos Mágicos do bardo saem do mesmo total
    caracteristicasPorNivel(stats, nivel).forEach(f => (f.escolhas || []).forEach(e => { if (e.contaNoTotal) magias -= e.qtd }))

    const { espacos, pacto } = espacosDeMagia(conj, nivel)
    return {
        inicio: conj.inicio || 1,
        atributo: conj.atributo,
        lista: conj.lista || stats.classe,
        truques,
        magias: Math.max(0, magias),
        nivelMax: pacto ? pacto.nivel : espacos.length,
        escolas: conj.escolas || null,
        livres: conj.livresEm ? conj.livresEm.filter(n => n <= nivel).length : null,
        // Patrono do bruxo: amplia a lista com as magias dele
        expandida: stats.classe === 'bruxo' && stats.subclasse ? Object.values(LISTAS['bruxo:' + stats.subclasse] || {}).flat() : null,
    }
}

/** Magias que o personagem conhece sem escolher: raça, subclasse, pacto. */
function magiasSempre(stats) {
    const nivel = stats.nivel || 1
    const esc = stats.escolhas || {}
    const { raca, subraca, classe, subclasse } = fontes(stats)
    const out = []
    ;[...((raca && raca.magias) || []), ...((subraca && subraca.magias) || [])].forEach(m => {
        if (nivel >= m.nivel) out.push({ id: m.id, origem: (subraca || raca).nome, atributo: m.atributo, usos: m.usos })
    })
    if (subclasse && classe && nivel >= classe.subclasse.nivel) {
        ;(subclasse.truquesFixos || []).forEach(id => out.push({ id, origem: subclasse.nome }))
        let chave = null
        if (stats.classe === 'clerigo' || stats.classe === 'paladino') chave = `${stats.classe}:${stats.subclasse}`
        if (stats.classe === 'druida' && stats.subclasse === 'terra') chave = `druida:terra:${(esc['nv2:terreno'] || [])[0]}`
        if (stats.classe === 'patrulheiro' && stats.subclasse === 'rastreador') chave = 'patrulheiro:rastreador'
        const tab = chave && LISTAS[chave]
        if (tab) Object.entries(tab).forEach(([n, ids]) => { if (nivel >= +n) ids.forEach(id => out.push({ id, origem: subclasse.nome })) })
    }
    if (stats.classe === 'bruxo' && nivel >= 3 && (esc['nv3:pacto'] || [])[0] === 'corrente') {
        out.push({ id: 'convocar-familiar', origem: 'Pacto da Corrente' })
    }
    return out
}

/** Ids de tudo que o personagem já conhece, menos a vaga `ignorar`. */
function magiasConhecidasIds(stats, ignorar) {
    const ids = new Set(magiasSempre(stats).map(m => m.id))
    vagasDeEscolha(stats).forEach(v => {
        if (v.tipo === 'magia' && v.key !== ignorar) ((stats.escolhas || {})[v.key] || []).forEach(id => ids.add(id))
    })
    return ids
}

/**
 * Todas as magias do personagem, com origem e atributo de conjuração. É o
 * que a ficha mostra.
 */
function magiasDoPersonagem(stats) {
    const conj = conjuracaoAtiva(stats)
    const atrClasse = conj ? conj.atributo : null
    const vistos = new Set()
    const lista = []
    const incluir = (id, extra) => {
        const m = C.magia(id)
        if (!m || vistos.has(id)) return
        vistos.add(id)
        lista.push({ ...m, ...extra })
    }
    // Como cada magia é conjurada fora da regra comum dos espaços:
    //   semEspaco + recurso: 1 vez por descanso longo, sem espaço (raça, Arcana, Iniciado)
    //   semEspaco sem recurso: à vontade (invocações)
    //   recurso com espaço: 1 vez por descanso longo GASTANDO espaço de pacto (invocações)
    //   nivelFixo: conjurada sempre nesse nível
    magiasSempre(stats).forEach(x => incluir(x.id, {
        origem: x.origem, atributo: x.atributo || atrClasse, sempre: true, usos: x.usos,
        ...(x.usos ? { semEspaco: true, recurso: 'racial:' + x.id, rotuloUso: 'raça', nivelFixo: /2º nível/.test(x.usos) ? 2 : undefined } : {}),
    }))
    vagasDeEscolha(stats).filter(v => v.tipo === 'magia').forEach(v => {
        const atributo = v.atributo || (v.lista && v.lista !== 'todas' && v.key.includes(':talento:') ? ATRIBUTO_DA_LISTA[v.lista] : null) || atrClasse || 'car'
        let uso = {}
        if (/:arcana$/.test(v.key)) uso = { usos: '1 vez por descanso longo, sem espaço', semEspaco: true, recurso: 'arcana:' }
        if (/:talento:magia$/.test(v.key)) uso = { usos: '1 vez por descanso longo, no 1º nível', semEspaco: true, recurso: 'iniciado:', nivelFixo: 1 }
        ;((stats.escolhas || {})[v.key] || []).forEach(id => incluir(id, {
            origem: v.origem, atributo,
            ...(uso.recurso ? { ...uso, recurso: uso.recurso + id, rotuloUso: uso.recurso === 'arcana:' ? 'Arcana Mística' : 'Iniciado em Magia' } : {}),
        }))
    })
    // Invocações místicas que dão magia
    if (stats.classe === 'bruxo') {
        escolhidos(stats, 'invocacoes').forEach(inv => {
            const dado = MAGIAS_DE_INVOCACAO[inv]
            if (!dado) return
            const nomeInv = (D.OPCOES.invocacoes.find(o => o.id === inv) || {}).nome || inv
            incluir(dado.id, dado.vontade
                ? { origem: `Invocação · ${nomeInv}`, atributo: 'car', sempre: true, usos: 'à vontade', semEspaco: true, nivelFixo: dado.nivelFixo }
                : { origem: `Invocação · ${nomeInv}`, atributo: 'car', sempre: true, usos: '1 vez por descanso longo, com espaço de pacto', recurso: 'invocacao:' + inv, rotuloUso: nomeInv })
        })
    }
    return lista.sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, 'pt'))
}

function periciasFixasRepetidas(stats) {
    const { raca, subraca, antecedente } = fontes(stats)
    const vistas = new Set()
    let repetidas = 0
    ;[raca, subraca, antecedente].forEach(f => {
        ;((f && f.concede && f.concede.pericias) || []).forEach(p => {
            if (vistas.has(p)) repetidas++
            vistas.add(p)
        })
    })
    return repetidas
}

function valorDaVaga(stats, vaga) {
    if (vaga.tipo === 'subclasse') return stats.subclasse ? [stats.subclasse] : []
    const v = (stats.escolhas || {})[vaga.key]
    if (vaga.tipo === 'asi') return v || null
    return Array.isArray(v) ? v : []
}

function vagaCompleta(stats, vaga) {
    const v = valorDaVaga(stats, vaga)
    if (vaga.tipo === 'asi') {
        if (!v) return false
        if (v.tipo === 'talento') return !!talentos()[v.talento]
        const soma = Object.values(v.valores || {}).reduce((a, b) => a + b, 0)
        return soma === 2
    }
    return v.length >= vaga.qtd
}

/** Vagas ainda sem resposta. */
function pendencias(stats, ateNivel) {
    return vagasDeEscolha(stats, ateNivel).filter(v => !vagaCompleta(stats, v))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Atributos ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Valores finais. `ignorar` deixa de fora uma vaga (para saber o valor ANTES
 * daquela escolha, como no pré-requisito de um talento).
 */
function atributosFinais(stats, ignorar) {
    const { raca, subraca, classe } = fontes(stats)
    const base = stats.atributos_base || {}
    const v = {}
    D.TODOS_ATRIBUTOS.forEach(k => { v[k] = base[k] ?? 8 })
    const somar = obj => Object.entries(obj || {}).forEach(([k, n]) => { v[k] += n })

    somar(raca && raca.concede && raca.concede.atributos)
    somar(subraca && subraca.concede && subraca.concede.atributos)

    const esc = stats.escolhas || {}
    if (ignorar !== 'raca:atributos') (esc['raca:atributos'] || []).forEach(k => { v[k] += 1 })

    // Incrementos e talentos, na ordem dos níveis. O livro não deixa passar
    // de 20 por essas fontes.
    if (classe) {
        classe.asi.filter(n => n <= (stats.nivel || 1)).forEach(n => {
            const key = `nv${n}:asi`
            if (key === ignorar) return
            const asi = esc[key]
            if (!asi) return
            if (asi.tipo === 'atributos') {
                Object.entries(asi.valores || {}).forEach(([k, q]) => { v[k] = Math.min(20, v[k] + q) })
            } else if (asi.tipo === 'talento') {
                const t = talentos()[asi.talento]
                if (!t || !t.aumento || `nv${n}:talento:aumento` === ignorar) return
                const alvo = t.aumento.fixo || (esc[`nv${n}:talento:aumento`] || [])[0]
                if (alvo) v[alvo] = Math.min(20, v[alvo] + 1)
            }
        })
    }

    // Campeão Primitivo: +4 em FOR e CON, com teto de 24
    if (stats.classe === 'barbaro' && (stats.nivel || 1) >= 20) {
        v.for = Math.min(24, v.for + 4)
        v.con = Math.min(24, v.con + 4)
    }
    return v
}

function custoCompra(base) {
    return D.TODOS_ATRIBUTOS.reduce((t, k) => t + (CUSTO_COMPRA[base[k]] ?? 99), 0)
}

function rolar4d6() {
    const dados = [1, 2, 3, 4].map(() => 1 + Math.floor(Math.random() * 6))
    const menor = Math.min(...dados)
    const soma = dados.reduce((a, b) => a + b, 0) - menor
    return { dados, soma }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Proficiências ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Tudo em que o personagem é proficiente. `ignorar` deixa uma vaga de fora. */
function proficiencias(stats, ignorar) {
    const { raca, subraca, classe, subclasse, antecedente } = fontes(stats)
    const nivel = stats.nivel || 1
    const p = {
        pericias: new Set(), especialidades: new Set(), ferramentas: new Set(), idiomas: new Set(),
        armaduras: new Set(), categoriasArma: new Set(), armas: new Set(), resistencias: new Set(),
    }
    const conceder = c => {
        if (!c) return
        ;(c.pericias || []).forEach(x => p.pericias.add(x))
        ;(c.ferramentas || []).forEach(x => p.ferramentas.add(x))
        ;(c.idiomas || []).forEach(x => p.idiomas.add(x))
        ;(c.armaduras || []).forEach(x => p.armaduras.add(x))
        ;(c.armas || []).forEach(x => p.armas.add(x))
        ;(c.categoriasArma || []).forEach(x => p.categoriasArma.add(x))
        ;(c.resistencias || []).forEach(x => p.resistencias.add(x))
    }

    conceder(raca && raca.concede)
    conceder(subraca && subraca.concede)
    conceder(antecedente && antecedente.concede)
    if (classe) {
        classe.resistencias.forEach(x => p.resistencias.add(x))
        classe.armaduras.forEach(x => p.armaduras.add(x))
        ;((classe.armas && classe.armas.categorias) || []).forEach(x => p.categoriasArma.add(x))
        ;((classe.armas && classe.armas.lista) || []).forEach(x => p.armas.add(x))
        ;(classe.ferramentas || []).forEach(x => p.ferramentas.add(x))
        ;(classe.idiomas || []).forEach(x => p.idiomas.add(x))
        caracteristicasPorNivel(stats, nivel).forEach(f => conceder(f.concede))
        if (nivel >= 14 && stats.classe === 'monge') D.TODOS_ATRIBUTOS.forEach(x => p.resistencias.add(x))
    }

    // As respostas de cada vaga
    const esc = stats.escolhas || {}
    vagasDeEscolha(stats, nivel).forEach(vaga => {
        if (vaga.key === ignorar) return
        const valores = vaga.tipo === 'asi' || vaga.tipo === 'subclasse' ? [] : (esc[vaga.key] || [])
        switch (vaga.tipo) {
            case 'pericia':
                valores.forEach(x => { p.pericias.add(x); if (vaga.especializa) p.especialidades.add(x) })
                break
            case 'idioma': valores.forEach(x => p.idiomas.add(x)); break
            case 'ferramenta': valores.forEach(x => p.ferramentas.add(x)); break
            case 'arma': valores.forEach(x => p.armas.add(x)); break
            case 'especializacao': valores.forEach(x => p.especialidades.add(x)); break
            case 'pericia-ou-ferramenta':
                valores.forEach(x => (D.PERICIA_POR_KEY[x] ? p.pericias : p.ferramentas).add(x))
                break
            case 'opcao':
                if (vaga.fonte === 'invocacoes') {
                    valores.forEach(id => {
                        const inv = D.OPCOES.invocacoes.find(o => o.id === id)
                        conceder(inv && inv.concede)
                    })
                }
                break
        }
    })

    // Talentos: o que eles concedem e o Resiliente
    talentosEscolhidos(stats).forEach(({ talento, nivel: n }) => {
        conceder(talento.concede)
        if (talento.resistenciaDoAumento) {
            const alvo = (esc[`nv${n}:talento:aumento`] || [])[0]
            if (alvo) p.resistencias.add(alvo)
        }
    })
    return p
}

function talentosEscolhidos(stats) {
    const { classe } = fontes(stats)
    if (!classe) return []
    const esc = stats.escolhas || {}
    return classe.asi
        .filter(n => n <= (stats.nivel || 1))
        .map(n => ({ n, asi: esc[`nv${n}:asi`] }))
        .filter(x => x.asi && x.asi.tipo === 'talento' && talentos()[x.asi.talento])
        .map(x => ({ id: x.asi.talento, talento: talentos()[x.asi.talento], nivel: x.n }))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Opções de cada vaga ──────────────────────────────────────────────────────
// Devolve [{ id, nome, desc?, bloqueado?, motivo? }]. Opção bloqueada aparece
// apagada com o motivo, em vez de sumir: o jogador entende por que não pode.
// ══════════════════════════════════════════════════════════════════════════════

// As proficiências e atributos são calculados SEM a própria vaga: assim o que
// ela já marcou não aparece como "já é proficiente", e o que vem repetido de
// outra fonte aparece.
function opcoesDaVaga(stats, vaga) {
    const prof = proficiencias(stats, vaga.key)
    const nivelClasse = stats.nivel || 1

    switch (vaga.tipo) {
        case 'pericia': {
            const lista = vaga.de || D.TODAS_PERICIAS
            return lista.map(k => {
                // Perícia que já vem com especialização (Domínio do Conhecimento)
                // vale mesmo se o personagem já for proficiente: ganha o dobro
                const ja = !vaga.especializa && prof.pericias.has(k)
                return { id: k, nome: D.PERICIA_POR_KEY[k].nome, desc: D.ATRIBUTO_POR_KEY[D.PERICIA_POR_KEY[k].attr].abrev, bloqueado: ja, motivo: ja ? 'já é proficiente' : '' }
            })
        }
        case 'especializacao': {
            const lista = [...prof.pericias].filter(k => D.PERICIA_POR_KEY[k])
                .map(k => ({ id: k, nome: D.PERICIA_POR_KEY[k].nome }))
            if (vaga.ferramentaLadrao && prof.ferramentas.has('Ferramentas de ladrão')) lista.push({ id: 'Ferramentas de ladrão', nome: 'Ferramentas de ladrão' })
            return lista.map(o => {
                const ja = prof.especialidades.has(o.id)
                return { ...o, bloqueado: ja, motivo: ja ? 'já tem especialização' : '' }
            })
        }
        case 'idioma':
            return D.TODOS_IDIOMAS.map(nome => {
                const ja = prof.idiomas.has(nome)
                return { id: nome, nome, desc: D.IDIOMAS.exoticos.includes(nome) ? 'exótico' : '', bloqueado: ja, motivo: ja ? 'já conhece' : '' }
            })
        case 'ferramenta':
            return (vaga.de || D.TODAS_FERRAMENTAS).map(nome => {
                const ja = prof.ferramentas.has(nome)
                return { id: nome, nome, bloqueado: ja, motivo: ja ? 'já é proficiente' : '' }
            })
        case 'pericia-ou-ferramenta': {
            const pericias = D.PERICIAS.map(p => {
                const ja = prof.pericias.has(p.key)
                return { id: p.key, nome: p.nome, desc: 'perícia', bloqueado: ja, motivo: ja ? 'já é proficiente' : '' }
            })
            const ferramentas = D.TODAS_FERRAMENTAS.map(nome => {
                const ja = prof.ferramentas.has(nome)
                return { id: nome, nome, desc: 'ferramenta', bloqueado: ja, motivo: ja ? 'já é proficiente' : '' }
            })
            return [...pericias, ...ferramentas]
        }
        case 'arma':
            return Object.entries(D.ARMAS).map(([id, a]) => {
                const ja = (prof.categoriasArma.has(a.cat) || prof.armas.has(id))
                return { id, nome: a.nome, desc: D.CATEGORIAS_ARMA[a.cat], bloqueado: ja, motivo: ja ? 'já é proficiente' : '' }
            })
        case 'atributo': {
            const lista = vaga.de || D.TODOS_ATRIBUTOS
            const attrs = atributosFinais(stats, vaga.key)
            return lista.map(k => {
                const teto = attrs[k] >= 20
                return { id: k, nome: D.ATRIBUTO_POR_KEY[k].nome, desc: `${attrs[k]}`, bloqueado: teto, motivo: teto ? 'já está em 20' : '' }
            })
        }
        case 'opcao': {
            let lista = D.OPCOES[vaga.fonte] || []
            if (vaga.filtro) lista = lista.filter(o => vaga.filtro.includes(o.id))
            // Não repete o que já foi escolhido em outra vaga da mesma tabela
            const usados = new Set()
            vagasDeEscolha(stats).forEach(v => {
                if (v.key !== vaga.key && v.tipo === 'opcao' && v.fonte === vaga.fonte) {
                    ;((stats.escolhas || {})[v.key] || []).forEach(id => usados.add(id))
                }
            })
            const pacto = ((stats.escolhas || {})['nv3:pacto'] || [])[0]
            return lista.map(o => {
                let motivo = ''
                if (usados.has(o.id)) motivo = 'já escolhida'
                else if (o.req && o.req.nivel && nivelClasse < o.req.nivel) motivo = `a partir do ${o.req.nivel}º nível`
                else if (o.req && o.req.pacto && pacto !== o.req.pacto) motivo = `exige ${D.OPCOES.pactos.find(p => p.id === o.req.pacto).nome}`
                return { ...o, desc: o.desc ? o.desc + (o.reqTexto ? ` (exige ${o.reqTexto})` : '') : '', bloqueado: !!motivo, motivo }
            })
        }
        case 'subclasse': {
            const { classe } = fontes(stats)
            if (!classe) return []
            return Object.entries(classe.subclasses).map(([id, s]) => ({ id, nome: s.nome, desc: s.resumo }))
        }
        case 'asi':
            return talentosDisponiveis(stats, vaga.key)
        case 'magia': {
            const conhecidas = magiasConhecidasIds(stats, vaga.key)
            const atual = new Set(valorDaVaga(stats, vaga))
            let lista = C.todasMagias()
            if (vaga.lista && vaga.lista !== 'todas') {
                const extra = new Set(vaga.expandida || [])
                lista = lista.filter(m => m.classes.includes(vaga.lista) || extra.has(m.id))
            }
            const min = vaga.nivelMin ?? 0
            const max = vaga.nivelMax ?? 9
            lista = lista.filter(m => m.nivel >= min && m.nivel <= max)
            // Cavaleiro Arcano e Trapaceiro Arcano: fora das duas escolas da
            // subclasse só cabem as magias "livres" dos níveis 3, 8, 14 e 20
            const fora = vaga.escolas ? [...atual].filter(id => { const m = C.magia(id); return m && !vaga.escolas.includes(m.escola) }).length : 0
            return lista.map(m => {
                let motivo = ''
                if (conhecidas.has(m.id)) motivo = 'já conhece'
                else if (vaga.escolas && !vaga.escolas.includes(m.escola) && !atual.has(m.id) && fora >= (vaga.livres || 0)) {
                    motivo = `só ${vaga.escolas.join(' ou ')} (${vaga.livres || 0} livre${vaga.livres === 1 ? '' : 's'} já usada${vaga.livres === 1 ? '' : 's'})`
                }
                return { id: m.id, nome: m.nome, desc: m.resumo, magia: m, bloqueado: !!motivo, motivo }
            })
        }
    }
    return []
}

function talentosDisponiveis(stats, keyDaVaga) {
    const attrs = atributosFinais(stats, keyDaVaga)
    const prof = proficiencias(stats, keyDaVaga)
    const ja = new Set(talentosEscolhidos(stats).filter(t => `nv${t.nivel}:asi` !== keyDaVaga).map(t => t.id))
    const conjura = ehConjurador(stats)
    return Object.entries(talentos()).map(([id, t]) => {
        let motivo = ''
        const r = t.req || {}
        if (ja.has(id)) motivo = 'já escolhido'
        else if (r.atributo) {
            const pares = Object.entries(r.atributo).filter(([k]) => k !== 'qualquer')
            const ok = r.atributo.qualquer ? pares.some(([k, n]) => attrs[k] >= n) : pares.every(([k, n]) => attrs[k] >= n)
            if (!ok) motivo = 'exige ' + pares.map(([k, n]) => `${D.ATRIBUTO_POR_KEY[k].abrev} ${n}`).join(r.atributo.qualquer ? ' ou ' : ' e ')
        } else if (r.armadura && !prof.armaduras.has(r.armadura)) motivo = `exige proficiência em ${D.TIPOS_ARMADURA[r.armadura].toLowerCase()}`
        else if (r.conjurador && !conjura) motivo = 'exige conjurar ao menos uma magia'
        return { id, nome: t.nome, desc: t.desc, bloqueado: !!motivo, motivo }
    })
}

function ehConjurador(stats) {
    const { raca, subraca } = fontes(stats)
    if (conjuracaoAtiva(stats)) return true
    return !!((raca && raca.magias) || (subraca && subraca.magias))
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Conjuração ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function conjuracaoAtiva(stats) {
    return conjuracaoNoNivel(stats, stats.nivel || 1)
}

function espacosDeMagia(conj, nivel) {
    if (!conj) return { espacos: [], pacto: null }
    if (conj.tipo === 'pacto') {
        return {
            espacos: [],
            pacto: {
                qtd: porNivel([[1, 1], [2, 2], [11, 3], [17, 4]], nivel),
                nivel: porNivel([[1, 1], [3, 2], [5, 3], [7, 4], [9, 5]], nivel),
            },
        }
    }
    const efetivo = conj.tipo === 'completo' ? nivel
        : conj.tipo === 'meio' ? (nivel >= 2 ? Math.ceil(nivel / 2) : 0)
            : conj.tipo === 'terco' ? (nivel >= 3 ? Math.ceil(nivel / 3) : 0) : 0
    return { espacos: efetivo > 0 ? ESPACOS_COMPLETO[efetivo - 1] : [], pacto: null }
}

/**
 * Espaços de magia livres a partir de um nível: [{ id: '3' | 'pacto', nivel, livres }].
 * Conta os criados com pontos de feitiçaria (stats.espacos_extras), que
 * somem no descanso longo.
 */
function espacosLivres(stats, f, minimo = 1) {
    const cj = f.conjuracao
    if (!cj) return []
    const usados = stats.espacos_usados || {}
    const extras = stats.espacos_extras || {}
    const out = []
    cj.espacos.forEach((qtd, i) => {
        const n = i + 1
        const livres = qtd + (extras[n] || 0) - (usados[n] || 0)
        if (n >= minimo && livres > 0) out.push({ id: String(n), nivel: n, livres })
    })
    if (cj.pacto && cj.pacto.nivel >= minimo) {
        const livres = cj.pacto.qtd - (usados.pacto || 0)
        if (livres > 0) out.push({ id: 'pacto', nivel: cj.pacto.nivel, livres })
    }
    return out
}

function resumoConjuracao(stats, mods, prof) {
    const conj = conjuracaoAtiva(stats)
    if (!conj) return null
    const nivel = stats.nivel || 1
    const m = mods[conj.atributo]
    const { espacos, pacto } = espacosDeMagia(conj, nivel)
    const totais = totaisDeMagia(stats, nivel)
    const r = {
        atributo: conj.atributo,
        cd: 8 + prof + m,
        ataque: prof + m,
        truques: totais.truques,
        magias: totais.magias,
        ritual: !!conj.ritual,
        espacos, pacto,
        arcana: stats.classe === 'bruxo'
            ? [[11, 6], [13, 7], [15, 8], [17, 9]].filter(([n]) => nivel >= n).map(([, c]) => c) : [],
    }
    return r
}

// ══════════════════════════════════════════════════════════════════════════════
// ── A FICHA CALCULADA ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function calcular(stats) {
    const { raca, subraca, classe, subclasse, antecedente } = fontes(stats)
    const nivel = Math.min(NIVEL_MAX, Math.max(1, stats.nivel || 1))
    const prof = proficiencia(nivel)
    const esc = stats.escolhas || {}

    // ── Atributos e modificadores ─────────────────────────────────────────────
    const atributos = atributosFinais(stats)
    const mods = {}
    D.TODOS_ATRIBUTOS.forEach(k => { mods[k] = mod(atributos[k]) })
    // Forma Selvagem: FOR, DES e CON passam a ser os da besta (os PV máximos
    // do druida continuam com a CON dele)
    const conPropria = mods.con
    const forma = stats.forma ? CR.criatura(stats.forma.id) : null
    if (forma) ['for', 'des', 'con'].forEach(k => { atributos[k] = forma.atributos[k]; mods[k] = mod(forma.atributos[k]) })

    const p = proficiencias(stats)
    const talentos = talentosEscolhidos(stats)
    const temTalento = id => talentos.some(t => t.id === id)

    // Efeitos que outros puseram nele (Bênção, Escudo da Fé, Ajuda, auras...): dndEfeitos.js
    const recebidos = (stats.efeitos_recebidos || []).filter(e => D.EFEITOS[e.tipo])
    const doTipo = id => recebidos.filter(e => e.tipo === id)

    // ── Testes de resistência ─────────────────────────────────────────────────
    // Aura de Proteção do paladino vale para o próprio paladino também; a de
    // outro paladino não soma com a dele: vale a maior
    const auraPropria = classe && classe.auraProtecao && nivel >= classe.auraProtecao ? Math.max(1, mods.car) : 0
    const aura = Math.max(auraPropria, ...doTipo('aura-protecao').map(e => e.valor || 0))
    const resistencias = {}
    D.TODOS_ATRIBUTOS.forEach(k => {
        const profi = p.resistencias.has(k)
        resistencias[k] = { prof: profi, bonus: mods[k] + (profi ? prof : 0) + aura }
    })

    // ── Perícias ──────────────────────────────────────────────────────────────
    const versatil = classe && classe.jackOfAllTrades && nivel >= classe.jackOfAllTrades
    const atletaExtra = stats.classe === 'guerreiro' && stats.subclasse === 'campeao' && nivel >= 7
    const pericias = {}
    D.PERICIAS.forEach(per => {
        const profi = p.pericias.has(per.key)
        const espec = profi && p.especialidades.has(per.key)
        let bonus = mods[per.attr]
        let extra = ''
        if (espec) bonus += 2 * prof
        else if (profi) bonus += prof
        else if (atletaExtra && ['for', 'des', 'con'].includes(per.attr)) { bonus += Math.ceil(prof / 2); extra = 'meia' }
        else if (versatil) { bonus += Math.floor(prof / 2); extra = 'meia' }
        pericias[per.key] = { prof: profi, especialista: espec, meia: extra === 'meia', bonus }
    })

    const passivaExtra = temTalento('observador') ? 5 : 0
    const percepcaoPassiva = 10 + pericias.percepcao.bonus + passivaExtra
    const investigacaoPassiva = 10 + pericias.investigacao.bonus + passivaExtra

    // ── Iniciativa ────────────────────────────────────────────────────────────
    let iniciativa = mods.des
    if (atletaExtra) iniciativa += Math.ceil(prof / 2)
    else if (versatil) iniciativa += Math.floor(prof / 2)
    if (temTalento('alerta')) iniciativa += 5
    const vantagemIniciativa = (stats.classe === 'barbaro' && nivel >= 7) || stats.classe === 'patrulheiro'

    // ── CA ────────────────────────────────────────────────────────────────────
    const eq = stats.equipamento || {}
    const vestida = armaduraVestida(stats)
    const armadura = vestida ? { ...D.ARMADURAS[vestida.base], nome: vestida.nome || D.ARMADURAS[vestida.base].nome } : null
    const escudoItem = escudoEmpunhado(stats)
    const escudo = !!escudoItem
    let ca, caDetalhe
    if (armadura) {
        let teto = armadura.maxDes
        if (armadura.tipo === 'media' && temTalento('maestria-armadura-media')) teto = 3
        // Armadura pesada ignora a Destreza, inclusive a negativa
        const des = teto === 0 ? 0 : teto == null ? mods.des : Math.min(mods.des, teto)
        ca = armadura.ca + des + (vestida.bonus || 0)
        caDetalhe = `${armadura.nome} ${armadura.ca + (vestida.bonus || 0)}` + (teto === 0 ? '' : ` ${sinal(des)} DES`)
    } else {
        const opcoes = [{ ca: 10 + mods.des, txt: `10 ${sinal(mods.des)} DES` }]
        if (classe && classe.defesaSemArmadura === 'con') opcoes.push({ ca: 10 + mods.des + mods.con, txt: `10 ${sinal(mods.des)} DES ${sinal(mods.con)} CON` })
        if (classe && classe.defesaSemArmadura === 'sab' && !escudo) opcoes.push({ ca: 10 + mods.des + mods.sab, txt: `10 ${sinal(mods.des)} DES ${sinal(mods.sab)} SAB` })
        if (subclasse && subclasse.caSemArmadura) opcoes.push({ ca: subclasse.caSemArmadura + mods.des, txt: `${subclasse.caSemArmadura} ${sinal(mods.des)} DES` })
        const melhor = opcoes.reduce((a, b) => (b.ca > a.ca ? b : a))
        ca = melhor.ca
        caDetalhe = 'Sem armadura: ' + melhor.txt
    }
    if (escudo) { const b = 2 + (escudoItem.bonus || 0); ca += b; caDetalhe += ` + escudo ${b}` }
    const estilos = estilosDeLuta(stats)
    if (armadura && estilos.includes('defesa')) { ca += 1; caDetalhe += ' + Defesa 1' }
    // Ambidestro: +1 com uma arma corpo-a-corpo em cada mão (o jogador marca nas armas)
    if (temTalento('ambidestro') && (stats.efeitos || {})['duas-armas']) { ca += 1; caDetalhe += ' + Ambidestro 1' }
    if (forma) { ca = forma.ca; caDetalhe = `${forma.nome} (Forma Selvagem)` }
    // Escudo da Fé, Velocidade: a mesma magia duas vezes não soma
    ;['escudo-da-fe', 'velocidade'].forEach(id => {
        if (doTipo(id).length && D.EFEITOS[id].ca) { ca += D.EFEITOS[id].ca; caDetalhe += ` + ${D.EFEITOS[id].nome} ${D.EFEITOS[id].ca}` }
    })
    const semProfArmadura = (armadura && !p.armaduras.has(armadura.tipo)) || (escudo && !p.armaduras.has('escudo'))

    // ── Deslocamento ──────────────────────────────────────────────────────────
    let deslocamento = (subraca && subraca.deslocamento) || (raca && raca.deslocamento) || 9
    if (temTalento('mobilidade')) deslocamento += 3
    if (stats.classe === 'barbaro' && nivel >= 5 && !(armadura && armadura.tipo === 'pesada')) deslocamento += 3
    if (stats.classe === 'monge' && !armadura && !escudo) deslocamento += porNivel([[1, 0], ...MOVIMENTO_MONGE], nivel)
    if (armadura && armadura.forca && atributos.for < armadura.forca && !(raca && raca.pesadaSemPenalidade)) deslocamento -= 3
    if (forma) deslocamento = CR.deslocamentoBase(forma.deslocamento)
    if (doTipo('velocidade').length) deslocamento *= D.EFEITOS.velocidade.desloc
    const exaustao = Math.max(0, Math.min(6, stats.exaustao || 0))
    if (exaustao >= 2) deslocamento = deslocamento / 2
    const parado = exaustao >= 5 || (stats.condicoes || []).some(c => D.CONDICOES[c] && D.CONDICOES[c].efeitos.parado)
    if (parado) deslocamento = 0

    // ── PV ────────────────────────────────────────────────────────────────────
    const dv = classe ? classe.dadoVida : 8
    const media = dv / 2 + 1
    let pvMax = Math.max(1, dv + conPropria)
    for (let n = 2; n <= nivel; n++) pvMax += Math.max(1, media + conPropria)
    const pvPorNivel = ((subraca && subraca.concede && subraca.concede.pvPorNivel) || 0)
        + ((subclasse && subclasse.pvPorNivel) || 0)
        + (temTalento('robusto') ? 2 : 0)
    pvMax += pvPorNivel * nivel
    if (exaustao >= 4) pvMax = Math.max(1, Math.floor(pvMax / 2))
    // Ajuda: a maior delas (a mesma magia não soma)
    const ajuda = Math.max(0, ...doTipo('ajuda').map(e => D.EFEITOS.ajuda.pv(e.nivel || 2)))
    pvMax += ajuda

    // ── Sentidos e resistências a dano ────────────────────────────────────────
    const visao = Math.max(
        (raca && raca.concede && raca.concede.visaoEscuro) || 0,
        (subraca && subraca.concede && subraca.concede.visaoEscuro) || 0,
        (subclasse && subclasse.visaoEscuro && nivel >= 3) ? subclasse.visaoEscuro : 0,
    )
    const resistenciasDano = new Set([
        ...((raca && raca.concede && raca.concede.resistenciasDano) || []),
        ...((subraca && subraca.concede && subraca.concede.resistenciasDano) || []),
    ])
    const ancestral = (esc['raca:ancestral'] || [])[0]
    if (ancestral) {
        const a = D.OPCOES['ancestrais-draconicos'].find(o => o.id === ancestral)
        if (a) resistenciasDano.add(a.dano)
    }
    // Na Forma Selvagem valem também as defesas da criatura (os elementais têm várias)
    const imunidadesDano = new Set()
    const vulnerabilidadesDano = new Set()
    if (forma) {
        CR.tiposDoTexto(forma.resistencias).forEach(t => resistenciasDano.add(t))
        CR.tiposDoTexto(forma.imunidades, true).forEach(t => imunidadesDano.add(t))
        CR.tiposDoTexto(forma.vulnerabilidades).forEach(t => vulnerabilidadesDano.add(t))
    }

    // ── Conjuração ────────────────────────────────────────────────────────────
    const conjuracao = resumoConjuracao(stats, mods, prof)
    // Cada magia leva a própria CD e o próprio ataque: uma magia racial ou de
    // talento pode usar um atributo diferente do da classe
    const magias = magiasDoPersonagem(stats).map(m => ({
        ...m, cd: 8 + prof + mods[m.atributo], ataqueBonus: prof + mods[m.atributo],
    }))

    // ── Recursos (usos por descanso) ──────────────────────────────────────────
    const recursos = []
    if (classe && classe.recursos) recursos.push(...classe.recursos(nivel, mods, stats.subclasse))
    if (subclasse && subclasse.recursos) recursos.push(...subclasse.recursos(nivel, mods))
    if (stats.raca === 'draconato') {
        recursos.push({ id: 'sopro', nome: 'Arma de Sopro', max: 1, recarga: 'curto',
            info: `${porNivel([[1, '2d6'], [6, '3d6'], [11, '4d6'], [16, '5d6']], nivel)} · CD ${8 + mods.con + prof}` })
    }
    if (stats.raca === 'meio-orc') recursos.push({ id: 'resistencia-implacavel', nome: 'Resistência Implacável', max: 1, recarga: 'longo' })
    talentos.forEach(t => { if (t.talento.recurso) recursos.push(t.talento.recurso) })
    // Magia de "1 vez por descanso longo" (raça, Arcana Mística, Iniciado em
    // Magia, invocações) vira um uso marcável
    magias.filter(m => m.recurso).forEach(m => {
        recursos.push({ id: m.recurso, nome: `${m.nome} (${m.rotuloUso})`, max: 1, recarga: 'longo' })
    })

    // ── Características, na ordem em que aparecem ─────────────────────────────
    const caracteristicas = []
    if (raca) {
        ;(raca.tracos || []).forEach(t => caracteristicas.push({ ...t, origem: raca.nome }))
        if (subraca) (subraca.tracos || []).forEach(t => caracteristicas.push({ ...t, origem: subraca.nome }))
    }
    if (antecedente) caracteristicas.push({ ...antecedente.caracteristica, origem: antecedente.nome })
    caracteristicasPorNivel(stats, nivel).forEach(f => {
        const escolhidos = (f.escolhas || [])
            .map(e => nomesEscolhidos(stats, `nv${f.nivel}:${e.id}`, e))
            .filter(Boolean)
        caracteristicas.push({ nome: f.nome, desc: f.desc, origem: `${f.origem} · ${f.nivel}º`, escolhidos: escolhidos.join(' · ') })
    })
    talentos.forEach(t => caracteristicas.push({ nome: t.talento.nome, desc: t.talento.desc, origem: `Talento · ${t.nivel}º` }))

    const infoClasse = classe && classe.infoNivel ? classe.infoNivel(nivel) : null

    return {
        nivel, prof, atributos, mods, resistencias, pericias,
        percepcaoPassiva, investigacaoPassiva,
        iniciativa, vantagemIniciativa,
        ca, caDetalhe, semProfArmadura, armadura, escudo,
        deslocamento, pvMax, dadoVida: dv, exaustao,
        forma: forma ? { ...forma, pv: stats.forma.pv, pvMax: forma.pv } : null,
        semConjurar: !!forma && !(stats.classe === 'druida' && nivel >= 18),
        talentos: talentos.map(t => t.id),
        visaoEscuro: visao, resistenciasDano: [...resistenciasDano], imunidadesDano: [...imunidadesDano], vulnerabilidadesDano: [...vulnerabilidadesDano],
        efeitosRecebidos: recebidos, pvAjuda: ajuda,
        proficiencias: {
            armaduras: [...p.armaduras], categoriasArma: [...p.categoriasArma], armas: [...p.armas],
            ferramentas: [...p.ferramentas], idiomas: [...p.idiomas],
        },
        conjuracao, magias, recursos, caracteristicas, infoClasse,
        estilos,
        pendencias: pendencias(stats, nivel),
        titulo: tituloDoPersonagem(stats),
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ATAQUES COM ARMA ─────────────────────────────────────────────────────────
// stats.armas: [{ id, base, qtd?, nome?, bonus?, dano?, tipoDano?, danoExtra?,
// nota?, pacto? }]. `base` é a arma do livro (D.ARMAS), de onde vêm as
// propriedades; o resto é o que a mesa mudou (uma espada longa +1, uma arma
// que causa 1d6 de fogo a mais). O golpe desarmado não fica na lista: todo
// personagem tem.
// ══════════════════════════════════════════════════════════════════════════════

// Invocações que dão uma magia (LdJ p. 59-61): à vontade, ou uma vez por
// descanso longo gastando um espaço de magia de bruxo
const MAGIAS_DE_INVOCACAO = {
    'armadura-sombras': { id: 'armadura-arcana', vontade: true },
    'correntes-carceri': { id: 'imobilizar-monstro', vontade: true },
    'idioma-bestial': { id: 'falar-com-animais', vontade: true },
    'mascara-faces': { id: 'disfarcar-se', vontade: true },
    'mestre-formas': { id: 'alterar-se', vontade: true },
    'passo-ascendente': { id: 'levitacao', vontade: true },
    'salto-transcendental': { id: 'salto', vontade: true },
    'sussurros-sepultura': { id: 'falar-com-os-mortos', vontade: true },
    'vigor-abissal': { id: 'vitalidade-falsa', vontade: true, nivelFixo: 1 },
    'visao-mistica': { id: 'detectar-magia', vontade: true },
    'visoes-brumas': { id: 'imagem-silenciosa', vontade: true },
    'visoes-reinos': { id: 'olho-arcano', vontade: true },
    'encharcar-mente': { id: 'lentidao' },
    'escultor-carne': { id: 'metamorfose' },
    'lacaios-caos': { id: 'conjurar-elemental' },
    'larapio-destinos': { id: 'perdicao' },
    'palavra-terrivel': { id: 'confusao' },
    'sinal-agouro': { id: 'rogar-maldicao' },
    'sussurros-sedutores': { id: 'compulsao' },
}

// ── Armaduras possuídas ───────────────────────────────────────────────────────
// stats.armaduras: [{ id, base, nome?, bonus? }], com base em D.ARMADURAS ou
// 'escudo'. stats.equipamento guarda o que está vestido: { armadura: id,
// escudo: id }. Ficha antiga (sem a lista) tem só o que estava vestindo, com
// o id do catálogo no lugar do id do item.

function armadurasDoPersonagem(stats) {
    if (Array.isArray(stats.armaduras)) return stats.armaduras.filter(a => a && (D.ARMADURAS[a.base] || a.base === 'escudo'))
    const eq = stats.equipamento || {}
    const lista = []
    if (D.ARMADURAS[eq.armadura]) lista.push({ id: eq.armadura, base: eq.armadura })
    if (eq.escudo) lista.push({ id: 'escudo', base: 'escudo' })
    return lista
}

function armaduraVestida(stats) {
    const eq = stats.equipamento || {}
    if (!eq.armadura) return null
    const lista = armadurasDoPersonagem(stats)
    return lista.find(a => a.id === eq.armadura && a.base !== 'escudo')
        || (D.ARMADURAS[eq.armadura] ? { id: eq.armadura, base: eq.armadura } : null)
}

function escudoEmpunhado(stats) {
    const eq = stats.equipamento || {}
    if (!eq.escudo) return null
    const lista = armadurasDoPersonagem(stats)
    return lista.find(a => a.id === eq.escudo && a.base === 'escudo') || (eq.escudo === true || eq.escudo === 'escudo' ? { id: 'escudo', base: 'escudo' } : null)
}

const DESARMADO = 'desarmado'
const DADO_ARTES_MARCIAIS = [[1, 4], [5, 6], [11, 8], [17, 10]]
// Golpe Divino do clérigo (8º nível): o tipo do dano depende do domínio
const GOLPE_DIVINO = { guerra: null, natureza: null, tempestade: 'trovejante', enganacao: 'veneno', vida: 'radiante' }
// Quando o livro dá a escolha, o tipo vem dessa lista (e só dela)
const GOLPE_DIVINO_TIPOS = { natureza: ['frio', 'fogo', 'elétrico'] }
// Manobras que somam o dado de superioridade ao dano de um acerto, e as que
// ainda pedem um teste de resistência do alvo
const MANOBRAS_DE_DANO = ['ameacador', 'encontrao', 'finta', 'manobra', 'desarmante', 'estendido', 'provocante', 'derrubar', 'distrativo']
const MANOBRAS_COM_TESTE = { ameacador: 'SAB', encontrao: 'FOR', desarmante: 'FOR', provocante: 'SAB', derrubar: 'FOR' }
// Maestria em Arma de Haste vale para estas (LdJ p. 168)
const ARMAS_DE_HASTE = ['glaive', 'alabarda', 'bordao']

/** Todas as respostas de vagas com este id, de qualquer nível ("nv3:manobras", "nv4:talento:manobras"). */
function escolhidos(stats, id) {
    const re = new RegExp(`(^|:)${id}$`)
    return Object.entries(stats.escolhas || {})
        .filter(([k, v]) => re.test(k) && Array.isArray(v))
        .flatMap(([, v]) => v)
}

/** A arma como o motor usa: o catálogo do livro com o que a mesa mudou por cima. */
function definicaoDaArma(item) {
    if (!item || item.base === DESARMADO) return { ...D.GOLPE_DESARMADO, id: DESARMADO }
    const base = D.ARMAS[item.base]
    if (!base) return null
    return { ...base, id: item.base, nome: item.nome || base.nome, dano: item.dano || base.dano, tipo: item.tipoDano || base.tipo }
}

/** As armas da ficha que o motor reconhece, mais o golpe desarmado no fim. */
function armasDoPersonagem(stats) {
    return [...(stats.armas || []).filter(a => a && D.ARMAS[a.base]), { id: DESARMADO, base: DESARMADO }]
}

function ehArmaDeMonge(id) {
    const a = D.ARMAS[id]
    return id === 'espada-curta' || (!!a && a.cat === 'simples' && !a.distancia && !a.props.includes('duas-maos') && !a.props.includes('pesada'))
}

const mediaDoDado = expr => {
    const m = String(expr || '').match(/^(\d*)d(\d+)$/)
    return m ? (parseInt(m[1] || '1', 10) * (parseInt(m[2], 10) + 1)) / 2 : parseInt(expr, 10) || 0
}

/** "1d6 fogo" → { dados: '1d6', tipo: 'fogo' } */
function lerDano(texto) {
    const m = String(texto || '').trim().match(/^(\d+d\d+|\d+)\s*(.*)$/)
    return m ? { dados: m[1], tipo: m[2] || '' } : null
}

/**
 * Um ataque com a arma, com tudo somado.
 *   op.duasMaos  — arma versátil empunhada com as duas mãos
 *   op.arremesso — arma corpo-a-corpo arremessada (vira ataque à distância)
 *   op.poderoso  — −5 no ataque e +10 no dano (Mestre de Armas Grandes, Atirador Aguçado)
 *   op.outraMao  — ataque da ação bônus com a outra mão: sem o modificador no dano
 *   op.favorito  — contra o inimigo favorito do Patrulheiro
 *   op.haste     — a outra ponta da arma de haste (1d4 de concussão)
 * O dano extra que vem sempre (arma de fogo, Destruição Divina Aprimorada)
 * entra em `extras`; o que depende de o jogador decidir depois do acerto
 * fica em extrasDoAcerto().
 */
function ataqueComArma(stats, item, op = {}, f = calcular(stats)) {
    const def = definicaoDaArma(item)
    if (!def) return null
    const nivel = f.nivel
    const desarmado = def.id === DESARMADO
    const props = new Set(def.props)
    const talentos = talentosEscolhidos(stats).map(t => t.id)
    const efeitos = stats.efeitos || {}
    const notas = []

    const arremessada = !!op.arremesso && props.has('arremesso') && !def.distancia
    const corpo = !def.distancia && !arremessada
    const monge = stats.classe === 'monge' && (desarmado || ehArmaDeMonge(def.id))

    // Atributo: acuidade e armas de monge usam o melhor entre FOR e DES
    let atributo = def.distancia ? 'des' : 'for'
    if (props.has('acuidade') || monge) atributo = f.mods.des > f.mods.for ? 'des' : 'for'
    // Bordão Místico: a clava ou o bordão usam o atributo de magia e causam d8
    const mistico = !!efeitos['bordao-mistico'] && (def.id === 'clava' || def.id === 'bordao') && !op.haste
    if (mistico) {
        const m = f.magias.find(x => x.id === 'bordao-mistico')
        const attr = m ? m.atributo : 'sab'
        if (f.mods[attr] > f.mods[atributo]) atributo = attr
        notas.push('Bordão Místico')
    }
    const mod = f.mods[atributo]

    const proficiente = desarmado || !!item.pacto
        || f.proficiencias.categoriasArma.includes(def.cat) || f.proficiencias.armas.includes(def.id)
    if (!proficiente) notas.push('sem proficiência')

    // Dado de dano
    let dados = def.dano
    let tipo = def.tipo
    if (op.haste) { dados = '1d4'; tipo = 'concussão' }
    else if (op.duasMaos && props.has('versatil') && def.versatil && !item.dano) dados = def.versatil
    if (mistico && mediaDoDado(dados) < 4.5) dados = '1d8'
    if (desarmado) dados = talentos.includes('especialista-em-briga') ? '1d4' : '1'
    if (monge) {
        const am = porNivel(DADO_ARTES_MARCIAIS, nivel)
        if (mediaDoDado(dados) < (am + 1) / 2) { dados = `1d${am}`; notas.push(`Artes Marciais d${am}`) }
    }

    // Jogada de ataque
    let bonus = mod + (proficiente ? f.prof : 0) + (item.bonus || 0)
    if (def.distancia && f.estilos.includes('arquearia')) { bonus += 2; notas.push('Arquearia +2') }
    if (efeitos['arma-sagrada'] && !desarmado) { bonus += Math.max(1, f.mods.car); notas.push(`Arma Sagrada ${sinal(Math.max(1, f.mods.car))}`) }
    if (op.poderoso) bonus -= 5
    // Arma Mágica: a arma tocada soma o bônus no ataque e no dano
    const armaMagica = (f.efeitosRecebidos || []).filter(e => e.tipo === 'arma-magica' && e.armaId === item.id)
        .reduce((m, e) => Math.max(m, D.EFEITOS['arma-magica'].armaBonus(e.nivel || 2)), 0)
    if (armaMagica) { bonus += armaMagica; notas.push(`Arma Mágica +${armaMagica}`) }

    // Dano fixo
    let bonusDano = item.bonus || 0
    if (!op.outraMao || mod < 0 || f.estilos.includes('duas-armas')) bonusDano += mod
    const emUmaMao = corpo && !desarmado && !props.has('duas-maos') && !(op.duasMaos && props.has('versatil'))
    if (f.estilos.includes('duelismo') && emUmaMao && !op.outraMao && !op.haste) { bonusDano += 2; notas.push('Duelismo +2') }
    if (efeitos.furia && stats.classe === 'barbaro' && corpo && atributo === 'for') {
        const furia = porNivel([[1, 2], [9, 3], [16, 4]], nivel)
        bonusDano += furia
        notas.push(`Fúria +${furia}`)
    }
    if (op.poderoso) { bonusDano += 10; notas.push('−5/+10') }
    if (op.favorito && stats.classe === 'patrulheiro') { const b = nivel >= 6 ? 4 : 2; bonusDano += b; notas.push(`Inimigo favorito +${b}`) }
    if (op.investida) { bonusDano += 5; notas.push('Investida Poderosa +5') }
    bonusDano += armaMagica

    // Dano extra em todo acerto
    const extras = []
    const extraDaArma = lerDano(item.danoExtra)
    if (extraDaArma) extras.push({ ...extraDaArma, rotulo: item.nome || def.nome })
    if (stats.classe === 'paladino' && nivel >= 11 && corpo) extras.push({ dados: '1d8', tipo: 'radiante', rotulo: 'Destruição Divina Aprimorada' })
    if (item.pacto && nivel >= 12 && escolhidos(stats, 'invocacoes').includes('sorvedor-vida')) {
        extras.push({ dados: String(Math.max(1, f.mods.car)), tipo: 'necrótico', rotulo: 'Sorvedor de Vida' })
    }
    // Auxílio Divino (magia em si mesmo): +1d4 radiante em cada acerto com arma
    if ((f.efeitosRecebidos || []).some(e => e.tipo === 'auxilio-divino')) extras.push({ ...D.EFEITOS['auxilio-divino'].danoArma, rotulo: 'Auxílio Divino' })

    // Crítico
    let critMin = 20
    if (stats.classe === 'guerreiro' && stats.subclasse === 'campeao') critMin = nivel >= 15 ? 18 : nivel >= 3 ? 19 : 20
    if (critMin < 20) notas.push(`crítico ${critMin}–20`)
    let dadosCritExtra = 0
    if (corpo && stats.classe === 'barbaro' && nivel >= 9) dadosCritExtra += nivel >= 17 ? 3 : nivel >= 13 ? 2 : 1
    if (corpo && stats.raca === 'meio-orc') dadosCritExtra += 1
    const duasMaosDeVerdade = props.has('duas-maos') || (props.has('versatil') && op.duasMaos)
    const rerrolarAte = f.estilos.includes('armas-grandes') && corpo && duasMaosDeVerdade && !op.haste ? 2 : 0
    if (rerrolarAte) notas.push('rola de novo 1 e 2')

    const expressao = [dados, ...extras.map(e => e.dados)].filter(Boolean).join('+')
    return {
        item, def, nome: item.nome || def.nome, icone: def.icone,
        bonus, dados, bonusDano, tipo, extras, expressao,
        critMin, dadosCritExtra, rerrolarAte,
        corpo, distancia: !corpo, arremessada, atributo, proficiente, monge,
        acuidade: props.has('acuidade'), armaDistancia: !!def.distancia,
        semDano: !def.dano && !desarmado,
        notas,
        pode: {
            duasMaos: props.has('versatil'),
            arremesso: props.has('arremesso') && !def.distancia,
            poderoso: (talentos.includes('mestre-armas-grandes') && corpo && props.has('pesada'))
                || (talentos.includes('atirador-agucado') && !!def.distancia),
            favorito: stats.classe === 'patrulheiro',
        },
    }
}

/** "1d8 + 3 cortante (+1d8 radiante)" — o dano como a lista mostra. */
function textoDoDano(a) {
    if (a.semDano) return 'sem dano'
    const fixo = a.bonusDano ? ` ${a.bonusDano > 0 ? '+' : '−'} ${Math.abs(a.bonusDano)}` : ''
    const base = /^\d+$/.test(a.dados) ? String(Math.max(0, parseInt(a.dados, 10) + a.bonusDano)) : `${a.dados}${fixo}`
    return `${base} ${a.tipo}`.trim() + a.extras.map(e => ` +${e.dados} ${e.tipo}`).join('')
}

/** Quantos ataques a ação de Ataque dá. */
function ataquesPorAcao(stats, f = calcular(stats)) {
    // Na Forma Selvagem valem os ataques da besta: Ataques Múltiplos ("dois ataques")
    if (f.forma) {
        const txt = (f.forma.ataquesMultiplos || '').toLowerCase()
        return !txt ? 1 : /\btr[eê]s\b/.test(txt) ? 3 : 2
    }
    const nv = f.nivel
    const cl = stats.classe
    if (cl === 'guerreiro') return nv >= 20 ? 4 : nv >= 11 ? 3 : nv >= 5 ? 2 : 1
    if (['barbaro', 'monge', 'paladino'].includes(cl) && nv >= 5) return 2
    if (cl === 'patrulheiro' && ['cacador', 'rastreador'].includes(stats.subclasse) && nv >= 5) return 2
    if (cl === 'bardo' && stats.subclasse === 'bravura' && nv >= 6) return 2
    // Lâmina Sedenta: dois ataques, mas só com a arma do pacto (a tela confere)
    if (cl === 'bruxo' && nv >= 5 && escolhidos(stats, 'invocacoes').includes('lamina-sedenta')) return 2
    return 1
}

/**
 * Ataques que a ação bônus permite, com as armas que servem para cada um.
 * `apos` diz o que precisa ter acontecido no turno ("ataque": ter usado a
 * ação de Ataque); a tela só confere isso durante a batalha.
 */
function ataquesBonus(stats, f = calcular(stats)) {
    const nv = f.nivel
    const cl = stats.classe
    const talentos = talentosEscolhidos(stats).map(t => t.id)
    const armas = armasDoPersonagem(stats)
    const corpo = armas.filter(a => a.base !== DESARMADO && !D.ARMAS[a.base].distancia)
    const lista = []

    // Combate com duas armas: as duas leves (Ambidestro: qualquer uma de uma mão)
    const serveNaOutraMao = a => { const p = D.ARMAS[a.base].props; return talentos.includes('ambidestro') ? !p.includes('duas-maos') : p.includes('leve') }
    const outraMao = corpo.filter(serveNaOutraMao)
    if (outraMao.reduce((s, a) => s + (a.qtd || 1), 0) >= 2) {
        lista.push({ id: 'outra-mao', nome: 'Ataque com a outra mão', apos: 'ataque', armas: outraMao.map(a => a.id), op: { outraMao: true },
            desc: 'Depois de atacar com uma arma leve, ataca com a outra' + (f.estilos.includes('duas-armas') ? '.' : ', sem somar o modificador no dano.') })
    }
    if (cl === 'monge') {
        lista.push({ id: 'artes-marciais', nome: 'Golpe desarmado (Artes Marciais)', apos: 'ataque', armas: [DESARMADO],
            desc: 'Depois de atacar com golpe desarmado ou arma de monge.' })
        if (nv >= 2) lista.push({ id: 'rajada', nome: 'Rajada de Golpes', apos: 'ataque', armas: [DESARMADO], golpes: 2, recurso: 'chi',
            desc: '1 chi: dois golpes desarmados depois da ação de Ataque.' })
    }
    if (cl === 'barbaro' && stats.subclasse === 'furioso' && nv >= 3 && (stats.efeitos || {}).furia) {
        lista.push({ id: 'frenesi', nome: 'Frenesi', armas: corpo.map(a => a.id).concat(DESARMADO),
            desc: 'Em fúria frenética: um ataque corpo-a-corpo. Ao fim da fúria, 1 nível de exaustão.' })
    }
    if (talentos.includes('maestria-arma-haste')) {
        const haste = corpo.filter(a => ARMAS_DE_HASTE.includes(a.base))
        if (haste.length) lista.push({ id: 'haste', nome: 'Outra ponta da arma (Arma de Haste)', apos: 'ataque', armas: haste.map(a => a.id), op: { haste: true },
            desc: 'Depois de atacar com a arma de haste: 1d4 de concussão com o cabo.' })
    }
    if (talentos.includes('especialista-em-besta')) {
        const bm = armas.filter(a => a.base === 'besta-de-mao')
        if (bm.length) lista.push({ id: 'besta-de-mao', nome: 'Besta de mão (Especialista em Besta)', apos: 'ataque', armas: bm.map(a => a.id),
            desc: 'Depois de atacar com uma arma de uma mão.' })
    }
    if (talentos.includes('mestre-armas-grandes')) {
        lista.push({ id: 'armas-grandes', nome: 'Ataque bônus (Mestre de Armas Grandes)', armas: corpo.map(a => a.id).concat(DESARMADO),
            desc: 'Depois de um crítico ou de derrubar uma criatura a 0 PV com arma corpo-a-corpo.' })
    }
    if (cl === 'clerigo' && stats.subclasse === 'guerra') {
        lista.push({ id: 'sacerdote', nome: 'Sacerdote da Guerra', apos: 'ataque', armas: armas.map(a => a.id), recurso: 'sacerdote-guerra',
            desc: 'Depois da ação de Ataque, mais um ataque com arma.' })
    }
    if (cl === 'guerreiro' && stats.subclasse === 'cavaleiro-arcano' && nv >= 7) {
        lista.push({ id: 'magia-guerra', nome: 'Magia de Guerra', armas: armas.map(a => a.id),
            desc: nv >= 18 ? 'Depois de conjurar uma magia com a ação.' : 'Depois de conjurar um truque com a ação.' })
    }
    if (cl === 'bardo' && stats.subclasse === 'bravura' && nv >= 14) {
        lista.push({ id: 'magia-batalha', nome: 'Magia de Batalha', armas: armas.map(a => a.id), desc: 'Depois de conjurar uma magia com a ação.' })
    }
    if (talentos.includes('investida-poderosa')) {
        lista.push({ id: 'investida', nome: 'Investida Poderosa', armas: corpo.map(a => a.id).concat(DESARMADO), op: { investida: true },
            desc: 'Depois de usar Disparada e andar 3 m em linha reta: ataque corpo-a-corpo com +5 de dano.' })
    }
    return lista
}

/**
 * O que o jogador pode somar DEPOIS que o mestre diz que acertou (decidido
 * com o mestre em 2026-11-02: viram botões no resultado do ataque).
 *   uso: 'turno' (uma vez por turno) | 'acerto' (a cada acerto)
 *   recurso / espaco / chi: o que gasta
 */
function extrasDoAcerto(stats, ataque, f = calcular(stats)) {
    const nv = f.nivel
    const cl = stats.classe
    const sub = stats.subclasse
    const lista = []
    const conhece = id => f.magias.some(m => m.id === id)

    if (cl === 'ladino' && (ataque.acuidade || ataque.armaDistancia)) {
        lista.push({ id: 'furtivo', nome: 'Ataque Furtivo', dados: `${Math.ceil(nv / 2)}d6`, tipo: ataque.tipo, uso: 'turno',
            desc: 'Com vantagem, ou com um aliado a 1,5 m do alvo e sem desvantagem.' })
    }
    if (cl === 'paladino' && nv >= 2 && ataque.corpo) {
        lista.push({ id: 'destruicao', nome: 'Destruição Divina', espaco: true, tipo: 'radiante', uso: 'acerto',
            desc: '2d8 radiante com espaço de 1º, +1d8 por nível acima (máx. 5d8); +1d8 contra morto-vivo ou corruptor.' })
    }
    if (cl === 'clerigo' && nv >= 8 && sub in GOLPE_DIVINO) {
        lista.push({ id: 'golpe-divino', nome: 'Golpe Divino', dados: nv >= 14 ? '2d8' : '1d8', tipo: GOLPE_DIVINO[sub] || (GOLPE_DIVINO_TIPOS[sub] ? GOLPE_DIVINO_TIPOS[sub][0] : ataque.tipo),
            tipos: GOLPE_DIVINO_TIPOS[sub] || null, uso: 'turno', desc: 'Uma vez por turno, num acerto com arma.' })
    }
    if (conhece('marca-do-cacador')) {
        lista.push({ id: 'marca', nome: 'Marca do Caçador', dados: '1d6', tipo: ataque.tipo, uso: 'acerto', desc: 'Se o alvo está marcado.' })
    }
    if (conhece('bruxaria')) {
        lista.push({ id: 'bruxaria', nome: 'Bruxaria', dados: '1d6', tipo: 'necrótico', uso: 'acerto', desc: 'Se o alvo está amaldiçoado.' })
    }
    if (cl === 'patrulheiro' && sub === 'cacador' && escolhidos(stats, 'presa').includes('colossos')) {
        lista.push({ id: 'colossos', nome: 'Assassino de Colossos', dados: '1d8', tipo: ataque.tipo, uso: 'turno', desc: 'Se o alvo já não está com todos os PV.' })
    }
    if (cl === 'patrulheiro' && nv >= 20) {
        lista.push({ id: 'matador', nome: 'Matador de Inimigos', dados: String(Math.max(0, f.mods.sab)), tipo: ataque.tipo, uso: 'turno', desc: 'Soma SAB ao dano, uma vez por turno.' })
    }

    // Manobras: cada uma gasta um dado de superioridade
    const sup = f.recursos.find(r => r.id === 'superioridade') || f.recursos.find(r => r.id === 'superioridade-talento')
    if (sup) {
        const dado = sup.dado || 'd6'
        const cd = 8 + f.prof + Math.max(f.mods.for, f.mods.des)
        const conhecidas = escolhidos(stats, 'manobras')
        D.OPCOES.manobras.filter(o => conhecidas.includes(o.id)).forEach(o => {
            if (MANOBRAS_DE_DANO.includes(o.id)) {
                const teste = MANOBRAS_COM_TESTE[o.id]
                lista.push({ id: 'manobra:' + o.id, nome: o.nome, dados: '1' + dado, tipo: ataque.tipo, uso: 'acerto', recurso: sup.id,
                    cd: teste ? `${cd} ${teste}` : null, desc: o.desc, custo: o.id === 'finta' ? 'bonus' : null })
            }
            else if (o.id === 'trespassante') lista.push({ id: 'manobra:' + o.id, nome: o.nome, dados: '1' + dado, tipo: ataque.tipo, uso: 'acerto', recurso: sup.id, outroAlvo: true, desc: o.desc })
            else if (o.id === 'precisao') lista.push({ id: 'manobra:' + o.id, nome: o.nome, dados: '1' + dado, uso: 'acerto', recurso: sup.id, noAtaque: true, desc: o.desc })
        })
    }
    if (cl === 'monge' && nv >= 5 && ataque.corpo) {
        lista.push({ id: 'atordoante', nome: 'Ataque Atordoante', recurso: 'chi', uso: 'acerto', cd: `${8 + f.prof + f.mods.sab} CON`,
            desc: `1 chi: o alvo faz CON (CD ${8 + f.prof + f.mods.sab}) ou fica atordoado até o fim do seu próximo turno.` })
    }
    // Técnica da Mão Aberta (3º): num acerto da Rajada de Golpes, um destes
    if (cl === 'monge' && sub === 'mao-aberta' && nv >= 3 && ataque.rajada) {
        const cd = 8 + f.prof + f.mods.sab
        lista.push({ id: 'mao-derrubar', grupo: 'mao-aberta', nome: 'Mão Aberta: derrubar', uso: 'acerto', cd: `${cd} DES`, desc: `O alvo faz DES (CD ${cd}) ou fica caído.` })
        lista.push({ id: 'mao-empurrar', grupo: 'mao-aberta', nome: 'Mão Aberta: empurrar', uso: 'acerto', cd: `${cd} FOR`, desc: `O alvo faz FOR (CD ${cd}) ou é empurrado até 4,5 m.` })
        lista.push({ id: 'mao-reacoes', grupo: 'mao-aberta', nome: 'Mão Aberta: sem reações', uso: 'acerto', desc: 'O alvo não pode usar reações até o fim do seu próximo turno.' })
    }
    // Magia de destruição conjurada: entra no próximo acerto (enquanto durar a concentração)
    const golpe = (stats.efeitos || {}).destruicao
    if (golpe && (stats.concentracao || {}).id === golpe.id && (!golpe.corpo || ataque.corpo)) {
        lista.push({ id: 'golpe:' + golpe.id, nome: golpe.nome, dados: golpe.dados || null, tipo: golpe.tipo || '', uso: 'acerto', cd: golpe.cd || null,
            consome: 'destruicao', desc: golpe.desc })
    }
    return lista
}

// ── Pacote inicial (equipamento do livro) ─────────────────────────────────────
// Na criação o jogador escolhe uma opção de cada grupo (a)/(b)/(c) da classe;
// as respostas ficam em stats.pacote = { escolha: [opção de cada grupo],
// armas: { 'grupo:i': [ids] } } até o personagem ser criado, quando
// aplicarPacote() troca isso pelas armas, armadura e itens de verdade.

// Riqueza inicial por classe (LdJ p. 143): [dados d4, multiplicador]. É a
// alternativa ao pacote: no lugar dele (e do equipamento do antecedente), o
// personagem começa só com o ouro.
const RIQUEZA_INICIAL = {
    barbaro: [2, 10], bardo: [5, 10], bruxo: [4, 10], clerigo: [5, 10], druida: [2, 10], feiticeiro: [3, 10],
    guerreiro: [5, 10], ladino: [4, 10], mago: [4, 10], monge: [5, 1], paladino: [5, 10], patrulheiro: [5, 10],
}

/** As moedas que vêm escritas nos itens ("Algibeira com 15 po", "5 po"). */
function moedasDosItens(itens) {
    const moedas = {}
    ;(itens || []).forEach(t => {
        const m = String(t).match(/(?:^|com )(\d+) (po|pp|pc|pe|pl)$/)
        if (m) moedas[m[2]] = (moedas[m[2]] || 0) + parseInt(m[1], 10)
    })
    return moedas
}

function gruposDoPacote(stats) {
    const { classe } = fontes(stats)
    return (classe && classe.equipamentoInicial) || []
}

/** Armas que valem para um "qualquer arma ..." do pacote. */
function armasParaEscolher(e) {
    return Object.entries(D.ARMAS)
        .filter(([, a]) => (!e.cat || a.cat === e.cat) && (!e.corpo || !a.distancia))
        .map(([id, a]) => ({ id, nome: a.nome }))
}

/** A opção pode ser escolhida? As marcadas "se for proficiente" pedem proficiência. */
function opcaoDoPacoteValida(stats, opcao, f = calcular(stats)) {
    if (!opcao.seProf) return true
    if (opcao.armadura && !f.proficiencias.armaduras.includes(D.ARMADURAS[opcao.armadura].tipo)) return false
    return (opcao.armas || []).every(a => {
        const id = Array.isArray(a) ? a[0] : a
        return f.proficiencias.categoriasArma.includes(D.ARMAS[id].cat) || f.proficiencias.armas.includes(id)
    })
}

/** "Gibão de peles, arco longo e 20 flechas" */
function rotuloDaOpcao(o) {
    if (o.rotulo) return o.rotulo
    const partes = []
    const comoArmadura = { couro: 'Armadura de couro', 'couro-batido': 'Armadura de couro batido', acolchoada: 'Armadura acolchoada', placas: 'Armadura de placas' }
    if (o.armadura) partes.push(comoArmadura[o.armadura] || D.ARMADURAS[o.armadura].nome)
    ;(o.armas || []).forEach(a => {
        const [id, qtd] = Array.isArray(a) ? a : [a, 1]
        partes.push(qtd > 1 ? `${qtd} × ${D.ARMAS[id].nome}` : D.ARMAS[id].nome)
    })
    ;(o.escolher || []).forEach(e => {
        const qtd = e.qtd || 1
        const tipo = e.cat === 'marcial' ? (qtd > 1 ? 'marciais' : 'marcial') : 'simples'
        partes.push(`${qtd > 1 ? 'duas armas' : 'qualquer arma'} ${tipo}${e.corpo ? ' corpo-a-corpo' : ''}`)
    })
    if (o.escudo) partes.push('Escudo')
    ;(o.itens || []).forEach(i => partes.push(i))
    const txt = partes.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p.charAt(0).toLowerCase() + p.slice(1)))
    return txt.length > 1 ? `${txt.slice(0, -1).join(', ')} e ${txt[txt.length - 1]}` : txt[0] || ''
}

function pacoteDe(stats) {
    const p = stats.pacote || {}
    return { escolha: Array.isArray(p.escolha) ? p.escolha : [], armas: p.armas || {}, modo: p.modo || 'pacote', ouro: p.ouro || 0 }
}

/** O que ainda falta escolher no pacote (texto) ou '' se está completo. */
function faltaNoPacote(stats, f = calcular(stats)) {
    const grupos = gruposDoPacote(stats)
    const p = pacoteDe(stats)
    if (p.modo === 'ouro') return p.ouro ? '' : 'Role o ouro inicial'
    for (let g = 0; g < grupos.length; g++) {
        const i = grupos[g].length === 1 ? 0 : p.escolha[g]
        const o = grupos[g][i]
        if (!o) return 'Escolha uma opção de cada grupo do equipamento'
        if (!opcaoDoPacoteValida(stats, o, f)) return `${rotuloDaOpcao(o)} pede proficiência`
        const faltaArma = (o.escolher || []).some((e, k) => {
            const v = p.armas[`${g}:${k}`] || []
            return v.filter(id => D.ARMAS[id]).length < (e.qtd || 1)
        })
        if (faltaArma) return 'Escolha as armas do equipamento'
    }
    return ''
}

/**
 * Troca stats.pacote pelas armas, armadura e itens que ele dá, somando o
 * equipamento do antecedente. Chamado ao criar o personagem (ou na ficha,
 * para quem foi criado antes das armas).
 */
function aplicarPacote(stats) {
    const grupos = gruposDoPacote(stats)
    const p = pacoteDe(stats)
    if (p.modo === 'ouro') {
        stats.armas = []
        stats.itens = []
        stats.armaduras = []
        stats.equipamento = { armadura: null, escudo: null }
        stats.moedas_iniciais = { po: p.ouro }
        delete stats.pacote
        return stats
    }
    const armas = []
    const itens = []
    let armadura = null
    let escudo = false
    const novaId = () => 'a' + Math.random().toString(36).slice(2, 9)
    const darArma = (id, qtd = 1) => {
        if (!D.ARMAS[id]) return
        const igual = armas.find(a => a.base === id)
        if (igual) igual.qtd = (igual.qtd || 1) + qtd
        else armas.push({ id: novaId(), base: id, qtd })
    }
    grupos.forEach((grupo, g) => {
        const o = grupo[grupo.length === 1 ? 0 : p.escolha[g]]
        if (!o) return
        if (o.armadura) armadura = o.armadura
        if (o.escudo) escudo = true
        ;(o.armas || []).forEach(a => (Array.isArray(a) ? darArma(a[0], a[1]) : darArma(a)))
        ;(o.escolher || []).forEach((e, k) => (p.armas[`${g}:${k}`] || []).slice(0, e.qtd || 1).forEach(id => darArma(id)))
        ;(o.itens || []).forEach(i => itens.push(i))
    })
    const ant = D.EQUIPAMENTO_ANTECEDENTE[stats.antecedente]
    if (ant) {
        ;(ant.armas || []).forEach(id => darArma(id))
        ;(ant.itens || []).forEach(i => itens.push(i))
    }
    stats.armas = armas
    stats.moedas_iniciais = moedasDosItens(itens)
    stats.itens = itens.filter(t => !/^\d+ (po|pp|pc|pe|pl)$/.test(t))
    stats.armaduras = []
    if (armadura) stats.armaduras.push({ id: novaId(), base: armadura })
    if (escudo) stats.armaduras.push({ id: novaId(), base: 'escudo' })
    stats.equipamento = {
        armadura: armadura ? stats.armaduras[0].id : null,
        escudo: escudo ? stats.armaduras[stats.armaduras.length - 1].id : null,
    }
    delete stats.pacote
    return stats
}

function estilosDeLuta(stats) {
    const esc = stats.escolhas || {}
    return Object.entries(esc)
        .filter(([k]) => /^nv\d+:estilo$/.test(k))
        .flatMap(([, v]) => v || [])
}

/** Nomes legíveis do que foi escolhido numa vaga de opção. */
function nomesEscolhidos(stats, key, escolha) {
    const v = (stats.escolhas || {})[key]
    if (!v || !v.length) return ''
    if (escolha.tipo === 'opcao') {
        const lista = D.OPCOES[escolha.fonte] || []
        return v.map(id => (lista.find(o => o.id === id) || {}).nome || id).join(', ')
    }
    if (escolha.tipo === 'pericia' || escolha.tipo === 'especializacao') {
        return v.map(k => (D.PERICIA_POR_KEY[k] || {}).nome || k).join(', ')
    }
    return v.join(', ')
}

function tituloDoPersonagem(stats) {
    const { raca, subraca, classe, subclasse, antecedente } = fontes(stats)
    const partes = []
    if (subraca || raca) partes.push((subraca || raca).nome)
    if (classe) partes.push(`${classe.nome} ${stats.nivel || 1}` + (subclasse ? ` (${subclasse.nome})` : ''))
    if (antecedente) partes.push(antecedente.nome)
    return partes.join(' · ')
}

/**
 * Grava na ficha os números que o card e o resto da sala leem direto de
 * stats (hp_max, ca). Chamado depois de qualquer mudança de build.
 */
function materializar(stats) {
    const f = calcular(stats)
    stats.hp_max = f.pvMax
    stats.ca = f.ca
    if (stats.hp == null || stats.hp > f.pvMax) stats.hp = f.pvMax
    return f
}

/** PV ganhos ao passar de `nivel` para `nivel + 1`, já com a CON atual. */
function pvGanhosNoNivel(stats) {
    const antes = calcular(stats).pvMax
    const depois = calcular({ ...stats, nivel: (stats.nivel || 1) + 1 }).pvMax
    return depois - antes
}

/**
 * Tira escolhas que deixaram de valer — trocar a raça ou a classe muda as
 * vagas e as opções, e a resposta antiga não pode continuar contando.
 */
function limparEscolhasInvalidas(stats) {
    const vagas = vagasDeEscolha(stats, stats.nivel || 1)
    const validas = new Set(vagas.map(v => v.key))
    const esc = stats.escolhas || {}
    Object.keys(esc).forEach(k => { if (!validas.has(k)) delete esc[k] })
    const { classe } = fontes(stats)
    if (stats.subclasse && (!classe || !classe.subclasses[stats.subclasse] || (stats.nivel || 1) < classe.subclasse.nivel)) {
        stats.subclasse = null
    }
    vagas.forEach(vaga => {
        if (vaga.tipo === 'asi' || vaga.tipo === 'subclasse') return
        const v = esc[vaga.key]
        if (!Array.isArray(v) || !v.length) return
        const opcoes = opcoesDaVaga(stats, vaga)
        const ok = new Set(opcoes.filter(o => !o.bloqueado).map(o => o.id))
        const filtrado = v.filter(x => ok.has(x)).slice(0, vaga.qtd)
        if (filtrado.length !== v.length) esc[vaga.key] = filtrado
    })
    stats.escolhas = esc
    return stats
}

module.exports = {
    NIVEL_MAX, COMPRA_PONTOS, CUSTO_COMPRA, CONJUNTO_PADRAO, METODOS,
    mod, proficiencia, sinal, fontes, novaFicha,
    vagasDeEscolha, valorDaVaga, vagaCompleta, pendencias, opcoesDaVaga,
    atributosFinais, custoCompra, rolar4d6,
    calcular, materializar, pvGanhosNoNivel, limparEscolhasInvalidas,
    caracteristicasPorNivel, tituloDoPersonagem, talentosEscolhidos,
    totaisDeMagia, magiasDoPersonagem, magiasSempre, conjuracaoAtiva,
    ATRIBUTO_DA_LISTA, NOME_DA_LISTA,
    DESARMADO, escolhidos, definicaoDaArma, armasDoPersonagem, ehArmaDeMonge,
    armadurasDoPersonagem, armaduraVestida, escudoEmpunhado, MAGIAS_DE_INVOCACAO,
    ataqueComArma, textoDoDano, ataquesPorAcao, ataquesBonus, extrasDoAcerto,
    espacosLivres, RIQUEZA_INICIAL, moedasDosItens, gruposDoPacote, armasParaEscolher, opcaoDoPacoteValida, rotuloDaOpcao, faltaNoPacote, aplicarPacote,
}
