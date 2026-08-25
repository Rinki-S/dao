import { z } from 'zod';

// The two wire protocols, not the two vendors. Most endpoints worth pointing
// at speak the OpenAI one — xAI, Groq, OpenRouter, DeepSeek, LM Studio and
// Ollama's compatibility endpoint among them.
export const PROVIDER_WIRES = ['anthropic', 'openai'];

export const WIRE_LABELS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI compatible',
};

// There is no field for the key. The service never sends one back, and asking
// for one here would invite a UI that tries to display it.
export const ProviderSettingsSchema = z.object({
  wire: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  keyPresent: z.boolean(),
  configured: z.boolean(),
});

export const UpdateProviderSettingsInputSchema = z.object({
  wire: z.enum(PROVIDER_WIRES, { error: 'Choose a provider format' }),
  baseUrl: z
    .string()
    .trim()
    .min(1, { error: 'Base URL is required' })
    .refine((value) => /^https?:\/\/.+/.test(value), {
      error: 'Base URL must start with http:// or https://',
    }),
  model: z.string().trim().min(1, { error: 'Model is required' }),
});

export const ModelKeyStatusSchema = z.object({
  available: z.boolean(),
  present: z.boolean(),
});

export const KeyMutationResultSchema = z.object({
  ok: z.boolean(),
  error: z.string(),
});
