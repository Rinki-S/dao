import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const onboardingPath = path.resolve(import.meta.dirname, 'WorkingDirectoryOnboarding.jsx');

describe('WorkingDirectoryOnboarding HeroUI migration boundary', () => {
  it('uses HeroUI directly instead of the legacy shadcn ui layer', () => {
    const source = fs.readFileSync(onboardingPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).not.toContain('@/components/ui/');
  });
});
