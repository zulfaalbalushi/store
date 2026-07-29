export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = 'The requested resource was not found.') {
  return new HttpError(404, 'NOT_FOUND', message);
}

export function methodNotAllowed(message = 'This method is not allowed for the resource.') {
  return new HttpError(405, 'METHOD_NOT_ALLOWED', message);
}

export function serviceUnavailable(message = 'The service is temporarily unavailable.') {
  return new HttpError(503, 'SERVICE_UNAVAILABLE', message);
}

export function unauthorized(message = 'Authentication is required.') {
  return new HttpError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'You are not allowed to perform this action.') {
  return new HttpError(403, 'FORBIDDEN', message);
}

export function conflict(message) {
  return new HttpError(409, 'CONFLICT', message);
}

export function validationError(details) {
  return new HttpError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', details);
}
