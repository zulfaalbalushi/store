const SECURITY_HEADERS = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function sendJson(response, status, payload, additionalHeaders = {}) {
  const body = JSON.stringify(payload);

  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
    ...additionalHeaders,
  });
  response.end(body);
}

export function sendSuccess(response, data, status = 200, additionalHeaders = {}) {
  sendJson(
    response,
    status,
    {
      success: true,
      data,
    },
    additionalHeaders,
  );
}

export function sendError(response, error) {
  const errorPayload = {
    code: error.code,
    message: error.message,
  };

  if (error.details) {
    errorPayload.details = error.details;
  }

  sendJson(response, error.status, {
    success: false,
    error: errorPayload,
  });
}

export function staticSecurityHeaders(contentType, contentLength) {
  return {
    ...SECURITY_HEADERS,
    'Cache-Control': 'no-cache',
    'Content-Length': contentLength,
    'Content-Type': contentType,
  };
}
