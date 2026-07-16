import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appSidebarPath = path.resolve(import.meta.dirname, 'AppSidebar.jsx');

describe('AppSidebar HeroUI migration boundary', () => {
  it('uses HeroUI primitives directly for sidebar surface actions', () => {
    const source = fs.readFileSync(appSidebarPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).toContain('Button');
    expect(source).toContain('Tooltip');
    expect(source).not.toContain('@/components/ui/');
  });

  it('uses button semantics instead of anchor-style surface controls', () => {
    const source = fs.readFileSync(appSidebarPath, 'utf8');

    expect(source).toContain('onPress={() => onSelectSurface(surfaceId)}');
    expect(source).not.toMatch(/<a(?=[\s>])/);
    expect(source).not.toContain('href={item.href}');
  });

  it('keeps sidebar navigation selected and pressed states visually distinct', () => {
    const source = fs.readFileSync(appSidebarPath, 'utf8');

    expect(source).toContain('active:scale-[0.96]');
    expect(source).toContain('data-[pressed=true]:scale-[0.96]');
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
