interface Bucket {
	tokens: number;
	updatedAt: number;
}

export interface RateLimitResult {
	allowed: boolean;
	retryAfterSeconds?: number;
}

export interface TokenBucketRateLimiterOptions {
	capacity: number;
	maxBuckets: number;
	windowMs: number;
}

export class TokenBucketRateLimiter {
	readonly capacity: number;
	readonly maxBuckets: number;
	readonly windowMs: number;

	readonly #buckets = new Map<string, Bucket>();
	readonly #refillPerMs: number;

	constructor({ capacity, maxBuckets, windowMs }: TokenBucketRateLimiterOptions) {
		if (capacity <= 0 || maxBuckets <= 0 || windowMs <= 0) {
			throw new Error('Rate limiter options must be positive.');
		}

		this.capacity = capacity;
		this.maxBuckets = maxBuckets;
		this.windowMs = windowMs;
		this.#refillPerMs = capacity / windowMs;
	}

	get size() {
		return this.#buckets.size;
	}

	reset() {
		this.#buckets.clear();
	}

	check(rawKey: string, now = Date.now()): RateLimitResult {
		const key = normalizeBucketKey(rawKey);
		this.#prune(now);

		const bucket = this.#buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
		const elapsed = Math.max(0, now - bucket.updatedAt);
		bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.#refillPerMs);
		bucket.updatedAt = now;

		this.#buckets.set(key, bucket);
		this.#enforceMaxBuckets();

		if (bucket.tokens < 1) {
			return {
				allowed: false,
				retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / this.#refillPerMs / 1000))
			};
		}

		bucket.tokens -= 1;
		return { allowed: true };
	}

	#prune(now: number) {
		const staleAfter = this.windowMs * 5;
		for (const [key, bucket] of this.#buckets) {
			if (now - bucket.updatedAt > staleAfter) this.#buckets.delete(key);
		}
	}

	#enforceMaxBuckets() {
		while (this.#buckets.size > this.maxBuckets) {
			let oldestKey = '';
			let oldestUpdatedAt = Number.POSITIVE_INFINITY;

			for (const [key, bucket] of this.#buckets) {
				if (bucket.updatedAt < oldestUpdatedAt) {
					oldestKey = key;
					oldestUpdatedAt = bucket.updatedAt;
				}
			}

			if (!oldestKey) return;
			this.#buckets.delete(oldestKey);
		}
	}
}

export const completionRateLimiter = new TokenBucketRateLimiter({
	capacity: 45,
	maxBuckets: 2_000,
	windowMs: 60_000
});

export function checkRateLimit(key: string, now = Date.now()): RateLimitResult {
	return completionRateLimiter.check(key, now);
}

function normalizeBucketKey(key: string) {
	const normalized = key.trim();
	return normalized || 'unknown-client';
}
