// ══════════════════════════════════════════════════════════════════════════════
// src/calico.js — NÚCLEO DE REGRAS DO SISTEMA CALICO
// Homebrew de Ordem Paranormal II (playtest) para campanha de Velho Oeste, 1890.
//
// Este módulo é PURO: não toca no DOM, não fala com Supabase, não usa sockets.
// Só regras, tabelas e matemática. A UI vive em calicoCreate.js / calicoSheet.js.
//
// Isolamento (spec §15): os blocos de COMBATE e PROGRESSÃO estão marcados e
// agrupados. Quando o playtest oficial de combate sair, é só trocar esses blocos
// — o núcleo de resolução e a ficha não dependem deles.
// ══════════════════════════════════════════════════════════════════════════════

// ══ CONFIG — spec §15. Tudo que vai mudar depois das primeiras sessões. ══════
const CALICO_CONFIG = {
    dtPadrao: 7,

    // Teto de modificadores situacionais acumulados na mesma rolagem (§1.4).
    // Aumentos vindos de Ajuda (§1.8) são somados DEPOIS deste teto.
    tetoPassosSituacionais: 2,

    // Quando true, armas de fogo multiplicam dano crítico por 3 em vez de 2 (§7.5).
    // A campanha liga isso a partir da sessão 3.
    criticoArmasFogoX3: false,

    tabelaPV: { d4: 8, d6: 10, d8: 12, d10: 14, d12: 16 },
    tabelaPD: { d4: 8, d6: 10, d8: 12, d10: 14, d12: 16 },
    pvPorNivel: 2,
    pdPorNivel: 2,

    orcamentoCriacao: {
        arranjosAtributos: [
            { id: 'padrao', label: 'Padrão', dados: ['d8', 'd6', 'd6'] },
            { id: 'especialista', label: 'Especialista', dados: ['d10', 'd6', 'd4'] },
        ],
        // Orçamento modelado em PASSOS, não em valores-alvo. Assim o bônus grátis
        // de Pontaria empilha corretamente (§6.6: "sobe a partir do d6 já concedido").
        periciasD8: 1,        // 1 slot de +2 passos (d4 → d8)
        periciasD6: 4,        // 4 slots de +1 passo  (d4 → d6)
        periciasGratuitas: { pontaria: 'd6' },   // fora do orçamento (§6.6)
    },

    // §8.2 — o corpo do texto do playtest manda Compartilhar usar Pesquisar,
    // a tabela-resumo manda usar Intuição. Adotado: pesquisar.
    compartilharUsaPericia: 'pesquisar',

    // §10 — nenhuma perícia pode exceder o atributo-base em mais de N passos.
    maxPassosAcimaDoAtributoBase: 2,

    nivelMaximo: 10,

    // §1.5 — limites de dados extras
    maxDadosRolados: 4,
    maxDadosSomados: 3,

    // §1.6 — crítico: dois ou mais dados com o MESMO valor, e esse valor >= este piso
    valorMinimoCritico: 6,

    // §7.2 — modo opcional de iniciativa rolada (desligado por padrão)
    iniciativaRolada: false,

    // §8.3 — modo imersão do Destrancar: "tic/click/toc" em vez de
    // "baixo/exato/alto", sem dizer ao jogador qual é qual.
    destrancarModoImersao: false,
}

// ══ 1.1 ESCALA DE DADOS ══════════════════════════════════════════════════════
// d20 existe só como resultado de efeitos paranormais raros. Nenhuma regra de
// criação ou progressão pode alcançá-lo — por isso ele fica fora da escala.
const ESCALA_DADOS = ['d4', 'd6', 'd8', 'd10', 'd12']
const DADO_PARANORMAL = 'd20'

const ESCALA_ATRIBUTO = {
    d4: 'Abaixo da média', d6: 'Média humana', d8: 'Acima da média',
    d10: 'Muito acima da média', d12: 'Ápice humano',
}
const ESCALA_PERICIA = {
    d4: 'Destreinado', d6: 'Treinado', d8: 'Especialista',
    d10: 'Mestre', d12: 'Grão-mestre',
}

function faces(dado) { return parseInt(String(dado).replace('d', ''), 10) || 4 }
function indiceDado(dado) { return ESCALA_DADOS.indexOf(dado) }

// §1.4 — mover o dado N degraus. Piso d4, teto d12 (salvo efeito paranormal).
function passoDado(dado, passos, permitirD20 = false) {
    if (dado === DADO_PARANORMAL) return permitirD20 ? DADO_PARANORMAL : 'd12'
    const i = indiceDado(dado)
    if (i < 0) return dado
    const alvo = i + (passos || 0)
    if (permitirD20 && alvo >= ESCALA_DADOS.length) return DADO_PARANORMAL
    return ESCALA_DADOS[Math.max(0, Math.min(ESCALA_DADOS.length - 1, alvo))]
}

function passosEntre(de, para) { return indiceDado(para) - indiceDado(de) }

// ══ 2. ATRIBUTOS — exatamente três, sem derivados ════════════════════════════
const ATRIBUTOS = [
    { key: 'fisico', label: 'FÍSICO', icon: '💪', descricao: 'Força muscular, coordenação, velocidade, fôlego' },
    { key: 'mente', label: 'MENTE', icon: '🧠', descricao: 'Raciocínio, educação, percepção sensorial' },
    { key: 'emocao', label: 'EMOÇÃO', icon: '🔥', descricao: 'Força de vontade, magnetismo social, instinto' },
]

