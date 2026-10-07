let refreshPromise: Promise<boolean> | null = null;
const AUTH_REQUEST_TIMEOUT_MS = 12_000;

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error('服务器响应超时，请检查本地后端是否已启动');
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetchWithTimeout('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  }).then(async (response) => {
    if (!response.ok) return false;
    const data = await response.json() as { token?: string };
    if (!data.token) return false;
    localStorage.setItem('auth_token', data.token);
    return true;
  }).catch(() => false).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('auth_token');
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers, credentials: 'include' });
  const url = typeof input === 'string' ? input : input.toString();
  const isAuthEntry = /\/api\/auth\/(?:login|register|refresh)/.test(url);
  if (response.status !== 401 || !retry || isAuthEntry) return response;
  if (await refreshAccessToken()) return authFetch(input, init, false);
  localStorage.removeItem('auth_token');
  window.dispatchEvent(new CustomEvent('wf-auth-expired'));
  return response;
}

export async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-cache');
  const response = await authFetch(path, { ...init, headers, cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `请求失败 (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
