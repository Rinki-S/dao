import crypto from 'node:crypto'

/**
 * PKCE — Proof Key for Code Exchange (RFC 7636).
 *
 * The problem it solves: a native app cannot keep a client secret. Anything
 * shipped inside it can be read out of the binary, so the classic "prove you
 * are the client by presenting your secret" step is not available.
 *
 * PKCE replaces that fixed secret with a fresh one per attempt. Before sending
 * the user to the provider, the app invents a random `verifier` and sends only
 * its hash (the `challenge`). The provider ties that hash to the code it
 * issues. When the app comes back to trade the code for a token it presents
 * the verifier itself, and the provider checks that it hashes to what it was
 * given. An attacker who intercepts the redirect gets the code but not the
 * verifier, so the code is useless to them.
 *
 * The hash is what makes this work: the challenge travels over the same
 * channel an attacker could be watching, and knowing it does not let them
 * derive the verifier.
 */

// 32 random bytes is 43 base64url characters, comfortably inside RFC 7636's
// 43–128 range, and every character it produces is already unreserved — so
// the verifier needs no further escaping.
const VERIFIER_BYTES = 32

function base64url(buffer) {
    return buffer.toString('base64url')
}

/**
 * BASE64URL(SHA256(ASCII(verifier))) — RFC 7636 §4.2.
 *
 * Separate from createPkcePair so it can be pinned against the specification's
 * own test vector. Getting this subtly wrong (base64 instead of base64url,
 * hashing the decoded bytes instead of the ASCII) produces a challenge that
 * looks entirely plausible and fails only at the provider, as an opaque
 * "invalid_grant" at the very last step of the flow.
 */
export function challengeFor(verifier) {
    return base64url(crypto.createHash('sha256').update(verifier, 'ascii').digest())
}

/**
 * A fresh verifier and the challenge derived from it.
 *
 * Only ever call this once per authorisation attempt. Reusing a verifier
 * across attempts would defeat the point of it being per-attempt.
 */
export function createPkcePair() {
    const verifier = base64url(crypto.randomBytes(VERIFIER_BYTES))

    // S256 is the only method worth sending. The spec also allows "plain",
    // where the challenge *is* the verifier, which provides nothing.
    return { verifier, challenge: challengeFor(verifier), method: 'S256' }
}

/**
 * The `state` parameter, which is a different defence from PKCE.
 *
 * PKCE stops a stolen code being redeemed. State stops a code being *planted*:
 * without it, anyone who can reach the loopback callback could hand us a code
 * from their own session, and we would exchange it and quietly start acting as
 * their account. It is echoed back by the provider and must match.
 */
export function createState() {
    return base64url(crypto.randomBytes(VERIFIER_BYTES))
}

/**
 * Compare the returned state against the expected one.
 *
 * Constant-time because the comparison is against a secret we generated, and
 * an early-exit compare leaks how much of a guess was right. The length check
 * comes first because timingSafeEqual throws on a length mismatch — that
 * branch is not a leak, since the length is not the secret.
 */
export function stateMatches(expected, received) {
    if (typeof expected !== 'string' || typeof received !== 'string') return false
    if (expected.length === 0 || expected.length !== received.length) return false

    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'))
}

/**
 * Build the URL the user is sent to in order to approve the request.
 *
 * `extra` carries whatever a particular provider requires beyond the standard
 * parameters, which is the only place they tend to differ.
 */
export function buildAuthorizeUrl({
    authorizeUrl,
    clientId,
    redirectUri,
    challenge,
    state,
    scope = '',
    extra = {},
}) {
    if (!authorizeUrl) throw new Error('authorizeUrl is required')
    if (!redirectUri) throw new Error('redirectUri is required')
    if (!challenge) throw new Error('challenge is required')
    if (!state) throw new Error('state is required')

    const url = new URL(authorizeUrl)

    const params = {
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        state,
        ...(clientId ? { client_id: clientId } : {}),
        ...(scope ? { scope } : {}),
        ...extra,
    }

    for (const [name, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(name, String(value))
        }
    }

    return url.toString()
}
