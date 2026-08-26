import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { startCallbackReceiver } from './loopback.js'
import { createState } from './pkce.js'

// An ephemeral port for every test: a fixed one would collide with a running
// app, and with the other tests in this file.
const ephemeral = { ports: [] }

/** Start a receiver and guarantee the port is released however the test ends. */
async function receiver(t, options = ephemeral) {
    const started = await startCallbackReceiver(options)
    t.after(() => started.close())
    return started
}

/** Resolves once the promise settles, or to 'pending' if it has not. */
function settledWithin(promise, ms) {
    return Promise.race([
        promise.then(() => 'resolved', () => 'rejected'),
        new Promise((resolve) => setTimeout(() => resolve('pending'), ms)),
    ])
}

describe('startCallbackReceiver', () => {
    test('listens on loopback only, at the advertised path', async (t) => {
        const started = await receiver(t, { ...ephemeral, path: '/oauth/done' })
        const url = new URL(started.redirectUri)

        assert.equal(url.hostname, '127.0.0.1')
        assert.equal(url.pathname, '/oauth/done')
        assert.ok(Number(url.port) > 0)
    })

    test('delivers the code when the state matches', async (t) => {
        const started = await receiver(t)
        const state = createState()

        const waiting = started.waitForCode({ expectedState: state })
        const response = await fetch(`${started.redirectUri}?code=abc123&state=${state}`)

        assert.equal(response.status, 200)
        assert.equal(await waiting, 'abc123')
    })

    // The defence against a code from someone else's session being planted in
    // our callback.
    // The assertion is attached before the callback is delivered, not after.
    // The wait rejects while the fetch is still in flight, and a rejection
    // with no handler yet attached is an unhandled rejection.
    test('refuses a callback whose state does not match', async (t) => {
        const started = await receiver(t)

        const asserted = assert.rejects(
            started.waitForCode({ expectedState: createState() }),
            /state did not match/,
        )
        await fetch(`${started.redirectUri}?code=abc123&state=${createState()}`)
        await asserted
    })

    test('reports a refusal delivered through the redirect', async (t) => {
        const started = await receiver(t)
        const state = createState()

        const asserted = assert.rejects(
            started.waitForCode({ expectedState: state }),
            /access_denied/,
        )
        await fetch(`${started.redirectUri}?error=access_denied&error_description=User+said+no&state=${state}`)
        await asserted
    })

    test('rejects a callback carrying no code', async (t) => {
        const started = await receiver(t)
        const state = createState()

        const asserted = assert.rejects(
            started.waitForCode({ expectedState: state }),
            /no authorisation code/,
        )
        await fetch(`${started.redirectUri}?state=${state}`)
        await asserted
    })

    // Browsers request /favicon.ico unprompted. Treating an incidental request
    // as the callback would settle the flow with nothing in it.
    test('ignores requests to other paths', async (t) => {
        const started = await receiver(t)
        const state = createState()
        const origin = new URL(started.redirectUri).origin

        const waiting = started.waitForCode({ expectedState: state })

        assert.equal((await fetch(`${origin}/favicon.ico`)).status, 404)
        assert.equal((await fetch(`${origin}/`)).status, 404)
        assert.equal(await settledWithin(waiting, 60), 'pending')

        // Still usable afterwards.
        await fetch(`${started.redirectUri}?code=ok&state=${state}`)
        assert.equal(await waiting, 'ok')
    })

    test('ignores a non-GET request to the callback path', async (t) => {
        const started = await receiver(t)
        const waiting = started.waitForCode({ expectedState: createState() })

        assert.equal((await fetch(started.redirectUri, { method: 'POST' })).status, 404)
        assert.equal(await settledWithin(waiting, 60), 'pending')
    })

    test('gives up rather than waiting forever', async (t) => {
        const started = await receiver(t)

        await assert.rejects(
            started.waitForCode({ expectedState: createState(), timeoutMs: 30 }),
            /timed out/,
        )
    })

    test('can be cancelled', async (t) => {
        const started = await receiver(t)
        const controller = new AbortController()

        const waiting = started.waitForCode({ expectedState: createState(), signal: controller.signal })
        controller.abort()

        await assert.rejects(waiting, /cancelled/)
    })

    test('answers a second callback without settling the flow twice', async (t) => {
        const started = await receiver(t)
        const state = createState()

        const waiting = started.waitForCode({ expectedState: state })
        await fetch(`${started.redirectUri}?code=first&state=${state}`)
        assert.equal(await waiting, 'first')

        // A replayed redirect must not throw an unhandled rejection into a
        // promise that has already settled.
        const replay = await fetch(`${started.redirectUri}?code=second&state=${state}`)
        assert.equal(replay.status, 400)
    })

    test('releases the port on close', async () => {
        const started = await startCallbackReceiver(ephemeral)
        const { redirectUri } = started
        started.close()

        // Give the listener a moment to actually come down.
        await new Promise((resolve) => setTimeout(resolve, 50))
        await assert.rejects(fetch(redirectUri), /fetch failed/)
    })
})
