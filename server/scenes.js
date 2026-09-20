const fs = require('fs')
const path = require('path')

// ══════════════════════════════════════════════════════════════════════════════
// ── ONDE GUARDAR AS CENAS ────────────────────────────────────────────────────
//
// Este arquivo era a ÚNICA parte do servidor que dependia do Electron
// (`electron.app.getPath('userData')`), e por isso o backend não rodava fora do
// app. Agora a pasta se resolve em três tentativas, nesta ordem:
//
//   1. SCENES_DIR no ambiente        → é o que a VPS usa
//   2. userData do Electron          → quando roda dentro do app do mestre
//   3. ./cenas ao lado do projeto    → último recurso
//
// ── ORGANIZAÇÃO ──────────────────────────────────────────────────────────────
//
// Cada sala tem a sua subpasta:  SCENES_DIR/<CODIGO>/scene_<ts>.<ext>
//
// Antes era tudo solto na raiz, com nome só de timestamp — não dava para saber
// que arquivo era de qual mesa, então não dava para limpar quando a sala
// fechasse. Os vídeos de fundo são os maiores arquivos que trafegam aqui, e
// ficavam ocupando disco para sempre.
// ══════════════════════════════════════════════════════════════════════════════
function resolverPastaDeCenas() {
    if (process.env.SCENES_DIR) return process.env.SCENES_DIR

    try {
        // require dentro de try: fora do Electron este módulo simplesmente não existe
        const { app: electronApp } = require('electron')
        if (electronApp && typeof electronApp.getPath === 'function') {
            return path.join(electronApp.getPath('userData'), 'scenes')
        }
    } catch (e) { /* rodando standalone, segue para o próximo */ }

    return path.join(process.cwd(), 'cenas')
}

const SCENES_DIR = resolverPastaDeCenas()
if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true })
console.log('[Cena] Pasta de cenas:', SCENES_DIR)

// Um vídeo de fundo é o maior arquivo que trafega aqui. Sem teto, um upload
// errado enche o disco da VPS.
const TAMANHO_MAXIMO = parseInt(process.env.SCENE_MAX_MB, 10) > 0
    ? parseInt(process.env.SCENE_MAX_MB, 10) * 1024 * 1024
    : 150 * 1024 * 1024

// Quantos arquivos manter POR SALA. É uma rede de segurança: a limpeza de
// verdade acontece quando a sala fecha.
const MANTER_ARQUIVOS = parseInt(process.env.SCENE_KEEP, 10) || 30

const EXTENSOES_OK = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp',
    'mp4', 'webm', 'ogg', 'mov', 'mkv',
])

