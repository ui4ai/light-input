import type { EffectDefinition } from './types';

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/u;

/**
 * Identity helper that gives third-party effects a typed, discoverable authoring seam. Pass an
 * effect definition (metadata + optional layer); the CSS is imported for its side effect inside
 * the same module. It warns when `meta.name` is not kebab-case, since the name becomes the
 * `data-glow` attribute selector every rule in the effect's CSS is keyed on — a malformed name
 * silently produces an effect no CSS ever matches, so surfacing it in any environment is worth the
 * single cheap regex (and keeps this module dependency-free and bundler-agnostic).
 *
 * ```ts
 * import { defineEffect } from '@ui4ai/light-input';
 * import './firefly.css';                 // written against CONTRACT.md
 * import FireflySwarm from './FireflySwarm.svelte';
 *
 * export default defineEffect({
 *   meta: { name: 'firefly', label: 'Firefly', description: 'Sparks assemble the prediction.' },
 *   layer: FireflySwarm
 * });
 * ```
 */
export function defineEffect(effect: EffectDefinition): EffectDefinition {
	if (!KEBAB_CASE.test(effect.meta.name)) {
		console.warn(
			`[light-input] effect name "${effect.meta.name}" must be kebab-case (used as the data-glow selector).`
		);
	}
	return effect;
}
