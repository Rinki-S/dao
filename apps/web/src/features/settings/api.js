import { apiFetch } from '@/lib/api-client.js';
import { UpdateWorkingDirectoryInputSchema, WorkingDirectorySchema } from './schemas.js';

export async function getWorkingDirectory() {
  const response = await apiFetch('/api/settings/working-directory');

  if (!response.ok) {
    throw new Error(`Failed to get working directory: ${response.status}`);
  }

  const data = await response.json();
  return WorkingDirectorySchema.parse(data);
}

export async function updateWorkingDirectory(input) {
  const payload = UpdateWorkingDirectoryInputSchema.parse(input);

  const response = await apiFetch('/api/settings/working-directory', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update working directory: ${response.status}`);
  }

  const data = await response.json();
  return WorkingDirectorySchema.parse(data);
}
