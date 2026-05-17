import { CreateWorkspaceInputSchema, WorkspaceListSchema, WorkspaceSchema } from "./schemas.js";

function getApiConfig() {
    return window.dao?.api ?? {
        baseUrl: '',
        sessionToken: '',
    }
}

function getApiBaseUrl() {
    const { baseUrl } = getApiConfig();

    const isViteDev =
        window.location.origin === 'http://localhost:5173' ||
        window.location.origin === 'http://127.0.0.1:5173';

    return isViteDev ? '' : baseUrl;
}

async function apiFetch(path, options = {}) {
    const { sessionToken } = getApiConfig();
    const baseUrl = getApiBaseUrl();

    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            ...(options.headers ?? {}),
            ...(sessionToken
                ? {
                    Authorization: `Bearer ${sessionToken}`,
                }
                : {}
            ),
        }
    })

    return response;
}

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