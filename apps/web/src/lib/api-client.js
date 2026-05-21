function getApiConfig() {
  return (
    window.dao?.api ?? {
      baseUrl: '',
      sessionToken: '',
    }
  );
}

function getApiBaseUrl() {
  const { baseUrl } = getApiConfig();

  return import.meta.env.DEV ? '' : baseUrl;
}

export async function apiFetch(path, options = {}) {
  const { sessionToken } = getApiConfig();
  const baseUrl = getApiBaseUrl();

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(sessionToken
        ? {
            Authorization: `Bearer ${sessionToken}`,
          }
        : {}),
    },
  });
}
