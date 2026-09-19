#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// server/standalone.js — entrypoint do servidor na VPS
//
// É o MESMO servidor que roda dentro do app do mestre no modo ngrok; a única
// diferença é quem chama startServer(). Rodar assim:
//
//     node server/standalone.js
//
// Variáveis de ambiente (todas opcionais):
//
//   PORT=3001            porta de escuta
//   SCENES_DIR=/var/...  onde guardar as imagens e vídeos de fundo
//   SCENE_MAX_MB=150     tamanho máximo de um arquivo de cena
//   SCENE_KEEP=30        quantas cenas manter antes de podar as antigas
//
// Não precisa do Electron: `npm ci --omit=dev` na VPS instala só express,
// socket.io e supabase-js. O electron fica em devDependencies.
// ══════════════════════════════════════════════════════════════════════════════

const { startServer, PORTA } = require('../server.js')

const inicio = Date.now()

function log(...args) {
    console.log(`[${new Date().toISOString()}]`, ...args)
}

// Um crash não pode derrubar a sessão da mesa inteira. Loga e segue; o systemd
// reinicia se o processo realmente morrer.
process.on('uncaughtException', err => {
    log('ERRO NÃO TRATADO:', err && err.stack || err)
})
process.on('unhandledRejection', err => {
    log('PROMISE REJEITADA:', err && err.stack || err)
})

// Encerramento limpo quando o systemd manda parar
function encerrar(sinal) {
    log(`Recebi ${sinal}, encerrando...`)
    process.exit(0)
}
process.on('SIGTERM', () => encerrar('SIGTERM'))
process.on('SIGINT', () => encerrar('SIGINT'))

startServer()
    .then(() => {
        log('═══════════════════════════════════════════')
        log(`  Hub-RPG no ar na porta ${PORTA}`)
        log(`  Subiu em ${Date.now() - inicio}ms`)
        log(`  Saúde: http://localhost:${PORTA}/health`)
        log('═══════════════════════════════════════════')
    })
    .catch(err => {
        if (err && err.code === 'EADDRINUSE') {
            log(`ERRO: a porta ${PORTA} já está ocupada.`)
            log('Veja quem está usando:  sudo lsof -i :' + PORTA)
        } else {
            log('ERRO ao subir o servidor:', err && err.message || err)
        }
        process.exit(1)
    })
