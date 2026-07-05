// Package root (`@ui4ai/light-input`). Deliberately does NOT re-export './effects': that aggregate
// pulls every effect's CSS + both DOM layer components, which would drag the whole ~30k-line skin
// set into every consumer that only wants the component. Effects are imported per-name from
// '@ui4ai/light-input/effects/<name>' (or the whole set from '@ui4ai/light-input/effects').
//
// GhostInput itself imports './effects/core.css', so a bare <GhostInput> with zero effects still
// carries the beam/torch anatomy (the Torch default). Effect entries import the same core.css;
// bundlers dedupe it to a single copy.
export { default as GhostInput } from './GhostInput.svelte';

// The autocomplete contract: types (GlowVariant, ThemeMode, LoadingGlow, VisualState,
// CompletionMode, CompletionResponse, ...), tunable constants, the LRU CompletionCache, and the
// pure completion/normalization helpers consumers need to drive or extend the component.
export * from './autocomplete';

// The effect-authoring surface (types + defineEffect). The registry itself is a separate entry.
export { defineEffect } from './effects/define';
export type { EffectDefinition, EffectMeta, EffectName, GlowLayerProps } from './effects/types';
