// scripts/qa/drive.mjs
//
// Shared driving library for the @ui4ai/light-input visual-identity QA harness (workstream W0).
//
// Responsibilities:
//   1. Boot a dev server on a free port (never 5173 — that may be an existing dev server).
//   2. Launch a single headless Chromium (playwright) with deterministic init scripts:
//        - stub window.setInterval to a no-op BEFORE app scripts run, so MatrixRain's 92ms
//          column flips (MatrixRain.svelte:23) never fire during capture.
//        - (waiting only) stub window.fetch to a never-resolving Promise so the LLM request
//          hangs and the field parks in data-state='waiting'.
//   3. Select an effect/theme via localStorage 'light-input-demo-settings' + a full reload
//        (NEVER via URL params — they do not exist until W7).
//   4. Drive the input to the ready or waiting visual state.
//   5. Freeze all animations at a fixed phase (getAnimations pause + currentTime=1200),
//        force the input scrollLeft to 0, wait two rAFs — so getComputedStyle / screenshots
//        are byte-stable across runs.
//
// The determinism protocol here is mandated by sdk-critique.json fatalFlaws[1].
//
// This module is consumed by style-oracle.mjs, capture.mjs. It touches only scripts/.

import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';

export const STORAGE_KEY = 'light-input-demo-settings';

// The demo only completes prefixes of this sentence (autocomplete.ts DEMO_COMPLETION_TEXT).
export const DEMO_COMPLETION_TEXT = "Let's make something that actually makes a difference";
// Ready: a prefix that yields a non-empty suggestion. hasEnoughText requires trim().length > 2.
export const READY_TYPE_TEXT = "Let's make so";
// Waiting: LLM mode, one char longer, fetch is stubbed to hang so suggestion never arrives.
export const WAITING_TYPE_TEXT = "Let's make som";

// The frozen animation phase. 1200ms parks every entrance animation (beam-open 720/650ms,
// beam-hot 560ms, word-reveal 640ms, tail-reveal 760ms — all fill:both) in its settled end
// state, while pinning infinite animations (glow-breathe 4s, torch-haze 1.28s, caret-blink...)
// to a single reproducible phase.
export const FROZEN_TIME_MS = 1200;

const THEMES = ['dark', 'light'];
const STATES = ['ready', 'waiting'];

export { THEMES, STATES };

/** The 39 GlowVariant names, in canonical order (mirror of autocomplete.ts GLOW_VARIANTS). */
export const GLOW_VARIANTS = [
	'torch',
	'candle',
	'lightning',
	'aurora',
	'plasma',
	'prism',
	'ember',
	'neon',
	'nebula',
	'smoke',
	'solar',
	'holo',
	'blackhole',
	'flame',
	'matrix',
	'snow',
	'toxic',
	'vortex',
	'bubblegum',
	'optic',
	'biolume',
	'ocean',
	'horror',
	'heart',
	'liquidglass',
	'android',
	'fontshift',
	'rorschach',
	'diffusion',
	'chromabloom',
	'infrared',
	'staged',
	'blueprint',
	'spoiler',
	'ghosttext',
	'drift',
	'art',
	'scratch',
	'kaleidoscope'
];

/** Every (effect, theme, state) combo, in a stable order: 39 * 2 * 2 = 156. */
export function allCombos() {
	const combos = [];
	for (const effect of GLOW_VARIANTS) {
		for (const theme of THEMES) {
			for (const state of STATES) {
				combos.push({ effect, theme, state });
			}
		}
	}
	return combos;
}

export function comboKey({ effect, theme, state }) {
	return `${effect}-${theme}-${state}`;
}

// ---------------------------------------------------------------------------
// Dev server
// ---------------------------------------------------------------------------

/** Find a free TCP port (never 5173). */
export function findFreePort() {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.on('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
	});
}

