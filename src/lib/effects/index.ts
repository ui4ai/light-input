// The ALL-39 effect registry (the `@ui4ai/light-input/effects` entry). Importing this pulls every
// effect's CSS + both DOM layer components — intended for galleries/pickers that show the full set.
// Single-effect consumers import '@ui4ai/light-input/effects/<name>' instead and pay only for that
// effect. Icons deliberately live nowhere in the package: the demo keeps its own name → icon map in
// src/routes/demo/icons.ts.
//
// Import order below mirrors GLOW_VARIANTS and the former index.css aggregate: core anatomy arrives
// via each entry's `import '../core.css'` (first statement, deduped to one copy), then the classics
// in GLOW_VARIANTS order, then the 27 redesigned effects — preserving the cascade the oracle pins.
import type { Component } from 'svelte';
import type { GlowVariant } from '../autocomplete';
import type { EffectDefinition, GlowLayerProps } from './types';

import torch from './torch/index';
import candle from './candle/index';
import lightning from './lightning/index';
import aurora from './aurora/index';
import plasma from './plasma/index';
import prism from './prism/index';
import ember from './ember/index';
import neon from './neon/index';
import nebula from './nebula/index';
import smoke from './smoke/index';
import solar from './solar/index';
import holo from './holo/index';
import blackhole from './blackhole/index';
import flame from './flame/index';
import matrix from './matrix/index';
import snow from './snow/index';
import toxic from './toxic/index';
import vortex from './vortex/index';
import bubblegum from './bubblegum/index';
import optic from './optic/index';
import biolume from './biolume/index';
import ocean from './ocean/index';
import horror from './horror/index';
import heart from './heart/index';
import liquidglass from './liquidglass/index';
import android from './android/index';
import fontshift from './fontshift/index';
import rorschach from './rorschach/index';
import diffusion from './diffusion/index';
import chromabloom from './chromabloom/index';
import infrared from './infrared/index';
import staged from './staged/index';
import blueprint from './blueprint/index';
import spoiler from './spoiler/index';
import ghosttext from './ghosttext/index';
import drift from './drift/index';
import art from './art/index';
import scratch from './scratch/index';
import kaleidoscope from './kaleidoscope/index';

export type { EffectDefinition, EffectMeta, EffectName, GlowLayerProps } from './types';
export { defineEffect } from './define';

/**
 * Every built-in effect, in canonical UI order (=== GLOW_VARIANTS). A contract test asserts the
 * order and that each `meta.name` matches its folder.
 */
export const effects: readonly EffectDefinition[] = [
	torch,
	candle,
	lightning,
	aurora,
	plasma,
	prism,
	ember,
	neon,
	nebula,
	smoke,
	solar,
	holo,
	blackhole,
	flame,
	matrix,
	snow,
	toxic,
	vortex,
	bubblegum,
	optic,
	biolume,
	ocean,
	horror,
	heart,
	liquidglass,
	android,
	fontshift,
	rorschach,
	diffusion,
	chromabloom,
	infrared,
	staged,
	blueprint,
	spoiler,
	ghosttext,
	drift,
	art,
	scratch,
	kaleidoscope
];

/** Look up a built-in effect by its `data-glow` name. */
export function effectByName(name: string): EffectDefinition | undefined {
	return effects.find((effect) => effect.meta.name === name);
}

/**
 * Demo/gallery-facing option shape. Icon-free — pickers pair this with their own icon map keyed on
 * `value`. Kept as a thin projection of {@link effects} so back-compat consumers of `glowOptions`
 * keep working.
 */
export interface GlowEffect {
	value: GlowVariant;
	label: string;
	/** Optional extra DOM layer rendered inside the prediction while a suggestion is live. */
	layer?: Component<GlowLayerProps>;
}

export type GlowOption = GlowEffect;

export const glowOptions: readonly GlowEffect[] = effects.map((effect) => ({
	value: effect.meta.name as GlowVariant,
	label: effect.meta.label,
	layer: effect.layer
}));

export function glowLayer(glow: GlowVariant): Component<GlowLayerProps> | undefined {
	return glowOptions.find((option) => option.value === glow)?.layer;
}
