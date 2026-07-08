import type { AuthResponse } from './types';

/**
 * access token은 XSS로 탈취 가능한 localStorage 대신 메모리에만 둔다.
 * 새로고침 시에는 httpOnly refresh 쿠키로 재발급받는다 (bootstrap).
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 동시에 여러 요청이 401을 맞아도 refresh는 한 번만 나가도록 single-flight */
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch('/api/v1/auth/refresh', { method: 'POST' });
      if (!response.ok) return false;
      const body = (await response.json()) as AuthResponse;
      accessToken = body.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function rawRequest(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response = await rawRequest(method, path, body);

  // access token 만료 → refresh 한 번 시도 후 재요청
  if (response.status === 401 && !path.startsWith('/api/v1/auth/')) {
    if (await tryRefresh()) {
      response = await rawRequest(method, path, body);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (json as { code?: string } | null)?.code ?? 'UNKNOWN';
    const message = (json as { message?: string } | null)?.message ?? '요청에 실패했습니다.';
    throw new ApiError(response.status, code, message);
  }
  return json as T;
}

export { tryRefresh };
