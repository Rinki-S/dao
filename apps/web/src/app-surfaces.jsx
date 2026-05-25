import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityMetricsPanel } from './features/activities/components/ActivityMetricsPanel.jsx';
import { NotePanel } from './features/notes/components/NotePanel.jsx';
import { ProjectPanel } from './features/projects/components/ProjectPanel.jsx';
import { TaskPanel } from './features/tasks/components/TaskPanel.jsx';

export function getSurfaceComponent(surfaceId, { currentWorkspace }) {
  const surfaceComponents = {
    dashboard: (
      <section id="dashboard">
        <ActivityMetricsPanel />
      </section>
    ),
    projects: <ProjectPanel currentWorkspace={currentWorkspace} />,
    tasks: <TaskPanel currentWorkspace={currentWorkspace} />,
    notes: <NotePanel currentWorkspace={currentWorkspace} />,
    settings: (
      <Card id="settings" className="mt-6 max-w-3xl">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Settings will hold local workspace preferences as the MVP grows.
          </CardDescription>
        </CardHeader>
      </Card>
    ),
  };

  return surfaceComponents[surfaceId] ?? null;
}
