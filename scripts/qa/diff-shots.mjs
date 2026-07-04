#!/usr/bin/env node
// scripts/qa/diff-shots.mjs
//
// Screenshot comparator for the visual-identity QA harness (workstream W0). Compares two shot
// directories produced by capture.mjs.
//
// Gate policy (two tiers):
//   1. BYTE tier — most combos are byte-identical across runs (frozen animations + software
//      raster). Byte equality passes immediately.
//   2. PERCEPTUAL tier — a few filter-heavy effects (toxic/snow/art/spoiler/...) carry an
//      irreducible, RANDOM, spatially-localized pixel-noise floor from Chromium's non-
//      deterministic backdrop-filter / feTurbulence rasterization (the computed-style oracle is
//      byte-identical for these same combos, so it is an engine property, not a regression). For
//      byte-differing images we decode both PNGs (via the bundled Chromium canvas — zero extra
//      deps) and pass iff the count of pixels whose max per-channel delta exceeds
//      --threshold (default 16) is <= --max-diff-pixels (default 1200). A structural regression
//      from a later workstream would move thousands of pixels / shift geometry and blow past
//      this floor immediately.
//
// Exit 1 on any image that fails BOTH tiers, or on any missing/extra/dimension-mismatch image.
//
// Usage:
//   node scripts/qa/diff-shots.mjs <baselineDir> <candidateDir> \
//        [--threshold 16] [--max-diff-pixels 1200] [--json out.json]
//   (dirs may point at the run root, e.g. qa/baseline, or the .../shots subdir)

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

function parseArgs(argv) {
	const args = {
		baseline: null,
		candidate: null,
		threshold: 16,
		maxDiffPixels: 1200,
		json: null
	};
	const pos = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--threshold') args.threshold = Number.parseInt(argv[++i], 10);
		else if (a === '--max-diff-pixels') args.maxDiffPixels = Number.parseInt(argv[++i], 10);
		else if (a === '--json') args.json = argv[++i];
		else pos.push(a);
	}
	args.baseline = pos[0];
	args.candidate = pos[1];
	return args;
}

