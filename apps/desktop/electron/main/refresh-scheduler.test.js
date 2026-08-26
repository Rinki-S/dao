import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { createRefreshScheduler, nextCheckDelay } from './refresh-scheduler.js'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-08-26T12:00:00.000Z')

function token(overrides = {}) {
    return {
        access: 'at',
        refresh: 'rt',
        expires: new Date(NOW + HOUR).toISOString(),
        ...overrides,
    }
}

/**
 * A controllable clock and timer queue.
 *
 * Real timers would make these tests slow and flaky, and — more to the point —
 * would make it impossible to test the case that matters, which is time
 * passing while nothing runs.
 */
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
        clearTimer(id) {
            timers.delete(id)
        },
        pending: () => [...timers.values()].map((timer) => timer.at - current),
        /** Move time forward, running whatever falls due. */
        async advance(ms) {
            current += ms
            for (const [id, timer] of [...timers]) {
                if (timer.at <= current) {
                    timers.delete(id)
                    await timer.fn()
                }
            }
        },
        /** Move time forward WITHOUT running timers — a machine asleep. */
        sleep(ms) {
            current += ms
        },
    }
}

function harness({ credential, refreshImpl, storeOk = true } = {}) {
    const clock = fakeClock()
    const events = []
    const pushed = []
    const stored = []
    let held = credential

    const scheduler = createRefreshScheduler({
        readCredential: () => held,
        writeToken(newToken, provider) {
            stored.push(newToken)
            if (!storeOk) return { ok: false, error: 'disk full' }
            held = { kind: 'oauth-token', provider, token: newToken }
            return { ok: true, error: '' }
        },
        async pushToService(secret, kind) {
            pushed.push({ secret, kind })
        },
        refreshToken: refreshImpl ?? (async () => token({ access: 'at-2', refresh: 'rt-2' })),
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        onEvent: (event) => events.push(event),
    })

    return { scheduler, clock, events, pushed, stored, held: () => held }
}

describe('nextCheckDelay', () => {
    test('schedules ahead of the expiry, not at it', () => {
        // An hour of life, renewed five minutes early.
        assert.equal(nextCheckDelay(token(), NOW), HOUR - 5 * 60 * 1000)
    })

    test('is due immediately once inside the lead window', () => {
        assert.equal(nextCheckDelay(token({ expires: new Date(NOW + 60_000).toISOString() }), NOW), 0)
        assert.equal(nextCheckDelay(token({ expires: new Date(NOW - HOUR).toISOString() }), NOW), 0)
    })

    // setTimeout keeps its delay in a signed 32-bit integer, so anything past
    // ~24.8 days fires immediately instead of never.
    test('caps a very distant expiry rather than overflowing the timer', () => {
        const distant = token({ expires: new Date(NOW + 400 * 24 * HOUR).toISOString() })

        assert.equal(nextCheckDelay(distant, NOW), 24 * HOUR)
    })

    for (const [name, value] of [
        ['no token', null],
        ['no access token', { access: '', expires: new Date(NOW + HOUR).toISOString() }],
        ['no stated expiry', token({ expires: '' })],
        ['an unparseable expiry', token({ expires: 'soon' })],
    ]) {
        test(`has nothing to schedule for ${name}`, () => {
            assert.equal(nextCheckDelay(value, NOW), null)
        })
    }
})

