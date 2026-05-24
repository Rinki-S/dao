import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityMetricsPanel } from './features/activities/components/ActivityMetricsPanel.jsx';
import { NotePanel } from './features/notes/components/NotePanel.jsx';
import { ProjectPanel } from './features/projects/components/ProjectPanel.jsx';
import { SearchPanel } from './features/search/components/SearchPanel.jsx';
import { TaskPanel } from './features/tasks/components/TaskPanel.jsx';
import { WorkspacePanel } from './features/workspaces/components/WorkspacePanel.jsx';

export const surfaceComponents = {
  dashboard: (
    <section id="dashboard">
      <ActivityMetricsPanel />
    </section>
  ),
  workspaces: <WorkspacePanel />,
  projects: <ProjectPanel />,
  tasks: <TaskPanel />,
  notes: <NotePanel />,
  search: <SearchPanel />,
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
