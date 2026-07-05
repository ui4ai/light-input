// Demo-only glow icon map. Icons live here (not in the package) so consumers never inherit a
// @lucide/svelte dependency. Keyed by effect name (data-glow / GlowVariant), assignments ported
// verbatim from the pre-SDK registry.
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
import type { GlowVariant } from '@ui4ai/light-input';

export const glowIcons: Record<GlowVariant, Component> = {
	torch: Flashlight,
	candle: Flame,
	lightning: Zap,
	aurora: Orbit,
	plasma: Atom,
	prism: Rainbow,
	ember: Sparkles,
	neon: Asterisk,
	nebula: Wind,
	smoke: CloudFog,
	solar: Sun,
	holo: Gem,
	blackhole: Eclipse,
	flame: FlameKindling,
	matrix: Binary,
	snow: Snowflake,
	toxic: Radiation,
	vortex: Tornado,
	bubblegum: Candy,
	optic: Aperture,
	biolume: Waves,
	ocean: Droplets,
	horror: Ghost,
	heart: HeartPulse,
	liquidglass: Blend,
	android: Bot,
	fontshift: Type,
	rorschach: VenetianMask,
	diffusion: ScanEye,
	chromabloom: SwatchBook,
	infrared: Activity,
	staged: Clapperboard,
	blueprint: ScanText,
	spoiler: ScanEye,
	ghosttext: Ghost,
	drift: Wind,
	art: Palette,
	scratch: Eraser,
	kaleidoscope: Shapes
};

export function glowIcon(glow: GlowVariant): Component {
	return glowIcons[glow] ?? Flashlight;
}
