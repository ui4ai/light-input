#!/usr/bin/env node
// scripts/strip-v2.mjs
//
// CODEMOD (workstream W3): remove the literal `-v2` suffix from every identifier in the effect
// CSS. The suffix was a migration marker on the redesigned modules' @keyframes names, @property
// registrations, and private custom properties; the SDK ships clean names (no backward compat).
//
// What it rewrites, in-place, across src/lib/effects/ ** / *.css:
//   * @keyframes <name>-v2                      (definition)
//   * animation / animation-name / --*-motion   (…-v2 references in shorthand values)
//   * @property --<name>-v2                      (registration)
//   * var(--<name>-v2) and --<name>-v2:          (custom-property references + declarations)
//   * comment mentions: `<name>-v2` and glob headers `<prefix>-*-v2`
//
// Mechanism — one token-boundary-aware regex, applied to the whole file text:
//
//     /-v2(?![A-Za-z0-9_-])/g
//
// i.e. strip `-v2` only when it is NOT followed by an identifier-continuation character
// ([A-Za-z0-9_-]). This makes it a suffix strip at the END of a CSS identifier token. Verified
// against the tree before running: every one of the (pre-run) 2581 `-v2` occurrences is
// token-terminal (followed by whitespace / ) , . : ; { or newline) — there are zero mid-token
// `-v2`, zero `-v2-` compounds, and zero `-v3`, so this transform is exact and reversible-free.
//
// Bare `<NAME> v2` design-doc banner headers (e.g. "ART v2 —") are NOT touched here — a space
// before `v2` is not part of an identifier. Those are reworded by the non-CSS sweep, not this
// codemod (it is scoped strictly to `-v2` identifier suffixes).
//
// Usage:
//   node scripts/strip-v2.mjs           # rewrite files in place
//   node scripts/strip-v2.mjs --check   # dry run: report counts, write nothing, exit 1 if any
//   node scripts/strip-v2.mjs --dir src/lib/effects   # override root (default: src/lib/effects)

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Strip `-v2` at an identifier boundary (not followed by an ident-continuation char).
const SUFFIX_RE = /-v2(?![A-Za-z0-9_-])/g;

function parseArgs(argv) {
	const args = { check: false, dir: 'src/lib/effects' };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--check') args.check = true;
		else if (argv[i] === '--dir') args.dir = argv[++i];
	}
	return args;
}

async function listCssFiles(dir) {
	const out = [];
	async function walk(d) {
		for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(d, e.name);
			if (e.isDirectory()) await walk(full);
			else if (e.isFile() && e.name.endsWith('.css')) out.push(full);
		}
	}
	await walk(dir);
	return out.sort();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const root = path.resolve(process.cwd(), args.dir);
	const files = await listCssFiles(root);

	let totalHits = 0;
	let filesChanged = 0;
	const perFile = [];

	for (const file of files) {
		const before = await readFile(file, 'utf8');
		const hits = (before.match(SUFFIX_RE) || []).length;
		if (hits === 0) continue;
		const after = before.replace(SUFFIX_RE, '');
		totalHits += hits;
		filesChanged++;
		perFile.push({ file: path.relative(process.cwd(), file), hits });
		if (!args.check) await writeFile(file, after, 'utf8');
	}

	const verb = args.check ? 'would strip' : 'stripped';
	for (const f of perFile) console.log(`  ${verb} ${String(f.hits).padStart(4)}  ${f.file}`);
	console.log(`[strip-v2] ${verb} ${totalHits} '-v2' suffix(es) across ${filesChanged} file(s) under ${args.dir}`);

	if (args.check && totalHits > 0) process.exit(1);
}

main().catch((err) => {
	console.error('[strip-v2] fatal:', err);
	process.exit(2);
});
