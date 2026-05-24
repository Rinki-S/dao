import * as PhosphorIcons from '@phosphor-icons/react';

export function resolveSidebarIcon(icon) {
  if (icon?.type !== 'phosphor') {
    return PhosphorIcons.PuzzlePieceIcon;
  }

  const Icon = PhosphorIcons[icon.name];

  return Icon ?? PhosphorIcons.PuzzlePieceIcon;
}
