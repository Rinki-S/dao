import { describe, expect, it } from 'vitest';
import { surfaceComponents } from './app-surfaces.jsx';
import { getRegisteredSurfaces } from './extensions/registry.js';

describe('App surfaces', () => {
  it('has a component for every registered surface', () => {
    const surfaceIds = getRegisteredSurfaces().map((surface) => surface.id);

    expect(Object.keys(surfaceComponents).sort()).toEqual([...surfaceIds].sort());
  });
});
