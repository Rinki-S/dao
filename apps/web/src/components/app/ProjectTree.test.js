import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectTreePath = path.resolve(import.meta.dirname, 'ProjectTree.jsx');

describe('ProjectTree HeroUI migration boundary', () => {
  it('uses HeroUI primitives directly instead of the legacy shadcn ui layer', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).not.toContain('@/components/ui/');
  });

  it('uses HeroUI controls for tree actions and creation forms', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain('Button');
    expect(source).toContain('Modal');
    expect(source).toContain('Select');
    expect(source).toContain('TextField');
    expect(source).toContain('TextArea');
  });

  it('keeps project tree actions tactile when pressed', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain('active:scale-[0.96]');
    expect(source).toContain('active:bg-sidebar-accent');
    expect(source).toContain('data-[pressed=true]:scale-[0.96]');
    expect(source).toContain('data-[pressed=true]:bg-sidebar-accent');
    expect(source).toContain('transition-[background-color,color,scale]');
    expect(source).toContain('transition-[background-color,color,width,height,padding,scale]');
  });

  it('uses a distinct selected background instead of relying on font weight alone', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain('bg-accent-soft');
    expect(source).toContain('bg-accent-soft-hover');
    expect(source).toContain('text-accent-soft-foreground');
    expect(source).not.toContain("isActive && 'bg-sidebar-accent font-medium");
  });
});
