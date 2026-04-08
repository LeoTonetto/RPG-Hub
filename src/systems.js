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

const SYSTEM_ORDER = ['som-das-seis', 'coc', 'dnd', 'op']

module.exports = { SYSTEMS, SYSTEM_ORDER }
