import crypto from 'node:crypto'
import http from 'node:http'

/**
 * An OAuth 2.0 provider that actually checks things.
 *
 * A fake that says yes to everything proves only that the code runs. This one
 * enforces the two rules the client is supposed to be honouring, so that
 * getting either wrong fails here rather than in production:
 *
 *   1. PKCE. The verifier presented at the token endpoint must hash to the
 *      challenge sent to the authorize endpoint. A client that sends a
 *      mismatched pair, or forgets the verifier, is refused.
 *
 *   2. Refresh token rotation. Redeeming a refresh token consumes it. Present
 *      a consumed one and the answer is invalid_grant — which is exactly what
 *      a real provider does, and exactly what a client without a single-flight
 *      lock will eventually do to itself.
 *
 * The model endpoint checks the bearer against the currently valid access
 * token, so a stale token produces a genuine 401 rather than a pretend one.
 */
export async function startFakeProvider({ accessLifetimeSeconds = 3600 } = {}) {
    // challenge by authorization code, so the token endpoint can verify PKCE.
    const pending = new Map()
    // The refresh tokens that are still live. Rotation deletes as it issues.
    const liveRefreshTokens = new Set()
    let currentAccess = ''

    const issued = []
    const rejected = []
    const modelCalls = []

    function issue() {
        const access = `at-${issued.length + 1}`
        const refresh = `rt-${issued.length + 1}`

        currentAccess = access
        liveRefreshTokens.add(refresh)

        const token = {
            access_token: access,
            refresh_token: refresh,
            token_type: 'Bearer',
            expires_in: accessLifetimeSeconds,
        }
        issued.push(token)

        return token
    }

    function readBody(request) {
        return new Promise((resolve) => {
            let raw = ''
            request.on('data', (chunk) => {
                raw += chunk
            })
            request.on('end', () => resolve(raw))
        })
    }

    function send(response, status, payload) {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(payload))
    }

    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1')

        // The authorize endpoint. A real one shows a consent screen; this one
        // records the challenge and redirects straight back.
        if (url.pathname === '/oauth/authorize') {
            const params = url.searchParams
            const code = `code-${pending.size + 1}`

            pending.set(code, {
                challenge: params.get('code_challenge'),
                method: params.get('code_challenge_method'),
                redirectUri: params.get('redirect_uri'),
            })

            const back = new URL(params.get('redirect_uri'))
            back.searchParams.set('code', code)
            back.searchParams.set('state', params.get('state') ?? '')

            response.writeHead(302, { location: back.toString() }).end()
            return
        }

        if (url.pathname === '/oauth/token') {
            const body = new URLSearchParams(await readBody(request))
            const grant = body.get('grant_type')

            if (grant === 'authorization_code') {
                const record = pending.get(body.get('code'))

                if (!record) {
                    rejected.push('unknown code')
                    return send(response, 400, { error: 'invalid_grant' })
                }
                // Single-use, like a real one.
                pending.delete(body.get('code'))

                const verifier = body.get('code_verifier') ?? ''
                const expected = crypto
                    .createHash('sha256')
                    .update(verifier, 'ascii')
                    .digest('base64url')

                if (record.method !== 'S256' || expected !== record.challenge) {
                    rejected.push('pkce mismatch')
                    return send(response, 400, {
                        error: 'invalid_grant',
                        error_description: 'code_verifier does not match code_challenge',
                    })
                }
                // RFC 6749 §4.1.3: it must match the one sent to authorize.
                if (body.get('redirect_uri') !== record.redirectUri) {
                    rejected.push('redirect_uri mismatch')
                    return send(response, 400, {
                        error: 'invalid_grant',
                        error_description: 'redirect_uri does not match',
                    })
                }

                return send(response, 200, issue())
            }

            if (grant === 'refresh_token') {
                const presented = body.get('refresh_token') ?? ''

                // The rule that makes concurrent renewal fatal.
                if (!liveRefreshTokens.has(presented)) {
                    rejected.push(`consumed or unknown refresh token: ${presented}`)
                    return send(response, 400, {
                        error: 'invalid_grant',
                        error_description: 'refresh token has already been used',
                    })
                }

                liveRefreshTokens.delete(presented)
                return send(response, 200, issue())
            }

            rejected.push(`unsupported grant: ${grant}`)
            return send(response, 400, { error: 'unsupported_grant_type' })
        }

        // Stands in for the model endpoint, on the OpenAI wire.
        if (url.pathname === '/v1/chat/completions') {
            const presented = (request.headers.authorization ?? '').replace(/^Bearer /, '')
            modelCalls.push(presented)

            if (presented !== currentAccess) {
                return send(response, 401, {
                    error: { message: 'the access token is expired or revoked' },
                })
            }

            return send(response, 200, {
                choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            })
        }

        response.writeHead(404).end()
    })

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    const origin = `http://127.0.0.1:${port}`

    return {
        origin,
        provider: {
            id: 'fake',
            label: 'Fake Provider',
            authorizeUrl: `${origin}/oauth/authorize`,
            tokenUrl: `${origin}/oauth/token`,
            clientId: 'test-client',
            scope: 'inference',
            exchange: 'oauth2',
            yields: 'oauth-token',
            defaults: { wire: 'openai', baseUrl: origin },
        },
        issued,
        rejected,
        modelCalls,
        currentAccess: () => currentAccess,
        liveRefreshTokens: () => [...liveRefreshTokens],
        close() {
            server.close()
            server.closeAllConnections?.()
        },
    }
}

/**
 * A browser that follows the redirect, which is all a browser does here.
 *
 * fetch follows the 302 to the loopback address by itself, so this is the
 * whole of it.
 */
export async function followRedirect(authorizeUrl) {
    await fetch(authorizeUrl, { redirect: 'follow' })
}
