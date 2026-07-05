import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fixedTextCompletion, type CompletionMode } from '@ui4ai/light-input';
import { complete } from '../server/complete';
import {
	isCompletionRequestError,
	readCompletionRequestBody,
	validateJsonContentType
} from '../server/completion-request';
import { checkRateLimit } from '../server/rate-limit';

const JSON_HEADERS = {
	'Cache-Control': 'no-store',
	'X-Content-Type-Options': 'nosniff'
};
const DEFAULT_COMPLETION_MODE: CompletionMode = 'llm';

function completionJson(body: { completion: string; error?: string }, status = 200, headers = {}) {
	return json(body, {
		status,
		headers: {
			...JSON_HEADERS,
			...headers
		}
	});
}

function configuredCompletionMode(requested: CompletionMode | undefined): CompletionMode {
	if (env.LIGHT_INPUT_COMPLETION_MODE === 'demo') return 'demo';
	return requested ?? DEFAULT_COMPLETION_MODE;
}

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
	const contentTypeError = validateJsonContentType(request.headers);
	if (contentTypeError) {
		return completionJson({ completion: '', error: contentTypeError.error }, contentTypeError.status);
	}

	const client = getClientAddress();
	const rate = checkRateLimit(client);
	if (!rate.allowed) {
		return completionJson(
			{ completion: '', error: 'Too many requests.' },
			429,
			rate.retryAfterSeconds ? { 'Retry-After': String(rate.retryAfterSeconds) } : {}
		);
	}

	const body = await readCompletionRequestBody(request);
	if (isCompletionRequestError(body)) {
		return completionJson({ completion: '', error: body.error }, body.status);
	}

	try {
		if (configuredCompletionMode(body.mode) === 'demo') {
			return completionJson({
				completion: fixedTextCompletion(body.text, env.LIGHT_INPUT_DEMO_COMPLETION)
			});
		}

		const result = await complete(body.text, fetch, request.signal);
		return completionJson(
			{ completion: result.completion, error: result.error },
			result.error ? (result.status ?? 502) : 200
		);
	} catch (err) {
		console.warn('Completion handler failed:', err instanceof Error ? err.message : err);
		return completionJson({ completion: '', error: 'Autocomplete is temporarily unavailable.' }, 500);
	}
};
