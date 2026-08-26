import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { apiKeyCredential, tokenCredential } from '../credential-format.js'
import { createRefreshScheduler } from '../refresh-scheduler.js'
import { connect, refresh } from './flow.js'
import { followRedirect, startFakeProvider } from './testing/fake-provider.js'

/**
 * The renewal path, executed rather than described.
 *
 * Everything below this line has been covered by unit tests against fakes that
 * agree with whatever they are told. This runs it against a provider that
 * enforces PKCE and refuses a consumed refresh token — the two rules whose
 * violation is silent locally and fatal in production.
 *
 * Real HTTP, real crypto, real rotation. Time is the one thing left synthetic:
 * a test should never wait for a token to age.
 */

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-08-26T12:00:00.000Z')

async function provider(t, options) {
    const fake = await startFakeProvider(options)
    t.after(() => fake.close())
    return fake
}

/** A clock whose timers only run when told, so sleep is expressible. */
function fakeClock(start = NOW) {
    let current = start
    let next = 1
    const timers = new Map()

    return {
        now: () => current,
        setTimer(fn, ms) {
            const id = next++
            timers.set(id, { fn, at: current + ms })
            return id
        },
        clearTimer: (id) => timers.delete(id),
        pending: () => [...timers.values()].map((timer) => timer.at - current),
        async advance(ms) {
            current += ms
            for (const [id, timer] of [...timers]) {
                if (timer.at <= current) {
                    timers.delete(id)
                    await timer.fn()
                }
            }
        },
        sleep(ms) {
            current += ms
        },
    }
}

/**
 * The desktop side, with the keychain replaced by a variable and the local
 * service by a list. Everything between them is the real thing.
 */
function desktop(fake, clock) {
    let held = null
    const pushed = []
    const events = []

    const scheduler = createRefreshScheduler({
        readCredential: () => held,
        writeToken(token, providerId) {
            held = tokenCredential(token, providerId)
            return { ok: true, error: '' }
        },
        async pushToService(secret, kind) {
            pushed.push({ secret, kind })
        },
        refreshToken: (_providerId, refreshTokenValue) =>
            refresh({ provider: fake.provider, refreshToken: refreshTokenValue, now: clock.now }),
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        onEvent: (event) => events.push(event),
    })

    return {
        scheduler,
        pushed,
        events,
        held: () => held,
        setHeld: (value) => {
            held = value
        },
        async signIn() {
            const result = await connect({
                provider: fake.provider,
                openExternal: followRedirect,
                now: clock.now,
            })

            held = tokenCredential(result.token, fake.provider.id)
            pushed.push({ secret: result.token.access, kind: 'oauth-token' })

            return result
        },
    }
}

