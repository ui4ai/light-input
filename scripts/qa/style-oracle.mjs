#!/usr/bin/env node
// scripts/qa/style-oracle.mjs
//
// The visual-identity STYLE ORACLE (workstream W0). For every effect in GLOW_VARIANTS (39) x
// theme {dark,light} x state {ready,waiting} = 156 combos, it drives the demo to that state in
// a frozen-animation snapshot and dumps getComputedStyle for the full anatomy node list —
// including pseudo-elements (.field::before/::after, .prediction::before/::after, glyph pseudos)
// — writing one deterministic JSON per combo to <out>/oracle/<effect>-<theme>-<state>.json.
//
// This JSON baseline is the gate that every later workstream (W1..W8) must diff clean against
// while ~29k lines of CSS move around. See scripts/qa/diff-oracle.mjs for the comparator.
//
// Determinism protocol (mandated by sdk-critique.json fatalFlaws[1]) lives in drive.mjs:
//   getAnimations({subtree:true}).pause() + currentTime=1200; setInterval stubbed to no-op so
//   MatrixRain's 92ms flips never fire; input scrollLeft forced to 0; two rAFs before reading.
// animation-* are dumped as LONGHANDS (shorthand skipped) and animation-name is normalized
// through the legacy suffix-strip map so a baseline captured before the W3 keyframe rename still
// diffs clean (the rename has since landed, so the strip is an idempotent no-op today).
//
// Usage:
//   node scripts/qa/style-oracle.mjs [--out qa/baseline] [--only torch,matrix] [--concurrency 1]
//
// Output layout: <out>/oracle/<effect>-<theme>-<state>.json (stable key order, 2-space indent).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
	startDevServer,
	launchBrowser,
	warmUp,
	driveToState,
	closePage,
	allCombos,
	comboKey,
	anatomyNodes,
	dumpNode,
	SKIP_PROPERTIES,
	normalizeAnimationName,
	stableStringify
} from './drive.mjs';

function parseArgs(argv) {
	const args = { out: 'qa/baseline', only: null, concurrency: 1 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--out') args.out = argv[++i];
		else if (a === '--only') args.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
		else if (a === '--concurrency') args.concurrency = Math.max(1, Number.parseInt(argv[++i], 10) || 1);
	}
	return args;
}

/** Dump one combo into a plain object: { "<sel><pseudo>": {prop:value} | null }. */
async function dumpCombo(browser, baseUrl, combo) {
	const page = await driveToState(browser, baseUrl, combo);
	try {
		const nodes = anatomyNodes(combo);
		const result = {};
		for (const node of nodes) {
			const key = node.sel + (node.pseudo || '');
			const dump = await dumpNode(page, node, SKIP_PROPERTIES);
			if (dump && dump['animation-name'] != null) {
				dump['animation-name'] = normalizeAnimationName(dump['animation-name']);
			}
			result[key] = dump;
		}
		return result;
	} finally {
		await closePage(page);
	}
}

async function main() {
	const cwd = process.cwd();
	const args = parseArgs(process.argv.slice(2));
	const outDir = path.resolve(cwd, args.out, 'oracle');
	await mkdir(outDir, { recursive: true });

	let combos = allCombos();
	if (args.only) combos = combos.filter((c) => args.only.includes(c.effect));

	console.log(
		`[oracle] ${combos.length} combos -> ${path.relative(cwd, outDir)} (concurrency=${args.concurrency})`
	);

	const server = await startDevServer({ cwd });
	console.log(`[oracle] dev server ${server.baseUrl}`);
	const { browser, close } = await launchBrowser();

	const failures = [];
	const started = Date.now();
	try {
		await warmUp(browser, server.baseUrl);
		console.log('[oracle] warmed up');

		// Simple bounded-concurrency worker pool over the combo queue.
		const queue = [...combos];
		let done = 0;

		async function worker(id) {
			while (queue.length) {
				const combo = queue.shift();
				if (!combo) break;
				const key = comboKey(combo);
				const t0 = Date.now();
				try {
					const dump = await dumpCombo(browser, server.baseUrl, combo);
					const file = path.join(outDir, `${key}.json`);
					await writeFile(file, stableStringify(dump) + '\n', 'utf8');
					done++;
					const present = Object.values(dump).filter((v) => v !== null).length;
					console.log(
						`[oracle] (${done}/${combos.length}) ${key} nodes=${present} ${Date.now() - t0}ms`
					);
				} catch (err) {
					failures.push({ key, error: err.message });
					console.error(`[oracle] FAIL ${key}: ${err.message}`);
				}
			}
		}

		const workers = [];
		for (let i = 0; i < args.concurrency; i++) workers.push(worker(i));
		await Promise.all(workers);
	} finally {
		await close();
		await server.stop();
	}

	const secs = ((Date.now() - started) / 1000).toFixed(1);
	if (failures.length) {
		console.error(`\n[oracle] ${failures.length} FAILURES in ${secs}s:`);
		for (const f of failures) console.error(`  - ${f.key}: ${f.error}`);
		process.exit(1);
	}
	console.log(`\n[oracle] OK: ${combos.length} combos in ${secs}s -> ${path.relative(cwd, outDir)}`);
}

main().catch((err) => {
	console.error('[oracle] fatal:', err);
	process.exit(1);
});
