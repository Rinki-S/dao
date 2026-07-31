import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    createServiceConfig,
    startLocalService,
    stopLocalService,
    waitForLocalServiceExit,
    waitForServiceHealth,
} from './service-manager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appIconPath = path.join(__dirname, '../assets/dao-iOS-Default-1024x1024@1x.png')

let localService = null
let serviceConfig = null
let isStoppingLocalService = false
let restartLocalServicePromise = null
let mainWindow = null

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        icon: appIconPath,
        backgroundColor: '#00000000',
        // macOS system material (NSVisualEffectView) behind the window; the
        // titlebar and sidebar render transparent so it shows through.
        vibrancy: 'sidebar',
        titleBarStyle: 'hiddenInset',
        // Titlebar is 42px tall; nudge traffic lights up until optically centered.
        trafficLightPosition: { x: 16, y: 14 },
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

ipcMain.handle('dao:restart-local-service', async () => {
    if (!serviceConfig) {
        return { ok: false, error: 'Local service is not configured' }
    }

    if (!restartLocalServicePromise) {
        restartLocalServicePromise = restartLocalService()
            .then(() => ({ ok: true, error: '' }))
            .catch((error) => ({
                ok: false,
                error: error instanceof Error ? error.message : 'Failed to restart local service',
            }))
            .finally(() => {
                restartLocalServicePromise = null
            })
    }

    return restartLocalServicePromise
})

app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
        app.dock.setIcon(appIconPath)
    }

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

async function restartLocalService() {
    const currentService = localService

    stopLocalService(currentService)
    await waitForLocalServiceExit(currentService)

    localService = startLocalService(serviceConfig)
    await waitForServiceHealth(serviceConfig.baseUrl)
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
