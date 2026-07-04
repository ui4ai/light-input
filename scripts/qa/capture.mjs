#!/usr/bin/env node
// scripts/qa/capture.mjs
//
// Screenshot half of the visual-identity QA harness (workstream W0). Uses the SAME driving +
// determinism code as style-oracle.mjs (scripts/qa/drive.mjs), so shots are pixel-stable:
// animations frozen at currentTime=1200, MatrixRain interval stubbed, scrollLeft=0, two rAFs.
//
// For every effect x theme x state it captures the .field bounding box (+40px padding on every
// side, clamped to the viewport) to <out>/shots/<effect>-<theme>-<state>.png at viewport
// 1280x900, deviceScaleFactor 1.
//
// Usage:
//   node scripts/qa/capture.mjs [--out qa/baseline] [--only torch,matrix]

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
	startDevServer,
	launchBrowser,
	warmUp,
	driveToState,
	closePage,
	allCombos,
	comboKey
} from './drive.mjs';

const VIEWPORT = { width: 1280, height: 900 };
const PAD = 40;

function parseArgs(argv) {
	const args = { out: 'qa/baseline', only: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--out') args.out = argv[++i];
		else if (a === '--only') args.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
	}
	return args;
}

/** Screenshot the .field bbox + PAD, clamped to the viewport, to `file`. */
async function shootCombo(browser, baseUrl, combo, file) {
	const page = await driveToState(browser, baseUrl, combo);
	try {
		const box = await page.locator('.field').boundingBox();
		if (!box) throw new Error('.field has no bounding box');
		const x = Math.max(0, Math.floor(box.x - PAD));
		const y = Math.max(0, Math.floor(box.y - PAD));
		const right = Math.min(VIEWPORT.width, Math.ceil(box.x + box.width + PAD));
		const bottom = Math.min(VIEWPORT.height, Math.ceil(box.y + box.height + PAD));
		const clip = { x, y, width: right - x, height: bottom - y };
		await page.screenshot({ path: file, clip, animations: 'disabled' });
	} finally {
		await closePage(page);
	}
}

async function main() {
	const cwd = process.cwd();
	const args = parseArgs(process.argv.slice(2));
	const outDir = path.resolve(cwd, args.out, 'shots');
	await mkdir(outDir, { recursive: true });

	let combos = allCombos();
	if (args.only) combos = combos.filter((c) => args.only.includes(c.effect));

	console.log(`[shots] ${combos.length} combos -> ${path.relative(cwd, outDir)}`);

	const server = await startDevServer({ cwd });
	console.log(`[shots] dev server ${server.baseUrl}`);
	const { browser, close } = await launchBrowser();

	const failures = [];
	const started = Date.now();
	try {
		await warmUp(browser, server.baseUrl);
		console.log('[shots] warmed up');

		let done = 0;
		for (const combo of combos) {
			const key = comboKey(combo);
			const t0 = Date.now();
			try {
				await shootCombo(browser, server.baseUrl, combo, path.join(outDir, `${key}.png`));
				done++;
				console.log(`[shots] (${done}/${combos.length}) ${key} ${Date.now() - t0}ms`);
			} catch (err) {
				failures.push({ key, error: err.message });
				console.error(`[shots] FAIL ${key}: ${err.message}`);
			}
		}
	} finally {
		await close();
		await server.stop();
	}

	const secs = ((Date.now() - started) / 1000).toFixed(1);
	if (failures.length) {
		console.error(`\n[shots] ${failures.length} FAILURES in ${secs}s:`);
		for (const f of failures) console.error(`  - ${f.key}: ${f.error}`);
		process.exit(1);
	}
	console.log(`\n[shots] OK: ${combos.length} shots in ${secs}s -> ${path.relative(cwd, outDir)}`);
}

main().catch((err) => {
	console.error('[shots] fatal:', err);
	process.exit(1);
});