async function waitForServer(url, { timeoutMs = 60_000 } = {}) {
	const deadline = Date.now() + timeoutMs;
	let lastErr;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { redirect: 'manual' });
			// Any HTTP response (incl. redirects) means the server is up.
			if (res.status > 0) return;
		} catch (err) {
			lastErr = err;
		}
		await sleep(250);
	}
	throw new Error(`Dev server at ${url} did not become ready in ${timeoutMs}ms: ${lastErr}`);
}

/**
 * Spawn `npm run dev` on a free port. Returns { proc, port, baseUrl, stop() }.
 * We do NOT set PUBLIC_LIGHT_INPUT_DEMO_ONLY, so both LLM and Demo mode buttons render
 * (waiting state needs the LLM button click).
 */
export async function startDevServer({ cwd = process.cwd(), quiet = true } = {}) {
	const port = await findFreePort();
	const proc = spawn(
		'npm',
		['run', 'dev', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
		{
			cwd,
			env: { ...process.env },
			stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit'
		}
	);

	const logChunks = [];
	if (quiet) {
		proc.stdout?.on('data', (d) => logChunks.push(d.toString()));
		proc.stderr?.on('data', (d) => logChunks.push(d.toString()));
	}

	let exited = false;
	proc.on('exit', () => {
		exited = true;
	});

	const baseUrl = `http://127.0.0.1:${port}`;

	const stop = async () => {
		if (exited) return;
		proc.kill('SIGTERM');
		// Give it a moment, then SIGKILL if still alive.
		await sleep(500);
		if (!exited) proc.kill('SIGKILL');
	};

	try {
		await waitForServer(baseUrl, { timeoutMs: 90_000 });
	} catch (err) {
		const tail = logChunks.join('').split('\n').slice(-25).join('\n');
		await stop();
		throw new Error(`${err.message}\n--- dev server output tail ---\n${tail}`);
	}

	return { proc, port, baseUrl, stop };
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

/**
 * Chromium flags that push rasterization toward determinism: software raster on a single
 * thread, no partial raster, no subpixel/LCD text, sRGB. These make the great majority of
 * combos byte-stable. They do NOT fully tame Chromium's non-deterministic `backdrop-filter`
 * and SVG `feTurbulence`/`feDisplacementMap` noise (the engine reseeds per raster) — a handful
 * of filter-heavy effects (toxic, snow, art, spoiler...) keep a small, random, localized pixel
 * noise floor in the prediction layers. That residue is a rendering-engine property, not a
 * harness defect: the computed-style oracle (the authoritative gate) is byte-identical across
 * runs for those same combos. See the gate report / determinismProof.
 */
const DETERMINISTIC_RENDER_ARGS = [
	'--disable-gpu',
	'--disable-gpu-compositing',
	'--disable-gpu-rasterization',
	'--disable-oop-rasterization',
	'--disable-accelerated-2d-canvas',
	'--num-raster-threads=1',
	'--disable-partial-raster',
	'--disable-skia-runtime-opts',
	'--disable-lcd-text',
	'--disable-font-subpixel-positioning',
	'--force-color-profile=srgb',
	'--hide-scrollbars'
];

/**
 * Launch Chromium with the deterministic init scripts installed for both contexts.
 * Returns { browser, close() }.
 */
export async function launchBrowser() {
	const browser = await chromium.launch({ headless: true, args: DETERMINISTIC_RENDER_ARGS });
	return {
		browser,
		close: () => browser.close()
	};
}

/**
 * addInitScript payload injected into EVERY page before app scripts run.
 *
 * `hangFetch` (waiting state): replace window.fetch with a never-resolving Promise so the
 * LLM completion request stays pending and the field parks in data-state='waiting'.
 *
 * setInterval is ALWAYS stubbed to a no-op returning a fake id — this kills MatrixRain's
 * 92ms flips (the only DOM-mutating timer in src/lib) so matrix dumps/shots don't drift.
 * We keep clearInterval a no-op too. setTimeout is left intact (the demo completion path and
 * the app's refocus rAF rely on real timers).
 */
function initScriptSource({ hangFetch }) {
	return `(() => {
    // Neutralize the matrix rain interval (and any other setInterval) for capture stability.
    try {
      window.setInterval = function () { return 0; };
      window.clearInterval = function () {};
    } catch (e) {}
    ${
			hangFetch
				? `
    // Hang every fetch so the LLM request never resolves -> data-state='waiting'.
    try {
      window.fetch = function () { return new Promise(function () {}); };
    } catch (e) {}
    `
				: ''
		}
  })();`;
}

/**
 * Create a fresh context+page with the given determinism init scripts, seed localStorage
 * with the demo settings for (effect, theme), then reload so onMount hydrates from storage.
 *
 * Returns the Playwright page (caller is responsible for context lifecycle via closePage).
 */
export async function openConfiguredPage(browser, baseUrl, { effect, theme, state }) {
	const hangFetch = state === 'waiting';
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		deviceScaleFactor: 1,
		colorScheme: theme === 'light' ? 'light' : 'dark',
		reducedMotion: 'no-preference'
	});
	await context.addInitScript(initScriptSource({ hangFetch }));

	const page = await context.newPage();
	page.__qaContext = context;

	// First load: reach the app so localStorage is same-origin, then seed settings.
	await page.goto(baseUrl, { waitUntil: 'load' });

	const settings = {
		theme,
		glow: effect,
		loadingGlow: 'torch',
		lightFlow: true,
		completionMode: 'demo'
	};
	await page.evaluate(
		([key, value]) => {
			localStorage.setItem(key, value);
		},
		[STORAGE_KEY, JSON.stringify(settings)]
	);

	// Reload so +page.svelte onMount() hydrates from the seeded settings.
	await page.goto(baseUrl, { waitUntil: 'load' });
	await page.bringToFront();

	// Wait until the field exists and reflects the requested effect/theme.
	await page.waitForSelector(`.field[data-glow='${effect}'][data-theme='${theme}']`, {
		timeout: 15_000
	});

	// HYDRATION GATE (critical): typing before onMount() applies the seeded settings races the
	// component — early keystrokes land while completionMode is still the default 'llm', so the
	// demo completion never fires and the field stays 'idle'. We seed completionMode:'demo', so
	// wait until the Demo mode segment is active, which proves onMount ran and applied settings.
	// (For the waiting path we click LLM AFTER this gate.)
	await page.waitForFunction(
		() => {
			const seg = [...document.querySelectorAll('.segmented.mode .segment')].find((b) =>
				/Demo/.test(b.textContent || '')
			);
			return Boolean(seg && seg.classList.contains('active'));
		},
		{ timeout: 15_000 }
	);

	return page;
}

