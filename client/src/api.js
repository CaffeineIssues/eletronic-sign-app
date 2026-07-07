const TOKEN_KEY = 'esign_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Request failed (${status})`);
    this.status = status;
    this.errors = data?.errors || null;
  }
}

export async function api(path, { method = 'GET', body, formData, auth = true } = {}) {
  const headers = {};
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Fetch a protected PDF as a blob URL for the viewer. */
export async function fetchPdfBlobUrl(path, { auth = true } = {}) {
  const headers = {};
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { headers });
  if (!res.ok) throw new ApiError(res.status, null);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
