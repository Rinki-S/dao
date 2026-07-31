import { z } from 'zod';

export function isReactComponentType(value) {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' &&
      value !== null &&
      typeof value.$$typeof === 'symbol' &&
      typeof value.render === 'function')
  );
}

const ReactComponentTypeSchema = z.custom(isReactComponentType);

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

const SidebarItemCapabilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  href: z.string().min(1),
  icon: ReactComponentTypeSchema.optional(),
  order: z.number(),
});

const SurfaceCapabilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  anchorId: z.string().min(1),
  order: z.number(),
});

const ContentFormatCapabilitySchema = z.object({
  format: z.string().min(1),
  label: z.string().min(1),
  icon: ReactComponentTypeSchema,
});

export const ExtensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capabilities: z.object({
    commands: z.array(CommandCapabilitySchema).optional(),
    sidebarItems: z.array(SidebarItemCapabilitySchema).optional(),
    surfaces: z.array(SurfaceCapabilitySchema).optional(),
    contentFormats: z.array(ContentFormatCapabilitySchema).optional(),
  }),
});

export const ExtensionListSchema = z.array(ExtensionSchema);
