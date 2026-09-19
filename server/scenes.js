const fs = require('fs')
const path = require('path')
const os = require('os')

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

// Quantos arquivos manter. As cenas antigas não servem para nada depois que a
// sessão acaba, e na VPS o disco é finito.
const MANTER_ARQUIVOS = parseInt(process.env.SCENE_KEEP, 10) || 30

const EXTENSOES_OK = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp',
    'mp4', 'webm', 'ogg', 'mov', 'mkv',
])

/** Apaga as cenas mais antigas, mantendo as N mais recentes. */
function podarCenasAntigas() {
    try {
        const arquivos = fs.readdirSync(SCENES_DIR)
            .map(nome => {
                const completo = path.join(SCENES_DIR, nome)
                try { return { nome, completo, mtime: fs.statSync(completo).mtimeMs } }
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

function setupSceneRoutes(app, express) {
    // Upload de cena (arquivo bruto no body)
    app.post('/upload-scene', (req, res) => {
        const ext = (req.headers['x-file-ext'] || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase()

        if (!EXTENSOES_OK.has(ext)) {
            return res.status(415).json({ error: `Extensão não aceita: ${ext}` })
        }

        const filename = `scene_${Date.now()}.${ext}`
        const filepath = path.join(SCENES_DIR, filename)
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
                res.json({ ok: true, scenePath: `/scenes/${filename}` })
                console.log(`[Cena] Arquivo salvo: ${filename} (${(recebido / 1024 / 1024).toFixed(1)} MB)`)
                podarCenasAntigas()
            } catch (e) {
                console.error('[Cena] Erro ao salvar:', e)
                res.status(500).json({ error: 'Falha ao salvar arquivo' })
            }
        })

        req.on('error', () => {
            if (!abortado && !res.headersSent) res.status(500).json({ error: 'Erro no upload' })
        })
    })

    // Serve arquivos de cena estáticos
    app.use('/scenes', express.static(SCENES_DIR, { maxAge: '1h' }))
}

module.exports = { setupSceneRoutes, SCENES_DIR, podarCenasAntigas }