/** Só letras e números, para o código da sala nunca virar travessia de pasta. */
function sanitizarSala(bruto) {
    const limpo = String(bruto || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    return limpo.slice(0, 12) || null
}

function pastaDaSala(roomCode) {
    const sala = sanitizarSala(roomCode)
    return sala ? path.join(SCENES_DIR, sala) : SCENES_DIR
}

/** Apaga as cenas mais antigas de uma pasta, mantendo as N mais recentes. */
function podarCenasAntigas(pasta = SCENES_DIR) {
    try {
        if (!fs.existsSync(pasta)) return
        const arquivos = fs.readdirSync(pasta, { withFileTypes: true })
            .filter(d => d.isFile())
            .map(d => {
                const completo = path.join(pasta, d.name)
                try { return { nome: d.name, completo, mtime: fs.statSync(completo).mtimeMs } }
                catch (e) { return null }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime)

        arquivos.slice(MANTER_ARQUIVOS).forEach(f => {
            try { fs.unlinkSync(f.completo); console.log('[Cena] Antiga removida:', f.nome) }
            catch (e) { /* já sumiu */ }
        })
    } catch (e) {
        console.warn('[Cena] Falha ao podar antigas:', e.message)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── LIMPEZA ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apaga tudo que a sala enviou. Chamado quando a sala fecha — é o que impede
 * os vídeos de fundo de ficarem ocupando disco depois da sessão acabar.
 */
function limparCenasDaSala(roomCode) {
    const sala = sanitizarSala(roomCode)
    if (!sala) return 0

    const pasta = path.join(SCENES_DIR, sala)
    if (!fs.existsSync(pasta)) return 0

    try {
        const n = fs.readdirSync(pasta).length
        const bytes = fs.readdirSync(pasta).reduce((soma, nome) => {
            try { return soma + fs.statSync(path.join(pasta, nome)).size } catch (e) { return soma }
        }, 0)

        fs.rmSync(pasta, { recursive: true, force: true })
        console.log(`[Cena] Sala ${sala} fechada: ${n} arquivo(s) apagado(s), ${(bytes / 1024 / 1024).toFixed(1)} MB liberados`)
        return n
    } catch (e) {
        console.warn(`[Cena] Falha ao limpar a sala ${sala}:`, e.message)
        return 0
    }
}

/**
 * Apaga pastas de salas que não existem mais.
 *
 * Como as salas vivem em memória, um reinício do servidor deixa TODAS as pastas
 * órfãs — por isso isto roda na inicialização. Também serve de rede de
 * segurança caso alguma sala feche sem passar pelo caminho normal.
 */
function limparCenasOrfas(codigosAtivos = []) {
    const ativos = new Set(codigosAtivos.map(c => sanitizarSala(c)).filter(Boolean))
    let pastas = 0, arquivos = 0

    try {
        fs.readdirSync(SCENES_DIR, { withFileTypes: true }).forEach(d => {
            if (!d.isDirectory()) return
            const sala = sanitizarSala(d.name)
            if (sala && ativos.has(sala)) return

            const pasta = path.join(SCENES_DIR, d.name)
            try {
                arquivos += fs.readdirSync(pasta).length
                fs.rmSync(pasta, { recursive: true, force: true })
                pastas++
            } catch (e) { /* segue */ }
        })

        // Arquivos soltos na raiz: legado de antes das subpastas
        podarCenasAntigas(SCENES_DIR)
    } catch (e) {
        console.warn('[Cena] Falha ao limpar órfãs:', e.message)
    }

    if (pastas) console.log(`[Cena] ${pastas} pasta(s) órfã(s) removida(s), ${arquivos} arquivo(s)`)
    return pastas
}

/** Quanto disco as cenas estão ocupando — aparece no /health. */
function tamanhoDasCenas() {
    let bytes = 0, arquivos = 0
    const andar = dir => {
        try {
            fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
                const completo = path.join(dir, d.name)
                if (d.isDirectory()) return andar(completo)
                try { bytes += fs.statSync(completo).size; arquivos++ } catch (e) { }
            })
        } catch (e) { }
    }
    andar(SCENES_DIR)
    return { bytes, arquivos, mb: +(bytes / 1024 / 1024).toFixed(1) }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ROTAS ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function setupSceneRoutes(app, express) {
    // Upload de cena (arquivo bruto no body)
    app.post('/upload-scene', (req, res) => {
        const ext = (req.headers['x-file-ext'] || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase()

        if (!EXTENSOES_OK.has(ext)) {
            return res.status(415).json({ error: `Extensão não aceita: ${ext}` })
        }

        // A sala vai no cabeçalho para o arquivo cair na pasta certa, e assim
        // poder ser apagado junto com ela
        const sala = sanitizarSala(req.headers['x-room-code'])
        const pasta = sala ? path.join(SCENES_DIR, sala) : SCENES_DIR
        try {
            if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true })
        } catch (e) {
            return res.status(500).json({ error: 'Falha ao preparar a pasta da sala' })
        }

        const filename = `scene_${Date.now()}.${ext}`
        const filepath = path.join(pasta, filename)
        const chunks = []
        let recebido = 0
        let abortado = false

        req.on('data', chunk => {
            if (abortado) return
            recebido += chunk.length
            if (recebido > TAMANHO_MAXIMO) {
                abortado = true
                res.status(413).json({
                    error: `Arquivo passa do limite de ${Math.round(TAMANHO_MAXIMO / 1024 / 1024)} MB`,
                })
                req.destroy()
                return
            }
            chunks.push(chunk)
        })

        req.on('end', () => {
            if (abortado) return
            try {
                fs.writeFileSync(filepath, Buffer.concat(chunks))
                const rota = sala ? `/scenes/${sala}/${filename}` : `/scenes/${filename}`
                res.json({ ok: true, scenePath: rota })
                console.log(`[Cena] ${sala || '(sem sala)'}: ${filename} (${(recebido / 1024 / 1024).toFixed(1)} MB)`)
                podarCenasAntigas(pasta)
            } catch (e) {
                console.error('[Cena] Erro ao salvar:', e)
                res.status(500).json({ error: 'Falha ao salvar arquivo' })
            }
        })

        req.on('error', () => {
            if (!abortado && !res.headersSent) res.status(500).json({ error: 'Erro no upload' })
        })
    })

    // Serve arquivos de cena estáticos (inclusive as subpastas por sala)
    app.use('/scenes', express.static(SCENES_DIR, { maxAge: '1h' }))
}

module.exports = {
    setupSceneRoutes, SCENES_DIR,
    podarCenasAntigas, limparCenasDaSala, limparCenasOrfas, tamanhoDasCenas,
    sanitizarSala, pastaDaSala,
}
