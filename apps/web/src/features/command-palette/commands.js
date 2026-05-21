export function getCommandSearchText(command) {
  return [command.title, command.description, command.group, ...(command.keywords ?? [])].join(' ');
}

export function filterCommands(commands, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === '') {
    return commands;
  }

  return commands.filter((command) => {
    const searchableText = getCommandSearchText(command).toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getCommandTarget(command, root = document) {
  return root.getElementById(command.targetId);
}

export function getCommandFocusTarget(command, root = document) {
  if (!command.focusSelector) {
    return null;
  }

  const focusTarget = root.querySelector(command.focusSelector);

  if (focusTarget instanceof HTMLElement && !focusTarget.hasAttribute('disabled')) {
    return focusTarget;
  }

  return null;
}
