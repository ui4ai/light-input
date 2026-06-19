import { COMPLETION_MODES, MAX_INPUT_CHARS, type CompletionMode } from '$lib/autocomplete';

export const MAX_COMPLETION_BODY_BYTES = 8_192;

const DECODER = new TextDecoder();

export interface CompletionRequestBody {
	text: string;
	mode?: CompletionMode;
}

export interface CompletionRequestError {
	error: string;
	status: 400 | 413 | 415;
}

export function validateJsonContentType(headers: Headers): CompletionRequestError | undefined {
	const mediaType = (headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
	if (mediaType === 'application/json') return undefined;
	return { error: 'Content-Type must be application/json.', status: 415 };
}

export async function readCompletionRequestBody(
	request: Request
): Promise<CompletionRequestBody | CompletionRequestError> {
	const contentLength = request.headers.get('content-length');
	if (contentLength) {
		const size = Number(contentLength);
		if (!Number.isFinite(size) || size < 0) {
			return { error: 'Invalid Content-Length.', status: 400 };
		}
		if (size > MAX_COMPLETION_BODY_BYTES) {
			return { error: 'Request is too large.', status: 413 };
		}
	}

	const raw = await readLimitedText(request);
	if (raw === undefined) {
		return { error: 'Request is too large.', status: 413 };
	}
	if (raw === null) return { error: 'Unable to read request body.', status: 400 };

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return { error: 'Invalid JSON body.', status: 400 };
	}

	if (
		!body ||
		typeof body !== 'object' ||
		typeof (body as { text?: unknown }).text !== 'string'
	) {
		return { error: '`text` must be a string.', status: 400 };
	}

	const text = (body as { text: string }).text;
	if (text.length > MAX_INPUT_CHARS) {
		return { error: 'Text is too long.', status: 413 };
	}

	const mode = (body as { mode?: unknown }).mode;
	if (mode !== undefined && !COMPLETION_MODES.includes(mode as CompletionMode)) {
		return { error: '`mode` must be "llm" or "demo".', status: 400 };
	}

	return { text, mode: mode as CompletionMode | undefined };
}

export function isCompletionRequestError(
	result: CompletionRequestBody | CompletionRequestError
): result is CompletionRequestError {
	return 'error' in result;
}

async function readLimitedText(request: Request): Promise<string | null | undefined> {
	const body = request.body;
	if (!body) return '';

	const reader = body.getReader();
	let bytes = 0;
	let raw = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_COMPLETION_BODY_BYTES) {
				await reader.cancel();
				return undefined;
			}
			raw += DECODER.decode(value, { stream: true });
		}

		raw += DECODER.decode();
		return raw;
	} catch {
		return null;
	}
}
