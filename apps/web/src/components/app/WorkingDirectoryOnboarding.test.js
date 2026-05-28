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

  it('renders step progress and directional step transitions', () => {
    const source = fs.readFileSync(onboardingPath, 'utf8');

    expect(source).toContain('OnboardingStepIndicator');
    expect(source).toContain('data-onboarding-footer');
    expect(source).toContain('data-step-transition');
    expect(source).toContain('data-step-header');
    expect(source).toContain('data-direction={stepDirection}');
    expect(source).toContain('motion-reduce:transition-none');
  });
});
