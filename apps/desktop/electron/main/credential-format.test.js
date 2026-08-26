import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import {
    apiKeyCredential,
    describeCredential,
    parseCredential,
    serialiseCredential,
    tokenCredential,
} from './credential-format.js'

describe('parseCredential', () => {
    test('round-trips a key', () => {
        const stored = serialiseCredential(apiKeyCredential('sk-abc', 'openrouter'))

        assert.deepEqual(parseCredential(stored), {
            kind: 'api-key',
            provider: 'openrouter',
            key: 'sk-abc',
        })
    })

    test('round-trips a token', () => {
        const stored = serialiseCredential(
            tokenCredential(
                { access: 'at', refresh: 'rt', expires: '2026-08-26T13:00:00.000Z' },
                'example',
            ),
        )

        assert.deepEqual(parseCredential(stored), {
            kind: 'oauth-token',
            provider: 'example',
            token: { access: 'at', refresh: 'rt', expires: '2026-08-26T13:00:00.000Z' },
        })
    })

    // The file held a bare key before this format existed. Failing to
    // recognise it would silently disconnect the user's provider on upgrade.
    test('reads a bare key left by an earlier version', () => {
        assert.deepEqual(parseCredential('sk-ant-legacy'), {
            kind: 'api-key',
            provider: '',
            key: 'sk-ant-legacy',
        })
    })

    // JSON.parse accepts bare scalars, so a key that happens to be quoted
    // parses as a string rather than failing into the legacy branch.
    test('reads a quoted bare key', () => {
        assert.deepEqual(parseCredential('"sk-quoted"'), {
            kind: 'api-key',
            provider: '',
            key: 'sk-quoted',
        })
    })

    test('treats a record with no kind as a key', () => {
        assert.deepEqual(parseCredential('{"version":1,"key":"sk-x","provider":"p"}'), {
            kind: 'api-key',
            provider: 'p',
            key: 'sk-x',
        })
    })

    test('fills in a token record missing its optional fields', () => {
        const parsed = parseCredential('{"kind":"oauth-token","token":{"access":"at"}}')

        assert.deepEqual(parsed.token, { access: 'at', refresh: '', expires: '' })
        assert.equal(parsed.provider, '')
    })

    for (const [name, text] of [
        ['nothing', ''],
        ['whitespace', '   \n '],
        ['undefined', undefined],
        ['a number', '42'],
        ['null', 'null'],
        ['an empty object', '{}'],
        ['a key record with no key', '{"kind":"api-key","key":"  "}'],
        // Present-but-unusable is worse than absent: it shows a connected
        // account that cannot make a single call.
        ['a token record with no access token', '{"kind":"oauth-token","token":{"refresh":"rt"}}'],
        ['a token record with no token', '{"kind":"oauth-token"}'],
    ]) {
        test(`returns null for ${name}`, () => {
            assert.equal(parseCredential(text), null)
        })
    }
})

describe('describeCredential', () => {
    test('says nothing is stored when nothing is', () => {
        assert.deepEqual(describeCredential(null), {
            present: false,
            kind: '',
            provider: '',
            expires: '',
        })
    })

    // The bridge is write-only. Whatever this returns crosses to the renderer,
    // so the secret itself must not be in it.
    test('never carries the secret', () => {
        for (const credential of [
            apiKeyCredential('sk-secret', 'openrouter'),
            tokenCredential({ access: 'at-secret', refresh: 'rt-secret', expires: '' }, 'example'),
        ]) {
            const described = JSON.stringify(describeCredential(credential))

            assert.doesNotMatch(described, /secret/)
        }
    })

    test('reports the expiry of a token so the UI can explain a renewal', () => {
        const described = describeCredential(
            tokenCredential({ access: 'at', expires: '2026-08-26T13:00:00.000Z' }, 'example'),
        )

        assert.deepEqual(described, {
            present: true,
            kind: 'oauth-token',
            provider: 'example',
            expires: '2026-08-26T13:00:00.000Z',
        })
    })
})
