// ══════════════════════════════════════════════════════════════════════════════
// src/dndDados.js — CONTEÚDO DO D&D 5e: LISTAS, RAÇAS E ANTECEDENTES
//
// Base: o Livro do Jogador da mesa (tradução Biblioteca Élfica). Aqui fica só
// o que o app precisa para calcular e oferecer as escolhas certas, com um
// resumo curto e a página (pag) para quem quiser o texto completo no livro.
// As classes estão em dndClasses.js; magias e talentos, em dndConteudo.js.
//
// Como uma fonte dá coisas ao personagem:
//   concede  — o que vem fixo: { atributos, pericias, idiomas, ferramentas,
//              armaduras, armas, resistencias (testes), resistenciasDano,
//              visaoEscuro, pvPorNivel }
//   escolhas — o que o jogador escolhe: { id, rotulo, tipo, qtd, de? }
//              tipo: pericia | idioma | ferramenta | arma | atributo | opcao
//                    | magia (lista, nivelMin, nivelMax)
//              ('opcao' lista opções de `fonte`, uma das tabelas de OPCOES)
//   magias   — magias raciais sempre conhecidas: { id, nivel, atributo, usos? }
// ══════════════════════════════════════════════════════════════════════════════

const ATRIBUTOS = [
    { key: 'for', nome: 'Força', abrev: 'FOR' },
    { key: 'des', nome: 'Destreza', abrev: 'DES' },
    { key: 'con', nome: 'Constituição', abrev: 'CON' },
    { key: 'int', nome: 'Inteligência', abrev: 'INT' },
    { key: 'sab', nome: 'Sabedoria', abrev: 'SAB' },
    { key: 'car', nome: 'Carisma', abrev: 'CAR' },
]
const ATRIBUTO_POR_KEY = Object.fromEntries(ATRIBUTOS.map(a => [a.key, a]))
const TODOS_ATRIBUTOS = ATRIBUTOS.map(a => a.key)

const PERICIAS = [
    { key: 'acrobacia', nome: 'Acrobacia', attr: 'des' },
    { key: 'adestrar', nome: 'Adestrar Animais', attr: 'sab' },
    { key: 'arcanismo', nome: 'Arcanismo', attr: 'int' },
    { key: 'atletismo', nome: 'Atletismo', attr: 'for' },
    { key: 'atuacao', nome: 'Atuação', attr: 'car' },
    { key: 'enganacao', nome: 'Enganação', attr: 'car' },
    { key: 'furtividade', nome: 'Furtividade', attr: 'des' },
    { key: 'historia', nome: 'História', attr: 'int' },
    { key: 'intimidacao', nome: 'Intimidação', attr: 'car' },
    { key: 'intuicao', nome: 'Intuição', attr: 'sab' },
    { key: 'investigacao', nome: 'Investigação', attr: 'int' },
    { key: 'medicina', nome: 'Medicina', attr: 'sab' },
    { key: 'natureza', nome: 'Natureza', attr: 'int' },
    { key: 'percepcao', nome: 'Percepção', attr: 'sab' },
    { key: 'persuasao', nome: 'Persuasão', attr: 'car' },
    { key: 'prestidigitacao', nome: 'Prestidigitação', attr: 'des' },
    { key: 'religiao', nome: 'Religião', attr: 'int' },
    { key: 'sobrevivencia', nome: 'Sobrevivência', attr: 'sab' },
]
const PERICIA_POR_KEY = Object.fromEntries(PERICIAS.map(p => [p.key, p]))
const TODAS_PERICIAS = PERICIAS.map(p => p.key)

const IDIOMAS = {
    padrao: ['Comum', 'Anão', 'Élfico', 'Gigante', 'Gnômico', 'Goblin', 'Halfling', 'Orc'],
    exoticos: ['Abissal', 'Celestial', 'Dialeto Subterrâneo', 'Dracônico', 'Infernal', 'Primordial', 'Silvestre', 'Subcomum'],
}
const TODOS_IDIOMAS = [...IDIOMAS.padrao, ...IDIOMAS.exoticos]

const FERRAMENTAS = {
    artesao: [
        'Ferramentas de carpinteiro', 'Ferramentas de cartógrafo', 'Ferramentas de costureiro',
        'Ferramentas de coureiro', 'Ferramentas de entalhador', 'Ferramentas de ferreiro',
        'Ferramentas de funileiro', 'Ferramentas de joalheiro', 'Ferramentas de oleiro',
        'Ferramentas de pedreiro', 'Ferramentas de pintor', 'Ferramentas de sapateiro',
        'Ferramentas de vidreiro', 'Suprimentos de alquimista', 'Suprimentos de cervejeiro',
        'Suprimentos de caligrafia', 'Utensílios de cozinheiro',
    ],
    instrumentos: ['Alaúde', 'Flauta', 'Flauta de pã', 'Gaita de foles', 'Lira', 'Oboé', 'Tambor', 'Trombeta', 'Violino', 'Xilofone'],
    jogos: ['Baralho de cartas', 'Conjunto de dados', 'Jogo dos três dragões', 'Xadrez do dragão'],
    outras: [
        'Ferramentas de ladrão', 'Ferramentas de navegador', 'Kit de disfarce', 'Kit de falsificação',
        'Kit de herbalismo', 'Kit de venenos', 'Veículos (terrestres)', 'Veículos (aquáticos)',
    ],
}
const TODAS_FERRAMENTAS = [...FERRAMENTAS.artesao, ...FERRAMENTAS.instrumentos, ...FERRAMENTAS.jogos, ...FERRAMENTAS.outras]

// CA base, Destreza máxima (null = sem teto) e Força mínima. A armadura pesada
// sem a Força pedida tira 3 m do deslocamento (anões não sofrem isso).
const ARMADURAS = {
    'acolchoada': { nome: 'Acolchoada', tipo: 'leve', preco: 5, ca: 11, maxDes: null, furtividade: true },
    'couro': { nome: 'Couro', tipo: 'leve', preco: 10, ca: 11, maxDes: null },
    'couro-batido': { nome: 'Couro batido', tipo: 'leve', preco: 45, ca: 12, maxDes: null },
    'gibao-de-peles': { nome: 'Gibão de peles', tipo: 'media', preco: 10, ca: 12, maxDes: 2 },
    'camisao-de-malha': { nome: 'Camisão de malha', tipo: 'media', preco: 50, ca: 13, maxDes: 2 },
    'brunea': { nome: 'Brunea', tipo: 'media', preco: 50, ca: 14, maxDes: 2, furtividade: true },
    'peitoral': { nome: 'Peitoral', tipo: 'media', preco: 400, ca: 14, maxDes: 2 },
    'meia-armadura': { nome: 'Meia-armadura', tipo: 'media', preco: 750, ca: 15, maxDes: 2, furtividade: true },
    'cota-de-aneis': { nome: 'Cota de anéis', tipo: 'pesada', preco: 30, ca: 14, maxDes: 0, furtividade: true },
    'cota-de-malha': { nome: 'Cota de malha', tipo: 'pesada', preco: 75, ca: 16, maxDes: 0, forca: 13, furtividade: true },
    'cota-de-talas': { nome: 'Cota de talas', tipo: 'pesada', preco: 200, ca: 17, maxDes: 0, forca: 15, furtividade: true },
    'placas': { nome: 'Placas', tipo: 'pesada', preco: 1500, ca: 18, maxDes: 0, forca: 15, furtividade: true },
}
const PRECO_ESCUDO = 10

/** 0.05 po → "5 pc"; 0.2 po → "2 pp"; 15 po → "15 po" */
function textoPreco(po) {
    if (po == null) return ''
    if (po >= 1) return `${po.toLocaleString('pt-BR')} po`
    if (po >= 0.1) return `${Math.round(po * 10)} pp`
    return `${Math.round(po * 100)} pc`
}

const TIPOS_ARMADURA = { leve: 'Armaduras leves', media: 'Armaduras médias', pesada: 'Armaduras pesadas', escudo: 'Escudos' }

