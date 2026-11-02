// ══════════════════════════════════════════════════════════════════════════════
// src/dndClasses.js — AS 12 CLASSES DO LIVRO DO JOGADOR E SUAS SUBCLASSES
//
// O motor (dnd.js) lê daqui:
//   dadoVida, resistencias, armaduras, armas, ferramentas, pericias
//   asi        — níveis de Incremento no Valor de Habilidade (ou talento)
//   subclasse  — em que nível se escolhe e como o livro chama a escolha
//   conjuracao — { atributo, tipo: completo|meio|terco|pacto, truques[20],
//                  conhecidas[20] | porAtributo: 'nivel'|'meio', inicio,
//                  escolas?, livresEm? }
//                  porAtributo: a quantidade de magias é atributo + nível (ou
//                  metade do nível). A mesa não usa preparação de magias:
//                  essas classes escolhem uma lista fixa, como as outras.
//   truquesFixos / truquesExtras (subclasse) — truques que vêm de graça
//   niveis     — { nível: [característica] }, cada uma { nome, desc, escolhas? }
//   recursos   — (nivel, mod) => [{ id, nome, max, recarga, dado? }]
//
// O Patrulheiro segue a versão revisada que está no livro da mesa
// (Conclaves da Besta, do Caçador e do Rastreador Subterrâneo).
// ══════════════════════════════════════════════════════════════════════════════

const { FERRAMENTAS } = require('./dndDados')

const c = (nome, desc, extra) => ({ nome, desc, ...(extra || {}) })
const ASI = [4, 8, 12, 16, 19]

/** Valor da tabela por nível: porNivel([[1, 'd6'], [5, 'd8']], 7) → 'd8' */
function porNivel(degraus, nivel) {
    let v = degraus[0][1]
    for (const [n, valor] of degraus) if (nivel >= n) v = valor
    return v
}

