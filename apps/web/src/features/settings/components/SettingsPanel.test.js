import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const settingsPanelPath = path.resolve(import.meta.dirname, 'SettingsPanel.jsx');

describe('SettingsPanel HeroUI migration boundary', () => {
  it('uses HeroUI directly instead of the legacy shadcn ui layer', () => {
    const source = fs.readFileSync(settingsPanelPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).not.toContain('@/components/ui/');
  });

  it('configures rounded settings surfaces explicitly', () => {
    const source = fs.readFileSync(settingsPanelPath, 'utf8');
    const roundedDefaultSurfaces =
      source.match(/<Surface[\s\S]*?className="[^"]*rounded-xl[^"]*"[\s\S]*?variant="default"/g) ??
      [];

    expect(roundedDefaultSurfaces).toHaveLength(2);
  });
});
