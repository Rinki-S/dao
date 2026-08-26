/**
 * How a stored credential is written down, kept apart from where it is
 * written to.
 *
 * The parsing here is the part that can go wrong in ways the type system will
 * not catch — a file left over from an earlier version, a half-written record,
 * a shape that changed — so it is separated from the Electron-dependent I/O in
 * order to be tested directly.
 */

export const CREDENTIAL_VERSION = 1

export const API_KEY = 'api-key'
export const OAUTH_TOKEN = 'oauth-token'

/**
 * @typedef {object} StoredCredential
 * @property {'api-key'|'oauth-token'} kind
 * @property {string} provider  Which provider issued it. Empty for a key the
 *   user typed in themselves, which belongs to whatever endpoint they also
 *   configured.
 * @property {string} [key]
 * @property {{access: string, refresh: string, expires: string}} [token]
 */

export function apiKeyCredential(key, provider = '') {
    return { kind: API_KEY, provider, key }
}

export function tokenCredential(token, provider) {
    return {
        kind: OAUTH_TOKEN,
        provider,
        token: {
            access: token.access ?? '',
            refresh: token.refresh ?? '',
            // ISO 8601, so it survives the round trip through JSON and is read
            // the same way by the Go side.
            expires: token.expires ?? '',
        },
    }
}

export function serialiseCredential(credential) {
    return JSON.stringify({ version: CREDENTIAL_VERSION, ...credential })
}

/**
 * Read a stored credential back.
 *
 * Returns null for anything unusable rather than throwing. A credential that
 * cannot be read should leave the app running with AI switched off, exactly
 * as an absent one does — there is nothing the user can do about a corrupt
 * record except replace it, and refusing to start does not help them do that.
 */
export function parseCredential(text) {
    const trimmed = typeof text === 'string' ? text.trim() : ''
    if (!trimmed) return null

    let parsed
    try {
        parsed = JSON.parse(trimmed)
    } catch {
        // Before this format existed the file held a bare API key. Anything
        // that is not JSON is assumed to be one, which is what stops an
        // upgrade from silently logging the user out of their own provider.
        return apiKeyCredential(trimmed)
    }

    // JSON.parse accepts bare scalars, so a quoted key parses successfully and
    // still has to be recognised as the legacy shape.
    if (typeof parsed === 'string') {
        return parsed.trim() ? apiKeyCredential(parsed.trim()) : null
    }
    if (!parsed || typeof parsed !== 'object') return null

    const provider = typeof parsed.provider === 'string' ? parsed.provider : ''

    if (parsed.kind === OAUTH_TOKEN) {
        const access = parsed.token?.access
        // A token record with no access token is not a usable credential, and
        // reporting it as present would show a connected account that cannot
        // make a single call.
        if (typeof access !== 'string' || !access) return null

        return tokenCredential(parsed.token, provider)
    }

    // Treated as the default kind: a record written by a version that did not
    // yet name it is a key.
    const key = typeof parsed.key === 'string' ? parsed.key.trim() : ''
    return key ? apiKeyCredential(key, provider) : null
}

/**
 * What may be told to the renderer.
 *
 * Deliberately not the credential. The bridge is write-only by design, so this
 * is the whole of what the UI gets to know: that something is stored, what
 * kind, and whose.
 */
export function describeCredential(credential) {
    if (!credential) {
        return { present: false, kind: '', provider: '', expires: '' }
    }

    return {
        present: true,
        kind: credential.kind,
        provider: credential.provider,
        // The expiry is not a secret, and the UI needs it to explain why a
        // connection needs renewing.
        expires: credential.kind === OAUTH_TOKEN ? credential.token.expires : '',
    }
}
