import { apiFetch } from '@/lib/api-client.js';
import {
  AcceptedSchema,
  KeyMutationResultSchema,
  ModelKeyStatusSchema,
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

export async function getModelKeyStatus() {
  if (!window.dao?.getModelKeyStatus) {
    return { available: false, present: false };
  }

  return ModelKeyStatusSchema.parse(await window.dao.getModelKeyStatus());
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
