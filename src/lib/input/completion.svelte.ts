// The completion state machine for GhostInput.
//
// Owns the prediction lifecycle — debounce, LRU cache, AbortController, monotonic request-seq
// stale-guard, the 220ms demo delay, and the igniteKey remount counter — behind a small surface
// the component wires into its handlers. Extracted verbatim from GhostInput.svelte; the branching,
// the guard conditions, and the ordering of every state write are preserved exactly.
//
// Reactive coupling: the engine holds its OWN $state (suggestion, loading, error, igniteKey) that
// the component's deriveds/markup read. Everything it needs FROM the component (the live input
// value, the active mode/endpoint/debounce, and the shouldPredict predicate) is supplied as lazily
// evaluated accessors in the context object, so the guards see live values at call time exactly as
// the inline code did.

import {
	CompletionCache,
	fixedTextCompletion,
	normalizeInlineCompletion,
	type CompletionMode,
	type CompletionResponse
} from '$lib/autocomplete';

/** Milliseconds the demo mode "thinks" before revealing the scripted completion. */
export const DEMO_COMPLETION_DELAY_MS = 220;

/** The message shown when a prediction request fails. */
export const PREDICTION_ERROR = 'Prediction is unavailable right now.';

/**
 * A custom completion source. Receives the current input text plus an `AbortSignal` that fires when
 * the request is superseded/cancelled, and resolves with the raw completion string (normalized by
 * the engine exactly like an endpoint response). When supplied it REPLACES the endpoint fetch for
 * `llm` mode; `demo` mode is unaffected. It runs inside the same debounce/cache/stale/abort guards
 * as the built-in fetch path.
 */
export type CompleteFn = (text: string, ctx: { signal: AbortSignal }) => Promise<string>;

export interface CompletionEngineContext {
	/** The live input value (the guard compares this against the captured request text). */
	value: () => string;
	/** The active completion mode. */
	mode: () => CompletionMode;
	/** The fetch endpoint for llm mode. */
	endpoint: () => string;
	/**
	 * Optional custom completion function. When it returns a function, `llm` mode calls it instead
	 * of fetching `endpoint` (the endpoint is then ignored). `demo` mode never consults it.
	 */
	complete: () => CompleteFn | undefined;
	/** The debounce window in ms. */
	debounceMs: () => number;
	/** Whether a prediction should currently be scheduled/kept (focus + text + caret-at-end). */
	shouldPredict: () => boolean;
}

export class CompletionEngine {
	/** The current inline suggestion (empty string = none). */
	suggestion = $state('');
	/** True while a prediction request is in flight. */
	loading = $state(false);
	/** Non-empty when the last request failed. */
	error = $state('');
	/** Bumped on every fresh suggestion to remount ({#key}) the prediction and replay animations. */
	igniteKey = $state(0);

	readonly #ctx: CompletionEngineContext;
	readonly #cache: CompletionCache;
	#debounceTimer: ReturnType<typeof setTimeout> | undefined;
	#controller: AbortController | undefined;
	#requestSeq = 0;

	constructor(ctx: CompletionEngineContext, cache: CompletionCache = new CompletionCache()) {
		this.#ctx = ctx;
		this.#cache = cache;
	}

	/** Cancel any pending debounce + in-flight request and stop loading. */
	cancelPending(clearSuggestion = false) {
		clearTimeout(this.#debounceTimer);
		this.#debounceTimer = undefined;
		this.#controller?.abort();
		this.#controller = undefined;
		this.#requestSeq += 1;
		this.loading = false;
		if (clearSuggestion) this.suggestion = '';
	}

	/** Drop all cached completions. */
	clearCache() {
		this.#cache.clear();
	}

	#cacheKey(text: string) {
		return `${this.#ctx.mode()}\n${text}`;
	}

	/**
	 * Cancel anything pending, then either serve a cached suggestion synchronously (bumping
	 * igniteKey when non-empty) or arm the debounce timer to request a fresh one.
	 */
	schedulePrediction() {
		this.cancelPending(true);

		if (!this.#ctx.shouldPredict()) {
			this.error = '';
			return;
		}

		const value = this.#ctx.value();
		const cached = this.#cache.get(this.#cacheKey(value));
		if (cached !== undefined) {
			this.suggestion = cached;
			this.error = '';
			if (cached) this.igniteKey += 1;
			return;
		}

		this.#debounceTimer = setTimeout(
			() => void this.requestPrediction(value, this.#ctx.mode()),
			this.#ctx.debounceMs()
		);
	}

	#waitForDemoCompletion(signal: AbortSignal) {
		return new Promise<void>((resolve, reject) => {
			if (signal.aborted) {
				reject(new DOMException('Aborted', 'AbortError'));
				return;
			}

			const timeout = window.setTimeout(resolve, DEMO_COMPLETION_DELAY_MS);
			signal.addEventListener(
				'abort',
				() => {
					window.clearTimeout(timeout);
					reject(new DOMException('Aborted', 'AbortError'));
				},
				{ once: true }
			);
		});
	}

	/** The built-in endpoint fetch: POST {text, mode} and return the raw completion string. */
	async #fetchCompletion(text: string, mode: CompletionMode, signal: AbortSignal) {
		const res = await fetch(this.#ctx.endpoint(), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text, mode }),
			signal
		});

		const data = (await res.json().catch(() => ({}))) as CompletionResponse;

		if (!res.ok) {
			throw new Error(data.error || `Completion failed (${res.status})`);
		}

		return data.completion;
	}

	/** Whether the response for `seq`/`text`/`mode` is still the one we want to commit. */
	#isStale(seq: number, text: string, mode: CompletionMode) {
		return (
			seq !== this.#requestSeq ||
			this.#ctx.value() !== text ||
			this.#ctx.mode() !== mode ||
			!this.#ctx.shouldPredict()
		);
	}

	/** Fire the actual prediction request (demo delay or llm fetch) with abort + stale guards. */
	async requestPrediction(text: string, mode: CompletionMode) {
		const seq = ++this.#requestSeq;
		const aborter = new AbortController();
		this.#controller = aborter;
		this.loading = true;
		this.error = '';

		try {
			if (mode === 'demo') {
				await this.#waitForDemoCompletion(aborter.signal);
				if (this.#isStale(seq, text, mode)) return;

				const demo = fixedTextCompletion(text);
				this.suggestion = demo;
				this.#cache.set(this.#cacheKey(text), demo);
				if (demo) this.igniteKey += 1;
				return;
			}

			// A custom `complete` function, when supplied, replaces the endpoint fetch for llm mode.
			// It sees the same abort signal and its result flows through the identical stale guard,
			// normalization, cache write, and igniteKey bump as the fetch path below.
			const complete = this.#ctx.complete();
			const raw = complete
				? await complete(text, { signal: aborter.signal })
				: await this.#fetchCompletion(text, mode, aborter.signal);

			if (this.#isStale(seq, text, mode)) return;

			const next = normalizeInlineCompletion(raw);
			this.suggestion = next;
			this.#cache.set(this.#cacheKey(text), next);
			if (next) this.igniteKey += 1;
		} catch (err) {
			if ((err as Error)?.name === 'AbortError' || seq !== this.#requestSeq) return;
			this.suggestion = '';
			this.error = PREDICTION_ERROR;
		} finally {
			if (seq === this.#requestSeq) {
				this.loading = false;
				this.#controller = undefined;
			}
		}
	}
}
