// Component smoke test: mount GhostInput in each canonical state and assert its serialized DOM
// still matches the checked-in fixture byte-for-byte. This is the standing guard that the module
// decomposition (and any later change) keeps the rendered DOM identical. The fixtures are produced
// by generate-fixtures.svelte.test.ts via the SAME drivers, so a mismatch means a real DOM change.
//
// The fixtures currently encode the inline-SVG accept button (the one intentional DOM change of the
// decomposition — the lucide ArrowRight component was replaced with a literal <svg>, dropping the
// lucide CSS classes and node-anchor comments while keeping identical geometry). See the dedicated
// "accept button" assertion below, which pins exactly that transformation.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { driveIdle, driveReady, driveWaiting } from './testkit.svelte';

const FIX_DIR = path.join(process.cwd(), 'src/lib/input/__fixtures__');
const fixture = (name: string) => readFileSync(path.join(FIX_DIR, `${name}.html`), 'utf8').trimEnd();

describe('GhostInput DOM fixtures', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		document.body.innerHTML = '';
	});

	it('idle: empty, autofocused', async () => {
		const m = await driveIdle();
		try {
			expect(m.html()).toBe(fixture('idle'));
			// The autofocus-on-mount behavior is part of the contract.
			expect(document.activeElement).toBe(m.input);
		} finally {
			m.destroy();
		}
	});

	it('ready: demo prediction rendered', async () => {
		const m = await driveReady();
		try {
			expect(m.stage().getAttribute('data-state')).toBe('ready');
			expect(m.target.querySelector('.prediction')).not.toBeNull();
			expect(m.html()).toBe(fixture('ready'));
		} finally {
			m.destroy();
		}
	});

	it('waiting: hung fetch shows the thinking caret', async () => {
		const m = await driveWaiting();
		try {
			expect(m.stage().getAttribute('data-state')).toBe('waiting');
			expect(m.target.querySelector('.caret.thinking')).not.toBeNull();
			expect(m.html()).toBe(fixture('waiting'));
		} finally {
			m.destroy();
		}
	});

	it('accept button renders an inline SVG with lucide arrow-right geometry and no runtime dep', async () => {
		const m = await driveReady();
		try {
			const svg = m.target.querySelector('.accept-button svg') as SVGElement;
			expect(svg).not.toBeNull();
			// Lucide arrow-right geometry, reproduced inline.
			expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
			expect(svg.getAttribute('width')).toBe('24');
			expect(svg.getAttribute('height')).toBe('24');
			expect(svg.getAttribute('stroke-width')).toBe('2.35');
			expect(svg.getAttribute('aria-hidden')).toBe('true');
			const paths = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'));
			expect(paths).toEqual(['M5 12h14', 'm12 5 7 7-7 7']);
			// The whole point of the swap: no lucide classes on the icon.
			expect(svg.getAttribute('class')).toBeNull();
		} finally {
			m.destroy();
		}
	});
});
