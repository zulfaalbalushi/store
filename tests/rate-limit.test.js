import assert from 'node:assert/strict';
import test from 'node:test';

import { createRateLimiter } from '../server/auth/rate-limit.js';

test('authentication rate limiter blocks attempts until its window resets', () => {
  let currentTime = 1_000;
  const limiter = createRateLimiter({
    limit: 2,
    now: () => currentTime,
    windowMilliseconds: 500,
  });
  const request = { socket: { remoteAddress: '127.0.0.1' } };

  limiter.check(request, 'sign-in');
  limiter.check(request, 'sign-in');
  assert.throws(
    () => limiter.check(request, 'sign-in'),
    (error) => error.status === 429 && error.code === 'TOO_MANY_REQUESTS',
  );

  currentTime += 501;
  assert.doesNotThrow(() => limiter.check(request, 'sign-in'));
});
