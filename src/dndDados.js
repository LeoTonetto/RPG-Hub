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
    'acolchoada': { nome: 'Acolchoada', tipo: 'leve', ca: 11, maxDes: null, furtividade: true },
    'couro': { nome: 'Couro', tipo: 'leve', ca: 11, maxDes: null },
    'couro-batido': { nome: 'Couro batido', tipo: 'leve', ca: 12, maxDes: null },
    'gibao-de-peles': { nome: 'Gibão de peles', tipo: 'media', ca: 12, maxDes: 2 },
    'camisao-de-malha': { nome: 'Camisão de malha', tipo: 'media', ca: 13, maxDes: 2 },
    'brunea': { nome: 'Brunea', tipo: 'media', ca: 14, maxDes: 2, furtividade: true },
    'peitoral': { nome: 'Peitoral', tipo: 'media', ca: 14, maxDes: 2 },
    'meia-armadura': { nome: 'Meia-armadura', tipo: 'media', ca: 15, maxDes: 2, furtividade: true },
    'cota-de-aneis': { nome: 'Cota de anéis', tipo: 'pesada', ca: 14, maxDes: 0, furtividade: true },
    'cota-de-malha': { nome: 'Cota de malha', tipo: 'pesada', ca: 16, maxDes: 0, forca: 13, furtividade: true },
    'cota-de-talas': { nome: 'Cota de talas', tipo: 'pesada', ca: 17, maxDes: 0, forca: 15, furtividade: true },
    'placas': { nome: 'Placas', tipo: 'pesada', ca: 18, maxDes: 0, forca: 15, furtividade: true },
}
const TIPOS_ARMADURA = { leve: 'Armaduras leves', media: 'Armaduras médias', pesada: 'Armaduras pesadas', escudo: 'Escudos' }