export async function closePage(page) {
	const ctx = page.__qaContext;
	if (ctx) await ctx.close();
}

/**
 * Warm up the dev server by loading the route once and waiting for the field. A cold Vite dev
 * server transforms ~33k lines of effect CSS + the component on first request, which can take
 * 10-30s — without this the first real combos time out. Call once before the capture loop.
 */
export async function warmUp(browser, baseUrl) {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		await page.goto(baseUrl, { waitUntil: 'load' });
		await page.waitForSelector('.field', { timeout: 90_000 });
	} finally {
		await context.close();
	}
}

// ---------------------------------------------------------------------------
// Input driving
// ---------------------------------------------------------------------------

/**
 * Type `text` into the ghost input via REAL keyboard events (keydown/beforeinput/input), the
 * only path that drives the component's actual input pipeline and keeps its `value` $state and
 * selection in sync. A native value-setter + synthetic 'input' event does NOT update Svelte's
 * bind:value, so `atEnd` (value.length vs caret) fails and no prediction fires.
 *
 * Demo mode: onBeforeInput/onKeydown intercept each key and rebuild the value as a prefix of
 * DEMO_COMPLETION_TEXT sized by caret + inserted length — so pressing the real prefix chars
 * (13 keystrokes for READY_TYPE_TEXT) yields exactly that 13-char prefix.
 * LLM mode: onBeforeInput early-returns; the native input path builds the value literally.
 */
