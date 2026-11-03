// ══════════════════════════════════════════════════════════════════════════════
// src/dndHabilidades.js — AÇÕES, AÇÕES BÔNUS E HABILIDADES QUE SE USAM (D&D)
//
// O que um personagem pode FAZER no turno, com o custo que o livro dá:
//   • as ações de combate de todos (Esquivar, Disparada... LdJ p. 192);
//   • agarrar e empurrar, que trocam um ataque da ação de Ataque;
//   • o que classe, raça e talento dão: Retomar o Fôlego (ação bônus),
//     Inspiração de Bardo (bônus), Ação Ardilosa (bônus), Cura pelas Mãos
//     (ação), Arma de Sopro (ação), Canalizar Divindade, Voto de Inimizade
//     (bônus), Pés Rápidos, Passo das Sombras, Mestre de Escudo...
//
// usar() confere a economia do turno (dndCombate.podeGastar: na batalha,
// nada que gaste ação passa se a ação já foi usada), gasta o recurso e faz o
// efeito: rola, cura, marca no chat. O mestre não é travado.
// ══════════════════════════════════════════════════════════════════════════════

const state = require('./state')
const dnd = require('./dnd')
const D = require('./dndDados')
const CD = require('./dndCondicoes')
const rolagem = require('./dndRolagem')
const CR = require('./dndCriaturas')
const { porNivel } = require('./dndClasses')

const combate = () => require('./dndCombate')
const sheet = () => require('./dndSheet')
const estado = () => require('./dndEstadoUI')
const efeitos = () => require('./dndEfeitos')

const GRUPOS = { acao: 'Ação', ataque: 'No lugar de um ataque', bonus: 'Ação bônus', reacao: 'Reação', livre: 'Sem custo' }

function chat(message, playerName = '⚔ Batalha') {
    if (state.socket) state.socket.emit('chat_message', { playerName, message, type: 'text' })
}

function atual(char) {
    return estado().charPorId(char.id) || char
}

function outrosDoGrupo(char) {
    return state.allCharsCache.filter(e => e.character.system === 'dnd' && e.character.id !== char.id)
}

function rolarPericia(char, f, pericia, rotulo) {
    const st = atual(char).stats || {}
    const p = D.PERICIAS.find(x => x.key === pericia)
    rolagem.testeD20({ personagem: char.name, rotulo, bonus: f.pericias[pericia].bonus, auto: CD.modoAutomatico(st, f, { tipo: 'pericia', atributo: p.attr, pericia }) })
}

function marcar(char, efeito) {
    sheet().gravar(char.id, { efeitos: { ...(atual(char).stats.efeitos || {}), [efeito]: true } })
}

// ══════════════════════════════════════════════════════════════════════════════
// ── O que cada personagem tem ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Lista do que o personagem pode usar. Cada item:
 *   { id, nome, custo: acao|bonus|ataque|livre, desc, recurso?, pontos?, chi?,
 *     aposAtaque?, campos?: ['alvo', 'qtd', 'besta', 'espaco'], requisito?(),
 *     faz(char, f, valores) }
 */