// ══ 3. PERÍCIAS — são 20, fixas. Não criar novas. ════════════════════════════
//
// NOTA SOBRE OS ÍCONES: use só emoji cuja apresentação PADRÃO no Unicode seja
// colorida (Emoji_Presentation=Yes). Caracteres como ⚙ U+2699, ⚕ U+2695 ou
// 🕮 U+1F56E são, por padrão, glifos de TEXTO — o Windows desenha em preto, e
// no fundo escuro do app eles somem. O seletor de variação (U+FE0F) até força
// a versão colorida, mas não em toda fonte; trocar o caractere é mais seguro.
// `idPlaytest` guarda o ID oficial quando o rótulo foi re-ambientado para 1890,
// para permitir importar conteúdo oficial no futuro sem migrar as fichas.
const PERICIAS = [
    { key: 'acrobacia', label: 'Acrobacia', attr: 'fisico', icon: '🤸', desc: 'Equilíbrio, rolamento, saltos, escalada rápida, se firmar em coisa em movimento' },
    { key: 'aptidao', label: 'Aptidão', attr: 'mente', icon: '🎓', desc: 'Conhecimento em campo específico — exige especialização', temEspecializacao: true },
    { key: 'atletismo', label: 'Atletismo', attr: 'fisico', icon: '🏃', desc: 'Correr, saltar, escalar, nadar, arrombar na força' },
    { key: 'crime', label: 'Crime', attr: 'fisico', icon: '🔑', desc: 'Furtar, abrir fechaduras, gazua, falsificar, marcar baralho' },
    { key: 'disciplina', label: 'Disciplina', attr: 'emocao', icon: '🧘', desc: 'Resistir a trauma, susto, pânico, dor' },
    { key: 'enganacao', label: 'Enganação', attr: 'emocao', icon: '🃏', desc: 'Mentir, blefar, disfarçar-se, seduzir' },
    { key: 'furtividade', label: 'Furtividade', attr: 'fisico', icon: '🌑', desc: 'Esconder-se, andar sem ser visto ou ouvido' },
    { key: 'intimidacao', label: 'Intimidação', attr: 'emocao', icon: '😠', desc: 'Assustar, coagir, encarar' },
    { key: 'intuicao', label: 'Intuição', attr: 'emocao', icon: '🔮', desc: 'Sexto sentido, ler pessoas e ambientes' },
    { key: 'luta', label: 'Luta', attr: 'fisico', icon: '👊', desc: 'Ataque desarmado ou corpo a corpo' },
    { key: 'maquinario', label: 'Maquinário', attr: 'mente', icon: '🚂', desc: 'Locomotiva, moinho, bomba de mina, carroça, telégrafo', idPlaytest: 'maquinas' },
    { key: 'medicina', label: 'Medicina', attr: 'mente', icon: '🩹', desc: 'Primeiros socorros, extrair bala, costurar, necropsia' },
    { key: 'ocultismo', label: 'Ocultismo', attr: 'mente', icon: '📿', desc: 'Conhecimento sobre o paranormal, superstição, folclore', naoSugerir: true },
    { key: 'percepcao', label: 'Percepção', attr: 'mente', icon: '🔍', desc: 'Notar por visão, audição, olfato; revistar' },
    { key: 'persuasao', label: 'Persuasão', attr: 'emocao', icon: '💬', desc: 'Convencer, negociar, lábia' },
    { key: 'pesquisar', label: 'Pesquisar', attr: 'mente', icon: '📚', desc: 'Documentos, registros, cartório, arquivo de jornal, analisar evidência' },
    { key: 'pontaria', label: 'Pontaria', attr: 'fisico', icon: '🔫', desc: 'Armas de fogo, arremesso, arco' },
    { key: 'sobrevivencia', label: 'Sobrevivência', attr: 'mente', icon: '⛺', desc: 'Acampar, rastrear, ler terreno, cavalgar, lidar com animais' },
    { key: 'engenhoca', label: 'Engenhoca', attr: 'mente', icon: '🧨', desc: 'Dinamite, mecanismos, cofres industriais, equipamento de mineração', idPlaytest: 'tecnologia' },
    { key: 'vigor', label: 'Vigor', attr: 'fisico', icon: '🫀', desc: 'Fôlego, resistir a veneno, suportar ferimento, não morrer' },
]

const PERICIA_POR_KEY = Object.fromEntries(PERICIAS.map(p => [p.key, p]))

// §3.1 — Aptidão é a única perícia com subcampo. Escolhe-se UMA ao treiná-la.
const APTIDAO_ESPECIALIZACOES = [
    { key: 'artes', label: 'Artes', desc: 'Música, canto, escrita, pintura, fotografia, atuação' },
    { key: 'boataria', label: 'Boataria', desc: 'Fofoca de saloon, jornal, cartaz de procurado, quem é quem no território', idPlaytest: 'atualidades' },
    { key: 'burocracia', label: 'Burocracia', desc: 'Lei, escritura, título de terra, contabilidade, ferrovia, companhia de mineração' },
    { key: 'exatas', label: 'Exatas', desc: 'Matemática, química, geologia, mineralogia, medicina veterinária' },
    { key: 'humanas', label: 'Humanas', desc: 'História, geografia, teologia, línguas, genealogia das famílias da região' },
    { key: 'tatica', label: 'Tática', desc: 'Instrução militar — Guerra Civil, Guerras Indígenas, cavalaria' },
]

// ══ 4. PERFIS — substituem as classes da 1ª edição ═══════════════════════════
// ATENÇÃO: os textos de habilidade abaixo são PLACEHOLDER (spec §4.1).
// O texto oficial está nas fichas prontas do PDF do playtest (Alan, Victor,
// Eloísa, Edgar, Kênia). Substitua por lá e apague o `placeholder: true`.
// A tabela calico_perfis no Supabase, se preenchida, tem precedência sobre isto.
const PERFIS = [
    {
        id: 'executor', nome: 'Executor', icon: '💢',
        descricao: 'Age primeiro e pensa depois. Impulsivo e perseverante; tira força do fracasso',
        habilidadeNome: 'Tirar Força do Fracasso',
        habilidadeTexto: 'Quando falhar em um teste, você pode gastar 1 PD para repetir esse mesmo teste uma vez. Só funciona repetindo a mesma abordagem.',
        placeholder: true,
    },
    {
        id: 'analista', nome: 'Analista', icon: '🔬',
        descricao: 'Observa, entende, se prepara, e só então age. Demora, mas acerta',
        habilidadeNome: 'Estudar o Alvo',
        habilidadeTexto: 'Gaste sua ação estudando um alvo, obstáculo ou cena. No seu próximo teste contra ele, você recebe +1 passo.',
        placeholder: true,
    },
    {
        id: 'vigilante', nome: 'Vigilante', icon: '🦉',
        descricao: 'Sempre atento. Aproveita brechas, age primeiro, decide sob pressão',
        habilidadeNome: 'Nunca Surpreendido',
        habilidadeTexto: 'Você nunca fica surpreendido. Quando seria, você age normalmente na primeira rodada.',
        placeholder: true,
    },
]

