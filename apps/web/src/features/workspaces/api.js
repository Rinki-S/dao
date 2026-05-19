import { CreateWorkspaceInputSchema, WorkspaceListSchema, WorkspaceSchema } from './schemas.js';
import { apiFetch } from '../../lib/api-client.js';

export async function listWorkspaces() {
  const response = await apiFetch('/api/workspaces');

  if (!response.ok) {
    throw new Error(`Failed to list workspaces: ${response.status}`);
  }

  const data = await response.json();
  return WorkspaceListSchema.parse(data);
}

export async function createWorkspace(input) {
  const payload = CreateWorkspaceInputSchema.parse(input);

  const response = await apiFetch('/api/workspaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create workspace: ${response.status}`);
  }

  const data = await response.json();
  return WorkspaceSchema.parse(data);
}