async function resolveShotsDir(dir) {
	const nested = path.join(dir, 'shots');
	try {
		if ((await stat(nested)).isDirectory()) return nested;
	} catch {
		/* not nested */
	}
	return dir;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.baseline || !args.candidate) {
		console.error(
			'usage: diff-shots.mjs <baselineDir> <candidateDir> [--threshold n] [--max-diff-pixels n] [--json f]'
		);
		process.exit(2);
	}

	const baseDir = await resolveShotsDir(path.resolve(args.baseline));
	const candDir = await resolveShotsDir(path.resolve(args.candidate));

	const baseFiles = new Set((await readdir(baseDir)).filter((f) => f.endsWith('.png')));
	const candFiles = new Set((await readdir(candDir)).filter((f) => f.endsWith('.png')));
	const all = [...new Set([...baseFiles, ...candFiles])].sort();

	// First pass: byte-compare everything; collect byte-differing (same-name) pairs.
	const results = [];
	const needPixel = [];
	let missing = 0;
	let identical = 0;
	for (const f of all) {
		if (!baseFiles.has(f) || !candFiles.has(f)) {
			results.push({ file: f, status: 'missing' });
			missing++;
			continue;
		}
		const [a, b] = await Promise.all([readFile(path.join(baseDir, f)), readFile(path.join(candDir, f))]);
		if (a.equals(b)) {
			results.push({ file: f, status: 'byte-identical' });
			identical++;
		} else {
			needPixel.push(f);
		}
	}

	// Second pass: perceptual compare the byte-differing images via a Chromium canvas.
	let overBudget = 0;
	let withinBudget = 0;
	let worst = 0;
	if (needPixel.length) {
		const browser = await chromium.launch({ headless: true });
		const page = await browser.newPage();
		try {
			for (const f of needPixel) {
				const [a, b] = await Promise.all([
					readFile(path.join(baseDir, f)),
					readFile(path.join(candDir, f))
				]);
				const res = await page.evaluate(
					async ([da, db, thr]) => {
						const load = (src) =>
							new Promise((resolve, reject) => {
								const img = new Image();
								img.onload = () => resolve(img);
								img.onerror = reject;
								img.src = src;
							});
						const [ia, ib] = await Promise.all([load(da), load(db)]);
						if (ia.width !== ib.width || ia.height !== ib.height) {
							return { dim: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}`, diff: -1 };
						}
						const w = ia.width;
						const h = ia.height;
						const ca = new OffscreenCanvas(w, h);
						const cb = new OffscreenCanvas(w, h);
						const xa = ca.getContext('2d');
						const xb = cb.getContext('2d');
						xa.drawImage(ia, 0, 0);
						xb.drawImage(ib, 0, 0);
						const pa = xa.getImageData(0, 0, w, h).data;
						const pb = xb.getImageData(0, 0, w, h).data;
						let diff = 0;
						let maxd = 0;
						let minx = w;
						let miny = h;
						let maxx = 0;
						let maxy = 0;
						for (let p = 0, px = 0; p < pa.length; p += 4, px++) {
							const m = Math.max(
								Math.abs(pa[p] - pb[p]),
								Math.abs(pa[p + 1] - pb[p + 1]),
								Math.abs(pa[p + 2] - pb[p + 2]),
								Math.abs(pa[p + 3] - pb[p + 3])
							);
							if (m > maxd) maxd = m;
							if (m > thr) {
								diff++;
								const x = px % w;
								const y = (px / w) | 0;
								if (x < minx) minx = x;
								if (y < miny) miny = y;
								if (x > maxx) maxx = x;
								if (y > maxy) maxy = y;
							}
						}
						return {
							diff,
							maxd,
							total: pa.length / 4,
							bbox: diff ? { minx, miny, maxx, maxy, w: maxx - minx + 1, h: maxy - miny + 1 } : null
						};
					},
					['data:image/png;base64,' + a.toString('base64'), 'data:image/png;base64,' + b.toString('base64'), args.threshold]
				);
				if (res.diff === -1) {
					results.push({ file: f, status: 'dimension-mismatch', detail: res.dim });
					overBudget++;
				} else if (res.diff > args.maxDiffPixels) {
					results.push({ file: f, status: 'over-budget', ...res });
					overBudget++;
				} else {
					results.push({ file: f, status: 'within-budget', ...res });
					withinBudget++;
				}
				if (res.diff > worst) worst = res.diff;
			}
		} finally {
			await browser.close();
		}
	}

	// Report.
	console.log(
		`[shots-diff] baseline=${path.relative(process.cwd(), baseDir)} candidate=${path.relative(process.cwd(), candDir)}`
	);
	console.log(
		`[shots-diff] ${all.length} images | ${identical} byte-identical | ${withinBudget} within pixel budget | ${overBudget} FAIL | ${missing} missing`
	);
	console.log(
		`[shots-diff] threshold=${args.threshold}/channel, max-diff-pixels=${args.maxDiffPixels}; worst image diff=${worst}px`
	);
	for (const r of results) {
		if (r.status === 'byte-identical') continue;
		if (r.status === 'within-budget') {
			// r.diff may be 0 (byte-differs but no pixel exceeds threshold — pure sub-threshold AA),
			// in which case bbox is null.
			const where = r.bbox ? `, bbox ${r.bbox.w}x${r.bbox.h}` : '';
			console.log(`  ok   ${r.file}: ${r.diff}px (maxΔ=${r.maxd}${where})`);
		} else if (r.status === 'over-budget') {
			console.log(`  FAIL ${r.file}: ${r.diff}px > ${args.maxDiffPixels} (maxΔ=${r.maxd})`);
		} else if (r.status === 'dimension-mismatch') {
			console.log(`  FAIL ${r.file}: dimension ${r.detail}`);
		} else if (r.status === 'missing') {
			console.log(`  FAIL ${r.file}: present on only one side`);
		}
	}

	if (args.json) {
		await writeFile(args.json, JSON.stringify({ args, identical, withinBudget, overBudget, missing, worst, results }, null, 2));
	}

	if (overBudget > 0 || missing > 0) {
		console.log('[shots-diff] RESULT: FAIL');
		process.exit(1);
	}
	console.log('[shots-diff] RESULT: PASS (byte-identical or within documented engine-noise budget)');
}

main().catch((err) => {
	console.error('[shots-diff] fatal:', err);
	process.exit(2);
});
