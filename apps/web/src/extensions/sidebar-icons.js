import { createElement } from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol.jsx';

const MATERIAL_SYMBOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const FALLBACK_ICON_NAME = 'extension';

export function resolveSidebarIcon(icon) {
  const iconName =
    icon?.type === 'material-symbol' && MATERIAL_SYMBOL_NAME_PATTERN.test(icon.name)
      ? icon.name
      : FALLBACK_ICON_NAME;

  return function SidebarMaterialSymbol(props) {
    return createElement(MaterialSymbol, {
      name: iconName,
      ...props,
    });
  };
}
