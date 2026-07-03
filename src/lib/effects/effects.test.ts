import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOW_VARIANTS } from '../autocomplete';
import { glowOptions, glowLayer } from './index';

const PRESET_CSS_FILES = [
	'src/lib/effects/core.css',
	'src/lib/effects/legacy.css',
	'src/lib/effects/blackhole/index.css',
	'src/lib/effects/flame/index.css',
	'src/lib/effects/matrix/index.css',
	'src/lib/effects/snow/index.css',
	'src/lib/effects/toxic/index.css',
	'src/lib/effects/vortex/index.css',
	'src/lib/effects/bubblegum/index.css',
	'src/lib/effects/optic/index.css',
	'src/lib/effects/biolume/index.css',
	'src/lib/effects/ocean/index.css',
	'src/lib/effects/horror/index.css',
	'src/lib/effects/heart/index.css',
	'src/lib/effects/liquidglass/index.css',
	'src/lib/effects/android/index.css',
	'src/lib/effects/fontshift/index.css',
	'src/lib/effects/rorschach/index.css',
	'src/lib/effects/diffusion/index.css',
	'src/lib/effects/chromabloom/index.css',
	'src/lib/effects/infrared/index.css',
	'src/lib/effects/staged/index.css'
];

function readPresetCss(): string {
	return PRESET_CSS_FILES.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
}

describe('glow inventory', () => {
	const beforeBlackholeVariants = GLOW_VARIANTS.slice(0, GLOW_VARIANTS.indexOf('blackhole'));

	it('keeps UI options in sync with supported glow variants', () => {
		expect(glowOptions.map((option) => option.value)).toEqual([...GLOW_VARIANTS]);
	});

	it('includes the refined hero effects and new creative effects', () => {
		expect(GLOW_VARIANTS).toEqual(
			expect.arrayContaining([
				'blackhole',
				'flame',
				'matrix',
				'snow',
				'toxic',
				'vortex',
				'bubblegum',
				'optic',
				'biolume',
				'ocean',
				'horror',
				'heart',
				'liquidglass',
				'android',
				'fontshift',
				'rorschach',
				'diffusion',
				'chromabloom',
				'infrared',
				'staged',
				'blueprint',
				'spoiler',
				'ghosttext',
				'drift',
				'art',
				'scratch',
				'kaleidoscope'
			])
		);
	});

	it('keeps the final glow count intentional', () => {
		expect(GLOW_VARIANTS).toHaveLength(39);
	});

	it('keeps legacy presets out of clipped special-effect layer rules', () => {
		const css = readPresetCss();
		const edgePolishBlock = css.match(/\/\* Edge polish[\s\S]*?\n\}/u)?.[0] ?? '';

		expect(edgePolishBlock).toContain(".field[data-glow='blackhole']");

		for (const variant of beforeBlackholeVariants) {
			expect(edgePolishBlock).not.toContain(`data-glow='${variant}'`);

			const selector = `.field[data-glow='${variant}'] {`;
			const variantBlocks: string[] = [];
			let searchFrom = 0;

			while (searchFrom < css.length) {
				const start = css.indexOf(selector, searchFrom);
				if (start === -1) break;

				const blockStart = start + selector.length;
				const blockEnd = css.indexOf('\n}', blockStart);
				if (blockEnd === -1) break;

				variantBlocks.push(css.slice(blockStart, blockEnd));
				searchFrom = blockEnd + 2;
			}

			const maskOrClipLeaks = variantBlocks.flatMap((block) => {
				return (
					block.match(
						/--(?:layer-(?:radius|clip)|(?:haze|body|core|flow|spark|smoke|aux)-mask)\s*:\s*(?!none\b)[^;]+;/gu
					) ?? []
				);
			});

			expect(maskOrClipLeaks).toEqual([]);
		}
	});

	it('keeps Matrix binary code in one live DOM layer instead of CSS image tiles', () => {
		const css = readPresetCss();
		const rain = readFileSync(join(process.cwd(), 'src/lib/effects/matrix/MatrixRain.svelte'), 'utf8');

		expect(css).not.toContain('matrix-code-tile');
		expect(css).not.toContain('matrix-head-tile');
		expect(rain).toContain('data-testid="matrix-code-layer"');
	});

	it('ships custom layers for the newest cinematic effects', () => {
		const css = readPresetCss();

		expect(css).toContain(".field[data-glow='spoiler']");
		expect(css).toContain('spoiler-noise-swim');
		expect(css).toContain(".field[data-glow='ghosttext']");
		expect(css).toContain('ghost-wisp-crawl');
		expect(css).toContain(".field[data-glow='drift']");
		expect(css).toContain('drift-smoke-sweep');
		expect(css).toContain(".field[data-glow='art']");
		expect(css).toContain('art-tail-blob');
		expect(css).toContain(".field[data-glow='scratch']");
		expect(css).toContain('scratch-foil-shimmer');
		expect(css).toContain(".field[data-glow='kaleidoscope']");
		expect(css).toContain('kaleidoscope-shard-orbit');
	});

	it('ships a dedicated DOM layer for the kaleidoscope effect', () => {
		const shards = readFileSync(
			join(process.cwd(), 'src/lib/effects/kaleidoscope/Kaleidoscope.svelte'),
			'utf8'
		);

		expect(glowLayer('kaleidoscope')).toBeDefined();
		expect(glowLayer('matrix')).toBeDefined();
		expect(shards).toContain('data-testid="kaleidoscope-layer"');
		expect(shards).toContain('class="kaleidoscope-shard"');
	});

	it('keeps custom thinking indicators available for cinematic variants', () => {
		const css = readPresetCss();
		const variants = [
			'blackhole',
			'matrix',
			'snow',
			'toxic',
			'vortex',
			'optic',
			'biolume',
			'ocean',
			'heart',
			'liquidglass',
			'fontshift',
			'rorschach',
			'chromabloom',
			'staged'
		];

		for (const variant of variants) {
			expect(css).toContain(`.field[data-state='waiting'][data-glow='${variant}']`);
			expect(css).not.toContain(
				`.stage[data-glow='${variant}'] .field[data-glow] .caret-origin-glow,\n`
			);
		}

		expect(css).toContain(".caret-origin-glow[data-mode='ready']");
		expect(css).toContain("[data-state='waiting'][data-loading-glow='field']");
	});
});

describe('env safety', () => {
	it('keeps local environment files out of git while allowing the example file', () => {
		const gitignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf8');

		expect(gitignore).toMatch(/^\.env$/m);
		expect(gitignore).toMatch(/^\.env\.\*$/m);
		expect(gitignore).toMatch(/^!\.env\.example$/m);
	});

	it('does not ship OpenRouter-looking keys in docs or examples', () => {
		const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

		expect(read('.env.example')).not.toMatch(/sk-or-v1-/u);
		expect(read('README.md')).not.toMatch(/sk-or-v1-/u);
	});
});
