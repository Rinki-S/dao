import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve('src/index.css'), 'utf8');
const packageJson = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
const componentsJson = JSON.parse(readFileSync(path.resolve('components.json'), 'utf8'));

describe('coss renderer boundary', () => {
  it('uses the coss registry and Electron continuous corner smoothing', () => {
    expect(componentsJson.registries['@coss']).toContain('coss.com');
    expect(css).toContain('--dao-corner-smoothing: system-ui');
    expect(css).toContain('-electron-corner-smoothing: var(--dao-corner-smoothing)');
  });

  it('uses Tabler and no longer depends on the old UI motion/font stack', () => {
    expect(packageJson.dependencies).toHaveProperty('@tabler/icons-react');
    expect(packageJson.dependencies).not.toHaveProperty('cmdk');
    expect(packageJson.dependencies).not.toHaveProperty('gsap');
    expect(packageJson.dependencies).not.toHaveProperty('@gsap/react');
    expect(packageJson.dependencies).not.toHaveProperty('@fontsource-variable/funnel-sans');
  });
});