describe('createRefreshScheduler', () => {
    const connected = { kind: 'oauth-token', provider: 'example', token: token() }

    test('waits rather than renewing a fresh token', async () => {
        const { scheduler, clock, pushed } = harness({ credential: connected })

        await scheduler.start()

        assert.deepEqual(clock.pending(), [HOUR - 5 * 60 * 1000])
        assert.equal(pushed.length, 0, 'renewed a token that was still good')
    })

    test('renews when the timer comes due, stores, then pushes', async () => {
        const { scheduler, clock, pushed, stored, events } = harness({ credential: connected })

        await scheduler.start()
        await clock.advance(HOUR - 5 * 60 * 1000)

        assert.equal(stored.length, 1)
        assert.equal(stored[0].access, 'at-2')
        assert.deepEqual(pushed, [{ secret: 'at-2', kind: 'oauth-token' }])
        assert.equal(events.at(-1).type, 'refreshed')

        // And it lines up the next one.
        assert.equal(clock.pending().length, 1)
    })

    // The case the whole design exists for. The machine sleeps through the
    // appointment; on waking, the timer has not fired and the token is long
    // dead. A scheduler that trusts its timer hands out the dead one.
    test('renews on waking from a sleep that outlasted the token', async () => {
        const { scheduler, clock, pushed } = harness({ credential: connected })

        await scheduler.start()
        clock.sleep(4 * HOUR) // time passes; no timer runs

        assert.equal(pushed.length, 0, 'nothing should have run while asleep')

        await scheduler.tick() // what powerMonitor resume calls

        assert.deepEqual(pushed, [{ secret: 'at-2', kind: 'oauth-token' }])
    })

    // Refresh tokens rotate: two concurrent renewals mean the second presents
    // one the first already consumed.
    test('runs one renewal even when ticked many times at once', async () => {
        let calls = 0
        const { scheduler } = harness({
            credential: { kind: 'oauth-token', provider: 'example', token: token({ expires: new Date(NOW - HOUR).toISOString() }) },
            refreshImpl: async () => {
                calls += 1
                await new Promise((resolve) => setTimeout(resolve, 10))
                return token({ access: 'at-2', refresh: 'rt-2' })
            },
        })

        await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick(), scheduler.tick()])

        assert.equal(calls, 1)
    })

    test('backs off and retries when the provider is unreachable', async () => {
        let calls = 0
        const { scheduler, clock, events } = harness({
            credential: { kind: 'oauth-token', provider: 'example', token: token({ expires: new Date(NOW - HOUR).toISOString() }) },
            refreshImpl: async () => {
                calls += 1
                throw new Error('network down')
            },
        })

        await scheduler.start()
        assert.equal(calls, 1)
        assert.equal(events.at(-1).type, 'retrying')
        assert.deepEqual(clock.pending(), [30_000])

        await clock.advance(30_000)
        assert.equal(calls, 2)
        assert.deepEqual(clock.pending(), [60_000])
    })

    // Retrying forever would hide from the user that they have to sign in
    // again.
    test('gives up and asks for a reconnect', async () => {
        const { scheduler, clock, events } = harness({
            credential: { kind: 'oauth-token', provider: 'example', token: token({ expires: new Date(NOW - HOUR).toISOString() }) },
            refreshImpl: async () => {
                throw new Error('invalid_grant')
            },
        })

        await scheduler.start()
        for (const delay of [30_000, 60_000, 120_000, 300_000]) {
            await clock.advance(delay)
        }

        assert.equal(events.at(-1).type, 'needs-reconnect')
        assert.equal(events.at(-1).error, 'invalid_grant')
        assert.deepEqual(clock.pending(), [], 'kept retrying after giving up')
    })

    test('asks for a reconnect when the expired token has nothing to renew with', async () => {
        const { scheduler, events } = harness({
            credential: {
                kind: 'oauth-token',
                provider: 'example',
                token: token({ refresh: '', expires: new Date(NOW - HOUR).toISOString() }),
            },
        })

        await scheduler.start()

        assert.equal(events.at(-1).type, 'needs-reconnect')
    })

    // The renewal worked; only writing it down did not. The process still
    // holds a usable token, so it is pushed — but the next start would find
    // the consumed one, which is worth reporting.
    test('pushes a renewal it could not store, and says so', async () => {
        const { scheduler, pushed, events } = harness({
            credential: { kind: 'oauth-token', provider: 'example', token: token({ expires: new Date(NOW - HOUR).toISOString() }) },
            storeOk: false,
        })

        await scheduler.start()

        assert.deepEqual(pushed, [{ secret: 'at-2', kind: 'oauth-token' }])
        assert.ok(events.some((event) => event.type === 'store-failed'))
    })

    for (const [name, credential] of [
        ['nothing is stored', null],
        ['the credential is a key', { kind: 'api-key', provider: '', key: 'sk-1' }],
        ['the token has no stated expiry', { kind: 'oauth-token', provider: 'x', token: token({ expires: '' }) }],
    ]) {
        test(`does nothing when ${name}`, async () => {
            const { scheduler, clock, pushed } = harness({ credential })

            await scheduler.start()

            assert.deepEqual(clock.pending(), [])
            assert.equal(pushed.length, 0)
        })
    }

    test('stops scheduling once stopped', async () => {
        const { scheduler, clock } = harness({ credential: connected })

        await scheduler.start()
        assert.equal(clock.pending().length, 1)

        scheduler.stop()
        assert.deepEqual(clock.pending(), [])

        await scheduler.tick()
        assert.deepEqual(clock.pending(), [], 'a tick after stop re-armed the timer')
    })
})
