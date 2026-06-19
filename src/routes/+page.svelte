<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleOff from '@lucide/svelte/icons/circle-off';
	import Flashlight from '@lucide/svelte/icons/flashlight';
	import FlaskConical from '@lucide/svelte/icons/flask-conical';
	import Moon from '@lucide/svelte/icons/moon';
	import PanelTop from '@lucide/svelte/icons/panel-top';
	import ServerCog from '@lucide/svelte/icons/server-cog';
	import Sun from '@lucide/svelte/icons/sun';
	import Waves from '@lucide/svelte/icons/waves';
	import { env } from '$env/dynamic/public';
	import { onMount, tick } from 'svelte';
	import type { CompletionMode, GlowVariant, LoadingGlow, ThemeMode } from '$lib/autocomplete';
	import {
		DEMO_SETTINGS_STORAGE_KEY,
		DEFAULT_DEMO_SETTINGS,
		parseDemoSettings,
		serializeDemoSettings,
		type DemoSettings
	} from '$lib/demo-settings';
	import GhostInput from '$lib/GhostInput.svelte';
	import { glowOptions } from '$lib/glows';

	const DEMO_ONLY = env.PUBLIC_LIGHT_INPUT_DEMO_ONLY === 'true';

	let theme = $state<ThemeMode>(DEFAULT_DEMO_SETTINGS.theme);
	let glow = $state<GlowVariant>(DEFAULT_DEMO_SETTINGS.glow);
	let loadingGlow = $state<LoadingGlow>(DEFAULT_DEMO_SETTINGS.loadingGlow);
	let lightFlow = $state(DEFAULT_DEMO_SETTINGS.lightFlow);
	let completionMode = $state<CompletionMode>(
		DEMO_ONLY ? 'demo' : DEFAULT_DEMO_SETTINGS.completionMode
	);
	let glowMenuOpen = $state(false);
	let controlsEl = $state<HTMLElement>();
	let refocusFrame = 0;
	let settingsHydrated = false;

	const selectedGlow = $derived.by(() => {
		return glowOptions.find((option) => option.value === glow) ?? glowOptions[0];
	});

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
		glowMenuOpen = false;
		theme = nextTheme;
		persistSettings();
		void refocusInput();
	}

	function setGlow(nextGlow: GlowVariant) {
		glow = nextGlow;
		glowMenuOpen = false;
		persistSettings();
		void refocusInput();
	}

	function setLoadingGlow(nextGlow: LoadingGlow) {
		glowMenuOpen = false;
		loadingGlow = nextGlow;
		persistSettings();
		void refocusInput();
	}

	function setCompletionMode(nextMode: CompletionMode) {
		glowMenuOpen = false;
		completionMode = DEMO_ONLY ? 'demo' : nextMode;
		persistSettings();
		void refocusInput();
	}

	function toggleLightFlow() {
		glowMenuOpen = false;
		lightFlow = !lightFlow;
		persistSettings();
		void refocusInput();
	}

	function toggleGlowMenu() {
		glowMenuOpen = !glowMenuOpen;
		void refocusInput();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!glowMenuOpen || event.key !== 'Escape') return;
		glowMenuOpen = false;
		void refocusInput();
	}

	function onWindowPointerDown(event: PointerEvent) {
		if (!glowMenuOpen) return;
		if (event.target instanceof Node && controlsEl?.contains(event.target)) return;
		glowMenuOpen = false;
		void refocusInput();
	}

	onMount(() => {
		applySettings(parseDemoSettings(localStorage.getItem(DEMO_SETTINGS_STORAGE_KEY)));
		settingsHydrated = true;

		return () => {
			cancelAnimationFrame(refocusFrame);
		};
	});
</script>

<svelte:head>
	<meta name="color-scheme" content="dark light" />
</svelte:head>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerDown} />

