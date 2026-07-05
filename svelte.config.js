import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const githubPages = process.env.LIGHT_INPUT_GITHUB_PAGES === 'true';
const githubPagesBase = githubPages ? '/light-input' : '';

/**
 * SvelteKit configuration.
 *
 * `svelte-package` (the SDK build) and `svelte-check` read this file directly — the kit config
 * used to live inline in the `sveltekit()` vite plugin, which those tools never see. Keeping it
 * here is what makes `npm run package` work.
 *
 * The demo app dogfoods the published package: `kit.alias` maps the `@ui4ai/light-input`
 * specifiers to `src/lib` so dev/build resolve from source, exactly as external consumers resolve
 * them through the exports map. Prefix aliasing means `@ui4ai/light-input/effects/matrix` →
 * `src/lib/effects/matrix/index.ts` as well.
 *
 * The former runes-forcing `compilerOptions.runes` function was dropped: every component under
 * `src/lib` and `src/routes` already uses runes syntax, which svelte 5 auto-detects, so the
 * override is a no-op — and a function value is not portable to the tools that read this config.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: githubPages
			? adapterStatic({
					assets: 'build',
					pages: 'build',
					strict: false
				})
			: adapterAuto(),
		paths: {
			base: githubPagesBase
		},
		alias: {
			// More specific first: the published './core.css' subpath maps to dist/effects/core.css,
			// but the source lives at src/lib/effects/core.css, so the bare prefix alias below would
			// mis-resolve it to src/lib/core.css. This exact-key alias fixes the dev/docs story.
			'@ui4ai/light-input/core.css': 'src/lib/effects/core.css',
			'@ui4ai/light-input': 'src/lib'
		}
	}
};

export default config;
