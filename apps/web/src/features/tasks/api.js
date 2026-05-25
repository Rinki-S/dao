import { apiFetch } from '../../lib/api-client.js';
import {
  CreateTaskInputSchema,
  TaskListSchema,
  TaskSchema,
  UpdateTaskStatusInputSchema,
} from './schemas.js';

export async function listTasks() {
  const response = await apiFetch('/api/tasks');

  if (!response.ok) {
    throw new Error(`Failed to list tasks: ${response.status}`);
  }

  const data = await response.json();
  return TaskListSchema.parse(data);
}

export async function createTask(input) {
  const payload = CreateTaskInputSchema.parse(input);

  const response = await apiFetch('/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create task: ${response.status}`);
  }

  const data = await response.json();
  return TaskSchema.parse(data);
}

export async function updateTaskStatus(taskId, input) {
  const payload = UpdateTaskStatusInputSchema.parse(input);

  const response = await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update task status: ${response.status}`);
  }

  const data = await response.json();
  return TaskSchema.parse(data);
}
