import { app, BrowserWindow, dialog, ipcMain, nativeTheme, powerMonitor, shell } from 'electron'
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
    readCredential,
    readServiceSecret,
    writeModelApiKey,
    writeModelToken,
} from './credential-store.js'
import { createRefreshScheduler } from './refresh-scheduler.js'
import { connect, refresh } from './oauth/flow.js'
import { getProvider, listProviders } from './oauth/providers.js'

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

ipcMain.handle('dao:list-oauth-providers', () => listProviders())

/**
 * Sign in to a provider and keep what it hands back.
 *
 * The browser is opened by this process because it is the only one that can:
 * the loopback listener has to belong to whoever is going to read the code
 * out of it.
 */
ipcMain.handle('dao:connect-provider', async (_event, providerId) => {
    let provider
    try {
        provider = getProvider(providerId)
    } catch (error) {
        return { ok: false, error: error.message }
    }

    try {
        const result = await connect({
            provider,
            openExternal: (url) => shell.openExternal(url),
        })

        const stored =
            result.kind === 'api-key'
                ? writeModelApiKey(result.key, provider.id)
                : writeModelToken(result.token, provider.id)

        if (!stored.ok) {
            return stored
        }

        const pushed = await pushCurrentCredential()
        // Only a token has a lifetime to schedule against; a key is left alone.
        await refreshScheduler.start()

        return pushed
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Sign-in failed',
        }
    }
})

// Saving a credential pushes it to the running service rather than restarting
// it. Restarting was how a startup-only value took effect; now that the
// service can be handed a new one, there is nothing to restart for.
ipcMain.handle('dao:set-model-api-key', async (_event, key) => {
    const result = writeModelApiKey(key)
    if (!result.ok) {
        return result
    }

    // A typed key has no expiry, so anything scheduled against a previous
    // token no longer applies.
    refreshScheduler.stop()

    return pushCurrentCredential()
})

ipcMain.handle('dao:clear-model-api-key', async () => {
    const result = clearCredential()
    if (!result.ok) {
        return result
    }

    refreshScheduler.stop()

    return pushCurrentCredential()
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

    await refreshScheduler.start()

    // A timer does not run while the machine is asleep, so on waking its
    // appointment has usually passed and the token is already dead. This is
    // the tick that matters on a laptop.
    powerMonitor.on('resume', () => {
        void refreshScheduler.tick()
    })

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

/**
 * Hand the running service whatever credential is now stored.
 *
 * The config is updated too, so that a restart for some other reason starts
 * the service with the same credential this pushed.
 */
async function pushCredentialToService(secret, kind) {
    if (!serviceConfig) {
        throw new Error('Local service is not configured')
    }

    serviceConfig = { ...serviceConfig, modelApiKey: secret, modelCredentialKind: kind }

    const response = await fetch(`${serviceConfig.baseUrl}/api/ai/credential`, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${serviceConfig.sessionToken}`,
        },
        body: JSON.stringify({ kind, secret }),
    })

    if (!response.ok) {
        throw new Error(`the local service refused the credential (${response.status})`)
    }
}

async function pushCurrentCredential() {
    try {
        const current = readServiceSecret()
        await pushCredentialToService(current.secret, current.kind)
        return { ok: true, error: '' }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to update the credential',
        }
    }
}

// Renewal lives here rather than in the service because this is the process
// holding the refresh token and the keychain, and it has to be — the
// authorisation callback lands here. The service is handed access tokens and
// uses them.
const refreshScheduler = createRefreshScheduler({
    readCredential,
    writeToken: writeModelToken,
    pushToService: pushCredentialToService,
    refreshToken: (providerId, refreshTokenValue) =>
        refresh({ provider: getProvider(providerId), refreshToken: refreshTokenValue }),
    onEvent(event) {
        if (event.type === 'needs-reconnect') {
            console.warn(`dao: the model credential needs reconnecting — ${event.error}`)
        }
        mainWindow?.webContents.send('dao:credential-event', event)
    },
})

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
