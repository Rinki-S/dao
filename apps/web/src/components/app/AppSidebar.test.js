import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appSidebarPath = path.resolve(import.meta.dirname, 'AppSidebar.jsx');

describe('AppSidebar shadcn Base UI boundary', () => {
  it('uses shadcn Base UI primitives for sidebar surface actions', () => {
    const source = fs.readFileSync(appSidebarPath, 'utf8');

    expect(source).toContain('@/components/ui/button.jsx');
    expect(source).toContain('@/components/ui/tooltip.jsx');
    expect(source).toContain('Button');
    expect(source).toContain('Tooltip');
    expect(source).not.toContain('@heroui');
    expect(source).not.toMatch(/rounded-|border-radius|borderRadius/);
  });

  it('uses button semantics instead of anchor-style surface controls', () => {
    const source = fs.readFileSync(appSidebarPath, 'utf8');

    expect(source).toContain('onClick={() => onSelectSurface(surfaceId)}');
    expect(source).not.toMatch(/<a(?=[\s>])/);
    expect(source).not.toContain('href={item.href}');
  });

  it('keeps sidebar navigation selected and pressed states visually distinct', () => {
    const source = fs.readFileSync(appSidebarPath, 'utf8');

    expect(source).toContain('active:bg-sidebar-accent');
    expect(source).toContain('data-pressed:bg-sidebar-accent');
    expect(source).not.toMatch(/active:scale|data-pressed:scale/);
    expect(source).toContain('bg-accent-soft');
    expect(source).toContain('bg-accent-soft-hover');
    expect(source).toContain('text-accent-soft-foreground');
  });

  it('uses the Vite mode when selecting deterministic test animation behavior', () => {
    const source = fs.readFileSync(appSidebarPath, 'utf8');

    expect(source).toContain("import.meta.env.MODE === 'test'");
    expect(source).not.toContain('process.env.NODE_ENV');
  });
});
