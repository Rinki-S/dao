import { apiFetch } from '@/lib/api-client.js';
import {
  AcceptedSchema,
  KeyMutationResultSchema,
  ModelKeyStatusSchema,
  OAuthProviderSchema,
  ProviderSettingsSchema,
  SummaryResultSchema,
  UpdateProviderSettingsInputSchema,
} from './schemas.js';

export async function getProviderSettings() {
  const response = await apiFetch('/api/ai/provider');

  if (!response.ok) {
    throw new Error(`Failed to read provider settings: ${response.status}`);
  }

  return ProviderSettingsSchema.parse(await response.json());
}

export async function updateProviderSettings(input) {
  const payload = UpdateProviderSettingsInputSchema.parse(input);

  const response = await apiFetch('/api/ai/provider', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // The service validates the same fields again and says which one it
    // refused; that message is more useful than the status.
    const message = await response.text();
    throw new Error(message || `Failed to save provider settings: ${response.status}`);
  }

  return ProviderSettingsSchema.parse(await response.json());
}

// The reasons a summary can fail to arrive, each needing a different thing
// from the reader. A single "AI failed" would leave them guessing which.
export const SUMMARY_OUTCOMES = {
  nothingToday: 'nothingToday',
  notConfigured: 'notConfigured',
  keyRejected: 'keyRejected',
  rateLimited: 'rateLimited',
  failed: 'failed',
};

export class SummaryError extends Error {
  constructor(outcome, message) {
    super(message);
    this.name = 'SummaryError';
    this.outcome = outcome;
  }
}

function outcomeFor(status) {
  switch (status) {
    case 428:
      return SUMMARY_OUTCOMES.notConfigured;
    case 401:
    case 403:
      return SUMMARY_OUTCOMES.keyRejected;
    case 429:
      return SUMMARY_OUTCOMES.rateLimited;
    default:
      return SUMMARY_OUTCOMES.failed;
  }
}

export async function summarizeToday(workspaceId) {
  const response = await apiFetch(
    `/api/ai/summarize-today?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: 'POST' },
  );

  // A day with nothing in it: the service says so without a body, and without
  // having spent anything to find out.
  if (response.status === 204) {
    throw new SummaryError(SUMMARY_OUTCOMES.nothingToday, 'Nothing was touched today');
  }

  if (!response.ok) {
    const message = (await response.text()) || `Request failed: ${response.status}`;
    throw new SummaryError(outcomeFor(response.status), message);
  }

  return SummaryResultSchema.parse(await response.json());
}

/**
 * Keep a summary as a note.
 *
 * Only the run's id is sent. Everything written comes from the trace the
 * service already holds, so what is saved is the summary that was shown —
 * a confirmation that posts back its own copy confirms nothing.
 */
export async function saveSummaryAsNote(traceId) {
  const response = await apiFetch(`/api/ai/traces/${encodeURIComponent(traceId)}/save-as-note`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = (await response.text()) || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return AcceptedSchema.parse(await response.json());
}

// The key never travels over HTTP. It goes through the desktop bridge to the
// OS keychain, and the bridge has no getter — these three are the whole of
// what the renderer can do with it.

// A probe, and probes do not fail. Outside the desktop app there is no bridge;
// inside it, an IPC call can still reject. Either way the answer is "no key
// here", and a rejection must not be able to strand the settings panel.
export async function getModelKeyStatus() {
  try {
    if (!window.dao?.getModelKeyStatus) {
      return NO_CREDENTIAL;
    }

    return ModelKeyStatusSchema.parse(await window.dao.getModelKeyStatus());
  } catch {
    return NO_CREDENTIAL;
  }
}

// Spelled out rather than parsed: this is the answer when the bridge is not
// there to ask, so there is nothing to validate.
const NO_CREDENTIAL = { available: false, present: false, kind: '', provider: '', expires: '' };

/**
 * The providers that can be signed in to.
 *
 * Empty outside the desktop app, where there is no browser to open and no
 * keychain to keep the result in. The manual key field still works there.
 */
export async function listOAuthProviders() {
  try {
    if (!window.dao?.listOAuthProviders) return [];

    return OAuthProviderSchema.array().parse(await window.dao.listOAuthProviders());
  } catch {
    return [];
  }
}

/**
 * Sign in to a provider.
 *
 * Everything happens in the main process — the browser, the callback, the
 * exchange, the keychain. What comes back here is only whether it worked.
 */
export async function connectOAuthProvider(providerId) {
  if (!window.dao?.connectProvider) {
    return { ok: false, error: 'Signing in is only available in the desktop app' };
  }

  return KeyMutationResultSchema.parse(await window.dao.connectProvider(providerId));
}

/**
 * Subscribe to renewal news from the main process.
 *
 * A token is renewed on a timer nobody in the renderer started, so this is
 * pushed rather than polled. Returns an unsubscribe function, and a no-op one
 * outside the desktop app so callers need no branch.
 */
export function onCredentialEvent(listener) {
  return window.dao?.onCredentialEvent?.(listener) ?? (() => {});
}

export async function saveModelApiKey(key) {
  if (!window.dao?.setModelApiKey) {
    return { ok: false, error: 'Key storage is only available in the desktop app' };
  }

  return KeyMutationResultSchema.parse(await window.dao.setModelApiKey(key));
}

export async function removeModelApiKey() {
  if (!window.dao?.clearModelApiKey) {
    return { ok: false, error: 'Key storage is only available in the desktop app' };
  }

  return KeyMutationResultSchema.parse(await window.dao.clearModelApiKey());
}
