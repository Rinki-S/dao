import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectContentsPanelPath = path.resolve(import.meta.dirname, 'ProjectContentsPanel.jsx');

describe('ProjectContentsPanel shadcn Base UI boundary', () => {
  it('uses shadcn components without HeroUI', () => {
    const source = fs.readFileSync(projectContentsPanelPath, 'utf8');

    expect(source).toContain('@/components/ui/table.jsx');
    expect(source).toContain('@/components/ui/card.jsx');
    expect(source).not.toContain('@heroui');
    expect(source).not.toMatch(/rounded-|border-radius|borderRadius/);
  });

  it('uses shadcn table and badge primitives for project content rows', () => {
    const source = fs.readFileSync(projectContentsPanelPath, 'utf8');

    expect(source).toContain('<TableHeader>');
    expect(source).toContain('<TableBody>');
    expect(source).toContain('<TableRow');
    expect(source).toContain('<Badge');
  });
});