// Armas do livro (LdJ p. 149). Alcance em metros: [normal, longo] para
// arremesso e munição. `distancia` = arma de ataque à distância (arcos,
// bestas, dardo, funda, zarabatana, rede); as de arremesso corpo-a-corpo
// (adaga, lança...) continuam sendo armas corpo-a-corpo quando arremessadas.
const ARMAS = {
    // Simples corpo-a-corpo
    'adaga': { nome: 'Adaga', cat: 'simples', preco: 2, dano: '1d4', tipo: 'perfurante', props: ['acuidade', 'leve', 'arremesso'], alcance: [6, 18], icone: 'lorc/broad-dagger' },
    'azagaia': { nome: 'Azagaia', cat: 'simples', preco: 0.5, dano: '1d6', tipo: 'perfurante', props: ['arremesso'], alcance: [9, 36], icone: 'lorc/thrown-spear' },
    'bordao': { nome: 'Bordão', cat: 'simples', preco: 0.2, dano: '1d6', tipo: 'concussão', props: ['versatil'], versatil: '1d8', icone: 'delapouite/wood-stick' },
    'clava': { nome: 'Clava', cat: 'simples', preco: 0.1, dano: '1d4', tipo: 'concussão', props: ['leve'], icone: 'delapouite/wood-club' },
    'clava-grande': { nome: 'Clava grande', cat: 'simples', preco: 0.2, dano: '1d8', tipo: 'concussão', props: ['duas-maos'], icone: 'delapouite/wood-club' },
    'foice-curta': { nome: 'Foice curta', cat: 'simples', preco: 1, dano: '1d4', tipo: 'cortante', props: ['leve'], icone: 'delapouite/sickle' },
    'lanca': { nome: 'Lança', cat: 'simples', preco: 1, dano: '1d6', tipo: 'perfurante', props: ['arremesso', 'versatil'], alcance: [6, 18], versatil: '1d8', icone: 'lorc/barbed-spear' },
    'maca': { nome: 'Maça', cat: 'simples', preco: 5, dano: '1d6', tipo: 'concussão', props: [], icone: 'delapouite/flanged-mace' },
    'machadinha': { nome: 'Machadinha', cat: 'simples', preco: 5, dano: '1d6', tipo: 'cortante', props: ['leve', 'arremesso'], alcance: [6, 18], icone: 'delapouite/hatchet' },
    'martelo-leve': { nome: 'Martelo leve', cat: 'simples', preco: 2, dano: '1d4', tipo: 'concussão', props: ['leve', 'arremesso'], alcance: [6, 18], icone: 'lorc/claw-hammer' },
    // Simples à distância
    'arco-curto': { nome: 'Arco curto', cat: 'simples', preco: 25, distancia: true, dano: '1d6', tipo: 'perfurante', props: ['municao', 'duas-maos'], alcance: [24, 96], icone: 'lorc/pocket-bow' },
    'besta-leve': { nome: 'Besta leve', cat: 'simples', preco: 25, distancia: true, dano: '1d8', tipo: 'perfurante', props: ['municao', 'recarga', 'duas-maos'], alcance: [24, 96], icone: 'carl-olsen/crossbow' },
    'dardo': { nome: 'Dardo', cat: 'simples', preco: 0.05, distancia: true, dano: '1d4', tipo: 'perfurante', props: ['acuidade', 'arremesso'], alcance: [6, 18], icone: 'delapouite/dart' },
    'funda': { nome: 'Funda', cat: 'simples', preco: 0.1, distancia: true, dano: '1d4', tipo: 'concussão', props: ['municao'], alcance: [9, 36], icone: 'delapouite/sling' },
    // Marciais corpo-a-corpo
    'alabarda': { nome: 'Alabarda', cat: 'marcial', preco: 20, dano: '1d10', tipo: 'cortante', props: ['pesada', 'alcance', 'duas-maos'], icone: 'lorc/halberd' },
    'chicote': { nome: 'Chicote', cat: 'marcial', preco: 2, dano: '1d4', tipo: 'cortante', props: ['acuidade', 'alcance'], icone: 'lorc/whip' },
    'cimitarra': { nome: 'Cimitarra', cat: 'marcial', preco: 25, dano: '1d6', tipo: 'cortante', props: ['acuidade', 'leve'], icone: 'lorc/curvy-knife' },
    'espada-curta': { nome: 'Espada curta', cat: 'marcial', preco: 10, dano: '1d6', tipo: 'perfurante', props: ['acuidade', 'leve'], icone: 'skoll/gladius' },
    'espada-grande': { nome: 'Espada grande', cat: 'marcial', preco: 50, dano: '2d6', tipo: 'cortante', props: ['pesada', 'duas-maos'], icone: 'delapouite/two-handed-sword' },
    'espada-longa': { nome: 'Espada longa', cat: 'marcial', preco: 15, dano: '1d8', tipo: 'cortante', props: ['versatil'], versatil: '1d10', icone: 'lorc/broadsword' },
    'glaive': { nome: 'Glaive', cat: 'marcial', preco: 20, dano: '1d10', tipo: 'cortante', props: ['pesada', 'alcance', 'duas-maos'], icone: 'delapouite/glaive' },
    'lanca-de-montaria': { nome: 'Lança de montaria', cat: 'marcial', preco: 10, dano: '1d12', tipo: 'perfurante', props: ['alcance', 'especial'], icone: 'lorc/spears',
        especial: 'Desvantagem contra alvo a 1,5 m; exige as duas mãos quando você não está montado.' },
    'pique': { nome: 'Pique', cat: 'marcial', preco: 5, dano: '1d10', tipo: 'perfurante', props: ['pesada', 'alcance', 'duas-maos'], icone: 'delapouite/spear-feather' },
    'maca-estrela': { nome: 'Maça estrela', cat: 'marcial', preco: 15, dano: '1d8', tipo: 'perfurante', props: [], icone: 'lorc/spiked-mace' },
    'machado-de-batalha': { nome: 'Machado de batalha', cat: 'marcial', preco: 10, dano: '1d8', tipo: 'cortante', props: ['versatil'], versatil: '1d10', icone: 'lorc/battle-axe' },
    'machado-grande': { nome: 'Machado grande', cat: 'marcial', preco: 30, dano: '1d12', tipo: 'cortante', props: ['pesada', 'duas-maos'], icone: 'delapouite/war-axe' },
    'malho': { nome: 'Malho', cat: 'marcial', preco: 10, dano: '2d6', tipo: 'concussão', props: ['pesada', 'duas-maos'], icone: 'lorc/flat-hammer' },
    'mangual': { nome: 'Mangual', cat: 'marcial', preco: 10, dano: '1d8', tipo: 'concussão', props: [], icone: 'delapouite/flail' },
    'martelo-de-guerra': { nome: 'Martelo de guerra', cat: 'marcial', preco: 15, dano: '1d8', tipo: 'concussão', props: ['versatil'], versatil: '1d10', icone: 'delapouite/warhammer' },
    'picareta-de-guerra': { nome: 'Picareta de guerra', cat: 'marcial', preco: 5, dano: '1d8', tipo: 'perfurante', props: [], icone: 'delapouite/war-pick' },
    'rapieira': { nome: 'Rapieira', cat: 'marcial', preco: 25, dano: '1d8', tipo: 'perfurante', props: ['acuidade'], icone: 'lorc/stiletto' },
    'tridente': { nome: 'Tridente', cat: 'marcial', preco: 5, dano: '1d6', tipo: 'perfurante', props: ['arremesso', 'versatil'], alcance: [6, 18], versatil: '1d8', icone: 'lorc/trident' },
    // Marciais à distância
    'arco-longo': { nome: 'Arco longo', cat: 'marcial', preco: 50, distancia: true, dano: '1d8', tipo: 'perfurante', props: ['municao', 'pesada', 'duas-maos'], alcance: [45, 180], icone: 'delapouite/bow-arrow' },
    'besta-de-mao': { nome: 'Besta de mão', cat: 'marcial', preco: 75, distancia: true, dano: '1d6', tipo: 'perfurante', props: ['municao', 'leve', 'recarga'], alcance: [9, 36], icone: 'carl-olsen/crossbow' },
    'besta-pesada': { nome: 'Besta pesada', cat: 'marcial', preco: 50, distancia: true, dano: '1d10', tipo: 'perfurante', props: ['municao', 'pesada', 'recarga', 'duas-maos'], alcance: [30, 120], icone: 'carl-olsen/crossbow' },
    'rede': { nome: 'Rede', cat: 'marcial', preco: 1, distancia: true, dano: null, tipo: '', props: ['especial', 'arremesso'], alcance: [1.5, 4.5], icone: 'lorc/fishing-net',
        especial: 'Contém uma criatura Grande ou menor (CD 10 de FOR para escapar ou 5 de dano cortante na rede). Só um ataque por ação.' },
    'zarabatana': { nome: 'Zarabatana', cat: 'marcial', preco: 10, distancia: true, dano: '1', tipo: 'perfurante', props: ['municao', 'recarga'], alcance: [7.5, 30], icone: 'delapouite/straight-pipe' },
}
const CATEGORIAS_ARMA = { simples: 'Armas simples', marcial: 'Armas marciais' }

// O golpe desarmado não é arma, mas ataca como uma: 1 + FOR de concussão
const GOLPE_DESARMADO = { nome: 'Golpe desarmado', cat: null, dano: '1', tipo: 'concussão', props: [], icone: 'lorc/fist' }

const PROPRIEDADES_ARMA = {
    'acuidade': 'Acuidade', 'leve': 'Leve', 'pesada': 'Pesada', 'duas-maos': 'Duas mãos', 'versatil': 'Versátil',
    'arremesso': 'Arremesso', 'municao': 'Munição', 'recarga': 'Recarga', 'alcance': 'Alcance', 'especial': 'Especial',
}

/** "Acuidade, leve, arremesso (6/18 m)" — as propriedades como o livro escreve. */
function textoPropriedades(a) {
    const metros = n => String(n).replace('.', ',')
    return (a.props || []).map((p, i) => {
        const nome = i === 0 ? (PROPRIEDADES_ARMA[p] || p) : (PROPRIEDADES_ARMA[p] || p).toLowerCase()
        if ((p === 'arremesso' || p === 'municao') && a.alcance) return `${nome} (${metros(a.alcance[0])}/${metros(a.alcance[1])} m)`
        if (p === 'versatil' && a.versatil) return `${nome} (${a.versatil})`
        return nome
    }).join(', ')
}

const ALINHAMENTOS = [
    { key: 'LB', nome: 'Leal e bom' }, { key: 'NB', nome: 'Neutro e bom' }, { key: 'CB', nome: 'Caótico e bom' },
    { key: 'LN', nome: 'Leal e neutro' }, { key: 'N', nome: 'Neutro' }, { key: 'CN', nome: 'Caótico e neutro' },
    { key: 'LM', nome: 'Leal e mau' }, { key: 'NM', nome: 'Neutro e mau' }, { key: 'CM', nome: 'Caótico e mau' },
]

