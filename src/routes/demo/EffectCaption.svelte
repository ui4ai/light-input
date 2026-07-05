<script lang="ts">
	// Sits directly under the field: names the live effect and offers its per-effect import snippet
	// (copy-on-click) plus a "Simulate thinking" button that parks the field in the waiting state so
	// the thinking indicators can be admired without racing the 220ms demo reveal.
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { GlowVariant } from '@ui4ai/light-input';
	import { glowIcon } from './icons';
	import './accents.css';

	interface Props {
		glow: GlowVariant;
		label: string;
		simulating: boolean;
		onSimulate: () => void;
	}

	let { glow, label, simulating, onSimulate }: Props = $props();

	// Assembled from parts (not a literal `from '@ui4ai/...'`) so the import-guard test in
	// imports.test.ts doesn't mistake this display string for a real — and forbidden — deep import.
	const EFFECT_ENTRY_BASE = '@ui4ai/light-input/effects';
	const importSnippet = $derived(`import ${glow} from '${EFFECT_ENTRY_BASE}/${glow}';`);
	const Icon = $derived(glowIcon(glow));

	let copied = $state(false);
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

	async function copySnippet() {
		try {
			await navigator.clipboard?.writeText(importSnippet);
		} catch {
			return;
		}
		copied = true;
		clearTimeout(copyResetTimer);
		copyResetTimer = setTimeout(() => (copied = false), 1600);
	}

	// A fresh effect means the old "copied" tick no longer describes what's on the clipboard.
	$effect(() => {
		void glow;
		copied = false;
	});

	$effect(() => () => clearTimeout(copyResetTimer));
</script>

<div class="caption">
	<div class="caption-name glow-accent" data-glow={glow}>
		<span class="name-badge" aria-hidden="true">
			<Icon size={16} strokeWidth={2.25} />
		</span>
		<span class="name-text">{label}</span>
		<span class="name-glow">glow</span>
	</div>

	<button
		type="button"
		class="snippet"
		data-copied={copied ? 'true' : 'false'}
		aria-label={copied ? 'Import snippet copied' : `Copy import snippet: ${importSnippet}`}
		onclick={copySnippet}
	>
		<code class="snippet-code">{importSnippet}</code>
		<span class="snippet-copy" aria-hidden="true">
			{#if copied}
				<Check size={14} strokeWidth={2.5} />
			{:else}
				<Copy size={14} strokeWidth={2.25} />
			{/if}
		</span>
	</button>

	<button
		type="button"
		class="simulate"
		class:running={simulating}
		disabled={simulating}
		aria-label="Simulate a thinking pause to preview the waiting indicators"
		onclick={onSimulate}
	>
		<span class="simulate-icon" class:spin={simulating} aria-hidden="true">
			<LoaderCircle size={15} strokeWidth={2.5} />
		</span>
		<span>{simulating ? 'Thinking…' : 'Simulate thinking'}</span>
	</button>
</div>

<style>
	.caption {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 12px;
		align-items: center;
		justify-content: center;
		width: min(920px, 100%);
		margin: 0 auto;
		padding: 0 12px;
	}

	.caption-name {
		display: inline-grid;
		grid-template-columns: auto auto auto;
		gap: 7px;
		align-items: center;
		height: 38px;
		padding: 0 14px 0 10px;
		border: 1px solid var(--glow-border, var(--control-border));
		border-radius: 999px;
		background:
			radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.1), transparent 42%),
			linear-gradient(90deg, var(--glow-a, transparent), var(--glow-b, transparent)),
			var(--segment-bg);
		box-shadow: 0 0 22px var(--glow-shadow, transparent);
		color: var(--control-ink);
	}

	.name-badge {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
	}

	.name-text {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.name-glow {
		color: var(--control-muted);
		font-size: 12px;
		font-weight: 600;
	}

	.snippet {
		display: inline-grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 9px;
		align-items: center;
		height: 38px;
		max-width: 100%;
		padding: 0 11px 0 13px;
		border: 1px solid var(--control-border);
		border-radius: 12px;
		background: var(--segment-bg);
		color: var(--control-ink);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			border-color 180ms ease,
			box-shadow 180ms ease,
			transform 120ms ease;
	}

	.snippet-code {
		overflow: hidden;
		font-family: 'SF Mono', ui-monospace, 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 12.5px;
		font-weight: 500;
		letter-spacing: -0.01em;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.snippet-copy {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		color: var(--control-muted);
		transition: color 180ms ease;
	}

	.snippet:hover,
	.snippet:focus-visible {
		border-color: rgba(255, 190, 122, 0.32);
		box-shadow: 0 0 20px rgba(255, 132, 58, 0.12);
	}

	.snippet:hover .snippet-copy,
	.snippet:focus-visible .snippet-copy {
		color: var(--control-ink);
	}

	.snippet:active {
		transform: scale(0.98);
	}

	.snippet[data-copied='true'] {
		border-color: rgba(120, 224, 150, 0.42);
	}

	.snippet[data-copied='true'] .snippet-copy {
		color: rgb(120, 224, 150);
	}

	.simulate {
		display: inline-grid;
		grid-template-columns: 15px auto;
		gap: 7px;
		align-items: center;
		height: 38px;
		padding: 0 14px;
		border: 1px solid var(--control-border);
		border-radius: 12px;
		background: var(--segment-bg);
		color: var(--control-muted);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			color 180ms ease,
			border-color 180ms ease,
			box-shadow 180ms ease,
			transform 120ms ease;
	}

	.simulate span:last-child {
		font-size: 13px;
		font-weight: 650;
		white-space: nowrap;
	}

	.simulate-icon {
		display: grid;
		place-items: center;
	}

	.simulate:hover:not(:disabled),
	.simulate:focus-visible:not(:disabled) {
		color: var(--control-ink);
		border-color: rgba(255, 190, 122, 0.32);
		box-shadow: 0 0 20px rgba(255, 132, 58, 0.12);
	}

	.simulate:active:not(:disabled) {
		transform: scale(0.97);
	}

	.simulate.running {
		color: var(--control-ink);
		border-color: rgba(255, 190, 122, 0.34);
		cursor: default;
	}

	.simulate-icon.spin {
		animation: caption-spin 0.9s linear infinite;
	}

	@keyframes caption-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 620px) {
		.snippet {
			order: 3;
			flex: 1 1 100%;
			width: 100%;
		}
	}
</style>
