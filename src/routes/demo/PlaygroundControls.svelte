<script lang="ts">
	// The quick-toggle bar: Theme, Thinking glow, Completion mode, Light flow. Extracted verbatim
	// (chrome + behaviour) from the pre-split +page.svelte controls; the glow picker moved out to
	// GlowRail. Values + setters are supplied by the page so it stays the single source of truth.
	import CircleOff from '@lucide/svelte/icons/circle-off';
	import FlaskConical from '@lucide/svelte/icons/flask-conical';
	import Flashlight from '@lucide/svelte/icons/flashlight';
	import Moon from '@lucide/svelte/icons/moon';
	import PanelTop from '@lucide/svelte/icons/panel-top';
	import ServerCog from '@lucide/svelte/icons/server-cog';
	import Sun from '@lucide/svelte/icons/sun';
	import Waves from '@lucide/svelte/icons/waves';
	import type { CompletionMode, LoadingGlow, ThemeMode } from '@ui4ai/light-input';

	interface Props {
		theme: ThemeMode;
		loadingGlow: LoadingGlow;
		completionMode: CompletionMode;
		lightFlow: boolean;
		demoOnly: boolean;
		onKeepFocus: (event: PointerEvent) => void;
		onSetTheme: (theme: ThemeMode) => void;
		onSetLoadingGlow: (glow: LoadingGlow) => void;
		onSetCompletionMode: (mode: CompletionMode) => void;
		onToggleLightFlow: () => void;
	}

	let {
		theme,
		loadingGlow,
		completionMode,
		lightFlow,
		demoOnly,
		onKeepFocus,
		onSetTheme,
		onSetLoadingGlow,
		onSetCompletionMode,
		onToggleLightFlow
	}: Props = $props();
</script>

<section class="controls" aria-label="Demo parameters">
	<div class="control-group">
		<span class="control-label">Theme</span>
		<div class="segmented" role="group" aria-label="Theme">
			<button
				type="button"
				class="segment"
				class:active={theme === 'dark'}
				aria-pressed={theme === 'dark'}
				onpointerdown={onKeepFocus}
				onclick={() => onSetTheme('dark')}
			>
				<Moon size={17} strokeWidth={2.25} aria-hidden="true" />
				<span>Dark</span>
			</button>
			<button
				type="button"
				class="segment"
				class:active={theme === 'light'}
				aria-pressed={theme === 'light'}
				onpointerdown={onKeepFocus}
				onclick={() => onSetTheme('light')}
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
				onpointerdown={onKeepFocus}
				onclick={() => onSetLoadingGlow('torch')}
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
				onpointerdown={onKeepFocus}
				onclick={() => onSetLoadingGlow('field')}
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
				onpointerdown={onKeepFocus}
				onclick={() => onSetLoadingGlow('none')}
			>
				<CircleOff size={17} strokeWidth={2.25} aria-hidden="true" />
				<span>Off</span>
			</button>
		</div>
	</div>

	<div class="control-group mode-group">
		<span class="control-label">Mode</span>
		<div class="segmented mode" role="group" aria-label="Completion mode">
			{#if demoOnly}
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
					onpointerdown={onKeepFocus}
					onclick={() => onSetCompletionMode('llm')}
				>
					<ServerCog size={17} strokeWidth={2.25} aria-hidden="true" />
					<span>LLM</span>
				</button>
				<button
					type="button"
					class="segment"
					class:active={completionMode === 'demo'}
					aria-pressed={completionMode === 'demo'}
					onpointerdown={onKeepFocus}
					onclick={() => onSetCompletionMode('demo')}
				>
					<FlaskConical size={17} strokeWidth={2.25} aria-hidden="true" />
					<span>Demo</span>
				</button>
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
			onpointerdown={onKeepFocus}
			onclick={onToggleLightFlow}
		>
			<Waves size={18} strokeWidth={2.25} aria-hidden="true" />
			<span class="toggle-text">{lightFlow ? 'On' : 'Off'}</span>
			<span class="toggle-rail" aria-hidden="true">
				<span class="toggle-dot"></span>
			</span>
		</button>
	</div>
</section>

<style>
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
		border-radius: 24px;
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

	:global(.scene[data-theme='light']) .segmented {
		border-color: rgba(54, 70, 101, 0.1);
		background: rgba(229, 236, 247, 0.68);
	}

	.segmented.three {
		width: min(100%, 342px);
	}

	.segment,
	.flow-toggle {
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

	.segment.active,
	.flow-toggle.active {
		color: var(--control-ink);
		border-color: var(--segment-active-border);
		background: var(--segment-active-bg);
		box-shadow:
			0 0 28px var(--segment-shadow),
			0 1px 0 rgba(255, 255, 255, 0.14) inset;
	}

	.segment:active,
	.flow-toggle:active {
		transform: scale(0.97);
	}

	.segment span,
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

	@media (max-width: 900px) {
		.controls {
			width: min(100%, 640px);
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
		.flow-toggle {
			flex: 1 1 auto;
			width: auto;
		}
	}

	@media (max-width: 520px) {
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

		.segment {
			gap: 5px;
			padding: 0 8px;
		}

		.segment span,
		.toggle-text {
			font-size: 12px;
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
</style>
