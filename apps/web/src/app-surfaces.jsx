import { SettingsPanel } from './features/settings/components/SettingsPanel.jsx';
import { TaskPanel } from './features/tasks/components/TaskPanel.jsx';

export function getSurfaceComponent(
  surfaceId,
  { currentWorkspace, currentWorkingDirectory, onReplayOnboarding },
) {
  const surfaceComponents = {
    tasks: <TaskPanel currentWorkspace={currentWorkspace} />,
    settings: (
      <SettingsPanel
        currentWorkingDirectory={currentWorkingDirectory}
        onReplayOnboarding={onReplayOnboarding}
      />
    ),
  };

  return surfaceComponents[surfaceId] ?? null;
}
