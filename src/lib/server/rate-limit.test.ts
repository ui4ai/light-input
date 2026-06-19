import { describe, expect, it } from 'vitest';
import { TokenBucketRateLimiter } from './rate-limit';

describe('TokenBucketRateLimiter', () => {
	it('allows up to capacity and then returns retry metadata', () => {
		const limiter = new TokenBucketRateLimiter({ capacity: 2, maxBuckets: 10, windowMs: 1_000 });

		expect(limiter.check('client', 0)).toEqual({ allowed: true });
		expect(limiter.check('client', 0)).toEqual({ allowed: true });
		expect(limiter.check('client', 0)).toEqual({ allowed: false, retryAfterSeconds: 1 });
	});

	it('refills over time', () => {
		const limiter = new TokenBucketRateLimiter({ capacity: 1, maxBuckets: 10, windowMs: 1_000 });

		limiter.check('client', 0);

		expect(limiter.check('client', 999).allowed).toBe(false);
		expect(limiter.check('client', 1_000).allowed).toBe(true);
	});

	it('normalizes blank keys', () => {
		const limiter = new TokenBucketRateLimiter({ capacity: 1, maxBuckets: 10, windowMs: 1_000 });

		expect(limiter.check(' ', 0).allowed).toBe(true);
		expect(limiter.check('', 0).allowed).toBe(false);
	});

	it('bounds bucket memory', () => {
		const limiter = new TokenBucketRateLimiter({ capacity: 1, maxBuckets: 2, windowMs: 1_000 });

		limiter.check('a', 0);
		limiter.check('b', 1);
		limiter.check('c', 2);

		expect(limiter.size).toBe(2);
		expect(limiter.check('a', 2).allowed).toBe(true);
	});

	it('prunes stale buckets before rejected checks too', () => {
		const limiter = new TokenBucketRateLimiter({ capacity: 1, maxBuckets: 10, windowMs: 1_000 });

		limiter.check('old', 0);
		limiter.check('hot', 6_000);
		limiter.check('hot', 6_000);

		expect(limiter.size).toBe(1);
	});
});
