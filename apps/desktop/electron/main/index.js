import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServiceConfig, startLocalService, stopLocalService, waitForServiceHealth } from './service-manager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let localService = null
let serviceConfig = null

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0B1220',
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
}

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
    stopLocalService(localService)
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})