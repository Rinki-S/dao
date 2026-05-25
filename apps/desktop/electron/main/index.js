import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServiceConfig, startLocalService, stopLocalService, waitForServiceHealth } from './service-manager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let localService = null
let serviceConfig = null
let isStoppingLocalService = false
let mainWindow = null

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0B1220',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            additionalArguments: [
                `--dao-api-base-url=${serviceConfig.baseUrl}`,
                `--dao-session-token=${serviceConfig.sessionToken}`,
            ],
        },
    })

    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

ipcMain.handle('dao:select-working-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
        title: 'Choose working directory',
        properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
    }

    return { canceled: false, path: result.filePaths[0] }
})

app.whenReady().then(async () => {
    serviceConfig = createServiceConfig()
    localService = startLocalService(serviceConfig)

    await waitForServiceHealth(serviceConfig.baseUrl)

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('before-quit', () => {
    stopServiceOnce()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

function stopServiceOnce() {
    if (isStoppingLocalService) {
        return
    }

    isStoppingLocalService = true
    stopLocalService(localService)
}

process.on('exit', stopServiceOnce)
process.on('SIGINT', () => {
    stopServiceOnce()
    process.exit(130)
})
process.on('SIGTERM', () => {
    stopServiceOnce()
    process.exit(143)
})
process.on('uncaughtException', (error) => {
    console.error(error)
    stopServiceOnce()
    process.exit(1)
})
