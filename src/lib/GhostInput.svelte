<script lang="ts">
	// core.css carries the beam/torch anatomy every effect builds on. Importing it here means a bare
	// <GhostInput> (no effect selected) still renders the Torch default; effect entries import the
	// same file, and bundlers dedupe it to one copy so nothing loads twice. Relative imports only —
	// this component ships in the package, so it must not depend on the $lib alias.
	import './effects/core.css';
	import { tick } from 'svelte';
	import {
		DEFAULT_DEBOUNCE_MS,
		DEMO_COMPLETION_TEXT,
		MAX_INPUT_CHARS,
		MIN_INPUT_CHARS,
		applyScriptedDemoInput,
		splitInlineCompletion,
		CompletionCache,
		type CompletionMode,
		type GlowVariant,
		type LoadingGlow,
		type ThemeMode,
		type VisualState
	} from './autocomplete';
	import { CompletionEngine } from './input/completion.svelte';
	import { isScriptedInput, scriptedKeyInput } from './input/demo-script';
	import { ghostGlyphs } from './input/glyphs';
	import { SelectionTracker } from './input/selection.svelte';
	import type { Component } from 'svelte';

	interface Props {
		minChars?: number;
		maxChars?: number;
		debounceMs?: number;
		endpoint?: string;
		glow?: GlowVariant;
		/** Optional effect-specific DOM layer rendered inside the live prediction. */
		layer?: Component<{ suggestion: string; lightFlow: boolean }>;
		loadingGlow?: LoadingGlow;
		lightFlow?: boolean;
		theme?: ThemeMode;
		completionMode?: CompletionMode;
		placeholder?: string;
		touchAccept?: boolean;
	}


	let {
		minChars = MIN_INPUT_CHARS,
		maxChars = MAX_INPUT_CHARS,
		debounceMs = DEFAULT_DEBOUNCE_MS,
		endpoint = '/api/complete',
		glow = 'torch',
		layer: Layer = undefined,
		loadingGlow = 'torch',
		lightFlow = true,
		theme = 'dark',
		completionMode = 'llm',
		placeholder = '',
		touchAccept = true
	}: Props = $props();

	let inputEl = $state<HTMLInputElement>();
	let value = $state('');
	let focused = $state(false);
	let composing = $state(false);
	let visualKey = '';
	let sourceKey = '';

	const sel = new SelectionTracker();
	const engine = new CompletionEngine(
		{
			value: () => value,
			mode: () => completionMode,
			endpoint: () => endpoint,
			debounceMs: () => debounceMs,
			shouldPredict
		},
		new CompletionCache()
	);

	const collapsed = $derived(sel.start === sel.end);
	const hasEnoughText = $derived(value.trim().length > minChars);
	const atEnd = $derived(collapsed && sel.start === value.length);
	const showGhost = $derived(focused && atEnd && engine.suggestion.length > 0);
	const visualState = $derived<VisualState>(
		showGhost ? 'ready' : engine.loading ? 'waiting' : engine.error ? 'error' : 'idle'
	);

	const visibleText = $derived.by(() => {
		const start = Math.min(sel.start, sel.end);
		const end = Math.max(sel.start, sel.end);
		return {
			before: value.slice(0, start),
			selected: value.slice(start, end),
			after: value.slice(end)
		};
	});

	const ghost = $derived.by(() => splitInlineCompletion(engine.suggestion));
	const ghostNextGlyphs = $derived.by(() => ghostGlyphs(ghost.next, 0));
	const ghostRestGlyphs = $derived.by(() => ghostGlyphs(ghost.rest, ghost.next.length));
	const scrolled = $derived(sel.scrollLeft > 1);
	const showCaretGlow = $derived(
		focused && atEnd && (showGhost || (engine.loading && loadingGlow === 'torch'))
	);

	function syncSelection(alignEnd = false) {
		sel.sync(inputEl, value.length, alignEnd);
	}

	function hasInputFocus() {
		return focused || (inputEl ? document.activeElement === inputEl : false);
	}

	function shouldPredict() {
		return hasInputFocus() && !composing && hasEnoughText && atEnd;
	}

	function onInput() {
		focused = hasInputFocus();
		syncSelection(true);
		if (composing) {
			engine.cancelPending(true);
			return;
		}
		engine.schedulePrediction();
	}

	function onBeforeInput(event: InputEvent) {
		if (completionMode !== 'demo' || composing || !isScriptedInput(event.inputType)) return;

		event.preventDefault();
		applyScriptedInput(event.inputType, event.data);
	}

	function onPaste(event: ClipboardEvent) {
		if (completionMode !== 'demo' || composing) return;

		event.preventDefault();
		applyScriptedInput('insertFromPaste', event.clipboardData?.getData('text/plain') ?? '');
	}

	function applyScriptedInput(inputType: string, data?: string | null) {
		engine.cancelPending(true);
		focused = true;
		engine.error = '';

		const target = DEMO_COMPLETION_TEXT.slice(0, maxChars);
		const result = applyScriptedDemoInput({
			data,
			inputType,
			selectionEnd: inputEl?.selectionEnd,
			selectionStart: inputEl?.selectionStart,
			target,
			text: value
		});

		value = result.value;
		void syncScriptedInput(result.caret);
	}

	async function syncScriptedInput(caret: number) {
		await tick();
		if (!inputEl) return;
		inputEl.focus({ preventScroll: true });
		inputEl.setSelectionRange(caret, caret);
		syncSelection(true);
		engine.schedulePrediction();
	}

	function onCompositionStart() {
		composing = true;
		engine.cancelPending(true);
	}

	function onCompositionEnd() {
		composing = false;
		syncSelection(true);
		engine.schedulePrediction();
	}

	function onFocus() {
		focused = true;
		syncSelection();
		if (!engine.suggestion && shouldPredict()) engine.schedulePrediction();
	}

	function onBlur() {
		focused = false;
		engine.cancelPending(false);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			engine.error = '';
			engine.cancelPending(true);
			return;
		}

		const wantsCompletion =
			(event.key === 'Tab' || event.key === 'ArrowRight') &&
			!event.altKey &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.shiftKey;

		if (wantsCompletion && showGhost) {
			event.preventDefault();
			void acceptNextWord();
			return;
		}

		const scriptedInput = scriptedKeyInput(event);
		if (completionMode === 'demo' && !composing && scriptedInput) {
			event.preventDefault();
			applyScriptedInput(scriptedInput.inputType, scriptedInput.data);
		}
	}

	function onAcceptPointerDown(event: PointerEvent) {
		event.preventDefault();
		void acceptNextWord();
	}

	async function acceptNextWord() {
		if (!showGhost || !ghost.next) return;

		const rest = ghost.rest;
		value += ghost.next;
		engine.suggestion = rest;
		engine.error = '';
		engine.igniteKey += 1;

		await tick();
		if (!inputEl) return;
		inputEl.focus({ preventScroll: true });
		inputEl.setSelectionRange(value.length, value.length);
		syncSelection(true);

		if (!rest.trim()) engine.schedulePrediction();
	}

	$effect(() => {
		const el = inputEl;
		if (!el) return;

		const handleSelectionChange = () => {
			if (document.activeElement === el) syncSelection();
		};

		document.addEventListener('selectionchange', handleSelectionChange);
		queueMicrotask(() => {
			el.focus();
			syncSelection();
		});

		return () => {
			document.removeEventListener('selectionchange', handleSelectionChange);
			engine.cancelPending(true);
		};
	});

	$effect(() => {
		const nextVisualKey = `${glow}|${loadingGlow}|${lightFlow}|${theme}`;
		if (nextVisualKey === visualKey) return;
		visualKey = nextVisualKey;

		if (!engine.loading && !engine.suggestion && shouldPredict()) engine.schedulePrediction();
	});

	$effect(() => {
		const nextSourceKey = `${endpoint}|${completionMode}`;
		if (nextSourceKey === sourceKey) return;
		sourceKey = nextSourceKey;
		engine.clearCache();
		engine.cancelPending(true);
		if (shouldPredict()) engine.schedulePrediction();
	});

