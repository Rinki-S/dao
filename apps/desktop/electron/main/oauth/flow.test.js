import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { connect, refresh } from './flow.js'
import { challengeFor } from './pkce.js'
import { PROVIDERS } from './providers.js'

const OPENROUTER = PROVIDERS.openrouter

const OAUTH2 = {
    id: 'example',
    label: 'Example',
    authorizeUrl: 'https://provider.test/authorize',
    tokenUrl: 'https://provider.test/token',
    clientId: 'client-1',
    scope: 'inference',
    exchange: 'oauth2',
    yields: 'oauth-token',
}

/**
 * A stand-in browser.
 *
 * It does what a real one does: takes the authorize URL, reads the redirect
 * target and state out of it, and delivers a code back to that address. The
 * loopback listener is real; only the user's approval is skipped.
 */
function fakeBrowser({ code = 'the-code', state: overrideState, redirectParam = 'redirect_uri' } = {}) {
    const seen = {}

    return {
        seen,
        async openExternal(rawUrl) {
            const url = new URL(rawUrl)
            seen.authorizeUrl = url
            seen.challenge = url.searchParams.get('code_challenge')
            seen.redirectUri = url.searchParams.get(redirectParam)

            const state = overrideState ?? url.searchParams.get('state')
            await fetch(`${seen.redirectUri}?code=${code}&state=${encodeURIComponent(state)}`)
        },
    }
}

/** A stand-in token endpoint that records what it was sent. */
function fakeTokenEndpoint(reply) {
    const calls = []

    return {
        calls,
        async fetchImpl(url, options) {
            const body =
                typeof options.body === 'string' ? options.body : options.body.toString()
            calls.push({ url, headers: options.headers, body })

            const { status = 200, payload } = reply(calls.length)
            return new Response(JSON.stringify(payload), {
                status,
                headers: { 'content-type': 'application/json' },
            })
        },
    }
}