describe('the renewal path, against a provider that checks', () => {
    test('signs in, and the provider accepts the PKCE pair', async (t) => {
        const fake = await provider(t)
        const clock = fakeClock()
        const app = desktop(fake, clock)

        const result = await app.signIn()

        assert.equal(result.kind, 'oauth-token')
        assert.equal(result.token.access, 'at-1')
        assert.equal(result.token.refresh, 'rt-1')
        // An hour of life, resolved against the clock at the response.
        assert.equal(result.token.expires, new Date(NOW + HOUR).toISOString())
        assert.deepEqual(fake.rejected, [], `provider refused: ${fake.rejected}`)
    })

    test('renews when the token nears expiry, and rotates the refresh token', async (t) => {
        const fake = await provider(t)
        const clock = fakeClock()
        const app = desktop(fake, clock)

        await app.signIn()
        await app.scheduler.start()

        // Nothing to do yet: renewal is due five minutes before expiry.
        assert.deepEqual(clock.pending(), [HOUR - 5 * 60 * 1000])
        assert.equal(fake.issued.length, 1)

        await clock.advance(HOUR - 5 * 60 * 1000)

        assert.equal(fake.issued.length, 2, 'did not renew')
        assert.equal(app.held().token.access, 'at-2')
        assert.equal(app.held().token.refresh, 'rt-2', 'kept the rotated-away refresh token')
        assert.deepEqual(app.pushed.at(-1), { secret: 'at-2', kind: 'oauth-token' })

        // The old one is gone at the provider, which is what makes a second
        // renewal with it fail.
        assert.deepEqual(fake.liveRefreshTokens(), ['rt-2'])
        assert.deepEqual(fake.rejected, [])
    })

    // The case the whole scheduler is shaped around: the machine sleeps past
    // the appointment, so on waking the timer has not run and the token is
    // dead.
    test('recovers from a sleep that outlasted the token', async (t) => {
        const fake = await provider(t)
        const clock = fakeClock()
        const app = desktop(fake, clock)

        await app.signIn()
        await app.scheduler.start()

        clock.sleep(6 * HOUR)
        assert.equal(fake.issued.length, 1, 'something ran while asleep')

        await app.scheduler.tick() // powerMonitor resume

        assert.equal(fake.issued.length, 2)
        assert.deepEqual(app.pushed.at(-1), { secret: 'at-2', kind: 'oauth-token' })
        assert.deepEqual(fake.rejected, [])
    })

    /**
     * The single-flight lock, proven rather than asserted.
     *
     * The provider consumes a refresh token on redemption. Without the lock,
     * concurrent ticks each present the same one and every attempt after the
     * first is refused — so `rejected` being empty is the whole result.
     */
    test('concurrent renewals do not present a consumed refresh token', async (t) => {
        const fake = await provider(t)
        const clock = fakeClock()
        const app = desktop(fake, clock)

        await app.signIn()
        clock.sleep(2 * HOUR) // well past expiry

        await Promise.all(Array.from({ length: 8 }, () => app.scheduler.tick()))

        assert.deepEqual(fake.rejected, [], 'presented a refresh token that was already spent')
        assert.equal(fake.issued.length, 2, 'renewed more than once')
        assert.equal(app.held().token.access, 'at-2')
    })

    test('a renewed token is the one the provider then accepts', async (t) => {
        const fake = await provider(t)
        const clock = fakeClock()
        const app = desktop(fake, clock)

        await app.signIn()
        const first = app.held().token.access

        clock.sleep(2 * HOUR)
        await app.scheduler.tick()
        const renewed = app.held().token.access

        // The stale one is refused and the fresh one works — the provider is
        // checking, not just recording.
        const stale = await fetch(`${fake.origin}/v1/chat/completions`, {
            method: 'POST',
            headers: { authorization: `Bearer ${first}` },
        })
        const fresh = await fetch(`${fake.origin}/v1/chat/completions`, {
            method: 'POST',
            headers: { authorization: `Bearer ${renewed}` },
        })

        assert.equal(stale.status, 401)
        assert.equal(fresh.status, 200)
    })

    test('a refresh token the provider has forgotten asks for a reconnect', async (t) => {
        const fake = await provider(t)
        const clock = fakeClock()
        const app = desktop(fake, clock)

        await app.signIn()
        // Stand in for a credential revoked from the provider's own account
        // page while the app was not looking.
        app.setHeld(
            tokenCredential(
                { access: 'at-1', refresh: 'rt-revoked', expires: new Date(NOW - HOUR).toISOString() },
                fake.provider.id,
            ),
        )

        await app.scheduler.start()
        for (const delay of [30_000, 60_000, 120_000, 300_000]) {
            await clock.advance(delay)
        }

        assert.equal(app.events.at(-1).type, 'needs-reconnect')
        assert.match(app.events.at(-1).error, /invalid_grant/)
        assert.deepEqual(clock.pending(), [], 'kept retrying after giving up')
    })

    test('leaves a stored key alone, having nothing to renew', async (t) => {
        const fake = await provider(t)
        const clock = fakeClock()
        const app = desktop(fake, clock)

        app.setHeld(apiKeyCredential('sk-typed-in', ''))
        await app.scheduler.start()

        assert.deepEqual(clock.pending(), [])
        assert.deepEqual(app.pushed, [])
        assert.equal(fake.issued.length, 0)
    })
})

describe('the fake provider is actually checking', () => {
    // If these pass trivially the tests above prove nothing, so the fixture is
    // tested against a client that gets it wrong on purpose.
    test('refuses a mismatched PKCE verifier', async (t) => {
        const fake = await provider(t)

        // Authorize with one challenge, redeem with an unrelated verifier.
        const authorize = new URL(fake.provider.authorizeUrl)
        authorize.searchParams.set('code_challenge', 'a-challenge-for-some-other-verifier')
        authorize.searchParams.set('code_challenge_method', 'S256')
        authorize.searchParams.set('redirect_uri', 'http://127.0.0.1:1/callback')
        authorize.searchParams.set('state', 's')

        // The redirect target does not exist, which does not matter: the code
        // is minted at the authorize endpoint.
        await fetch(authorize, { redirect: 'manual' })

        const response = await fetch(fake.provider.tokenUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: 'code-1',
                redirect_uri: 'http://127.0.0.1:1/callback',
                code_verifier: 'not-the-verifier',
            }),
        })

        assert.equal(response.status, 400)
        assert.deepEqual(fake.rejected, ['pkce mismatch'])
    })

    test('refuses a refresh token twice over', async (t) => {
        const fake = await provider(t)
        const clock = fakeClock()
        const app = desktop(fake, clock)

        await app.signIn()

        const redeem = () =>
            fetch(fake.provider.tokenUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'rt-1' }),
            })

        assert.equal((await redeem()).status, 200)
        assert.equal((await redeem()).status, 400, 'a consumed refresh token was accepted')
    })
})
