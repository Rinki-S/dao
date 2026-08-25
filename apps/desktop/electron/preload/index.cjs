const { contextBridge, ipcRenderer } = require('electron')

function readArg(name) {
    const prefix = `--${name}=`
    const arg = process.argv.find((value) => value.startsWith(prefix))

    return arg ? arg.slice(prefix.length) : ''
}

contextBridge.exposeInMainWorld('dao', {
    appName: 'Dao',
    api: {
        baseUrl: readArg('dao-api-base-url'),
        sessionToken: readArg('dao-session-token'),
    },
    selectWorkingDirectory: () => ipcRenderer.invoke('dao:select-working-directory'),
    setAppearance: (source) => ipcRenderer.invoke('dao:set-appearance', source),
    restartLocalService: () => ipcRenderer.invoke('dao:restart-local-service'),
    // Write-only by design. There is no getter: the renderer can learn that a
    // key exists, never what it is.
    getModelKeyStatus: () => ipcRenderer.invoke('dao:get-model-key-status'),
    setModelApiKey: (key) => ipcRenderer.invoke('dao:set-model-api-key', key),
    clearModelApiKey: () => ipcRenderer.invoke('dao:clear-model-api-key'),
})
