const fs   = require('fs')
const path = require('path')

const { app: electronApp } = require('electron')
const SCENES_DIR = path.join(electronApp.getPath('userData'), 'scenes')
if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR)

function setupSceneRoutes(app, express) {
    // Upload de cena (arquivo bruto no body)
    app.post('/upload-scene', (req, res) => {
        const ext      = (req.headers['x-file-ext'] || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase()
        const filename = `scene_${Date.now()}.${ext}`
        const filepath = path.join(SCENES_DIR, filename)
        const chunks   = []

        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
            try {
                fs.writeFileSync(filepath, Buffer.concat(chunks))
                res.json({ ok: true, scenePath: `/scenes/${filename}` })
                console.log('[Cena] Arquivo salvo:', filename)
            } catch (e) {
                console.error('[Cena] Erro ao salvar:', e)
                res.status(500).json({ error: 'Falha ao salvar arquivo' })
            }
        })
        req.on('error', () => res.status(500).json({ error: 'Erro no upload' }))
    })

    // Serve arquivos de cena estáticos
    app.use('/scenes', require('express').static(SCENES_DIR))
}

module.exports = { setupSceneRoutes }
