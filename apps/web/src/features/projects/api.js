import { apiFetch } from "../../lib/api-client";
import {
    CreateProjectInputSchema,
    ProjectListSchema,
    ProjectSchema,
} from "./schemas.js";

export async function listProjects() {
    const response = await apiFetch('/api/projects')

    if (!response.ok) {
        throw new Error(`Failed to list projects: ${response.status}`)
    }

    const data = await response.json()
    return ProjectListSchema.parse(data)
}

export async function createProject(input) {
    const payload = CreateProjectInputSchema.parse(input)

    const response = await apiFetch('/api/projects', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        throw new Error(`Failed to create project: ${response.status}`)
    }

    const data = await response.json()
    return ProjectSchema.parse(data)
}
