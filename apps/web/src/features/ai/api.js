import { apiFetch } from '@/lib/api-client.js';
import {
  KeyMutationResultSchema,
  ModelKeyStatusSchema,
  ProviderSettingsSchema,
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
