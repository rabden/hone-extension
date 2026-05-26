/**
 * API request utilities with abort controllers, retries, and timeout handling
 * Critical for MV3 service workers that can be suspended mid-request
 */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  timeout?: number; // milliseconds
  maxRetries?: number;
  retryDelay?: number; // milliseconds
  signal?: AbortSignal; // External abort signal
}

export interface RequestResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  retries: number;
  aborted: boolean;
}

/**
 * Make an HTTP request with retry logic and timeout
 * Automatically aborts on timeout or external abort signal
 */
export async function request<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<RequestResult<T>> {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = 30000,
    maxRetries = 2,
    retryDelay = 1000,
    signal,
  } = options;

  let lastError: Error | null = null;
  let aborted = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Setup timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => controller.abort(), timeout);
      }

      // Merge abort signals
      const mergedSignal = signal
        ? AbortSignal.any([controller.signal, signal])
        : controller.signal;

      const response = await fetch(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: mergedSignal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
        statusCode: response.status,
        retries: attempt,
        aborted: false,
      };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          aborted = true;
          lastError = error;
          break; // Don't retry aborts
        }
        lastError = error;
      }

      // Retry on last attempt or if we haven't hit max retries
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * Math.pow(2, attempt)) // Exponential backoff
        );
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    retries: maxRetries,
    aborted,
  };
}

/**
 * Stream API response (for long-running LLM requests)
 * Returns async generator of chunks
 */
export async function* streamRequest(
  url: string,
  options: RequestOptions = {}
): AsyncGenerator<string, void, unknown> {
  const {
    method = 'POST',
    body,
    headers = {},
    timeout = 120000,
    signal,
  } = options;

  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    // Setup timeout
    if (timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    // Merge abort signals
    const mergedSignal = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;

    const response = await fetch(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: mergedSignal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        yield chunk;
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Helper to create an abort controller with timeout
 */
export function createTimeoutAbortSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): AbortSignal {
  if (timeoutMs <= 0) {
    return externalSignal || new AbortController().signal;
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);

  return externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
}
