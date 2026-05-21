import { coreExtension } from './core.js';

export const builtInExtensions = [coreExtension];

export function getRegisteredCommands(extensions = builtInExtensions) {
  return extensions.flatMap((extension) => extension.capabilities?.commands ?? []);
}
