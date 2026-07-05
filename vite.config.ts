import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Kit/adapter/alias configuration lives in svelte.config.js so that svelte-package and
// svelte-check (which do not load vite config) see it too. This file stays minimal.
export default defineConfig({
	plugins: [sveltekit()]
});
