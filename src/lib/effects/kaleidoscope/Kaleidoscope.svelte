<script lang="ts">
	interface Props {
		suggestion: string;
		lightFlow: boolean;
	}

	// Layer components share one contract; kaleidoscope's shards are static.
	let { suggestion, lightFlow }: Props = $props();

	const shards = [
		{ delay: 0, hue: 336, rotate: -14, scale: 0.9, x: -0.55, y: -0.58 },
		{ delay: 70, hue: 42, rotate: 26, scale: 0.72, x: 0.18, y: 0.5 },
		{ delay: 140, hue: 188, rotate: -38, scale: 0.85, x: 0.92, y: -0.68 },
		{ delay: 220, hue: 268, rotate: 18, scale: 0.66, x: 1.85, y: 0.42 },
		{ delay: 300, hue: 336, rotate: 44, scale: 0.78, x: 2.6, y: -0.6 },
		{ delay: 390, hue: 42, rotate: -24, scale: 0.6, x: 3.7, y: 0.52 },
		{ delay: 480, hue: 188, rotate: 12, scale: 0.82, x: 4.6, y: -0.66 },
		{ delay: 580, hue: 268, rotate: -46, scale: 0.58, x: 5.8, y: 0.46 },
		{ delay: 680, hue: 336, rotate: 30, scale: 0.7, x: 6.9, y: -0.62 },
		{ delay: 780, hue: 42, rotate: -16, scale: 0.55, x: 8.15, y: 0.5 },
		{ delay: 880, hue: 188, rotate: 40, scale: 0.64, x: 9.4, y: -0.55 },
		{ delay: 980, hue: 268, rotate: -32, scale: 0.56, x: 10.7, y: 0.44 }
	];
</script>

<span class="kaleidoscope-layer" data-testid="kaleidoscope-layer" aria-hidden="true"
	>{#each shards as shard, index (index)}<span
			class="kaleidoscope-shard"
			style={`--kx:${shard.x}em;--ky:${shard.y}em;--kr:${shard.rotate}deg;--ks:${shard.scale};--kd:${shard.delay}ms;--kh:${shard.hue}`}
		></span
	>{/each}</span
>
