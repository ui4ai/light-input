<script lang="ts">
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import { onMount, tick } from 'svelte';
	// Dogfood the published package: the demo resolves these exactly as external consumers do (root
	// for the component + contract, '/effects' for the full registry). The svelte.config alias points
	// the specifiers at src/lib in dev/build.
	import {
		GhostInput,
		GLOW_VARIANTS,
		type CompletionMode,
		type GlowVariant,
		type LoadingGlow,
		type ThemeMode
	} from '@ui4ai/light-input';
	import { glowOptions } from '@ui4ai/light-input/effects';
	import {
		DEMO_SETTINGS_STORAGE_KEY,
		DEFAULT_DEMO_SETTINGS,
		parseDemoSettings,
		serializeDemoSettings,
		type DemoSettings
	} from './demo/settings';
	import Hero from './demo/Hero.svelte';
	import PlaygroundControls from './demo/PlaygroundControls.svelte';
	import GlowRail from './demo/GlowRail.svelte';
	import EffectCaption from './demo/EffectCaption.svelte';

	const DEMO_ONLY = env.PUBLIC_LIGHT_INPUT_DEMO_ONLY === 'true';
	const EFFECT_QUERY_PARAM = 'effect';
	const KNOWN_GLOWS = new Set<string>(GLOW_VARIANTS);
	/** Hold the field in the waiting state this long when "Simulate thinking" is pressed. */
	const SIMULATE_THINKING_MS = 2500;

	let theme = $state<ThemeMode>(DEFAULT_DEMO_SETTINGS.theme);
	let glow = $state<GlowVariant>(DEFAULT_DEMO_SETTINGS.glow);
	let loadingGlow = $state<LoadingGlow>(DEFAULT_DEMO_SETTINGS.loadingGlow);
	let lightFlow = $state(DEFAULT_DEMO_SETTINGS.lightFlow);
	let completionMode = $state<CompletionMode>(
		DEMO_ONLY ? 'demo' : DEFAULT_DEMO_SETTINGS.completionMode
	);
	let simulating = $state(false);
	let refocusFrame = 0;
	let settingsHydrated = false;

	const selectedGlow = $derived(
		glowOptions.find((option) => option.value === glow) ?? glowOptions[0]
	);

	function focusInput() {
		document.querySelector<HTMLInputElement>('[data-testid="ghost-input"]')?.focus({
			preventScroll: true
		});
	}

	function currentSettings(): DemoSettings {
		return {
			theme,
			glow,
			loadingGlow,
			lightFlow,
			completionMode: DEMO_ONLY ? 'demo' : completionMode
		};
	}

	function normalizeSettings(settings: DemoSettings): DemoSettings {
		return DEMO_ONLY ? { ...settings, completionMode: 'demo' } : settings;
	}

	function applySettings(settings: DemoSettings) {
		const nextSettings = normalizeSettings(settings);
		theme = nextSettings.theme;
		glow = nextSettings.glow;
		loadingGlow = nextSettings.loadingGlow;
		lightFlow = nextSettings.lightFlow;
		completionMode = nextSettings.completionMode;
	}

	function persistSettings() {
		if (!settingsHydrated) return;
		localStorage.setItem(DEMO_SETTINGS_STORAGE_KEY, serializeDemoSettings(currentSettings()));
	}

	// Deep links use the native History API, not SvelteKit's replaceState. This route is prerendered
	// (prerender = true) and served as a static page, where kit's client router never finishes
	// initializing for this single-page demo — kit's replaceState throws "before router is
	// initialized" on load AND on later clicks. The `?effect=` value is page state, not navigation
	// (no data reload, no route change), so history.replaceState is the correct primitive. We
	// preserve kit's own history state object and only ever read the effect from `location`, so the
	// router and this URL can never disagree. Everything is guarded by `browser` (never runs on SSR).

	/** A `?effect=<name>` value from the URL, if it names a real effect; otherwise null. */
	function deepLinkGlow(): GlowVariant | null {
		if (!browser) return null;
		const raw = new URLSearchParams(window.location.search).get(EFFECT_QUERY_PARAM);
		return raw && KNOWN_GLOWS.has(raw) ? (raw as GlowVariant) : null;
	}

	/** Reflect the active effect into `?effect=` (no history entry, no navigation, no data reload). */
	function syncEffectQuery() {
		if (!settingsHydrated || !browser) return;
		const url = new URL(window.location.href);
		if (url.searchParams.get(EFFECT_QUERY_PARAM) === glow) return;
		url.searchParams.set(EFFECT_QUERY_PARAM, glow);
		window.history.replaceState(window.history.state, '', url);
	}

	async function refocusInput() {
		await tick();
		focusInput();
		cancelAnimationFrame(refocusFrame);
		refocusFrame = requestAnimationFrame(focusInput);
	}

	function keepInputFocus(event: PointerEvent) {
		event.preventDefault();
	}

	function setTheme(nextTheme: ThemeMode) {
		theme = nextTheme;
		persistSettings();
		void refocusInput();
	}

	function setGlow(nextGlow: GlowVariant) {
		glow = nextGlow;
		persistSettings();
		syncEffectQuery();
		void refocusInput();
	}

	function setLoadingGlow(nextGlow: LoadingGlow) {
		loadingGlow = nextGlow;
		persistSettings();
		void refocusInput();
	}

	function setCompletionMode(nextMode: CompletionMode) {
		completionMode = DEMO_ONLY ? 'demo' : nextMode;
		persistSettings();
		void refocusInput();
	}

	function toggleLightFlow() {
		lightFlow = !lightFlow;
		persistSettings();
		void refocusInput();
	}

	// --- Simulate thinking -------------------------------------------------------------------
	//
	// The field only shows the waiting indicators while the completion engine is loading with no
	// suggestion yet — in demo mode that window is a 220ms blink. To hold it open, we briefly flip
	// to LLM mode with `window.fetch` stubbed to resolve after ~2.5s. Flipping the mode re-runs the
	// engine's prediction (its source-key effect calls schedulePrediction when the field has text,
	// focus, and the caret at the end), which hits the stubbed fetch and parks in `waiting`. When
	// the timer fires the fetch resolves with the scripted completion and we restore the prior mode.
	//
	// If the field is empty there's nothing to predict, so we first seed a completable prefix (in
	// LLM mode, so onBeforeInput doesn't intercept it). This is a demo-only affordance that never
	// touches the package.

	/** The demo sentence the field completes; mirrors the package's DEMO_COMPLETION_TEXT. */
	const DEMO_SENTENCE = "Let's make something that actually makes a difference";
	/** A completable seed used when the field is empty at simulate time. */
	const SIMULATE_SEED = "Let's make so";

	function fixedDemoCompletion(text: string): string {
		const clipped = text.trimStart().slice(0, DEMO_SENTENCE.length);
		if (!DEMO_SENTENCE.toLowerCase().startsWith(clipped.toLowerCase())) return '';
		return DEMO_SENTENCE.slice(clipped.length);
	}

	let originalFetch: typeof window.fetch | null = null;
	let simulateTimer: ReturnType<typeof setTimeout> | undefined;
	let revealTimer: ReturnType<typeof setTimeout> | undefined;
	let preSimulateMode: CompletionMode = 'demo';

	function restoreSimulate() {
		clearTimeout(simulateTimer);
		clearTimeout(revealTimer);
		simulateTimer = undefined;
		revealTimer = undefined;
		if (originalFetch) {
			window.fetch = originalFetch;
			originalFetch = null;
		}
		completionMode = DEMO_ONLY ? 'demo' : preSimulateMode;
		simulating = false;
	}

	/**
	 * Set the input value through the native setter + a real `input` event so Svelte's bind:value
	 * syncs. Runs in LLM mode where onBeforeInput early-returns, so the literal value flows straight
	 * through onInput and drives the engine.
	 */
	function seedText(input: HTMLInputElement, text: string) {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(input, text);
		input.setSelectionRange(text.length, text.length);
		input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true }));
	}

	async function simulateThinking() {
		if (simulating) return;
		const input = document.querySelector<HTMLInputElement>('[data-testid="ghost-input"]');
		if (!input) return;

		simulating = true;
		preSimulateMode = completionMode;
		input.focus();

		// Stub fetch to hang, then resolve after the hold with the scripted completion for the final
		// text — so the field reveals a real ghost when it finishes "thinking".
		originalFetch = window.fetch;
		let resolveFetch: ((value: Response) => void) | null = null;
		window.fetch = (() =>
			new Promise<Response>((resolve) => {
				resolveFetch = resolve;
			})) as typeof window.fetch;

		// LLM mode: onBeforeInput early-returns so a seeded literal value flows through. Flipping the
		// mode also re-runs the engine's prediction against the stubbed (hanging) fetch -> waiting.
		completionMode = 'llm';
		await tick();
		if (!input.value.trim()) seedText(input, SIMULATE_SEED);
		await refocusInput();

		simulateTimer = setTimeout(() => {
			const completion = fixedDemoCompletion(input.value);
			resolveFetch?.(
				new Response(JSON.stringify({ completion }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			);
			// Let the resolved suggestion render, then drop back to the prior mode + real fetch.
			revealTimer = setTimeout(restoreSimulate, 90);
		}, SIMULATE_THINKING_MS);
	}

	onMount(() => {
		applySettings(parseDemoSettings(localStorage.getItem(DEMO_SETTINGS_STORAGE_KEY)));

		// A valid `?effect=` overrides the stored glow (deep-link takes precedence on load).
		const linked = deepLinkGlow();
		if (linked) glow = linked;

		settingsHydrated = true;
		// Persist the resolved state (deep link may have changed glow) and reflect it into the URL.
		persistSettings();
		syncEffectQuery();

		return () => {
			cancelAnimationFrame(refocusFrame);
			restoreSimulate();
		};
	});
</script>

<svelte:head>
	<meta name="color-scheme" content="dark light" />
</svelte:head>

<main class="scene" data-theme={theme}>
	<h1 class="sr-only">light-input ghost autocomplete demo</h1>

	<Hero />

	<div class="controls-row">
		<GlowRail {glow} onSelect={setGlow} onKeepFocus={keepInputFocus} />
		<PlaygroundControls
			{theme}
			{loadingGlow}
			{completionMode}
			{lightFlow}
			demoOnly={DEMO_ONLY}
			onKeepFocus={keepInputFocus}
			onSetTheme={setTheme}
			onSetLoadingGlow={setLoadingGlow}
			onSetCompletionMode={setCompletionMode}
			onToggleLightFlow={toggleLightFlow}
		/>
	</div>

	<section class="demo" aria-label="Autocomplete demo">
		<div class="stage-wrap">
			<GhostInput
				{glow}
				layer={selectedGlow.layer}
				{loadingGlow}
				{lightFlow}
				{theme}
				{completionMode}
			/>
			<EffectCaption
				{glow}
				label={selectedGlow.label}
				{simulating}
				onSimulate={simulateThinking}
			/>
		</div>
	</section>
</main>

<style>
	.scene {
		--scene-bg:
			linear-gradient(180deg, rgba(29, 31, 37, 0.56), rgba(8, 9, 11, 0.96) 58%),
			linear-gradient(110deg, rgba(15, 31, 40, 0.34), transparent 42%),
			linear-gradient(290deg, rgba(52, 24, 32, 0.36), transparent 48%),
			rgb(8, 9, 11);
		--scene-aurora: linear-gradient(
			90deg,
			transparent,
			rgba(48, 66, 70, 0.13) 18%,
			rgba(120, 55, 46, 0.18) 54%,
			transparent
		);
		--control-bg: rgba(16, 17, 21, 0.62);
		--control-border: rgba(255, 255, 255, 0.09);
		--control-ink: rgba(248, 243, 237, 0.9);
		--control-muted: rgba(248, 243, 237, 0.46);
		--segment-bg: rgba(255, 255, 255, 0.04);
		--segment-active-bg:
			radial-gradient(circle at 22% 18%, rgba(255, 237, 211, 0.16), transparent 44%),
			linear-gradient(90deg, rgba(255, 134, 62, 0.2), rgba(255, 195, 129, 0.1));
		--segment-active-border: rgba(255, 195, 139, 0.22);
		--segment-shadow: rgba(255, 128, 58, 0.17);
		--control-shadow: rgba(0, 0, 0, 0.18);
		--rail-bg: rgba(255, 255, 255, 0.1);
		--rail-dot: rgb(130, 132, 142);

		position: relative;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		gap: clamp(18px, 3.2vh, 34px);
		min-height: 100dvh;
		overflow: hidden;
		padding: 26px 48px 44px;
		color: var(--control-ink);
		isolation: isolate;
		color-scheme: dark;
		transition:
			color 420ms ease,
			background 420ms ease;
	}

	.scene[data-theme='light'] {
		--scene-bg:
			linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(229, 236, 247, 0.94) 62%),
			linear-gradient(128deg, rgba(107, 142, 204, 0.16), transparent 46%),
			linear-gradient(304deg, rgba(255, 154, 84, 0.13), transparent 42%),
			rgb(233, 239, 249);
		--scene-aurora: linear-gradient(
			90deg,
			transparent,
			rgba(89, 123, 194, 0.12) 18%,
			rgba(255, 141, 72, 0.14) 54%,
			transparent
		);
		--control-bg: rgba(255, 255, 255, 0.72);
		--control-border: rgba(57, 73, 104, 0.16);
		--control-ink: rgba(24, 29, 40, 0.92);
		--control-muted: rgba(47, 59, 82, 0.58);
		--segment-bg: rgba(245, 248, 253, 0.76);
		--segment-active-bg:
			radial-gradient(circle at 22% 18%, rgba(255, 255, 255, 0.86), transparent 46%),
			linear-gradient(90deg, rgba(255, 147, 72, 0.2), rgba(98, 128, 193, 0.08));
		--segment-active-border: rgba(196, 103, 44, 0.34);
		--segment-shadow: rgba(220, 101, 36, 0.16);
		--control-shadow: rgba(29, 42, 69, 0.16);
		--rail-bg: rgba(42, 54, 78, 0.14);
		--rail-dot: rgb(102, 111, 132);

		color-scheme: light;
	}

	.scene::before,
	.scene::after {
		position: absolute;
		content: '';
		pointer-events: none;
	}

	.scene::before {
		inset: 0;
		z-index: -3;
		background: var(--scene-bg);
		transition: background 520ms ease;
	}

	.scene::after {
		left: 9vw;
		right: 9vw;
		top: 54%;
		z-index: -2;
		height: 260px;
		background: var(--scene-aurora);
		filter: blur(52px);
		transform: translateY(-12%);
		transition: background 520ms ease;
	}

	.controls-row {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-self: start;
		justify-self: center;
		width: min(1120px, 100%);
	}

	.demo {
		position: relative;
		z-index: 1;
		display: grid;
		width: 100%;
		min-height: 0;
		place-items: center;
	}

	.stage-wrap {
		display: flex;
		flex-direction: column;
		gap: clamp(18px, 3vh, 30px);
		align-items: center;
		width: 100%;
	}

	@media (max-width: 900px) {
		.scene {
			gap: 20px;
			padding: 22px 18px 32px;
		}

		.scene::after {
			display: none;
		}
	}

	@media (max-width: 520px) {
		.scene {
			gap: 18px;
			padding: 18px 14px 24px;
		}
	}

	@media (max-height: 620px) and (orientation: landscape) {
		.scene {
			gap: 14px;
			padding-block: 14px;
		}
	}
</style>
