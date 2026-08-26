import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
    API_KEY,
    OAUTH_TOKEN,
    apiKeyCredential,
    describeCredential,
    parseCredential,
    serialiseCredential,
    tokenCredential,
} from './credential-format.js'

// The ciphertext lives beside the app's own data; the key that decrypts it
// lives in the OS keychain, held by Electron. So the file is useless on
// another machine or to another user account, and Dao never has to store a
// secret it could accidentally read back in the clear.
//
// The filename is the one an earlier version used, when the only thing it
// could hold was a bare API key. Keeping it is what lets an existing
// installation be read rather than silently disconnected — the format
// migration is in parseCredential.
function credentialFile() {
    return path.join(app.getPath('userData'), 'model-api-key.bin')
}

export function isKeyStorageAvailable() {
    return safeStorage.isEncryptionAvailable()
}

/**
 * Read the stored credential.
 *
 * Returns null rather than throwing when there is nothing stored, the
 * ciphertext no longer decrypts, or the contents make no sense — a keychain
 * that has moved on should leave the app running with AI switched off, not
 * refuse to start.
 */
export function readCredential() {
    const file = credentialFile()

    if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) {
        return null
    }

    try {
        return parseCredential(safeStorage.decryptString(fs.readFileSync(file)))
    } catch {
        return null
    }
}

/** What the renderer is allowed to know. Never the secret itself. */
export function credentialStatus() {
    return { available: isKeyStorageAvailable(), ...describeCredential(readCredential()) }
}

function write(credential) {
    if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, error: 'This system cannot store secrets securely' }
    }

    try {
        // 0600: the ciphertext is already useless without the keychain, but
        // there is no reason for another account on this machine to read it.
        fs.writeFileSync(
            credentialFile(),
            safeStorage.encryptString(serialiseCredential(credential)),
            { mode: 0o600 },
        )
        return { ok: true, error: '' }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to store the credential',
        }
    }
}

export function writeModelApiKey(key, provider = '') {
    const trimmed = typeof key === 'string' ? key.trim() : ''

    if (!trimmed) {
        return { ok: false, error: 'API key is required' }
    }

    return write(apiKeyCredential(trimmed, provider))
}

/** Store a credential obtained through an authorisation flow. */
export function writeModelToken(token, provider) {
    if (!token?.access) {
        return { ok: false, error: 'The provider returned no access token' }
    }

    return write(tokenCredential(token, provider))
}

export function clearCredential() {
    try {
        fs.rmSync(credentialFile(), { force: true })
        return { ok: true, error: '' }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to remove the credential',
        }
    }
}

/**
 * The secret to hand the local service, whatever kind it is.
 *
 * A key and an access token are both just the string that authenticates a
 * request; how the service must present it is decided from the kind, which
 * travels separately.
 */
export function readServiceSecret() {
    const credential = readCredential()

    if (!credential) return { secret: '', kind: '' }

    return credential.kind === OAUTH_TOKEN
        ? { secret: credential.token.access, kind: OAUTH_TOKEN }
        : { secret: credential.key, kind: API_KEY }
}
