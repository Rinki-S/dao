/**
 * Keeping an access token fresh.
 *
 * The governing idea is that the timer is not the source of truth — the
 * expiry is. Every wake-up recomputes what to do from the stored token rather
 * than assuming the timer fired when it was asked to, because on a laptop it
 * very often did not: the machine slept through the appointment. A scheduler
 * that trusts its own timer works perfectly until the first time the lid is
 * closed, and then hands out a token that expired hours ago.
 *
 * So `tick` is idempotent and safe to call at any moment, from any cause — the
 * timer, waking from sleep, a 401 coming back from the provider. Each call
 * asks the same question: given what is stored right now, does it need
 * renewing, and when should I next look?
 */

// Renew this long before the stated expiry. Long enough to absorb a retry or
// two, short enough not to burn most of a token's life.
const LEAD_MS = 5 * 60 * 1000

// setTimeout stores its delay in a signed 32-bit integer, so anything beyond
// ~24.8 days silently fires immediately. Long-lived tokens exist, so the wait
// is capped and simply re-evaluated when it elapses.
const MAX_DELAY_MS = 24 * 60 * 60 * 1000

// A floor, so a token that is already expired does not spin.
const MIN_DELAY_MS = 1000

const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000]

/**
 * When the next check should happen for a given token.
 *
 * Returns 0 when it needs renewing now, and null when there is nothing to
 * schedule — no token, or one with no stated expiry, which is a token this
 * process was told to use as-is.
 */
export function nextCheckDelay(token, now) {
    if (!token?.access) return null

    const expires = Date.parse(token.expires ?? '')
    if (!Number.isFinite(expires)) return null

    const due = expires - LEAD_MS - now
    if (due <= 0) return 0

    return Math.min(due, MAX_DELAY_MS)
}

/**
 * @param {object} deps
 * @param {() => import('./credential-format.js').StoredCredential|null} deps.readCredential
 * @param {(token: object, provider: string) => {ok: boolean, error: string}} deps.writeToken
 * @param {(secret: string, kind: string) => Promise<void>} deps.pushToService
 * @param {(provider: string, refreshToken: string) => Promise<object>} deps.refreshToken
 * @param {() => number} [deps.now]
 * @param {(fn: Function, ms: number) => any} [deps.setTimer]
 * @param {(handle: any) => void} [deps.clearTimer]
 * @param {(event: object) => void} [deps.onEvent]
 */
export function createRefreshScheduler({
    readCredential,
    writeToken,
    pushToService,
    refreshToken,
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onEvent = () => {},
}) {
    let handle = null
    let running = null
    let failures = 0
    let stopped = true

    function cancel() {
        if (handle !== null) {
            clearTimer(handle)
            handle = null
        }
    }

    function scheduleIn(delay) {
        cancel()
        if (stopped) return

        handle = setTimer(() => {
            handle = null
            // Returned rather than discarded. setTimeout ignores it, so this
            // costs nothing in production, and it is what lets a test drive
            // the scheduler on a fake clock and await what each tick did.
            return tick()
        }, Math.max(delay, MIN_DELAY_MS))
    }

    async function renew(credential) {
        const result = await refreshToken(credential.provider, credential.token.refresh)

        const stored = writeToken(result, credential.provider)
        if (!stored.ok) {
            // The renewal succeeded but could not be written down. The process
            // still holds a working token, so it is pushed anyway — but the
            // next start would find the consumed one, and that is worth
            // saying rather than swallowing.
            onEvent({ type: 'store-failed', error: stored.error })
        }

        // Pushed after storing, so a crash between the two leaves the stored
        // token ahead of the service rather than behind it. A service running
        // on an older token recovers on its next push; one running on a token
        // that was never stored does not.
        await pushToService(result.access, 'oauth-token')

        failures = 0
        onEvent({ type: 'refreshed', expires: result.expires })

        return result
    }

    /**
     * Look at what is stored and do whatever it now requires.
     *
     * Single-flight: a tick arriving while one is in progress joins it rather
     * than starting a second renewal. Refresh tokens rotate, so two concurrent
     * renewals mean the second presents one the first already consumed.
     */
    function tick() {
        if (running) return running

        running = (async () => {
            const credential = readCredential()

            if (credential?.kind !== 'oauth-token') {
                // Nothing renewable is stored. A key, or nothing at all.
                cancel()
                return
            }

            const delay = nextCheckDelay(credential.token, now())

            if (delay === null) {
                // A token with no stated expiry is used until something else
                // says otherwise — there is nothing to schedule against.
                cancel()
                return
            }
            if (delay > 0) {
                scheduleIn(delay)
                return
            }
            if (!credential.token.refresh) {
                onEvent({ type: 'needs-reconnect', error: 'the stored token cannot be renewed' })
                cancel()
                return
            }

            try {
                const renewed = await renew(credential)
                scheduleIn(nextCheckDelay(renewed, now()) ?? MAX_DELAY_MS)
            } catch (error) {
                failures += 1
                const message = error instanceof Error ? error.message : String(error)

                if (failures > BACKOFF_MS.length) {
                    // Out of patience. The user has to sign in again, and
                    // retrying on a timer forever would hide that from them.
                    onEvent({ type: 'needs-reconnect', error: message })
                    cancel()
                    return
                }

                onEvent({ type: 'retrying', error: message, attempt: failures })
                scheduleIn(BACKOFF_MS[failures - 1])
            }
        })().finally(() => {
            running = null
        })

        return running
    }

    return {
        start() {
            stopped = false
            failures = 0
            return tick()
        },
        stop() {
            stopped = true
            cancel()
        },
        /**
         * Re-evaluate now.
         *
         * Called on waking from sleep, where the timer's appointment has very
         * likely passed while the machine was off, and after a 401, where the
         * provider has just said the token is no good regardless of what its
         * stated expiry claims.
         */
        tick,
    }
}
