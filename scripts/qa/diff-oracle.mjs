#!/usr/bin/env node
// scripts/qa/diff-oracle.mjs
//
// Comparator for two style-oracle output directories (workstream W0). This is THE gate every
// later workstream runs: capture the oracle before a refactor, capture it after, diff -> must
// be empty. Prints per-combo -> per-node -> per-property differences and exits 1 on any diff.
//
// Diff dimensions handled:
//   - combos present in one dir but not the other (missing/extra baseline files)
//   - nodes present in one dump but absent in the other (presence flip)
//   - property value changes on a shared node
//
// Flags:
//   --normalize-names   apply the strip-'-v2' map to animation-name values on BOTH sides before
//                       comparing (so an un-normalized 'after' set still matches a baseline that
//                       was written normalized). The oracle already normalizes on write, so this
//                       is a belt-and-suspenders switch for W3's keyframe rename.
//   --allowlist <file>  JSON { "ignore": [ { combo?, node?, property? } ] }; any omitted field is
//                       a wildcard. Matching (combo,node,property) diffs are suppressed. Use ONLY
//                       for provably-acceptable residue — do NOT loosen the gate to hide a bug.
//   --max <n>           cap printed diff lines per combo (default 40).
//
// Usage:
//   node scripts/qa/diff-oracle.mjs <baselineDir> <candidateDir> [--normalize-names] \
//        [--allowlist qa/allowlist.json] [--max 40]
//   (dirs may point at either the run root, e.g. qa/baseline, or the .../oracle subdir)

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
	const args = {
		baseline: null,
		candidate: null,
		normalizeNames: false,
		allowlist: null,
		max: 40
	};
	const positional = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--normalize-names') args.normalizeNames = true;
		else if (a === '--allowlist') args.allowlist = argv[++i];
		else if (a === '--max') args.max = Number.parseInt(argv[++i], 10) || 40;
		else positional.push(a);
	}
	args.baseline = positional[0];
	args.candidate = positional[1];
	return args;
}

/** Resolve a dir to its oracle subdir if present, else itself. */
async function resolveOracleDir(dir) {
	const nested = path.join(dir, 'oracle');
	try {
		const s = await stat(nested);
		if (s.isDirectory()) return nested;
	} catch {
		/* not nested */
	}
	return dir;
}

// Mirror of drive.mjs stripV2 / stripV2Key: strip a trailing `-v2` from value tokens (at a
// token boundary) and from custom-property keys. Used by --normalize-names so an un-normalized
// candidate still matches a normalized baseline (belt-and-suspenders for W3's rename).
function stripV2Value(value) {
	if (typeof value !== 'string' || !value.includes('-v2')) return value;
	return value.replace(/-v2(?=[\s,]|$)/g, '');
}

function stripV2Key(key) {
	return key.endsWith('-v2') ? key.slice(0, -3) : key;
}

async function loadDir(dir) {
	const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
	const map = new Map();
	for (const f of files) {
		const combo = f.replace(/\.json$/, '');
		const raw = await readFile(path.join(dir, f), 'utf8');
		map.set(combo, JSON.parse(raw));
	}
	return map;
}

async function loadAllowlist(file) {
	if (!file) return [];
	const raw = await readFile(file, 'utf8');
	const parsed = JSON.parse(raw);
	return Array.isArray(parsed.ignore) ? parsed.ignore : [];
}

function isAllowed(allow, combo, node, property) {
	return allow.some(
		(rule) =>
			(rule.combo === undefined || rule.combo === combo) &&
			(rule.node === undefined || rule.node === node) &&
			(rule.property === undefined || rule.property === property)
	);
}

function normDump(dump, normalizeNames) {
	if (!normalizeNames || !dump) return dump;
	// Normalize each node's property map: strip -v2 from custom-property keys and all values.
	const out = {};
	for (const [node, props] of Object.entries(dump)) {
		if (!props) {
			out[node] = props;
			continue;
		}
		const np = {};
		for (const [prop, value] of Object.entries(props)) {
			np[stripV2Key(prop)] = stripV2Value(value);
		}
		out[node] = np;
	}
	return out;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.baseline || !args.candidate) {
		console.error(
			'usage: diff-oracle.mjs <baselineDir> <candidateDir> [--normalize-names] [--allowlist f] [--max n]'
		);
		process.exit(2);
	}

	const baseDir = await resolveOracleDir(path.resolve(args.baseline));
	const candDir = await resolveOracleDir(path.resolve(args.candidate));
	const allow = await loadAllowlist(args.allowlist);

	const base = await loadDir(baseDir);
	const cand = await loadDir(candDir);

	let totalDiffs = 0;
	let combosWithDiffs = 0;

	// Missing / extra combos.
	const allCombos = new Set([...base.keys(), ...cand.keys()]);
	for (const combo of [...allCombos].sort()) {
		const b = base.get(combo);
		const c = cand.get(combo);
		if (!b) {
			console.log(`\n### ${combo}: EXTRA in candidate (no baseline)`);
			totalDiffs++;
			combosWithDiffs++;
			continue;
		}
		if (!c) {
			console.log(`\n### ${combo}: MISSING from candidate`);
			totalDiffs++;
			combosWithDiffs++;
			continue;
		}

		const bn = normDump(b, args.normalizeNames);
		const cn = normDump(c, args.normalizeNames);

		const lines = [];
		const nodeKeys = new Set([...Object.keys(bn), ...Object.keys(cn)]);
		for (const node of [...nodeKeys].sort()) {
			const bp = bn[node];
			const cp = cn[node];
			// Presence flips (null vs object).
			if ((bp == null) !== (cp == null)) {
				if (isAllowed(allow, combo, node, undefined)) continue;
				lines.push(`  ${node}: presence ${bp == null ? 'absent' : 'present'} -> ${cp == null ? 'absent' : 'present'}`);
				continue;
			}
			if (bp == null && cp == null) continue;

			const propKeys = new Set([...Object.keys(bp), ...Object.keys(cp)]);
			for (const prop of [...propKeys].sort()) {
				const bv = bp[prop];
				const cv = cp[prop];
				if (bv !== cv) {
					if (isAllowed(allow, combo, node, prop)) continue;
					lines.push(`  ${node} .${prop}: "${bv}" -> "${cv}"`);
				}
			}
		}

		if (lines.length) {
			combosWithDiffs++;
			totalDiffs += lines.length;
			console.log(`\n### ${combo}: ${lines.length} diff(s)`);
			for (const l of lines.slice(0, args.max)) console.log(l);
			if (lines.length > args.max) console.log(`  ... (${lines.length - args.max} more)`);
		}
	}

	console.log(
		`\n[diff] baseline=${path.relative(process.cwd(), baseDir)} candidate=${path.relative(process.cwd(), candDir)}`
	);
	console.log(
		`[diff] ${base.size} vs ${cand.size} combos; ${combosWithDiffs} combos differ; ${totalDiffs} total diff(s)` +
			(allow.length ? ` (${allow.length} allowlist rule(s) applied)` : '')
	);

	if (totalDiffs > 0) {
		console.log('[diff] RESULT: DIFFERENCES FOUND');
		process.exit(1);
	}
	console.log('[diff] RESULT: CLEAN (zero diffs)');
}

main().catch((err) => {
	console.error('[diff] fatal:', err);
	process.exit(2);
});
