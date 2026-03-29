const { app, BrowserWindow, ipcMain, Menu } = require('electron')
const { startServer } = require('./server')
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

let mainWindow
let serverStarted = false
const windows = []

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
    return
}

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
}


function createWindow() {
    const window = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    })

    window.loadURL('http://localhost:3001/index.html')
    windows.push(window)

    window.on('closed', () => {
        const idx = windows.indexOf(window)
        if (idx > -1) windows.splice(idx, 1)
    })

    return window
}

let ngrokProcess = null

function stopNgrok() {
    if (ngrokProcess) {
        ngrokProcess.kill()
        ngrokProcess = null
    }
}

function startNgrok() {
    return new Promise((resolve, reject) => {
        stopNgrok()

        const args = ['http', '3001', '--log=stdout']

        ngrokProcess = spawn('ngrok', args)

        ngrokProcess.stderr.on('data', (data) => {
            console.error('NGROK ERROR:', data.toString())
        })

        setTimeout(async () => {
            try {
                const url = await getNgrokUrl()
                resolve(url)
            } catch (err) {
                reject(err)
            }
        }, 3000)
    })
}

function getNgrokUrl() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
            let body = ''

            res.on('data', chunk => body += chunk)

            res.on('end', () => {
                const data = JSON.parse(body)
                resolve(data.tunnels[0].public_url)
            })
        }).on('error', reject)
    })
}

app.on('second-instance', () => {
    createWindow()
})

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    await startServer()
    createWindow()
    mainWindow = windows[0]
})

ipcMain.on('create-room', async (event) => {
    try {
        const roomCode = generateRoomCode()
        const publicUrl = await startNgrok()

        const senderWindow = BrowserWindow.fromWebContents(event.sender)
        if (senderWindow) {
            senderWindow.setAlwaysOnTop(true)
            senderWindow.focus()
        }

        const creatorWindow = windows.find(w => w.webContents === event.sender)
        if (creatorWindow) {
            creatorWindow.webContents.send('room-created', {
                roomCode,
                publicUrl
            })
        }

    } catch (error) {
        console.error(error)

        const creatorWindow = windows.find(w => w.webContents === event.sender)
        if (creatorWindow) {
            creatorWindow.webContents.send('room-error', {
                message: error.message
            })
        }
    }
})
