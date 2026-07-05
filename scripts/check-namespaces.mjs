#!/usr/bin/env node
// scripts/check-namespaces.mjs
//
// NAMESPACE GUARD for the @ui4ai/light-input effect CSS bundle (workstream W3).
//
// Every effect CSS file under src/lib/effects/ is concatenated into ONE stylesheet at runtime
// (effects/index.css @imports core.css + all modules; a bundler inlines them into a single
// document). Two page-global namespaces must therefore be collision-free across the WHOLE
// bundle, or effects silently corrupt each other:
//
//   (a) @keyframes names   — a duplicate name means the LAST definition wins for BOTH effects
//                            (CSS keyframes are global; there is no scoping). Reference by name
//                            (animation / --*-motion) then resolves to the wrong animation.
//   (b) @property names    — re-registering the same custom property with a different syntax /
//                            initial-value is a global redefinition; the last @property wins and
//                            changes how that property animates for every effect that reads it.
//
// Custom PROPERTY names (plain `--x` decls) are deliberately NOT required to be globally unique:
// every module rule is gated on `.field[data-glow='<name>']`, and only one data-glow is active on
// a field at a time, so `--warp-a` in toxic and `--warp-a` in another module never coexist on the
// same element (sdk-critique corrections[5]). We still COLLECT and report them (stats + a check
// that no private var collides with a documented contract var — informational).
//
// Usage:
//   node scripts/check-namespaces.mjs [--json] [--quiet]
//
// Exit code: 0 if @keyframes and @property are each globally unique; 1 on any collision.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import postcss from 'postcss';

const EFFECTS_DIR = path.resolve(process.cwd(), 'src/lib/effects');

// The documented anatomy contract custom properties (from CONTRACT/core.css). A module's PRIVATE
// var colliding with one of these would be a real bug (it would override the contract token for
// that effect in an unintended place). This list mirrors the effect API surface; it is used only
// for an informational warning, never to fail the build (contract vars are SET by modules on
// purpose). Kept small and explicit.
const CONTRACT_VARS = new Set([
	'--ready-border', '--ready-shadow', '--field-wash',
	'--caret-gradient', '--caret-shadow',
	'--next-color', '--next-shadow', '--tail-color',
	'--layer-radius', '--layer-clip',
	'--effect-mask', '--effect-mask-soft',
	'--ghost-offset', '--scroll-runway',
	'--i', '--mut-speed', '--mut-strength',
	'--smoke-blend', '--aux-blend',
	'--torch-haze-motion', '--torch-core-motion'
]);
for (const layer of ['haze', 'body', 'core', 'flow', 'spark', 'smoke', 'aux', 'veil', 'hot']) {
	for (const knob of ['width', 'height', 'bg', 'size', 'filter', 'opacity', 'motion', 'mask', 'low', 'high', 'blend']) {
		CONTRACT_VARS.add(`--${layer}-${knob}`);
	}
}

/** Recursively list every .css file under a directory (sorted, repo-relative). */
async function listCssFiles(dir) {
	const out = [];
	async function walk(d) {
		const entries = await readdir(d, { withFileTypes: true });
		for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(d, e.name);
			if (e.isDirectory()) await walk(full);
			else if (e.isFile() && e.name.endsWith('.css')) out.push(full);
		}
	}
	await walk(dir);
	return out.map((f) => path.relative(process.cwd(), f)).sort();
}

/**
 * Parse one CSS file and pull the three name sets. Each returned entry keeps the source file so a
 * collision report can name both offenders. @keyframes / @property are walked with walkAtRules
 * (which descends into @media etc.), custom-property declarations with walkDecls.
 */
async function scanFile(file) {
	const css = await readFile(file, 'utf8');
	const root = postcss.parse(css, { from: file });
	const keyframes = [];
	const properties = [];
	const customProps = new Set();

	root.walkAtRules((rule) => {
		const name = rule.name.toLowerCase();
		// Vendor-prefixed keyframes count too (-webkit-keyframes registers the SAME global name).
		if (name === 'keyframes' || name.endsWith('-keyframes')) {
			keyframes.push(rule.params.trim());
		} else if (name === 'property') {
			properties.push(rule.params.trim());
		}
	});
	root.walkDecls((decl) => {
		if (decl.prop.startsWith('--')) customProps.add(decl.prop);
	});

	return { file, keyframes, properties, customProps: [...customProps] };
}

