import { WorkspaceListSchema } from "./schemas";

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

export async function listWorkspaces() {
    const { sessionToken } = getApiConfig();
    const baseUrl = getApiBaseUrl();

    const response = await fetch(`${baseUrl}/api/workspaces`, {
        headers: sessionToken ? {
            'Authorization': `Bearer ${sessionToken}`
        } : {},
    });

    if (!response.ok) {
        throw new Error(`Failed to list workspaces: ${response.status}`);
    }

    const data = await response.json();
    return WorkspaceListSchema.parse(data);
}