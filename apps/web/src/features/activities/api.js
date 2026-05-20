import { apiFetch } from '../../lib/api-client.js';
import { ActivityListSchema } from './schemas.js';

export async function listActivities() {
  const response = await apiFetch('/api/activities');

  if (!response.ok) {
    throw new Error(`Failed to list activities: ${response.status}`);
  }

  const data = await response.json();
  return ActivityListSchema.parse(data);
}
