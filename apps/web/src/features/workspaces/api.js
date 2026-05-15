import { WorkspaceListSchema } from "./schemas";

export async function listWorkspaces() {
    const response = await fetch(`/api/workspaces`);

    if (!response.ok) {
        throw new Error(`Failed to list workspaces: ${response.status}`);
    }

    const data = await response.json();
    return WorkspaceListSchema.parse(data);
}