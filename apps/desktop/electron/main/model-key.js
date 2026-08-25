import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// The ciphertext lives beside the app's own data; the key that decrypts it
// lives in the OS keychain, held by Electron. So the file is useless on
// another machine or to another user account, and Dao never has to store a
// secret it could accidentally read back in the clear.
function keyFile() {
    return path.join(app.getPath('userData'), 'model-api-key.bin')
}

export function isKeyStorageAvailable() {
    return safeStorage.isEncryptionAvailable()
}

export function hasModelApiKey() {
    return fs.existsSync(keyFile())
}

/**
 * Read the key back for handing to the local service.
 *
 * Returns '' rather than throwing when there is nothing stored or the
 * ciphertext no longer decrypts — a keychain that has moved on should leave
 * the app running with AI switched off, not refuse to start.
 */
export function readModelApiKey() {
    const file = keyFile()

    if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) {
        return ''
    }

    try {
        return safeStorage.decryptString(fs.readFileSync(file))
    } catch {
        return ''
    }
}

export function writeModelApiKey(key) {
    if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, error: 'This system cannot store secrets securely' }
    }

    const trimmed = typeof key === 'string' ? key.trim() : ''

    if (!trimmed) {
        return { ok: false, error: 'API key is required' }
    }

    try {
        // 0600: the ciphertext is already useless without the keychain, but
        // there is no reason for another account on this machine to read it.
        fs.writeFileSync(keyFile(), safeStorage.encryptString(trimmed), { mode: 0o600 })
        return { ok: true, error: '' }
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Failed to store API key' }
    }
}

export function clearModelApiKey() {
    try {
        fs.rmSync(keyFile(), { force: true })
        return { ok: true, error: '' }
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Failed to remove API key' }
    }
}
