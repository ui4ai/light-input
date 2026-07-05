#!/usr/bin/env node
// scripts/qa/oracle-field-glow.mjs
//
// SUPPLEMENTARY ORACLE PROBE for the `loadingGlow: 'field'` waiting state (W1b gate).
//
// Why this exists: the main style oracle (style-oracle.mjs) drives the waiting state with
// loadingGlow='torch' (drive.mjs seeds it), so it NEVER exercises the
// `.field[data-state='waiting'][data-loading-glow='field']::before` rules — precisely the surface
// where sdk-critique fatalFlaws[0] predicted a flip when GhostInput's <style> unscopes into
// core.css. This probe seeds loadingGlow='field', drives the field to data-state='waiting', and
// dumps getComputedStyle(.field, '::before') for all 39 effects × {dark,light}. It is the direct,
// browser-truth observation of the two split-and-restrengthened waiting ::before arms.
//
// It captures into <out>/oracle-field/<effect>-<theme>-waiting-field.json using the SAME frozen-
// animation + -v2-normalized dump path as the main oracle, so its output is diffable with
// diff-oracle.mjs. Run it against a HEAD baseline and the W1b tree; diff MUST be clean.
//
// Usage:
//   node scripts/qa/oracle-field-glow.mjs --out qa/w1b [--only flame,android]

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
	STORAGE_KEY,
	WAITING_TYPE_TEXT,
	GLOW_VARIANTS,
	startDevServer,
	launchBrowser,
	warmUp,
	closePage,
	freezeForCapture,
	dumpNode,
	SKIP_PROPERTIES,
	normalizeAnimationName,
	stableStringify,
	sleep
} from './drive.mjs';

function parseArgs(argv) {
	const args = { out: 'qa/w1b', only: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--out') args.out = argv[++i];
		else if (a === '--only') args.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
	}
	return args;
}

// Like drive.mjs openConfiguredPage, but seeds loadingGlow:'field' (the whole point of this probe)
// and always uses LLM completionMode so we can hang fetch -> data-state='waiting'.
async function openFieldGlowPage(browser, baseUrl, { effect, theme }) {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		deviceScaleFactor: 1,
		colorScheme: theme === 'light' ? 'light' : 'dark',
		reducedMotion: 'no-preference'
	});
	// Stub setInterval (matrix) + hang fetch (waiting), same determinism protocol as drive.mjs.
	await context.addInitScript(`(() => {
		try { window.setInterval = function () { return 0; }; window.clearInterval = function () {}; } catch (e) {}
		try { window.fetch = function () { return new Promise(function () {}); }; } catch (e) {}
	})();`);

	const page = await context.newPage();
	page.__qaContext = context;

	await page.goto(baseUrl, { waitUntil: 'load' });
	const settings = {
		theme,
		glow: effect,
		loadingGlow: 'field', // <-- the field-loading-glow waiting indicator
		lightFlow: true,
		completionMode: 'demo' // hydration gate keys off the Demo segment being active
	};
	await page.evaluate(
		([key, value]) => localStorage.setItem(key, value),
		[STORAGE_KEY, JSON.stringify(settings)]
	);
	await page.goto(baseUrl, { waitUntil: 'load' });
	await page.bringToFront();

	await page.waitForSelector(`.field[data-glow='${effect}'][data-theme='${theme}']`, { timeout: 15000 });
	// Hydration gate: Demo segment active proves onMount applied the seeded settings.
	await page.waitForFunction(
		() => {
			const seg = [...document.querySelectorAll('.segmented.mode .segment')].find((b) => /Demo/.test(b.textContent || ''));
			return Boolean(seg && seg.classList.contains('active'));
		},
		{ timeout: 15000 }
	);
	return page;
}

