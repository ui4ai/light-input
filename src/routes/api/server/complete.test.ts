import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy<Record<string, string | undefined>>(
		{},
		{
			get: (_target, property) => process.env[String(property)]
		}
	)
}));

import { complete } from './complete';

describe('complete', () => {
	afterEach(() => {
		vi.useRealTimers();
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.OPENROUTER_MODEL;
		delete process.env.OPENROUTER_HTTP_REFERER;
	});

	it('caches successful completions for the same model and context', async () => {
		process.env.OPENROUTER_API_KEY = 'test-key';
		process.env.OPENROUTER_MODEL = 'test/cache-model';

		const fetchImpl = vi.fn(async () =>
			Response.json({ choices: [{ message: { content: 'SPACE:world' } }] })
		);

		await expect(complete('hello', fetchImpl as unknown as typeof fetch)).resolves.toEqual({
			completion: ' world'
		});
		await expect(complete('hello', fetchImpl as unknown as typeof fetch)).resolves.toEqual({
			completion: ' world'
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('deduplicates concurrent completions for the same model and context', async () => {
		process.env.OPENROUTER_API_KEY = 'test-key';
		process.env.OPENROUTER_MODEL = 'test/in-flight-model';

		let resolveResponse!: (response: Response) => void;
		const pendingResponse = new Promise<Response>((resolve) => {
			resolveResponse = resolve;
		});
		const fetchImpl = vi.fn(() => pendingResponse);

		const first = complete('concurrent input', fetchImpl as unknown as typeof fetch);
		const second = complete('concurrent input', fetchImpl as unknown as typeof fetch);
		resolveResponse(Response.json({ choices: [{ message: { content: 'SPACE:result' } }] }));

		await expect(Promise.all([first, second])).resolves.toEqual([
			{ completion: ' result' },
			{ completion: ' result' }
		]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('returns a 504 result when OpenRouter does not answer before the timeout', async () => {
		vi.useFakeTimers();
		process.env.OPENROUTER_API_KEY = 'test-key';

		const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
		const result = complete('hello world', fetchImpl as unknown as typeof fetch);

		await vi.advanceTimersByTimeAsync(8_000);

		await expect(result).resolves.toEqual({
			completion: '',
			error: 'Autocomplete is temporarily unavailable.',
			status: 504
		});
	});
});
