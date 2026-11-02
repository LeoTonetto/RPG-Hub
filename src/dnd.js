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
    magiasSempre(stats).forEach(x => incluir(x.id, { origem: x.origem, atributo: x.atributo || atrClasse, sempre: true, usos: x.usos }))
    vagasDeEscolha(stats).filter(v => v.tipo === 'magia').forEach(v => {
        const atributo = v.atributo || (v.lista && v.lista !== 'todas' && v.key.includes(':talento:') ? ATRIBUTO_DA_LISTA[v.lista] : null) || atrClasse || 'car'
        ;((stats.escolhas || {})[v.key] || []).forEach(id => incluir(id, { origem: v.origem, atributo }))
    })
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

    const p = proficiencias(stats)
    const talentos = talentosEscolhidos(stats)
    const temTalento = id => talentos.some(t => t.id === id)

    // ── Testes de resistência ─────────────────────────────────────────────────
    // Aura de Proteção do paladino vale para o próprio paladino também
    const aura = classe && classe.auraProtecao && nivel >= classe.auraProtecao ? Math.max(1, mods.car) : 0
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
    const armadura = D.ARMADURAS[eq.armadura] || null
    const escudo = !!eq.escudo
    let ca, caDetalhe
    if (armadura) {
        let teto = armadura.maxDes
        if (armadura.tipo === 'media' && temTalento('maestria-armadura-media')) teto = 3
        const des = teto == null ? mods.des : Math.min(mods.des, teto)
        ca = armadura.ca + des
        caDetalhe = `${armadura.nome} ${armadura.ca}` + (teto === 0 ? '' : ` ${sinal(des)} DES`)
    } else {
        const opcoes = [{ ca: 10 + mods.des, txt: `10 ${sinal(mods.des)} DES` }]
        if (classe && classe.defesaSemArmadura === 'con') opcoes.push({ ca: 10 + mods.des + mods.con, txt: `10 ${sinal(mods.des)} DES ${sinal(mods.con)} CON` })
        if (classe && classe.defesaSemArmadura === 'sab' && !escudo) opcoes.push({ ca: 10 + mods.des + mods.sab, txt: `10 ${sinal(mods.des)} DES ${sinal(mods.sab)} SAB` })
        if (subclasse && subclasse.caSemArmadura) opcoes.push({ ca: subclasse.caSemArmadura + mods.des, txt: `${subclasse.caSemArmadura} ${sinal(mods.des)} DES` })
        const melhor = opcoes.reduce((a, b) => (b.ca > a.ca ? b : a))
        ca = melhor.ca
        caDetalhe = 'Sem armadura: ' + melhor.txt
    }
    if (escudo) { ca += 2; caDetalhe += ' + escudo 2' }
    const estilos = estilosDeLuta(stats)
    if (armadura && estilos.includes('defesa')) { ca += 1; caDetalhe += ' + Defesa 1' }
    const semProfArmadura = (armadura && !p.armaduras.has(armadura.tipo)) || (escudo && !p.armaduras.has('escudo'))

    // ── Deslocamento ──────────────────────────────────────────────────────────
    let deslocamento = (subraca && subraca.deslocamento) || (raca && raca.deslocamento) || 9
    if (temTalento('mobilidade')) deslocamento += 3
    if (stats.classe === 'barbaro' && nivel >= 5 && !(armadura && armadura.tipo === 'pesada')) deslocamento += 3
    if (stats.classe === 'monge' && !armadura && !escudo) deslocamento += porNivel([[1, 0], ...MOVIMENTO_MONGE], nivel)
    if (armadura && armadura.forca && atributos.for < armadura.forca && !(raca && raca.pesadaSemPenalidade)) deslocamento -= 3

    // ── PV ────────────────────────────────────────────────────────────────────
    const dv = classe ? classe.dadoVida : 8
    const media = dv / 2 + 1
    let pvMax = Math.max(1, dv + mods.con)
    for (let n = 2; n <= nivel; n++) pvMax += Math.max(1, media + mods.con)
    const pvPorNivel = ((subraca && subraca.concede && subraca.concede.pvPorNivel) || 0)
        + ((subclasse && subclasse.pvPorNivel) || 0)
        + (temTalento('robusto') ? 2 : 0)
    pvMax += pvPorNivel * nivel

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
    // Magia racial de "1 vez por descanso longo" vira um uso marcável
    magiasSempre(stats).filter(m => m.usos).forEach(m => {
        const mg = C.magia(m.id)
        recursos.push({ id: 'racial:' + m.id, nome: `${mg ? mg.nome : m.id} (raça)`, max: 1, recarga: 'longo' })
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
        deslocamento, pvMax, dadoVida: dv,
        visaoEscuro: visao, resistenciasDano: [...resistenciasDano],
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
}