</script>

<div
	class="stage"
	data-state={visualState}
	data-glow={glow}
	data-light-flow={lightFlow ? 'on' : 'off'}
	data-theme={theme}
>
	<div
		class="field"
		data-state={visualState}
		data-glow={glow}
		data-loading-glow={loadingGlow}
		data-light-flow={lightFlow ? 'on' : 'off'}
		data-theme={theme}
	>
		<div class="viewport" class:scrolled>
			<input
				bind:this={inputEl}
				bind:value
				class="input"
				type="text"
				{placeholder}
				autocomplete="off"
				autocapitalize="off"
				autocorrect="off"
				spellcheck="false"
				maxlength={maxChars}
				aria-label="AI autocomplete input"
				aria-describedby="ghost-input-status"
				data-testid="ghost-input"
				onbeforeinput={onBeforeInput}
				onblur={onBlur}
				onclick={() => syncSelection()}
				oncompositionend={onCompositionEnd}
				oncompositionstart={onCompositionStart}
				onfocus={onFocus}
				oninput={onInput}
				onkeydown={onKeydown}
				onkeyup={() => syncSelection()}
				onpaste={onPaste}
				onscroll={() => syncSelection()}
				onselect={() => syncSelection()}
			/>

			<div class="paint" aria-hidden="true">
				<div
					class="track"
					style:transform={`translate3d(calc(${-sel.scrollLeft}px - var(--ghost-offset, 0px)), 0, 0)`}
				>
					{#if !value && placeholder}
						<span class="placeholder">{placeholder}</span>
					{:else}
						<span class="typed">{visibleText.before}</span>
						{#if collapsed}
							<span
								class="caret"
								class:active={focused}
								class:thinking={engine.loading}
								class:steady={showGhost}
							></span>
							{#if showCaretGlow}
								<span class="caret-origin-glow" data-mode={showGhost ? 'ready' : 'waiting'}>
									<span class="torch-beam torch-haze"></span>
									<span class="torch-beam torch-flow"></span>
									<span class="torch-beam torch-core"></span>
									<span class="torch-beam torch-aux"></span>
									<span class="torch-beam torch-spark"></span>
									<span class="torch-beam torch-smoke"></span>
								</span>
							{/if}
						{:else}
							<span class="selected">{visibleText.selected}</span>
						{/if}
						<span class="typed">{visibleText.after}</span>
						{#if showGhost}
							{#key engine.igniteKey}
								<span class="prediction"><span class="beam beam-veil"></span><span
										class="beam beam-body"
									></span><span class="beam beam-hot"></span><span class="beam beam-flow"></span
									><span class="beam beam-aux"></span><span class="beam beam-spark"></span><span
										class="beam beam-smoke"
									></span>{#if Layer}<Layer suggestion={engine.suggestion} {lightFlow} />{/if}<span class="next-word"
										>{#each ghostNextGlyphs as glyph (`next-${glyph.index}-${glyph.char}`)}<span
												class="glyph"
												data-alt={glyph.alt}
												data-hard={glyph.hard}
												data-soft={glyph.soft}
												style={`--i:${glyph.index};--mut-speed:${glyph.speed}ms;--mut-strength:${glyph.strength}`}
												>{glyph.char}</span
											>{/each}</span
									><span class="tail"
										>{#each ghostRestGlyphs as glyph (`rest-${glyph.index}-${glyph.char}`)}<span
												class="glyph"
												data-alt={glyph.alt}
												data-hard={glyph.hard}
												data-soft={glyph.soft}
												style={`--i:${glyph.index};--mut-speed:${glyph.speed}ms;--mut-strength:${glyph.strength}`}
												>{glyph.char}</span
											>{/each}</span
									></span>
							{/key}
						{/if}
					{/if}
				</div>
			</div>

			<div class="edge edge-left"></div>
			<div class="edge edge-right"></div>
		</div>

		{#if showGhost && touchAccept}
			<button
				type="button"
				class="accept-button"
				aria-label="Accept next word"
				tabindex="-1"
				onpointerdown={onAcceptPointerDown}
			>
				<!-- Inline lucide `arrow-right` (path data + default 24x24 box); no runtime icon dep. -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.35"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M5 12h14" />
					<path d="m12 5 7 7-7 7" />
				</svg>
			</button>
		{/if}
	</div>

	<div id="ghost-input-status" class="status" aria-live="polite">
		{#if engine.error}
			{engine.error}
		{/if}
	</div>
</div>