async function setInputValue(page, text) {
	const input = page.locator("input[data-testid='ghost-input']");
	await input.focus();
	// Clear any existing content first (defensive; the input starts empty).
	await page.evaluate(() => {
		const el = document.querySelector("input[data-testid='ghost-input']");
		if (el && el.value) {
			el.value = '';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}
	});
	await input.focus();
	await input.pressSequentially(text, { delay: 8 });
}

/** Ready state: demo mode, type a completable prefix, wait for [data-state='ready']. */
async function driveReady(page, { effect, theme }) {
	await setInputValue(page, READY_TYPE_TEXT);
	await page.waitForSelector(`.field[data-glow='${effect}'][data-theme='${theme}'][data-state='ready']`, {
		timeout: 15_000
	});
}

/**
 * Waiting state: switch to LLM mode (fetch is stubbed to hang), type a prefix, wait for
 * [data-state='waiting']. Clicking the LLM segment button clears the cache + cancels, then a
 * hung fetch keeps loading=true with no suggestion.
 */
async function driveWaiting(page, { effect, theme }) {
	// The LLM button is the first Mode segment (label "LLM"). It only exists when not DEMO_ONLY.
	const llmButton = page.locator('.segmented.mode .segment', { hasText: 'LLM' });
	await llmButton.waitFor({ state: 'visible', timeout: 15_000 });
	await llmButton.click();

	// Re-focus the input (clicking a control blurs it; the app refocuses, but be explicit).
	await page.evaluate(() => {
		document.querySelector("input[data-testid='ghost-input']")?.focus();
	});

	await setInputValue(page, WAITING_TYPE_TEXT);
	await page.waitForSelector(
		`.field[data-glow='${effect}'][data-theme='${theme}'][data-state='waiting']`,
		{ timeout: 15_000 }
	);
}

/**
 * Freeze all animations at FROZEN_TIME_MS, neutralize any residual matrix interval,
 * force input scrollLeft to 0, wait two rAFs. Idempotent — safe to call repeatedly.
 * Must run AFTER the target state is reached (entrance animations exist by then).
 */
export async function freezeForCapture(page) {
	await page.evaluate((frozenTime) => {
		// Pause element AND pseudo-element CSS animations at one fixed phase.
		for (const anim of document.getAnimations({ subtree: true })) {
			try {
				anim.pause();
				anim.currentTime = frozenTime;
			} catch (e) {
				/* some animations may be non-seekable; ignore */
			}
		}
		// Force the input scroll to 0 so .track transform is deterministic.
		const input = document.querySelector("input[data-testid='ghost-input']");
		if (input) input.scrollLeft = 0;
	}, FROZEN_TIME_MS);

	// Two rAFs so paused values are committed to the render tree before we read them.
	await page.evaluate(
		() =>
			new Promise((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			})
	);
}

/**
 * Full drive: open configured page, reach the target state, freeze. Returns the page.
 * Caller must closePage() when done.
 */
export async function driveToState(browser, baseUrl, combo) {
	const page = await openConfiguredPage(browser, baseUrl, combo);
	if (combo.state === 'ready') {
		await driveReady(page, combo);
	} else {
		await driveWaiting(page, combo);
	}
	await freezeForCapture(page);
	return page;
}

// ---------------------------------------------------------------------------
// Anatomy node list — the full contract surface to dump / screenshot.
// ---------------------------------------------------------------------------
//
// Each entry: { sel, pseudo? }. sel is scoped to the FIRST matching node within `.field`.
// The oracle dumps getComputedStyle for each; missing nodes are recorded as absent.
// Coverage includes .field::before/::after and .prediction::before/::after (fatalFlaws[0]/[1]).