describe('connect', () => {
    test('runs OpenRouter end to end and yields a key', async () => {
        const browser = fakeBrowser({ redirectParam: 'callback_url' })
        const endpoint = fakeTokenEndpoint(() => ({ payload: { key: 'sk-or-v1-abc' } }))

        const result = await connect({
            provider: OPENROUTER,
            openExternal: browser.openExternal,
            fetchImpl: endpoint.fetchImpl,
        })

        assert.deepEqual(result, { kind: 'api-key', key: 'sk-or-v1-abc' })
        assert.equal(endpoint.calls[0].url, OPENROUTER.tokenUrl)
    })

    // The property the whole scheme rests on: the verifier handed over at the
    // exchange must be the preimage of the challenge sent to the authorize
    // endpoint. If these ever drift apart the flow still "works" against a
    // permissive fake and fails only against a real provider.
    test('the verifier it redeems with hashes to the challenge it sent', async () => {
        const browser = fakeBrowser({ redirectParam: 'callback_url' })
        const endpoint = fakeTokenEndpoint(() => ({ payload: { key: 'k' } }))

        await connect({
            provider: OPENROUTER,
            openExternal: browser.openExternal,
            fetchImpl: endpoint.fetchImpl,
        })

        const redeemed = JSON.parse(endpoint.calls[0].body)

        assert.ok(redeemed.code_verifier, 'no verifier was presented')
        assert.equal(challengeFor(redeemed.code_verifier), browser.seen.challenge)
        assert.equal(redeemed.code_challenge_method, 'S256')
    })

    test("honours OpenRouter's callback_url in place of redirect_uri", async () => {
        const browser = fakeBrowser({ redirectParam: 'callback_url' })
        const endpoint = fakeTokenEndpoint(() => ({ payload: { key: 'k' } }))

        await connect({
            provider: OPENROUTER,
            openExternal: browser.openExternal,
            fetchImpl: endpoint.fetchImpl,
        })

        assert.equal(browser.seen.authorizeUrl.searchParams.has('redirect_uri'), false)
        assert.match(browser.seen.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/)
        // No client id to send, and an empty one must not be sent as a blank.
        assert.equal(browser.seen.authorizeUrl.searchParams.has('client_id'), false)
    })

    test('runs a standard OAuth 2.0 provider and yields a token', async () => {
        const browser = fakeBrowser()
        const endpoint = fakeTokenEndpoint(() => ({
            payload: { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 },
        }))

        const result = await connect({
            provider: OAUTH2,
            openExternal: browser.openExternal,
            fetchImpl: endpoint.fetchImpl,
            now: () => Date.parse('2026-08-26T12:00:00.000Z'),
        })

        assert.equal(result.kind, 'oauth-token')
        assert.equal(result.token.access, 'at-1')
        assert.equal(result.token.refresh, 'rt-1')
        // expires_in is relative, and must be resolved against a clock at the
        // moment of the response — storing 3600 would look fresh forever.
        assert.equal(result.token.expires, '2026-08-26T13:00:00.000Z')
    })

    // RFC 6749 §4.1.3: the redirect URI at the token endpoint must match the
    // one sent to the authorize endpoint. Providers enforce this, and report a
    // mismatch as an unhelpful invalid_grant.
    test('sends the same redirect URI to both endpoints', async () => {
        const browser = fakeBrowser()
        const endpoint = fakeTokenEndpoint(() => ({
            payload: { access_token: 'at', expires_in: 60 },
        }))

        await connect({
            provider: OAUTH2,
            openExternal: browser.openExternal,
            fetchImpl: endpoint.fetchImpl,
        })

        const redeemed = new URLSearchParams(endpoint.calls[0].body)
        assert.equal(redeemed.get('redirect_uri'), browser.seen.redirectUri)
        assert.equal(redeemed.get('grant_type'), 'authorization_code')
        assert.equal(redeemed.get('client_id'), 'client-1')
    })

    test('leaves a token with no stated expiry unstamped', async () => {
        const browser = fakeBrowser()
        const endpoint = fakeTokenEndpoint(() => ({ payload: { access_token: 'at' } }))

        const result = await connect({
            provider: OAUTH2,
            openExternal: browser.openExternal,
            fetchImpl: endpoint.fetchImpl,
        })

        // Empty rather than invented: the Go side reads this as "do not renew".
        assert.equal(result.token.expires, '')
    })

    test('reports what the token endpoint said when it refuses', async () => {
        const browser = fakeBrowser()
        const endpoint = fakeTokenEndpoint(() => ({
            status: 400,
            payload: { error: 'invalid_grant', error_description: 'code already used' },
        }))

        await assert.rejects(
            connect({
                provider: OAUTH2,
                openExternal: browser.openExternal,
                fetchImpl: endpoint.fetchImpl,
            }),
            /invalid_grant: code already used/,
        )
    })

    test('rejects a callback whose state was tampered with', async () => {
        const browser = fakeBrowser({
            state: 'not-the-state-we-sent',
            redirectParam: 'callback_url',
        })
        const endpoint = fakeTokenEndpoint(() => ({ payload: { key: 'k' } }))

        await assert.rejects(
            connect({
                provider: OPENROUTER,
                openExternal: browser.openExternal,
                fetchImpl: endpoint.fetchImpl,
                timeoutMs: 500,
            }),
            /state did not match/,
        )
        assert.equal(endpoint.calls.length, 0, 'must not redeem a code it did not ask for')
    })

    // A flow the user abandons must not hold the port for the rest of the
    // session, so the receiver is closed however the flow ends.
    for (const [name, reply] of [
        ['succeeds', () => ({ payload: { key: 'k' } })],
        ['fails', () => ({ status: 400, payload: { error: 'nope' } })],
    ]) {
        test(`releases the loopback port when the flow ${name}`, async () => {
            const browser = fakeBrowser({ redirectParam: 'callback_url' })
            const endpoint = fakeTokenEndpoint(reply)

            await connect({
                provider: OPENROUTER,
                openExternal: browser.openExternal,
                fetchImpl: endpoint.fetchImpl,
            }).catch(() => {})

            await new Promise((resolve) => setTimeout(resolve, 50))
            await assert.rejects(fetch(browser.seen.redirectUri), /fetch failed/)
        })
    }

    test('refuses a provider asking for an exchange that does not exist', async () => {
        await assert.rejects(
            connect({
                provider: { ...OAUTH2, exchange: 'saml' },
                openExternal: async () => {},
            }),
            /unknown exchange: saml/,
        )
    })
})

describe('refresh', () => {
    test('trades a refresh token for a new pair', async () => {
        const endpoint = fakeTokenEndpoint(() => ({
            payload: { access_token: 'at-2', refresh_token: 'rt-2', expires_in: 1800 },
        }))

        const token = await refresh({
            provider: OAUTH2,
            refreshToken: 'rt-1',
            fetchImpl: endpoint.fetchImpl,
            now: () => Date.parse('2026-08-26T12:00:00.000Z'),
        })

        assert.deepEqual(token, {
            access: 'at-2',
            refresh: 'rt-2',
            expires: '2026-08-26T12:30:00.000Z',
        })

        const sent = new URLSearchParams(endpoint.calls[0].body)
        assert.equal(sent.get('grant_type'), 'refresh_token')
        assert.equal(sent.get('refresh_token'), 'rt-1')
    })

    // Some providers rotate only the access token. Taking that literally would
    // strand the credential on the next renewal.
    test('keeps the old refresh token when none is returned', async () => {
        const endpoint = fakeTokenEndpoint(() => ({
            payload: { access_token: 'at-2', expires_in: 60 },
        }))

        const token = await refresh({
            provider: OAUTH2,
            refreshToken: 'keep-me',
            fetchImpl: endpoint.fetchImpl,
        })

        assert.equal(token.refresh, 'keep-me')
    })

    test('refuses a provider that issues keys rather than tokens', async () => {
        await assert.rejects(
            refresh({ provider: OPENROUTER, refreshToken: 'x' }),
            /does not expire and cannot be refreshed/,
        )
    })

    test('refuses to refresh with nothing', async () => {
        await assert.rejects(refresh({ provider: OAUTH2, refreshToken: '' }), /no refresh token/)
    })
})
