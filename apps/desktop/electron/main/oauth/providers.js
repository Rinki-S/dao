/**
 * Provider configuration, as data.
 *
 * Every provider claims to speak OAuth 2.0 and every provider deviates. The
 * deviations are small but they are not optional: OpenRouter names its
 * redirect parameter `callback_url` rather than `redirect_uri`, has no client
 * id at all, and hands back a plain API key instead of a token pair. Encoding
 * those as fields keeps them from becoming branches in the flow itself.
 *
 * Adding a provider that speaks ordinary OAuth 2.0 is a new entry here and
 * nothing else. One that does not needs a new exchange strategy in flow.js —
 * which is the honest signal that it is not, in fact, ordinary.
 */

/**
 * @typedef {object} Provider
 * @property {string}  id
 * @property {string}  label
 * @property {string}  authorizeUrl   Where the user is sent to approve.
 * @property {string}  tokenUrl       Where a code is traded for a credential.
 * @property {string}  [clientId]     Omitted by providers that do not use one.
 * @property {string}  [scope]
 * @property {string}  [redirectParam] Defaults to the standard `redirect_uri`.
 * @property {'oauth2'|'openrouter'} exchange  Which request shape the token
 *   endpoint expects. See flow.js.
 * @property {'api-key'|'oauth-token'} yields  What the exchange returns. An
 *   api-key provider has nothing to refresh; an oauth-token one does.
 * @property {string[]} [ports]       Fixed loopback ports, for providers that
 *   require an exactly pre-registered redirect URI.
 * @property {{wire: string, baseUrl: string}} defaults  Where the credential
 *   this yields can actually be used. Without these, signing in succeeds and
 *   nothing works, because the endpoint is still unset.
 */

/** @type {Record<string, Provider>} */
export const PROVIDERS = {
    openrouter: {
        id: 'openrouter',
        label: 'OpenRouter',
        authorizeUrl: 'https://openrouter.ai/auth',
        tokenUrl: 'https://openrouter.ai/api/v1/auth/keys',
        // No client id: OpenRouter identifies the app by its callback URL,
        // which is also why it accepts an arbitrary one and needs no fixed
        // port.
        clientId: '',
        redirectParam: 'callback_url',
        exchange: 'openrouter',
        // The result is a long-lived key the user owns and can revoke from
        // their OpenRouter account. There is no refresh token, so none of the
        // renewal machinery applies.
        yields: 'api-key',
        // OpenRouter speaks the OpenAI wire. The model is left to the user
        // because it is the one choice signing in cannot make for them.
        defaults: { wire: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
    },
}

export function getProvider(id) {
    const provider = PROVIDERS[id]
    if (!provider) {
        throw new Error(`unknown provider: ${id}`)
    }
    return provider
}

export function listProviders() {
    return Object.values(PROVIDERS).map(({ id, label, yields, defaults }) => ({
        id,
        label,
        yields,
        defaults,
    }))
}
