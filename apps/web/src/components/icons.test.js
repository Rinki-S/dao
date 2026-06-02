import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(import.meta.dirname, '..');
const packageJsonPath = path.resolve(sourceRoot, '..', 'package.json');
const forbiddenPackage = '@nine-thirty-five/' + 'material-symbols-react';
const legacyIconEntry = '@/components/' + 'icons.jsx';
const legacyIconEntryPath = path.resolve(sourceRoot, 'components/icons.jsx');

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    if (!/\.(js|jsx)$/.test(entry.name)) {
      return [];
    }

    return [entryPath];
  });
}

describe('icon library boundaries', () => {
  it('does not import Material Symbols in renderer source', () => {
    const materialSymbolImports = listSourceFiles(sourceRoot).filter((filePath) => {
      return fs.readFileSync(filePath, 'utf8').includes(forbiddenPackage);
    });

    expect(materialSymbolImports).toEqual([]);
  });

  it('does not depend on Material Symbols', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.dependencies).not.toHaveProperty(forbiddenPackage);
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty(forbiddenPackage);
  });

  it('does not use a shared renderer icon entrypoint', () => {
    const sharedIconImports = listSourceFiles(sourceRoot).filter((filePath) => {
      return fs.readFileSync(filePath, 'utf8').includes(legacyIconEntry);
    });

    expect(sharedIconImports).toEqual([]);
    expect(fs.existsSync(legacyIconEntryPath)).toBe(false);
  });
});
