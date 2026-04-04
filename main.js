const { app, BrowserWindow, ipcMain, Menu } = require('electron')
const { startServer } = require('./server')
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')

// ── Log para arquivo (útil quando o terminal fecha) ───────────────────────────
const LOG_FILE = path.join(app.getPath('userData'), 'rpg-lobby.log')
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' })
function log(...args) {
    const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`
    process.stdout.write(line)
    logStream.write(line)
}
log('=== App iniciando ===')

// ── Janelas ───────────────────────────────────────────────────────────────────
let mainWindow
const windows = []
let musicWindow = null

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) { app.quit(); return }

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
    return code
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1400, height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    })
    win.loadFile(path.join(__dirname, 'index.html'))
    windows.push(win)

    // F12 abre/fecha o DevTools para ver logs do renderer
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools()
            else win.webContents.openDevTools({ mode: 'detach' })
        }
    })

    // Encaminha logs do renderer para o log file também
    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const prefix = ['[R:verbose]', '[R:info]', '[R:warning]', '[R:error]'][level] || '[R:?]'
        log(prefix, message)
    })

    win.on('closed', () => {
        const idx = windows.indexOf(win)
        if (idx > -1) windows.splice(idx, 1)
    })
    return win
}

// ── Player de música ──────────────────────────────────────────────────────────
// Usa uma BrowserWindow oculta carregando music-player.html (local).
// O HTML usa o YouTube IFrame API — sem problemas de CSP/autoplay do file://.
// O main process controla via executeJavaScript para máxima confiabilidade.

function ensureMusicWindow(callback) {
    if (musicWindow && !musicWindow.isDestroyed()) {
        callback(musicWindow)
        return
    }

    log('[Música] Criando janela de música...')
    musicWindow = new BrowserWindow({
        width: 10, height: 10,
        show: false, frame: false,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            webSecurity: false,
            backgroundThrottling: false
        }
    })

    musicWindow.on('closed', () => {
        log('[Música] Janela de música fechada')
        musicWindow = null
    })

    // Encaminha logs do player para o log file
    musicWindow.webContents.on('console-message', (e, level, message) => {
        log('[MusicWin]', message)
    })

    const playerPath = path.join(__dirname, 'music-player.html')
    musicWindow.loadURL('http://localhost:3001/music-player.html')

    musicWindow.webContents.once('did-finish-load', () => {
        log('[Música] music-player.html carregado')
        callback(musicWindow)
    })

    musicWindow.webContents.on('did-fail-load', (e, code, desc) => {
        log('[Música] ERRO ao carregar music-player.html:', code, desc)
    })
}

function playMusic(videoId, seekTime) {
    log('[Música] playMusic —', videoId, 'seekTime:', seekTime)
    ensureMusicWindow(win => {
        const js = `window.musicPlay(${JSON.stringify(videoId)}, ${+seekTime || 0})`
        win.webContents.executeJavaScript(js)
            .then(() => log('[Música] musicPlay executado'))
            .catch(e => log('[Música] ERRO executeJavaScript:', e.message))
    })
}

function stopMusic() {
    log('[Música] stopMusic')
    if (musicWindow && !musicWindow.isDestroyed()) {
        musicWindow.webContents.executeJavaScript('window.musicStop()')
            .catch(e => log('[Música] ERRO stop:', e.message))
    }
}

function setMusicVolume(vol) {
    log('[Música] setVolume:', vol)
    if (musicWindow && !musicWindow.isDestroyed()) {
        musicWindow.webContents.executeJavaScript(`window.musicSetVolume(${+vol})`)
            .catch(e => log('[Música] ERRO setVolume:', e.message))
    }
}

// ── IPC de música ─────────────────────────────────────────────────────────────
ipcMain.on('music-play', (e, { videoId, seekTime }) => playMusic(videoId, seekTime))
ipcMain.on('music-stop', () => stopMusic())
ipcMain.on('music-volume', (e, { volume }) => setMusicVolume(volume))

// ── Ngrok ─────────────────────────────────────────────────────────────────────
let ngrokProcess = null

function stopNgrok() {
    if (ngrokProcess) { ngrokProcess.kill(); ngrokProcess = null }
}

function startNgrok() {
    return new Promise((resolve, reject) => {
        stopNgrok()
        ngrokProcess = spawn('ngrok', ['http', '3001', '--log=stdout'])
        ngrokProcess.stderr.on('data', d => log('NGROK ERROR:', d.toString()))
        setTimeout(async () => {
            try { resolve(await getNgrokUrl()) }
            catch (e) { reject(e) }
        }, 3000)
    })
}

function getNgrokUrl() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:4040/api/tunnels', res => {
            let body = ''
            res.on('data', c => body += c)
            res.on('end', () => {
                try { resolve(JSON.parse(body).tunnels[0].public_url) }
                catch (e) { reject(e) }
            })
        }).on('error', reject)
    })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.on('second-instance', () => createWindow())

// Mata a janela de música junto com o app
app.on('window-all-closed', () => {
    if (musicWindow && !musicWindow.isDestroyed()) {
        musicWindow.destroy()
        musicWindow = null
    }
    app.quit()
})

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    await startServer()
    createWindow()
    mainWindow = windows[0]
    log('[Main] App pronto. Logs em:', LOG_FILE)
    log('[Main] Pressione F12 no app para abrir o DevTools do renderer.')
})

ipcMain.on('create-room', async (event) => {
    try {
        const roomCode = generateRoomCode()
        const publicUrl = await startNgrok()
        const sender = BrowserWindow.fromWebContents(event.sender)
        if (sender) { sender.setAlwaysOnTop(true); sender.focus() }
        const creator = windows.find(w => w.webContents === event.sender)
        if (creator) creator.webContents.send('room-created', { roomCode, publicUrl })
    } catch (error) {
        log('[Main] create-room erro:', error.message)
        const creator = windows.find(w => w.webContents === event.sender)
        if (creator) creator.webContents.send('room-error', { message: error.message })
    }
})