export function anatomyNodes({ state }) {
	const nodes = [
		{ sel: '.stage' },
		{ sel: '.field' },
		{ sel: '.field', pseudo: '::before' },
		{ sel: '.field', pseudo: '::after' },
		{ sel: '.viewport' },
		{ sel: '.input' },
		{ sel: '.paint' },
		{ sel: '.track' },
		{ sel: '.caret' }
	];

	// Waiting: caret-origin-glow torch stack (data-mode='waiting'); ready also renders it
	// (data-mode='ready') but modules typically display:none it. Dump in both states.
	nodes.push({ sel: '.caret-origin-glow' });
	for (const cls of ['torch-haze', 'torch-flow', 'torch-core', 'torch-aux', 'torch-spark', 'torch-smoke']) {
		nodes.push({ sel: `.caret-origin-glow .${cls}` });
	}

	// Prediction + pseudos + 7 beams (ready state; showGhost gates the prediction subtree).
	nodes.push({ sel: '.prediction' });
	nodes.push({ sel: '.prediction', pseudo: '::before' });
	nodes.push({ sel: '.prediction', pseudo: '::after' });
	for (const cls of ['beam-veil', 'beam-body', 'beam-hot', 'beam-flow', 'beam-aux', 'beam-spark', 'beam-smoke']) {
		nodes.push({ sel: `.${cls}` });
	}

	// Optional effect DOM layer root (matrix / kaleidoscope). Query by testid; absent otherwise.
	nodes.push({ sel: `[data-testid='matrix-code-layer']` });
	nodes.push({ sel: `[data-testid='kaleidoscope-layer']` });

	// next-word + pseudos + first 3 glyphs + their pseudos.
	nodes.push({ sel: '.next-word' });
	nodes.push({ sel: '.next-word', pseudo: '::before' });
	nodes.push({ sel: '.next-word', pseudo: '::after' });
	for (let i = 0; i < 3; i++) {
		const g = `.next-word .glyph:nth-of-type(${i + 1})`;
		nodes.push({ sel: g });
		nodes.push({ sel: g, pseudo: '::before' });
		nodes.push({ sel: g, pseudo: '::after' });
	}

	// tail + pseudos + first 2 glyphs.
	nodes.push({ sel: '.tail' });
	nodes.push({ sel: '.tail', pseudo: '::before' });
	nodes.push({ sel: '.tail', pseudo: '::after' });
	for (let i = 0; i < 2; i++) {
		nodes.push({ sel: `.tail .glyph:nth-of-type(${i + 1})` });
	}

	// edges + accept button.
	nodes.push({ sel: '.edge-left' });
	nodes.push({ sel: '.edge-right' });
	nodes.push({ sel: '.accept-button' });

	return nodes;
}

// ---------------------------------------------------------------------------
// Property capture + normalization.
// ---------------------------------------------------------------------------
//
// We dump ALL longhand computed properties EXCEPT the skip-list below. Rationale (from the
// critique): even with animations frozen, a handful of properties are inherently unstable or
// pure noise (per-run resource URLs, layout timing that survived the freeze). animation-* are
// dumped as LONGHANDS (never the shorthand). animation-name is normalized through the legacy
// suffix-strip map below so a pre-W3 baseline still diffs clean against post-W3 output. W3 has
// since removed that suffix from every effect identifier, so on the current tree the strip map
// is an idempotent no-op — it is retained as a belt-and-suspenders guard, not a live convention.

// Properties to skip: the animation SHORTHAND (we keep longhands), and a few known-unstable /
// redundant computed values. Kept deliberately small — do NOT loosen to hide real diffs.
export const SKIP_PROPERTIES = new Set([
	'animation', // shorthand — longhands are dumped instead
	'transition', // shorthand — longhands dumped instead
	'-webkit-animation',
	'-webkit-transition'
]);