// ══ 5. OCUPAÇÕES — dados de conteúdo, editáveis pelo mestre ══════════════════
// Espelham a tabela calico_ocupacoes no Supabase. Esta lista é o fallback usado
// quando o banco não responde, para que a criação de ficha nunca trave offline.
const OCUPACOES = [
    { id: 'pistoleiro', nome: 'Pistoleiro', icon: '🔫', habilidadeNome: 'Saque Rápido', habilidadeTexto: 'Uma vez por cena, ao falhar em um teste de Pontaria, gaste 1 PD para rolar esse teste de novo.' },
    { id: 'vaqueiro', nome: 'Vaqueiro', icon: '🤠', habilidadeNome: 'Lida de Campo', habilidadeTexto: '+1 passo em testes de Sobrevivência envolvendo animais, montaria ou terreno aberto.' },
    { id: 'trapaceiro', nome: 'Trapaceiro', icon: '🃏', habilidadeNome: 'Carta na Manga', habilidadeTexto: 'Uma vez por cena, gaste 1 PD para trocar o resultado de um dos seus dados por 4.' },
    { id: 'barbeiro_cirurgiao', nome: 'Barbeiro-cirurgião', icon: '🪒', habilidadeNome: 'Mão Firme', habilidadeTexto: 'Fora de combate, gaste 1 PD para restaurar 1d4 PV a um aliado. Uma vez por aliado por descanso.' },
    { id: 'batedor', nome: 'Batedor', icon: '🧭', habilidadeNome: 'Leitura de Terreno', habilidadeTexto: 'Uma vez por cena, faça uma pergunta ao mestre sobre o ambiente físico. A resposta é verdadeira.' },
    { id: 'pregador', nome: 'Pregador', icon: '🙏', habilidadeNome: 'Palavra de Conforto', habilidadeTexto: 'Uma vez por cena, ajude um aliado em um teste de Disciplina sem gastar sua ação.' },
    { id: 'ferroviario', nome: 'Ferroviário', icon: '🚂', habilidadeNome: 'Homem de Trilho', habilidadeTexto: '+1 passo em testes de Maquinário e em qualquer teste feito dentro ou sobre um trem.' },
    { id: 'garimpeiro', nome: 'Garimpeiro', icon: '💎', habilidadeNome: 'Faro de Rocha', habilidadeTexto: '+1 passo em testes de Engenhoca e Atletismo envolvendo rocha, mina, túnel ou explosivo.' },
]

// ══ 1.9 DIFICULDADES ═════════════════════════════════════════════════════════
const TABELA_DT = [
    { dt: 5, label: 'Trivial sob pressão' },
    { dt: 7, label: 'Padrão' },
    { dt: 10, label: 'Difícil' },
    { dt: 13, label: 'Muito difícil' },
    { dt: 16, label: 'Quase impossível' },
]

