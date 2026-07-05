import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionCache } from '$lib/autocomplete';
import {
	CompletionEngine,
	DEMO_COMPLETION_DELAY_MS,
	PREDICTION_ERROR,
	type CompleteFn,
	type CompletionEngineContext
} from './completion.svelte';

const DEMO = "Let's make something that actually makes a difference";

/** A mutable context so tests can steer value/mode/endpoint/complete and toggle shouldPredict. */
function makeCtx(overrides: Partial<Record<keyof CompletionEngineContext, unknown>> = {}) {
	const state = {
		value: '',
		mode: 'llm' as 'llm' | 'demo',
		endpoint: '/api/complete',
		complete: undefined as CompleteFn | undefined,
		debounceMs: 100,
		predict: true
	};
	const ctx: CompletionEngineContext = {
		value: () => state.value,
		mode: () => state.mode,
		endpoint: () => state.endpoint,
		complete: () => state.complete,
		debounceMs: () => state.debounceMs,
		shouldPredict: () => state.predict,
		...(overrides as Partial<CompletionEngineContext>)
	};
	return { ctx, state };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
	return {
		ok,
		status,
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

describe('CompletionEngine', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('schedulePrediction / debounce', () => {
		it('does not request before the debounce window elapses, then requests once', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'hello wor';
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(jsonResponse({ completion: 'ld' }));
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(engine.loading).toBe(false);

			await vi.advanceTimersByTimeAsync(99);
			expect(fetchSpy).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			expect(engine.suggestion).toBe('ld');
			expect(engine.loading).toBe(false);
		});

		it('coalesces rapid reschedules into a single request (latest value wins)', async () => {
			const { ctx, state } = makeCtx();
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(jsonResponse({ completion: 'X' }));
			const engine = new CompletionEngine(ctx);

			state.value = 'a';
			engine.schedulePrediction();
			state.value = 'ab';
			engine.schedulePrediction();
			state.value = 'abc';
			engine.schedulePrediction();

			await vi.advanceTimersByTimeAsync(100);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
			expect(body.text).toBe('abc');
		});

		it('clears the error and does nothing when shouldPredict is false', async () => {
			const { ctx, state } = makeCtx();
			state.predict = false;
			const engine = new CompletionEngine(ctx);
			engine.error = 'stale error';
			const fetchSpy = vi.spyOn(globalThis, 'fetch');

			engine.schedulePrediction();

			expect(engine.error).toBe('');
			await vi.advanceTimersByTimeAsync(200);
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	});

	describe('cache', () => {
		it('serves a cached suggestion synchronously and bumps igniteKey (no request)', async () => {
			const cache = new CompletionCache();
			const { ctx, state } = makeCtx();
			state.value = 'primed';
			cache.set(`llm\nprimed`, ' done'); // key is `${mode}\n${text}`
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const engine = new CompletionEngine(ctx, cache);
			const before = engine.igniteKey;

			engine.schedulePrediction();

			expect(engine.suggestion).toBe(' done');
			expect(engine.igniteKey).toBe(before + 1);
			await vi.advanceTimersByTimeAsync(200);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('a cached EMPTY suggestion is served without bumping igniteKey', () => {
			const cache = new CompletionCache();
			const { ctx, state } = makeCtx();
			state.value = 'primed';
			cache.set(`llm\nprimed`, '');
			const engine = new CompletionEngine(ctx, cache);
			const before = engine.igniteKey;

			engine.schedulePrediction();

			expect(engine.suggestion).toBe('');
			expect(engine.igniteKey).toBe(before);
		});

		it('populates the cache after a successful fetch and reuses it next time', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'reuse me';
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(jsonResponse({ completion: ' cached' }));
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);
			expect(engine.suggestion).toBe(' cached');
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			engine.schedulePrediction();
			expect(engine.suggestion).toBe(' cached');
			await vi.advanceTimersByTimeAsync(100);
			expect(fetchSpy).toHaveBeenCalledTimes(1); // served from cache, no second fetch
		});

		it('clearCache drops entries so the next schedule refetches', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'x';
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValue(jsonResponse({ completion: 'y' }));
			const engine = new CompletionEngine(ctx);
			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			engine.clearCache();
			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		});
	});

	describe('demo mode', () => {
		it('waits DEMO_COMPLETION_DELAY_MS then serves the scripted completion', async () => {
			const { ctx, state } = makeCtx();
			state.mode = 'demo';
			state.value = DEMO.slice(0, 13); // "Let's make so"
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const engine = new CompletionEngine(ctx);
			const before = engine.igniteKey;

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(state.debounceMs);
			expect(engine.loading).toBe(true);
			expect(engine.suggestion).toBe('');

			await vi.advanceTimersByTimeAsync(DEMO_COMPLETION_DELAY_MS);
			expect(engine.suggestion).toBe(DEMO.slice(13));
			expect(engine.igniteKey).toBe(before + 1);
			expect(engine.loading).toBe(false);
			expect(fetchSpy).not.toHaveBeenCalled(); // demo path never hits the network
		});

		it('aborting during the demo delay leaves no suggestion and stops loading', async () => {
			const { ctx, state } = makeCtx();
			state.mode = 'demo';
			state.value = DEMO.slice(0, 13);
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(state.debounceMs);
			expect(engine.loading).toBe(true);

			engine.cancelPending(true);
			expect(engine.loading).toBe(false);
			expect(engine.suggestion).toBe('');

			await vi.advanceTimersByTimeAsync(DEMO_COMPLETION_DELAY_MS);
			expect(engine.suggestion).toBe(''); // the resolved timeout must not commit
		});
	});

	describe('stale-response guard', () => {
		it('does not commit a response whose text no longer matches the live value', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'first';
			let resolveFetch: (r: Response) => void = () => {};
			vi.spyOn(globalThis, 'fetch').mockImplementation(
				() => new Promise<Response>((res) => (resolveFetch = res))
			);
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100); // fetch in flight for 'first'

			// The user typed on: the live value is now different.
			state.value = 'second';
			resolveFetch(jsonResponse({ completion: 'STALE' }));
			await vi.advanceTimersByTimeAsync(0);

			expect(engine.suggestion).toBe(''); // stale response dropped
		});

		it('does not commit if shouldPredict flipped false before the response landed', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'blur me';
			let resolveFetch: (r: Response) => void = () => {};
			vi.spyOn(globalThis, 'fetch').mockImplementation(
				() => new Promise<Response>((res) => (resolveFetch = res))
			);
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);

			state.predict = false; // e.g. blurred
			resolveFetch(jsonResponse({ completion: 'NOPE' }));
			await vi.advanceTimersByTimeAsync(0);

			expect(engine.suggestion).toBe('');
		});
	});

	describe('cancel / abort', () => {
		it('cancelPending aborts the in-flight request (signal fires)', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'abort me';
			let capturedSignal: AbortSignal | undefined;
			vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
				capturedSignal = (init as RequestInit).signal ?? undefined;
				return new Promise<Response>(() => {}); // never resolves
			});
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);
			expect(engine.loading).toBe(true);
			expect(capturedSignal?.aborted).toBe(false);

			engine.cancelPending();
			expect(capturedSignal?.aborted).toBe(true);
			expect(engine.loading).toBe(false);
		});

		it('cancelPending(true) clears the current suggestion', () => {
			const { ctx } = makeCtx();
			const engine = new CompletionEngine(ctx);
			engine.suggestion = 'visible';
			engine.cancelPending(true);
			expect(engine.suggestion).toBe('');
		});

		it('an AbortError from fetch does not surface as an error message', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'boom';
			vi.spyOn(globalThis, 'fetch').mockRejectedValue(
				new DOMException('Aborted', 'AbortError')
			);
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);

			expect(engine.error).toBe('');
			expect(engine.suggestion).toBe('');
		});
	});

	describe('llm errors', () => {
		it('surfaces a friendly error message on a non-ok response', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'fail';
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				jsonResponse({ error: 'nope' }, false, 500)
			);
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);

			expect(engine.error).toBe(PREDICTION_ERROR);
			expect(engine.suggestion).toBe('');
			expect(engine.loading).toBe(false);
		});

		it('normalizes the completion text before committing', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'norm';
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				jsonResponse({ completion: '  spaced\tout  ' })
			);
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);

			// normalizeInlineCompletion collapses whitespace and preserves one leading space.
			expect(engine.suggestion).toBe(' spaced out');
		});
	});

	describe('custom complete()', () => {
		it('calls complete() (not fetch) with the input text and an abort signal, then commits', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'plug me';
			let seenText = '';
			let seenSignal: AbortSignal | undefined;
			state.complete = vi.fn(async (text, c) => {
				seenText = text;
				seenSignal = c.signal;
				return ' from-fn';
			});
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);

			expect(state.complete).toHaveBeenCalledTimes(1);
			expect(seenText).toBe('plug me');
			expect(seenSignal).toBeInstanceOf(AbortSignal);
			expect(fetchSpy).not.toHaveBeenCalled(); // endpoint is ignored when complete is set
			expect(engine.suggestion).toBe(' from-fn');
			expect(engine.loading).toBe(false);
		});

		it('normalizes the complete() result exactly like the fetch path', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'norm';
			state.complete = vi.fn(async () => '  spaced\tout  ');
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);

			expect(engine.suggestion).toBe(' spaced out');
		});

		it('still applies the stale-value guard to a slow complete()', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'first';
			let resolveFn: (s: string) => void = () => {};
			state.complete = vi.fn(() => new Promise<string>((res) => (resolveFn = res)));
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100); // complete() in flight for 'first'

			state.value = 'second'; // user typed on
			resolveFn(' STALE');
			await vi.advanceTimersByTimeAsync(0);

			expect(engine.suggestion).toBe(''); // superseded result dropped
		});

		it('aborts the in-flight complete() via the shared signal on cancelPending', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'abort me';
			let capturedSignal: AbortSignal | undefined;
			state.complete = vi.fn((_text, c) => {
				capturedSignal = c.signal;
				return new Promise<string>(() => {}); // never resolves
			});
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);
			expect(engine.loading).toBe(true);
			expect(capturedSignal?.aborted).toBe(false);

			engine.cancelPending();
			expect(capturedSignal?.aborted).toBe(true);
			expect(engine.loading).toBe(false);
		});

		it('surfaces PREDICTION_ERROR when complete() rejects (non-abort)', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'boom';
			state.complete = vi.fn(async () => {
				throw new Error('backend exploded');
			});
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);

			expect(engine.error).toBe(PREDICTION_ERROR);
			expect(engine.suggestion).toBe('');
			expect(engine.loading).toBe(false);
		});

		it('swallows an AbortError thrown by complete() (no error surfaced)', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'quiet';
			state.complete = vi.fn(async () => {
				throw new DOMException('Aborted', 'AbortError');
			});
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);

			expect(engine.error).toBe('');
			expect(engine.suggestion).toBe('');
		});

		it('demo mode never consults complete()', async () => {
			const { ctx, state } = makeCtx();
			state.mode = 'demo';
			state.value = DEMO.slice(0, 13);
			state.complete = vi.fn(async () => ' should-not-run');
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(state.debounceMs + DEMO_COMPLETION_DELAY_MS);

			expect(state.complete).not.toHaveBeenCalled();
			expect(engine.suggestion).toBe(DEMO.slice(13)); // scripted demo completion, not the fn
		});

		it('caches the complete() result and reuses it without a second call', async () => {
			const { ctx, state } = makeCtx();
			state.value = 'reuse';
			state.complete = vi.fn(async () => ' cached-fn');
			const engine = new CompletionEngine(ctx);

			engine.schedulePrediction();
			await vi.advanceTimersByTimeAsync(100);
			expect(engine.suggestion).toBe(' cached-fn');
			expect(state.complete).toHaveBeenCalledTimes(1);

			engine.schedulePrediction();
			expect(engine.suggestion).toBe(' cached-fn'); // served from cache synchronously
			await vi.advanceTimersByTimeAsync(100);
			expect(state.complete).toHaveBeenCalledTimes(1); // no second invocation
		});
	});
});