<main class="scene" data-theme={theme}>
	<h1 class="sr-only">light-input ghost autocomplete demo</h1>

	<section class="controls" aria-label="Demo parameters" bind:this={controlsEl}>
		<div class="control-group">
			<span class="control-label">Theme</span>
			<div class="segmented" role="group" aria-label="Theme">
				<button
					type="button"
					class="segment"
					class:active={theme === 'dark'}
					aria-pressed={theme === 'dark'}
					onpointerdown={keepInputFocus}
					onclick={() => setTheme('dark')}
				>
					<Moon size={17} strokeWidth={2.25} aria-hidden="true" />
					<span>Dark</span>
				</button>
				<button
					type="button"
					class="segment"
					class:active={theme === 'light'}
					aria-pressed={theme === 'light'}
					onpointerdown={keepInputFocus}
					onclick={() => setTheme('light')}
				>
					<Sun size={17} strokeWidth={2.25} aria-hidden="true" />
					<span>Light</span>
				</button>
			</div>
		</div>

		<div class="control-group grow">
			<span class="control-label">Thinking</span>
			<div class="segmented three" role="group" aria-label="Thinking glow">
				<button
					type="button"
					class="segment"
					class:active={loadingGlow === 'torch'}
					aria-label="Caret glow"
					aria-pressed={loadingGlow === 'torch'}
					onpointerdown={keepInputFocus}
					onclick={() => setLoadingGlow('torch')}
				>
					<Flashlight size={17} strokeWidth={2.25} aria-hidden="true" />
					<span>Caret</span>
				</button>
				<button
					type="button"
					class="segment"
					class:active={loadingGlow === 'field'}
					aria-label="Field glow"
					aria-pressed={loadingGlow === 'field'}
					onpointerdown={keepInputFocus}
					onclick={() => setLoadingGlow('field')}
				>
					<PanelTop size={17} strokeWidth={2.25} aria-hidden="true" />
					<span>Field</span>
				</button>
				<button
					type="button"
					class="segment"
					class:active={loadingGlow === 'none'}
					aria-label="No thinking glow"
					aria-pressed={loadingGlow === 'none'}
					onpointerdown={keepInputFocus}
					onclick={() => setLoadingGlow('none')}
				>
					<CircleOff size={17} strokeWidth={2.25} aria-hidden="true" />
					<span>Off</span>
				</button>
			</div>
		</div>

		<div class="control-group mode-group">
			<span class="control-label">Mode</span>
			<div class="segmented mode" role="group" aria-label="Completion mode">
				{#if DEMO_ONLY}
					<button type="button" class="segment active locked" aria-pressed="true" disabled>
						<FlaskConical size={17} strokeWidth={2.25} aria-hidden="true" />
						<span>Demo</span>
					</button>
				{:else}
					<button
						type="button"
						class="segment"
						class:active={completionMode === 'llm'}
						aria-pressed={completionMode === 'llm'}
						onpointerdown={keepInputFocus}
						onclick={() => setCompletionMode('llm')}
					>
						<ServerCog size={17} strokeWidth={2.25} aria-hidden="true" />
						<span>LLM</span>
					</button>
					<button
						type="button"
						class="segment"
						class:active={completionMode === 'demo'}
						aria-pressed={completionMode === 'demo'}
						onpointerdown={keepInputFocus}
						onclick={() => setCompletionMode('demo')}
					>
						<FlaskConical size={17} strokeWidth={2.25} aria-hidden="true" />
						<span>Demo</span>
					</button>
				{/if}
			</div>
		</div>

		<div class="control-group glow-group">
			<span class="control-label">Glow</span>
			<div class="glow-picker" data-open={glowMenuOpen ? 'true' : 'false'}>
				<button
					type="button"
					class="glow-trigger"
					data-glow={selectedGlow.value}
					aria-haspopup="listbox"
					aria-expanded={glowMenuOpen}
					aria-label="Glow style"
					onpointerdown={keepInputFocus}
					onclick={toggleGlowMenu}
				>
					{#if selectedGlow}
						{@const SelectedIcon = selectedGlow.icon}
						<SelectedIcon size={17} strokeWidth={2.25} aria-hidden="true" />
						<span>{selectedGlow.label}</span>
					{/if}
					<span class="glow-chevron" aria-hidden="true">
						<ChevronDown size={17} strokeWidth={2.25} />
					</span>
				</button>

				{#if glowMenuOpen}
					<div class="glow-menu" role="listbox" aria-label="Glow style">
						{#each glowOptions as option}
							{@const Icon = option.icon}
							<button
								type="button"
								class="glow-option"
								class:active={glow === option.value}
								data-glow={option.value}
								role="option"
								aria-label={`${option.label} glow`}
								aria-selected={glow === option.value}
								onpointerdown={keepInputFocus}
								onclick={() => setGlow(option.value)}
							>
								<Icon size={17} strokeWidth={2.25} aria-hidden="true" />
								<span>{option.label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="control-group flow-group">
			<span class="control-label">Flow</span>
			<button
				type="button"
				class="flow-toggle"
				class:active={lightFlow}
				aria-pressed={lightFlow}
				onpointerdown={keepInputFocus}
				onclick={toggleLightFlow}
			>
				<Waves size={18} strokeWidth={2.25} aria-hidden="true" />
				<span class="toggle-text">{lightFlow ? 'On' : 'Off'}</span>
				<span class="toggle-rail" aria-hidden="true">
					<span class="toggle-dot"></span>
				</span>
			</button>
		</div>
	</section>

	<section class="demo" aria-label="Autocomplete demo">
		<GhostInput {glow} {loadingGlow} {lightFlow} {theme} {completionMode} />
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
		grid-template-rows: auto minmax(0, 1fr);
		gap: clamp(26px, 5vh, 64px);
		min-height: 100dvh;
		overflow: hidden;
		padding: 28px 48px 52px;
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
		top: 50%;
		z-index: -2;
		height: 260px;
		background: var(--scene-aurora);
		filter: blur(52px);
		transform: translateY(-12%);
		transition: background 520ms ease;
	}

	.controls {
		position: relative;
		z-index: 3;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-self: start;
		justify-self: center;
		width: min(1120px, 100%);
		padding: 10px;
		border: 1px solid var(--control-border);
		border-radius: 28px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0)),
			var(--control-bg);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.26) inset,
			0 20px 54px var(--control-shadow);
		backdrop-filter: blur(24px) saturate(1.2);
		-webkit-backdrop-filter: blur(24px) saturate(1.2);
	}

	.control-group {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 8px;
	}

	.control-group.grow {
		flex: 1 1 340px;
	}

	.flow-group {
		margin-left: auto;
	}

	.glow-group {
		flex: 1 1 100%;
		align-items: stretch;
	}

	.control-label {
		flex: 0 0 auto;
		color: var(--control-muted);
		font-size: 12px;
		font-weight: 650;
		line-height: 1;
		letter-spacing: 0;
	}

	.segmented {
		display: grid;
		grid-auto-columns: minmax(86px, 1fr);
		grid-auto-flow: column;
		gap: 4px;
		min-width: 0;
		padding: 4px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 20px;
		background: rgba(0, 0, 0, 0.12);
	}

	.scene[data-theme='light'] .segmented {
		border-color: rgba(54, 70, 101, 0.1);
		background: rgba(229, 236, 247, 0.68);
	}

	.segmented.three {
		width: min(100%, 342px);
	}

	.glow-picker {
		position: relative;
		flex: 1 1 auto;
		min-width: 0;
		z-index: 1;
		isolation: isolate;
	}

	.glow-picker[data-open='true'] {
		z-index: 40;
	}

	.segment,
	.flow-toggle,
	.glow-trigger,
	.glow-option {
		display: inline-grid;
		height: 42px;
		align-items: center;
		border: 1px solid transparent;
		color: var(--control-muted);
		background: transparent;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			color 180ms ease,
			border-color 180ms ease,
			background 180ms ease,
			box-shadow 180ms ease,
			transform 120ms ease;
	}

	.segment {
		grid-template-columns: 17px auto;
		gap: 7px;
		justify-content: center;
		min-width: 0;
		padding: 0 12px;
		border-radius: 16px;
	}

	.segment:disabled {
		cursor: default;
		transform: none;
	}

	.segment.locked {
		min-width: 112px;
	}

	.glow-trigger,
	.glow-option {
		--glow-a: rgba(255, 145, 72, 0.18);
		--glow-b: rgba(255, 214, 145, 0.08);
		--glow-border: rgba(255, 195, 139, 0.22);
		--glow-shadow: rgba(255, 128, 58, 0.16);

		position: relative;
		grid-template-columns: 17px minmax(0, auto);
		gap: 7px;
		justify-content: center;
		min-width: 0;
		padding: 0 11px;
		overflow: hidden;
		border-radius: 16px;
		background: var(--segment-bg);
		isolation: isolate;
	}

	.glow-trigger {
		grid-template-columns: 17px minmax(0, 1fr) 17px;
		justify-content: stretch;
		width: 100%;
		padding: 0 12px;
		border-radius: 18px;
		background:
			radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.1), transparent 34%),
			linear-gradient(90deg, var(--glow-a), var(--glow-b)),
			var(--segment-bg);
		border-color: var(--glow-border);
		box-shadow:
			0 0 26px var(--glow-shadow),
			0 1px 0 rgba(255, 255, 255, 0.13) inset;
		color: var(--control-ink);
	}

	.glow-chevron {
		justify-self: end;
		opacity: 0.66;
		transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.glow-picker[data-open='true'] .glow-chevron {
		transform: rotate(180deg);
	}

	.glow-option::before,
	.glow-option::after {
		position: absolute;
		content: '';
		pointer-events: none;
		border-radius: inherit;
		opacity: 0;
		transition:
			opacity 180ms ease,
			transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.glow-option::before {
		inset: -1px;
		z-index: -2;
		background:
			radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.16), transparent 34%),
			linear-gradient(90deg, var(--glow-a), var(--glow-b));
	}

	.glow-option::after {
		left: 12px;
		right: 12px;
		bottom: 4px;
		z-index: -1;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--glow-a), var(--glow-b), transparent);
		filter: blur(2px);
		transform: scaleX(0.54);
	}

	.glow-menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		right: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 5px;
		max-height: min(364px, calc(100dvh - 170px));
		padding: 6px;
		overflow: auto;
		border: 1px solid var(--control-border);
		border-radius: 20px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0)),
			rgba(18, 19, 23, 0.97);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.18) inset,
			0 24px 60px rgba(0, 0, 0, 0.34),
			0 0 0 1px rgba(0, 0, 0, 0.28);
		backdrop-filter: blur(24px) saturate(1.24);
		-webkit-backdrop-filter: blur(24px) saturate(1.24);
		scrollbar-width: none;
	}

	.glow-menu::-webkit-scrollbar {
		display: none;
	}

	.glow-menu .glow-option {
		justify-content: start;
		width: 100%;
		height: 40px;
	}

	.scene[data-theme='light'] .glow-menu {
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.32)),
			rgba(250, 253, 255, 0.98);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.86) inset,
			0 24px 60px rgba(29, 42, 69, 0.22),
			0 0 0 1px rgba(255, 255, 255, 0.68);
	}

	.glow-trigger[data-glow='candle'],
	.glow-option[data-glow='candle'] {
		--glow-a: rgba(255, 146, 45, 0.23);
		--glow-b: rgba(255, 213, 116, 0.1);
		--glow-border: rgba(255, 184, 91, 0.28);
		--glow-shadow: rgba(255, 113, 36, 0.17);
	}

	.glow-trigger[data-glow='lightning'],
	.glow-option[data-glow='lightning'] {
		--glow-a: rgba(80, 219, 255, 0.22);
		--glow-b: rgba(112, 93, 255, 0.12);
		--glow-border: rgba(113, 218, 255, 0.3);
		--glow-shadow: rgba(61, 205, 255, 0.16);
	}

	.glow-trigger[data-glow='aurora'],
	.glow-option[data-glow='aurora'] {
		--glow-a: rgba(80, 242, 190, 0.2);
		--glow-b: rgba(139, 122, 255, 0.11);
		--glow-border: rgba(102, 231, 198, 0.28);
		--glow-shadow: rgba(62, 220, 180, 0.14);
	}

	.glow-trigger[data-glow='plasma'],
	.glow-option[data-glow='plasma'] {
		--glow-a: rgba(255, 79, 204, 0.2);
		--glow-b: rgba(61, 227, 255, 0.12);
		--glow-border: rgba(245, 99, 214, 0.28);
		--glow-shadow: rgba(225, 76, 196, 0.15);
	}

	.glow-trigger[data-glow='prism'],
	.glow-option[data-glow='prism'] {
		--glow-a: rgba(255, 199, 72, 0.19);
		--glow-b: rgba(81, 171, 255, 0.13);
		--glow-border: rgba(180, 205, 255, 0.25);
		--glow-shadow: rgba(90, 174, 255, 0.14);
	}

	.glow-trigger[data-glow='ember'],
	.glow-option[data-glow='ember'] {
		--glow-a: rgba(255, 82, 35, 0.21);
		--glow-b: rgba(255, 155, 65, 0.1);
		--glow-border: rgba(255, 111, 70, 0.27);
		--glow-shadow: rgba(211, 63, 34, 0.16);
	}

	.glow-trigger[data-glow='neon'],
	.glow-option[data-glow='neon'] {
		--glow-a: rgba(86, 255, 185, 0.2);
		--glow-b: rgba(255, 70, 203, 0.11);
		--glow-border: rgba(102, 240, 196, 0.28);
		--glow-shadow: rgba(71, 240, 184, 0.15);
	}

	.glow-trigger[data-glow='nebula'],
	.glow-option[data-glow='nebula'] {
		--glow-a: rgba(155, 113, 255, 0.2);
		--glow-b: rgba(255, 172, 88, 0.1);
		--glow-border: rgba(174, 142, 255, 0.27);
		--glow-shadow: rgba(143, 103, 255, 0.16);
	}

	.glow-trigger[data-glow='smoke'],
	.glow-option[data-glow='smoke'] {
		--glow-a: rgba(235, 244, 248, 0.28);
		--glow-b: rgba(111, 132, 150, 0.18);
		--glow-border: rgba(232, 241, 248, 0.3);
		--glow-shadow: rgba(205, 225, 238, 0.18);
	}

	.glow-trigger[data-glow='solar'],
	.glow-option[data-glow='solar'] {
		--glow-a: rgba(255, 199, 66, 0.28);
		--glow-b: rgba(255, 74, 35, 0.14);
		--glow-border: rgba(255, 204, 89, 0.34);
		--glow-shadow: rgba(255, 154, 39, 0.22);
	}

	.glow-trigger[data-glow='holo'],
	.glow-option[data-glow='holo'] {
		--glow-a: rgba(78, 236, 255, 0.25);
		--glow-b: rgba(255, 63, 215, 0.16);
		--glow-border: rgba(133, 238, 255, 0.32);
		--glow-shadow: rgba(85, 219, 255, 0.2);
	}

	.glow-trigger[data-glow='blackhole'],
	.glow-option[data-glow='blackhole'] {
		--glow-a: rgba(16, 13, 27, 0.52);
		--glow-b: rgba(142, 90, 255, 0.16);
		--glow-border: rgba(148, 120, 255, 0.34);
		--glow-shadow: rgba(77, 48, 160, 0.24);
	}

	.glow-trigger[data-glow='flame'],
	.glow-option[data-glow='flame'] {
		--glow-a: rgba(255, 74, 18, 0.33);
		--glow-b: rgba(255, 205, 63, 0.14);
		--glow-border: rgba(255, 105, 42, 0.42);
		--glow-shadow: rgba(255, 60, 18, 0.28);
	}

	.glow-trigger[data-glow='matrix'],
	.glow-option[data-glow='matrix'] {
		--glow-a: rgba(56, 255, 124, 0.24);
		--glow-b: rgba(4, 88, 38, 0.2);
		--glow-border: rgba(93, 255, 151, 0.34);
		--glow-shadow: rgba(46, 255, 119, 0.22);
	}

	.glow-trigger[data-glow='snow'],
	.glow-option[data-glow='snow'] {
		--glow-a: rgba(221, 250, 255, 0.3);
		--glow-b: rgba(80, 170, 255, 0.16);
		--glow-border: rgba(210, 248, 255, 0.42);
		--glow-shadow: rgba(120, 206, 255, 0.22);
	}

	.glow-trigger[data-glow='toxic'],
	.glow-option[data-glow='toxic'] {
		--glow-a: rgba(187, 255, 38, 0.34);
		--glow-b: rgba(34, 255, 132, 0.18);
		--glow-border: rgba(201, 255, 60, 0.44);
		--glow-shadow: rgba(158, 255, 36, 0.28);
	}

	.glow-trigger[data-glow='vortex'],
	.glow-option[data-glow='vortex'] {
		--glow-a: rgba(70, 238, 255, 0.31);
		--glow-b: rgba(255, 62, 220, 0.19);
		--glow-border: rgba(113, 230, 255, 0.4);
		--glow-shadow: rgba(82, 173, 255, 0.28);
	}

	.glow-trigger[data-glow='bubblegum'],
	.glow-option[data-glow='bubblegum'] {
		--glow-a: rgba(255, 92, 190, 0.34);
		--glow-b: rgba(255, 190, 232, 0.2);
		--glow-border: rgba(255, 138, 214, 0.44);
		--glow-shadow: rgba(255, 88, 187, 0.28);
	}

	.glow-trigger[data-glow='optic'],
	.glow-option[data-glow='optic'] {
		--glow-a: rgba(204, 238, 255, 0.28);
		--glow-b: rgba(84, 118, 255, 0.18);
		--glow-border: rgba(185, 218, 255, 0.4);
		--glow-shadow: rgba(116, 150, 255, 0.26);
	}

	.glow-trigger[data-glow='biolume'],
	.glow-option[data-glow='biolume'] {
		--glow-a: rgba(41, 255, 214, 0.32);
		--glow-b: rgba(66, 102, 255, 0.18);
		--glow-border: rgba(91, 255, 221, 0.42);
		--glow-shadow: rgba(39, 229, 215, 0.28);
	}

	.glow-trigger[data-glow='ocean'],
	.glow-option[data-glow='ocean'] {
		--glow-a: rgba(32, 206, 255, 0.34);
		--glow-b: rgba(31, 92, 255, 0.2);
		--glow-border: rgba(91, 222, 255, 0.44);
		--glow-shadow: rgba(34, 184, 255, 0.28);
	}

	.glow-trigger[data-glow='horror'],
	.glow-option[data-glow='horror'] {
		--glow-a: rgba(255, 32, 54, 0.3);
		--glow-b: rgba(24, 0, 8, 0.34);
		--glow-border: rgba(255, 64, 88, 0.42);
		--glow-shadow: rgba(255, 20, 48, 0.26);
	}

	.glow-trigger[data-glow='heart'],
	.glow-option[data-glow='heart'] {
		--glow-a: rgba(255, 70, 132, 0.33);
		--glow-b: rgba(255, 152, 196, 0.19);
		--glow-border: rgba(255, 104, 162, 0.44);
		--glow-shadow: rgba(255, 62, 134, 0.28);
	}

	.glow-trigger[data-glow='liquidglass'],
	.glow-option[data-glow='liquidglass'] {
		--glow-a: rgba(224, 250, 255, 0.32);
		--glow-b: rgba(154, 190, 255, 0.18);
		--glow-border: rgba(225, 246, 255, 0.46);
		--glow-shadow: rgba(164, 220, 255, 0.28);
	}

	.glow-trigger[data-glow='android'],
	.glow-option[data-glow='android'] {
		--glow-a: rgba(84, 255, 133, 0.31);
		--glow-b: rgba(70, 220, 255, 0.18);
		--glow-border: rgba(118, 255, 155, 0.44);
		--glow-shadow: rgba(54, 232, 120, 0.26);
	}

	.glow-trigger[data-glow='fontshift'],
	.glow-option[data-glow='fontshift'] {
		--glow-a: rgba(255, 232, 160, 0.28);
		--glow-b: rgba(174, 116, 255, 0.16);
		--glow-border: rgba(255, 220, 138, 0.42);
		--glow-shadow: rgba(230, 172, 72, 0.24);
	}

	.glow-trigger[data-glow='rorschach'],
	.glow-option[data-glow='rorschach'] {
		--glow-a: rgba(238, 241, 255, 0.24);
		--glow-b: rgba(26, 18, 52, 0.26);
		--glow-border: rgba(205, 210, 255, 0.36);
		--glow-shadow: rgba(122, 116, 190, 0.22);
	}

	.glow-trigger[data-glow='diffusion'],
	.glow-option[data-glow='diffusion'] {
		--glow-a: rgba(255, 140, 220, 0.25);
		--glow-b: rgba(74, 224, 255, 0.18);
		--glow-border: rgba(255, 160, 230, 0.38);
		--glow-shadow: rgba(196, 86, 255, 0.24);
	}

	.glow-trigger[data-glow='chromabloom'],
	.glow-option[data-glow='chromabloom'] {
		--glow-a: rgba(255, 70, 120, 0.26);
		--glow-b: rgba(45, 238, 255, 0.2);
		--glow-border: rgba(255, 236, 92, 0.42);
		--glow-shadow: rgba(255, 72, 150, 0.26);
	}

	.glow-trigger[data-glow='infrared'],
	.glow-option[data-glow='infrared'] {
		--glow-a: rgba(255, 74, 44, 0.31);
		--glow-b: rgba(129, 70, 255, 0.2);
		--glow-border: rgba(255, 108, 54, 0.42);
		--glow-shadow: rgba(255, 78, 34, 0.26);
	}

	.glow-trigger[data-glow='staged'],
	.glow-option[data-glow='staged'] {
		--glow-a: rgba(255, 244, 196, 0.34);
		--glow-b: rgba(22, 18, 10, 0.22);
		--glow-border: rgba(255, 232, 156, 0.44);
		--glow-shadow: rgba(255, 218, 116, 0.26);
	}

	.glow-trigger[data-glow='blueprint'],
	.glow-option[data-glow='blueprint'] {
		--glow-a: rgba(62, 154, 255, 0.3);
		--glow-b: rgba(160, 232, 255, 0.16);
		--glow-border: rgba(110, 194, 255, 0.42);
		--glow-shadow: rgba(58, 142, 255, 0.24);
	}

	.segment.active,
	.flow-toggle.active,
	.glow-option.active {
		color: var(--control-ink);
		border-color: var(--segment-active-border);
		background: var(--segment-active-bg);
		box-shadow:
			0 0 28px var(--segment-shadow),
			0 1px 0 rgba(255, 255, 255, 0.14) inset;
	}

	.glow-option.active {
		border-color: var(--glow-border);
		box-shadow:
			0 0 30px var(--glow-shadow),
			0 1px 0 rgba(255, 255, 255, 0.15) inset;
	}

	.glow-option.active::before {
		opacity: 1;
	}

	.glow-option.active::after {
		opacity: 0.9;
		transform: scaleX(1);
	}

	.segment:active,
	.flow-toggle:active,
	.glow-trigger:active,
	.glow-option:active {
		transform: scale(0.97);
	}

	.segment span,
	.glow-trigger span,
	.glow-option span,
	.toggle-text {
		overflow: hidden;
		font-size: 13px;
		font-weight: 650;
		line-height: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.flow-toggle {
		grid-template-columns: 18px auto 42px;
		gap: 8px;
		min-width: 120px;
		padding: 0 9px 0 12px;
		border-radius: 19px;
		background: var(--segment-bg);
	}

	.toggle-rail {
		position: relative;
		width: 40px;
		height: 22px;
		border-radius: 999px;
		background: var(--rail-bg);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.1) inset;
	}

	.toggle-dot {
		position: absolute;
		top: 4px;
		left: 4px;
		width: 14px;
		height: 14px;
		border-radius: 999px;
		background: var(--rail-dot);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
		transition:
			transform 210ms cubic-bezier(0.16, 1, 0.3, 1),
			background 180ms ease,
			box-shadow 180ms ease;
	}

	.flow-toggle.active .toggle-dot {
		background: rgb(255, 193, 122);
		box-shadow:
			0 0 14px rgba(255, 132, 58, 0.52),
			0 2px 8px rgba(0, 0, 0, 0.2);
		transform: translateX(18px);
	}

	.demo {
		position: relative;
		z-index: 1;
		display: grid;
		width: 100%;
		min-height: 0;
		place-items: center;
	}

	@media (max-width: 900px) {
		.scene {
			gap: 32px;
			padding: 22px 18px 32px;
		}

		.scene::after {
			display: none;
		}

		.controls {
			width: min(100%, 640px);
			border-radius: 24px;
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}

		.glow-menu {
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}

		.control-group,
		.control-group.grow,
		.flow-group {
			flex: 1 1 100%;
			margin-left: 0;
		}

		.control-label {
			width: 58px;
		}

		.segmented,
		.segmented.three,
		.glow-picker,
		.flow-toggle {
			flex: 1 1 auto;
			width: auto;
		}

		.glow-menu {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 520px) {
		.scene {
			gap: 24px;
			padding: 18px 14px 24px;
		}

		.controls {
			gap: 8px;
			padding: 8px;
			border-radius: 22px;
		}

		.control-group {
			display: grid;
			grid-template-columns: 54px minmax(0, 1fr);
			gap: 8px;
			width: 100%;
		}

		.segmented {
			grid-auto-columns: minmax(0, 1fr);
		}

		.segment,
		.glow-trigger,
		.glow-option {
			gap: 5px;
			padding: 0 8px;
		}

		.segment span,
		.glow-trigger span,
		.glow-option span,
		.toggle-text {
			font-size: 12px;
		}

		.glow-menu {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			max-height: min(340px, calc(100dvh - 292px));
		}

		.flow-toggle {
			grid-template-columns: 18px auto 40px;
			width: 100%;
		}
	}

	@media (max-width: 360px) {
		.segmented.three .segment {
			grid-template-columns: 17px;
			padding: 0;
		}

		.segmented.three .segment span {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}
	}

	@media (max-height: 620px) and (orientation: landscape) {
		.scene {
			gap: 18px;
			padding-block: 14px;
		}

		.controls {
			transform: scale(0.94);
			transform-origin: top center;
		}
	}
</style>