/**
 * Build a name -> [files...] index from per-file scans, projecting each scan through `pick`.
 * A name mapped to >1 DISTINCT file (or appearing >1 time in a single file) is a collision.
 */
function indexNames(scans, pick) {
	const index = new Map();
	for (const scan of scans) {
		for (const name of pick(scan)) {
			if (!index.has(name)) index.set(name, []);
			index.get(name).push(scan.file);
		}
	}
	return index;
}

/** Collisions = names whose occurrence list spans more than one definition. */
function collisionsOf(index) {
	const collisions = [];
	for (const [name, files] of index) {
		if (files.length > 1) collisions.push({ name, files });
	}
	collisions.sort((a, b) => a.name.localeCompare(b.name));
	return collisions;
}

async function main() {
	const argv = process.argv.slice(2);
	const asJson = argv.includes('--json');
	const quiet = argv.includes('--quiet');
	const log = (...a) => { if (!quiet) console.log(...a); };

	const files = await listCssFiles(EFFECTS_DIR);
	const scans = await Promise.all(files.map(scanFile));

	const kfIndex = indexNames(scans, (s) => s.keyframes);
	const propIndex = indexNames(scans, (s) => s.properties);
	const customIndex = indexNames(scans, (s) => s.customProps);

	const kfCollisions = collisionsOf(kfIndex);
	const propCollisions = collisionsOf(propIndex);

	// Informational only: private vars colliding with a documented contract var name is expected
	// (modules SET contract tokens); we surface the count but never fail on it.
	const contractVarNames = [...customIndex.keys()].filter((n) => CONTRACT_VARS.has(n));

	// Count total keyframe/@property definitions (with duplicates) vs distinct names.
	const totalKeyframes = scans.reduce((n, s) => n + s.keyframes.length, 0);
	const totalProps = scans.reduce((n, s) => n + s.properties.length, 0);

	const stats = {
		files: files.length,
		keyframes: { total: totalKeyframes, distinct: kfIndex.size, collisions: kfCollisions.length },
		property: { total: totalProps, distinct: propIndex.size, collisions: propCollisions.length },
		customProperties: { distinctNames: customIndex.size, contractVarsSet: contractVarNames.length },
		suffixV2: {
			keyframes: [...kfIndex.keys()].filter((n) => /-v2$/.test(n)).length,
			property: [...propIndex.keys()].filter((n) => /-v2$/.test(n)).length,
			customProperties: [...customIndex.keys()].filter((n) => /-v2$/.test(n)).length
		}
	};

	if (asJson) {
		console.log(JSON.stringify({
			stats,
			keyframeCollisions: kfCollisions,
			propertyCollisions: propCollisions
		}, null, 2));
	} else {
		log('=== check-namespaces: effect CSS namespace audit ===');
		log(`files scanned: ${stats.files}`);
		log('');
		log(`@keyframes:  ${stats.keyframes.total} definitions, ${stats.keyframes.distinct} distinct name(s), ${stats.keyframes.collisions} collision(s)`);
		log(`@property:   ${stats.property.total} registration(s), ${stats.property.distinct} distinct name(s), ${stats.property.collisions} collision(s)`);
		log(`custom props: ${stats.customProperties.distinctNames} distinct name(s) (${stats.customProperties.contractVarsSet} are documented contract tokens; overlaps across modules are legal)`);
		log(`'-v2' suffix remaining: ${stats.suffixV2.keyframes} keyframe / ${stats.suffixV2.property} @property / ${stats.suffixV2.customProperties} custom-prop name(s)`);
		log('');

		if (kfCollisions.length) {
			log(`FAIL: ${kfCollisions.length} @keyframes name collision(s) (global -> last definition wins):`);
			for (const c of kfCollisions) log(`  @keyframes ${c.name}  <-  ${c.files.join(', ')}`);
			log('');
		}
		if (propCollisions.length) {
			log(`FAIL: ${propCollisions.length} @property name collision(s) (global registration -> last wins):`);
			for (const c of propCollisions) log(`  @property ${c.name}  <-  ${c.files.join(', ')}`);
			log('');
		}
	}

	const failed = kfCollisions.length > 0 || propCollisions.length > 0;
	if (failed) {
		if (!asJson) console.error('[check-namespaces] RESULT: COLLISIONS FOUND (global @keyframes/@property must be unique)');
		process.exit(1);
	}
	if (!asJson) log('[check-namespaces] RESULT: OK (global @keyframes + @property names are unique)');
}

main().catch((err) => {
	console.error('[check-namespaces] fatal:', err);
	process.exit(2);
});
