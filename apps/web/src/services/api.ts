type WakingStateListener = (isWaking: boolean, retryAttempt: number) => void;
type PasswordChangeListener = () => void;

class ApiClient {
  private wakingListeners: Set<WakingStateListener> = new Set();
  private passwordChangeListeners: Set<PasswordChangeListener> = new Set();
  private isServerWakingState = false;

  public subscribeWakingState(listener: WakingStateListener): () => void {
    this.wakingListeners.add(listener);
    listener(this.isServerWakingState, 0);
    return () => this.wakingListeners.delete(listener);
  }

  public subscribePasswordChangeRequired(listener: PasswordChangeListener): () => void {
    this.passwordChangeListeners.add(listener);
    return () => this.passwordChangeListeners.delete(listener);
  }

  private notifyPasswordChangeRequired() {
    for (const listener of this.passwordChangeListeners) {
      listener();
    }
  }

  private notifyWaking(isWaking: boolean, attempt = 0) {
    this.isServerWakingState = isWaking;
    for (const listener of this.wakingListeners) {
      listener(isWaking, attempt);
    }
  }

  public async request<T = any>(
    path: string,
    options: RequestInit = {},
    maxRetries = 3
  ): Promise<T> {
    const url = path.startsWith('/api') ? path : `/api${path}`;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const isFormData = options.body instanceof FormData;
        const requestHeaders: Record<string, string> = {};
        if (!isFormData) {
          requestHeaders['Content-Type'] = 'application/json';
        }
        if (options.headers) {
          Object.assign(requestHeaders, options.headers);
        }
        // If FormData, remove explicit Content-Type to let fetch generate the multipart boundary
        if (isFormData) {
          delete requestHeaders['Content-Type'];
        }

        const response = await fetch(url, {
          ...options,
          credentials: 'include',
          headers: requestHeaders,
        });

        // Detect Render free tier cold-start status codes: 502, 503, 504
        if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
          attempt++;
          this.notifyWaking(true, attempt);
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
          await new Promise((res) => setTimeout(res, delayMs));
          continue;
        }

        // Server responded normally
        if (this.isServerWakingState) {
          this.notifyWaking(false, 0);
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          // If 401 Unauthorized and not already refreshing/logging in, attempt silent token refresh once
          if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/refresh') && attempt === 0) {
            try {
              const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
              if (refreshRes.ok) {
                return this.request<T>(path, options, 1);
              }
            } catch {
              // Ignore refresh error and throw original 401
            }
          }

          if (data.code === 'PASSWORD_CHANGE_REQUIRED') {
            this.notifyPasswordChangeRequired();
          }

          const errorMsg = data.message || data.error || `HTTP error ${response.status}`;
          const error: any = new Error(errorMsg);
          error.status = response.status;
          error.code = data.code;
          error.data = data;
          throw error;
        }

        return data as T;
      } catch (err: any) {
        // If it's a network disconnect / gateway timeout and we have retries left
        if ((err.name === 'TypeError' || err.message?.includes('Failed to fetch')) && attempt < maxRetries) {
          attempt++;
          this.notifyWaking(true, attempt);
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
          await new Promise((res) => setTimeout(res, delayMs));
          continue;
        }

        if (this.isServerWakingState) {
          this.notifyWaking(false, 0);
        }
        throw err;
      }
    }

    throw new Error('Server request timed out after multiple attempts.');
  }

  public get<T = any>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public post<T = any>(path: string, body?: any, options?: RequestInit): Promise<T> {
    const isFormData = body instanceof FormData;
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
    });
  }

  public patch<T = any>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public put<T = any>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T = any>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();

