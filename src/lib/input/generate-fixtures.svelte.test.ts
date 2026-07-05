// Fixture (RE)GENERATOR — writes the three canonical outerHTML fixtures under __fixtures__/.
//
// It is a no-op unless GEN_FIXTURES=1 is set, so a normal `npm test` never rewrites the checked-in
// fixtures; the persistent gate is ghost-input.svelte.test.ts. Regenerate intentionally with:
//   GEN_FIXTURES=1 npx vitest run --project dom src/lib/input/generate-fixtures.svelte.test.ts
import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { driveIdle, driveReady, driveWaiting } from './testkit.svelte';

// happy-dom overrides the global URL such that fileURLToPath(import.meta.url) throws; derive the
// fixtures dir from the repo root (vitest runs from cwd) instead.
const FIX_DIR = path.join(process.cwd(), 'src/lib/input/__fixtures__') + path.sep;
const ENABLED = process.env.GEN_FIXTURES === '1';

describe.skipIf(!ENABLED)('generate fixtures', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		document.body.innerHTML = '';
	});

	it('writes idle/ready/waiting fixtures', async () => {
		mkdirSync(FIX_DIR, { recursive: true });

		const idle = await driveIdle();
		writeFileSync(FIX_DIR + 'idle.html', idle.html() + '\n');
		idle.destroy();

		const ready = await driveReady();
		writeFileSync(FIX_DIR + 'ready.html', ready.html() + '\n');
		ready.destroy();

		const waiting = await driveWaiting();
		writeFileSync(FIX_DIR + 'waiting.html', waiting.html() + '\n');
		waiting.destroy();
	});
});
