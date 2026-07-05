<script lang="ts">
	// The glow gallery — replaces the 39-item dropdown with a searchable, keyboard-navigable band of
	// grouped chips. Groups follow GLOW_VARIANTS order (Classics = the 12 originals, Cinematic = the
	// 27 redesigned skins). Keyboard: '/' focuses search, ArrowLeft/ArrowRight step to the prev/next
	// effect (scoped to the rail so they never fight the ghost input's Tab/ArrowRight accept), and
	// each chip is a real button. Icons come from demo/icons.ts; accent palettes from accents.css.
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import { glowOptions, type GlowOption } from '@ui4ai/light-input/effects';
	import type { GlowVariant } from '@ui4ai/light-input';
	import { glowIcon } from './icons';
	import './accents.css';

	interface Props {
		glow: GlowVariant;
		onSelect: (glow: GlowVariant) => void;
		onKeepFocus: (event: PointerEvent) => void;
	}

	let { glow, onSelect, onKeepFocus }: Props = $props();

	// The classic dozen open GLOW_VARIANTS; everything after `holo` is a redesigned "cinematic" skin.
	const CLASSIC_COUNT = 12;
	const classicGroup = glowOptions.slice(0, CLASSIC_COUNT);
	const cinematicGroup = glowOptions.slice(CLASSIC_COUNT);

	let query = $state('');
	let searchEl = $state<HTMLInputElement>();
	let railEl = $state<HTMLElement>();

	const normalizedQuery = $derived(query.trim().toLowerCase());

	function matches(option: GlowOption): boolean {
		if (!normalizedQuery) return true;
		return (
			option.label.toLowerCase().includes(normalizedQuery) ||
			option.value.toLowerCase().includes(normalizedQuery)
		);
	}

	const filteredClassics = $derived(classicGroup.filter(matches));
	const filteredCinematic = $derived(cinematicGroup.filter(matches));
	// The flat, in-order list of what's currently shown — the track ArrowLeft/Right walks.
	const visibleOptions = $derived([...filteredClassics, ...filteredCinematic]);
	const resultCount = $derived(visibleOptions.length);

	function selectByOffset(offset: number) {
		const list = visibleOptions.length ? visibleOptions : glowOptions;
		if (!list.length) return;
		const current = list.findIndex((option) => option.value === glow);
		// If the active effect is filtered out, Arrow starts from the list edge.
		const base = current === -1 ? (offset > 0 ? -1 : 0) : current;
		const next = (base + offset + list.length) % list.length;
		onSelect(list[next].value as GlowVariant);
	}

	async function focusSearch() {
		await tick();
		searchEl?.focus();
		searchEl?.select();
	}

	function clearSearch() {
		query = '';
		searchEl?.focus();
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
	}

	function railHasFocus(): boolean {
		const active = document.activeElement;
		return active instanceof Node && !!railEl?.contains(active);
	}

	function onWindowKeydown(event: KeyboardEvent) {
		// '/' focuses search from anywhere the user isn't already typing.
		if (event.key === '/' && !isTypingTarget(event.target)) {
			event.preventDefault();
			void focusSearch();
			return;
		}

		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		// Arrow browsing is scoped to the rail: focus must be on the search box or a chip. This keeps
		// ArrowRight free for the ghost input (accept next word) and normal caret movement elsewhere.
		if (!railHasFocus()) return;
		// Inside the search box, let the caret move unless the field is empty (then browse).
		if (event.target === searchEl && query.length > 0) return;
		event.preventDefault();
		selectByOffset(event.key === 'ArrowRight' ? 1 : -1);
	}

	function onSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && query) {
			event.preventDefault();
			clearSearch();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<section class="glow-rail" aria-label="Glow style gallery" bind:this={railEl}>
	<div class="rail-head">
		<span class="rail-title">Glow</span>
		<div class="rail-search">
			<Search size={15} strokeWidth={2.25} aria-hidden="true" />
			<input
				bind:this={searchEl}
				bind:value={query}
				type="text"
				class="rail-search-input"
				placeholder="Search 39 effects — press /"
				aria-label="Search glow effects"
				autocomplete="off"
				autocorrect="off"
				autocapitalize="off"
				spellcheck="false"
				onkeydown={onSearchKeydown}
			/>
			{#if query}
				<button type="button" class="rail-search-clear" aria-label="Clear search" onclick={clearSearch}>
					<X size={14} strokeWidth={2.5} aria-hidden="true" />
				</button>
			{/if}
		</div>
		<span class="rail-count" aria-live="polite">
			{#if normalizedQuery}
				{resultCount} match{resultCount === 1 ? '' : 'es'}
			{:else}
				39 effects
			{/if}
		</span>
	</div>

	{#if resultCount === 0}
		<p class="rail-empty">No effect matches “{query}”.</p>
	{:else}
		<div class="rail-groups" role="listbox" aria-label="Glow style">
			{#if filteredClassics.length}
				<div class="rail-group">
					<span class="group-label">Classics</span>
					<div class="chip-row">
						{#each filteredClassics as option (option.value)}
							{@const Icon = glowIcon(option.value)}
							<button
								type="button"
								class="glow-accent"
								class:active={glow === option.value}
								data-glow={option.value}
								role="option"
								aria-selected={glow === option.value}
								aria-label={`${option.label} glow`}
								onpointerdown={onKeepFocus}
								onclick={() => onSelect(option.value as GlowVariant)}
							>
								<Icon size={16} strokeWidth={2.25} aria-hidden="true" />
								<span>{option.label}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if filteredCinematic.length}
				<div class="rail-group">
					<span class="group-label">Cinematic</span>
					<div class="chip-row">
						{#each filteredCinematic as option (option.value)}
							{@const Icon = glowIcon(option.value)}
							<button
								type="button"
								class="glow-accent"
								class:active={glow === option.value}
								data-glow={option.value}
								role="option"
								aria-selected={glow === option.value}
								aria-label={`${option.label} glow`}
								onpointerdown={onKeepFocus}
								onclick={() => onSelect(option.value as GlowVariant)}
							>
								<Icon size={16} strokeWidth={2.25} aria-hidden="true" />
								<span>{option.label}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.glow-rail {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: min(1120px, 100%);
		margin: 0 auto;
		padding: 14px 16px;
		border: 1px solid var(--control-border);
		border-radius: 24px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0)),
			var(--control-bg);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.22) inset,
			0 20px 54px var(--control-shadow);
		backdrop-filter: blur(24px) saturate(1.2);
		-webkit-backdrop-filter: blur(24px) saturate(1.2);
	}

	.rail-head {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.rail-title {
		flex: 0 0 auto;
		color: var(--control-muted);
		font-size: 12px;
		font-weight: 650;
		letter-spacing: 0.02em;
	}

	.rail-search {
		display: grid;
		grid-template-columns: 15px minmax(0, 1fr) auto;
		gap: 8px;
		align-items: center;
		flex: 1 1 auto;
		min-width: 0;
		height: 38px;
		padding: 0 10px;
		border: 1px solid var(--control-border);
		border-radius: 14px;
		background: var(--segment-bg);
		color: var(--control-muted);
		transition:
			border-color 180ms ease,
			box-shadow 180ms ease;
	}

	.rail-search:focus-within {
		border-color: rgba(255, 190, 122, 0.34);
		box-shadow: 0 0 0 3px rgba(255, 132, 58, 0.12);
	}

	.rail-search-input {
		min-width: 0;
		height: 100%;
		border: 0;
		background: transparent;
		color: var(--control-ink);
		font-size: 13.5px;
		font-weight: 500;
		outline: none;
	}

	.rail-search-input::placeholder {
		color: var(--control-muted);
		opacity: 0.85;
	}

	.rail-search-clear {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 0;
		border-radius: 7px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--control-muted);
		cursor: pointer;
		transition:
			color 160ms ease,
			background 160ms ease;
	}

	.rail-search-clear:hover {
		color: var(--control-ink);
		background: rgba(255, 255, 255, 0.12);
	}

	.rail-count {
		flex: 0 0 auto;
		min-width: 66px;
		color: var(--control-muted);
		font-size: 12px;
		font-weight: 600;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.rail-empty {
		margin: 4px 2px 6px;
		color: var(--control-muted);
		font-size: 13px;
		font-weight: 500;
	}

	.rail-groups {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-height: min(280px, 34vh);
		overflow-y: auto;
		padding-right: 2px;
		scrollbar-width: thin;
	}

	.rail-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.group-label {
		color: var(--control-muted);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.75;
	}

	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}

	.glow-accent {
		position: relative;
		display: inline-grid;
		grid-template-columns: 16px auto;
		gap: 7px;
		align-items: center;
		height: 38px;
		padding: 0 13px;
		overflow: hidden;
		border: 1px solid transparent;
		border-radius: 14px;
		background: var(--segment-bg);
		color: var(--control-muted);
		cursor: pointer;
		isolation: isolate;
		-webkit-tap-highlight-color: transparent;
		transition:
			color 180ms ease,
			border-color 180ms ease,
			background 180ms ease,
			box-shadow 180ms ease,
			transform 120ms ease;
	}

	.glow-accent::before {
		position: absolute;
		inset: -1px;
		z-index: -1;
		content: '';
		border-radius: inherit;
		background:
			radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.14), transparent 40%),
			linear-gradient(90deg, var(--glow-a), var(--glow-b));
		opacity: 0;
		transition: opacity 180ms ease;
	}

	.glow-accent span {
		overflow: hidden;
		font-size: 13px;
		font-weight: 600;
		line-height: 1;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.glow-accent:hover {
		color: var(--control-ink);
		border-color: var(--glow-border);
	}

	.glow-accent:hover::before {
		opacity: 0.5;
	}

	.glow-accent:focus-visible {
		outline: none;
		border-color: var(--glow-border);
		box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.14);
	}

	.glow-accent:active {
		transform: scale(0.97);
	}

	.glow-accent.active {
		color: var(--control-ink);
		border-color: var(--glow-border);
		box-shadow:
			0 0 26px var(--glow-shadow),
			0 1px 0 rgba(255, 255, 255, 0.15) inset;
	}

	.glow-accent.active::before {
		opacity: 1;
	}

	@media (max-width: 900px) {
		.glow-rail {
			width: min(100%, 640px);
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}

		.rail-groups {
			max-height: min(240px, 40vh);
		}
	}

	@media (max-width: 520px) {
		.glow-rail {
			padding: 12px;
			border-radius: 22px;
		}

		.rail-head {
			flex-wrap: wrap;
		}

		.rail-search {
			order: 3;
			flex: 1 1 100%;
		}

		.rail-count {
			text-align: left;
		}

		.glow-accent {
			padding: 0 11px;
		}

		.glow-accent span {
			font-size: 12px;
		}
	}
</style>
