import baseConfig from './vite.config.js';

const workspace = {
  id: '01QA0000000000000000000001',
  name: 'Personal',
  description: 'A quiet place for long-term work.',
  rootPath: '/private/tmp/dao-ui-qa-workspace/personal',
  createdAt: '2026-08-18T08:00:00Z',
  updatedAt: '2026-08-21T08:00:00Z',
  deletedAt: null,
  version: 1,
  syncStatus: 'local',
};

const project = {
  id: '01QA0000000000000000000002',
  workspaceId: workspace.id,
  name: 'Compiler Lab',
  description: 'Parser and runtime experiments',
  folderPath: `${workspace.rootPath}/compiler-lab`,
  status: 'active',
  startedAt: '2026-08-19T08:00:00Z',
  endedAt: null,
  createdAt: '2026-08-19T08:00:00Z',
  updatedAt: '2026-08-21T08:00:00Z',
  deletedAt: null,
  version: 1,
  syncStatus: 'local',
};

const notes = [
  {
    id: '01QA0000000000000000000003',
    workspaceId: workspace.id,
    projectId: null,
    title: 'Welcome Note',
    content:
      '# Welcome to Dao\n\nYour local workspace is ready.\n\n## Start here\n\nDao helps you stay focused by keeping everything local and organized.\n\n- Projects are just folders on your computer.\n- Notes are saved as Markdown files and always remain local.\n- Tasks help you plan and track work.\n- Use Search to open anything instantly.\n\n## How Dao stores your work\n\nYour workspace is a folder on your computer.  \nAll notes are plain Markdown files in that folder and its subfolders.  \nNothing leaves this device by default.\n\nYou are always in control—open your folder in Finder at any time to see your files.\n\nHappy writing!\n',
    filePath: `${workspace.rootPath}/welcome-note.md`,
    contentType: 'markdown',
    noteType: 'general',
    createdAt: '2026-08-21T07:20:00Z',
    updatedAt: '2026-08-21T07:20:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'local',
  },
  {
    id: '01QA0000000000000000000004',
    workspaceId: workspace.id,
    projectId: project.id,
    title: 'Parser recovery strategy',
    content: '# Parser recovery strategy\n\nKeep parsing after recoverable syntax errors.',
    filePath: `${project.folderPath}/parser-recovery-strategy.md`,
    contentType: 'markdown',
    noteType: 'project',
    createdAt: '2026-08-19T09:00:00Z',
    updatedAt: '2026-08-20T10:00:00Z',
    deletedAt: null,
    version: 2,
    syncStatus: 'local',
  },
  {
    id: '01QA0000000000000000000005',
    workspaceId: workspace.id,
    projectId: project.id,
    title: 'Error handling',
    content: '# Error handling\n\nDocument recovery fixtures and edge cases.',
    filePath: `${project.folderPath}/error-handling.md`,
    contentType: 'markdown',
    noteType: 'project',
    createdAt: '2026-08-18T09:00:00Z',
    updatedAt: '2026-08-19T10:00:00Z',
    deletedAt: null,
    version: 2,
    syncStatus: 'local',
  },
];

const tasks = [
  {
    id: '01QA0000000000000000000006',
    workspaceId: workspace.id,
    projectId: project.id,
    parentId: null,
    title: 'Implement parser recovery',
    description: 'Make the parser resilient to common syntax errors and continue where possible.',
    status: 'doing',
    priority: 'high',
    dueDate: '2026-08-21',
    createdAt: '2026-08-19T08:00:00Z',
    updatedAt: '2026-08-21T08:00:00Z',
    deletedAt: null,
    version: 3,
    syncStatus: 'local',
  },
  {
    id: '01QA0000000000000000000007',
    workspaceId: workspace.id,
    projectId: project.id,
    parentId: '01QA0000000000000000000006',
    title: 'Add error fixtures',
    description: '',
    status: 'done',
    priority: 'medium',
    dueDate: '2026-08-21',
    createdAt: '2026-08-19T08:00:00Z',
    updatedAt: '2026-08-21T08:00:00Z',
    deletedAt: null,
    version: 2,
    syncStatus: 'local',
  },
];

const activities = [
  {
    id: '01QA0000000000000000000008',
    workspaceId: workspace.id,
    projectId: null,
    entityType: 'note',
    entityId: notes[0].id,
    action: 'created',
    metadataJson: '{}',
    createdAt: '2026-08-21T07:20:00Z',
  },
];

function sendJson(response, value, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(value));
}

function qaApiPlugin() {
  return {
    name: 'dao-visual-qa-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        if (!url.pathname.startsWith('/api/')) return next();

        if (url.pathname === '/api/settings/working-directory') {
          return sendJson(response, {
            path: '/private/tmp/dao-ui-qa-workspace',
            configured: true,
          });
        }
        if (url.pathname === '/api/workspaces') {
          return sendJson(response, request.method === 'GET' ? [workspace] : workspace);
        }
        if (url.pathname === '/api/projects') {
          return sendJson(response, request.method === 'GET' ? [project] : project);
        }
        if (url.pathname === '/api/notes') {
          return sendJson(response, request.method === 'GET' ? notes : notes[0]);
        }
        if (url.pathname.startsWith('/api/notes/')) {
          return sendJson(
            response,
            notes.find((note) => url.pathname.includes(note.id)) ?? notes[0],
          );
        }
        if (url.pathname === '/api/tasks') {
          return sendJson(response, request.method === 'GET' ? tasks : tasks[0]);
        }
        if (url.pathname.startsWith('/api/tasks/')) {
          return sendJson(
            response,
            tasks.find((task) => url.pathname.includes(task.id)) ?? tasks[0],
          );
        }
        if (url.pathname === '/api/activities') return sendJson(response, activities);
        if (url.pathname === '/api/search') return sendJson(response, []);
        return sendJson(response, { error: 'Not found' }, 404);
      });
    },
  };
}

export default {
  ...baseConfig,
  plugins: [qaApiPlugin(), ...baseConfig.plugins],
  server: {
    ...baseConfig.server,
    proxy: undefined,
  },
};
