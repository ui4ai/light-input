import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOW_VARIANTS } from '@ui4ai/light-input';

// Dogfood guard: the demo consumes '@ui4ai/light-input' via a svelte.config alias, which resolves
// paths the published exports map does NOT (e.g. deep imports like effects/matrix/digits). This
// test proves every '@ui4ai/light-input[...]' specifier the demo imports would ALSO resolve through
// the exports map after publish — so a green dev/build can never mask a broken published import.
//
// Exports map (package.json): '.', './effects', './effects/*', './core.css', './package.json'.
// './effects/*' maps to ./dist/effects/*/index.js, so exactly one path segment (a real effect
// folder) may follow 'effects/' — 'effects/matrix/digits' would resolve to a nonexistent file.

const PKG = '@ui4ai/light-input';
const ROUTES_DIR = join(process.cwd(), 'src/routes');

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else if (/\.(svelte|ts)$/u.test(entry)) out.push(full);
	}
	return out;
}

/** Extract every module specifier that starts with the package name from a source file. */
function packageSpecifiers(source: string): string[] {
	const specs = new Set<string>();
	// import ... from '<spec>'   and   import '<spec>'   and   import('<spec>')
	const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source))) {
		if (m[1] === PKG || m[1].startsWith(`${PKG}/`)) specs.add(m[1]);
	}
	return [...specs];
}

/** Is this specifier resolvable through the published exports map? */
function isExportedSpecifier(spec: string): boolean {
	if (spec === PKG) return true; // '.'
	const sub = spec.slice(PKG.length + 1); // strip '@ui4ai/light-input/'
	if (sub === 'core.css') return true;
	if (sub === 'package.json') return true;
	if (sub === 'effects') return true; // the registry
	if (sub.startsWith('effects/')) {
		const rest = sub.slice('effects/'.length);
		// './effects/*' allows exactly one segment, and it must be a real effect.
		return !rest.includes('/') && (GLOW_VARIANTS as readonly string[]).includes(rest);
	}
	return false;
}

describe('demo package imports stay within the exports map', () => {
	const files = walk(ROUTES_DIR);

	it('scans a non-trivial number of demo source files', () => {
		expect(files.length).toBeGreaterThan(3);
	});

	it('every @ui4ai/light-input import resolves through the exports map (no forbidden deep imports)', () => {
		const violations: { file: string; spec: string }[] = [];
		for (const file of files) {
			const source = readFileSync(file, 'utf8');
			for (const spec of packageSpecifiers(source)) {
				if (!isExportedSpecifier(spec)) {
					violations.push({ file: file.replace(`${process.cwd()}/`, ''), spec });
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it('actually observes the demo importing the package (guard is not vacuous)', () => {
		const allSpecs = files.flatMap((file) => packageSpecifiers(readFileSync(file, 'utf8')));
		expect(allSpecs).toContain(PKG);
		expect(allSpecs).toContain(`${PKG}/effects`);
	});
});
