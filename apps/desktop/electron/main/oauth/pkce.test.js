import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { buildAuthorizeUrl, challengeFor, createPkcePair, createState, stateMatches } from './pkce.js'

describe('challengeFor', () => {
    // RFC 7636 Appendix B. This is the whole reason the derivation is a
    // separate function: base64 instead of base64url, or hashing the decoded
    // bytes rather than the ASCII, both produce a plausible-looking challenge
    // that only fails at the provider.
    test('matches the specification test vector', () => {
        assert.equal(
            challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
            'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        )
    })
})

describe('createPkcePair', () => {
    test('produces a verifier inside the permitted length and character set', () => {
        const { verifier, method } = createPkcePair()

        assert.equal(method, 'S256')
        assert.ok(verifier.length >= 43 && verifier.length <= 128, `length ${verifier.length}`)
        // Unreserved characters only, so the verifier never needs escaping.
        assert.match(verifier, /^[A-Za-z0-9\-._~]+$/)
    })

    test('derives the challenge from the verifier it returns', () => {
        const { verifier, challenge } = createPkcePair()
        assert.equal(challenge, challengeFor(verifier))
    })

    test('is different every time', () => {
        const seen = new Set(Array.from({ length: 50 }, () => createPkcePair().verifier))
        assert.equal(seen.size, 50)
    })
})

describe('stateMatches', () => {
    const state = createState()

    test('accepts the value it was given', () => {
        assert.equal(stateMatches(state, state), true)
    })

    test('rejects a different value of the same length', () => {
        const other = createState()
        assert.equal(other.length, state.length)
        assert.equal(stateMatches(state, other), false)
    })

    test('rejects mismatched lengths without throwing', () => {
        // timingSafeEqual throws on unequal lengths, so this has to be caught
        // before it gets there.
        assert.equal(stateMatches(state, state.slice(0, -1)), false)
        assert.equal(stateMatches(state, state + 'x'), false)
    })

    test('rejects empty and non-string values', () => {
        assert.equal(stateMatches('', ''), false)
        assert.equal(stateMatches(state, undefined), false)
        assert.equal(stateMatches(state, null), false)
        assert.equal(stateMatches(undefined, undefined), false)
    })
})

describe('buildAuthorizeUrl', () => {
    const base = {
        authorizeUrl: 'https://provider.test/auth',
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1:43117/callback',
        challenge: 'CHALLENGE',
        state: 'STATE',
    }

    test('carries the standard parameters', () => {
        const params = new URL(buildAuthorizeUrl(base)).searchParams

        assert.equal(params.get('response_type'), 'code')
        assert.equal(params.get('code_challenge'), 'CHALLENGE')
        assert.equal(params.get('code_challenge_method'), 'S256')
        assert.equal(params.get('redirect_uri'), base.redirectUri)
        assert.equal(params.get('state'), 'STATE')
        assert.equal(params.get('client_id'), 'client-1')
    })

    test('omits empty optional parameters rather than sending blanks', () => {
        const params = new URL(buildAuthorizeUrl({ ...base, clientId: '', scope: '' })).searchParams

        assert.equal(params.has('client_id'), false)
        assert.equal(params.has('scope'), false)
    })

    test('merges provider-specific extras', () => {
        const url = buildAuthorizeUrl({ ...base, scope: 'read write', extra: { prompt: 'consent' } })
        const params = new URL(url).searchParams

        assert.equal(params.get('scope'), 'read write')
        assert.equal(params.get('prompt'), 'consent')
    })

    test('keeps query already present on the authorize URL', () => {
        const url = buildAuthorizeUrl({ ...base, authorizeUrl: 'https://provider.test/auth?tenant=x' })
        assert.equal(new URL(url).searchParams.get('tenant'), 'x')
    })

    for (const missing of ['authorizeUrl', 'redirectUri', 'challenge', 'state']) {
        test(`refuses to build without ${missing}`, () => {
            assert.throws(() => buildAuthorizeUrl({ ...base, [missing]: '' }), new RegExp(missing))
        })
    }
})
