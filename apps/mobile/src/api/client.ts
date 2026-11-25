/**
 * The only place the app talks to the network. Every request carries the JWT,
 * the active business and the device time zone (so overdue is judged in the
 * user's own day), and any 401 signs the session out.
 */

const FALLBACK_API_URL = 'http://localhost:4000/api/v1';

export const API_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? FALLBACK_API_URL).replace(/\/+$/, '');

export interface ApiFieldError {
  path?: string;
  message: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: ApiFieldError[] };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: ApiFieldError[];
  /** Seconds until a rate-limited request may be sent again, when the server says so. */
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    code: string,
    status: number,
    details: ApiFieldError[] = [],
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Field errors keyed by path, ready for inline form messages. */
  get fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const detail of this.details) {
      if (detail.path && !errors[detail.path]) errors[detail.path] = detail.message;
    }
    return errors;
  }

  get isOffline(): boolean {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT';
  }
}

let sessionToken: string | null = null;
let activeBusinessId: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function setActiveBusinessIdHeader(businessId: string | null): void {
  activeBusinessId = businessId;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

type QueryValue = string | number | boolean | null | undefined;

function withQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Render's free host can take a while to wake up. */
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs = 25_000 } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Timezone': currentTimeZone(),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
  if (activeBusinessId) headers['X-Business-Id'] = activeBusinessId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${withQuery(path, query)}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'The server is taking a while to wake up. Try again in a moment.'
        : 'Cannot reach the server. Check your connection and try again.',
      aborted ? 'TIMEOUT' : 'NETWORK',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    if (sessionToken) unauthorizedHandler?.();
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const parsed = payload as ApiErrorBody | null;
    const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    throw new ApiError(
      parsed?.error?.message ?? 'Something went wrong. Try again.',
      parsed?.error?.code ?? 'UNKNOWN',
      response.status,
      parsed?.error?.details ?? [],
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }

  return payload as T;
}
