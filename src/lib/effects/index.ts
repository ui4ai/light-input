import Activity from '@lucide/svelte/icons/activity';
import Atom from '@lucide/svelte/icons/atom';
import Aperture from '@lucide/svelte/icons/aperture';
import Asterisk from '@lucide/svelte/icons/asterisk';
import Binary from '@lucide/svelte/icons/binary';
import Blend from '@lucide/svelte/icons/blend';
import Bot from '@lucide/svelte/icons/bot';
import Candy from '@lucide/svelte/icons/candy';
import Clapperboard from '@lucide/svelte/icons/clapperboard';
import CloudFog from '@lucide/svelte/icons/cloud-fog';
import Droplets from '@lucide/svelte/icons/droplets';
import Eclipse from '@lucide/svelte/icons/eclipse';
import Eraser from '@lucide/svelte/icons/eraser';
import Flashlight from '@lucide/svelte/icons/flashlight';
import Flame from '@lucide/svelte/icons/flame';
import FlameKindling from '@lucide/svelte/icons/flame-kindling';
import Gem from '@lucide/svelte/icons/gem';
import Ghost from '@lucide/svelte/icons/ghost';
import HeartPulse from '@lucide/svelte/icons/heart-pulse';
import Orbit from '@lucide/svelte/icons/orbit';
import Palette from '@lucide/svelte/icons/palette';
import Radiation from '@lucide/svelte/icons/radiation';
import Rainbow from '@lucide/svelte/icons/rainbow';
import ScanEye from '@lucide/svelte/icons/scan-eye';
import Snowflake from '@lucide/svelte/icons/snowflake';
import ScanText from '@lucide/svelte/icons/scan-text';
import Shapes from '@lucide/svelte/icons/shapes';
import Sparkles from '@lucide/svelte/icons/sparkles';
import SwatchBook from '@lucide/svelte/icons/swatch-book';
import Sun from '@lucide/svelte/icons/sun';
import Tornado from '@lucide/svelte/icons/tornado';
import Type from '@lucide/svelte/icons/type';
import VenetianMask from '@lucide/svelte/icons/venetian-mask';
import Waves from '@lucide/svelte/icons/waves';
import Wind from '@lucide/svelte/icons/wind';
import Zap from '@lucide/svelte/icons/zap';
import type { Component } from 'svelte';
import type { GlowVariant } from '$lib/autocomplete';
import Kaleidoscope from './kaleidoscope/Kaleidoscope.svelte';
import MatrixRain from './matrix/MatrixRain.svelte';
import './index.css';

/** Props every effect layer component receives from GhostInput. */
export interface GlowLayerProps {
	suggestion: string;
	lightFlow: boolean;
}

export interface GlowEffect {
	value: GlowVariant;
	label: string;
	icon: typeof Flashlight;
	/** Optional extra DOM layer rendered inside the prediction while a suggestion is live. */
	layer?: Component<GlowLayerProps>;
}

export const glowOptions: readonly GlowEffect[] = [
	{ value: 'torch', label: 'Torch', icon: Flashlight },
	{ value: 'candle', label: 'Candle', icon: Flame },
	{ value: 'lightning', label: 'Bolt', icon: Zap },
	{ value: 'aurora', label: 'Aurora', icon: Orbit },
	{ value: 'plasma', label: 'Plasma', icon: Atom },
	{ value: 'prism', label: 'Prism', icon: Rainbow },
	{ value: 'ember', label: 'Ember', icon: Sparkles },
	{ value: 'neon', label: 'Neon', icon: Asterisk },
	{ value: 'nebula', label: 'Nebula', icon: Wind },
	{ value: 'smoke', label: 'Smoke', icon: CloudFog },
	{ value: 'solar', label: 'Solar', icon: Sun },
	{ value: 'holo', label: 'Holo', icon: Gem },
	{ value: 'blackhole', label: 'Blackhole', icon: Eclipse },
	{ value: 'flame', label: 'Flame', icon: FlameKindling },
	{ value: 'matrix', label: 'Matrix', icon: Binary, layer: MatrixRain },
	{ value: 'snow', label: 'Snow', icon: Snowflake },
	{ value: 'toxic', label: 'Toxic', icon: Radiation },
	{ value: 'vortex', label: 'Vortex', icon: Tornado },
	{ value: 'bubblegum', label: 'Bubble Gum', icon: Candy },
	{ value: 'optic', label: 'Optic', icon: Aperture },
	{ value: 'biolume', label: 'Biolume', icon: Waves },
	{ value: 'ocean', label: 'Ocean', icon: Droplets },
	{ value: 'horror', label: 'Horror', icon: Ghost },
	{ value: 'heart', label: 'Heart', icon: HeartPulse },
	{ value: 'liquidglass', label: 'Liquid Glass', icon: Blend },
	{ value: 'android', label: 'Android', icon: Bot },
	{ value: 'fontshift', label: 'Font Shift', icon: Type },
	{ value: 'rorschach', label: 'Rorschach', icon: VenetianMask },
	{ value: 'diffusion', label: 'Diffusion', icon: ScanEye },
	{ value: 'chromabloom', label: 'Chroma Bloom', icon: SwatchBook },
	{ value: 'infrared', label: 'Infrared', icon: Activity },
	{ value: 'staged', label: 'Staged', icon: Clapperboard },
	{ value: 'blueprint', label: 'Blueprint', icon: ScanText },
	{ value: 'spoiler', label: 'Spoiler', icon: ScanEye },
	{ value: 'ghosttext', label: 'Ghost Text', icon: Ghost },
	{ value: 'drift', label: 'Drift', icon: Wind },
	{ value: 'art', label: 'Art', icon: Palette },
	{ value: 'scratch', label: 'Scratch', icon: Eraser },
	{ value: 'kaleidoscope', label: 'Kaleidoscope', icon: Shapes, layer: Kaleidoscope }
];

export type GlowOption = GlowEffect;

export function glowLayer(glow: GlowVariant): Component<GlowLayerProps> | undefined {
	return glowOptions.find((option) => option.value === glow)?.layer;
}
