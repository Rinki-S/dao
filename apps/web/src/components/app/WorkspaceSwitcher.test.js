import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceSwitcherPath = path.resolve(import.meta.dirname, 'WorkspaceSwitcher.jsx');

describe('WorkspaceSwitcher HeroUI migration boundary', () => {
  it('uses HeroUI directly instead of the legacy shadcn ui layer', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).not.toContain('@/components/ui/');
  });

  it('uses HeroUI dropdown, modal, and text field primitives', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain('Dropdown');
    expect(source).toContain('Modal');
    expect(source).toContain('TextField');
  });

  it('keeps the workspace dropdown trigger tactile when pressed', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain(
      'transition-[transform,scale,background-color,color,width,height,padding]',
    );
    expect(source).toContain('data-[pressed=true]:scale-[0.97]');
    expect(source).toContain('active:scale-[0.97]');
    expect(source).toContain('transform-gpu');
  });

  it('uses React Aria focus-visible state for the workspace trigger ring', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain('data-[focus-visible=true]:ring-2');
    expect(source).not.toContain('focus-visible:ring-2');
  });
});
