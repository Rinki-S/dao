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

// Mirrors the harness's own checks. Validating here too is not redundant: the
// service and the renderer are separate programs, and this one should not
// render whatever the other happens to send.
export const DaySummarySchema = z.object({
  headline: z.string().min(1),
  highlights: z.array(z.string().min(1)).min(1).max(6),
  focus: z.string(),
});

export const IncludedSchema = z.object({
  notes: z.number(),
  notesDropped: z.number(),
  tasksIncluded: z.boolean(),
  truncated: z.boolean(),
});

export const SummaryResultSchema = z.object({
  traceId: z.string(),
  date: z.string(),
  summary: DaySummarySchema,
  included: IncludedSchema,
});

export const AcceptedSchema = z.object({
  traceId: z.string(),
  noteId: z.string(),
  title: z.string(),
});

export const ModelKeyStatusSchema = z.object({
  available: z.boolean(),
  present: z.boolean(),
});

export const KeyMutationResultSchema = z.object({
  ok: z.boolean(),
  error: z.string(),
});
