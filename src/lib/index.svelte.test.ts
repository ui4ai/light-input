// Pins the package root's public surface (`@ui4ai/light-input` -> src/lib/index.ts). If a refactor
// adds, drops, or renames a root export, this test fails loudly. It runs in the dom project because
// the barrel imports GhostInput.svelte (which side-effect-imports core.css).
//
// Deliberately NOT asserted here: that the root re-exports the effect REGISTRY. It must not — the
// registry drags every effect's CSS + both layer components into any root import, so it lives at
// the separate '@ui4ai/light-input/effects' entry. The absence check below guards that boundary.

import { describe, expect, it } from 'vitest';
import * as pkg from '$lib/index';
import { defineEffect } from '$lib/index';

describe('package root exports', () => {
	it('exports the exact set of runtime value names', () => {
		// GhostInput (component) + defineEffect (authoring helper) + the full autocomplete surface.
		const names = Object.keys(pkg).sort();
		expect(names).toEqual(
			[
				// component + authoring
				'GhostInput',
				'defineEffect',
				// autocomplete constants
				'COMPLETION_CACHE_LIMIT',
				'COMPLETION_MODES',
				'DEFAULT_DEBOUNCE_MS',
				'DEMO_COMPLETION_TEXT',
				'GLOW_VARIANTS',
				'MAX_COMPLETION_CHARS',
				'MAX_COMPLETION_WORDS',
				'MAX_INPUT_CHARS',
				'MIN_INPUT_CHARS',
				// autocomplete class + pure helpers
				'CompletionCache',
				'applyScriptedDemoInput',
				'fixedTextCompletion',
				'normalizeInlineCompletion',
				'splitInlineCompletion'
			].sort()
		);
	});

	it('exports GhostInput as a component (function) and defineEffect as a function', () => {
		expect(typeof pkg.GhostInput).toBe('function');
		expect(typeof pkg.defineEffect).toBe('function');
	});

	it('does NOT re-export the effect registry from the root', () => {
		// These are the '@ui4ai/light-input/effects' registry exports; they must be absent here.
		expect(pkg).not.toHaveProperty('effects');
		expect(pkg).not.toHaveProperty('effectByName');
		expect(pkg).not.toHaveProperty('glowOptions');
	});

	it('defineEffect returns its argument (identity authoring seam)', () => {
		const def = { meta: { name: 'firefly', label: 'Firefly' } };
		expect(defineEffect(def)).toBe(def);
	});
});
