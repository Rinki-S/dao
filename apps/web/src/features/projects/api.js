import { apiFetch } from '../../lib/api-client.js';
import {
  CreateProjectInputSchema,
  DeleteProjectInputSchema,
  ProjectListSchema,
  ProjectSchema,
  UpdateProjectInputSchema,
} from './schemas.js';

export async function listProjects() {
  const response = await apiFetch('/api/projects');

  if (!response.ok) {
    throw new Error(`Failed to list projects: ${response.status}`);
  }

  const data = await response.json();
  return ProjectListSchema.parse(data);
}

export async function createProject(input) {
  const payload = CreateProjectInputSchema.parse(input);

  const response = await apiFetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create project: ${response.status}`);
  }

  const data = await response.json();
  return ProjectSchema.parse(data);
}

export async function updateProject(id, input) {
  const payload = UpdateProjectInputSchema.parse(input);

  const response = await apiFetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update project: ${response.status}`);
  }

  const data = await response.json();
  return ProjectSchema.parse(data);
}

export async function deleteProject(id, input = { deleteNotes: false }) {
  const payload = DeleteProjectInputSchema.parse(input);

  const response = await apiFetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // Deleting a folder can be refused rather than fail — it still holds
    // something Dao did not put there — and the service says which file. That
    // sentence is the whole value of the refusal, so it is read out rather than
    // flattened into a status code.
    throw new Error(await reasonFrom(response, `Failed to delete project: ${response.status}`));
  }
}

async function reasonFrom(response, fallback) {
  try {
    const body = await response.json();
    return typeof body?.error === 'string' && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}
