#!/usr/bin/env node
// scripts/pack-smoke.mjs
//
// End-to-end packaging smoke test (workstream W5). Proves the tarball a consumer would install
// actually works — not just that `svelte-package` emitted files. Steps:
//
//   1. `npm pack` the repo -> tarball.
//   2. Assert dist/effects/<name>/index.js exists inside the tarball for all 39 effects.
//   3. NEGATIVE: the tarball ships no src/, no demo settings, no server proxy, no *.test.*, no qa/.
//   4. `npm run package` was assumed already; here we re-run `publint` on the tarball -> 0 errors.
//   5. Install the tarball into a throwaway vite + @sveltejs/vite-plugin-svelte project.
//   6. (a) SPA build importing ONLY '@ui4ai/light-input/effects/aurora' -> the emitted CSS contains
//          'aurora-' AND core anatomy (e.g. '.torch-haze'), and NOT 'kaleidoscope' or 'matrix-code'.
//          Record the single-effect CSS size (minified by vite) and gate it against a real budget.
//   (b) SSR build importing { GhostInput } and svelte/server render() -> executes under node and
//       emits the field/input markup (proves server-render safety + core.css side-effect handling).
//
// Runs entirely offline against the local npm cache; target runtime < 2 min.
//
// Usage: node scripts/pack-smoke.mjs   (or: npm run pack-smoke)

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PKG_NAME = '@ui4ai/light-input';

// ── Single-effect CSS budget (measured, not guessed) ─────────────────────────────────────────
// core anatomy (~31kB source) + aurora skin (~3.3kB source), minified by vite. Measured on the
// current tree at ~24kB; the cap leaves headroom for skin tweaks without silently regressing the
// "install one effect" promise. Metric: bytes of the single emitted .css asset from a vite SPA
// build (minified, not gzipped).
const AURORA_CSS_BUDGET_BYTES = 32_000;

const EXPECTED_EFFECTS = [
	'torch', 'candle', 'lightning', 'aurora', 'plasma', 'prism', 'ember', 'neon', 'nebula', 'smoke',
	'solar', 'holo', 'blackhole', 'flame', 'matrix', 'snow', 'toxic', 'vortex', 'bubblegum', 'optic',
	'biolume', 'ocean', 'horror', 'heart', 'liquidglass', 'android', 'fontshift', 'rorschach',
	'diffusion', 'chromabloom', 'infrared', 'staged', 'blueprint', 'spoiler', 'ghosttext', 'drift',
	'art', 'scratch', 'kaleidoscope'
];

const failures = [];
function check(label, ok, detail = '') {
	if (ok) {
		console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
	} else {
		console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
		failures.push(label);
	}
}

function run(cmd, args, opts = {}) {
	return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function findCssAssets(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...findCssAssets(full));
		else if (entry.name.endsWith('.css')) out.push(full);
	}
	return out;
}

const workRoot = mkdtempSync(path.join(tmpdir(), 'light-input-pack-'));
let tarballPath;

