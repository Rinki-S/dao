import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectPanelPath = path.resolve(import.meta.dirname, 'ProjectPanel.jsx');

describe('ProjectPanel HeroUI migration boundary', () => {
  it('uses HeroUI directly instead of the legacy shadcn ui layer', () => {
    const source = fs.readFileSync(projectPanelPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).not.toContain('@/components/ui/');
  });

  it('uses HeroUI form, action, and label primitives', () => {
    const source = fs.readFileSync(projectPanelPath, 'utf8');

    expect(source).toContain('Button');
    expect(source).toContain('Chip');
    expect(source).toContain('Input');
    expect(source).toContain('Label');
    expect(source).toContain('Surface');
    expect(source).toContain('TextField');
  });
});
