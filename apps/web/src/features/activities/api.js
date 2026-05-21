import { apiFetch } from '../../lib/api-client.js';
import { ActivityListSchema, ActivityMetricsSchema } from './schemas.js';

export async function listActivities() {
  const response = await apiFetch('/api/activities');

  if (!response.ok) {
    throw new Error(`Failed to list activities: ${response.status}`);
  }

  const data = await response.json();
  return ActivityListSchema.parse(data);
}

export async function getActivityMetrics() {
  const response = await apiFetch('/api/activities/metrics');

  if (!response.ok) {
    throw new Error(`Failed to load activity metrics: ${response.status}`);
  }

  const data = await response.json();
  return ActivityMetricsSchema.parse(data);
}
