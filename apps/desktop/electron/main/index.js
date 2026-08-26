import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    createServiceConfig,
    startLocalService,
    stopLocalService,
    waitForLocalServiceExit,
    waitForServiceHealth,
} from './service-manager.js'
import {
    clearCredential,
    credentialStatus,
    readServiceSecret,
    writeModelApiKey,
} from './credential-store.js'

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
        width: 1488,
        height: 1024,
        minWidth: 960,
        minHeight: 640,
        icon: appIconPath,
        backgroundColor: '#00000000',
        // macOS system material (NSVisualEffectView) behind the window; the
        // titlebar and sidebar render transparent so it shows through.
        vibrancy: 'sidebar',
        titleBarStyle: 'hiddenInset',
        // The workspace top bar is 48px tall and the sidebar titlebar band
        // matches it, so 18px is the geometric centre for the 12px traffic
        // lights. macOS draws them ~1px below the origin it is given, so 17px
        // is what actually lands them on the centre line the sidebar trigger's
        // 12px glyph sits on. x matches for an equal leading inset.
        trafficLightPosition: { x: 17, y: 17 },
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

const APPEARANCE_SOURCES = new Set(['system', 'light', 'dark'])

// Keeps the native window materials (sidebar vibrancy, traffic lights, menus)
// on the same appearance the renderer painted, instead of the OS setting.
ipcMain.handle('dao:set-appearance', (_event, source) => {
    if (!APPEARANCE_SOURCES.has(source)) {
        return { ok: false, error: `Unsupported appearance: ${String(source)}` }
    }

    nativeTheme.themeSource = source

    return { ok: true, error: '' }
})

ipcMain.handle('dao:get-model-key-status', () => credentialStatus())

// Saving the key restarts the service, because the service is handed the key
// once at startup. Restarting is how the new one takes effect, and it is the
// same path the working-directory change already uses.
ipcMain.handle('dao:set-model-api-key', async (_event, key) => {
    const result = writeModelApiKey(key)
    if (!result.ok) {
        return result
    }

    return restartWithCurrentKey()
})

ipcMain.handle('dao:clear-model-api-key', async () => {
    const result = clearCredential()
    if (!result.ok) {
        return result
    }

    return restartWithCurrentKey()
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

    const startupCredential = readServiceSecret()
    serviceConfig = createServiceConfig(startupCredential.secret, startupCredential.kind)
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

// The port and session token stay as they are — the renderer already holds
// them and cannot be handed new ones without a reload. Only the key changes.
async function restartWithCurrentKey() {
    if (!serviceConfig) {
        return { ok: false, error: 'Local service is not configured' }
    }

    const current = readServiceSecret()
    serviceConfig = {
        ...serviceConfig,
        modelApiKey: current.secret,
        modelCredentialKind: current.kind,
    }

    try {
        await restartLocalService()
        return { ok: true, error: '' }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to restart local service',
        }
    }
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
