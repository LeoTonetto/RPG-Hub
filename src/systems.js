// ══ Definições de sistemas de RPG ══════════════════════════════════════════════

const SYSTEMS = {
    'som-das-seis': {
        label: 'Som das Seis',
        defaultStats: {
            hp: 6, hp_max: 6,
            defesa: 5,
            iniciativa: 1,
            acoes_combate: 1,
            dinheiro: 150,
            fisico: 0, intelecto: 0, agilidade: 0, coragem: 0,
            // Antecedentes
            combate: 0, labuta: 0, negocios: 0, montaria: 0,
            tradicao: 0, exploracao: 0, roubo: 0, medicina: 0,
            // Habilidades — array de { nome, descricao }
            habilidades: []
        },
        attributePoints: 4,
        attributes: [
            { key: 'fisico', label: 'Físico', icon: '💪' },
            { key: 'intelecto', label: 'Intelecto', icon: '🧠' },
            { key: 'agilidade', label: 'Agilidade', icon: '⚡' },
            { key: 'coragem', label: 'Coragem', icon: '🔥' },
        ],
        antecedentes: [
            { key: 'combate', label: 'Combate', icon: '⚔' },
            { key: 'labuta', label: 'Labuta', icon: '⛏' },
            { key: 'negocios', label: 'Negócios', icon: '💰' },
            { key: 'montaria', label: 'Montaria', icon: '🐴' },
            { key: 'tradicao', label: 'Tradição', icon: '📜' },
            { key: 'exploracao', label: 'Exploração', icon: '🧭' },
            { key: 'roubo', label: 'Roubo', icon: '🗝' },
            { key: 'medicina', label: 'Medicina', icon: '⚕' },
        ],
        hasHabilidades: true,
        hasDinheiro: true,
        cardBars: [
            { key: 'hp', maxKey: 'hp_max', label: 'Vida', fillClass: 'hp-fill' },
        ],
        cardExtras: [
            { label: 'DEF', key: 'defesa' },
        ],
        popupStats: [
            { key: 'hp', maxKey: 'hp_max', label: '❤ Vida', hasMax: true, flashField: 'hp' },
            { key: 'defesa', label: '🛡 Defesa', hasMax: false },
            { key: 'iniciativa', label: '⚔ Iniciativa', hasMax: false },
            { key: 'acoes_combate', label: '🎯 Ações', hasMax: false },
        ],
    },

    // ── Calico — homebrew de Ordem Paranormal II para Velho Oeste (1890) ─────
    // Sistema de dados (d4…d12), não de pontos. A criação de ficha e a ficha em
    // si são renderizadas por calicoCreate.js / calicoSheet.js — é isso que a
    // flag `module` sinaliza para characters.js e statPopup.js.
    //
    // PV usa hp/hp_max e PD usa sanity/sanity_max de propósito: assim o Calico
    // reaproveita a barra do card, o flash, o socket stat_update e o indicador
    // de morte que já existem. Só os rótulos mudam.
    'calico': {
        label: 'Calico',
        module: 'calico',
        defaultStats: {
            sistema: 'calico-v1', nivel: 1,
            hp: 12, hp_max: 12, sanity: 10, sanity_max: 10,
            fisico: 'd8', mente: 'd6', emocao: 'd6',
            pericias: {}, habilidades: [], armas: [], condicoes: [],
            testes_morte: { vigor: 0, disciplina: 0 },
        },
        attributePoints: 0,
        attributes: [],
        antecedentes: [],
        hasHabilidades: false,   // habilidades têm painel próprio no Calico
        hasDinheiro: false,      // o sistema não usa dinheiro como stat
        cardBars: [
            { key: 'hp', maxKey: 'hp_max', label: 'PV', fillClass: 'hp-fill' },
            // §14 — o PD recebe o mesmo destaque visual do PV, nunca menos
            { key: 'sanity', maxKey: 'sanity_max', label: 'PD', fillClass: 'pd-fill' },
        ],
        cardExtras: [
            { label: 'NV', key: 'nivel' },
        ],
        // O card mostra as condicoes ativas para a mesa inteira ver o estado
        // do personagem sem precisar abrir a ficha (§7.8)
        cardCondicoes: true,
        popupStats: [
            { key: 'hp', maxKey: 'hp_max', label: '❤ PV', hasMax: true, flashField: 'hp' },
            { key: 'sanity', maxKey: 'sanity_max', label: '🕯 PD', hasMax: true, flashField: 'sanity' },
        ],
    },

    'coc': {
        label: 'Call of Cthulhu',
        defaultStats: { hp: 10, hp_max: 10, sanity: 50, sanity_max: 50, bullets: null },
        attributePoints: 0,
        attributes: [],
        antecedentes: [],
        hasHabilidades: false,
        hasDinheiro: false,
        cardBars: [
            { key: 'hp', maxKey: 'hp_max', label: 'Vida', fillClass: 'hp-fill' },
            { key: 'sanity', maxKey: 'sanity_max', label: 'Sanidade', fillClass: 'san-fill' },
        ],
        cardExtras: [],
        popupStats: [
            { key: 'hp', maxKey: 'hp_max', label: '❤ Vida', hasMax: true, flashField: 'hp' },
            { key: 'sanity', maxKey: 'sanity_max', label: '🧠 Sanidade', hasMax: true, flashField: 'sanity' },
            { key: 'bullets', label: '🔫 Balas', hasMax: false },
        ],
    },

    'dnd': {
        label: 'D&D 5e',
        defaultStats: { hp: 10, hp_max: 10 },
        attributePoints: 0,
        attributes: [],
        antecedentes: [],
        hasHabilidades: false,
        hasDinheiro: false,
        cardBars: [{ key: 'hp', maxKey: 'hp_max', label: 'Vida', fillClass: 'hp-fill' }],
        cardExtras: [],
        popupStats: [{ key: 'hp', maxKey: 'hp_max', label: '❤ Vida', hasMax: true, flashField: 'hp' }],
    },

    'op': {
        label: 'Ordem Paranormal',
        defaultStats: { hp: 12, hp_max: 12, sanity: 10, sanity_max: 10 },
        attributePoints: 0,
        attributes: [],
        antecedentes: [],
        hasHabilidades: false,
        hasDinheiro: false,
        cardBars: [
            { key: 'hp', maxKey: 'hp_max', label: 'Vida', fillClass: 'hp-fill' },
            { key: 'sanity', maxKey: 'sanity_max', label: 'Sanidade', fillClass: 'san-fill' },
        ],
        cardExtras: [],
        popupStats: [
            { key: 'hp', maxKey: 'hp_max', label: '❤ Vida', hasMax: true, flashField: 'hp' },
            { key: 'sanity', maxKey: 'sanity_max', label: '🧠 Sanidade', hasMax: true, flashField: 'sanity' },
        ],
    },
}

const SYSTEM_ORDER = ['som-das-seis', 'calico', 'coc', 'dnd', 'op']

module.exports = { SYSTEMS, SYSTEM_ORDER }
