import { startCallbackReceiver } from './loopback.js'
import { buildAuthorizeUrl, createPkcePair, createState } from './pkce.js'

/**
 * Running an authorisation, start to finish.
 *
 * The ordering here is not incidental. The loopback listener has to be up
 * before the browser opens, because the redirect can arrive before a slow
 * listener is ready and there would be nothing to receive it. And the receiver
 * is closed in a finally, because a flow the user abandons must not leave a
 * port held for the rest of the session.
 */

/** How a token endpoint reports refusal, per RFC 6749 §5.2. */
function describeFailure(status, body) {
    if (body && typeof body === 'object') {
        const code = body.error ?? body.code
        const detail = body.error_description ?? body.message
        if (code || detail) {
            return `${code ?? 'error'}${detail ? `: ${detail}` : ''}`
        }
    }
    return `token endpoint returned ${status}`
}

async function post(fetchImpl, url, { headers, body }) {
    const response = await fetchImpl(url, { method: 'POST', headers, body })

    // Read as text first: an error page from a proxy is not JSON, and letting
    // that surface as a parse error would hide the status that explains it.
    const raw = await response.text()
    let parsed = null
    try {
        parsed = raw ? JSON.parse(raw) : null
    } catch {
        parsed = null
    }

    if (!response.ok) {
        throw new Error(describeFailure(response.status, parsed ?? raw))
    }
    if (!parsed) {
        throw new Error('token endpoint did not return JSON')
    }

    return parsed
}

/**
 * RFC 6749 §4.1.3 — form-encoded, and the redirect URI must be byte-identical
 * to the one sent to the authorize endpoint. Providers check this, and a
 * mismatch fails as an unhelpful invalid_grant.
 */
async function exchangeOAuth2({ provider, code, verifier, redirectUri, fetchImpl, now }) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        ...(provider.clientId ? { client_id: provider.clientId } : {}),
    })

    const payload = await post(fetchImpl, provider.tokenUrl, {
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body,
    })

    return { kind: 'oauth-token', token: readToken(payload, now) }
}

/** OpenRouter takes JSON and answers with a plain key. */
async function exchangeOpenRouter({ provider, code, verifier, fetchImpl }) {
    const payload = await post(fetchImpl, provider.tokenUrl, {
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
            code,
            code_verifier: verifier,
            code_challenge_method: 'S256',
        }),
    })

    if (!payload.key) {
        throw new Error('OpenRouter did not return a key')
    }

    return { kind: 'api-key', key: payload.key }
}

const EXCHANGES = {
    oauth2: exchangeOAuth2,
    openrouter: exchangeOpenRouter,
}

/**
 * Read a token response into the shape the rest of Dao stores.
 *
 * `expires_in` is seconds from now, so it has to be resolved against a clock
 * at the moment of the response — storing the relative value would make the
 * token look permanently fresh across restarts.
 */
function readToken(payload, now = () => Date.now()) {
    const access = payload.access_token
    if (!access) {
        throw new Error('token endpoint returned no access token')
    }

    const lifetime = Number(payload.expires_in)
    const expires =
        Number.isFinite(lifetime) && lifetime > 0
            ? new Date(now() + lifetime * 1000).toISOString()
            : ''

    return {
        access,
        // Absent for providers that issue non-expiring access tokens; keeping
        // it empty rather than inventing one is what lets the Go side treat
        // "no stated expiry" as "do not renew".
        refresh: payload.refresh_token ?? '',
        expires,
    }
}

/**
 * Take the user through an authorisation and return the credential it yields.
 *
 * openExternal and fetchImpl are injected rather than imported so this can be
 * driven end to end in a test without Electron and without the network.
 */
export async function connect({
    provider,
    openExternal,
    fetchImpl = fetch,
    signal,
    timeoutMs,
    now = () => Date.now(),
}) {
    const exchange = EXCHANGES[provider.exchange]
    if (!exchange) {
        throw new Error(`provider ${provider.id} wants an unknown exchange: ${provider.exchange}`)
    }

    const { verifier, challenge } = createPkcePair()
    const state = createState()

    // Up before the browser opens.
    const receiver = await startCallbackReceiver(
        provider.ports ? { ports: provider.ports } : {},
    )

    try {
        const authorizeUrl = buildAuthorizeUrl({
            authorizeUrl: provider.authorizeUrl,
            clientId: provider.clientId,
            // Some providers name this something else, and the standard name
            // would simply be ignored.
            redirectUri: receiver.redirectUri,
            redirectParam: provider.redirectParam,
            scope: provider.scope,
            challenge,
            state,
        })

        await openExternal(authorizeUrl)

        const code = await receiver.waitForCode({ expectedState: state, timeoutMs, signal })

        return await exchange({
            provider,
            code,
            verifier,
            redirectUri: receiver.redirectUri,
            fetchImpl,
            now,
        })
    } finally {
        receiver.close()
    }
}

/**
 * Trade a refresh token for a new one.
 *
 * Separate from connect because it involves no browser and no user: this is
 * what runs on a timer, and on waking from sleep.
 */
export async function refresh({ provider, refreshToken, fetchImpl = fetch, now = () => Date.now() }) {
    if (provider.yields !== 'oauth-token') {
        throw new Error(`${provider.id} issues a key, which does not expire and cannot be refreshed`)
    }
    if (!refreshToken) {
        throw new Error('no refresh token')
    }

    const payload = await post(fetchImpl, provider.tokenUrl, {
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            ...(provider.clientId ? { client_id: provider.clientId } : {}),
        }),
    })

    const token = readToken(payload, now)

    // A provider that rotates only the access token says nothing about the
    // refresh token. Taking that literally would strand the credential.
    if (!token.refresh) {
        token.refresh = refreshToken
    }

    return token
}
