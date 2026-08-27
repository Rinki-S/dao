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
    // credential exists, never what it is. That holds for a token too — the
    // sign-in runs entirely in the main process, and what comes back here is
    // the same status anyone else would get.
    getModelKeyStatus: () => ipcRenderer.invoke('dao:get-model-key-status'),
    setModelApiKey: (key) => ipcRenderer.invoke('dao:set-model-api-key', key),
    setModelNoKey: () => ipcRenderer.invoke('dao:set-model-no-key'),
    clearModelApiKey: () => ipcRenderer.invoke('dao:clear-model-api-key'),
    listOAuthProviders: () => ipcRenderer.invoke('dao:list-oauth-providers'),
    connectProvider: (providerId) => ipcRenderer.invoke('dao:connect-provider', providerId),
    /**
     * Renewal happens on a timer in the main process, so the renderer is told
     * about it rather than asking. Returns an unsubscribe function; the
     * listener is wrapped so the raw IpcRendererEvent — which carries a
     * sender it has no business holding — never reaches renderer code.
     */
    onCredentialEvent: (listener) => {
        const wrapped = (_event, payload) => listener(payload)

        ipcRenderer.on('dao:credential-event', wrapped)
        return () => ipcRenderer.removeListener('dao:credential-event', wrapped)
    },
})