// ══════════════════════════════════════════════════════════════════════════════
// ── Tabelas de opções (estilos, manobras, invocações...) ─────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const OPCOES = {
    'estilos-luta': [
        { id: 'arquearia', nome: 'Arquearia', desc: '+2 nas jogadas de ataque com armas à distância.' },
        { id: 'armas-grandes', nome: 'Combate com Armas Grandes', desc: 'Rola de novo 1 ou 2 no dado de dano de arma de duas mãos ou versátil empunhada com as duas.' },
        { id: 'duas-armas', nome: 'Combate com Duas Armas', desc: 'Soma o modificador de habilidade no dano do segundo ataque.' },
        { id: 'defesa', nome: 'Defesa', desc: '+1 na CA enquanto estiver usando armadura.' },
        { id: 'duelismo', nome: 'Duelismo', desc: '+2 no dano com arma corpo-a-corpo em uma mão e nenhuma outra arma.' },
        { id: 'protecao', nome: 'Proteção', desc: 'Com escudo, usa a reação para impor desvantagem num ataque contra aliado a até 1,5 m.' },
    ],
    'manobras': [
        { id: 'aparar', nome: 'Aparar', desc: 'Reação: reduz o dano de um ataque corpo-a-corpo em dado + DES.' },
        { id: 'ameacador', nome: 'Ataque Ameaçador', desc: 'Soma o dado ao dano; o alvo faz teste de SAB ou fica amedrontado.' },
        { id: 'encontrao', nome: 'Ataque de Encontrão', desc: 'Soma o dado ao dano; o alvo faz teste de FOR ou é empurrado 4,5 m.' },
        { id: 'finta', nome: 'Ataque de Finta', desc: 'Ação bônus: vantagem no próximo ataque contra o alvo, somando o dado ao dano.' },
        { id: 'manobra', nome: 'Ataque de Manobra', desc: 'Soma o dado ao dano; um aliado se move até metade do deslocamento sem provocar.' },
        { id: 'precisao', nome: 'Ataque de Precisão', desc: 'Soma o dado à jogada de ataque.' },
        { id: 'desarmante', nome: 'Ataque Desarmante', desc: 'Soma o dado ao dano; o alvo faz teste de FOR ou larga um item.' },
        { id: 'estendido', nome: 'Ataque Estendido', desc: 'Alcance +1,5 m no ataque, somando o dado ao dano.' },
        { id: 'provocante', nome: 'Ataque Provocante', desc: 'Soma o dado ao dano; o alvo faz teste de SAB ou tem desvantagem contra outros.' },
        { id: 'trespassante', nome: 'Ataque Trespassante', desc: 'Ao acertar, causa o dado de dano a outra criatura adjacente.' },
        { id: 'contra-atacar', nome: 'Contra-Atacar', desc: 'Reação: quando erram você, ataca e soma o dado ao dano.' },
        { id: 'derrubar', nome: 'Derrubar', desc: 'Soma o dado ao dano; alvo Grande ou menor faz teste de FOR ou cai.' },
        { id: 'distrativo', nome: 'Golpe Distrativo', desc: 'Soma o dado ao dano; o próximo ataque de um aliado contra o alvo tem vantagem.' },
        { id: 'comandante', nome: 'Golpe do Comandante', desc: 'Abre mão de um ataque para um aliado atacar com reação, somando o dado.' },
        { id: 'inspirar', nome: 'Inspirar', desc: 'Ação bônus: um aliado ganha PV temporários iguais ao dado + CAR.' },
        { id: 'passo-evasivo', nome: 'Passo Evasivo', desc: 'Ao se mover, soma o dado à CA até parar.' },
    ],
    'metamagias': [
        { id: 'acelerada', nome: 'Magia Acelerada', desc: '2 pontos: magia de 1 ação vira ação bônus.' },
        { id: 'aumentada', nome: 'Magia Aumentada', desc: '3 pontos: um alvo tem desvantagem no primeiro teste de resistência.' },
        { id: 'cuidadosa', nome: 'Magia Cuidadosa', desc: '1 ponto: até CAR criaturas passam automaticamente no teste da magia.' },
        { id: 'distante', nome: 'Magia Distante', desc: '1 ponto: dobra o alcance (toque vira 9 m).' },
        { id: 'duplicada', nome: 'Magia Duplicada', desc: 'Pontos = nível da magia: atinge um segundo alvo.' },
        { id: 'estendida', nome: 'Magia Estendida', desc: '1 ponto: dobra a duração, até 24 horas.' },
        { id: 'potencializada', nome: 'Magia Potencializada', desc: '1 ponto: rola de novo até CAR dados de dano.' },
        { id: 'sutil', nome: 'Magia Sutil', desc: '1 ponto: conjura sem componentes verbais nem somáticos.' },
    ],
    'invocacoes': [
        { id: 'armadura-sombras', nome: 'Armadura de Sombras', desc: 'Conjura armadura arcana em si à vontade.' },
        { id: 'correntes-carceri', nome: 'Correntes de Cárceri', desc: 'Conjura imobilizar monstro à vontade em celestiais, corruptores e elementais.', req: { nivel: 15, pacto: 'corrente' } },
        { id: 'encharcar-mente', nome: 'Encharcar a Mente', desc: 'Conjura lentidão uma vez por descanso longo.', req: { nivel: 5 } },
        { id: 'escultor-carne', nome: 'Escultor de Carne', desc: 'Conjura metamorfose uma vez por descanso longo.', req: { nivel: 7 } },
        { id: 'explosao-agonizante', nome: 'Explosão Agonizante', desc: 'Soma CAR ao dano da rajada mística.', reqTexto: 'truque rajada mística' },
        { id: 'explosao-repulsiva', nome: 'Explosão Repulsiva', desc: 'A rajada mística empurra o alvo 3 m.', reqTexto: 'truque rajada mística' },
        { id: 'idioma-bestial', nome: 'Idioma Bestial', desc: 'Conjura falar com animais à vontade.' },
        { id: 'influencia-enganadora', nome: 'Influência Enganadora', desc: 'Proficiência em Enganação e Persuasão.', concede: { pericias: ['enganacao', 'persuasao'] } },
        { id: 'lacaios-caos', nome: 'Lacaios do Caos', desc: 'Conjura conjurar elemental uma vez por descanso longo.', req: { nivel: 9 } },
        { id: 'lamina-sedenta', nome: 'Lâmina Sedenta', desc: 'Ataca duas vezes com a arma do pacto.', req: { nivel: 5, pacto: 'lamina' } },
        { id: 'lanca-mistica', nome: 'Lança Mística', desc: 'Rajada mística com alcance de 90 m.', reqTexto: 'truque rajada mística' },
        { id: 'larapio-destinos', nome: 'Larápio dos Cinco Destinos', desc: 'Conjura perdição uma vez por descanso longo.' },
        { id: 'livro-segredos', nome: 'Livro de Segredos Antigos', desc: 'Inscreve rituais no Livro das Sombras.', req: { pacto: 'tomo' } },
        { id: 'mascara-faces', nome: 'Máscara das Muitas Faces', desc: 'Conjura disfarçar-se à vontade.' },
        { id: 'mestre-formas', nome: 'Mestre das Infindáveis Formas', desc: 'Conjura alterar-se à vontade.', req: { nivel: 15 } },
        { id: 'olhar-duas-mentes', nome: 'Olhar de Duas Mentes', desc: 'Vê e ouve pelos sentidos de um humanoide voluntário.' },
        { id: 'olhos-runas', nome: 'Olhos do Guardião das Runas', desc: 'Lê qualquer escrita.' },
        { id: 'palavra-terrivel', nome: 'Palavra Terrível', desc: 'Conjura confusão uma vez por descanso longo.', req: { nivel: 7 } },
        { id: 'passo-ascendente', nome: 'Passo Ascendente', desc: 'Conjura levitação em si à vontade.', req: { nivel: 9 } },
        { id: 'salto-transcendental', nome: 'Salto Transcendental', desc: 'Conjura salto em si à vontade.', req: { nivel: 9 } },
        { id: 'sinal-agouro', nome: 'Sinal de Mau Agouro', desc: 'Conjura rogar maldição uma vez por descanso longo.', req: { nivel: 5 } },
        { id: 'sorvedor-vida', nome: 'Sorvedor de Vida', desc: 'Arma do pacto causa dano necrótico extra igual a CAR.', req: { nivel: 12, pacto: 'lamina' } },
        { id: 'sussurros-sepultura', nome: 'Sussurros da Sepultura', desc: 'Conjura falar com os mortos à vontade.', req: { nivel: 9 } },
        { id: 'sussurros-sedutores', nome: 'Sussurros Sedutores', desc: 'Conjura compulsão uma vez por descanso longo.', req: { nivel: 7 } },
        { id: 'uno-sombras', nome: 'Uno com as Sombras', desc: 'Fica invisível na penumbra ou escuridão até se mover ou agir.', req: { nivel: 5 } },
        { id: 'vigor-abissal', nome: 'Vigor Abissal', desc: 'Conjura vitalidade falsa em si à vontade, como 1º nível.' },
        { id: 'visao-bruxa', nome: 'Visão da Bruxa', desc: 'Vê a forma verdadeira de metamorfos e ilusões a 9 m.', req: { nivel: 15 } },
        { id: 'visao-diabolica', nome: 'Visão Diabólica', desc: 'Enxerga normalmente na escuridão, mágica ou não, a 36 m.' },
        { id: 'visao-mistica', nome: 'Visão Mística', desc: 'Conjura detectar magia à vontade.' },
        { id: 'visoes-reinos', nome: 'Visões de Reinos Distantes', desc: 'Conjura olho arcano à vontade.', req: { nivel: 15 } },
        { id: 'visoes-brumas', nome: 'Visões nas Brumas', desc: 'Conjura imagem silenciosa à vontade.' },
        { id: 'voz-mestre-correntes', nome: 'Voz do Mestre das Correntes', desc: 'Fala e percebe pelo familiar à distância.', req: { pacto: 'corrente' } },
    ],
    'pactos': [
        { id: 'corrente', nome: 'Pacto da Corrente', desc: 'Aprende convocar familiar, com formas especiais (diabrete, pseudodragão, quasit, sprite).' },
        { id: 'lamina', nome: 'Pacto da Lâmina', desc: 'Cria uma arma de pacto corpo-a-corpo à vontade, com proficiência nela.' },
        { id: 'tomo', nome: 'Pacto do Tomo', desc: 'Ganha o Livro das Sombras com três truques de qualquer classe.' },
    ],
    'disciplinas': [
        { id: 'investida-ventania', nome: 'Investida dos Espíritos da Ventania', desc: '2 chi: lufada de vento.' },
        { id: 'moldar-rio', nome: 'Moldar o Rio Corrente', desc: '1 chi: molda água e gelo numa área.' },
        { id: 'presas-serpente', nome: 'Presas da Serpente de Fogo', desc: '1 chi: alcance +3 m e dano de fogo nos golpes.' },
        { id: 'punho-ar', nome: 'Punho do Ar Contínuo', desc: '2 chi: rajada de ar que causa dano e empurra.' },
        { id: 'punho-trovoes', nome: 'Punho dos Quatro Trovões', desc: '2 chi: onda trovejante.' },
        { id: 'chicote-agua', nome: 'Chicote de Água', desc: '2 chi: chicote d\'água que causa dano e puxa ou derruba.' },
        { id: 'gongo-pico', nome: 'Gongo do Pico', desc: '3 chi: despedaçar.', req: { nivel: 6 } },
        { id: 'serragem-norte', nome: 'Serragem do Vento do Norte', desc: '3 chi: imobilizar pessoa.', req: { nivel: 6 } },
        { id: 'cavalgar-vento', nome: 'Cavalgar o Vento', desc: '4 chi: voo em si.', req: { nivel: 11 } },
        { id: 'chamas-fenix', nome: 'Chamas da Fénix', desc: '4 chi: bola de fogo.', req: { nivel: 11 } },
        { id: 'postura-neblina', nome: 'Postura da Neblina', desc: '4 chi: forma gasosa em si.', req: { nivel: 11 } },
        { id: 'defesa-montanha', nome: 'Defesa Eterna da Montanha', desc: '5 chi: pele de pedra em si.', req: { nivel: 17 } },
        { id: 'rio-chamas', nome: 'Rio de Chamas Famintas', desc: '5 chi: muralha de fogo.', req: { nivel: 17 } },
        { id: 'onda-pedras', nome: 'Onda de Pedras Rolantes', desc: '6 chi: muralha de pedra.', req: { nivel: 17 } },
        { id: 'sopro-inverno', nome: 'Sopro do Inverno', desc: '6 chi: cone de frio.', req: { nivel: 17 } },
    ],
    'totens': [
        { id: 'urso', nome: 'Urso', desc: 'Em fúria, resistência a todo dano, exceto psíquico.' },
        { id: 'aguia', nome: 'Águia', desc: 'Em fúria, inimigos têm desvantagem em ataques de oportunidade e pode usar Disparada como ação bônus.' },
        { id: 'lobo', nome: 'Lobo', desc: 'Em fúria, aliados têm vantagem em ataques corpo-a-corpo contra inimigos a 1,5 m de você.' },
    ],
    'aspectos-besta': [
        { id: 'urso', nome: 'Urso', desc: 'Capacidade de carga dobrada e vantagem em testes de FOR para empurrar, erguer ou quebrar.' },
        { id: 'aguia', nome: 'Águia', desc: 'Enxerga até 1,6 km com detalhes; penumbra não atrapalha a Percepção.' },
        { id: 'lobo', nome: 'Lobo', desc: 'Rastreia em ritmo rápido e se move furtivamente em ritmo normal.' },
    ],
    'sintonias-totemicas': [
        { id: 'urso', nome: 'Urso', desc: 'Em fúria, inimigos a 1,5 m têm desvantagem para atacar outros que não você.' },
        { id: 'aguia', nome: 'Águia', desc: 'Em fúria, tem deslocamento de voo igual ao de caminhada.' },
        { id: 'lobo', nome: 'Lobo', desc: 'Em fúria, ao acertar um ataque corpo-a-corpo, derruba alvo Grande ou menor (ação bônus).' },
    ],
    'ancestrais-draconicos': [
        { id: 'azul', nome: 'Azul', desc: 'Elétrico · linha de 1,5 × 9 m (DES)', dano: 'elétrico' },
        { id: 'branco', nome: 'Branco', desc: 'Frio · cone de 4,5 m (CON)', dano: 'frio' },
        { id: 'bronze', nome: 'Bronze', desc: 'Elétrico · linha de 1,5 × 9 m (DES)', dano: 'elétrico' },
        { id: 'cobre', nome: 'Cobre', desc: 'Ácido · linha de 1,5 × 9 m (DES)', dano: 'ácido' },
        { id: 'latao', nome: 'Latão', desc: 'Fogo · linha de 1,5 × 9 m (DES)', dano: 'fogo' },
        { id: 'negro', nome: 'Negro', desc: 'Ácido · linha de 1,5 × 9 m (DES)', dano: 'ácido' },
        { id: 'ouro', nome: 'Ouro', desc: 'Fogo · cone de 4,5 m (DES)', dano: 'fogo' },
        { id: 'prata', nome: 'Prata', desc: 'Frio · cone de 4,5 m (CON)', dano: 'frio' },
        { id: 'verde', nome: 'Verde', desc: 'Veneno · cone de 4,5 m (CON)', dano: 'veneno' },
        { id: 'vermelho', nome: 'Vermelho', desc: 'Fogo · cone de 4,5 m (DES)', dano: 'fogo' },
    ],
    'inimigos-favoritos': [
        { id: 'bestas', nome: 'Bestas' }, { id: 'fadas', nome: 'Fadas' }, { id: 'humanoides', nome: 'Humanoides' },
        { id: 'monstruosidades', nome: 'Monstruosidades' }, { id: 'mortos-vivos', nome: 'Mortos-vivos' },
    ],
    'inimigos-favoritos-maiores': [
        { id: 'aberracoes', nome: 'Aberrações' }, { id: 'celestiais', nome: 'Celestiais' }, { id: 'constructos', nome: 'Constructos' },
        { id: 'corruptores', nome: 'Corruptores' }, { id: 'dragoes', nome: 'Dragões' }, { id: 'elementais', nome: 'Elementais' },
        { id: 'gigantes', nome: 'Gigantes' },
    ],
    'terrenos': [
        { id: 'artico', nome: 'Ártico' }, { id: 'costa', nome: 'Costa' }, { id: 'deserto', nome: 'Deserto' },
        { id: 'floresta', nome: 'Floresta' }, { id: 'montanha', nome: 'Montanha' }, { id: 'pantano', nome: 'Pântano' },
        { id: 'planicie', nome: 'Planície' }, { id: 'subterraneo', nome: 'Subterrâneo' },
    ],
    'presas-cacador': [
        { id: 'colossos', nome: 'Assassino de Colossos', desc: '+1d8 de dano, uma vez por turno, em criatura abaixo do máximo de PV.' },
        { id: 'gigantes', nome: 'Matador de Gigantes', desc: 'Reação: ataca criatura Grande ou maior que atacou você.' },
        { id: 'hordas', nome: 'Destruidor de Hordas', desc: 'Uma vez por turno, ataque extra contra outra criatura a 1,5 m do alvo.' },
    ],
    'taticas-defensivas': [
        { id: 'escapar-horda', nome: 'Escapar da Horda', desc: 'Ataques de oportunidade contra você têm desvantagem.' },
        { id: 'multiplos-ataques', nome: 'Defesa Contra Múltiplos Ataques', desc: '+4 na CA contra os ataques seguintes de quem acertou você neste turno.' },
        { id: 'vontade-aco', nome: 'Vontade de Aço', desc: 'Vantagem em testes de resistência contra ser amedrontado.' },
    ],
    'ataques-multiplos': [
        { id: 'saraivada', nome: 'Saraivada', desc: 'Ação: ataque à distância contra todos a até 3 m de um ponto.' },
        { id: 'giratorio', nome: 'Ataque Giratório', desc: 'Ação: ataque corpo-a-corpo contra todos a 1,5 m.' },
    ],
    'defesas-cacador': [
        { id: 'evasao', nome: 'Evasão', desc: 'Sem dano ao passar em testes de DES para metade; metade ao falhar.' },
        { id: 'contra-mare', nome: 'Manter-se Contra a Maré', desc: 'Reação: quem errou você repete o ataque em outra criatura.' },
        { id: 'esquiva', nome: 'Esquiva Sobrenatural', desc: 'Reação: reduz à metade o dano de um ataque que você vê.' },
    ],
    'tipos-dano-elemental': [
        { id: 'acido', nome: 'Ácido' }, { id: 'eletrico', nome: 'Elétrico' }, { id: 'fogo', nome: 'Fogo' },
        { id: 'frio', nome: 'Frio' }, { id: 'trovao', nome: 'Trovão' },
    ],
    'classes-iniciado': [
        { id: 'bardo', nome: 'Bardo' }, { id: 'bruxo', nome: 'Bruxo' }, { id: 'clerigo', nome: 'Clérigo' },
        { id: 'druida', nome: 'Druida' }, { id: 'feiticeiro', nome: 'Feiticeiro' }, { id: 'mago', nome: 'Mago' },
    ],
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RAÇAS (cap. 2) ───────────────────────────────────────────────────────────
// Deslocamento em metros, como no livro.
// ══════════════════════════════════════════════════════════════════════════════