function lista(char) {
    const st = atual(char).stats || {}
    const f = dnd.calcular(st)
    const nv = f.nivel
    const cl = st.classe
    const sub = st.subclasse
    const out = []
    const add = h => out.push(h)

    // Disparada, Desengajar e Esconder também servem de ação bônus para várias classes
    const disparada = () => chat(`${char.name} usa Disparada (+${String(f.deslocamento).replace('.', ',')} m de movimento).`)
    const desengajar = () => { marcar(char, 'desengajou'); chat(`${char.name} desengaja (sem ataques de oportunidade contra ele neste turno).`) }
    const esconder = () => rolarPericia(char, f, 'furtividade', 'Esconder (Furtividade)')
    const esquivar = () => { marcar(char, 'esquivando'); chat(`${char.name} se esquiva (ataques contra ele com desvantagem até o próximo turno).`) }

    // ── Ações de combate de todo mundo (LdJ p. 192) ──
    add({ id: 'esquivar', nome: 'Esquivar', custo: 'acao', desc: 'Até o seu próximo turno, ataques contra você têm desvantagem e você tem vantagem em resistências de DES.', faz: esquivar })
    add({ id: 'disparada', nome: 'Disparada', custo: 'acao', desc: 'Deslocamento extra igual ao seu deslocamento.', faz: disparada })
    add({ id: 'desengajar', nome: 'Desengajar', custo: 'acao', desc: 'Seu movimento não provoca ataques de oportunidade neste turno.', faz: desengajar })
    add({ id: 'esconder', nome: 'Esconder', custo: 'acao', desc: 'Teste de Destreza (Furtividade).', faz: esconder })
    add({ id: 'ajudar', nome: 'Ajudar', custo: 'acao', desc: 'Um aliado tem vantagem no próximo teste ou ataque contra uma criatura a 1,5 m de você.', campos: ['alvo'],
        faz: (c, ff, v) => chat(`${char.name} ajuda ${v.alvo ? v.alvo.name : 'um aliado'}: vantagem no próximo teste ou ataque.`) })
    add({ id: 'preparar', nome: 'Preparar', custo: 'acao', desc: 'Escolhe um gatilho e reage a ele com a reação.', faz: () => chat(`${char.name} prepara uma ação (usa a reação quando o gatilho acontecer).`) })
    add({ id: 'procurar', nome: 'Procurar', custo: 'acao', desc: 'Teste de Sabedoria (Percepção).', faz: () => rolarPericia(char, f, 'percepcao', 'Procurar (Percepção)') })
    add({ id: 'objeto', nome: 'Usar objeto', custo: 'acao', desc: 'Usa um objeto que exige a ação (para itens do inventário, use o menu Item).', faz: () => chat(`${char.name} usa um objeto.`) })

    // ── Agarrar e empurrar: um ataque da ação de Ataque (LdJ p. 195) ──
    add({ id: 'agarrar', nome: 'Agarrar', custo: 'ataque', desc: 'Atletismo contra Atletismo ou Acrobacia do alvo; agarrado fica com deslocamento 0.', faz: () => rolarPericia(char, f, 'atletismo', 'Agarrar (Atletismo)') })
    add({ id: 'empurrar', nome: 'Empurrar', custo: 'ataque', desc: 'Atletismo contra Atletismo ou Acrobacia do alvo; derruba ou empurra 1,5 m.', faz: () => rolarPericia(char, f, 'atletismo', 'Empurrar (Atletismo)') })

    // ── Guerreiro ──
    if (cl === 'guerreiro') {
        add({ id: 'retomar-folego', nome: 'Retomar o Fôlego', custo: 'bonus', recurso: 'retomar-folego', desc: `Recupera 1d10 + ${nv} PV.`,
            faz: () => {
                const r = rolagem.rolarDados({ personagem: char.name, rotulo: 'Retomar o Fôlego', expressao: '1d10', bonus: nv, tipo: 'cura' })
                estado().curaNoPersonagem(atual(char), r.total)
            } })
        add({ id: 'surto-acao', nome: 'Surto de Ação', custo: 'livre', recurso: 'surto-acao', desc: 'Uma ação a mais neste turno.',
            requisito: () => (combate().emBatalha() && !combate().turnoDoChar(char.id) ? 'Só no seu turno' : ''),
            faz: () => {
                const cb = combate()
                const ent = cb.entradaDoChar(char.id)
                const ec = ent && cb.economia(ent.id)
                if (ec) cb.gastar(ent.id, 'acoes', ec.acoes + 1)
                chat(`${char.name} usa Surto de Ação.`)
            } })
        if (sub === 'cavaleiro-arcano' && nv >= 3) add({ id: 'vinculo-arma', nome: 'Invocar arma vinculada', custo: 'bonus', desc: 'A arma vinculada se teletransporta para a sua mão.', faz: () => chat(`${char.name} invoca a arma vinculada para a mão.`) })
    }

    // ── Bárbaro (Fúria fica no painel de armas) ──
    if (cl === 'barbaro' && sub === 'totemico' && nv >= 3 && dnd.escolhidos(st, 'totem').includes('aguia')) {
        add({ id: 'aguia', nome: 'Disparada (Totem da Águia)', custo: 'bonus', desc: 'Em fúria, Disparada como ação bônus.',
            requisito: () => ((atual(char).stats.efeitos || {}).furia ? '' : 'Só em fúria'), faz: disparada })
    }

    // ── Bardo ──
    if (cl === 'bardo') {
        const ins = f.recursos.find(r => r.id === 'inspiracao-bardo')
        add({ id: 'inspiracao', nome: `Inspiração de Bardo (${ins ? ins.dado : 'd6'})`, custo: 'bonus', recurso: 'inspiracao-bardo', campos: ['alvo'], alvoNaoSi: true,
            desc: 'Uma criatura a até 18 m (não você) ganha um dado para somar a um teste, ataque ou resistência nos próximos 10 minutos.'
                + (sub === 'bravura' ? ' Inspiração em Combate: também no dano de arma, ou na CA contra um ataque.' : ''),
            requisito: () => (outrosDoGrupo(char).length ? '' : 'Ninguém no grupo para inspirar'),
            faz: (c, ff, v) => { if (v.alvo) efeitos().aplicar(char, 'inspiracao-bardo', [v.alvo.id], { dado: ins ? ins.dado : 'd6', bravura: sub === 'bravura' }) } })
    }

    // ── Ladino ──
    if (cl === 'ladino' && nv >= 2) {
        add({ id: 'ardilosa-disparada', nome: 'Disparada (Ação Ardilosa)', custo: 'bonus', desc: 'Ação Ardilosa.', faz: disparada })
        add({ id: 'ardilosa-desengajar', nome: 'Desengajar (Ação Ardilosa)', custo: 'bonus', desc: 'Ação Ardilosa.', faz: desengajar })
        add({ id: 'ardilosa-esconder', nome: 'Esconder (Ação Ardilosa)', custo: 'bonus', desc: 'Ação Ardilosa.', faz: esconder })
        if (sub === 'ladrao' && nv >= 3) {
            add({ id: 'maos-objeto', nome: 'Usar objeto (Mãos Rápidas)', custo: 'bonus', desc: 'Mãos Rápidas: usar um objeto como ação bônus.', faz: () => chat(`${char.name} usa um objeto (Mãos Rápidas).`) })
            add({ id: 'maos-prestidigitacao', nome: 'Prestidigitação (Mãos Rápidas)', custo: 'bonus', desc: 'Mãos Rápidas: teste de DES (Prestidigitação) ou ferramentas de ladrão.',
                faz: () => rolarPericia(char, f, 'prestidigitacao', 'Prestidigitação (Mãos Rápidas)') })
        }
    }

    // ── Monge ──
    if (cl === 'monge' && nv >= 2) {
        add({ id: 'defesa-paciente', nome: 'Defesa Paciente', custo: 'bonus', chi: 1, desc: '1 chi: Esquivar como ação bônus.', faz: esquivar })
        add({ id: 'passo-disparada', nome: 'Passo do Vento: Disparada', custo: 'bonus', chi: 1, desc: '1 chi: Disparada como ação bônus; salto dobrado.', faz: disparada })
        add({ id: 'passo-desengajar', nome: 'Passo do Vento: Desengajar', custo: 'bonus', chi: 1, desc: '1 chi: Desengajar como ação bônus; salto dobrado.', faz: desengajar })
        if (sub === 'sombra' && nv >= 6) add({ id: 'passo-sombras', nome: 'Passo das Sombras', custo: 'bonus', desc: 'Na penumbra ou escuridão: teleporta até 18 m e tem vantagem no primeiro ataque corpo-a-corpo antes do fim do turno.',
            faz: () => chat(`${char.name} usa Passo das Sombras (teleporta até 18 m; vantagem no próximo ataque corpo-a-corpo neste turno).`) })
        if (sub === 'mao-aberta' && nv >= 6) add({ id: 'integridade', nome: 'Integridade Corporal', custo: 'acao', recurso: 'integridade', desc: `Recupera ${3 * nv} PV.`,
            faz: () => { estado().curaNoPersonagem(atual(char), 3 * nv); chat(`${char.name} usa Integridade Corporal e recupera ${3 * nv} PV.`) } })
    }

    // ── Druida: Forma Selvagem gasta a ação; no Círculo da Lua, a ação bônus.
    //    Voltar é ação bônus; curar com espaço (Lua) também (LdJ p. 67 e 69) ──
    if (cl === 'druida' && nv >= 2) {
        const custoForma = sub === 'lua' ? 'bonus' : 'acao'
        const rotuloCusto = custoForma === 'bonus' ? 'ação bônus' : 'ação'
        if (!f.forma) {
            add({ id: 'forma-selvagem', nome: 'Forma Selvagem', custo: custoForma, recurso: 'forma-selvagem', campos: ['besta'],
                desc: `Vira uma besta que já viu (gasta a ${rotuloCusto}).`,
                requisito: () => (CR.formasPermitidas(nv, sub).length ? '' : 'Nenhuma besta permitida neste nível'),
                faz: (c, ff, v) => {
                    const besta = CR.criatura(v.besta)
                    if (!besta) return
                    sheet().gravar(char.id, { forma: { id: besta.id, pv: besta.pv } })
                    chat(`🐾 ${char.name} assume a forma de ${besta.nome.toLowerCase()} (${besta.pv} PV), gastando a ${rotuloCusto}.`)
                } })
        } else {
            add({ id: 'forma-voltar', nome: 'Voltar à forma normal', custo: 'bonus', desc: 'Volta à forma de druida.',
                faz: () => { sheet().gravar(char.id, { forma: null }); chat(`🐾 ${char.name} volta à forma normal (ação bônus).`) } })
            if (sub === 'lua') {
                add({ id: 'forma-curar', nome: 'Curar com espaço', custo: 'bonus', campos: ['espaco'],
                    desc: 'Forma Selvagem de Combate: gasta um espaço de magia e cura 1d8 por nível dele.',
                    requisito: () => (dnd.espacosLivres(atual(char).stats || {}, dnd.calcular(atual(char).stats || {}), 1).length ? '' : 'Sem espaço de magia livre'),
                    faz: (c, ff, v) => {
                        const e = v.espaco
                        if (!e) return
                        combate().gastarEspaco(char, e)
                        const r = rolagem.rolarDados({ personagem: char.name, rotulo: 'Forma Selvagem de Combate (ação bônus)', expressao: `${e.nivel}d8`, tipo: 'cura' })
                        estado().curaNoPersonagem(atual(char), r.total)
                    } })
            }
        }
    }

    // ── Patrulheiro ──
    if (cl === 'patrulheiro') {
        if (nv >= 8) add({ id: 'pes-rapidos', nome: 'Disparada (Pés Rápidos)', custo: 'bonus', desc: 'Pés Rápidos: Disparada como ação bônus.', faz: disparada })
        if (nv >= 14) add({ id: 'desaparecer', nome: 'Esconder (Desaparecer)', custo: 'bonus', desc: 'Desaparecer: Esconder como ação bônus.', faz: esconder })
    }

    // ── Paladino ──
    if (cl === 'paladino') {
        add({ id: 'cura-maos', nome: 'Cura pelas Mãos', custo: 'acao', recurso: 'cura-maos', pontos: true, campos: ['alvo', 'qtd'],
            desc: 'Toca uma criatura e cura com pontos da reserva (5 pontos curam uma doença ou veneno).',
            faz: (c, ff, v) => {
                const alvo = v.alvo || atual(char)
                estado().curaNoPersonagem(alvo, v.qtd)
                chat(`${char.name} usa Cura pelas Mãos em ${alvo.name}: ${v.qtd} PV.`, '✦ Magia')
            } })
        add({ id: 'sentido-divino', nome: 'Sentido Divino', custo: 'acao', recurso: 'sentido-divino', desc: 'Sente celestiais, corruptores e mortos-vivos a 18 m até o fim do próximo turno.',
            faz: () => chat(`${char.name} usa Sentido Divino.`, '✦ Magia') })
    }

    // ── Canalizar Divindade (clérigo e paladino): as opções da subclasse ──
    if ((cl === 'clerigo' && nv >= 2) || (cl === 'paladino' && nv >= 3)) {
        const cd = f.conjuracao ? f.conjuracao.cd : 8 + f.prof + f.mods[cl === 'clerigo' ? 'sab' : 'car']
        const canal = (id, nome, custo, desc, faz) => add({ id: 'canal:' + id, nome, custo, recurso: 'canalizar', desc, faz })
        if (cl === 'clerigo') {
            const destruir = porNivel([[1, null], [5, '1/2'], [8, '1'], [11, '2'], [14, '3'], [17, '4']], nv)
            canal('expulsar', 'Expulsar Mortos-Vivos', 'acao', `Mortos-vivos a 9 m que falharem em SAB (CD ${cd}) fogem por 1 minuto.`,
                () => chat(`${char.name} ergue o símbolo sagrado: Expulsar Mortos-Vivos (SAB CD ${cd})${destruir ? `; os de ND ${destruir} ou menos são destruídos` : ''}.`, '✦ Magia'))
        }
        // As da subclasse vêm das características "Canalizar Divindade: X"
        const CUSTOS = { 'Ataque Dirigido': null, 'Ira Destruidora': 'livre', 'Voto de Inimizade': 'bonus', 'Bênção do Deus da Guerra': null, 'Arma Sagrada': null }
        dnd.caracteristicasPorNivel(st, nv).forEach(c => {
            const m = /^Canalizar Divindade: (.+)$/.exec(c.nome)
            if (!m) return
            const nome = m[1]
            if (CUSTOS[nome] === null) return   // reação (prompt), interruptor nas armas ou depois do d20
            const custo = CUSTOS[nome] || 'acao'
            if (nome === 'Radiação do Amanhecer') {
                canal('radiacao', nome, custo, c.desc, () => rolagem.rolarDados({ personagem: char.name, rotulo: `Radiação do Amanhecer (CON CD ${cd}, metade se passar)`, expressao: '2d10', bonus: nv, tipo: 'dano', tipoDano: 'radiante' }))
            } else if (nome === 'Voto de Inimizade') {
                canal('voto', nome, custo, c.desc, () => efeitos().marcar(char, 'voto-inimizade'))
            } else if (nome === 'Preservar a Vida') {
                canal('preservar', nome, custo, c.desc, () => chat(`${char.name} usa Preservar a Vida: distribui até ${5 * nv} PV entre aliados a 9 m (cada um até metade do máximo).`, '✦ Magia'))
            } else {
                canal(nome.toLowerCase().replace(/\s+/g, '-'), nome, custo, c.desc, () => chat(`${char.name} usa Canalizar Divindade: ${nome}. ${c.desc}`, '✦ Magia'))
            }
        })
    }

    // ── Feiticeiro ──
    if (cl === 'feiticeiro' && sub === 'draconica' && nv >= 14) {
        add({ id: 'asas', nome: 'Asas de Dragão', custo: 'bonus', desc: 'Asas de dragão: deslocamento de voo igual ao seu deslocamento.', faz: () => chat(`${char.name} abre asas de dragão (voo ${String(f.deslocamento).replace('.', ',')} m).`) })
    }

    // ── Mestre de Batalha: Inspirar (ação bônus com dado de superioridade) ──
    if (dnd.escolhidos(st, 'manobras').includes('inspirar')) {
        const sup = f.recursos.find(r => r.id === 'superioridade') || f.recursos.find(r => r.id === 'superioridade-talento')
        if (sup) add({ id: 'inspirar', nome: 'Inspirar (manobra)', custo: 'bonus', recurso: sup.id, campos: ['alvo'],
            desc: `Um aliado ganha PV temporários iguais a 1${sup.dado || 'd6'} + CAR.`,
            faz: (c, ff, v) => {
                const alvo = v.alvo || atual(char)
                const r = rolagem.rolarDados({ personagem: char.name, rotulo: `Inspirar ${alvo.name} (PV temporários)`, expressao: '1' + (sup.dado || 'd6'), bonus: f.mods.car, tipo: 'cura' })
                const temp = Math.max((alvo.stats || {}).hp_temp || 0, r.total)
                sheet().gravar(alvo.id, { hp_temp: temp })
            } })
    }

    // ── Raça: Arma de Sopro do draconato (tipo e resistência pelo ancestral) ──
    if (st.raca === 'draconato') {
        // O ancestral da raça (um feiticeiro dracônico tem outro, o da subclasse)
        const anc = D.OPCOES['ancestrais-draconicos'].find(o => o.id === ((st.escolhas || {})['raca:ancestral'] || [])[0])
        const dados = porNivel([[1, '2d6'], [6, '3d6'], [11, '4d6'], [16, '5d6']], nv)
        const res = anc && /\(CON\)/.test(anc.desc) ? 'CON' : 'DES'
        const cdSopro = 8 + f.mods.con + f.prof
        add({ id: 'sopro', nome: 'Arma de Sopro', custo: 'acao', recurso: 'sopro',
            desc: anc ? `${dados} de ${anc.dano} · ${anc.desc.split('·')[1].trim()} · CD ${cdSopro} (metade se passar)` : 'Escolha o ancestral dracônico.',
            requisito: () => (anc ? '' : 'Sem ancestral dracônico na ficha'),
            faz: () => rolagem.rolarDados({ personagem: char.name, rotulo: `Arma de Sopro (${res} CD ${cdSopro}, metade se passar)`, expressao: dados, tipo: 'dano', tipoDano: anc.dano }) })
    }

    // ── Bardo (2º): Canção de Descanso, no descanso curto ──
    if (cl === 'bardo' && nv >= 2) {
        const dado = porNivel([[2, 'd6'], [9, 'd8'], [13, 'd10'], [17, 'd12']], nv)
        add({ id: 'cancao', nome: `Canção de Descanso (${dado})`, custo: 'livre', desc: `No descanso curto: quem gastar Dados de Vida recupera 1${dado} a mais.`,
            requisito: () => (combate().emBatalha() ? 'Só no descanso curto, fora da batalha' : ''),
            faz: () => efeitos().lancar(char, 'cancao-descanso', { dado }) })
    }

    // ── Clérigo (10º): Intervenção Divina ──
    if (cl === 'clerigo' && nv >= 10) {
        add({ id: 'intervencao', nome: 'Intervenção Divina', custo: 'acao', recurso: 'intervencao',
            desc: nv >= 20 ? 'O deus atende, sem rolar.' : `d100: com ${nv} ou menos, o deus atende. Deu certo: só de novo em 7 dias (o mestre libera); falhou: no descanso longo.`,
            requisito: () => ((atual(char).stats || {}).intervencao_bloqueada ? 'Atendida: só depois de 7 dias (o mestre libera)' : ''),
            faz: () => {
                let atendida = nv >= 20
                if (!atendida) atendida = rolagem.rolarDados({ personagem: char.name, rotulo: `Intervenção Divina (precisa de ${nv} ou menos)`, expressao: '1d100', tipo: 'dano' }).total <= nv
                chat(atendida ? `🙏 O deus de ${char.name} atende: o mestre escolhe a intervenção.` : `🙏 O deus de ${char.name} não atende desta vez.`, '✦ Magia')
                if (atendida) sheet().gravar(char.id, { intervencao_bloqueada: true })
            } })
    }
    // ── Clérigo da Enganação (1º): Bênção do Trapaceiro ──
    if (cl === 'clerigo' && sub === 'enganacao') {
        add({ id: 'trapaceiro', nome: 'Bênção do Trapaceiro', custo: 'acao', desc: 'Outra criatura ganha vantagem em Furtividade por 1 hora (ou até você usar de novo).',
            faz: () => efeitos().lancar(char, 'bencao-trapaceiro') })
    }

    // ── Bruxo da Arquifada (1º): Presença Feérica ──
    if (cl === 'bruxo' && sub === 'arquifada') {
        const cd = f.conjuracao ? f.conjuracao.cd : 8 + f.prof + f.mods.car
        ;[['encantar', 'enfeitiçadas'], ['amedrontar', 'amedrontadas']].forEach(([id, estado]) => {
            add({ id: 'presenca-' + id, nome: `Presença Feérica: ${id}`, custo: 'acao', recurso: 'presenca-feerica',
                desc: `Criaturas num cubo de 3 m a partir de você fazem SAB (CD ${cd}) ou ficam ${estado} até o fim do seu próximo turno.`,
                faz: () => chat(`✨ ${char.name} usa Presença Feérica: quem estiver no cubo de 3 m faz SAB CD ${cd} ou fica ${estado.slice(0, -1)} até o fim do próximo turno dele.`, '✦ Magia') })
        })
    }

    // ── Feiticeiro Selvagem: Marés de Caos (1º) e Dobrar a Sorte (6º) ──
    if (cl === 'feiticeiro' && sub === 'selvagem') {
        add({ id: 'mares', nome: 'Marés de Caos', custo: 'livre', recurso: 'mares-caos', desc: 'Vantagem na próxima jogada de ataque, teste ou resistência. Volta no descanso longo, ou depois de um surto.',
            faz: () => { rolagem.definirModo('vantagem'); chat(`🌀 ${char.name} usa Marés de Caos: vantagem na próxima jogada.`, '✦ Magia') } })
        if (nv >= 6) {
            ;[['+', 'bônus'], ['−', 'penalidade']].forEach(([sinal, nome]) => {
                add({ id: 'dobrar' + (sinal === '+' ? 'mais' : 'menos'), nome: `Dobrar a Sorte (${sinal}1d4)`, custo: 'reacao', recurso: 'feiticaria', gasta: 2,
                    desc: `2 pontos: ${nome} de 1d4 na jogada de outra criatura que você vê.`,
                    faz: () => {
                        const r = rolagem.rolarDados({ personagem: char.name, rotulo: `Dobrar a Sorte (${sinal}1d4)`, expressao: '1d4' })
                        chat(`🌀 ${char.name} dobra a sorte: ${sinal}${r.total} na jogada.`, '✦ Magia')
                    } })
            })
        }
    }

    // ── Bruxo do Corruptor (1º): derrubou um inimigo → PV temporários ──
    if (cl === 'bruxo' && sub === 'corruptor') {
        const temp = Math.max(1, f.mods.car + nv)
        add({ id: 'obscuro', nome: 'Derrubei um inimigo', custo: 'livre', desc: `Bênção do Obscuro: ${temp} PV temporários ao levar um inimigo a 0 PV.`,
            faz: () => {
                const st2 = atual(char).stats || {}
                if (temp > (st2.hp_temp || 0)) sheet().gravar(char.id, { hp_temp: temp })
                chat(`${char.name} derruba um inimigo: ${temp} PV temporários (Bênção do Obscuro).`)
            } })
    }

    // ── Mago necromante (2º): matou com magia de 1º nível ou mais → recupera PV (uma vez por turno) ──
    if (cl === 'mago' && sub === 'necromancia' && nv >= 2) {
        const ult = sheet().ultimaMagiaDe(char.id)
        const necro = ult && /necromancia/.test(ult.escola)
        const cura = ult && ult.nivel >= 1 ? ult.nivel * (necro ? 3 : 2) : 0
        add({ id: 'colheita', nome: 'Matei com magia', custo: 'livre',
            desc: ult ? `Colheita Sinistra: ${ult.nome} (${ult.nivel}º${necro ? ', necromancia' : ''}) → recupera ${cura} PV.` : 'Colheita Sinistra: conjure a magia primeiro.',
            requisito: () => {
                if (!ult || ult.nivel < 1) return 'Só com magia de 1º nível ou mais'
                const cb = combate()
                if (cb.emBatalha() && require('./dndArmas').turnoDe(char).usados.has('colheita')) return 'Uma vez por turno'
                return ''
            },
            faz: () => {
                if (combate().emBatalha()) require('./dndArmas').turnoDe(char).usados.add('colheita')
                estado().curaNoPersonagem(atual(char), cura)
                chat(`${char.name} colhe a vida de quem matou: recupera ${cura} PV (Colheita Sinistra).`)
            } })
    }

    // ── Marca do Caçador e Bruxaria: o alvo caiu, a marca muda de criatura (ação bônus) ──
    ;(st.marcas || []).filter(m => D.MARCAS[m.tipo] && D.MARCAS[m.tipo].mover).forEach(m => {
        add({ id: 'mover:' + m.tipo, nome: `Mover ${D.MARCAS[m.tipo].nome}`, custo: 'bonus', desc: 'Quando o alvo cai a 0 PV, a marca pode ir para outra criatura.',
            faz: () => efeitos().moverMarca(char, m.tipo) })
    })

    // ── Paladino (6º): quem está na aura (não gasta nada) ──
    if (cl === 'paladino' && nv >= 6) {
        add({ id: 'aura', nome: `Aura (${(st.aura_aliados || []).length} perto)`, custo: 'livre', desc: 'Marca quem está perto: +CAR nas resistências (e Aura de Coragem no 10º).',
            faz: () => efeitos().escolherAura(char) })
    }

    // ── Talentos ──
    if (f.talentos.includes('mestre-de-escudo')) {
        add({ id: 'escudo-empurrar', nome: 'Empurrar com o escudo', custo: 'bonus', aposAtaque: true, desc: 'Mestre de Escudo: depois da ação de Ataque, empurra uma criatura a 1,5 m.',
            requisito: () => (dnd.escudoEmpunhado(atual(char).stats || {}) ? '' : 'Precisa estar com o escudo'),
            faz: () => rolarPericia(char, f, 'atletismo', 'Empurrar com o escudo (Atletismo)') })
    }
    if (f.talentos.includes('especialista-em-briga')) {
        add({ id: 'briga-agarrar', nome: 'Agarrar (Especialista em Briga)', custo: 'bonus', aposAtaque: true, desc: 'Depois de acertar um golpe desarmado ou arma improvisada.',
            faz: () => rolarPericia(char, f, 'atletismo', 'Agarrar (Atletismo)') })
    }
    return out
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Usar ─────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** '' se dá para usar agora, senão o motivo. */
function motivo(char, h, qtd) {
    const cb = combate()
    const st = atual(char).stats || {}
    const f = dnd.calcular(st)
    if (h.requisito) { const m = h.requisito(); if (m) return m }
    if (h.custo === 'ataque') {
        const t = require('./dndArmas').turnoDe(char)
        if (!(cb.emBatalha() && cb.turnoDoChar(char.id) && t.restantes > 0)) { const m = cb.podeGastar(char, 'acao'); if (m) return m }
    } else {
        const m = cb.podeGastar(char, h.custo)
        if (m) return m
    }
    if (h.aposAtaque && cb.emBatalha() && cb.turnoDoChar(char.id) && !require('./dndArmas').turnoDe(char).atacou && !state.isRoomMaster) return 'Primeiro use a ação de Ataque'
    if (h.chi && !cb.recursoLivre(char, f, 'chi')) return 'Sem chi'
    if (h.recurso) {
        const r = f.recursos.find(x => x.id === h.recurso)
        if (!r) return 'Sem esse recurso'
        const usado = (st.recursos_usados || {})[h.recurso] || 0
        const gasto = h.gasta || (h.pontos ? Math.max(1, qtd || 1) : 1)
        if (r.max != null && usado + gasto > r.max) return h.pontos || h.gasta ? `Restam ${r.max - usado} ponto(s)` : 'Sem usos restantes'
    }
    return ''
}

function usar(char, h, valores = {}) {
    const m = motivo(char, h, valores.qtd)
    if (m) return m
    const cb = combate()
    const st = atual(char).stats || {}
    const f = dnd.calcular(st)
    if (h.chi) cb.gastarRecurso(char, 'chi')
    if (h.recurso) {
        const usados = { ...(atual(char).stats.recursos_usados || {}) }
        usados[h.recurso] = (usados[h.recurso] || 0) + (h.gasta || (h.pontos ? Math.max(1, valores.qtd || 1) : 1))
        sheet().gravar(char.id, { recursos_usados: usados })
    }
    if (h.custo === 'ataque') require('./dndArmas').usarAtaqueDaAcao(char)
    else cb.gastarCusto(char, h.custo)
    h.faz(char, f, valores)
    if (cb.emBatalha()) cb.atualizarTurno()
    return ''
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Tela ─────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Botões por grupo de custo. opts.custos: quais grupos mostrar, na ordem.
 * opts.aoMudar: redesenha quem chamou depois de usar.
 * opts.rotulos: troca o título de um grupo ({ bonus: 'Habilidades' }).
 */
function secao(char, { custos = ['acao', 'ataque', 'bonus', 'livre'], aoMudar, rotulos = {} } = {}) {
    const w = mk('div', 'cb-acoes-combate')
    const todas = lista(char)
    custos.forEach(custo => {
        const grupo = todas.filter(h => h.custo === custo)
        if (!grupo.length) return
        const linha = mk('div', 'cb-acoes-linha')
        linha.appendChild(mk('span', 'cb-acoes-rot', rotulos[custo] || GRUPOS[custo]))
        grupo.forEach(h => linha.appendChild(botaoDe(char, h, aoMudar)))
        w.appendChild(linha)
    })
    return w
}

/** Um botão; se a habilidade pede alvo ou quantidade, abre os campos ao lado. */
function botaoDe(char, h, aoMudar) {
    const m = motivo(char, h, 1)
    const b = mk('button', 'cb-btn', h.nome + (h.chi ? ` (${h.chi} chi)` : ''))
    b.type = 'button'
    b.disabled = !!m
    b.title = m || h.desc || ''
    b.addEventListener('click', () => {
        if (h.campos) return abrirCampos(char, h, b, aoMudar)
        // O botão pode ter sido desenhado antes de a economia mudar: diz o motivo
        const m = usar(char, h)
        if (m) combate().aviso(m)
        if (aoMudar) aoMudar()
    })
    return b
}

function abrirCampos(char, h, botao, aoMudar) {
    const w = mk('span', 'cb-campos')
    const st = atual(char).stats || {}
    const f = dnd.calcular(st)
    let alvo = null
    let qtd = null
    let besta = null
    let espaco = null
    const espacos = h.campos.includes('espaco') ? dnd.espacosLivres(st, f, 1) : []
    if (h.campos.includes('besta')) {
        besta = document.createElement('select')
        besta.className = 'dc-select'
        besta.setAttribute('aria-label', 'Besta')
        CR.formasPermitidas(f.nivel, st.subclasse).forEach(c => besta.appendChild(new Option(`${c.nome} · ${c.pv} PV`, c.id)))
    }
    if (espacos.length) {
        espaco = document.createElement('select')
        espaco.className = 'dc-select'
        espaco.setAttribute('aria-label', 'Espaço de magia')
        espacos.forEach(e => espaco.appendChild(new Option(`${e.id === 'pacto' ? 'Pacto ' : ''}${e.nivel}º · ${e.nivel}d8`, e.id)))
    }
    if (h.campos.includes('alvo')) {
        alvo = document.createElement('select')
        alvo.className = 'dc-select'
        alvo.setAttribute('aria-label', 'Alvo')
        state.allCharsCache.filter(e => e.character.system === 'dnd' && !(h.alvoNaoSi && e.character.id === char.id))
            .forEach(e => alvo.appendChild(new Option(e.character.name, e.character.id)))
        alvo.value = h.alvoNaoSi ? (alvo.options[0] || {}).value : char.id
    }
    if (h.campos.includes('qtd')) {
        qtd = document.createElement('input')
        qtd.type = 'number'
        qtd.min = '1'
        qtd.value = '5'
        qtd.className = 'room-input cn-qtd'
        qtd.setAttribute('aria-label', 'Pontos')
        qtd.addEventListener('keydown', e => e.stopPropagation())
    }
    const aviso = mk('span', 'dc-muted')
    const ok = mk('button', 'cb-btn principal', 'Usar')
    ok.type = 'button'
    ok.addEventListener('click', () => {
        const alvoChar = alvo ? estado().charPorId(alvo.value) : null
        const m = usar(char, h, {
            alvo: alvoChar, qtd: qtd ? Math.max(1, parseInt(qtd.value, 10) || 1) : null,
            besta: besta ? besta.value : null, espaco: espaco ? espacos.find(e => e.id === espaco.value) : null,
        })
        if (m) { aviso.textContent = m; return }
        if (aoMudar) aoMudar()
    })
    if (alvo) w.appendChild(alvo)
    if (qtd) w.appendChild(qtd)
    if (besta) w.appendChild(besta)
    if (espaco) w.appendChild(espaco)
    w.appendChild(ok)
    w.appendChild(aviso)
    botao.replaceWith(w)
}

/** As habilidades ligadas a um recurso (para o botão "Usar" do painel Recursos). */
function doRecurso(char, recursoId) {
    return lista(char).filter(h => h.recurso === recursoId)
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Surto de Magia Selvagem (feiticeiro Selvagem) ────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Depois de conjurar magia de feiticeiro de 1º nível ou mais (a mesa decidiu:
 * o d20 sempre rola; no 1, a tabela). Com as Marés de Caos gastas, o surto vem
 * direto e elas voltam. Um surto por turno.
 */
function aposConjurarSelvagem(char, m) {
    const st = atual(char).stats || {}
    if (st.classe !== 'feiticeiro' || st.subclasse !== 'selvagem' || m.nivel < 1 || m.recurso || m.semEspaco) return
    const cb = combate()
    const t = cb.emBatalha() ? require('./dndArmas').turnoDe(char) : null
    if (t && t.usados.has('surto')) return
    const usados = st.recursos_usados || {}
    if (usados['mares-caos']) {
        const novo = { ...usados }
        delete novo['mares-caos']
        sheet().gravar(char.id, { recursos_usados: novo })
        chat(`🌀 A magia de ${char.name} transborda: surto (e as Marés de Caos voltam).`, '✦ Magia')
        if (t) t.usados.add('surto')
        return surtoSelvagem(char)
    }
    const r = rolagem.rolarDados({ personagem: char.name, rotulo: 'Surto de Magia Selvagem (no 1, rola na tabela)', expressao: '1d20', tipo: 'dano' })
    if (r.total === 1) {
        if (t) t.usados.add('surto')
        surtoSelvagem(char)
    }
}

/** Rola na tabela (duas vezes no 14º, Caos Controlado: o jogador escolhe) e faz o que der. */
function surtoSelvagem(char) {
    const st = atual(char).stats || {}
    const f = dnd.calcular(st)
    const rolar = () => { const n = 1 + Math.floor(Math.random() * 100); return { n, e: D.SURTO_SELVAGEM[Math.ceil(n / 2) - 1] } }
    const aplicar = ({ n, e }) => {
        chat(`🌀 Surto de Magia Selvagem (d100 = ${n}): ${e[1]}`, '✦ Magia')
        const auto = e[2] || {}
        const s2 = atual(char).stats || {}
        if (auto.dano) {
            const cd = f.conjuracao ? f.conjuracao.cd : 8 + f.prof + f.mods.car
            rolagem.rolarDados({ personagem: char.name, rotulo: `Surto${auto.res ? ` (CD ${cd} ${auto.res.toUpperCase()}, metade se passar)` : ''}`, expressao: auto.dano, tipo: 'dano', tipoDano: auto.tipo })
        }
        if (auto.cura) estado().curaNoPersonagem(atual(char), rolagem.rolarDados({ personagem: char.name, rotulo: 'Surto', expressao: auto.cura, tipo: 'cura' }).total)
        if (auto.espaco) {
            const gastos = { ...(s2.espacos_usados || {}) }
            const menor = Object.keys(gastos).filter(k => k !== 'pacto' && gastos[k] > 0).map(Number).sort((a, b) => a - b)[0]
            if (menor) { gastos[menor] -= 1; sheet().gravar(char.id, { espacos_usados: gastos }) }
        }
        if (auto.pontos) {
            const novo = { ...(s2.recursos_usados || {}) }
            delete novo.feiticaria
            sheet().gravar(char.id, { recursos_usados: novo })
        }
    }
    const a = rolar()
    if (f.nivel < 14) return aplicar(a)
    const b = rolar()
    combate().perguntar({
        titulo: 'Caos Controlado', texto: `Escolha o surto: ${a.n} — ${a.e[1]} · ou · ${b.n} — ${b.e[1]}`, semRecusa: true,
        opcoes: [{ rotulo: `Ficar com ${a.n}`, principal: true, acao: () => aplicar(a) }, { rotulo: `Ficar com ${b.n}`, acao: () => aplicar(b) }],
    })
}

function mk(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

module.exports = { lista, motivo, usar, secao, botaoDe, doRecurso, GRUPOS, aposConjurarSelvagem, surtoSelvagem }
