import http from 'node:http'
import { stateMatches } from './pkce.js'

/**
 * The loopback redirect receiver (RFC 8252 §7.3).
 *
 * A native app has no web server to redirect back to, so it briefly becomes
 * one: it listens on 127.0.0.1, hands the provider that address as the
 * redirect URI, and the browser delivers the authorisation code straight back
 * to the process that asked for it.
 *
 * This is preferred over a custom scheme like `dao://` because scheme
 * registration is first-come or last-write depending on the OS, so any other
 * application can claim it and receive codes meant for this one. A loopback
 * port cannot be claimed while it is held.
 */

// Ports tried in order before falling back to whatever the OS gives out.
// Providers that require an exactly pre-registered redirect URI need a stable
// port; ones that accept any callback URL do not care.
const PREFERRED_PORTS = [43117, 43118, 43119]

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function page(title, message) {
    // Self-contained: this renders in the user's browser, which must not be
    // made to fetch anything on our behalf.
    return `<!doctype html><meta charset="utf-8">
<title>${title}</title>
<body style="font:16px/1.6 system-ui,sans-serif;margin:4rem auto;max-width:28rem;padding:0 1rem">
<h1 style="font-size:1.1rem">${title}</h1>
<p style="color:#555">${message}</p>
</body>`
}

function listen(server, port) {
    return new Promise((resolve, reject) => {
        const onError = (error) => {
            server.removeListener('listening', onListening)
            reject(error)
        }
        const onListening = () => {
            server.removeListener('error', onError)
            resolve()
        }

        server.once('error', onError)
        server.once('listening', onListening)
        // Bound to the loopback interface explicitly. Binding to 0.0.0.0 would
        // expose the callback — and any code delivered to it — to the network.
        server.listen(port, '127.0.0.1')
    })
}

/**
 * Start listening, and report the redirect URI to send the provider to.
 *
 * The server must already be up before the browser is opened, or the redirect
 * can arrive before there is anything to receive it.
 */
export async function startCallbackReceiver({ path = '/callback', ports = PREFERRED_PORTS } = {}) {
    let settle = null
    let finished = false
    // Where a callback goes when it arrives before anyone is waiting.
    //
    // The redirect is delivered by a browser we do not control, and nothing
    // guarantees it lands after waitForCode has been called — a provider that
    // redirects instantly, or a code already in the browser's cache, can beat
    // us to it. Dropping it in that window would strand the flow until it
    // timed out, with no sign of why.
    let buffered = null

    const deliver = (result) => {
        if (settle) {
            settle(result)
            return
        }
        buffered = result
    }

    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1')

        // Browsers ask for /favicon.ico unprompted. Answering anything other
        // than "not found" on a path we did not advertise risks treating an
        // incidental request as the callback.
        if (request.method !== 'GET' || url.pathname !== path) {
            response.writeHead(404).end()
            return
        }
        if (finished) {
            response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
            response.end(page('Already handled', 'This sign-in link has already been used.'))
            return
        }

        const params = url.searchParams
        const failure = params.get('error')

        // The provider reports refusal through the redirect, not through a
        // failed request, so this is the only place a denial shows up.
        if (failure) {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
            response.end(page('Sign-in failed', params.get('error_description') || failure))
            deliver({ error: new Error(`provider refused authorisation: ${failure}`) })
            return
        }

        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(page('Signed in', 'You can close this tab and return to Dao.'))

        deliver({
            code: params.get('code') ?? '',
            state: params.get('state') ?? '',
        })
    })

    let bound = false
    for (const port of ports) {
        try {
            await listen(server, port)
            bound = true
            break
        } catch (error) {
            // Anything other than the port being taken is a real failure.
            if (error?.code !== 'EADDRINUSE') throw error
        }
    }
    if (!bound) {
        // Port 0: the OS picks a free one. Only usable with providers that
        // accept an arbitrary callback URL.
        await listen(server, 0)
    }

    const { port } = server.address()

    return {
        redirectUri: `http://127.0.0.1:${port}${path}`,

        /**
         * Wait for the browser to deliver a code.
         *
         * The state check happens here rather than at the request, because a
         * mismatched state is not something to tell the browser about — it
         * means someone other than us started this flow.
         */
        waitForCode({ expectedState, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
            return new Promise((resolve, reject) => {
                const finish = (fn, value) => {
                    if (finished) return
                    finished = true
                    clearTimeout(timer)
                    signal?.removeEventListener('abort', onAbort)
                    fn(value)
                }

                const timer = setTimeout(
                    () => finish(reject, new Error('timed out waiting for the browser to return')),
                    timeoutMs,
                )
                const onAbort = () => finish(reject, new Error('sign-in was cancelled'))
                signal?.addEventListener('abort', onAbort, { once: true })

                settle = (result) => {
                    if (result.error) {
                        finish(reject, result.error)
                        return
                    }
                    if (!stateMatches(expectedState, result.state)) {
                        finish(reject, new Error('state did not match; ignoring this callback'))
                        return
                    }
                    if (!result.code) {
                        finish(reject, new Error('callback carried no authorisation code'))
                        return
                    }
                    finish(resolve, result.code)
                }

                // A callback that arrived before this wait existed is sitting
                // in the buffer. Consume it rather than waiting for a second
                // one that is never coming.
                if (buffered) {
                    const arrived = buffered
                    buffered = null
                    settle(arrived)
                }
            })
        },

        close() {
            // A pending wait is settled rather than abandoned. Leaving it
            // hanging would keep both the promise and its timeout alive for
            // the full timeout window, holding the event loop open long after
            // the receiver is meant to be gone.
            settle?.({ error: new Error('sign-in was cancelled') })
            finished = true

            server.close()
            // Without this a browser keeping the connection alive holds the
            // port open after close() resolves.
            server.closeAllConnections?.()
        },
    }
}
