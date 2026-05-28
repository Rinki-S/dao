import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectContentsPanelPath = path.resolve(import.meta.dirname, 'ProjectContentsPanel.jsx');

describe('ProjectContentsPanel HeroUI migration boundary', () => {
  it('uses HeroUI directly instead of the legacy shadcn ui layer', () => {
    const source = fs.readFileSync(projectContentsPanelPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).not.toContain('@/components/ui/');
  });

  it('uses HeroUI table and label primitives for project content rows', () => {
    const source = fs.readFileSync(projectContentsPanelPath, 'utf8');

    expect(source).toContain('Table');
    expect(source).toContain('Chip');
    expect(source).toContain('Surface');
  });
});
