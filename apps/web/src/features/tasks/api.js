import { apiFetch } from '../../lib/api-client.js';
import { TaskDocumentSchema, UpdateTaskDocumentInputSchema } from './schemas.js';

export async function getTaskDocument(workspaceId) {
  const response = await apiFetch(`/api/tasks?workspaceId=${encodeURIComponent(workspaceId)}`);

  if (!response.ok) {
    throw new Error(`Failed to read tasks: ${response.status}`);
  }

  const data = await response.json();
  return TaskDocumentSchema.parse(data);
}

export async function updateTaskDocument(workspaceId, input) {
  const payload = UpdateTaskDocumentInputSchema.parse(input);

  const response = await apiFetch(`/api/tasks?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to save tasks: ${response.status}`);
  }

  const data = await response.json();
  return TaskDocumentSchema.parse(data);
}
