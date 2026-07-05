import type { Component } from 'svelte';
import type { GlowVariant } from '../autocomplete';

/**
 * Props every effect layer component receives from GhostInput. A layer renders inside the live
 * `.prediction` node (absolute, `pointer-events: none`) and is remounted per ignite, so entrance
 * animations replay without any self-reset logic.
 */
export interface GlowLayerProps {
	suggestion: string;
	lightFlow: boolean;
}

/**
 * Metadata describing an effect. Deliberately icon-free: shipping `Component` icons would force
 * `@lucide/svelte` onto every consumer and pull 39 icon modules into the registry graph. Galleries
 * that want icons keep their own name → icon map (the demo does, in `src/routes/demo/icons.ts`).
 */
export interface EffectMeta {
	/** kebab-case identifier; becomes the `data-glow` attribute on `.stage`/`.field`. */
	name: string;
	/** Human-readable label for pickers/galleries. */
	label: string;
	/** Optional one-liner describing the effect. */
	description?: string;
}

/**
 * A packaged effect: its metadata plus an optional DOM layer component. Produced by
 * {@link import('./define').defineEffect}; the effect's CSS travels as a side-effect import inside
 * its `index.ts` entry, not on this object.
 */
export interface EffectDefinition {
	meta: EffectMeta;
	layer?: Component<GlowLayerProps>;
}

/** The canonical name union for the built-in effects. */
export type EffectName = GlowVariant;
