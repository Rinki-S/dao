import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectTreePath = path.resolve(import.meta.dirname, 'ProjectTree.jsx');

describe('ProjectTree shadcn Base UI migration boundary', () => {
  it('uses the shadcn Base UI layer without HeroUI, Hugeicons, or Radix', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain("from '@/components/ui/button'");
    expect(source).toContain("from '@/components/ui/context-menu'");
    expect(source).toContain("from '@/components/ui/dialog'");
    expect(source).toContain("from '@/components/ui/select'");
    expect(source).toContain("from '@tabler/icons-react'");
    expect(source).not.toContain('@heroui');
    expect(source).not.toContain('@hugeicons');
    expect(source).not.toContain('@radix-ui');
    expect(source).not.toContain("from 'radix-ui'");
    expect(source).not.toContain('asChild');
  });

  it('uses Base UI composition rules for menus, dialogs, and selects', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain('<ContextMenuGroup>');
    expect(source).toContain('<DialogTitle>');
    expect(source).toContain('items={contentTypeOptions}');
    expect(source).toContain('items={projectOptions}');
    expect(source).toContain('items={noteTypeOptions}');
    expect(source).toContain('<SelectGroup>');
    expect(source).toContain('onValueChange=');
    expect(source).not.toContain('selectedKey=');
    expect(source).not.toContain('onSelectionChange=');
  });

  it('uses native button and form semantics with explicit loading indicators', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain('<form');
    expect(source).toContain('disabled={isTreeActionPending}');
    expect(source).toContain('onClick={openProjectDialog}');
    expect(source).toContain('<Spinner');
    expect(source).not.toContain('isDisabled=');
    expect(source).not.toContain('isPending=');
    expect(source).not.toContain('onPress=');
  });

  it('separates project tree API errors from field validation errors', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain('FieldError');
    expect(source).toContain('AppApiErrorMessage');
    expect(source).toContain('<AppApiErrorMessage>{projectCreateError}</AppApiErrorMessage>');
    expect(source).toContain('<AppApiErrorMessage>{contentCreateError}</AppApiErrorMessage>');
    expect(source).toContain('{treeError}');
    expect(source).not.toContain(
      "setStatus('error');\n    } finally {\n      setIsCreatingProject(false);",
    );
    expect(source).not.toContain(
      "setStatus('error');\n    } finally {\n      setIsCreatingContent(false);",
    );
  });

  it('keeps project tree actions tactile with native active states', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain('active:bg-sidebar-accent');
    expect(source).not.toMatch(/active:scale|data-pressed:scale/);
    expect(source).toContain('motion-colors');
    expect(source).toContain('motion-colors-layout');
  });

  it('uses a distinct selected background instead of relying on font weight alone', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).toContain('bg-accent-soft');
    expect(source).toContain('bg-accent-soft-hover');
    expect(source).toContain('text-accent-soft-foreground');
    expect(source).not.toContain("isActive && 'bg-sidebar-accent font-medium");
  });

  it('delegates all rounded geometry to the shared corner system', () => {
    const source = fs.readFileSync(projectTreePath, 'utf8');

    expect(source).not.toMatch(/\brounded(?:-|\b)/);
    expect(source).not.toContain('borderRadius');
    expect(source).not.toContain('border-radius');
  });
});
