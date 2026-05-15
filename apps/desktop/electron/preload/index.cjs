const { contextBridge } = require('electron')

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
})