// Ficam aqui desde já porque as proficiências e o talento Mestre de Armas
// precisam da lista; o dano entra em uso na etapa de ataques.
const ARMAS = {
    // Simples corpo-a-corpo
    'adaga': { nome: 'Adaga', cat: 'simples', dano: '1d4 perfurante', props: 'acuidade, leve, arremesso (6/18)' },
    'azagaia': { nome: 'Azagaia', cat: 'simples', dano: '1d6 perfurante', props: 'arremesso (9/36)' },
    'bordao': { nome: 'Bordão', cat: 'simples', dano: '1d6 concussão', props: 'versátil (1d8)' },
    'clava': { nome: 'Clava', cat: 'simples', dano: '1d4 concussão', props: 'leve' },
    'clava-grande': { nome: 'Clava grande', cat: 'simples', dano: '1d8 concussão', props: 'duas mãos' },
    'foice-curta': { nome: 'Foice curta', cat: 'simples', dano: '1d4 cortante', props: 'leve' },
    'lanca': { nome: 'Lança', cat: 'simples', dano: '1d6 perfurante', props: 'arremesso (6/18), versátil (1d8)' },
    'maca': { nome: 'Maça', cat: 'simples', dano: '1d6 concussão', props: '' },
    'machadinha': { nome: 'Machadinha', cat: 'simples', dano: '1d6 cortante', props: 'leve, arremesso (6/18)' },
    'martelo-leve': { nome: 'Martelo leve', cat: 'simples', dano: '1d4 concussão', props: 'leve, arremesso (6/18)' },
    // Simples à distância
    'arco-curto': { nome: 'Arco curto', cat: 'simples', dano: '1d6 perfurante', props: 'munição (24/96), duas mãos' },
    'besta-leve': { nome: 'Besta leve', cat: 'simples', dano: '1d8 perfurante', props: 'munição (24/96), recarga, duas mãos' },
    'dardo': { nome: 'Dardo', cat: 'simples', dano: '1d4 perfurante', props: 'acuidade, arremesso (6/18)' },
    'funda': { nome: 'Funda', cat: 'simples', dano: '1d4 concussão', props: 'munição (9/36)' },
    // Marciais corpo-a-corpo
    'alabarda': { nome: 'Alabarda', cat: 'marcial', dano: '1d10 cortante', props: 'pesada, alcance, duas mãos' },
    'chicote': { nome: 'Chicote', cat: 'marcial', dano: '1d4 cortante', props: 'acuidade, alcance' },
    'cimitarra': { nome: 'Cimitarra', cat: 'marcial', dano: '1d6 cortante', props: 'acuidade, leve' },
    'espada-curta': { nome: 'Espada curta', cat: 'marcial', dano: '1d6 perfurante', props: 'acuidade, leve' },
    'espada-grande': { nome: 'Espada grande', cat: 'marcial', dano: '2d6 cortante', props: 'pesada, duas mãos' },
    'espada-longa': { nome: 'Espada longa', cat: 'marcial', dano: '1d8 cortante', props: 'versátil (1d10)' },
    'glaive': { nome: 'Glaive', cat: 'marcial', dano: '1d10 cortante', props: 'pesada, alcance, duas mãos' },
    'lanca-de-montaria': { nome: 'Lança de montaria', cat: 'marcial', dano: '1d12 perfurante', props: 'alcance, especial' },
    'pique': { nome: 'Pique', cat: 'marcial', dano: '1d10 perfurante', props: 'pesada, alcance, duas mãos' },
    'maca-estrela': { nome: 'Maça estrela', cat: 'marcial', dano: '1d8 perfurante', props: '' },
    'machado-de-batalha': { nome: 'Machado de batalha', cat: 'marcial', dano: '1d8 cortante', props: 'versátil (1d10)' },
    'machado-grande': { nome: 'Machado grande', cat: 'marcial', dano: '1d12 cortante', props: 'pesada, duas mãos' },
    'malho': { nome: 'Malho', cat: 'marcial', dano: '2d6 concussão', props: 'pesada, duas mãos' },
    'mangual': { nome: 'Mangual', cat: 'marcial', dano: '1d8 concussão', props: '' },
    'martelo-de-guerra': { nome: 'Martelo de guerra', cat: 'marcial', dano: '1d8 concussão', props: 'versátil (1d10)' },
    'picareta-de-guerra': { nome: 'Picareta de guerra', cat: 'marcial', dano: '1d8 perfurante', props: '' },
    'rapieira': { nome: 'Rapieira', cat: 'marcial', dano: '1d8 perfurante', props: 'acuidade' },
    'tridente': { nome: 'Tridente', cat: 'marcial', dano: '1d6 perfurante', props: 'arremesso (6/18), versátil (1d8)' },
    // Marciais à distância
    'arco-longo': { nome: 'Arco longo', cat: 'marcial', dano: '1d8 perfurante', props: 'munição (45/180), pesada, duas mãos' },
    'besta-de-mao': { nome: 'Besta de mão', cat: 'marcial', dano: '1d6 perfurante', props: 'munição (9/36), leve, recarga' },
    'besta-pesada': { nome: 'Besta pesada', cat: 'marcial', dano: '1d10 perfurante', props: 'munição (30/120), pesada, recarga, duas mãos' },
    'rede': { nome: 'Rede', cat: 'marcial', dano: '—', props: 'especial, arremesso (1,5/4,5)' },
    'zarabatana': { nome: 'Zarabatana', cat: 'marcial', dano: '1 perfurante', props: 'munição (7,5/30), recarga' },
}
const CATEGORIAS_ARMA = { simples: 'Armas simples', marcial: 'Armas marciais' }

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

module.exports = {
    ATRIBUTOS, ATRIBUTO_POR_KEY, TODOS_ATRIBUTOS,
    PERICIAS, PERICIA_POR_KEY, TODAS_PERICIAS,
    IDIOMAS, TODOS_IDIOMAS, FERRAMENTAS, TODAS_FERRAMENTAS,
    ARMADURAS, TIPOS_ARMADURA, ARMAS, CATEGORIAS_ARMA, ALINHAMENTOS,
    OPCOES, RACAS, ANTECEDENTES,
}
