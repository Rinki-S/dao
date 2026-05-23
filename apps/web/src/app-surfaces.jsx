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
    <section
      id="settings"
      className="mt-6 max-w-3xl rounded-lg border border-[#E5E7EB] bg-white p-5"
    >
      <h2 className="text-base font-semibold text-[#111827]">Settings</h2>
      <p className="mt-1 text-sm text-[#6B7280]">
        Settings will hold local workspace preferences as the MVP grows.
      </p>
    </section>
  ),
};
