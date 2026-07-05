import { describe, expect, it } from 'vitest';
import { MAX_INPUT_CHARS } from '@ui4ai/light-input';
import { readCompletionRequestBody, validateJsonContentType } from './completion-request';

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
	return new Request('http://localhost/api/complete', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...headers
		},
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

describe('validateJsonContentType', () => {
	it('accepts application/json with parameters', () => {
		const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });

		expect(validateJsonContentType(headers)).toBeUndefined();
	});

	it('rejects non-json media types', () => {
		const headers = new Headers({ 'content-type': 'text/plain' });

		expect(validateJsonContentType(headers)).toEqual({
			error: 'Content-Type must be application/json.',
			status: 415
		});
	});
});

describe('readCompletionRequestBody', () => {
	it('reads valid text bodies', async () => {
		await expect(readCompletionRequestBody(jsonRequest({ text: 'hello' }))).resolves.toEqual({
			text: 'hello'
		});
	});

	it('reads valid completion mode', async () => {
		await expect(
			readCompletionRequestBody(jsonRequest({ text: 'hello', mode: 'demo' }))
		).resolves.toEqual({
			text: 'hello',
			mode: 'demo'
		});
	});

	it('rejects invalid completion mode', async () => {
		await expect(
			readCompletionRequestBody(jsonRequest({ text: 'hello', mode: 'remote' }))
		).resolves.toEqual({
			error: '`mode` must be "llm" or "demo".',
			status: 400
		});
	});

	it('rejects invalid JSON', async () => {
		await expect(readCompletionRequestBody(jsonRequest('{'))).resolves.toEqual({
			error: 'Invalid JSON body.',
			status: 400
		});
	});

	it('rejects missing text', async () => {
		await expect(readCompletionRequestBody(jsonRequest({ value: 'hello' }))).resolves.toEqual({
			error: '`text` must be a string.',
			status: 400
		});
	});

	it('rejects invalid content-length', async () => {
		await expect(
			readCompletionRequestBody(jsonRequest({ text: 'hello' }, { 'content-length': 'wat' }))
		).resolves.toEqual({
			error: 'Invalid Content-Length.',
			status: 400
		});
	});

	it('rejects oversized content-length before reading', async () => {
		await expect(
			readCompletionRequestBody(jsonRequest({ text: 'hello' }, { 'content-length': '9000' }))
		).resolves.toEqual({
			error: 'Request is too large.',
			status: 413
		});
	});

	it('rejects oversized chunked body without content-length', async () => {
		await expect(
			readCompletionRequestBody(jsonRequest(JSON.stringify({ text: 'x'.repeat(9_000) })))
		).resolves.toEqual({
			error: 'Request is too large.',
			status: 413
		});
	});

	it('rejects oversized text by app limit', async () => {
		await expect(
			readCompletionRequestBody(jsonRequest({ text: 'x'.repeat(MAX_INPUT_CHARS + 1) }))
		).resolves.toEqual({
			error: 'Text is too long.',
			status: 413
		});
	});
});
