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

  const isViteDev =
    window.location.origin === 'http://localhost:5173' ||
    window.location.origin === 'http://127.0.0.1:5173';

  return isViteDev ? '' : baseUrl;
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
