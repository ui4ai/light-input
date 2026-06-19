import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const githubPages = process.env.LIGHT_INPUT_GITHUB_PAGES === 'true';
const githubPagesBase = githubPages ? '/light-input' : '';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: githubPages
				? adapterStatic({
						assets: 'build',
						pages: 'build',
						strict: false
					})
				: adapterAuto(),
			paths: {
				base: githubPagesBase
			}
		})
	]
});