// Drive to data-state='waiting' with loadingGlow already 'field': switch to LLM (fetch hangs),
// verify data-loading-glow='field' is on the field, type a prefix, wait for waiting.
async function driveWaitingField(page, { effect, theme }) {
	const llm = page.locator('.segmented.mode .segment', { hasText: 'LLM' });
	await llm.waitFor({ state: 'visible', timeout: 15000 });
	await llm.click();
	await page.evaluate(() => document.querySelector("input[data-testid='ghost-input']")?.focus());

	// Sanity: the field must actually be in loading-glow='field' (seeded), else the probe is moot.
	const lg = await page.getAttribute(`.field[data-glow='${effect}']`, 'data-loading-glow');
	if (lg !== 'field') throw new Error(`expected data-loading-glow='field', got '${lg}'`);

	const input = page.locator("input[data-testid='ghost-input']");
	await input.focus();
	await page.evaluate(() => {
		const el = document.querySelector("input[data-testid='ghost-input']");
		if (el && el.value) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
	});
	await input.focus();
	await input.pressSequentially(WAITING_TYPE_TEXT, { delay: 8 });
	await page.waitForSelector(
		`.field[data-glow='${effect}'][data-theme='${theme}'][data-state='waiting']`,
		{ timeout: 15000 }
	);
}

async function dumpFieldBefore(browser, baseUrl, combo) {
	const page = await openFieldGlowPage(browser, baseUrl, combo);
	try {
		await driveWaitingField(page, combo);
		await freezeForCapture(page);
		const out = {};
		for (const node of [
			{ sel: '.field', pseudo: '::before' },
			{ sel: '.field', pseudo: '::after' }
		]) {
			const dump = await dumpNode(page, node, SKIP_PROPERTIES);
			if (dump && dump['animation-name'] != null) dump['animation-name'] = normalizeAnimationName(dump['animation-name']);
			out[node.sel + node.pseudo] = dump;
		}
		return out;
	} finally {
		await closePage(page);
	}
}

async function main() {
	const cwd = process.cwd();
	const args = parseArgs(process.argv.slice(2));
	const outDir = path.resolve(cwd, args.out, 'oracle-field');
	await mkdir(outDir, { recursive: true });

	let effects = [...GLOW_VARIANTS];
	if (args.only) effects = effects.filter((e) => args.only.includes(e));
	const combos = [];
	for (const effect of effects) for (const theme of ['dark', 'light']) combos.push({ effect, theme });

	console.log(`[field-glow] ${combos.length} combos -> ${path.relative(cwd, outDir)}`);
	const server = await startDevServer({ cwd });
	console.log(`[field-glow] dev server ${server.baseUrl}`);
	const { browser, close } = await launchBrowser();

	const failures = [];
	const started = Date.now();
	try {
		await warmUp(browser, server.baseUrl);
		let done = 0;
		for (const combo of combos) {
			const key = `${combo.effect}-${combo.theme}-waiting-field`;
			const t0 = Date.now();
			try {
				const dump = await dumpFieldBefore(browser, server.baseUrl, combo);
				await writeFile(path.join(outDir, `${key}.json`), stableStringify(dump) + '\n', 'utf8');
				done++;
				console.log(`[field-glow] (${done}/${combos.length}) ${key} ${Date.now() - t0}ms`);
			} catch (err) {
				failures.push({ key, error: err.message });
				console.error(`[field-glow] FAIL ${key}: ${err.message}`);
			}
			await sleep(20);
		}
	} finally {
		await close();
		await server.stop();
	}

	const secs = ((Date.now() - started) / 1000).toFixed(1);
	if (failures.length) {
		console.error(`\n[field-glow] ${failures.length} FAILURES in ${secs}s:`);
		for (const f of failures) console.error(`  - ${f.key}: ${f.error}`);
		process.exit(1);
	}
	console.log(`\n[field-glow] OK: ${combos.length} combos in ${secs}s -> ${path.relative(cwd, outDir)}`);
}

main().catch((err) => {
	console.error('[field-glow] fatal:', err);
	process.exit(1);
});