const CLASSES = {
    // ── BÁRBARO ─────────────────────────────────────────────────────────────
    'barbaro': {
        nome: 'Bárbaro', pag: 46, icone: 'delapouite/barbarian', dadoVida: 12, atributosChave: ['for', 'con'],
        resumo: 'Guerreiro movido pela fúria, que aguenta e devolve mais dano que qualquer um.',
        resistencias: ['for', 'con'],
        armaduras: ['leve', 'media', 'escudo'], armas: { categorias: ['simples', 'marcial'] },
        pericias: { qtd: 2, de: ['adestrar', 'atletismo', 'intimidacao', 'natureza', 'percepcao', 'sobrevivencia'] },
        armaduraInicial: [], escudoInicial: false,
        asi: ASI,
        subclasse: { nivel: 3, rotulo: 'Caminho Primitivo' },
        defesaSemArmadura: 'con',
        niveis: {
            1: [c('Fúria', 'Ação bônus: vantagem em testes e resistências de FOR, bônus de dano em ataques de FOR e resistência a concussão, cortante e perfurante. Dura 1 minuto.'),
                c('Defesa sem Armadura', 'Sem armadura, CA = 10 + DES + CON (escudo permitido).')],
            2: [c('Ataque Descuidado', 'Vantagem nos ataques de FOR do turno; ataques contra você também têm vantagem.'),
                c('Sentido de Perigo', 'Vantagem em resistências de DES contra efeitos que você vê.')],
            5: [c('Ataque Extra', 'Ataca duas vezes com a ação de Ataque.'),
                c('Movimento Rápido', '+3 m de deslocamento sem armadura pesada.')],
            7: [c('Instinto Selvagem', 'Vantagem em iniciativa; se surpreendido, age entrando em fúria.')],
            9: [c('Crítico Brutal', 'Rola um dado de dano extra no crítico corpo-a-corpo (2 no 13º, 3 no 17º).')],
            11: [c('Fúria Implacável', 'Em fúria, ao cair a 0 PV, teste de CON CD 10 (+5 a cada uso) para ficar com 1 PV.')],
            15: [c('Fúria Persistente', 'A fúria só termina antes se você ficar inconsciente ou quiser.')],
            18: [c('Força Indomável', 'Testes de FOR abaixo do seu valor de Força usam o valor.')],
            20: [c('Campeão Primitivo', '+4 em FOR e CON; o máximo desses valores passa a 24.')],
        },
        recursos: (nv) => [
            { id: 'furia', nome: 'Fúria', max: nv >= 20 ? null : porNivel([[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]], nv), recarga: 'longo',
              info: `+${porNivel([[1, 2], [9, 3], [16, 4]], nv)} de dano` },
        ],
        subclasses: {
            'furioso': {
                nome: 'Caminho do Furioso', resumo: 'Fúria sem freio, à custa de exaustão.',
                niveis: {
                    3: [c('Frenesi', 'Em fúria, um ataque corpo-a-corpo como ação bônus por turno; ao fim, 1 nível de exaustão.')],
                    6: [c('Fúria Inconsciente', 'Em fúria, não pode ser enfeitiçado nem amedrontado.')],
                    10: [c('Presença Intimidante', 'Ação: amedronta uma criatura a 9 m (SAB, CD 8 + prof + CAR).')],
                    14: [c('Retaliação', 'Reação: ataca corpo-a-corpo quem causou dano a você a 1,5 m.')],
                },
            },
            'totemico': {
                nome: 'Caminho do Guerreiro Totêmico', resumo: 'Um espírito animal guia a sua fúria.',
                niveis: {
                    3: [c('Conselheiro Espiritual', 'Conjura sentido bestial e falar com animais como rituais.'),
                        c('Totem Espiritual', 'Escolha o animal e ganhe o benefício dele em fúria.', { escolhas: [{ id: 'totem', rotulo: 'Totem espiritual', tipo: 'opcao', qtd: 1, fonte: 'totens' }] })],
                    6: [c('Aspecto da Besta', 'Benefício permanente do animal escolhido.', { escolhas: [{ id: 'aspecto', rotulo: 'Aspecto da besta', tipo: 'opcao', qtd: 1, fonte: 'aspectos-besta' }] })],
                    10: [c('Andarilho Espiritual', 'Conjura comunhão com a natureza como ritual.')],
                    14: [c('Sintonia Totêmica', 'Benefício mágico do animal escolhido em fúria.', { escolhas: [{ id: 'sintonia', rotulo: 'Sintonia totêmica', tipo: 'opcao', qtd: 1, fonte: 'sintonias-totemicas' }] })],
                },
            },
        },
    },

    // ── BARDO ───────────────────────────────────────────────────────────────
    'bardo': {
        nome: 'Bardo', pag: 51, icone: 'lorc/lyre', dadoVida: 8, atributosChave: ['car', 'des'],
        resumo: 'Artista e conjurador versátil que inspira os aliados.',
        resistencias: ['des', 'car'],
        armaduras: ['leve'], armas: { categorias: ['simples'], lista: ['besta-de-mao', 'espada-longa', 'rapieira', 'espada-curta'] },
        pericias: { qtd: 3 },
        escolhasIniciais: [{ id: 'instrumentos', rotulo: 'Instrumentos musicais', tipo: 'ferramenta', qtd: 3, de: FERRAMENTAS.instrumentos }],
        armaduraInicial: ['couro'], escudoInicial: false,
        asi: ASI,
        subclasse: { nivel: 3, rotulo: 'Colégio de Bardo' },
        conjuracao: {
            atributo: 'car', tipo: 'completo', ritual: true,
            truques: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
            conhecidas: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
        },
        jackOfAllTrades: 2,
        niveis: {
            1: [c('Conjuração', 'Conjura magias de bardo usando Carisma.'),
                c('Inspiração de Bardo', 'Ação bônus: um aliado ganha um dado para somar a um teste, ataque ou resistência.')],
            2: [c('Versatilidade', 'Soma metade da proficiência em testes de habilidade sem proficiência.'),
                c('Canção de Descanso', 'Aliados que gastam Dados de Vida no descanso curto recuperam um dado extra.')],
            3: [c('Aptidão', 'Dobra a proficiência em duas perícias em que é proficiente.', { escolhas: [{ id: 'aptidao', rotulo: 'Aptidão (especialização)', tipo: 'especializacao', qtd: 2 }] })],
            5: [c('Fonte de Inspiração', 'Inspiração de Bardo volta também no descanso curto.')],
            6: [c('Canção de Proteção', 'Ação: aliados a 9 m têm vantagem contra medo e enfeitiçamento.')],
            10: [c('Aptidão', 'Mais duas perícias com proficiência dobrada.', { escolhas: [{ id: 'aptidao', rotulo: 'Aptidão (especialização)', tipo: 'especializacao', qtd: 2 }] }),
                c('Segredos Mágicos', 'Duas das suas magias conhecidas podem vir de qualquer classe (de novo no 14º e no 18º).', { escolhas: [{ id: 'segredos', rotulo: 'Segredos Mágicos', tipo: 'magia', qtd: 2, lista: 'todas', nivelMin: 0, contaNoTotal: true }] })],
            14: [c('Segredos Mágicos', 'Mais duas magias de qualquer classe.', { escolhas: [{ id: 'segredos', rotulo: 'Segredos Mágicos', tipo: 'magia', qtd: 2, lista: 'todas', nivelMin: 0, contaNoTotal: true }] })],
            18: [c('Segredos Mágicos', 'Mais duas magias de qualquer classe.', { escolhas: [{ id: 'segredos', rotulo: 'Segredos Mágicos', tipo: 'magia', qtd: 2, lista: 'todas', nivelMin: 0, contaNoTotal: true }] })],
            20: [c('Inspiração Superior', 'Ao rolar iniciativa sem Inspiração de Bardo, recupera um uso.')],
        },
        recursos: (nv, mod) => [
            { id: 'inspiracao-bardo', nome: 'Inspiração de Bardo', max: Math.max(1, mod.car), recarga: nv >= 5 ? 'curto' : 'longo',
              dado: porNivel([[1, 'd6'], [5, 'd8'], [10, 'd10'], [15, 'd12']], nv) },
        ],
        subclasses: {
            'conhecimento': {
                nome: 'Colégio do Conhecimento', resumo: 'Colecionador de segredos e perícias.',
                niveis: {
                    3: [c('Proficiência Adicional', 'Proficiência em três perícias à escolha.', { escolhas: [{ id: 'pericias-colegio', rotulo: 'Perícias do Colégio', tipo: 'pericia', qtd: 3 }] }),
                        c('Palavras de Interrupção', 'Reação: gasta Inspiração para reduzir ataque, teste ou dano de um inimigo.')],
                    6: [c('Segredos Mágicos Adicionais', 'Aprende duas magias de qualquer classe, além das conhecidas.', { escolhas: [{ id: 'segredos-adicionais', rotulo: 'Segredos Mágicos Adicionais', tipo: 'magia', qtd: 2, lista: 'todas', nivelMin: 0 }] })],
                    14: [c('Perícia Inigualável', 'Gasta Inspiração de Bardo nos próprios testes de habilidade.')],
                },
            },
            'bravura': {
                nome: 'Colégio da Bravura', resumo: 'Escaldo de batalha que luta na linha de frente.',
                niveis: {
                    3: [c('Proficiência Adicional', 'Proficiência com armaduras médias, escudos e armas marciais.', { concede: { armaduras: ['media', 'escudo'], categoriasArma: ['marcial'] } }),
                        c('Inspiração em Combate', 'O dado de inspiração também soma ao dano ou à CA contra um ataque.')],
                    6: [c('Ataque Extra', 'Ataca duas vezes com a ação de Ataque.')],
                    14: [c('Magia de Batalha', 'Ao conjurar uma magia com a ação, ataca com arma como ação bônus.')],
                },
            },
        },
    },

    // ── BRUXO ───────────────────────────────────────────────────────────────
    'bruxo': {
        nome: 'Bruxo', pag: 56, icone: 'delapouite/warlock-eye', dadoVida: 8, atributosChave: ['car', 'con'],
        resumo: 'Conjurador que deve seu poder a um pacto com uma entidade.',
        resistencias: ['sab', 'car'],
        armaduras: ['leve'], armas: { categorias: ['simples'] },
        pericias: { qtd: 2, de: ['arcanismo', 'enganacao', 'historia', 'intimidacao', 'investigacao', 'natureza', 'religiao'] },
        armaduraInicial: ['couro'], escudoInicial: false,
        asi: ASI,
        subclasse: { nivel: 1, rotulo: 'Patrono Transcendental' },
        conjuracao: {
            atributo: 'car', tipo: 'pacto',
            truques: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
            conhecidas: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
        },
        niveis: {
            1: [c('Magia de Pacto', 'Poucos espaços, sempre do nível mais alto, que voltam no descanso curto.')],
            2: [c('Invocações Místicas', 'Fragmentos de conhecimento proibido que dão habilidades mágicas.', { escolhas: [{ id: 'invocacoes', rotulo: 'Invocações místicas', tipo: 'opcao', qtd: 2, fonte: 'invocacoes' }] })],
            3: [c('Dádiva do Pacto', 'O patrono concede uma dádiva.', { escolhas: [{ id: 'pacto', rotulo: 'Dádiva do pacto', tipo: 'opcao', qtd: 1, fonte: 'pactos' }] })],
            5: [c('Invocação Mística', 'Mais uma invocação.', { escolhas: [{ id: 'invocacoes', rotulo: 'Invocação mística', tipo: 'opcao', qtd: 1, fonte: 'invocacoes' }] })],
            7: [c('Invocação Mística', 'Mais uma invocação.', { escolhas: [{ id: 'invocacoes', rotulo: 'Invocação mística', tipo: 'opcao', qtd: 1, fonte: 'invocacoes' }] })],
            9: [c('Invocação Mística', 'Mais uma invocação.', { escolhas: [{ id: 'invocacoes', rotulo: 'Invocação mística', tipo: 'opcao', qtd: 1, fonte: 'invocacoes' }] })],
            11: [c('Arcana Mística', 'Uma magia de 6º nível, 1 vez por descanso longo (7º no 13º, 8º no 15º, 9º no 17º).', { escolhas: [{ id: 'arcana', rotulo: 'Arcana Mística (6º nível)', tipo: 'magia', qtd: 1, lista: 'bruxo', nivelMin: 6, nivelMax: 6 }] })],
            12: [c('Invocação Mística', 'Mais uma invocação.', { escolhas: [{ id: 'invocacoes', rotulo: 'Invocação mística', tipo: 'opcao', qtd: 1, fonte: 'invocacoes' }] })],
            13: [c('Arcana Mística', 'Uma magia de 7º nível, 1 vez por descanso longo.', { escolhas: [{ id: 'arcana', rotulo: 'Arcana Mística (7º nível)', tipo: 'magia', qtd: 1, lista: 'bruxo', nivelMin: 7, nivelMax: 7 }] })],
            15: [c('Arcana Mística', 'Uma magia de 8º nível, 1 vez por descanso longo.', { escolhas: [{ id: 'arcana', rotulo: 'Arcana Mística (8º nível)', tipo: 'magia', qtd: 1, lista: 'bruxo', nivelMin: 8, nivelMax: 8 }] }),
                c('Invocação Mística', 'Mais uma invocação.', { escolhas: [{ id: 'invocacoes', rotulo: 'Invocação mística', tipo: 'opcao', qtd: 1, fonte: 'invocacoes' }] })],
            17: [c('Arcana Mística', 'Uma magia de 9º nível, 1 vez por descanso longo.', { escolhas: [{ id: 'arcana', rotulo: 'Arcana Mística (9º nível)', tipo: 'magia', qtd: 1, lista: 'bruxo', nivelMin: 9, nivelMax: 9 }] })],
            18: [c('Invocação Mística', 'Mais uma invocação.', { escolhas: [{ id: 'invocacoes', rotulo: 'Invocação mística', tipo: 'opcao', qtd: 1, fonte: 'invocacoes' }] })],
            20: [c('Mestre Místico', '1 minuto suplicando ao patrono recupera todos os espaços de pacto. 1 vez por descanso longo.')],
        },
        recursos: () => [],
        subclasses: {
            'arquifada': {
                nome: 'A Arquifada', resumo: 'Pacto com um senhor das fadas.',
                recursos: (nv) => [{ id: 'presenca-feerica', nome: 'Presença Feérica', max: 1, recarga: 'curto' }, ...(nv >= 6 ? [{ id: 'nevoa-fuga', nome: 'Névoa de Fuga', max: 1, recarga: 'curto' }] : []), ...(nv >= 14 ? [{ id: 'delirio', nome: 'Delírio Sombrio', max: 1, recarga: 'curto' }] : [])],
                niveis: {
                    1: [c('Presença Feérica', 'Ação: criaturas num cubo de 3 m ficam enfeitiçadas ou amedrontadas (SAB). 1 vez por descanso curto.')],
                    6: [c('Névoa de Fuga', 'Reação ao sofrer dano: fica invisível e se teleporta 18 m. 1 vez por descanso curto.')],
                    10: [c('Defesa Sedutora', 'Imune a enfeitiçar; pode virar o enfeitiçamento contra quem tentou.')],
                    14: [c('Delírio Sombrio', 'Ação: prende uma criatura numa ilusão por 1 minuto. 1 vez por descanso curto.')],
                },
            },
            'corruptor': {
                nome: 'O Corruptor', resumo: 'Pacto com um ser dos planos inferiores.',
                recursos: (nv) => [...(nv >= 6 ? [{ id: 'sorte-obscuro', nome: 'Sorte do Próprio Obscuro', max: 1, recarga: 'curto' }] : []), ...(nv >= 14 ? [{ id: 'lancar-inferno', nome: 'Lançar no Inferno', max: 1, recarga: 'longo' }] : [])],
                niveis: {
                    1: [c('Bênção do Obscuro', 'Ao reduzir um inimigo a 0 PV, ganha PV temporários = CAR + nível de bruxo.')],
                    6: [c('Sorte do Próprio Obscuro', 'Soma 1d10 a um teste de habilidade ou resistência. 1 vez por descanso curto.')],
                    10: [c('Resistência Demoníaca', 'Escolhe um tipo de dano para ter resistência após cada descanso.')],
                    14: [c('Lançar no Inferno', 'Ao acertar, envia o alvo aos planos inferiores (10d10 psíquico). 1 vez por descanso longo.')],
                },
            },
            'grande-antigo': {
                nome: 'O Grande Antigo', resumo: 'Pacto com uma entidade incompreensível.',
                niveis: {
                    1: [c('Despertar a Mente', 'Fala telepaticamente com criaturas a 9 m.')],
                    6: [c('Proteção Entrópica', 'Reação: impõe desvantagem a um ataque; se errar, você tem vantagem no próximo contra ele.')],
                    10: [c('Escudo de Pensamentos', 'Mente ilegível; resistência a psíquico, que volta para quem causou.')],
                    14: [c('Criar Lacaio', 'Enfeitiça permanentemente um humanoide incapacitado.')],
                },
            },
        },
    },

    // ── CLÉRIGO ─────────────────────────────────────────────────────────────
    'clerigo': {
        nome: 'Clérigo', pag: 63, icone: 'lorc/holy-symbol', dadoVida: 8, atributosChave: ['sab', 'con'],
        resumo: 'Sacerdote com poder divino: cura, protege e destrói o profano.',
        resistencias: ['sab', 'car'],
        armaduras: ['leve', 'media', 'escudo'], armas: { categorias: ['simples'] },
        pericias: { qtd: 2, de: ['historia', 'intuicao', 'medicina', 'persuasao', 'religiao'] },
        armaduraInicial: ['brunea', 'couro', 'cota-de-malha'], escudoInicial: true,
        asi: ASI,
        subclasse: { nivel: 1, rotulo: 'Domínio Divino' },
        conjuracao: {
            atributo: 'sab', tipo: 'completo', porAtributo: 'nivel', ritual: true,
            truques: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
        },
        niveis: {
            1: [c('Conjuração', 'Escolhe magias de clérigo (SAB + nível) e troca uma a cada nível. As do domínio vêm de graça.')],
            2: [c('Canalizar Divindade', 'Canaliza poder divino: Expulsar Mortos-Vivos ou o efeito do domínio.'),
                c('Expulsar Mortos-Vivos', 'Ação: mortos-vivos a 9 m fogem por 1 minuto (SAB).')],
            5: [c('Destruir Mortos-Vivos', 'Mortos-vivos expulsos de ND 1/2 ou menor são destruídos (ND 1 no 8º, 2 no 11º, 3 no 14º, 4 no 17º).')],
            10: [c('Intervenção Divina', 'Pede ajuda à divindade: funciona se rolar no d100 até o seu nível. Sempre funciona no 20º.')],
        },
        recursos: (nv) => nv >= 2 ? [
            { id: 'canalizar', nome: 'Canalizar Divindade', max: porNivel([[2, 1], [6, 2], [18, 3]], nv), recarga: 'curto' },
        ] : [],
        subclasses: {
            'conhecimento': {
                nome: 'Domínio do Conhecimento', resumo: 'Deuses do saber e da compreensão.',
                niveis: {
                    1: [c('Bênçãos do Conhecimento', 'Dois idiomas e proficiência dobrada em duas perícias entre Arcanismo, História, Natureza e Religião.', {
                        escolhas: [
                            { id: 'idiomas-conhecimento', rotulo: 'Idiomas', tipo: 'idioma', qtd: 2 },
                            { id: 'pericias-conhecimento', rotulo: 'Perícias (com especialização)', tipo: 'pericia', qtd: 2, de: ['arcanismo', 'historia', 'natureza', 'religiao'], especializa: true },
                        ],
                    })],
                    2: [c('Canalizar Divindade: Conhecimento das Eras', 'Proficiência numa perícia ou ferramenta por 10 minutos.')],
                    6: [c('Canalizar Divindade: Ler Pensamentos', 'Lê os pensamentos superficiais de uma criatura e pode sugestioná-la.')],
                    8: [c('Conjuração Poderosa', 'Soma SAB ao dano dos truques de clérigo.')],
                    17: [c('Visões do Passado', 'Medita para ver o passado de um objeto ou lugar.')],
                },
            },
            'enganacao': {
                nome: 'Domínio da Enganação', resumo: 'Deuses de travessuras e ilusões.',
                niveis: {
                    1: [c('Bênção do Trapaceiro', 'Ação: dá vantagem em Furtividade a outra criatura por 1 hora.')],
                    2: [c('Canalizar Divindade: Invocar Duplicidade', 'Cria uma duplicata ilusória sua por 1 minuto.')],
                    6: [c('Canalizar Divindade: Manto de Sombras', 'Fica invisível até o fim do próximo turno.')],
                    8: [c('Golpe Divino', '+1d8 de dano de veneno uma vez por turno com arma (2d8 no 14º).')],
                    17: [c('Duplicidade Aprimorada', 'Cria até quatro duplicatas.')],
                },
            },
            'guerra': {
                nome: 'Domínio da Guerra', resumo: 'Deuses da guerra e da coragem.',
                recursos: (nv, mod) => [{ id: 'sacerdote-guerra', nome: 'Sacerdote da Guerra', max: Math.max(1, mod.sab), recarga: 'longo' }],
                niveis: {
                    1: [c('Proficiência Adicional', 'Proficiência com armas marciais e armadura pesada.', { concede: { armaduras: ['pesada'], categoriasArma: ['marcial'] } }),
                        c('Sacerdote da Guerra', 'Ataque extra como ação bônus, SAB vezes por descanso longo.')],
                    2: [c('Canalizar Divindade: Ataque Dirigido', '+10 numa jogada de ataque sua.')],
                    6: [c('Canalizar Divindade: Bênção do Deus da Guerra', 'Reação: +10 no ataque de um aliado a 9 m.')],
                    8: [c('Golpe Divino', '+1d8 de dano do tipo da arma uma vez por turno (2d8 no 14º).')],
                    17: [c('Avatar da Batalha', 'Resistência a dano não mágico de concussão, cortante e perfurante.')],
                },
            },
            'luz': {
                nome: 'Domínio da Luz', resumo: 'Deuses do sol, do fogo e da verdade.', truquesFixos: ['luz'],
                recursos: (nv, mod) => [{ id: 'labareda', nome: 'Labareda Protetora', max: Math.max(1, mod.sab), recarga: 'longo' }],
                niveis: {
                    1: [c('Truque Adicional', 'Conhece o truque luz, sem contar nos truques.'),
                        c('Labareda Protetora', 'Reação: impõe desvantagem a um ataque contra você. SAB vezes por descanso longo.')],
                    2: [c('Canalizar Divindade: Radiação do Amanhecer', 'Dissipa escuridão e causa 2d10 + nível radiante a inimigos a 9 m.')],
                    6: [c('Labareda Aprimorada', 'Labareda Protetora também protege aliados.')],
                    8: [c('Conjuração Poderosa', 'Soma SAB ao dano dos truques de clérigo.')],
                    17: [c('Coroa de Luz', 'Aura de luz solar: inimigos têm desvantagem contra suas magias de fogo e radiante.')],
                },
            },
            'natureza': {
                nome: 'Domínio da Natureza', resumo: 'Deuses da natureza e das estações.',
                niveis: {
                    1: [c('Acólito da Natureza', 'Um truque de druida e uma perícia entre Adestrar Animais, Natureza e Sobrevivência.', {
                        escolhas: [
                            { id: 'pericia-natureza', rotulo: 'Perícia', tipo: 'pericia', qtd: 1, de: ['adestrar', 'natureza', 'sobrevivencia'] },
                            { id: 'truque-natureza', rotulo: 'Truque de druida', tipo: 'magia', qtd: 1, lista: 'druida', nivelMin: 0, nivelMax: 0 },
                        ],
                    }),
                        c('Proficiência Adicional', 'Proficiência com armadura pesada.', { concede: { armaduras: ['pesada'] } })],
                    2: [c('Canalizar Divindade: Enfeitiçar Animais e Plantas', 'Enfeitiça bestas e plantas a 9 m por 1 minuto.')],
                    6: [c('Amortecer Elementos', 'Reação: dá resistência a ácido, elétrico, fogo, frio ou trovão.')],
                    8: [c('Golpe Divino', '+1d8 de frio, fogo ou elétrico uma vez por turno (2d8 no 14º).')],
                    17: [c('Senhor da Natureza', 'Comanda criaturas enfeitiçadas pelo seu Canalizar Divindade.')],
                },
            },
            'tempestade': {
                nome: 'Domínio da Tempestade', resumo: 'Deuses do mar, do céu e do trovão.',
                recursos: (nv, mod) => [{ id: 'ira-tormenta', nome: 'Ira da Tormenta', max: Math.max(1, mod.sab), recarga: 'longo' }],
                niveis: {
                    1: [c('Proficiência Adicional', 'Proficiência com armas marciais e armadura pesada.', { concede: { armaduras: ['pesada'], categoriasArma: ['marcial'] } }),
                        c('Ira da Tormenta', 'Reação: 2d8 elétrico ou trovão em quem acertou você. SAB vezes por descanso longo.')],
                    2: [c('Canalizar Divindade: Ira Destruidora', 'Dano máximo numa rolagem de dano elétrico ou trovão.')],
                    6: [c('Golpe de Relâmpago', 'Dano elétrico seu empurra criaturas Grandes ou menores 3 m.')],
                    8: [c('Golpe Divino', '+1d8 de trovão uma vez por turno (2d8 no 14º).')],
                    17: [c('Filho da Tormenta', 'Deslocamento de voo igual ao de caminhada ao ar livre.')],
                },
            },
            'vida': {
                nome: 'Domínio da Vida', resumo: 'Deuses da cura e da vitalidade.',
                niveis: {
                    1: [c('Proficiência Adicional', 'Proficiência com armadura pesada.', { concede: { armaduras: ['pesada'] } }),
                        c('Discípulo da Vida', 'Magias de cura curam 2 + o nível da magia a mais.')],
                    2: [c('Canalizar Divindade: Preservar a Vida', 'Distribui 5 × nível de PV entre aliados a 9 m (até metade do máximo).')],
                    6: [c('Curandeiro Abençoado', 'Ao curar outro, você também cura 2 + o nível da magia.')],
                    8: [c('Golpe Divino', '+1d8 radiante uma vez por turno (2d8 no 14º).')],
                    17: [c('Cura Suprema', 'Magias de cura usam o valor máximo dos dados.')],
                },
            },
        },
    },

    // ── DRUIDA ──────────────────────────────────────────────────────────────
    'druida': {
        nome: 'Druida', pag: 71, icone: 'lorc/oak', dadoVida: 8, atributosChave: ['sab', 'con'],
        resumo: 'Guardião da natureza que conjura e assume formas animais.',
        resistencias: ['int', 'sab'],
        armaduras: ['leve', 'media', 'escudo'],
        armas: { lista: ['clava', 'adaga', 'dardo', 'azagaia', 'maca', 'bordao', 'cimitarra', 'foice-curta', 'funda', 'lanca'] },
        ferramentas: ['Kit de herbalismo'],
        idiomas: ['Druídico'],
        pericias: { qtd: 2, de: ['arcanismo', 'adestrar', 'intuicao', 'medicina', 'natureza', 'percepcao', 'religiao', 'sobrevivencia'] },
        armaduraInicial: ['couro'], escudoInicial: true,
        asi: ASI,
        subclasse: { nivel: 2, rotulo: 'Círculo Druídico' },
        conjuracao: {
            atributo: 'sab', tipo: 'completo', porAtributo: 'nivel', ritual: true,
            truques: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        },
        niveis: {
            1: [c('Druídico', 'Conhece o idioma secreto dos druidas.'),
                c('Conjuração', 'Escolhe magias de druida (SAB + nível) e troca uma a cada nível. Não usa armadura nem escudo de metal.')],
            2: [c('Forma Selvagem', 'Ação: vira uma besta que já viu (ND 1/4, sem voo nem natação). Dura metade do nível em horas.')],
            4: [c('Forma Selvagem Aprimorada', 'Bestas de ND 1/2, com natação.')],
            8: [c('Forma Selvagem Aprimorada', 'Bestas de ND 1, com voo.')],
            18: [c('Corpo Atemporal', 'Envelhece 1 ano a cada 10.'),
                c('Magias da Besta', 'Conjura magias em Forma Selvagem.')],
            20: [c('Arquidruida', 'Forma Selvagem ilimitada; ignora componentes sem custo.')],
        },
        recursos: (nv, mod, sub) => nv >= 2 ? [
            { id: 'forma-selvagem', nome: 'Forma Selvagem', max: nv >= 20 ? null : 2, recarga: 'curto',
              info: sub === 'lua'
                  ? `ND máx. ${nv >= 6 ? Math.floor(nv / 3) : 1}`
                  : `ND máx. ${porNivel([[2, '1/4'], [4, '1/2'], [8, '1']], nv)}` },
        ] : [],
        subclasses: {
            'terra': {
                nome: 'Círculo da Terra', resumo: 'Místicos ligados a um tipo de terreno.', truquesExtras: 1,
                niveis: {
                    2: [c('Truque Adicional', 'Um truque de druida a mais.'),
                        c('Recuperação Natural', 'No descanso curto, recupera espaços de magia somando até metade do nível. 1 vez por descanso longo.'),
                        c('Magias de Círculo', 'O terreno dá magias sempre conhecidas a partir do 3º nível.', { escolhas: [{ id: 'terreno', rotulo: 'Terreno do círculo', tipo: 'opcao', qtd: 1, fonte: 'terrenos' }] })],
                    6: [c('Caminho da Floresta', 'Terreno difícil não mágico não custa movimento; vantagem contra plantas mágicas.')],
                    10: [c('Proteção Natural', 'Imune a veneno e doenças; elementais e fadas não o enfeitiçam nem amedrontam.')],
                    14: [c('Santuário Natural', 'Bestas e plantas precisam passar em SAB para atacar você.')],
                },
            },
            'lua': {
                nome: 'Círculo da Lua', resumo: 'Guerreiros que lutam em forma animal.',
                niveis: {
                    2: [c('Forma Selvagem de Combate', 'Forma Selvagem como ação bônus; gasta espaço de magia para curar 1d8 por nível.'),
                        c('Formas de Círculo', 'Bestas de ND 1 (ND = nível ÷ 3 a partir do 6º).')],
                    6: [c('Ataque Primordial', 'Ataques em forma de besta contam como mágicos.')],
                    10: [c('Forma Selvagem de Elemental', 'Gasta dois usos para virar um elemental do ar, terra, fogo ou água.')],
                    14: [c('Mil Formas', 'Conjura alterar-se à vontade.')],
                },
            },
        },
    },

    // ── FEITICEIRO ──────────────────────────────────────────────────────────
    'feiticeiro': {
        nome: 'Feiticeiro', pag: 77, icone: 'lorc/magic-swirl', dadoVida: 6, atributosChave: ['car', 'con'],
        resumo: 'Magia inata, moldada com pontos de feitiçaria.',
        resistencias: ['con', 'car'],
        armaduras: [], armas: { lista: ['adaga', 'dardo', 'funda', 'bordao', 'besta-leve'] },
        pericias: { qtd: 2, de: ['arcanismo', 'enganacao', 'intuicao', 'intimidacao', 'persuasao', 'religiao'] },
        armaduraInicial: [], escudoInicial: false,
        asi: ASI,
        subclasse: { nivel: 1, rotulo: 'Origem de Feitiçaria' },
        conjuracao: {
            atributo: 'car', tipo: 'completo',
            truques: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
            conhecidas: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
        },
        niveis: {
            1: [c('Conjuração', 'Conjura magias de feiticeiro usando Carisma.')],
            2: [c('Fonte de Magia', 'Pontos de feitiçaria: troca por espaços de magia e vice-versa (Conjuração Flexível).')],
            3: [c('Metamágica', 'Altera magias gastando pontos de feitiçaria.', { escolhas: [{ id: 'metamagia', rotulo: 'Metamágica', tipo: 'opcao', qtd: 2, fonte: 'metamagias' }] })],
            10: [c('Metamágica', 'Mais uma opção.', { escolhas: [{ id: 'metamagia', rotulo: 'Metamágica', tipo: 'opcao', qtd: 1, fonte: 'metamagias' }] })],
            17: [c('Metamágica', 'Mais uma opção.', { escolhas: [{ id: 'metamagia', rotulo: 'Metamágica', tipo: 'opcao', qtd: 1, fonte: 'metamagias' }] })],
            20: [c('Restauração Mística', 'Recupera 4 pontos de feitiçaria no descanso curto.')],
        },
        recursos: (nv) => nv >= 2 ? [{ id: 'feiticaria', nome: 'Pontos de Feitiçaria', max: nv, recarga: 'longo' }] : [],
        subclasses: {
            'draconica': {
                nome: 'Linhagem Dracônica', resumo: 'Sangue de dragão nas veias.',
                pvPorNivel: 1, caSemArmadura: 13,
                niveis: {
                    1: [c('Ancestral Dracônico', 'Fala Dracônico e dobra a proficiência em CAR ao lidar com dragões.', {
                        concede: { idiomas: ['Dracônico'] },
                        escolhas: [{ id: 'ancestral', rotulo: 'Ancestral dracônico', tipo: 'opcao', qtd: 1, fonte: 'ancestrais-draconicos' }],
                    }),
                        c('Resiliência Dracônica', '+1 PV máximo por nível; sem armadura, CA = 13 + DES.')],
                    6: [c('Afinidade Elemental', 'Soma CAR ao dano do tipo do ancestral; 1 ponto dá resistência a ele por 1 hora.')],
                    14: [c('Asas de Dragão', 'Ação bônus: asas com voo igual ao deslocamento.')],
                    18: [c('Presença Dracônica', '5 pontos: aura de 18 m que encanta ou amedronta.')],
                },
            },
            'selvagem': {
                nome: 'Magia Selvagem', resumo: 'Magia caótica e imprevisível.',
                recursos: () => [{ id: 'mares-caos', nome: 'Marés de Caos', max: 1, recarga: 'longo' }],
                niveis: {
                    1: [c('Surto de Magia Selvagem', 'Ao conjurar com espaço, o mestre pode pedir 1d20: no 1, efeito da tabela de surto.'),
                        c('Marés de Caos', 'Vantagem numa jogada; o mestre pode provocar um surto para recarregar.')],
                    6: [c('Dobrar a Sorte', '2 pontos: soma ou subtrai 1d4 da jogada de outra criatura.')],
                    14: [c('Caos Controlado', 'Rola duas vezes na tabela de surto e escolhe.')],
                    18: [c('Bombardeio de Magia', 'Dados de dano que tiram o máximo rolam de novo e somam.')],
                },
            },
        },
    },

    // ── GUERREIRO ───────────────────────────────────────────────────────────
    'guerreiro': {
        nome: 'Guerreiro', pag: 83, icone: 'lorc/crossed-swords', dadoVida: 10, atributosChave: ['for', 'con'],
        resumo: 'Mestre das armas e das armaduras, com mais ataques que todos.',
        resistencias: ['for', 'con'],
        armaduras: ['leve', 'media', 'pesada', 'escudo'], armas: { categorias: ['simples', 'marcial'] },
        pericias: { qtd: 2, de: ['acrobacia', 'adestrar', 'atletismo', 'historia', 'intuicao', 'intimidacao', 'percepcao', 'sobrevivencia'] },
        armaduraInicial: ['cota-de-malha', 'couro'], escudoInicial: true,
        asi: [4, 6, 8, 12, 14, 16, 19],
        subclasse: { nivel: 3, rotulo: 'Arquétipo Marcial' },
        niveis: {
            1: [c('Estilo de Luta', 'Uma especialidade de combate.', { escolhas: [{ id: 'estilo', rotulo: 'Estilo de luta', tipo: 'opcao', qtd: 1, fonte: 'estilos-luta' }] }),
                c('Retomar o Fôlego', 'Ação bônus: recupera 1d10 + nível de PV. 1 vez por descanso curto.')],
            2: [c('Surto de Ação', 'Uma ação adicional no turno. 1 vez por descanso curto (2 no 17º).')],
            5: [c('Ataque Extra', 'Ataca duas vezes com a ação de Ataque (três no 11º, quatro no 20º).')],
            9: [c('Indomável', 'Rola de novo um teste de resistência que falhou (2 vezes no 13º, 3 no 17º).')],
            11: [c('Ataque Extra (2)', 'Ataca três vezes com a ação de Ataque.')],
            20: [c('Ataque Extra (3)', 'Ataca quatro vezes com a ação de Ataque.')],
        },
        recursos: (nv) => {
            const r = [{ id: 'retomar-folego', nome: 'Retomar o Fôlego', max: 1, recarga: 'curto', info: `1d10 + ${nv}` }]
            if (nv >= 2) r.push({ id: 'surto-acao', nome: 'Surto de Ação', max: nv >= 17 ? 2 : 1, recarga: 'curto' })
            if (nv >= 9) r.push({ id: 'indomavel', nome: 'Indomável', max: porNivel([[9, 1], [13, 2], [17, 3]], nv), recarga: 'longo' })
            return r
        },
        subclasses: {
            'campeao': {
                nome: 'Campeão', resumo: 'Excelência física pura.',
                niveis: {
                    3: [c('Crítico Aprimorado', 'Crítico com 19 ou 20 nas armas.')],
                    7: [c('Atletismo Extraordinário', 'Metade da proficiência (arredondada para cima) em testes de FOR, DES e CON sem proficiência; salto maior.')],
                    10: [c('Estilo de Luta Adicional', 'Um segundo estilo de luta.', { escolhas: [{ id: 'estilo', rotulo: 'Estilo de luta adicional', tipo: 'opcao', qtd: 1, fonte: 'estilos-luta' }] })],
                    15: [c('Crítico Superior', 'Crítico com 18 a 20.')],
                    18: [c('Sobrevivente', 'Com até metade dos PV, recupera 5 + CON no início do turno.')],
                },
            },
            'mestre-batalha': {
                nome: 'Mestre de Batalha', resumo: 'Tático que usa manobras de combate.',
                niveis: {
                    3: [c('Superioridade em Combate', 'Aprende manobras e ganha dados de superioridade (CD 8 + prof + FOR ou DES).', {
                        escolhas: [{ id: 'manobras', rotulo: 'Manobras', tipo: 'opcao', qtd: 3, fonte: 'manobras' }],
                    }),
                        c('Estudioso da Guerra', 'Proficiência com uma ferramenta de artesão.', {
                            escolhas: [{ id: 'ferramenta-guerra', rotulo: 'Ferramenta de artesão', tipo: 'ferramenta', qtd: 1, de: FERRAMENTAS.artesao }],
                        })],
                    7: [c('Conheça seu Inimigo', 'Observando 1 minuto, descobre se um inimigo é superior ou inferior a você.'),
                        c('Manobras Adicionais', 'Mais duas manobras e um dado de superioridade.', { escolhas: [{ id: 'manobras', rotulo: 'Manobras', tipo: 'opcao', qtd: 2, fonte: 'manobras' }] })],
                    10: [c('Superioridade em Combate Aprimorada', 'Dados de superioridade viram d10; mais duas manobras.', { escolhas: [{ id: 'manobras', rotulo: 'Manobras', tipo: 'opcao', qtd: 2, fonte: 'manobras' }] })],
                    15: [c('Implacável', 'Ao rolar iniciativa sem dados de superioridade, recupera um; mais duas manobras.', { escolhas: [{ id: 'manobras', rotulo: 'Manobras', tipo: 'opcao', qtd: 2, fonte: 'manobras' }] })],
                    18: [c('Superioridade em Combate Aprimorada', 'Dados de superioridade viram d12.')],
                },
                recursos: (nv) => [{ id: 'superioridade', nome: 'Dados de Superioridade', max: porNivel([[3, 4], [7, 5], [15, 6]], nv), recarga: 'curto', dado: porNivel([[3, 'd8'], [10, 'd10'], [18, 'd12']], nv) }],
            },
            'cavaleiro-arcano': {
                nome: 'Cavaleiro Arcano', resumo: 'Guerreiro que mistura aço e magia de mago.',
                conjuracao: {
                    atributo: 'int', tipo: 'terco', inicio: 3, lista: 'mago',
                    escolas: ['abjuração', 'evocação'], livresEm: [3, 8, 14, 20],
                    truques: [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
                    conhecidas: [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
                },
                niveis: {
                    3: [c('Conjuração', 'Conjura magias de mago (principalmente abjuração e evocação) usando Inteligência.'),
                        c('Vínculo com Arma', 'Vincula até duas armas: não pode ser desarmado e as invoca como ação bônus.')],
                    7: [c('Magia de Guerra', 'Ao usar um truque com a ação, ataca com arma como ação bônus.')],
                    10: [c('Golpe Místico', 'Quem você acerta tem desvantagem na próxima resistência contra sua magia.')],
                    15: [c('Investida Arcana', 'No Surto de Ação, teleporta-se 9 m.')],
                    18: [c('Magia de Guerra Aprimorada', 'Ao conjurar uma magia com a ação, ataca como ação bônus.')],
                },
            },
        },
    },

    // ── LADINO ──────────────────────────────────────────────────────────────
    'ladino': {
        nome: 'Ladino', pag: 89, icone: 'lorc/cloak-dagger', dadoVida: 8, atributosChave: ['des', 'int'],
        resumo: 'Especialista em perícias, furtividade e ataques precisos.',
        resistencias: ['des', 'int'],
        armaduras: ['leve'], armas: { categorias: ['simples'], lista: ['besta-de-mao', 'espada-longa', 'rapieira', 'espada-curta'] },
        ferramentas: ['Ferramentas de ladrão'],
        idiomas: ['Gíria de Ladrão'],
        pericias: { qtd: 4, de: ['acrobacia', 'atletismo', 'atuacao', 'enganacao', 'furtividade', 'intimidacao', 'intuicao', 'investigacao', 'percepcao', 'persuasao', 'prestidigitacao'] },
        armaduraInicial: ['couro'], escudoInicial: false,
        asi: [4, 8, 10, 12, 16, 19],
        subclasse: { nivel: 3, rotulo: 'Arquétipo de Ladino' },
        niveis: {
            1: [c('Especialização', 'Dobra a proficiência em duas perícias (ou ferramentas de ladrão).', { escolhas: [{ id: 'especializacao', rotulo: 'Especialização', tipo: 'especializacao', qtd: 2, ferramentaLadrao: true }] }),
                c('Ataque Furtivo', 'Uma vez por turno, dano extra com arma de acuidade ou à distância quando tem vantagem ou um aliado está perto do alvo.'),
                c('Gíria de Ladrão', 'Linguagem secreta de sinais e códigos.')],
            2: [c('Ação Ardilosa', 'Disparada, Desengajar ou Esconder como ação bônus.')],
            5: [c('Esquiva Sobrenatural', 'Reação: reduz à metade o dano de um ataque que você vê.')],
            6: [c('Especialização', 'Mais duas perícias com proficiência dobrada.', { escolhas: [{ id: 'especializacao', rotulo: 'Especialização', tipo: 'especializacao', qtd: 2, ferramentaLadrao: true }] })],
            7: [c('Evasão', 'Sem dano ao passar em resistências de DES para metade; metade ao falhar.')],
            11: [c('Talento Confiável', 'Em perícias proficientes, resultados de 9 ou menos no d20 contam como 10.')],
            14: [c('Sentido Cego', 'Percebe criaturas escondidas e invisíveis a 3 m, se puder ouvir.')],
            15: [c('Mente Escorregadia', 'Proficiência em resistências de Sabedoria.', { concede: { resistencias: ['sab'] } })],
            18: [c('Elusivo', 'Nenhum ataque tem vantagem contra você enquanto não estiver incapacitado.')],
            20: [c('Golpe de Sorte', 'Transforma um erro em acerto ou uma falha em 20. 1 vez por descanso curto.')],
        },
        recursos: (nv) => nv >= 20 ? [{ id: 'golpe-sorte', nome: 'Golpe de Sorte', max: 1, recarga: 'curto' }] : [],
        infoNivel: (nv) => `Ataque Furtivo ${Math.ceil(nv / 2)}d6`,
        subclasses: {
            'ladrao': {
                nome: 'Ladrão', resumo: 'Arrombador, gatuno e caçador de tesouros.',
                niveis: {
                    3: [c('Mãos Rápidas', 'Ação Ardilosa também para Prestidigitação, ferramentas de ladrão ou Usar um Objeto.'),
                        c('Andarilho de Telhados', 'Escala sem custo extra; salto com corrida aumenta.')],
                    9: [c('Furtividade Suprema', 'Vantagem em Furtividade movendo-se até metade do deslocamento.')],
                    13: [c('Usar Instrumento Mágico', 'Ignora requisitos de classe, raça e nível de itens mágicos.')],
                    17: [c('Reflexos de Ladrão', 'Dois turnos na primeira rodada de combate.')],
                },
            },
            'assassino': {
                nome: 'Assassino', resumo: 'Especialista em matar com rapidez e disfarce.',
                niveis: {
                    3: [c('Proficiência Adicional', 'Proficiência com kit de disfarce e kit de venenos.', { concede: { ferramentas: ['Kit de disfarce', 'Kit de venenos'] } }),
                        c('Assassinar', 'Vantagem contra quem ainda não agiu; acerto contra surpreendido é crítico.')],
                    9: [c('Especialização em Infiltração', 'Cria identidades falsas com documentos e contatos.')],
                    13: [c('Impostor', 'Imita fala, escrita e comportamento de outra pessoa.')],
                    17: [c('Golpe Letal', 'Contra surpreendido, o alvo faz CON ou sofre dano dobrado.')],
                },
            },
            'trapaceiro-arcano': {
                nome: 'Trapaceiro Arcano', resumo: 'Ladino que usa ilusão e encantamento.', truquesFixos: ['maos-magicas'],
                conjuracao: {
                    atributo: 'int', tipo: 'terco', inicio: 3, lista: 'mago',
                    escolas: ['encantamento', 'ilusão'], livresEm: [3, 8, 14, 20],
                    // Mãos mágicas vem de graça (truquesFixos); a tabela do livro já a conta
                    truques: [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
                    conhecidas: [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
                },
                niveis: {
                    3: [c('Conjuração', 'Conjura magias de mago (principalmente encantamento e ilusão) usando Inteligência; conhece mãos mágicas.'),
                        c('Mãos Mágicas Malabaristas', 'Mãos mágicas invisíveis que furtam, abrem fechaduras e desarmam armadilhas.')],
                    9: [c('Emboscada Mágica', 'Escondido, o alvo tem desvantagem na resistência contra sua magia.')],
                    13: [c('Trapaceiro Versátil', 'Ação bônus: as mãos mágicas distraem e dão vantagem contra uma criatura.')],
                    17: [c('Ladrão de Magia', 'Reação: anula a magia de um conjurador e a rouba por 8 horas.')],
                },
            },
        },
    },

    // ── MAGO ────────────────────────────────────────────────────────────────
    'mago': {
        nome: 'Mago', pag: 94, icone: 'lorc/wizard-staff', dadoVida: 6, atributosChave: ['int', 'con'],
        resumo: 'Estudioso do arcano, com o maior repertório de magias.',
        resistencias: ['int', 'sab'],
        armaduras: [], armas: { lista: ['adaga', 'dardo', 'funda', 'bordao', 'besta-leve'] },
        pericias: { qtd: 2, de: ['arcanismo', 'historia', 'intuicao', 'investigacao', 'medicina', 'religiao'] },
        armaduraInicial: [], escudoInicial: false,
        asi: ASI,
        subclasse: { nivel: 2, rotulo: 'Tradição Arcana' },
        conjuracao: {
            atributo: 'int', tipo: 'completo', porAtributo: 'nivel', ritual: true,
            truques: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
        },
        niveis: {
            1: [c('Conjuração', 'Escolhe magias de mago (INT + nível) e troca uma a cada nível.'),
                c('Recuperação Arcana', 'No descanso curto, recupera espaços de magia somando até metade do nível. 1 vez por dia.')],
            18: [c('Dominar Magia', 'Uma magia de 1º e uma de 2º nível conjuradas à vontade.')],
            20: [c('Assinatura Mágica', 'Duas magias de 3º nível conhecidas, 1 vez cada por descanso curto sem gastar espaço.')],
        },
        recursos: (nv) => [{ id: 'recuperacao-arcana', nome: 'Recuperação Arcana', max: 1, recarga: 'longo', info: `até ${Math.ceil(nv / 2)} níveis de espaço` }],
        subclasses: {
            'abjuracao': {
                nome: 'Escola de Abjuração', resumo: 'Proteção e banimento.',
                niveis: {
                    2: [c('Abjuração Instruída', 'Copia magias de abjuração pela metade do custo.'),
                        c('Proteção Arcana', 'Ao conjurar abjuração, cria um escudo de PV = 2 × nível + INT.')],
                    6: [c('Proteção Projetada', 'Reação: a Proteção Arcana absorve dano de um aliado a 9 m.')],
                    10: [c('Abjuração Aprimorada', 'Soma a proficiência em testes de habilidade de abjuração.')],
                    14: [c('Resistência à Magia', 'Vantagem em resistências contra magia e resistência ao dano de magias.')],
                },
            },
            'adivinhacao': {
                nome: 'Escola de Adivinhação', resumo: 'Ver o futuro e o oculto.',
                recursos: (nv) => [{ id: 'prodigio', nome: 'Prodígio (d20 guardados)', max: nv >= 14 ? 3 : 2, recarga: 'longo' }],
                niveis: {
                    2: [c('Adivinhação Instruída', 'Copia magias de adivinhação pela metade do custo.'),
                        c('Prodígio', 'Rola 2d20 após o descanso longo e usa os valores no lugar de jogadas.')],
                    6: [c('Especialista em Adivinhação', 'Ao conjurar adivinhação, recupera um espaço de nível menor.')],
                    10: [c('O Terceiro Olho', 'Ação: visão no escuro, visão etérea, ler idiomas ou ver invisível.')],
                    14: [c('Prodígio Maior', 'Rola 3d20 no Prodígio.')],
                },
            },
            'conjuracao': {
                nome: 'Escola de Conjuração', resumo: 'Invocar criaturas e objetos.',
                niveis: {
                    2: [c('Conjuração Instruída', 'Copia magias de conjuração pela metade do custo.'),
                        c('Conjuração Menor', 'Cria um objeto não mágico pequeno por 1 hora.')],
                    6: [c('Transposição Benigna', 'Teleporta-se 9 m ou troca de lugar com um aliado.')],
                    10: [c('Conjuração Focada', 'Dano não interrompe a concentração em magias de conjuração.')],
                    14: [c('Invocações Resistentes', 'Criaturas que você invoca têm 30 PV temporários.')],
                },
            },
            'encantamento': {
                nome: 'Escola de Encantamento', resumo: 'Dominar mentes.',
                niveis: {
                    2: [c('Encantamento Instruído', 'Copia magias de encantamento pela metade do custo.'),
                        c('Olhar Hipnotizante', 'Ação: encanta uma criatura a 1,5 m (SAB).')],
                    6: [c('Encanto Instintivo', 'Reação: desvia um ataque para outra criatura (SAB).')],
                    10: [c('Dividir Encantamento', 'Magias de encantamento de um alvo atingem um segundo alvo.')],
                    14: [c('Alterar Memórias', 'O alvo encantado esquece que foi encantado.')],
                },
            },
            'evocacao': {
                nome: 'Escola de Evocação', resumo: 'Energia destrutiva.',
                niveis: {
                    2: [c('Evocação Instruída', 'Copia magias de evocação pela metade do custo.'),
                        c('Esculpir Magias', 'Protege aliados das suas evocações em área.')],
                    6: [c('Truque Potente', 'Alvos que passam na resistência sofrem metade do dano do truque.')],
                    10: [c('Evocação Potencializada', 'Soma INT ao dano das magias de evocação.')],
                    14: [c('Sobrecarga', 'Dano máximo numa magia de até 5º nível; repetir causa dano necrótico em você.')],
                },
            },
            'ilusao': {
                nome: 'Escola de Ilusão', resumo: 'Enganar os sentidos.',
                recursos: (nv) => nv >= 10 ? [{ id: 'eu-ilusorio', nome: 'Eu Ilusório', max: 1, recarga: 'curto' }] : [],
                niveis: {
                    2: [c('Ilusão Instruída', 'Copia magias de ilusão pela metade do custo.'),
                        c('Ilusão Menor Aprimorada', 'Ilusão menor cria som e imagem juntos.')],
                    6: [c('Ilusões Moldáveis', 'Altera ilusões ativas com uma ação.')],
                    10: [c('Eu Ilusório', 'Reação: uma duplicata faz um ataque errar. 1 vez por descanso curto.')],
                    14: [c('Realidade Ilusória', 'Torna real um objeto inanimado da ilusão por 1 minuto.')],
                },
            },
            'necromancia': {
                nome: 'Escola de Necromancia', resumo: 'Vida, morte e mortos-vivos.',
                niveis: {
                    2: [c('Necromancia Instruída', 'Copia magias de necromancia pela metade do custo.'),
                        c('Colheita Sinistra', 'Ao matar com magia, recupera PV (2 × nível da magia, 3 × se necromancia).')],
                    6: [c('Servos Mortos-Vivos', 'Animar mortos cria um morto-vivo a mais, com PV e dano extras.')],
                    10: [c('Acostumado à Morte-Vida', 'Resistência a necrótico e máximo de PV não pode ser reduzido.')],
                    14: [c('Comandar Mortos-Vivos', 'Ação: controla um morto-vivo (CAR).')],
                },
            },
            'transmutacao': {
                nome: 'Escola de Transmutação', resumo: 'Mudar a natureza das coisas.',
                recursos: (nv) => nv >= 10 ? [{ id: 'metamorfo', nome: 'Metamorfo', max: 1, recarga: 'curto' }] : [],
                niveis: {
                    2: [c('Transmutação Instruída', 'Copia magias de transmutação pela metade do custo.'),
                        c('Alquimia Menor', 'Muda temporariamente o material de um objeto.')],
                    6: [c('Pedra de Transmutador', 'Pedra que dá visão no escuro, deslocamento, resistência ou proficiência.')],
                    10: [c('Metamorfo', 'Conjura metamorfose em si sem gastar espaço. 1 vez por descanso curto.')],
                    14: [c('Mestre Transmutador', 'Consome a pedra para transformar, curar, restaurar a juventude ou ressuscitar.')],
                },
            },
        },
    },

    // ── MONGE ───────────────────────────────────────────────────────────────
    'monge': {
        nome: 'Monge', pag: 102, icone: 'lorc/meditation', dadoVida: 8, atributosChave: ['des', 'sab'],
        resumo: 'Artista marcial que canaliza o chi em golpes e movimentos.',
        resistencias: ['for', 'des'],
        armaduras: [], armas: { categorias: ['simples'], lista: ['espada-curta'] },
        pericias: { qtd: 2, de: ['acrobacia', 'atletismo', 'furtividade', 'historia', 'intuicao', 'religiao'] },
        escolhasIniciais: [{ id: 'ferramenta', rotulo: 'Ferramenta de artesão ou instrumento', tipo: 'ferramenta', qtd: 1, de: [...FERRAMENTAS.artesao, ...FERRAMENTAS.instrumentos] }],
        armaduraInicial: [], escudoInicial: false,
        asi: ASI,
        subclasse: { nivel: 3, rotulo: 'Tradição Monástica' },
        defesaSemArmadura: 'sab',
        niveis: {
            1: [c('Defesa sem Armadura', 'Sem armadura nem escudo, CA = 10 + DES + SAB.'),
                c('Artes Marciais', 'Usa DES em golpes desarmados e armas de monge, dado de artes marciais e um golpe como ação bônus.')],
            2: [c('Chi', 'Pontos de chi para Rajada de Golpes, Defesa Paciente e Passo do Vento. CD = 8 + prof + SAB.'),
                c('Movimento sem Armadura', '+3 m de deslocamento sem armadura (aumenta com o nível).')],
            3: [c('Defletir Projéteis', 'Reação: reduz dano de projétil em 1d10 + DES + nível e pode devolvê-lo.')],
            4: [c('Queda Lenta', 'Reação: reduz o dano de queda em 5 × nível.')],
            5: [c('Ataque Extra', 'Ataca duas vezes com a ação de Ataque.'),
                c('Ataque Atordoante', '1 chi ao acertar: o alvo faz CON ou fica atordoado.')],
            6: [c('Golpes de Chi', 'Golpes desarmados contam como mágicos.')],
            7: [c('Evasão', 'Sem dano ao passar em resistências de DES para metade; metade ao falhar.'),
                c('Mente Tranquila', 'Ação: encerra enfeitiçar ou amedrontar em você.')],
            9: [c('Movimento sem Armadura Aprimorado', 'Corre por paredes e sobre líquidos.')],
            10: [c('Pureza Corporal', 'Imune a doenças e veneno.')],
            13: [c('Idiomas do Sol e da Lua', 'Entende e é entendido em qualquer idioma falado.')],
            14: [c('Alma de Diamante', 'Proficiência em todos os testes de resistência; 1 chi rola de novo uma falha.')],
            15: [c('Corpo Atemporal', 'Não envelhece por magia nem precisa de comida e água.')],
            18: [c('Corpo Vazio', '4 chi: invisível e resistente a quase todo dano por 1 minuto; 8 chi: projeção astral.')],
            20: [c('Auto Aperfeiçoamento', 'Ao rolar iniciativa sem chi, recupera 4 pontos.')],
        },
        recursos: (nv) => nv >= 2 ? [{ id: 'chi', nome: 'Chi', max: nv, recarga: 'curto' }] : [],
        infoNivel: (nv) => `Artes Marciais ${porNivel([[1, 'd4'], [5, 'd6'], [11, 'd8'], [17, 'd10']], nv)}`,
        subclasses: {
            'mao-aberta': {
                nome: 'Caminho da Mão Aberta', resumo: 'Mestre do combate desarmado.',
                recursos: (nv) => nv >= 6 ? [{ id: 'integridade', nome: 'Integridade Corporal', max: 1, recarga: 'longo', info: `cura ${3 * nv}` }] : [],
                niveis: {
                    3: [c('Técnica da Mão Aberta', 'Rajada de Golpes derruba, empurra 4,5 m ou impede reações.')],
                    6: [c('Integridade Corporal', 'Ação: cura 3 × nível. 1 vez por descanso longo.')],
                    11: [c('Tranquilidade', 'Santuário em si ao fim de cada descanso longo.')],
                    17: [c('Palma Vibrante', '3 chi: vibração que pode reduzir o alvo a 0 PV (CON).')],
                },
            },
            'sombra': {
                nome: 'Caminho da Sombra', resumo: 'Ninja das sombras.',
                niveis: {
                    3: [c('Artes Sombrias', '2 chi: escuridão, visão no escuro, passos sem pegadas ou silêncio; ilusão menor.')],
                    6: [c('Passo das Sombras', 'Ação bônus: teleporta 18 m entre sombras, com vantagem no próximo ataque.')],
                    11: [c('Manto de Sombras', 'Ação: fica invisível na penumbra ou escuridão.')],
                    17: [c('Oportunista', 'Reação: ataca quem foi atingido por outra criatura a 1,5 m.')],
                },
            },
            'quatro-elementos': {
                nome: 'Caminho dos Quatro Elementos', resumo: 'Dobra os elementos com o chi.',
                niveis: {
                    3: [c('Discípulo dos Elementos', 'Conhece Sintonia Elemental e mais uma disciplina (outra no 6º, 11º e 17º).', {
                        escolhas: [{ id: 'disciplinas', rotulo: 'Disciplina elemental', tipo: 'opcao', qtd: 1, fonte: 'disciplinas' }],
                    })],
                    6: [c('Disciplina Elemental', 'Mais uma disciplina.', { escolhas: [{ id: 'disciplinas', rotulo: 'Disciplina elemental', tipo: 'opcao', qtd: 1, fonte: 'disciplinas' }] })],
                    11: [c('Disciplina Elemental', 'Mais uma disciplina.', { escolhas: [{ id: 'disciplinas', rotulo: 'Disciplina elemental', tipo: 'opcao', qtd: 1, fonte: 'disciplinas' }] })],
                    17: [c('Disciplina Elemental', 'Mais uma disciplina.', { escolhas: [{ id: 'disciplinas', rotulo: 'Disciplina elemental', tipo: 'opcao', qtd: 1, fonte: 'disciplinas' }] })],
                },
            },
        },
    },

    // ── PALADINO ────────────────────────────────────────────────────────────
    'paladino': {
        nome: 'Paladino', pag: 108, icone: 'delapouite/templar-shield', dadoVida: 10, atributosChave: ['for', 'car'],
        resumo: 'Guerreiro sagrado preso a um juramento.',
        resistencias: ['sab', 'car'],
        armaduras: ['leve', 'media', 'pesada', 'escudo'], armas: { categorias: ['simples', 'marcial'] },
        pericias: { qtd: 2, de: ['atletismo', 'intuicao', 'intimidacao', 'medicina', 'persuasao', 'religiao'] },
        armaduraInicial: ['cota-de-malha'], escudoInicial: true,
        asi: ASI,
        subclasse: { nivel: 3, rotulo: 'Juramento Sagrado' },
        conjuracao: { atributo: 'car', tipo: 'meio', porAtributo: 'meio', inicio: 2 },
        auraProtecao: 6,
        niveis: {
            1: [c('Sentido Divino', 'Ação: detecta celestiais, corruptores e mortos-vivos a 18 m.'),
                c('Cura pelas Mãos', 'Reserva de cura de 5 × nível por descanso longo; 5 pontos curam doença ou veneno.')],
            2: [c('Estilo de Luta', 'Uma especialidade de combate.', {
                escolhas: [{ id: 'estilo', rotulo: 'Estilo de luta', tipo: 'opcao', qtd: 1, fonte: 'estilos-luta', filtro: ['armas-grandes', 'defesa', 'duelismo', 'protecao'] }],
            }),
                c('Conjuração', 'Escolhe magias de paladino (CAR + metade do nível) e troca uma a cada nível. As do juramento vêm de graça.'),
                c('Destruição Divina', 'Ao acertar, gasta espaço de magia para 2d8 radiante (+1d8 por nível do espaço, +1d8 contra mortos-vivos e corruptores).')],
            3: [c('Saúde Divina', 'Imune a doenças.')],
            5: [c('Ataque Extra', 'Ataca duas vezes com a ação de Ataque.')],
            6: [c('Aura de Proteção', 'Você e aliados a 3 m somam seu CAR (mín. +1) aos testes de resistência. 9 m no 18º.')],
            10: [c('Aura de Coragem', 'Você e aliados a 3 m não podem ser amedrontados.')],
            11: [c('Destruição Divina Aprimorada', 'Todo acerto corpo-a-corpo causa +1d8 radiante.')],
            14: [c('Toque Purificador', 'Encerra uma magia em uma criatura. CAR vezes por descanso longo.')],
            18: [c('Aprimoramentos de Aura', 'Suas auras alcançam 9 m.')],
        },
        recursos: (nv, mod) => {
            const r = [
                { id: 'sentido-divino', nome: 'Sentido Divino', max: 1 + Math.max(0, mod.car), recarga: 'longo' },
                { id: 'cura-maos', nome: 'Cura pelas Mãos', max: 5 * nv, recarga: 'longo', pontos: true },
            ]
            if (nv >= 3) r.push({ id: 'canalizar', nome: 'Canalizar Divindade', max: 1, recarga: 'curto' })
            if (nv >= 14) r.push({ id: 'toque-purificador', nome: 'Toque Purificador', max: Math.max(1, mod.car), recarga: 'longo' })
            return r
        },
        subclasses: {
            'devocao': {
                nome: 'Juramento de Devoção', resumo: 'O cavaleiro ideal: honra, justiça e fé.',
                niveis: {
                    3: [c('Canalizar Divindade: Arma Sagrada', 'Soma CAR aos ataques com a arma por 1 minuto, que brilha.'),
                        c('Canalizar Divindade: Expulsar o Profano', 'Corruptores e mortos-vivos a 9 m fogem (SAB).')],
                    7: [c('Aura de Devoção', 'Você e aliados a 3 m não podem ser enfeitiçados.')],
                    15: [c('Pureza de Espírito', 'Proteção contra o bem e o mal permanente.')],
                    20: [c('Halo Sagrado', 'Ação: aura de luz solar que fere inimigos e atrapalha corruptores e mortos-vivos. 1 vez por descanso longo.')],
                },
            },
            'ancioes': {
                nome: 'Juramento dos Anciões', resumo: 'Preservar a luz e a vida contra as trevas.',
                niveis: {
                    3: [c('Canalizar Divindade: Ira da Natureza', 'Vinhas prendem uma criatura (FOR ou DES).'),
                        c('Canalizar Divindade: Expulsar os Infiéis', 'Fadas e corruptores a 9 m fogem (SAB).')],
                    7: [c('Aura de Vigilância', 'Você e aliados a 3 m têm resistência ao dano de magias.')],
                    15: [c('Sentinela Imortal', 'Ao cair a 0 PV, fica com 1 PV. 1 vez por descanso longo. Não envelhece.')],
                    20: [c('Campeão dos Anciões', 'Forma de força da natureza por 1 minuto: regenera e conjura mais rápido.')],
                },
            },
            'vinganca': {
                nome: 'Juramento de Vingança', resumo: 'Punir os grandes malfeitores a qualquer custo.',
                niveis: {
                    3: [c('Canalizar Divindade: Abjurar Inimigo', 'Uma criatura a 18 m fica amedrontada e imóvel (SAB).'),
                        c('Canalizar Divindade: Voto de Inimizade', 'Vantagem nos ataques contra uma criatura por 1 minuto.')],
                    7: [c('Vingador Implacável', 'Após ataque de oportunidade, move-se até metade do deslocamento sem provocar.')],
                    15: [c('Alma de Vingança', 'Reação: ataca a criatura do Voto de Inimizade quando ela ataca.')],
                    20: [c('Anjo Vingador', 'Asas, voo de 18 m e aura de medo por 1 hora. 1 vez por descanso longo.')],
                },
            },
        },
    },

    // ── PATRULHEIRO (versão revisada do livro da mesa) ─────────────────────
    'patrulheiro': {
        nome: 'Patrulheiro', pag: 115, icone: 'delapouite/bow-arrow', dadoVida: 10, atributosChave: ['des', 'sab'],
        resumo: 'Caçador das terras selvagens que mistura armas e magia da natureza.',
        resistencias: ['for', 'des'],
        armaduras: ['leve', 'media', 'escudo'], armas: { categorias: ['simples', 'marcial'] },
        pericias: { qtd: 3, de: ['adestrar', 'atletismo', 'furtividade', 'intuicao', 'investigacao', 'natureza', 'percepcao', 'sobrevivencia'] },
        armaduraInicial: ['brunea', 'couro'], escudoInicial: false,
        asi: ASI,
        subclasse: { nivel: 3, rotulo: 'Conclave de Patrulheiro' },
        conjuracao: {
            atributo: 'sab', tipo: 'meio', inicio: 2,
            conhecidas: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
        },
        niveis: {
            1: [c('Inimigo Favorito', '+2 de dano com armas contra o tipo escolhido; vantagem para rastreá-lo e lembrar dele; aprende um idioma dele.', {
                escolhas: [
                    { id: 'inimigo', rotulo: 'Inimigo favorito', tipo: 'opcao', qtd: 1, fonte: 'inimigos-favoritos' },
                    { id: 'idioma-inimigo', rotulo: 'Idioma do inimigo favorito', tipo: 'idioma', qtd: 1 },
                ],
            }),
                c('Explorador Natural', 'Ignora terreno difícil, vantagem em iniciativa e nos ataques contra quem ainda não agiu no primeiro turno; não se perde em viagem.')],
            2: [c('Estilo de Luta', 'Uma especialidade de combate.', {
                escolhas: [{ id: 'estilo', rotulo: 'Estilo de luta', tipo: 'opcao', qtd: 1, fonte: 'estilos-luta', filtro: ['arquearia', 'duas-armas', 'defesa', 'duelismo'] }],
            }),
                c('Conjuração', 'Conhece magias de patrulheiro, conjuradas com Sabedoria.')],
            3: [c('Consciência Primitiva', 'Comunica-se com bestas e sente inimigos favoritos a até 8 km.')],
            6: [c('Inimigo Favorito Maior', 'Um tipo de inimigo maior com os mesmos benefícios; o bônus de dano contra favoritos sobe para +4; vantagem contra magias dele.', {
                escolhas: [
                    { id: 'inimigo-maior', rotulo: 'Inimigo favorito maior', tipo: 'opcao', qtd: 1, fonte: 'inimigos-favoritos-maiores' },
                    { id: 'idioma-inimigo-maior', rotulo: 'Idioma do inimigo maior', tipo: 'idioma', qtd: 1 },
                ],
            })],
            8: [c('Pés Rápidos', 'Disparada como ação bônus.')],
            10: [c('Mimetismo', 'Parado e escondido, quem procura você tem −10 em Percepção.')],
            14: [c('Desaparecer', 'Esconder como ação bônus; não pode ser rastreado sem magia.')],
            18: [c('Sentidos Selvagens', 'Sem desvantagem contra quem não vê; percebe invisíveis a 9 m.')],
            20: [c('Matador de Inimigos', 'Uma vez por turno, soma SAB ao ataque ou ao dano.')],
        },
        recursos: () => [],
        subclasses: {
            'besta': {
                nome: 'Conclave da Besta', resumo: 'Vínculo mágico com um companheiro animal.',
                niveis: {
                    3: [c('Companheiro Animal', 'Um companheiro leal (arminho gigante, javali, gorila, lobo, mula, pantera, texugo gigante ou urso negro).'),
                        c('Vínculo com o Companheiro', 'O companheiro usa sua proficiência, inclusive na CA e no dano, e obedece você.')],
                    5: [c('Ataque Coordenado', 'Ao atacar, o companheiro ataca com a reação dele.')],
                    7: [c('Defesa da Besta', 'O companheiro tem vantagem em resistências enquanto vê você.')],
                    11: [c('Tempestade de Garras e Presas', 'O companheiro ataca todas as criaturas a 1,5 m dele.')],
                    15: [c('Defesa da Besta Superior', 'Reação: o companheiro reduz à metade o dano de um ataque.')],
                },
            },
            'cacador': {
                nome: 'Conclave do Caçador', resumo: 'Técnicas contra as ameaças mais terríveis.',
                niveis: {
                    3: [c('Presa do Caçador', 'Uma técnica à escolha.', { escolhas: [{ id: 'presa', rotulo: 'Presa do caçador', tipo: 'opcao', qtd: 1, fonte: 'presas-cacador' }] })],
                    5: [c('Ataque Extra', 'Ataca duas vezes com a ação de Ataque.')],
                    7: [c('Táticas Defensivas', 'Uma defesa à escolha.', { escolhas: [{ id: 'taticas', rotulo: 'Táticas defensivas', tipo: 'opcao', qtd: 1, fonte: 'taticas-defensivas' }] })],
                    11: [c('Ataque Múltiplo', 'Um ataque em área à escolha.', { escolhas: [{ id: 'ataque-multiplo', rotulo: 'Ataque múltiplo', tipo: 'opcao', qtd: 1, fonte: 'ataques-multiplos' }] })],
                    15: [c('Defesa de Caçador Superior', 'Uma defesa à escolha.', { escolhas: [{ id: 'defesa-superior', rotulo: 'Defesa superior', tipo: 'opcao', qtd: 1, fonte: 'defesas-cacador' }] })],
                },
            },
            'rastreador': {
                nome: 'Conclave do Rastreador Subterrâneo', resumo: 'Caçador das profundezas e das emboscadas.',
                visaoEscuro: 27,
                niveis: {
                    3: [c('Batedor do Subterrâneo', 'No primeiro turno, +3 m e um ataque a mais; criaturas com visão no escuro não o percebem melhor no escuro.'),
                        c('Magia do Rastreador Subterrâneo', 'Visão no escuro de 27 m e magias extras: disfarçar-se (3º), truque de corda (5º), glifo de vigilância (9º), invisibilidade maior (13º), similaridade (17º).')],
                    5: [c('Ataque Extra', 'Ataca duas vezes com a ação de Ataque.')],
                    7: [c('Mente de Aço', 'Proficiência em resistências de Sabedoria.', { concede: { resistencias: ['sab'] } })],
                    11: [c('Rajada do Rastreador', 'Uma vez por turno, ao errar um ataque, faz outro.')],
                    15: [c('Esquiva do Rastreador', 'Reação: impõe desvantagem a um ataque contra você.')],
                },
            },
        },
    },
}

module.exports = { CLASSES, porNivel }