// ══ 1.8 AJUDA — perícia d4 não pode ajudar ═══════════════════════════════════
function passosDeAjuda(periciaDoAjudante) {
    const i = indiceDado(periciaDoAjudante)
    if (i <= 0) return 0                       // d4 (ou inválido) não ajuda
    return i >= indiceDado('d10') ? 2 : 1      // d10/d12 → +2 ; d6/d8 → +1
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ 1.2–1.6 MOTOR DE RESOLUÇÃO ═══════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

function rolarDado(dado) { return 1 + Math.floor(Math.random() * faces(dado)) }

/**
 * Calcula o passo líquido aplicado a um dado (§1.4 + §1.8).
 * O teto de ±2 vale só para modificadores situacionais; Ajuda entra depois.
 * Caso de teste #9: −2 situacional + 2 de ajuda → líquido 0.
 */
function calcularPasso(dadoBase, modsSituacionais = [], passosAjuda = 0, cfg = CALICO_CONFIG) {
    const bruto = modsSituacionais.reduce((acc, m) => acc + (typeof m === 'number' ? m : (m.passos || 0)), 0)
    const teto = cfg.tetoPassosSituacionais
    const situacionalAplicado = Math.max(-teto, Math.min(teto, bruto))
    const liquido = situacionalAplicado + (passosAjuda || 0)
    return {
        dadoBase,
        bruto,
        situacionalAplicado,
        truncado: bruto !== situacionalAplicado,
        passosAjuda: passosAjuda || 0,
        liquido,
        dadoFinal: passoDado(dadoBase, liquido),
    }
}

/**
 * Rola um teste completo (§1.2, §1.5, §1.6).
 *
 * dados: array de { dado, origem } — normalmente [atributo, perícia] + extras.
 * Retorna tudo que a UI precisa mostrar: dados individuais, soma, RA, RB,
 * sucesso, crítico e falha crítica.
 */
function rolarTeste({ dados, dt = CALICO_CONFIG.dtPadrao, cfg = CALICO_CONFIG }) {
    // §1.5 — no máximo 4 dados rolados por teste
    const lista = (dados || []).slice(0, cfg.maxDadosRolados)

    const rolados = lista.map(d => {
        const dado = typeof d === 'string' ? d : d.dado
        return {
            dado,
            origem: (typeof d === 'object' && d.origem) || '',
            valor: rolarDado(dado),
            somado: false,
        }
    })

    // §1.5 — no máximo 3 dados somados; havendo mais, somam-se os 3 maiores
    const ordenados = [...rolados].sort((a, b) => b.valor - a.valor)
    ordenados.slice(0, cfg.maxDadosSomados).forEach(d => { d.somado = true })
    const soma = rolados.filter(d => d.somado).reduce((a, d) => a + d.valor, 0)

    // §1.3 — RA e RB são o maior/menor VALOR ROLADO, não o maior dado.
    // §1.5 — calculados sobre TODOS os dados rolados, inclusive os descartados.
    const valores = rolados.map(d => d.valor)
    const ra = valores.length ? Math.max(...valores) : 0
    const rb = valores.length ? Math.min(...valores) : 0

    // §1.6 — crítico: dois ou mais dados com o mesmo valor, e esse valor >= 6
    const contagem = {}
    valores.forEach(v => { contagem[v] = (contagem[v] || 0) + 1 })
    const valorCritico = Object.keys(contagem)
        .map(Number)
        .filter(v => contagem[v] >= 2 && v >= cfg.valorMinimoCritico)
        .sort((a, b) => b - a)[0]
    const critico = valorCritico != null

    // §1.6 — falha crítica: TODOS os dados rolados mostram 1
    const falhaCritica = valores.length > 0 && valores.every(v => v === 1)

    return {
        rolados, soma, ra, rb, dt,
        critico, valorCritico: valorCritico ?? null,
        falhaCritica,
        // dt null significa "não julgue": a mesa anuncia a DT em voz alta e
        // compara a soma na hora. Crítico e falha crítica continuam valendo,
        // porque não dependem de DT (§1.6).
        // Com DT, crítico é sucesso automático independentemente dela (caso #5).
        sucesso: dt == null ? null
            : critico ? true
                : falhaCritica ? false
                    : soma >= dt,
    }
}

// ══ 1.6 TABELA DE FALHA CRÍTICA — role 1d8 ═══════════════════════════════════
const TABELA_FALHA_CRITICA = [
    { d8: 1, nome: 'Vexame', efeito: 'O jogador descreve a ação de forma vergonhosa. Sem efeito mecânico' },
    { d8: 2, nome: 'Machucado', efeito: 'Físico reduz um passo até o fim da cena', aplicar: { tipo: 'passo', alvo: 'fisico', passos: -1 } },
    { d8: 3, nome: 'Desatenção', efeito: 'Mente reduz um passo até o fim da cena', aplicar: { tipo: 'passo', alvo: 'mente', passos: -1 } },
    { d8: 4, nome: 'Irritação', efeito: 'Emoção reduz um passo até o fim da cena', aplicar: { tipo: 'passo', alvo: 'emocao', passos: -1 } },
    { d8: 5, nome: 'Acidente', efeito: 'Perde 1d4 PV', aplicar: { tipo: 'dano', recurso: 'pv', dado: 'd4' } },
    { d8: 6, nome: 'Frustração', efeito: 'Perde 1d4 PD', aplicar: { tipo: 'dano', recurso: 'pd', dado: 'd4' } },
    { d8: 7, nome: 'Perda', efeito: 'Um item carregado se perde ou quebra' },
    { d8: 8, nome: 'Nada', efeito: 'Nenhum efeito adicional' },
]

function rolarFalhaCritica() {
    const v = rolarDado('d8')
    return { valor: v, ...TABELA_FALHA_CRITICA[v - 1] }
}

// §1.7 — testes opostos. Empate: vence a RA mais alta; persistindo, rola de novo.
function resolverTesteOposto(ladoA, ladoB) {
    if (ladoA.soma !== ladoB.soma) return ladoA.soma > ladoB.soma ? 'A' : 'B'
    if (ladoA.ra !== ladoB.ra) return ladoA.ra > ladoB.ra ? 'A' : 'B'
    return 'empate'
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ 6. CRIAÇÃO DE PERSONAGEM ═════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

function periciasIniciais(cfg = CALICO_CONFIG) {
    const p = {}
    PERICIAS.forEach(per => { p[per.key] = 'd4' })
    Object.entries(cfg.orcamentoCriacao.periciasGratuitas || {}).forEach(([k, v]) => { p[k] = v })
    return p
}

// §6.2 — derivados. Recalculam sempre que o atributo ou o nível mudam.
function pvMaximo(fisico, nivel = 1, cfg = CALICO_CONFIG) {
    return (cfg.tabelaPV[fisico] ?? cfg.tabelaPV.d6) + cfg.pvPorNivel * (Math.max(1, nivel) - 1)
}
function pdMaximo(emocao, nivel = 1, cfg = CALICO_CONFIG) {
    return (cfg.tabelaPD[emocao] ?? cfg.tabelaPD.d6) + cfg.pdPorNivel * (Math.max(1, nivel) - 1)
}

/**
 * §10 — teto de uma perícia: o atributo-base + N passos.
 * Caso de teste #17: Físico d4 → Pontaria não passa de d8.
 */
function tetoDaPericia(periciaKey, atributos, cfg = CALICO_CONFIG) {
    const def = PERICIA_POR_KEY[periciaKey]
    if (!def) return 'd12'
    const base = atributos?.[def.attr] || 'd6'
    return passoDado(base, cfg.maxPassosAcimaDoAtributoBase)
}

function periciaExcedeTeto(periciaKey, valor, atributos, cfg = CALICO_CONFIG) {
    return indiceDado(valor) > indiceDado(tetoDaPericia(periciaKey, atributos, cfg))
}

/**
 * Valida uma ficha em criação (spec §6; casos de teste #15, #16, #17).
 * Retorna { valido, erros[], avisos[], resumo }.
 *
 * O orçamento é contado em PASSOS acima do valor inicial de cada perícia — e o
 * valor inicial de Pontaria já é d6 por causa do bônus de ambientação. Assim,
 * gastar orçamento em Pontaria sobe a partir do d6 (§6.6).
 */
function validarCriacao({ nome, perfil, ocupacao, atributos, pericias, aptidaoEspecializacao, arma }, cfg = CALICO_CONFIG) {
    const erros = []
    const avisos = []
    const orc = cfg.orcamentoCriacao

    if (!nome || !String(nome).trim()) erros.push('O nome do personagem é obrigatório.')
    if (!perfil) erros.push('Escolha um Perfil.')
    if (!ocupacao) erros.push('Escolha uma Ocupação.')

    // ── Atributos: precisam bater exatamente com um dos arranjos ─────────────
    const valoresAttr = ATRIBUTOS.map(a => atributos?.[a.key]).filter(Boolean)
    const attrCompletos = valoresAttr.length === ATRIBUTOS.length
    if (!attrCompletos) {
        erros.push('Distribua os três atributos.')
    } else {
        const ordenado = [...valoresAttr].sort((a, b) => indiceDado(b) - indiceDado(a)).join(',')
        const bate = orc.arranjosAtributos.some(arr =>
            [...arr.dados].sort((a, b) => indiceDado(b) - indiceDado(a)).join(',') === ordenado)
        if (!bate) {
            const opcoes = orc.arranjosAtributos.map(a => a.dados.join('/')).join('  ou  ')
            erros.push(`Os atributos precisam formar um dos arranjos: ${opcoes}.`)
        }
    }

    // ── Perícias: orçamento contado em passos ────────────────────────────────
    const base = periciasIniciais(cfg)
    let slotsD8 = 0, slotsD6 = 0

    PERICIAS.forEach(p => {
        const atual = pericias?.[p.key] || base[p.key]
        const passos = passosEntre(base[p.key], atual)
        if (passos < 0) {
            erros.push(`${p.label} está abaixo do valor inicial.`)
        } else if (passos === 1) {
            slotsD6 += 1
        } else if (passos === 2) {
            slotsD8 += 1
        } else if (passos > 2) {
            // Mais de 2 passos numa só perícia não cabe em nenhum slot do orçamento
            slotsD8 += 1
            slotsD6 += (passos - 2)
        }
        if (attrCompletos && periciaExcedeTeto(p.key, atual, atributos, cfg)) {
            const attrLabel = ATRIBUTOS.find(a => a.key === p.attr).label
            erros.push(`${p.label} ${atual} passa do teto: com ${attrLabel} ${atributos[p.attr]}, o máximo é ${tetoDaPericia(p.key, atributos, cfg)}.`)
        }
    })

    if (slotsD8 > orc.periciasD8) erros.push(`Só é possível elevar ${orc.periciasD8} perícia em 2 passos (a "perícia d8"). Marcadas: ${slotsD8}.`)
    if (slotsD6 > orc.periciasD6) erros.push(`Só é possível elevar ${orc.periciasD6} perícias em 1 passo (as "perícias d6"). Marcadas: ${slotsD6}.`)
    if (slotsD8 < orc.periciasD8) avisos.push(`Falta escolher ${orc.periciasD8 - slotsD8} perícia de especialista (d8).`)
    if (slotsD6 < orc.periciasD6) avisos.push(`Faltam ${orc.periciasD6 - slotsD6} perícia(s) treinada(s) (d6).`)

    // ── Aptidão exige especialização quando treinada ─────────────────────────
    const aptidao = pericias?.aptidao || base.aptidao
    if (indiceDado(aptidao) > indiceDado('d4') && !aptidaoEspecializacao) {
        erros.push('Aptidão treinada exige escolher uma especialização.')
    }

    if (!arma) avisos.push('Escolha a arma de fogo inicial.')

    // §14 — Ocultismo deve começar d4 em todo mundo e continuar assim por várias sessões
    if (indiceDado(pericias?.ocultismo || 'd4') > indiceDado('d4')) {
        avisos.push('Ocultismo treinado: nesta campanha ninguém sabe o que é o paranormal ainda. Confirme com o mestre.')
    }

    return {
        valido: erros.length === 0 && slotsD8 === orc.periciasD8 && slotsD6 === orc.periciasD6,
        erros, avisos,
        resumo: { slotsD8, slotsD6, maxD8: orc.periciasD8, maxD6: orc.periciasD6 },
    }
}

/**
 * Monta o objeto `stats` que vai para characters.stats (jsonb).
 *
 * PV usa as chaves hp/hp_max e PD usa sanity/sanity_max de propósito: assim o
 * Calico reaproveita toda a infra que já existe (barra do card, flash, socket
 * stat_update, indicador de morte). Só os RÓTULOS mudam, para PV e PD.
 */
function montarStats({ perfil, ocupacao, atributos, pericias, aptidaoEspecializacao, arma, nivel = 1 }, opts = {}) {
    const cfg = opts.cfg || CALICO_CONFIG
    const perfilDef = (opts.perfis || PERFIS).find(p => p.id === perfil)
    const ocupacaoDef = (opts.ocupacoes || OCUPACOES).find(o => o.id === ocupacao)

    const pvMax = pvMaximo(atributos.fisico, nivel, cfg)
    const pdMax = pdMaximo(atributos.emocao, nivel, cfg)

    const habilidades = []
    if (perfilDef) habilidades.push({
        origem: 'perfil', origemId: perfilDef.id,
        nome: perfilDef.habilidadeNome, descricao: perfilDef.habilidadeTexto,
        placeholder: !!perfilDef.placeholder,
    })
    if (ocupacaoDef) habilidades.push({
        origem: 'ocupacao', origemId: ocupacaoDef.id,
        nome: ocupacaoDef.habilidadeNome, descricao: ocupacaoDef.habilidadeTexto,
    })

    // §6.3 — a arma de fogo escolhida + a faca que todo personagem começa com
    const armas = []
    const armaDef = ARMAS_POR_ID[arma]
    if (armaDef) armas.push(instanciarArma(armaDef))
    armas.push(instanciarArma(ARMAS_POR_ID.faca))

    return {
        sistema: 'calico-v1',
        nivel,
        perfil: perfil || null,
        ocupacao: ocupacao || null,

        // PV / PD — mesmo peso visual, sempre (§14)
        hp: pvMax, hp_max: pvMax,
        sanity: pdMax, sanity_max: pdMax,

        fisico: atributos.fisico, mente: atributos.mente, emocao: atributos.emocao,

        pericias: { ...periciasIniciais(cfg), ...pericias },
        aptidao_especializacao: aptidaoEspecializacao || null,

        habilidades,
        armas,
        condicoes: [],
        testes_morte: { vigor: 0, disciplina: 0 },

        anotacoes: '',
        historico: '',
    }
}

// §6.3 — equipamento inicial. Inventário é texto livre; só munição é rastreada.
const EQUIPAMENTO_INICIAL = [
    'Faca', 'Roupa de viagem', 'Chapéu', 'Cantil', 'Fósforos', 'Corda', 'Cavalo com sela',
]

// ══════════════════════════════════════════════════════════════════════════════
// ══ 7. COMBATE — [LB] estrutura + [HB] números ═══════════════════════════════
// ══ Bloco isolado: será substituído quando sair o playtest oficial de combate. ═
// ══════════════════════════════════════════════════════════════════════════════

const TIPOS_DANO = ['balistico', 'corte', 'impacto', 'perfuracao', 'fogo', 'frio', 'eletricidade', 'quimico', 'mental', 'paranormal']
const ELEMENTOS_PARANORMAIS = ['conhecimento', 'energia', 'medo', 'morte', 'sangue']

// §7.5 dano + §7.7 munição
const ARMAS = [
    { id: 'desarmado', nome: 'Desarmado / coronhada', dano: 'RB', bonus: 0, base: 'rb', tipo: 'impacto', fogo: false, capacidade: null, recarga: null },
    { id: 'faca', nome: 'Faca', dano: 'RA', bonus: 0, base: 'ra', tipo: 'corte', fogo: false, capacidade: null, recarga: null },
    { id: 'cabo_picareta', nome: 'Cabo de picareta / garrafa', dano: 'RA', bonus: 0, base: 'ra', tipo: 'impacto', fogo: false, capacidade: null, recarga: null },
    { id: 'revolver', nome: 'Revólver de ação simples', dano: 'RA+1', bonus: 1, base: 'ra', tipo: 'balistico', fogo: true, capacidade: 6, recarga: 'acao_completa', recargaLabel: 'Ação completa (recarrega tudo)', inicial: true },
    { id: 'winchester', nome: 'Winchester de alavanca', dano: 'RA+2', bonus: 2, base: 'ra', tipo: 'balistico', fogo: true, capacidade: 12, recarga: 'movimento_por_cartucho', recargaLabel: '1 cartucho por ação de movimento', inicial: true },
    { id: 'escopeta', nome: 'Escopeta de cano duplo', dano: 'RA+3', bonus: 3, base: 'ra', tipo: 'balistico', fogo: true, capacidade: 2, recarga: 'acao_padrao', recargaLabel: 'Ação padrão (recarrega tudo)', inicial: true, nota: 'RA+3 no alcance curto; apenas RA em alcance médio ou maior' },
    { id: 'fuzil_caca', nome: 'Fuzil de caça de ferrolho', dano: 'RA+2', bonus: 2, base: 'ra', tipo: 'balistico', fogo: true, capacidade: 5, recarga: 'acao_completa', recargaLabel: 'Ação completa', inicial: true },
    { id: 'dinamite', nome: 'Dinamite', dano: 'RA+3', bonus: 3, base: 'ra', tipo: 'fogo', fogo: false, capacidade: null, recarga: null, nota: 'Dano em área; Acrobacia DT 10 reduz à metade' },
    { id: 'tocha', nome: 'Tocha / lampião quebrado', dano: 'RA', bonus: 0, base: 'ra', tipo: 'fogo', fogo: false, capacidade: null, recarga: null, nota: 'Aplica a condição queimando' },
]
const ARMAS_POR_ID = Object.fromEntries(ARMAS.map(a => [a.id, a]))
const ARMAS_INICIAIS = ARMAS.filter(a => a.inicial)

function instanciarArma(def) {
    return {
        id: def.id, nome: def.nome, dano: def.dano, tipo: def.tipo,
        capacidade: def.capacidade, municao: def.capacidade,
        recarga: def.recarga, recargaLabel: def.recargaLabel || null,
        fogo: !!def.fogo, nota: def.nota || null,
        // §6.3 — munição para a arma inicial: 2 recargas completas
        recargas: def.capacidade ? 2 : null,
    }
}

/**
 * §7.5 — dano. Base = RA se armado, RB se desarmado. O bônus da arma soma antes
 * do multiplicador. Crítico dobra o dano final (triplica para armas de fogo se a
 * flag criticoArmasFogoX3 estiver ligada).
 * Caso de teste #14: revólver, RA 6, flag off → (6 + 1) × 2 = 14.
 */
function calcularDano({ ra, rb, arma, critico = false, cfg = CALICO_CONFIG }) {
    const def = typeof arma === 'string' ? ARMAS_POR_ID[arma] : (arma || ARMAS_POR_ID.desarmado)
    const raiz = (def && def.base === 'rb') ? rb : ra
    const bonus = (def && def.bonus) || 0
    const comBonus = raiz + bonus
    const multiplicador = !critico ? 1 : ((cfg.criticoArmasFogoX3 && def && def.fogo) ? 3 : 2)
    const rotuloBase = (def && def.base === 'rb') ? 'RB' : 'RA'
    return {
        base: raiz, bonus, comBonus,
        multiplicador, total: comBonus * multiplicador,
        tipo: (def && def.tipo) || 'impacto',
        conta: `${rotuloBase} ${raiz}${bonus ? ` + ${bonus}` : ''}${multiplicador > 1 ? ` × ${multiplicador} (crítico)` : ''} = ${comBonus * multiplicador}`,
    }
}

// §7.6 — modificadores situacionais. Os ±2/±5 do livro base viraram passos.
// "Cobertura total" não entra na lista: o alvo simplesmente não pode ser alvo.
//
// NOTA: esta tabela não é mais desenhada na tela de testes — o mestre consulta e
// anuncia na mesa ("cobertura leve, desce um passo") e o jogador aplica no
// controle de passos. Ela fica aqui como referência de regra, junto com
// TABELA_DT e passosDeAjuda, que seguem o mesmo caminho.
const MODIFICADORES_SITUACIONAIS = [
    { id: 'cobertura_leve', label: 'Alvo sob cobertura leve (banco, batente, pedra, cavalo)', passos: -1 },
    { id: 'cobertura_pesada', label: 'Alvo sob cobertura pesada (porta blindada, parede, trincheira)', passos: -2 },
    { id: 'alvo_desprevenido', label: 'Alvo desprevenido ou surpreendido', passos: 1 },
    { id: 'alvo_caido_distancia', label: 'Alvo caído, ataque à distância', passos: -1 },
    { id: 'alvo_caido_corpo', label: 'Alvo caído, ataque corpo a corpo', passos: 1 },
    { id: 'atacante_caido', label: 'Atacante caído', passos: -1 },
    { id: 'posicao_elevada', label: 'Atacante em posição elevada', passos: 1 },
    { id: 'flanqueando', label: 'Flanqueando, corpo a corpo', passos: 1 },
    { id: 'escuridao_parcial', label: 'Escuridão parcial, fumaça, poeira', passos: -1 },
    { id: 'escuridao_total', label: 'Escuridão total', passos: -2 },
    { id: 'fora_de_alcance', label: 'Alvo além do alcance normal da arma', passos: -1 },
]

// §7.4 — Esquiva: o alvo abre mão de revidar e recebe +d6 no teste de defesa.
const DADO_ESQUIVA = 'd6'

// §7.3 — economia de ações
const ECONOMIA_ACOES = [
    { tipo: 'Padrão', exemplos: 'Atacar, usar habilidade, ajudar, ação de investigação' },
    { tipo: 'Movimento', exemplos: 'Deslocar-se, levantar, sacar arma, abrir porta, montar' },
    { tipo: 'Completa', exemplos: 'Recarregar revólver, arrombar, mirar e atirar com precisão' },
    { tipo: 'Livre', exemplos: 'Gritar uma ordem curta, largar item, jogar-se no chão' },
    { tipo: 'Reação', exemplos: 'Esquivar, teste de Percepção involuntário' },
]

// §7.8 — condições
const CONDICOES = [
    { id: 'caido', nome: 'Caído', icon: '🩹', efeito: 'Ataques à distância contra você têm −1 passo; corpo a corpo têm +1. Levantar custa uma ação de movimento' },
    { id: 'desprevenido', nome: 'Desprevenido', icon: '😶', efeito: 'Atacantes recebem +1 passo contra você' },
    { id: 'agarrado', nome: 'Agarrado', icon: '🪢', efeito: 'Imóvel e desprevenido. Sair: ação padrão, teste oposto de Luta' },
    { id: 'atordoado', nome: 'Atordoado', icon: '💫', efeito: 'Perde a próxima ação padrão' },
    { id: 'sangrando', nome: 'Sangrando', icon: '🩸', efeito: 'Perde 1 PV no início de cada turno seu até alguém gastar uma ação e passar em MENTE + Medicina DT 7' },
    { id: 'queimando', nome: 'Queimando', icon: '🔥', efeito: 'Perde 1d4 PV de dano fogo no início de cada turno seu. Apagar: ação completa + FÍSICO + Atletismo DT 7' },
    { id: 'abalado', nome: 'Abalado', icon: '😰', efeito: '−1 passo em testes de EMOÇÃO até o fim da cena' },
]
const CONDICAO_POR_ID = Object.fromEntries(CONDICOES.map(c => [c.id, c]))

/**
 * §7.9 / §7.10 — ferimentos, morte e traumas.
 * DT do primeiro teste é 7; cada teste subsequente sobe +3.
 * Caso de teste #11: 0 PV com dano 3 vezes → DT 7, 10, 13.
 */
function dtTesteDeMorte(testesJaFeitos, cfg = CALICO_CONFIG) {
    return cfg.dtPadrao + 3 * Math.max(0, testesJaFeitos || 0)
}

const TESTES_DE_MORTE = {
    vigor: { key: 'vigor', label: 'Vigor', atributo: 'fisico', pericia: 'vigor', recurso: 'PV', gatilho: 'Reduzido a 0 PV, ou sofrer dano já em 0 PV', falha: 'Morte' },
    disciplina: { key: 'disciplina', label: 'Disciplina', atributo: 'emocao', pericia: 'disciplina', recurso: 'PD', gatilho: 'Reduzido a 0 PD, ou sofrer dano emocional já em 0 PD', falha: 'Colapso mental e morte' },
}

// §7.11 — medo e contato paranormal
const MEDO_PARANORMAL = {
    teste: 'emocao + disciplina',
    dtNormal: 7, pdSucessoNormal: 1, pdFalhaNormal: 3,
    dtMaior: 10, pdSucessoMaior: 2, pdFalhaMaior: 4,
    condicaoNaFalha: 'abalado',
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ 8. INVESTIGAÇÃO ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

/**
 * §8.2 — ação INVESTIGAR.
 * A comparação inicial é entre a DT da informação e o VALOR DO DADO da perícia
 * (4, 6, 8, 10, 12) — não contra uma rolagem. Percepção d8 revela sozinha toda
 * informação de Percepção com DT 6 e 8. Caso de teste #12.
 */
function investigar(informacoes, periciaKey, dadoDaPericia) {
    const valor = faces(dadoDaPericia)
    return (informacoes || []).filter(i => i.pericia === periciaKey && i.dt <= valor && !i.revelada)
}

/** §8.2 — ação EXAMINAR. Rola a perícia; sem informação nova, perde 1 PD. */
function examinar(informacoes, periciaKey, resultadoDaRolagem) {
    const novas = (informacoes || [])
        .filter(i => i.pericia === periciaKey && !i.revelada && i.dt <= resultadoDaRolagem)
    return { novas, custoPD: novas.length === 0 ? 1 : 0 }
}

const ACOES_INVESTIGACAO = [
    { id: 'investigar', nome: 'Investigar', acao: 'Padrão', regra: 'Escolhe um ponto de interesse, declara uma perícia e seu valor. O mestre revela todas as informações daquela perícia com DT ≤ ao valor do dado. Depois, pode Examinar ou Interagir' },
    { id: 'examinar', nome: 'Examinar', acao: 'Padrão', regra: 'Rola a perícia escolhida. Resultado ≥ DT de uma informação ainda não revelada → recebe a informação. Não revelando nada novo, perde 1 PD' },
    { id: 'interagir', nome: 'Interagir', acao: 'Padrão', regra: 'Descreve uma ação física com o ponto de interesse. O mestre resolve pela descrição contextual. Sem rolagem por padrão' },
    { id: 'recapitular', nome: 'Recapitular', acao: 'Padrão', regra: 'Recapitula em voz alta tudo que o grupo já sabe. Se coerente: EMOÇÃO + Intuição DT 10 → nova pista. Uma vez por personagem por cena', usosPorCena: 1 },
    { id: 'compartilhar', nome: 'Compartilhar', acao: 'Padrão', regra: 'Interpreta o personagem explicando uma pista a um aliado. O aliado faz MENTE + Pesquisar DT 10 como ação livre → nova pista. Uma vez por personagem por cena', usosPorCena: 1 },
    { id: 'habilidade', nome: 'Usar habilidade ou item', acao: 'Varia', regra: 'A critério do mestre; normalmente concede +1 passo' },
]

// §8.3 — DESTRANCAR. Tentativas por rodada conforme o valor de Crime.
const TENTATIVAS_DESTRANCAR = { d4: 1, d6: 2, d8: 3, d10: 4, d12: 5 }

function tentativasDestrancar(crimeDie) { return TENTATIVAS_DESTRANCAR[crimeDie] ?? 1 }

/** §8.3 — compara o palpite com a senha, posição por posição. */
function conferirDestrancar(senha, palpite, modoImersao = false) {
    const SONS = { baixo: 'tic', exato: 'click', alto: 'toc' }
    return (senha || []).map((s, i) => {
        const p = palpite ? palpite[i] : undefined
        const r = p === s ? 'exato' : (p < s ? 'baixo' : 'alto')
        // No modo imersão o jogador ouve o som, mas não sabe qual é qual
        return modoImersao ? { resposta: r, som: SONS[r] } : { resposta: r }
    })
}

function gerarSenhaDestrancar(numDados) {
    return Array.from({ length: Math.max(1, numDados || 3) }, () => rolarDado('d6'))
}

// ══ 9. NOTORIEDADE — trilha do grupo, 0 a 4 ══════════════════════════════════
const NOTORIEDADE = [
    { nivel: 0, label: 'Anônimos', efeito: 'Testes sociais na DT normal', dtSocial: null },
    { nivel: 1, label: 'Anônimos', efeito: 'Testes sociais na DT normal', dtSocial: null },
    { nivel: 2, label: 'Boatos', efeito: 'Persuasão e Enganação na cidade sobem para DT 10', dtSocial: 10, periciasAfetadas: ['persuasao', 'enganacao'] },
    { nivel: 3, label: 'Rosto em cartaz', efeito: 'DT 10 em qualquer teste social; PNJs neutros tornam-se hostis', dtSocial: 10, periciasAfetadas: 'todas_sociais' },
    { nivel: 4, label: 'Sem proteção possível', efeito: 'Consequências narrativas definidas pelo mestre', dtSocial: 10, periciasAfetadas: 'todas_sociais' },
]

// ══════════════════════════════════════════════════════════════════════════════
// ══ 10. PROGRESSÃO — [HB] ════════════════════════════════════════════════════
// ══ Bloco isolado: será substituído quando sair o playtest oficial. ══════════
// ══════════════════════════════════════════════════════════════════════════════

/** Ganhos ao ATINGIR o nível informado (2 a 10). */
function ganhosDoNivel(nivel) {
    const ganhos = []
    if (nivel >= 2 && nivel % 2 === 0) ganhos.push({ tipo: 'pericia', texto: '+1 passo em uma perícia (teto d12)' })
    if (nivel >= 3 && nivel % 2 === 1) ganhos.push({ tipo: 'escolha', texto: '+1 passo em um atributo (teto d12) OU treinar duas perícias de d4 para d6' })
    if ([3, 6, 9].includes(nivel)) ganhos.push({ tipo: 'habilidade', texto: '+1 habilidade adicional, do perfil ou da ocupação' })
    ganhos.push({ tipo: 'recursos', texto: '+2 PV e +2 PD máximos' })
    return ganhos
}

module.exports = {
    CALICO_CONFIG,
    ESCALA_DADOS, DADO_PARANORMAL, ESCALA_ATRIBUTO, ESCALA_PERICIA,
    faces, indiceDado, passoDado, passosEntre, rolarDado,
    ATRIBUTOS, PERICIAS, PERICIA_POR_KEY, APTIDAO_ESPECIALIZACOES,
    PERFIS, OCUPACOES,
    TABELA_DT, passosDeAjuda,
    calcularPasso, rolarTeste, rolarFalhaCritica, resolverTesteOposto, TABELA_FALHA_CRITICA,
    periciasIniciais, pvMaximo, pdMaximo, tetoDaPericia, periciaExcedeTeto,
    validarCriacao, montarStats, EQUIPAMENTO_INICIAL,
    TIPOS_DANO, ELEMENTOS_PARANORMAIS,
    ARMAS, ARMAS_POR_ID, ARMAS_INICIAIS, instanciarArma, calcularDano,
    MODIFICADORES_SITUACIONAIS, DADO_ESQUIVA, ECONOMIA_ACOES,
    CONDICOES, CONDICAO_POR_ID,
    dtTesteDeMorte, TESTES_DE_MORTE, MEDO_PARANORMAL,
    investigar, examinar, ACOES_INVESTIGACAO,
    TENTATIVAS_DESTRANCAR, tentativasDestrancar, conferirDestrancar, gerarSenhaDestrancar,
    NOTORIEDADE, ganhosDoNivel,
}
