(function exposeBaytnaApi() {
  let sessionPromise;

  class ApiError extends Error {
    constructor(status, error) {
      super(error?.message || 'Something went wrong. Please try again.');
      this.name = 'ApiError';
      this.status = status;
      this.code = error?.code || 'UNKNOWN_ERROR';
      this.details = error?.details || {};
    }
  }

  async function request(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...options.headers,
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(path, {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      headers,
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(response.status, {
        code: 'INVALID_RESPONSE',
        message: 'The server returned an invalid response.',
      });
    }

    if (!response.ok || payload.success !== true) {
      throw new ApiError(response.status, payload.error);
    }

    return payload.data;
  }

  async function upload(path, file, headers = {}) {
    const response = await fetch(path, {
      method: 'POST',
      body: file,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': file.type,
        ...headers,
      },
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(response.status, {
        code: 'INVALID_RESPONSE',
        message: 'The server returned an invalid response.',
      });
    }

    if (!response.ok || payload.success !== true) {
      throw new ApiError(response.status, payload.error);
    }

    return payload.data;
  }

  function csrfHeaders() {
    const csrfToken = sessionStorage.getItem('baytnaCsrfToken');
    return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
  }

  function saveSession(data) {
    sessionStorage.setItem('baytnaCsrfToken', data.csrfToken);
    sessionStorage.setItem('baytnaStoreAccount', JSON.stringify(data.account));
    sessionPromise = Promise.resolve(data);
  }

  function clearSession() {
    sessionPromise = undefined;
    sessionStorage.removeItem('baytnaCsrfToken');
    sessionStorage.removeItem('baytnaStoreAccount');
    sessionStorage.removeItem('baytnaDemoSession');
  }

  function getSession() {
    if (!sessionPromise) {
      sessionPromise = request('/api/v1/auth/session').then((data) => {
        saveSession(data);
        return data;
      });
    }

    return sessionPromise;
  }

  window.BaytnaApi = {
    ApiError,
    clearSession,
    csrfHeaders,
    getSession,
    request,
    saveSession,
    upload,
  };
})();
