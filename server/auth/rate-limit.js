import { HttpError } from '../http/errors.js';

export function createRateLimiter(options = {}) {
  const limit = options.limit || 20;
  const windowMilliseconds = options.windowMilliseconds || 15 * 60 * 1000;
  const now = options.now || Date.now;
  const attempts = new Map();

  return {
    check(request, action) {
      const address = request.socket?.remoteAddress || 'local';
      const key = `${action}:${address}`;
      const currentTime = now();
      const existing = attempts.get(key);

      if (!existing || existing.resetAt <= currentTime) {
        attempts.set(key, {
          count: 1,
          resetAt: currentTime + windowMilliseconds,
        });
        return;
      }

      existing.count += 1;

      if (existing.count > limit) {
        throw new HttpError(
          429,
          'TOO_MANY_REQUESTS',
          'Too many authentication attempts. Please try again later.',
        );
      }
    },
  };
}
