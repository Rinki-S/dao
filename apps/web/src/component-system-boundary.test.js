import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(webRoot, 'src');

function collectProductionSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectProductionSources(entryPath);
    }

    if (!/\.(?:css|js|jsx)$/.test(entry.name) || /\.(?:test|spec)\.(?:js|jsx)$/.test(entry.name)) {
      return [];
    }

    return [
      {
        filePath: path.relative(webRoot, entryPath),
        source: fs.readFileSync(entryPath, 'utf8'),
      },
    ];
  });
}

const productionSources = collectProductionSources(sourceRoot);

describe('renderer component-system boundary', () => {
  it('uses the requested shadcn Base UI preset and dependencies', () => {
    const components = JSON.parse(fs.readFileSync(path.join(webRoot, 'components.json'), 'utf8'));
    const packageJson = JSON.parse(fs.readFileSync(path.join(webRoot, 'package.json'), 'utf8'));

    expect(components.style).toBe('base-mira');
    expect(components.iconLibrary).toBe('tabler');
    expect(packageJson.dependencies).toMatchObject({
      '@base-ui/react': expect.any(String),
      '@fontsource-variable/funnel-sans': expect.any(String),
      '@tabler/icons-react': expect.any(String),
      shadcn: expect.any(String),
    });
    expect(packageJson.dependencies).not.toHaveProperty('@lisse/react');
    expect(packageJson.dependencies).not.toHaveProperty('@heroui/react');
    expect(packageJson.dependencies).not.toHaveProperty('@heroui/styles');
    expect(packageJson.dependencies).not.toHaveProperty('@hugeicons/react');
    expect(packageJson.dependencies).not.toHaveProperty('@hugeicons/core-free-icons');
    expect(packageJson.dependencies).not.toHaveProperty('radix-ui');
    expect(packageJson.dependencies).not.toHaveProperty('@fontsource-variable/inter');
    expect(packageJson.dependencies).not.toHaveProperty('@fontsource-variable/geist');
    expect(packageJson.dependencies).not.toHaveProperty('@fontsource-variable/outfit');
  });

  it('keeps production source free of HeroUI, Hugeicons, Radix, and Radix composition', () => {
    for (const { filePath, source } of productionSources) {
      expect(source, filePath).not.toMatch(
        /@heroui|@hugeicons|@radix-ui|from\s+['"]radix-ui['"]|\basChild\b/,
      );
    }
  });

  it('routes renderer corner geometry through the shared CSS radius tokens', () => {
    for (const { filePath, source } of productionSources) {
      expect(source, filePath).not.toMatch(
        /@lisse|clip-path|clipPath|border-radius|borderRadius|rounded-\[/,
      );
    }

    const cornersAdapter = fs.readFileSync(path.join(sourceRoot, 'lib/corners.jsx'), 'utf8');

    expect(cornersAdapter).toContain('rounded-full');
    expect(cornersAdapter).toContain('CornerSurface');
  });

  it('preserves the existing jade accent and Funnel Sans typography', () => {
    const themeSource = fs.readFileSync(path.join(sourceRoot, 'index.css'), 'utf8');

    expect(themeSource).toContain("--font-heading: 'Funnel Sans Variable', sans-serif");
    expect(themeSource).toContain("--font-sans: 'Funnel Sans Variable', sans-serif");
    expect(themeSource.match(/--dao-accent: oklch\(64\.48% 0\.1488 158\.77\)/g)).toHaveLength(2);
    expect(themeSource).toContain('--primary: var(--dao-accent)');
    expect(themeSource).toContain('--accent: var(--dao-accent)');
    expect(themeSource).toContain('--radius-lg: 10px');
  });
});
