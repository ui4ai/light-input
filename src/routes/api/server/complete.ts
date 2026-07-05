import { env } from '$env/dynamic/private';
import { MAX_INPUT_CHARS, MIN_INPUT_CHARS } from '@ui4ai/light-input';
import { completionMessages, sanitizeCompletion } from './completion-protocol';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_CONTEXT_CHARS = 900;
const UPSTREAM_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30_000;
const CACHE_LIMIT = 160;
const DEFAULT_REFERER = 'http://localhost:5173';
const DEFAULT_MODEL = 'openai/gpt-4.1-mini';
const APP_TITLE = 'light-input';

class UpstreamTimeoutError extends Error {
	constructor() {
		super('OpenRouter timeout');
		this.name = 'UpstreamTimeoutError';
	}
}

export const MIN_CHARS = MIN_INPUT_CHARS;

export interface CompleteResult {
	completion: string;
	error?: string;
	status?: number;
}

interface CachedCompleteResult {
	expiresAt: number;
	value: CompleteResult;
}

const completionCache = new Map<string, CachedCompleteResult>();
const inFlightCompletions = new Map<string, Promise<CompleteResult>>();

function createAbortSignal(parent?: AbortSignal) {
	const controller = new AbortController();
	const abort = () => controller.abort(parent?.reason);
	if (parent?.aborted) abort();
	else parent?.addEventListener('abort', abort, { once: true });

	return {
		signal: controller.signal,
		abort: (reason?: unknown) => controller.abort(reason),
		cleanup: () => {
			parent?.removeEventListener('abort', abort);
		}
	};
}

function unavailable(status = 502): CompleteResult {
	return {
		completion: '',
		error: 'Autocomplete is temporarily unavailable.',
		status
	};
}

function safeHttpUrl(value: string | undefined, fallback: string) {
	if (!value) return fallback;

	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
		return url.toString();
	} catch {
		return fallback;
	}
}

function configuredModel(value: string | undefined) {
	return value?.trim() || DEFAULT_MODEL;
}

/**
 * Ask OpenRouter for an inline continuation of `text`.
 * The API key stays server-side; callers receive only a sanitized completion.
 */
export async function complete(
	text: string,
	fetchImpl: typeof fetch,
	signal?: AbortSignal
): Promise<CompleteResult> {
	if (typeof text !== 'string') return { completion: '' };

	const normalized = text.slice(0, MAX_INPUT_CHARS);
	if (normalized.trim().length <= MIN_CHARS) return { completion: '' };

	const key = env.OPENROUTER_API_KEY;
	if (!key) {
		console.warn('OPENROUTER_API_KEY is not configured.');
		return { completion: '', error: 'Autocomplete is not configured.', status: 503 };
	}

	const model = configuredModel(env.OPENROUTER_MODEL);
	const context = normalized.slice(-MAX_CONTEXT_CHARS);
	const cacheKey = `${model}\n${context}`;
	const now = Date.now();
	const cached = completionCache.get(cacheKey);
	if (cached && cached.expiresAt > now) return cached.value;
	if (cached) completionCache.delete(cacheKey);

	const inFlight = inFlightCompletions.get(cacheKey);
	if (inFlight) return inFlight;

	const pending = requestOpenRouterCompletion({
		context,
		fetchImpl,
		key,
		model,
		normalized,
		signal
	});
	inFlightCompletions.set(cacheKey, pending);

	try {
		const result = await pending;
		if (!result.error) cacheCompletion(cacheKey, result);
		return result;
	} finally {
		inFlightCompletions.delete(cacheKey);
	}
}

function cacheCompletion(key: string, value: CompleteResult) {
	completionCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });

	while (completionCache.size > CACHE_LIMIT) {
		const oldestKey = completionCache.keys().next().value;
		if (!oldestKey) return;
		completionCache.delete(oldestKey);
	}
}

async function requestOpenRouterCompletion({
	context,
	fetchImpl,
	key,
	model,
	normalized,
	signal
}: {
	context: string;
	fetchImpl: typeof fetch;
	key: string;
	model: string;
	normalized: string;
	signal?: AbortSignal;
}): Promise<CompleteResult> {
	const abort = createAbortSignal(signal);
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			const err = new UpstreamTimeoutError();
			abort.abort(err);
			reject(err);
		}, UPSTREAM_TIMEOUT_MS);
	});

	try {
		const res = await Promise.race([
			fetchImpl(ENDPOINT, {
				method: 'POST',
				signal: abort.signal,
				headers: {
					Authorization: `Bearer ${key}`,
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'HTTP-Referer': safeHttpUrl(env.OPENROUTER_HTTP_REFERER, DEFAULT_REFERER),
					'X-Title': APP_TITLE
				},
				body: JSON.stringify({
					model,
					max_tokens: 28,
					temperature: 0,
					stop: ['\n'],
					messages: completionMessages(context)
				})
			}),
			timeout
		]);

		if (!res.ok) {
			console.warn(`OpenRouter completion failed with status ${res.status}.`);
			return unavailable(res.status === 401 || res.status === 403 ? 503 : 502);
		}

		const data = (await res.json()) as {
			choices?: { message?: { content?: string } }[];
		};
		const raw = data.choices?.[0]?.message?.content ?? '';
		return { completion: sanitizeCompletion(raw, normalized) };
	} catch (err) {
		if (signal?.aborted) return { completion: '' };
		if (err instanceof UpstreamTimeoutError) {
			console.warn('OpenRouter request timed out.');
			return unavailable(504);
		}
		console.warn('OpenRouter request failed:', err instanceof Error ? err.message : err);
		return unavailable();
	} finally {
		clearTimeout(timeoutId);
		abort.cleanup();
	}
}
