import { sveltekit } from '@sveltejs/kit/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const libRoot = fileURLToPath(new URL('./src/lib', import.meta.url));

// Two test projects:
//   - "node": the pre-existing pure-TS + CSS-forensics suites. Runs in the node environment with
//     the full SvelteKit plugin so `$lib` / `$env` / `$app` resolve exactly as they did before a
//     vitest config existed (vitest previously auto-loaded vite.config.ts). It EXCLUDES the
//     browser-mounted component tests below.
//   - "dom": the GhostInput component + fixture tests. Runs in happy-dom with `resolve.conditions`
//     set to the browser build so `mount()` from 'svelte' resolves to the client runtime (the
//     server build throws lifecycle_function_unavailable). Uses the plain svelte() plugin (no
//     SvelteKit SSR machinery) plus a `$lib` alias.
export default defineConfig({
	test: {
		projects: [
			{
				extends: true,
				plugins: [sveltekit()],
				test: {
					name: 'node',
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.svelte.test.ts']
				}
			},
			{
				plugins: [svelte()],
				resolve: {
					conditions: ['browser'],
					alias: { $lib: libRoot }
				},
				test: {
					name: 'dom',
					environment: 'happy-dom',
					include: ['src/**/*.svelte.test.ts']
				}
			}
		]
	}
});