const RACAS = {
    'anao': {
        nome: 'Anão', pag: 18, tamanho: 'Médio', deslocamento: 7.5, pesadaSemPenalidade: true,
        resumo: 'Resistentes e tradicionais, com visão no escuro e resistência a veneno.',
        concede: {
            atributos: { con: 2 }, visaoEscuro: 18, resistenciasDano: ['veneno'],
            armas: ['machado-de-batalha', 'machadinha', 'martelo-leve', 'martelo-de-guerra'],
            idiomas: ['Comum', 'Anão'],
        },
        escolhas: [{ id: 'ferramenta', rotulo: 'Ferramenta de artesão', tipo: 'ferramenta', qtd: 1, de: ['Ferramentas de ferreiro', 'Suprimentos de cervejeiro', 'Ferramentas de pedreiro'] }],
        tracos: [
            { nome: 'Visão no Escuro', desc: 'Enxerga a 18 m no escuro como se fosse penumbra.' },
            { nome: 'Resiliência Anã', desc: 'Vantagem em testes de resistência contra veneno e resistência a dano de veneno.' },
            { nome: 'Treinamento Anão em Combate', desc: 'Proficiência com machado de batalha, machadinha, martelo leve e martelo de guerra.' },
            { nome: 'Especialização em Rochas', desc: 'Dobra a proficiência em testes de História sobre trabalhos em pedra.' },
            { nome: 'Deslocamento', desc: 'Armadura pesada não reduz seu deslocamento.' },
        ],
        subracas: {
            'anao-colina': {
                nome: 'Anão da Colina', concede: { atributos: { sab: 1 }, pvPorNivel: 1 },
                tracos: [{ nome: 'Tenacidade Anã', desc: '+1 PV máximo por nível.' }],
            },
            'anao-montanha': {
                nome: 'Anão da Montanha', concede: { atributos: { for: 2 }, armaduras: ['leve', 'media'] },
                tracos: [{ nome: 'Treinamento Anão com Armaduras', desc: 'Proficiência com armaduras leves e médias.' }],
            },
        },
    },

    'elfo': {
        nome: 'Elfo', pag: 21, tamanho: 'Médio', deslocamento: 9,
        resumo: 'Graciosos e longevos, com sentidos aguçados e imunes a sono mágico.',
        concede: { atributos: { des: 2 }, visaoEscuro: 18, pericias: ['percepcao'], idiomas: ['Comum', 'Élfico'] },
        tracos: [
            { nome: 'Visão no Escuro', desc: 'Enxerga a 18 m no escuro como se fosse penumbra.' },
            { nome: 'Sentidos Aguçados', desc: 'Proficiência em Percepção.' },
            { nome: 'Ancestral Feérico', desc: 'Vantagem contra ser enfeitiçado; magia não faz você dormir.' },
            { nome: 'Transe', desc: 'Medita 4 horas em vez de dormir 8.' },
        ],
        subracas: {
            'alto-elfo': {
                nome: 'Alto Elfo', concede: { atributos: { int: 1 }, armas: ['espada-longa', 'espada-curta', 'arco-curto', 'arco-longo'] },
                escolhas: [
                    { id: 'idioma', rotulo: 'Idioma adicional', tipo: 'idioma', qtd: 1 },
                    { id: 'truque', rotulo: 'Truque de mago (Alto Elfo)', tipo: 'magia', qtd: 1, lista: 'mago', nivelMin: 0, nivelMax: 0, atributo: 'int' },
                ],
                tracos: [
                    { nome: 'Treinamento Élfico com Armas', desc: 'Proficiência com espada longa, espada curta, arco curto e arco longo.' },
                    { nome: 'Truque', desc: 'Conhece um truque da lista de mago, conjurado com Inteligência.' },
                    { nome: 'Idioma Adicional', desc: 'Um idioma a mais, à escolha.' },
                ],
            },
            'elfo-floresta': {
                nome: 'Elfo da Floresta', deslocamento: 10.5,
                concede: { atributos: { sab: 1 }, armas: ['espada-longa', 'espada-curta', 'arco-curto', 'arco-longo'] },
                tracos: [
                    { nome: 'Treinamento Élfico com Armas', desc: 'Proficiência com espada longa, espada curta, arco curto e arco longo.' },
                    { nome: 'Pés Ligeiros', desc: 'Deslocamento de 10,5 m.' },
                    { nome: 'Máscara da Natureza', desc: 'Pode se esconder levemente obscurecido por fenômenos naturais.' },
                ],
            },
            'elfo-negro': {
                nome: 'Elfo Negro (Drow)', concede: { atributos: { car: 1 }, visaoEscuro: 36, armas: ['rapieira', 'espada-curta', 'besta-de-mao'] },
                magias: [
                    { id: 'globos-de-luz', nivel: 1, atributo: 'car' },
                    { id: 'fogo-das-fadas', nivel: 3, atributo: 'car', usos: '1 vez por descanso longo' },
                    { id: 'escuridao', nivel: 5, atributo: 'car', usos: '1 vez por descanso longo' },
                ],
                tracos: [
                    { nome: 'Visão no Escuro Superior', desc: 'Visão no escuro de 36 m.' },
                    { nome: 'Sensibilidade à Luz Solar', desc: 'Desvantagem em ataques e Percepção pela visão sob luz solar direta.' },
                    { nome: 'Magia Drow', desc: 'Globos de luz; fogo das fadas no 3º nível; escuridão no 5º (CAR).' },
                    { nome: 'Treinamento Drow com Armas', desc: 'Proficiência com rapieira, espada curta e besta de mão.' },
                ],
            },
        },
    },

    'halfling': {
        nome: 'Halfling', pag: 26, tamanho: 'Pequeno', deslocamento: 7.5,
        resumo: 'Pequenos e sortudos, difíceis de amedrontar.',
        concede: { atributos: { des: 2 }, idiomas: ['Comum', 'Halfling'] },
        tracos: [
            { nome: 'Sortudo', desc: 'Rola de novo um 1 natural em ataque, teste de habilidade ou de resistência.' },
            { nome: 'Bravura', desc: 'Vantagem contra ser amedrontado.' },
            { nome: 'Agilidade Halfling', desc: 'Atravessa o espaço de criaturas maiores que você.' },
        ],
        subracas: {
            'pes-leves': {
                nome: 'Pés Leves', concede: { atributos: { car: 1 } },
                tracos: [{ nome: 'Furtividade Natural', desc: 'Pode se esconder atrás de uma criatura maior que você.' }],
            },
            'robusto': {
                nome: 'Robusto', concede: { atributos: { con: 1 }, resistenciasDano: ['veneno'] },
                tracos: [{ nome: 'Resiliência dos Robustos', desc: 'Vantagem contra veneno e resistência a dano de veneno.' }],
            },
        },
    },

    'humano': {
        nome: 'Humano', pag: 29, tamanho: 'Médio', deslocamento: 9,
        resumo: 'Versáteis: +1 em todos os atributos.',
        concede: { atributos: { for: 1, des: 1, con: 1, int: 1, sab: 1, car: 1 }, idiomas: ['Comum'] },
        escolhas: [{ id: 'idioma', rotulo: 'Idioma adicional', tipo: 'idioma', qtd: 1 }],
        tracos: [{ nome: 'Versatilidade', desc: '+1 em todos os valores de habilidade.' }],
    },

    'draconato': {
        nome: 'Draconato', pag: 32, tamanho: 'Médio', deslocamento: 9,
        resumo: 'Descendentes de dragões, com arma de sopro e resistência elemental.',
        concede: { atributos: { for: 2, car: 1 }, idiomas: ['Comum', 'Dracônico'] },
        escolhas: [{ id: 'ancestral', rotulo: 'Ancestral dracônico', tipo: 'opcao', qtd: 1, fonte: 'ancestrais-draconicos' }],
        tracos: [
            { nome: 'Ancestral Dracônico', desc: 'Define o tipo de dano do sopro e da resistência.' },
            { nome: 'Arma de Sopro', desc: 'Ação: 2d6 na área do ancestral (3d6 no 6º, 4d6 no 11º, 5d6 no 16º). CD 8 + CON + proficiência. 1 vez por descanso curto ou longo.' },
            { nome: 'Resistência a Dano', desc: 'Resistência ao tipo de dano do ancestral.' },
        ],
    },

    'gnomo': {
        nome: 'Gnomo', pag: 35, tamanho: 'Pequeno', deslocamento: 7.5,
        resumo: 'Curiosos e engenhosos, com mente resistente à magia.',
        concede: { atributos: { int: 2 }, visaoEscuro: 18, idiomas: ['Comum', 'Gnômico'] },
        tracos: [
            { nome: 'Visão no Escuro', desc: 'Enxerga a 18 m no escuro como se fosse penumbra.' },
            { nome: 'Esperteza Gnômica', desc: 'Vantagem em testes de INT, SAB e CAR contra magia.' },
        ],
        subracas: {
            'gnomo-floresta': {
                nome: 'Gnomo da Floresta', concede: { atributos: { des: 1 } },
                magias: [{ id: 'ilusao-menor', nivel: 1, atributo: 'int' }],
                tracos: [
                    { nome: 'Ilusionista Nato', desc: 'Conhece o truque ilusão menor (INT).' },
                    { nome: 'Falar com Bestas Pequenas', desc: 'Comunica ideias simples a bestas Pequenas ou menores.' },
                ],
            },
            'gnomo-rochas': {
                nome: 'Gnomo das Rochas', concede: { atributos: { con: 1 }, ferramentas: ['Ferramentas de funileiro'] },
                tracos: [
                    { nome: 'Conhecimento de Artífice', desc: 'Dobra a proficiência em História sobre itens mágicos, alquímicos ou tecnológicos.' },
                    { nome: 'Engenhoqueiro', desc: 'Proficiência com ferramentas de funileiro; constrói pequenos mecanismos.' },
                ],
            },
        },
    },

    'meio-elfo': {
        nome: 'Meio-Elfo', pag: 38, tamanho: 'Médio', deslocamento: 9,
        resumo: 'Entre dois mundos: carismáticos e versáteis em perícias.',
        concede: { atributos: { car: 2 }, visaoEscuro: 18, idiomas: ['Comum', 'Élfico'] },
        escolhas: [
            { id: 'atributos', rotulo: '+1 em dois atributos', tipo: 'atributo', qtd: 2, de: ['for', 'des', 'con', 'int', 'sab'] },
            { id: 'pericias', rotulo: 'Versatilidade em Perícia', tipo: 'pericia', qtd: 2 },
            { id: 'idioma', rotulo: 'Idioma adicional', tipo: 'idioma', qtd: 1 },
        ],
        tracos: [
            { nome: 'Visão no Escuro', desc: 'Enxerga a 18 m no escuro como se fosse penumbra.' },
            { nome: 'Ancestral Feérico', desc: 'Vantagem contra ser enfeitiçado; magia não faz você dormir.' },
            { nome: 'Versatilidade em Perícia', desc: 'Proficiência em duas perícias à escolha.' },
        ],
    },

    'meio-orc': {
        nome: 'Meio-Orc', pag: 40, tamanho: 'Médio', deslocamento: 9,
        resumo: 'Fortes e implacáveis: aguentam de pé quando deveriam cair.',
        concede: { atributos: { for: 2, con: 1 }, visaoEscuro: 18, pericias: ['intimidacao'], idiomas: ['Comum', 'Orc'] },
        tracos: [
            { nome: 'Visão no Escuro', desc: 'Enxerga a 18 m no escuro como se fosse penumbra.' },
            { nome: 'Ameaçador', desc: 'Proficiência em Intimidação.' },
            { nome: 'Resistência Implacável', desc: 'Ao cair a 0 PV sem morrer, fica com 1 PV. 1 vez por descanso longo.' },
            { nome: 'Ataques Selvagens', desc: 'No crítico corpo-a-corpo, rola mais um dado de dano da arma.' },
        ],
    },

    'tiefling': {
        nome: 'Tiefling', pag: 42, tamanho: 'Médio', deslocamento: 9,
        resumo: 'Marcados por uma linhagem infernal, com magia inata e resistência ao fogo.',
        concede: { atributos: { int: 1, car: 2 }, visaoEscuro: 18, resistenciasDano: ['fogo'], idiomas: ['Comum', 'Infernal'] },
        magias: [
            { id: 'taumaturgia', nivel: 1, atributo: 'car' },
            { id: 'repreensao-infernal', nivel: 3, atributo: 'car', usos: '1 vez por descanso longo, como 2º nível' },
            { id: 'escuridao', nivel: 5, atributo: 'car', usos: '1 vez por descanso longo' },
        ],
        tracos: [
            { nome: 'Visão no Escuro', desc: 'Enxerga a 18 m no escuro como se fosse penumbra.' },
            { nome: 'Resistência Infernal', desc: 'Resistência a dano de fogo.' },
            { nome: 'Legado Infernal', desc: 'Taumaturgia; repreensão infernal no 3º nível; escuridão no 5º (CAR).' },
        ],
    },
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ANTECEDENTES (cap. 4) ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const ANTECEDENTES = {
    'acolito': {
        nome: 'Acólito', pag: 129, concede: { pericias: ['intuicao', 'religiao'] },
        escolhas: [{ id: 'idiomas', rotulo: 'Idiomas', tipo: 'idioma', qtd: 2 }],
        caracteristica: { nome: 'Abrigo dos Fiéis', desc: 'Templos da sua fé dão abrigo, cura e apoio a você e ao grupo.' },
    },
    'artesao-guilda': {
        nome: 'Artesão de Guilda', pag: 130, concede: { pericias: ['intuicao', 'persuasao'] },
        escolhas: [
            { id: 'ferramenta', rotulo: 'Ferramenta de artesão', tipo: 'ferramenta', qtd: 1, de: FERRAMENTAS.artesao },
            { id: 'idioma', rotulo: 'Idioma', tipo: 'idioma', qtd: 1 },
        ],
        caracteristica: { nome: 'Associados da Guilda', desc: 'A guilda oferece hospedagem, apoio legal e contatos.' },
    },
    'artista': {
        nome: 'Artista', pag: 131, concede: { pericias: ['acrobacia', 'atuacao'], ferramentas: ['Kit de disfarce'] },
        escolhas: [{ id: 'instrumento', rotulo: 'Instrumento musical', tipo: 'ferramenta', qtd: 1, de: FERRAMENTAS.instrumentos }],
        caracteristica: { nome: 'Pela Demanda Popular', desc: 'Sempre encontra lugar para se apresentar em troca de cama e comida.' },
    },
    'charlatao': {
        nome: 'Charlatão', pag: 133, concede: { pericias: ['enganacao', 'prestidigitacao'], ferramentas: ['Kit de disfarce', 'Kit de falsificação'] },
        caracteristica: { nome: 'Identidade Falsa', desc: 'Tem uma segunda identidade com documentos e conhecidos.' },
    },
    'criminoso': {
        nome: 'Criminoso', pag: 134, concede: { pericias: ['enganacao', 'furtividade'], ferramentas: ['Ferramentas de ladrão'] },
        escolhas: [{ id: 'jogo', rotulo: 'Kit de jogo', tipo: 'ferramenta', qtd: 1, de: FERRAMENTAS.jogos }],
        caracteristica: { nome: 'Contato Criminal', desc: 'Tem um contato confiável na rede criminosa.' },
    },
    'eremita': {
        nome: 'Eremita', pag: 135, concede: { pericias: ['medicina', 'religiao'], ferramentas: ['Kit de herbalismo'] },
        escolhas: [{ id: 'idioma', rotulo: 'Idioma', tipo: 'idioma', qtd: 1 }],
        caracteristica: { nome: 'Descoberta', desc: 'Guarda uma descoberta única feita no isolamento; o mestre define qual.' },
    },
    'forasteiro': {
        nome: 'Forasteiro', pag: 136, concede: { pericias: ['atletismo', 'sobrevivencia'] },
        escolhas: [
            { id: 'instrumento', rotulo: 'Instrumento musical', tipo: 'ferramenta', qtd: 1, de: FERRAMENTAS.instrumentos },
            { id: 'idioma', rotulo: 'Idioma', tipo: 'idioma', qtd: 1 },
        ],
        caracteristica: { nome: 'Andarilho', desc: 'Memória excelente para mapas e acha comida e água para até seis pessoas.' },
    },
    'heroi-povo': {
        nome: 'Herói do Povo', pag: 137, concede: { pericias: ['adestrar', 'sobrevivencia'], ferramentas: ['Veículos (terrestres)'] },
        escolhas: [{ id: 'ferramenta', rotulo: 'Ferramenta de artesão', tipo: 'ferramenta', qtd: 1, de: FERRAMENTAS.artesao }],
        caracteristica: { nome: 'Hospitalidade Rústica', desc: 'Gente comum abriga e esconde você.' },
    },
    'marinheiro': {
        nome: 'Marinheiro', pag: 138, concede: { pericias: ['atletismo', 'percepcao'], ferramentas: ['Ferramentas de navegador', 'Veículos (aquáticos)'] },
        caracteristica: { nome: 'Passagem de Navio', desc: 'Consegue viagem de graça em navios, em troca de trabalho.' },
    },
    'nobre': {
        nome: 'Nobre', pag: 139, concede: { pericias: ['historia', 'persuasao'] },
        escolhas: [
            { id: 'jogo', rotulo: 'Kit de jogo', tipo: 'ferramenta', qtd: 1, de: FERRAMENTAS.jogos },
            { id: 'idioma', rotulo: 'Idioma', tipo: 'idioma', qtd: 1 },
        ],
        caracteristica: { nome: 'Posição Privilegiada', desc: 'É bem recebido na alta sociedade e consegue audiências.' },
    },
    'orfao': {
        nome: 'Órfão', pag: 140, concede: { pericias: ['furtividade', 'prestidigitacao'], ferramentas: ['Kit de disfarce', 'Ferramentas de ladrão'] },
        caracteristica: { nome: 'Segredos da Cidade', desc: 'Conhece passagens secretas e atravessa a cidade com o dobro da velocidade.' },
    },
    'sabio': {
        nome: 'Sábio', pag: 141, concede: { pericias: ['arcanismo', 'historia'] },
        escolhas: [{ id: 'idiomas', rotulo: 'Idiomas', tipo: 'idioma', qtd: 2 }],
        caracteristica: { nome: 'Pesquisador', desc: 'Sabe onde e com quem encontrar uma informação que não conhece.' },
    },
    'soldado': {
        nome: 'Soldado', pag: 142, concede: { pericias: ['atletismo', 'intimidacao'], ferramentas: ['Veículos (terrestres)'] },
        escolhas: [{ id: 'jogo', rotulo: 'Kit de jogo', tipo: 'ferramenta', qtd: 1, de: FERRAMENTAS.jogos }],
        caracteristica: { nome: 'Patente Militar', desc: 'Soldados leais à sua antiga organização reconhecem sua patente.' },
    },
}

// Talentos e magias não ficam aqui: vêm do Supabase (tabelas dnd_talentos e
// dnd_magias), com cópia local em src/dados/. Ver dndConteudo.js.

// Equipamento de cada antecedente (LdJ cap. 4). Só o bordão do forasteiro e a
// malagueta (clava) do marinheiro são armas; o resto vai para os itens.
const EQUIPAMENTO_ANTECEDENTE = {
    'acolito': { itens: ['Símbolo sagrado', 'Livro de preces ou conta de orações', '5 varetas de incenso', 'Vestimentas', 'Roupas comuns', 'Algibeira com 15 po'] },
    'artesao-guilda': { itens: ['Ferramentas de artesão', 'Carta de apresentação da guilda', 'Roupas de viajante', 'Algibeira com 15 po'] },
    'artista': { itens: ['Instrumento musical', 'Presente de um admirador', 'Traje', 'Algibeira com 15 po'] },
    'charlatao': { itens: ['Roupas finas', 'Kit de disfarce', 'Ferramentas de trapaça', 'Algibeira com 15 po'] },
    'criminoso': { itens: ['Pé de cabra', 'Roupas escuras com capuz', 'Algibeira com 15 po'] },
    'eremita': { itens: ['Estojo de pergaminho com notas', 'Cobertor de inverno', 'Roupas comuns', 'Kit de herbalismo', '5 po'] },
    'forasteiro': { armas: ['bordao'], itens: ['Armadilha de caça', 'Fetiche de um animal abatido', 'Roupas de viajante', 'Algibeira com 10 po'] },
    'heroi-povo': { itens: ['Ferramentas de artesão', 'Pá', 'Pote de ferro', 'Roupas comuns', 'Algibeira com 10 po'] },
    'marinheiro': { armas: ['clava'], itens: ['15 m de corda de seda', 'Amuleto da sorte', 'Trajes comuns', 'Algibeira com 10 po'] },
    'nobre': { itens: ['Trajes finos', 'Anel de sinete', 'Pergaminho de linhagem', 'Algibeira com 25 po'] },
    'orfao': { itens: ['Faca pequena', 'Mapa da cidade natal', 'Rato de estimação', 'Lembrança dos pais', 'Roupas comuns', 'Algibeira com 10 po'] },
    'sabio': { itens: ['Vidro de tinta escura', 'Pena', 'Faca pequena', 'Carta de um colega falecido', 'Roupas comuns', 'Algibeira com 10 po'] },
    'soldado': { itens: ['Insígnia de patente', 'Troféu de um inimigo caído', 'Dados de osso ou baralho', 'Roupas comuns', 'Algibeira com 10 po'] },
}

// Condições (LdJ, Apêndice A), com resumo próprio. `efeitos` é o que o app
// aplica sozinho nas rolagens; o resto fica para a mesa.
//   ataque / testes: 'vantagem' | 'desvantagem' nas jogadas do próprio personagem
//   contra: o que os ataques CONTRA ele ganham
//   falhaRes: resistências que falham sozinhas · semAcoes · parado (deslocamento 0)
const CONDICOES = {
    'agarrado': { nome: 'Agarrado', icone: '✊', resumo: 'Deslocamento 0 até se soltar.', efeitos: { parado: true } },
    'amedrontado': { nome: 'Amedrontado', icone: '😨', resumo: 'Desvantagem em testes e ataques enquanto vê a fonte do medo; não se aproxima dela.', efeitos: { ataque: 'desvantagem', testes: 'desvantagem' } },
    'atordoado': { nome: 'Atordoado', icone: '💫', resumo: 'Incapacitado, não se move, fala mal; falha em resistências de FOR e DES; ataques contra ele têm vantagem.', efeitos: { semAcoes: true, parado: true, falhaRes: ['for', 'des'], contra: 'vantagem' } },
    'caido': { nome: 'Caído', icone: '⤵', resumo: 'Só rasteja; desvantagem nos ataques. Ataques a 1,5 m contra ele têm vantagem; de longe, desvantagem.', efeitos: { ataque: 'desvantagem' } },
    'cego': { nome: 'Cego', icone: '🙈', resumo: 'Falha no que depende de visão; desvantagem nos ataques; ataques contra ele têm vantagem.', efeitos: { ataque: 'desvantagem', contra: 'vantagem' } },
    'enfeiticado': { nome: 'Enfeitiçado', icone: '💘', resumo: 'Não ataca quem o enfeitiçou; essa criatura tem vantagem em interações sociais com ele.', efeitos: {} },
    'envenenado': { nome: 'Envenenado', icone: '🤢', resumo: 'Desvantagem em ataques e testes de habilidade.', efeitos: { ataque: 'desvantagem', testes: 'desvantagem' } },
    'impedido': { nome: 'Impedido', icone: '⛓', resumo: 'Deslocamento 0; desvantagem nos ataques e em resistências de DES; ataques contra ele têm vantagem.', efeitos: { parado: true, ataque: 'desvantagem', desvRes: ['des'], contra: 'vantagem' } },
    'incapacitado': { nome: 'Incapacitado', icone: '🚫', resumo: 'Não faz ações nem reações.', efeitos: { semAcoes: true } },
    'inconsciente': { nome: 'Inconsciente', icone: '💤', resumo: 'Incapacitado, caído e sem perceber nada; falha em resistências de FOR e DES; ataques contra ele têm vantagem e, a 1,5 m, são críticos.', efeitos: { semAcoes: true, parado: true, falhaRes: ['for', 'des'], contra: 'vantagem' } },
    'invisivel': { nome: 'Invisível', icone: '👻', resumo: 'Vantagem nos ataques; ataques contra ele têm desvantagem.', efeitos: { ataque: 'vantagem', contra: 'desvantagem' } },
    'paralisado': { nome: 'Paralisado', icone: '🧊', resumo: 'Incapacitado e imóvel; falha em resistências de FOR e DES; ataques contra ele têm vantagem e, a 1,5 m, são críticos.', efeitos: { semAcoes: true, parado: true, falhaRes: ['for', 'des'], contra: 'vantagem' } },
    'petrificado': { nome: 'Petrificado', icone: '🗿', resumo: 'Vira pedra: incapacitado, falha em FOR e DES, resistência a todo dano, imune a veneno e doença.', efeitos: { semAcoes: true, parado: true, falhaRes: ['for', 'des'], contra: 'vantagem', resisteTudo: true } },
    'surdo': { nome: 'Surdo', icone: '🙉', resumo: 'Não ouve; falha no que depende de audição.', efeitos: {} },
}

// Exaustão: os efeitos se acumulam a cada nível (LdJ, Apêndice A)
const EXAUSTAO = [
    null,
    'Desvantagem em testes de habilidade',
    'Deslocamento pela metade',
    'Desvantagem em ataques e testes de resistência',
    'PV máximos pela metade',
    'Deslocamento 0',
    'Morte',
]

// Tipos de dano do livro, para o mestre escolher ao aplicar dano
// Tipos de dano do livro (LdJ p. 198; o de força se chama "energia")
const TIPOS_DANO = ['ácido', 'concussão', 'cortante', 'elétrico', 'energia', 'fogo', 'frio', 'necrótico', 'perfurante', 'psíquico', 'radiante', 'trovejante', 'veneno']

// ══════════════════════════════════════════════════════════════════════════════
// ── Efeitos em aliados e marcas em criaturas (LdJ, magias e classes) ─────────
// ══════════════════════════════════════════════════════════════════════════════
// O efeito fica na ficha de quem recebe (stats.efeitos_recebidos; ver
// dndEfeitos.js). O motor lê daqui:
//   guardado  — contextos do d20 em que o dado guardado pode entrar (1 uso)
//   fixo      — dado que soma sozinho nesses contextos (Bênção)
//   ca, desloc (multiplica), pv(nível), vantagemRes, imune, armaBonus(nível)
//   minutos   — duração do livro (até 1 minuto conta em rodadas na batalha)
//   conc      — acaba com a concentração de quem conjurou
//   alvos(nível), si (pode ser em si mesmo), magia (id da magia que cria)
const EFEITOS = {
    'inspiracao-bardo': { nome: 'Inspiração de Bardo', icone: '🎵', guardado: ['ataque', 'resistencia', 'pericia', 'atributo', 'iniciativa'], minutos: 10, alvos: () => 1, si: false,
        desc: 'Soma o dado a um teste, ataque ou resistência, depois de ver o d20.' },
    'orientacao': { nome: 'Orientação', icone: '🧭', guardado: ['pericia', 'atributo', 'iniciativa'], dado: 'd4', minutos: 1, conc: true, magia: 'orientacao', alvos: () => 1, si: true,
        desc: 'Soma 1d4 a um teste de habilidade, depois de ver o d20.' },
    'resistencia': { nome: 'Resistência', icone: '🪨', guardado: ['resistencia'], dado: 'd4', minutos: 1, conc: true, magia: 'resistencia', alvos: () => 1, si: true,
        desc: 'Soma 1d4 a um teste de resistência, depois de ver o d20.' },
    'bencao': { nome: 'Bênção', icone: '✨', fixo: { contextos: ['ataque', 'resistencia'], expressao: '1d4' }, minutos: 1, conc: true, magia: 'bencao', alvos: n => 3 + Math.max(0, n - 1), si: true,
        desc: '+1d4 nas jogadas de ataque e nos testes de resistência.' },
    'escudo-da-fe': { nome: 'Escudo da Fé', icone: '🛡', ca: 2, minutos: 10, conc: true, magia: 'escudo-da-fe', alvos: () => 1, si: true,
        desc: '+2 na CA.' },
    'ajuda': { nome: 'Ajuda', icone: '❤', pv: n => 5 * Math.max(1, n - 1), minutos: 480, magia: 'ajuda', alvos: () => 3, si: true,
        desc: '+5 PV máximos e atuais (mais 5 por nível acima do 2º).' },
    'heroismo': { nome: 'Heroísmo', icone: '🦁', imune: ['amedrontado'], pvTempNoTurno: true, minutos: 1, conc: true, magia: 'heroismo', alvos: n => n, si: true,
        desc: 'Imune a amedrontado; no começo de cada turno, PV temporários iguais ao atributo de magia de quem conjurou.' },
    'velocidade': { nome: 'Velocidade', icone: '⚡', ca: 2, desloc: 2, vantagemRes: ['des'], minutos: 1, conc: true, magia: 'velocidade', alvos: () => 1, si: true,
        desc: '+2 na CA, deslocamento dobrado, vantagem em resistências de DES e uma ação a mais (só Atacar uma vez, Disparada, Desengajar, Esconder ou Usar objeto). Ao acabar, fica um turno sem agir.' },
    'arma-magica': { nome: 'Arma Mágica', icone: '🗡', armaBonus: n => (n >= 6 ? 3 : n >= 4 ? 2 : 1), minutos: 60, conc: true, magia: 'arma-magica', alvos: () => 1, si: true, comArma: true,
        desc: 'A arma vira mágica e soma o bônus no ataque e no dano.' },
    'auxilio-divino': { nome: 'Auxílio Divino', icone: '☀', danoArma: { dados: '1d4', tipo: 'radiante' }, minutos: 1, conc: true, magia: 'auxilio-divino', alvos: () => 1, soEmSi: true,
        desc: '+1d4 radiante em cada acerto com arma.' },
    'bencao-trapaceiro': { nome: 'Bênção do Trapaceiro', icone: '🎭', vantagemPericia: ['furtividade'], minutos: 60, alvos: () => 1, si: false,
        desc: 'Vantagem em testes de Destreza (Furtividade).' },
    'cancao-descanso': { nome: 'Canção de Descanso', icone: '🎶', guardado: ['dados-vida'], minutos: 60, alvos: () => 99, si: true,
        desc: 'No descanso curto, quem gastar Dados de Vida recupera o dado da canção a mais (uma vez).' },
    'aura-protecao': { nome: 'Aura de Proteção', icone: '🔆', aura: true,
        desc: 'Soma o Carisma do paladino nos testes de resistência (a até 3 m dele).' },
    'aura-coragem': { nome: 'Aura de Coragem', icone: '🦁', imune: ['amedrontado'], aura: true,
        desc: 'Não pode ser amedrontado (a até 3 m do paladino).' },
}

// Magias de destruição: conjurar deixa o golpe pronto (stats.efeitos.destruicao)
// e o dano entra no PRÓXIMO acerto, dobrando no crítico. corpo: só corpo-a-corpo
// (as outras valem com qualquer arma); semDano: o efeito é só o teste.
const DESTRUICOES = {
    'destruicao-colerica': { corpo: true, efeito: 'ou fica amedrontado' },
    'destruicao-lancinante': { corpo: true, efeito: 'pega fogo: 1d6 de fogo no começo de cada turno dele até passar' },
    'destruicao-trovejante': { corpo: true, efeito: 'ou é empurrado 3 m e fica caído' },
    'destruicao-cegante': { corpo: true, efeito: 'ou fica cego' },
    'destruicao-estonteante': { corpo: true, efeito: 'ou fica com desvantagem em ataques e testes e sem reações até o fim do próximo turno dele' },
    'destruicao-banidora': { corpo: false, efeito: 'se ficar com 50 PV ou menos, é banido' },
    'marca-da-punicao': { corpo: false, efeito: 'brilha: não fica invisível e ilumina 1,5 m' },
    'golpe-constritor': { corpo: false, semDano: true, efeito: 'ou fica impedido pelas vinhas: 1d6 perfurante no começo de cada turno dele' },
}

// Surto de Magia Selvagem (LdJ, feiticeiro): [até no d100, efeito resumido, o que o
// app faz sozinho]. Resumos com palavras nossas; o livro tem o texto completo.
const SURTO_SELVAGEM = [
    [2, 'Por 1 minuto, rola nesta tabela no começo de cada turno seu (ignorando este resultado).'],
    [4, 'Por 1 minuto, enxerga as criaturas invisíveis que estiverem à vista.'],
    [6, 'Um modron do mestre surge a 1,5 m e some depois de 1 minuto.'],
    [8, 'Conjura bola de fogo (3º nível) centrada em você.', { dano: '8d6', tipo: 'fogo', res: 'des' }],
    [10, 'Conjura mísseis mágicos de 5º nível (7 dardos).', { dano: '7d4+7', tipo: 'energia' }],
    [12, 'Rola 1d10: a altura muda 3 cm por ponto (ímpar encolhe, par cresce).'],
    [14, 'Conjura confusão centrada em você.'],
    [16, 'Por 1 minuto, recupera 5 PV no começo de cada turno seu.'],
    [18, 'Cresce uma barba de penas, que explode no próximo espirro.'],
    [20, 'Conjura área escorregadia centrada em você.'],
    [22, 'A próxima magia com teste de resistência (no próximo minuto) dá desvantagem nesse teste.'],
    [24, 'A pele fica azul vibrante (remover maldição desfaz).'],
    [26, 'Um olho na nuca por 1 minuto: vantagem em Percepção que dependa da visão.'],
    [28, 'Por 1 minuto, magias de 1 ação podem ser conjuradas com a ação bônus.'],
    [30, 'Teleporta até 18 m para um lugar desocupado à vista.'],
    [32, 'Vai para o Plano Astral até o fim do próximo turno e então volta.'],
    [34, 'O dano da próxima magia de dano (no próximo minuto) sai no máximo.'],
    [36, 'Rola 1d10: a idade muda tantos anos (ímpar rejuvenesce, par envelhece).'],
    [38, '1d6 flumphs do mestre surgem a até 18 m, com medo de você, e somem em 1 minuto.'],
    [40, 'Recupera 2d10 PV.', { cura: '2d10' }],
    [42, 'Vira uma planta num vaso até o próximo turno: incapacitado e vulnerável a todo dano.'],
    [44, 'Por 1 minuto, teleporta até 6 m com a ação bônus a cada turno.'],
    [46, 'Conjura levitação em si mesmo.'],
    [48, 'Um unicórnio do mestre surge a 1,5 m e some depois de 1 minuto.'],
    [50, 'Por 1 minuto não consegue falar: saem bolhas cor-de-rosa.'],
    [52, 'Um escudo espectral por 1 minuto: +2 na CA e imune a mísseis mágicos.'],
    [54, 'Imune a embriaguez por 5d6 dias.'],
    [56, 'O cabelo cai e volta a crescer em 24 horas.'],
    [58, 'Por 1 minuto, objetos inflamáveis soltos que você toca pegam fogo.'],
    [60, 'Recupera o espaço de magia gasto de menor nível.', { espaco: true }],
    [62, 'Por 1 minuto, só consegue falar gritando.'],
    [64, 'Conjura névoa obscurecente centrada em você.'],
    [66, 'Até três criaturas à sua escolha a até 9 m sofrem 4d10 elétrico.', { dano: '4d10', tipo: 'elétrico' }],
    [68, 'Fica amedrontado pela criatura mais próxima até o fim do próximo turno.'],
    [70, 'Todas as criaturas a até 9 m ficam invisíveis por 1 minuto (até atacarem ou conjurarem).'],
    [72, 'Resistência a todo dano por 1 minuto.'],
    [74, 'Uma criatura aleatória a até 9 m fica envenenada por 1d4 horas.'],
    [76, 'Brilha (luz plena, 9 m) por 1 minuto; quem termina o turno a 1,5 m fica cego até o fim do turno seguinte.'],
    [78, 'Conjura metamorfose em si mesmo: se falhar no teste, vira uma ovelha.'],
    [80, 'Borboletas e pétalas ilusórias flutuam a até 3 m por 1 minuto.'],
    [82, 'Ganha uma ação a mais, agora.'],
    [84, 'Cada criatura a até 9 m sofre 1d10 necrótico; você recupera o total causado.', { dano: '1d10', tipo: 'necrótico' }],
    [86, 'Conjura reflexos.'],
    [88, 'Conjura voo numa criatura aleatória a até 18 m.'],
    [90, 'Invisível e sem fazer som por 1 minuto (até atacar ou conjurar).'],
    [92, 'Se morrer no próximo minuto, volta à vida por reencarnação.'],
    [94, 'Fica uma categoria de tamanho maior por 1 minuto.'],
    [96, 'Você e quem está a até 9 m ficam vulneráveis a perfurante por 1 minuto.'],
    [98, 'Uma música etérea e suave toca à sua volta por 1 minuto.'],
    [100, 'Recupera todos os pontos de feitiçaria gastos.', { pontos: true }],
]

// Ficam na ficha de quem lançou (stats.marcas) e aparecem no card da criatura
const MARCAS = {
    'perdicao': { nome: 'Perdição', icone: '☠', minutos: 1, conc: true, magia: 'perdicao', alvos: n => 3 + Math.max(0, n - 1),
        desc: '−1d4 nas jogadas de ataque e nos testes de resistência.' },
    'marca-do-cacador': { nome: 'Marca do Caçador', icone: '🎯', minutos: 60, conc: true, magia: 'marca-do-cacador', alvos: () => 1, mover: true,
        desc: '+1d6 no dano de quem marcou; vantagem para percebê-la ou rastreá-la.' },
    'bruxaria': { nome: 'Bruxaria', icone: '🜏', minutos: 60, conc: true, magia: 'bruxaria', alvos: () => 1, mover: true,
        desc: '+1d6 necrótico no dano de quem amaldiçoou; desvantagem nos testes de um atributo.' },
    'voto-inimizade': { nome: 'Voto de Inimizade', icone: '⚔', minutos: 1, alvos: () => 1,
        desc: 'Quem fez o voto tem vantagem nas jogadas de ataque contra ela.' },
}

module.exports = {
    EFEITOS, MARCAS, DESTRUICOES, SURTO_SELVAGEM,
    ATRIBUTOS, ATRIBUTO_POR_KEY, TODOS_ATRIBUTOS,
    PERICIAS, PERICIA_POR_KEY, TODAS_PERICIAS,
    IDIOMAS, TODOS_IDIOMAS, FERRAMENTAS, TODAS_FERRAMENTAS,
    ARMADURAS, TIPOS_ARMADURA, PRECO_ESCUDO, textoPreco, ARMAS, CATEGORIAS_ARMA, GOLPE_DESARMADO, PROPRIEDADES_ARMA, textoPropriedades, ALINHAMENTOS,
    OPCOES, RACAS, ANTECEDENTES, EQUIPAMENTO_ANTECEDENTE, CONDICOES, EXAUSTAO, TIPOS_DANO,
}
