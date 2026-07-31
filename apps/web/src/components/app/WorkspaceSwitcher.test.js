import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceSwitcherPath = path.resolve(import.meta.dirname, 'WorkspaceSwitcher.jsx');

describe('WorkspaceSwitcher shadcn Base UI boundary', () => {
  it('uses shadcn Base UI primitives and CSS radius geometry without HeroUI', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain('@/components/ui/dropdown-menu.jsx');
    expect(source).toContain('@/components/ui/dialog.jsx');
    expect(source).toContain('@/components/ui/field.jsx');
    expect(source).toContain('@/lib/corners.jsx');
    expect(source).not.toContain('@heroui');
    expect(source).not.toMatch(/rounded-|border-radius|borderRadius/);
  });

  it('uses menu groups, a titled dialog, and native form fields', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain('DropdownMenuGroup');
    expect(source).toContain('DialogTitle');
    expect(source).toContain('FieldGroup');
    expect(source).toContain('<form');
  });

  it('separates workspace API errors from field validation errors', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain('FieldError');
    expect(source).toContain('AppApiErrorMessage');
    expect(source).toContain('<AppApiErrorMessage>{workspaceApiError}</AppApiErrorMessage>');
    expect(source).toContain('Workspace name is required');
  });

  it('keeps the workspace dropdown trigger tactile when pressed', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain('motion-colors-layout');
    expect(source).toContain('data-pressed:bg-sidebar-accent');
    expect(source).not.toMatch(/active:scale|data-pressed:scale/);
  });

  it('uses native focus-visible state for the Base UI trigger ring', () => {
    const source = fs.readFileSync(workspaceSwitcherPath, 'utf8');

    expect(source).toContain('focus-visible:ring-2');
    expect(source).not.toContain('data-[focus-visible=true]');
  });
});