try {
	// ── 1. npm pack ──────────────────────────────────────────────────────────────────────────
	console.log('[pack-smoke] 1. npm pack');
	const packJson = run('npm', ['pack', '--json', '--pack-destination', workRoot], { cwd: REPO });
	const packInfo = JSON.parse(packJson);
	tarballPath = path.join(workRoot, packInfo[0].filename);
	console.log(`  tarball: ${path.basename(tarballPath)} (${(packInfo[0].size / 1024).toFixed(0)} kB, ${packInfo[0].entryCount} files)`);

	// ── 2 & 3. Inspect tarball contents (positive + negative) ─────────────────────────────────
	console.log('[pack-smoke] 2/3. tarball contents');
	const listing = run('tar', ['-tzf', tarballPath]).split('\n').filter(Boolean);
	// npm tarballs prefix every path with 'package/'.
	const paths = listing.map((p) => p.replace(/^package\//, ''));

	const missingEntries = EXPECTED_EFFECTS.filter(
		(name) => !paths.includes(`dist/effects/${name}/index.js`)
	);
	check('dist/effects/<name>/index.js present for all 39', missingEntries.length === 0,
		missingEntries.length ? `missing: ${missingEntries.join(', ')}` : '39/39');

	check('core.css shipped', paths.includes('dist/effects/core.css'));
	check('root entry + types shipped',
		paths.includes('dist/index.js') && paths.includes('dist/index.d.ts'));
	check('registry entry shipped', paths.includes('dist/effects/index.js'));

	const forbidden = [
		{ label: 'no src/ tree', re: /^src\// },
		{ label: 'no *.test.* files', re: /\.test\./ },
		{ label: 'no *.spec.* files', re: /\.spec\./ },
		{ label: 'no __fixtures__', re: /__fixtures__/ },
		{ label: 'no testkit helper', re: /(^|\/)testkit\./ },
		{ label: 'no demo settings', re: /(^|\/)(settings|demo-settings)\.(js|ts|d\.ts)$/ },
		{ label: 'no server proxy', re: /(^|\/)server\// },
		{ label: 'no qa/', re: /(^|\/)qa\// },
		{ label: 'no routes/', re: /(^|\/)routes\// },
		{ label: 'no .svelte-kit', re: /\.svelte-kit/ }
	];
	for (const { label, re } of forbidden) {
		const hits = paths.filter((p) => re.test(p));
		check(label, hits.length === 0, hits.length ? `found: ${hits.slice(0, 3).join(', ')}` : '');
	}

	// ── 4. publint on the tarball ─────────────────────────────────────────────────────────────
	console.log('[pack-smoke] 4. publint');
	let publintOut = '';
	let publintOk = true;
	try {
		publintOut = run('npx', ['publint', 'run', tarballPath], { cwd: REPO });
	} catch (err) {
		publintOk = false;
		publintOut = `${err.stdout || ''}${err.stderr || ''}`;
	}
	check('publint 0 errors', publintOk && /All good!/.test(publintOut),
		publintOk ? '' : publintOut.split('\n').filter((l) => /error|Error/.test(l)).slice(0, 3).join(' | '));

	// ── 5. Throwaway consumer project ─────────────────────────────────────────────────────────
	console.log('[pack-smoke] 5. install tarball into throwaway vite+svelte project');
	const proj = path.join(workRoot, 'consumer');
	mkdirSync(path.join(proj, 'src'), { recursive: true });

	writeFileSync(path.join(proj, 'package.json'), JSON.stringify({
		name: 'light-input-consumer',
		private: true,
		type: 'module',
		version: '0.0.0'
	}, null, 2));

	// Resolve svelte + vite + plugin from the repo's own node_modules so the install stays offline
	// and fast; the consumer still resolves the tarball's exports map for '@ui4ai/light-input/*'.
	const svelteDir = path.join(REPO, 'node_modules', 'svelte');
	const viteDir = path.join(REPO, 'node_modules', 'vite');
	const pluginDir = path.join(REPO, 'node_modules', '@sveltejs', 'vite-plugin-svelte');
	run('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline', '--no-save',
		tarballPath, svelteDir, viteDir, pluginDir], { cwd: proj });

	// Confirm the exports map resolves the per-effect subpath the way a consumer imports it.
	const resolved = run('node', ['-e',
		`import('node:module').then(async ({ createRequire }) => {` +
		`const r = createRequire(process.argv[1]);` +
		`console.log(r.resolve('${PKG_NAME}/effects/aurora'));` +
		`});`, path.join(proj, 'package.json')], { cwd: proj }).trim();
	check('exports map resolves @ui4ai/light-input/effects/aurora',
		resolved.includes(path.join('dist', 'effects', 'aurora', 'index.js')),
		path.relative(proj, resolved));

	// vite config shared by both builds. ssr.noExternal forces the package to be bundled (and thus
	// GhostInput.svelte compiled by the plugin) instead of left as an external .svelte require that
	// node cannot load.
	writeFileSync(path.join(proj, 'vite.config.js'),
		`import { defineConfig } from 'vite';\n` +
		`import { svelte } from '@sveltejs/vite-plugin-svelte';\n` +
		`export default defineConfig({\n` +
		`  plugins: [svelte({ compilerOptions: { runes: true } })],\n` +
		`  ssr: { noExternal: ['${PKG_NAME}'] },\n` +
		`  logLevel: 'warn'\n` +
		`});\n`
	);
	writeFileSync(path.join(proj, 'svelte.config.js'),
		`import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';\nexport default { preprocess: vitePreprocess() };\n`
	);

	// ── 6a. Single-effect CSS build ───────────────────────────────────────────────────────────
	// A plain vite SPA build (index.html -> entry that imports ONLY effects/aurora). We import the
	// default binding and reference it — the documented usage (`<GhostInput effect={aurora} />`) —
	// so tree-shaking keeps the module and its side-effect CSS (the package declares
	// sideEffects:["**/*.css"], which marks the JS entry itself shakeable, so a *bare* import with
	// no used binding could legitimately be dropped; consumers always use the binding).
	console.log('[pack-smoke] 6a. single-effect CSS isolation (aurora)');
	writeFileSync(path.join(proj, 'src', 'aurora-entry.js'),
		`import aurora from '${PKG_NAME}/effects/aurora';\n` +
		`document.body.dataset.aurora = aurora.meta.name;\n`
	);
	writeFileSync(path.join(proj, 'index.html'),
		`<!doctype html><html><head></head><body><script type="module" src="/src/aurora-entry.js"></script></body></html>\n`
	);
	run('npx', ['vite', 'build', '--outDir', 'dist-aurora', '--config', 'vite.config.js'], {
		cwd: proj
	});
	const auroraCss = findCssAssets(path.join(proj, 'dist-aurora'))
		.map((f) => ({ file: f, css: readFileSync(f, 'utf8') }));
	const auroraCombined = auroraCss.map((c) => c.css).join('\n');
	const auroraBytes = Buffer.byteLength(auroraCombined, 'utf8');

	check('emitted CSS contains aurora skin (aurora-)', /aurora-/.test(auroraCombined));
	check('emitted CSS contains core anatomy (.torch-haze)', /\.torch-haze/.test(auroraCombined));
	check('emitted CSS excludes kaleidoscope', !/kaleidoscope/.test(auroraCombined));
	check('emitted CSS excludes matrix-code', !/matrix-code/.test(auroraCombined));
	check(`single-effect CSS within budget (${AURORA_CSS_BUDGET_BYTES} bytes)`,
		auroraBytes > 0 && auroraBytes <= AURORA_CSS_BUDGET_BYTES,
		`${auroraBytes} bytes (minified)`);

	// ── 6b. SSR render ────────────────────────────────────────────────────────────────────────
	console.log('[pack-smoke] 6b. SSR render of GhostInput');
	writeFileSync(path.join(proj, 'src', 'ssr-entry.js'),
		`import { render } from 'svelte/server';\n` +
		`import { GhostInput } from '${PKG_NAME}';\n` +
		`const { html } = render(GhostInput, { props: { placeholder: 'ssr' } });\n` +
		`process.stdout.write(html);\n`
	);
	run('npx', ['vite', 'build', '--ssr', 'src/ssr-entry.js', '--outDir', 'dist-ssr',
		'--config', 'vite.config.js'], { cwd: proj });
	const ssrBundle = findCssAssets(path.join(proj, 'dist-ssr')); // css emitted alongside is fine
	const ssrEntryOut = path.join(proj, 'dist-ssr', 'ssr-entry.js');
	const ssrHtml = run('node', [ssrEntryOut], { cwd: proj });
	check('SSR render emits the field anatomy', /class="[^"]*field/.test(ssrHtml) && /ghost-input/.test(ssrHtml),
		`${ssrHtml.length} chars of html`);
	void ssrBundle;

	// ── summary ────────────────────────────────────────────────────────────────────────────────
	console.log('');
	if (failures.length) {
		console.error(`[pack-smoke] FAILED: ${failures.length} assertion(s):\n  - ${failures.join('\n  - ')}`);
		process.exitCode = 1;
	} else {
		console.log('[pack-smoke] OK: all assertions passed.');
	}
} catch (err) {
	console.error('[pack-smoke] ERROR:', err.message);
	if (err.stdout) console.error(String(err.stdout).slice(-2000));
	if (err.stderr) console.error(String(err.stderr).slice(-2000));
	process.exitCode = 1;
} finally {
	try {
		rmSync(workRoot, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
	// Remove the tarball npm pack may have dropped in the repo root as a side effect.
	try {
		for (const f of readdirSync(REPO)) {
			if (/^ui4ai-light-input-.*\.tgz$/.test(f)) rmSync(path.join(REPO, f), { force: true });
		}
	} catch {
		/* best effort */
	}
}
