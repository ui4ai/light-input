<script lang="ts">
	interface Props {
		suggestion: string;
		lightFlow: boolean;
	}

	// Layer components share one contract; kaleidoscope's shards are static.
	let { suggestion, lightFlow }: Props = $props();

	const shards = [
		{ delay: 0, hue: 326, rotate: -18, scale: 0.92, x: -0.42, y: -1.02 },
		{ delay: 90, hue: 38, rotate: 22, scale: 0.76, x: 0.86, y: -1.24 },
		{ delay: 170, hue: 186, rotate: -44, scale: 0.68, x: 1.92, y: -0.78 },
		{ delay: 260, hue: 262, rotate: 31, scale: 0.86, x: 3.05, y: -1.16 },
		{ delay: 340, hue: 128, rotate: -26, scale: 0.72, x: 4.16, y: -0.68 },
		{ delay: 430, hue: 12, rotate: 47, scale: 0.82, x: 5.2, y: -1.28 },
		{ delay: 520, hue: 212, rotate: -12, scale: 0.94, x: 6.32, y: -0.86 },
		{ delay: 610, hue: 298, rotate: 38, scale: 0.7, x: 7.42, y: -1.18 },
		{ delay: 700, hue: 72, rotate: -36, scale: 0.88, x: 8.55, y: -0.74 },
		{ delay: 790, hue: 172, rotate: 15, scale: 0.78, x: 9.58, y: -1.12 },
		{ delay: 880, hue: 334, rotate: -53, scale: 0.66, x: 10.64, y: -0.8 },
		{ delay: 970, hue: 52, rotate: 26, scale: 0.84, x: 11.64, y: -1.2 }
	];
</script>

<span class="kaleidoscope-layer" data-testid="kaleidoscope-layer" aria-hidden="true"
	>{#each shards as shard, index (index)}<span
			class="kaleidoscope-shard"
			style={`--kx:${shard.x}em;--ky:${shard.y}em;--kr:${shard.rotate}deg;--ks:${shard.scale};--kd:${shard.delay}ms;--kh:${shard.hue}`}
		></span
	>{/each}</span
>
