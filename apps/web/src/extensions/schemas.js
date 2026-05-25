import { z } from 'zod';

const CommandCapabilitySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  group: z.string().min(1),
  keywords: z.array(z.string().min(1)).optional(),
  targetId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  focusSelector: z.string().min(1).optional(),
});

const MaterialSymbolIconSchema = z.object({
  type: z.literal('material-symbol'),
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
});

const SidebarItemCapabilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  href: z.string().min(1),
  icon: MaterialSymbolIconSchema.optional(),
  order: z.number(),
});

const SurfaceCapabilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  anchorId: z.string().min(1),
  order: z.number(),
});

export const ExtensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capabilities: z.object({
    commands: z.array(CommandCapabilitySchema).optional(),
    sidebarItems: z.array(SidebarItemCapabilitySchema).optional(),
    surfaces: z.array(SurfaceCapabilitySchema).optional(),
  }),
});

export const ExtensionListSchema = z.array(ExtensionSchema);