/**
 * Strip the legacy migration suffix from every whitespace/comma-delimited token in a VALUE string.
 *
 * That suffix once marked the redesigned modules' keyframes/vars before the W3 rename. It used to
 * surface in computed-style VALUES in:
 *   1. the resolved `animation-name` longhand (e.g. "beam-open, flame-haze-breathe"), and
 *   2. the effect's `--*-motion` custom-property values (animation shorthands that name the
 *      keyframe, e.g. "--haze-motion: flame-haze-breathe 3.6s ...").
 * Normalizing ALL string values (not just animation-name) is what let a pre-rename baseline diff
 * clean against post-rename output. W3 has since removed the suffix from every effect identifier,
 * so on the current tree this strip is an idempotent no-op — retained only so an older baseline
 * (captured before the rename) still compares equal.
 *
 * Audited safe: the suffix only ever appeared as a keyframe/var-name suffix at a token boundary
 * (0 mid-token occurrences, never inside colors/urls). For a self-diff it is a no-op — identical
 * runs stay equal. See critique fatalFlaws[1].
 */
export function stripV2(value) {
	if (typeof value !== 'string' || !value.includes('-v2')) return value;
	// Replace `-v2` only when it ends a token (before whitespace, comma, or end-of-string).
	return value.replace(/-v2(?=[\s,]|$)/g, '');
}

/**
 * Strip the legacy migration suffix from a custom-property NAME (dump key).
 *
 * getComputedStyle enumerates every custom property, so before the W3 rename the suffixed vars
 * (registered @property names AND plain custom props — 230 distinct across the baseline) appeared
 * as dump keys; normalizing keys too kept an old baseline from showing false diffs. Audited safe:
 * 0 key collisions — stripping the suffix never yielded a key already present in the same node.
 * Only custom-property keys (`--…`) ever carried it; standard longhands never do. Post-rename this
 * is an idempotent no-op, retained only for cross-baseline comparison.
 */
export function stripV2Key(key) {
	return key.endsWith('-v2') ? key.slice(0, -3) : key;
}

/** Back-compat alias (older name). */
export const normalizeAnimationName = stripV2;

/** Apply the legacy suffix normalization to a full node dump (keys + values). New object. */
export function normalizeDumpNode(dump) {
	if (!dump) return dump;
	const out = {};
	for (const [key, value] of Object.entries(dump)) {
		out[stripV2Key(key)] = stripV2(value);
	}
	return out;
}

/**
 * In-page dumper. For a given selector (+optional pseudo), return an object of
 * { property: value } for every longhand, minus the skip-list, or null if the node is absent.
 * Runs inside the browser; must be a pure function string for page.evaluate. The legacy-suffix
 * normalization is applied AFTER capture (out-of-page) so the raw computed values are
 * transformed by one canonical implementation.
 */
export async function dumpNode(page, { sel, pseudo }, skipList) {
	const raw = await page.evaluate(
		([selector, pseudoEl, skip]) => {
			const el = document.querySelector(selector);
			if (!el) return null;
			const cs = getComputedStyle(el, pseudoEl || undefined);
			// A pseudo with content:'none'/no box still returns a style object; we keep it —
			// its properties (incl. content) are part of the visual contract.
			const out = {};
			const skipSet = new Set(skip);
			for (let i = 0; i < cs.length; i++) {
				const prop = cs.item(i);
				if (skipSet.has(prop)) continue;
				out[prop] = cs.getPropertyValue(prop);
			}
			return out;
		},
		[sel, pseudo || '', [...skipList]]
	);
	if (!raw) return null;
	// Normalize both keys (custom-property names) and values through the legacy suffix-strip map so
	// a baseline captured before the W3 keyframe/@property/custom-prop rename still compares equal.
	return normalizeDumpNode(raw);
}

// ---------------------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------------------

export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic JSON stringify with sorted keys, 2-space indent. */
export function stableStringify(value) {
	return JSON.stringify(sortDeep(value), null, 2);
}

function sortDeep(value) {
	if (Array.isArray(value)) return value.map(sortDeep);
	if (value && typeof value === 'object') {
		const out = {};
		for (const key of Object.keys(value).sort()) {
			out[key] = sortDeep(value[key]);
		}
		return out;
	}
	return value;
}
