import Constants from 'expo-constants';

/**
 * Where the API lives. EXPO_PUBLIC_API_URL wins; otherwise, in development,
 * use the machine running Metro on port 8080, so the iOS simulator and
 * physical devices on the same network both reach the local backend.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${metroHost ?? 'localhost'}:8080`;
}

/** The absolute URL of an API path, e.g. a media URL the API returned. */
export function apiUrl(path: string): string {
  return `${resolveBaseUrl()}${path}`;
}

/** The server answered with an error response. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The server could not be reached at all. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Can't reach the server.", { cause });
    this.name = 'NetworkError';
  }
}

/** A message to show the user for a failed request. */
export function errorMessage(e: unknown): string {
  // The API's messages are written for people ("Email or password is incorrect.").
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  return 'Something went wrong. Please try again.';
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Sent as JSON, or as a multipart form when it's FormData. */
  body?: unknown;
  /** Sent as "Authorization: Bearer <token>". */
  token?: string;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  // fetch sets a multipart Content-Type, with its boundary, for FormData.
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? 'Something went wrong.',
    );
  }
  return data as T;
}
