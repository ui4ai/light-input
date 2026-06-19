<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { tick } from 'svelte';
	import {
		DEFAULT_DEBOUNCE_MS,
		DEMO_COMPLETION_TEXT,
		MAX_INPUT_CHARS,
		MIN_INPUT_CHARS,
		applyScriptedDemoInput,
		fixedTextCompletion,
		normalizeInlineCompletion,
		splitInlineCompletion,
		type CompletionResponse,
		CompletionCache,
		type CompletionMode,
		type GlowVariant,
		type LoadingGlow,
		type ThemeMode,
		type VisualState
	} from '$lib/autocomplete';
	import { createMatrixDigits, flipMatrixDigits } from '$lib/matrix-digits';

	interface Props {
		minChars?: number;
		maxChars?: number;
		debounceMs?: number;
		endpoint?: string;
		glow?: GlowVariant;
		loadingGlow?: LoadingGlow;
		lightFlow?: boolean;
		theme?: ThemeMode;
		completionMode?: CompletionMode;
		placeholder?: string;
		touchAccept?: boolean;
	}

	const kaleidoscopeShards = [
		{ delay: 0, hue: 326, rotate: -18, scale: 0.92, x: -0.42, y: -1.02 },
		{ delay: 90, hue: 38, rotate: 22, scale: 0.76, x: 0.86, y: -1.24 },
		{ delay: 170, hue: 186, rotate: -44, scale: 0.68, x: 1.92, y: -0.78 },
		{ delay: 260, hue: 262, rotate: 31, scale: 0.86, x: 3.05, y: -1.16 },
		{ delay: 340, hue: 128, rotate: -26, scale: 0.72, x: 4.16, y: -0.68 },
		{ delay: 430, hue: 12, rotate: 47, scale: 0.82, x: 5.2, y: -1.28 },
		{ delay: 520, hue: 212, rotate: -12, scale: 0.94, x: 6.32, y: -0.86 },
		{ delay: 610, hue: 298, rotate: 38, scale: 0.7, x: 7.42, y: -1.18 },
		{ delay: 700, hue: 72, rotate: -36, scale: 0.88, x: 8.55, y: -0.74 },
		{ delay: 790, hue: 172, rotate: 15, scale: 0.78, x: 9.58, y: -1.12 },
		{ delay: 880, hue: 334, rotate: -53, scale: 0.66, x: 10.64, y: -0.8 },
		{ delay: 970, hue: 52, rotate: 26, scale: 0.84, x: 11.64, y: -1.2 }
	];

	let {
		minChars = MIN_INPUT_CHARS,
		maxChars = MAX_INPUT_CHARS,
		debounceMs = DEFAULT_DEBOUNCE_MS,
		endpoint = '/api/complete',
		glow = 'torch',
		loadingGlow = 'torch',
		lightFlow = true,
		theme = 'dark',
		completionMode = 'llm',
		placeholder = '',
		touchAccept = true
	}: Props = $props();

	let inputEl = $state<HTMLInputElement>();
	let value = $state('');
	let suggestion = $state('');
	let focused = $state(false);
	let loading = $state(false);
	let composing = $state(false);
	let error = $state('');
	let selStart = $state(0);
	let selEnd = $state(0);
	let scrollLeft = $state(0);
	let igniteKey = $state(0);
	let matrixDigits = $state(createMatrixDigits());
	let visualKey = '';
	let sourceKey = '';
	let matrixKey = '';

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	let requestSeq = 0;

	const cache = new CompletionCache();

	const collapsed = $derived(selStart === selEnd);
	const hasEnoughText = $derived(value.trim().length > minChars);
	const atEnd = $derived(collapsed && selStart === value.length);
	const showGhost = $derived(focused && atEnd && suggestion.length > 0);
	const visualState = $derived<VisualState>(
		showGhost ? 'ready' : loading ? 'waiting' : error ? 'error' : 'idle'
	);

	const visibleText = $derived.by(() => {
		const start = Math.min(selStart, selEnd);
		const end = Math.max(selStart, selEnd);
		return {
			before: value.slice(0, start),
			selected: value.slice(start, end),
			after: value.slice(end)
		};
	});

	const ghost = $derived.by(() => splitInlineCompletion(suggestion));
	const ghostNextGlyphs = $derived.by(() => ghostGlyphs(ghost.next, 0));
	const ghostRestGlyphs = $derived.by(() => ghostGlyphs(ghost.rest, ghost.next.length));
	const scrolled = $derived(scrollLeft > 1);
	const showCaretGlow = $derived(
		focused && atEnd && (showGhost || (loading && loadingGlow === 'torch'))
	);

	function syncSelection(alignEnd = false) {
		if (!inputEl) return;
		const start = inputEl.selectionStart ?? value.length;
		const end = inputEl.selectionEnd ?? start;
		if (alignEnd && start === value.length && end === value.length) {
			const style = getComputedStyle(inputEl);
			const runway = Number.parseFloat(style.paddingRight) || 0;
			const textOverflow = inputEl.scrollWidth - inputEl.clientWidth - runway;
			inputEl.scrollLeft = textOverflow > 1 ? inputEl.scrollWidth : 0;
		}
		selStart = start;
		selEnd = end;
		scrollLeft = inputEl.scrollLeft;
	}

	async function syncAfterDomUpdate(alignEnd = false) {
		await tick();
		syncSelection(alignEnd);
	}

	function cancelPending(clearSuggestion = false) {
		clearTimeout(debounceTimer);
		debounceTimer = undefined;
		controller?.abort();
		controller = undefined;
		requestSeq += 1;
		loading = false;
		if (clearSuggestion) suggestion = '';
	}

	function hasInputFocus() {
		return focused || (inputEl ? document.activeElement === inputEl : false);
	}

	function shouldPredict() {
		return hasInputFocus() && !composing && hasEnoughText && atEnd;
	}

	function schedulePrediction() {
		cancelPending(true);

		if (!shouldPredict()) {
			error = '';
			return;
		}

		const cached = cache.get(cacheKey(value));
		if (cached !== undefined) {
			suggestion = cached;
			error = '';
			if (cached) igniteKey += 1;
			return;
		}

		debounceTimer = setTimeout(() => void requestPrediction(value, completionMode), debounceMs);
	}

	function cacheKey(text: string) {
		return `${completionMode}\n${text}`;
	}

	function waitForDemoCompletion(signal: AbortSignal) {
		return new Promise<void>((resolve, reject) => {
			if (signal.aborted) {
				reject(new DOMException('Aborted', 'AbortError'));
				return;
			}

			const timeout = window.setTimeout(resolve, 220);
			signal.addEventListener(
				'abort',
				() => {
					window.clearTimeout(timeout);
					reject(new DOMException('Aborted', 'AbortError'));
				},
				{ once: true }
			);
		});
	}

	async function requestPrediction(text: string, mode: CompletionMode) {
		const seq = ++requestSeq;
		const aborter = new AbortController();
		controller = aborter;
		loading = true;
		error = '';

		try {
			if (mode === 'demo') {
				await waitForDemoCompletion(aborter.signal);
				if (seq !== requestSeq || value !== text || completionMode !== mode || !shouldPredict()) return;

				const demo = fixedTextCompletion(text);
				suggestion = demo;
				cache.set(cacheKey(text), demo);
				if (demo) igniteKey += 1;
				return;
			}

			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text, mode }),
				signal: aborter.signal
			});

			const data = (await res.json().catch(() => ({}))) as CompletionResponse;

			if (!res.ok) {
				throw new Error(data.error || `Completion failed (${res.status})`);
			}

			if (seq !== requestSeq || value !== text || completionMode !== mode || !shouldPredict()) return;

			const next = normalizeInlineCompletion(data.completion);
			suggestion = next;
			cache.set(cacheKey(text), next);
			if (next) igniteKey += 1;
		} catch (err) {
			if ((err as Error)?.name === 'AbortError' || seq !== requestSeq) return;
			suggestion = '';
			error = 'Prediction is unavailable right now.';
		} finally {
			if (seq === requestSeq) {
				loading = false;
				controller = undefined;
			}
		}
	}

	function onInput() {
		focused = hasInputFocus();
		syncSelection(true);
		if (composing) {
			cancelPending(true);
			return;
		}
		schedulePrediction();
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
		cancelPending(true);
		focused = true;
		error = '';

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

	function isScriptedInput(inputType: string) {
		return inputType.startsWith('insert') || inputType.startsWith('delete');
	}

	async function syncScriptedInput(caret: number) {
		await tick();
		if (!inputEl) return;
		inputEl.focus({ preventScroll: true });
		inputEl.setSelectionRange(caret, caret);
		syncSelection(true);
		schedulePrediction();
	}

	function onCompositionStart() {
		composing = true;
		cancelPending(true);
	}

	function onCompositionEnd() {
		composing = false;
		syncSelection(true);
		schedulePrediction();
	}

	function onFocus() {
		focused = true;
		syncSelection();
		if (!suggestion && shouldPredict()) schedulePrediction();
	}

	function onBlur() {
		focused = false;
		cancelPending(false);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			error = '';
			cancelPending(true);
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

	function scriptedKeyInput(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key === 'Backspace') return { inputType: 'deleteContentBackward' };
		if (event.key === 'Delete') return { inputType: 'deleteContentForward' };
		if (event.key.length === 1) return { data: event.key, inputType: 'insertText' };
	}

	function onAcceptPointerDown(event: PointerEvent) {
		event.preventDefault();
		void acceptNextWord();
	}

	function ghostGlyphs(text: string, offset: number) {
		return Array.from(text, (char, localIndex) => {
			const index = offset + localIndex;
			const speed = Math.max(520, 1900 - index * 96);
			const strength = Math.min(1, 0.18 + index * 0.055);

			return {
				char,
				alt: distantGlyph(char, index),
				hard: distantGlyph(char, index + 7),
				index,
				soft: similarGlyph(char, index),
				speed,
				strength
			};
		});
	}

	function similarGlyph(char: string, index: number) {
		if (/\s/u.test(char)) return char;

		const softMap: Record<string, string[]> = {
			a: ['a', 'á', 'à', 'ä'],
			b: ['b', 'þ', 'ь'],
			c: ['c', 'ç', '('],
			d: ['d', 'ð', 'cl'],
			e: ['e', 'é', 'ė', 'ë'],
			f: ['f', 'ƒ'],
			g: ['g', '9'],
			h: ['h', 'н'],
			i: ['i', 'í', '1', 'l'],
			j: ['j', 'ĵ'],
			k: ['k', 'κ'],
			l: ['l', '1', 'í'],
			m: ['m', 'rn'],
			n: ['n', 'ñ'],
			o: ['o', 'ó', '0', 'ø'],
			p: ['p', 'ρ'],
			q: ['q', '9'],
			r: ['r', 'г'],
			s: ['s', 'ś', '5'],
			t: ['t', '†', '+'],
			u: ['u', 'ú', 'υ'],
			v: ['v', 'ν'],
			w: ['w', 'vv'],
			x: ['x', '×'],
			y: ['y', 'ý'],
			z: ['z', 'ž', '2'],
			а: ['а', 'a', 'á'],
			в: ['в', 'b', 'ʙ'],
			г: ['г', 'r'],
			д: ['д', '∂'],
			е: ['е', 'ё', 'e'],
			з: ['з', '3'],
			и: ['и', 'й'],
			к: ['к', 'k'],
			л: ['л', 'Λ'],
			м: ['м', 'm'],
			н: ['н', 'h'],
			о: ['о', 'o', '0'],
			п: ['п', 'n'],
			р: ['р', 'p'],
			с: ['с', 'c'],
			т: ['т', 'm'],
			у: ['у', 'y'],
			х: ['х', 'x'],
			ч: ['ч', '4'],
			ь: ['ь', 'b'],
			я: ['я', 'R']
		};
		const lower = char.toLocaleLowerCase();
		const options = softMap[lower];
		if (options?.length) {
			const next = options[(index % (options.length - 1)) + 1] ?? options[0];
			return char === lower ? next : next.toLocaleUpperCase();
		}

		if (/[0-9]/u.test(char)) return index % 2 === 0 ? char : String((Number(char) + 1) % 10);

		return char;
	}

	function distantGlyph(char: string, index: number) {
		if (/\s/u.test(char)) return char;

		const marks = ['#', '%', '0', '1', 'x', '/', '+', '*', '?', '~'];
		const cyrillicLower = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
		const cyrillicUpper = cyrillicLower.toLocaleUpperCase();
		const code = char.codePointAt(0) ?? 0;
		if (/[0-9]/u.test(char)) return String((Number(char) + index + 3) % 10);
		if (/[A-Za-z]/u.test(char)) {
			const base = char === char.toLocaleUpperCase() ? 65 : 97;
			return String.fromCharCode(base + ((code - base + index + 9) % 26));
		}
		if (cyrillicLower.includes(char)) {
			const charIndex = cyrillicLower.indexOf(char);
			return cyrillicLower[(charIndex + index + 11) % cyrillicLower.length] ?? char;
		}
		if (cyrillicUpper.includes(char)) {
			const charIndex = cyrillicUpper.indexOf(char);
			return cyrillicUpper[(charIndex + index + 11) % cyrillicUpper.length] ?? char;
		}

		return marks[(code + index) % marks.length];
	}

	async function acceptNextWord() {
		if (!showGhost || !ghost.next) return;

		const rest = ghost.rest;
		value += ghost.next;
		suggestion = rest;
		error = '';
		igniteKey += 1;

		await tick();
		if (!inputEl) return;
		inputEl.focus({ preventScroll: true });
		inputEl.setSelectionRange(value.length, value.length);
		syncSelection(true);

		if (!rest.trim()) schedulePrediction();
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
			cancelPending(true);
		};
	});

	$effect(() => {
		const nextVisualKey = `${glow}|${loadingGlow}|${lightFlow}|${theme}`;
		if (nextVisualKey === visualKey) return;
		visualKey = nextVisualKey;

		if (!loading && !suggestion && shouldPredict()) schedulePrediction();
	});

	$effect(() => {
		const nextSourceKey = `${endpoint}|${completionMode}`;
		if (nextSourceKey === sourceKey) return;
		sourceKey = nextSourceKey;
		cache.clear();
		cancelPending(true);
		if (shouldPredict()) schedulePrediction();
	});

	$effect(() => {
		const nextMatrixKey = `${glow}|${showGhost ? suggestion : ''}`;
		if (nextMatrixKey === matrixKey) return;
		matrixKey = nextMatrixKey;

		if (glow === 'matrix' && showGhost) matrixDigits = createMatrixDigits();
	});

	$effect(() => {
		if (glow !== 'matrix' || !showGhost || !lightFlow) return;

		const interval = window.setInterval(() => {
			matrixDigits = flipMatrixDigits(matrixDigits);
		}, 92);

		return () => window.clearInterval(interval);
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
					style:transform={`translate3d(calc(${-scrollLeft}px - var(--ghost-offset, 0px)), 0, 0)`}
				>
					{#if !value && placeholder}
						<span class="placeholder">{placeholder}</span>
					{:else}
						<span class="typed">{visibleText.before}</span>
						{#if collapsed}
							<span
								class="caret"
								class:active={focused}
								class:thinking={loading}
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
							{#key igniteKey}
								<span class="prediction"><span class="beam beam-veil"></span><span
										class="beam beam-body"
									></span><span class="beam beam-hot"></span><span class="beam beam-flow"></span
									><span class="beam beam-aux"></span><span class="beam beam-spark"></span><span
										class="beam beam-smoke"
									></span>{#if glow === 'matrix'}<span
											class="matrix-code-layer"
											data-testid="matrix-code-layer"
											aria-hidden="true"
											>{#each matrixDigits as digit, index (index)}<span
													class="matrix-bit"
													class:hot={digit.hot}
													style={`--matrix-o:${digit.opacity};--matrix-speed:${digit.speed}ms;--matrix-delay:${digit.delay}ms`}
													>{digit.value}</span
												>{/each}</span
										>{/if}{#if glow === 'kaleidoscope'}<span
												class="kaleidoscope-layer"
												data-testid="kaleidoscope-layer"
												aria-hidden="true"
												>{#each kaleidoscopeShards as shard, index (index)}<span
														class="kaleidoscope-shard"
														style={`--kx:${shard.x}em;--ky:${shard.y}em;--kr:${shard.rotate}deg;--ks:${shard.scale};--kd:${shard.delay}ms;--kh:${shard.hue}`}
													></span
												>{/each}</span
											>{/if}<span class="next-word"
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
				<ArrowRight size={24} strokeWidth={2.35} aria-hidden="true" />
			</button>
		{/if}
	</div>

	<div id="ghost-input-status" class="status" aria-live="polite">
		{#if error}
			{error}
		{/if}
	</div>
</div>

<style>
	.stage {
		width: min(1430px, calc(100vw - 96px));
		max-width: 100%;
	}

	.field {
		position: relative;
		height: 148px;
		padding: 0 64px;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.095);
		border-radius: 48px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0) 40%),
			linear-gradient(90deg, rgba(23, 24, 28, 0.98), rgba(30, 23, 26, 0.985));
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.04) inset,
			0 -34px 86px rgba(10, 7, 8, 0.42) inset,
			0 34px 56px rgba(0, 0, 0, 0.4);
		transition:
			border-color 420ms ease,
			box-shadow 520ms ease,
			background 520ms ease;
	}

	.field::before {
		position: absolute;
		inset: 1px;
		content: '';
		pointer-events: none;
		border-radius: inherit;
		background: linear-gradient(90deg, rgba(255, 136, 74, 0.055), transparent 38%);
		background-size: 180% 100%;
		opacity: 0;
		transition: opacity 520ms ease;
	}

	.field[data-state='ready'] {
		border-color: rgba(255, 196, 148, 0.16);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.05) inset,
			0 -34px 86px rgba(18, 10, 10, 0.48) inset,
			0 32px 68px rgba(0, 0, 0, 0.46),
			0 0 95px rgba(236, 105, 47, 0.13);
	}

	.field[data-state='ready']::before,
	.field[data-state='waiting'][data-loading-glow='field']::before {
		opacity: 1;
	}

	.field[data-light-flow='on'][data-state='ready']::before,
	.field[data-light-flow='on'][data-state='waiting'][data-loading-glow='field']::before {
		animation: field-flow 5.8s ease-in-out infinite;
	}

	.field[data-state='error'] {
		border-color: rgba(255, 115, 92, 0.2);
	}

	.viewport {
		position: relative;
		height: 100%;
		min-width: 0;
		--scroll-runway: clamp(180px, 22vw, 300px);
		font-family:
			-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui,
			sans-serif;
		font-size: 56px;
		font-weight: 500;
		letter-spacing: 0;
		line-height: 1;
	}

	.input {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: block;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0 var(--scroll-runway) 0 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: transparent;
		caret-color: transparent;
		font: inherit;
		letter-spacing: inherit;
		white-space: pre;
	}

	.input::selection {
		color: transparent;
		background: transparent;
	}

	.paint {
		position: absolute;
		inset: 0;
		z-index: 1;
		overflow: hidden;
		pointer-events: none;
		white-space: pre;
	}

	.track {
		position: absolute;
		inset: 0 auto 0 0;
		display: inline-flex;
		width: max-content;
		min-width: 100%;
		align-items: center;
		--ghost-offset: 0px;
		white-space: pre;
		will-change: transform;
	}

	.placeholder {
		color: rgba(244, 239, 233, 0.22);
	}

	.typed {
		position: relative;
		z-index: 2;
		color: rgb(247, 243, 238);
		text-shadow: 0 0 22px rgba(255, 248, 238, 0.08);
	}

	.selected {
		position: relative;
		z-index: 2;
		color: rgb(255, 247, 237);
		background: rgba(255, 184, 128, 0.18);
		box-shadow: 0 0 0 4px rgba(255, 184, 128, 0.08);
	}

	.caret {
		position: relative;
		z-index: 4;
		display: inline-block;
		width: 4px;
		height: 1.34em;
		margin: 0 1px;
		border-radius: 999px;
		background: linear-gradient(
			180deg,
			rgb(255, 255, 254) 0%,
			rgb(255, 246, 232) 28%,
			rgb(255, 185, 116) 68%,
			rgb(255, 128, 58) 100%
		);
		box-shadow:
			0 0 5px rgba(255, 245, 230, 0.6),
			0 9px 18px rgba(255, 130, 55, 0.58),
			0 0 34px rgba(255, 124, 46, 0.34);
		opacity: 0;
		transform: translateY(1px);
	}

	.caret.active {
		animation: caret-blink 1.1s steps(1, end) infinite;
	}

	.caret.thinking {
		animation: caret-think 980ms ease-in-out infinite;
	}

	.caret.steady {
		animation: none;
		opacity: 1;
	}

	.caret-origin-glow {
		position: relative;
		z-index: 3;
		display: inline-block;
		width: 0;
		height: 1em;
		isolation: isolate;
		vertical-align: middle;
	}

	.torch-beam {
		position: absolute;
		left: -0.02em;
		top: 50%;
		display: block;
		pointer-events: none;
		transform: translateY(-50%);
		transform-origin: left center;
		mix-blend-mode: screen;
		will-change: opacity, transform;
	}

	.caret-origin-glow[data-mode='ready'] .torch-haze {
		opacity: var(--haze-opacity);
	}

	.caret-origin-glow[data-mode='ready'] .torch-core {
		opacity: var(--core-opacity);
	}

	.caret-origin-glow[data-mode='ready'] .torch-flow {
		opacity: var(--flow-low);
	}

	.caret-origin-glow[data-mode='ready'] .torch-spark {
		opacity: var(--spark-low);
	}

	.caret-origin-glow[data-mode='ready'] .torch-smoke {
		opacity: var(--smoke-opacity);
	}

	.torch-haze {
		width: 4.9em;
		height: 1.42em;
		background: linear-gradient(
			90deg,
			rgba(255, 228, 198, 0.22),
			rgba(255, 151, 86, 0.14) 42%,
			rgba(255, 117, 56, 0.03) 78%,
			rgba(255, 117, 56, 0)
		);
		filter: blur(22px);
		animation: torch-haze 1.28s ease-in-out infinite;
	}

	.torch-core {
		width: 1.95em;
		height: 0.9em;
		background: radial-gradient(
			ellipse 76% 52% at 0% 50%,
			rgba(255, 246, 230, 0.44),
			rgba(255, 181, 112, 0.26) 46%,
			rgba(255, 132, 62, 0)
		);
		filter: blur(9px);
		animation: torch-core 1.05s ease-in-out infinite;
	}

	.torch-flow {
		width: 3.9em;
		height: 1.1em;
		background: linear-gradient(
			90deg,
			rgba(255, 146, 72, 0),
			rgba(255, 246, 220, 0.2) 16%,
			rgba(255, 139, 72, 0.18) 42%,
			rgba(116, 168, 255, 0.08) 68%,
			rgba(255, 146, 72, 0)
		);
		background-size: 180% 100%;
		filter: blur(17px);
		opacity: 0;
		animation: torch-flow 4.7s ease-in-out infinite;
	}

	.torch-spark {
		width: 2.8em;
		height: 1em;
		background:
			radial-gradient(circle at 12% 52%, rgba(255, 249, 231, 0.48), transparent 5%),
			radial-gradient(circle at 34% 42%, rgba(255, 159, 75, 0.28), transparent 7%),
			radial-gradient(circle at 58% 57%, rgba(255, 206, 150, 0.18), transparent 6%);
		filter: blur(1px);
		opacity: 0;
		animation: torch-spark 3.8s ease-in-out 540ms infinite;
	}

	.prediction {
		position: relative;
		z-index: 3;
		display: inline-block;
		isolation: isolate;
		white-space: pre;
	}

	.beam {
		position: absolute;
		left: -0.03em;
		top: 50%;
		z-index: -1;
		display: block;
		pointer-events: none;
		transform: translateY(-50%);
		transform-origin: left center;
		mix-blend-mode: screen;
		will-change: opacity, transform;
	}

	.beam-veil {
		width: 8.6em;
		height: 1.9em;
		background: linear-gradient(
			90deg,
			rgba(255, 230, 202, 0.24),
			rgba(255, 148, 84, 0.24) 34%,
			rgba(195, 83, 52, 0.11) 62%,
			rgba(195, 83, 52, 0)
		);
		filter: blur(24px);
		opacity: 0.72;
		animation:
			beam-open 720ms cubic-bezier(0.16, 1, 0.3, 1) both,
			beam-breathe 4s ease-in-out 720ms infinite;
	}

	.beam-body {
		width: 5.4em;
		height: 1.28em;
		background: linear-gradient(
			90deg,
			rgba(255, 238, 214, 0.58),
			rgba(255, 168, 101, 0.42) 40%,
			rgba(245, 115, 61, 0.12) 74%,
			rgba(245, 115, 61, 0)
		);
		filter: blur(15px);
		opacity: 0.86;
		animation: beam-open 650ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.beam-hot {
		width: 2.4em;
		height: 0.92em;
		background: radial-gradient(
			ellipse 72% 50% at 0% 50%,
			rgba(255, 248, 235, 0.92),
			rgba(255, 198, 136, 0.58) 42%,
			rgba(255, 128, 58, 0)
		);
		filter: blur(8px);
		opacity: 0.98;
		animation: beam-hot 560ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.beam-flow {
		width: 7.4em;
		height: 1.45em;
		background: linear-gradient(
			90deg,
			rgba(255, 145, 72, 0),
			rgba(255, 244, 218, 0.24) 14%,
			rgba(255, 141, 72, 0.2) 38%,
			rgba(130, 172, 255, 0.08) 58%,
			rgba(255, 128, 58, 0.08) 78%,
			rgba(255, 128, 58, 0)
		);
		background-size: 210% 100%;
		filter: blur(21px);
		opacity: 0;
		animation: beam-flow 6.4s ease-in-out 760ms infinite;
	}

	.beam-spark {
		width: 5.2em;
		height: 1.25em;
		background:
			radial-gradient(circle at 10% 52%, rgba(255, 251, 235, 0.46), transparent 4%),
			radial-gradient(circle at 32% 44%, rgba(255, 171, 93, 0.24), transparent 5%),
			radial-gradient(circle at 62% 58%, rgba(255, 128, 58, 0.18), transparent 4%);
		filter: blur(1.2px);
		opacity: 0;
		animation: beam-sparks 4.8s ease-in-out 880ms infinite;
	}

	.field[data-light-flow='off'] .beam-flow,
	.field[data-light-flow='off'] .beam-spark,
	.field[data-light-flow='off'] .torch-flow,
	.field[data-light-flow='off'] .torch-spark {
		display: none;
	}

	.field[data-light-flow='off'] .beam-veil {
		animation: beam-open 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.next-word {
		position: relative;
		z-index: 1;
		display: inline-block;
		color: rgba(255, 241, 224, 0.92);
		text-shadow:
			0 0 8px rgba(255, 218, 182, 0.32),
			0 0 24px rgba(255, 128, 58, 0.2);
		animation: word-reveal 640ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.tail {
		position: relative;
		z-index: 1;
		display: inline-block;
		color: rgba(235, 219, 205, 0.34);
		-webkit-mask-image: linear-gradient(90deg, #000 0, rgba(0, 0, 0, 0.72) 2.4em, transparent 7.8em);
		mask-image: linear-gradient(90deg, #000 0, rgba(0, 0, 0, 0.72) 2.4em, transparent 7.8em);
		animation: tail-reveal 760ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.glyph {
		position: relative;
		display: inline-block;
		white-space: pre;
	}

	.glyph::after {
		position: absolute;
		inset: 0;
		content: attr(data-alt);
		opacity: 0;
		pointer-events: none;
	}

	.edge {
		position: absolute;
		top: 0;
		bottom: 0;
		z-index: 3;
		width: 92px;
		pointer-events: none;
		opacity: 0;
		transition: opacity 160ms ease;
	}

	.edge-left {
		left: 0;
		background: linear-gradient(90deg, rgb(22, 23, 27), rgba(22, 23, 27, 0));
	}

	.edge-right {
		right: 0;
		width: 128px;
		background: linear-gradient(
			270deg,
			rgba(28, 22, 25, 0.64) 0%,
			rgba(28, 22, 25, 0.34) 36%,
			rgba(28, 22, 25, 0.09) 72%,
			rgba(28, 22, 25, 0) 100%
		);
		opacity: 0.72;
	}

	.viewport.scrolled .edge-left {
		opacity: 1;
	}

	.accept-button {
		position: absolute;
		top: 50%;
		right: 22px;
		z-index: 6;
		display: none;
		width: 54px;
		height: 54px;
		padding: 0;
		place-items: center;
		color: rgba(255, 241, 224, 0.92);
		background:
			radial-gradient(circle at 35% 28%, rgba(255, 248, 236, 0.18), transparent 46%),
			rgba(38, 29, 28, 0.76);
		border: 1px solid rgba(255, 204, 160, 0.18);
		border-radius: 999px;
		box-shadow:
			0 0 22px rgba(255, 134, 62, 0.24),
			0 10px 26px rgba(0, 0, 0, 0.36),
			0 1px 0 rgba(255, 255, 255, 0.08) inset;
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		cursor: pointer;
		touch-action: manipulation;
		transform: translateY(-50%);
		transition:
			transform 140ms ease,
			border-color 180ms ease,
			background 180ms ease;
		-webkit-tap-highlight-color: transparent;
	}

	.accept-button:active {
		border-color: rgba(255, 221, 188, 0.28);
		background:
			radial-gradient(circle at 35% 28%, rgba(255, 248, 236, 0.26), transparent 48%),
			rgba(55, 36, 30, 0.86);
		transform: translateY(-50%) scale(0.94);
	}

	.status {
		min-height: 20px;
		margin-top: 16px;
		color: rgba(255, 151, 120, 0.72);
		font-size: 13px;
		text-align: center;
	}

	.field[data-theme='light'] {
		border-color: rgba(63, 78, 108, 0.22);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 250, 254, 0.72) 46%, rgba(232, 238, 247, 0.78)),
			linear-gradient(90deg, rgba(249, 252, 255, 0.96), rgba(247, 244, 240, 0.88));
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.96) inset,
			0 -18px 44px rgba(98, 115, 146, 0.12) inset,
			0 18px 44px rgba(44, 58, 84, 0.16),
			0 2px 10px rgba(49, 60, 80, 0.08);
	}

	.field[data-theme='light']::before {
		inset: 0;
		border: 1px solid rgba(255, 255, 255, 0.74);
		background:
			linear-gradient(90deg, rgba(255, 149, 73, 0.12), rgba(107, 141, 205, 0.045) 48%, transparent 74%),
			linear-gradient(180deg, rgba(255, 255, 255, 0.34), transparent 48%);
	}

	.field[data-theme='light'][data-state='ready'] {
		border-color: rgba(203, 104, 44, 0.34);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.96) inset,
			0 -18px 50px rgba(255, 151, 73, 0.1) inset,
			0 18px 46px rgba(42, 52, 74, 0.14),
			0 0 72px rgba(255, 126, 48, 0.12);
	}

	.field[data-theme='light'][data-state='error'] {
		border-color: rgba(195, 56, 45, 0.22);
	}

	.stage[data-theme='light'] .placeholder {
		color: rgba(31, 39, 56, 0.34);
	}

	.stage[data-theme='light'] .typed {
		color: rgb(26, 30, 40);
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.74);
	}

	.stage[data-theme='light'] .selected {
		color: rgb(24, 28, 38);
		background: rgba(255, 154, 78, 0.17);
		box-shadow: 0 0 0 4px rgba(255, 154, 78, 0.09);
	}

	.stage[data-theme='light'] .beam,
	.stage[data-theme='light'] .torch-beam {
		mix-blend-mode: normal;
	}

	.stage[data-theme='light'] .torch-haze {
		background: linear-gradient(
			90deg,
			rgba(255, 222, 180, 0.36),
			rgba(255, 138, 67, 0.22) 42%,
			rgba(81, 113, 190, 0.055) 76%,
			rgba(255, 117, 56, 0)
		);
	}

	.stage[data-theme='light'] .torch-core {
		background: radial-gradient(
			ellipse 76% 52% at 0% 50%,
			rgba(255, 251, 232, 0.78),
			rgba(255, 160, 82, 0.34) 48%,
			rgba(255, 132, 62, 0)
		);
	}

	.stage[data-theme='light'] .beam-veil {
		background: linear-gradient(
			90deg,
			rgba(255, 216, 172, 0.28),
			rgba(255, 134, 66, 0.22) 36%,
			rgba(74, 104, 182, 0.075) 64%,
			rgba(195, 83, 52, 0)
		);
		opacity: 0.56;
	}

	.stage[data-theme='light'] .beam-body {
		background: linear-gradient(
			90deg,
			rgba(255, 234, 199, 0.66),
			rgba(255, 143, 70, 0.35) 40%,
			rgba(82, 114, 190, 0.07) 74%,
			rgba(245, 115, 61, 0)
		);
		opacity: 0.72;
	}

	.stage[data-theme='light'] .beam-hot {
		background: radial-gradient(
			ellipse 72% 50% at 0% 50%,
			rgba(255, 251, 232, 0.94),
			rgba(255, 166, 86, 0.5) 44%,
			rgba(255, 128, 58, 0)
		);
		opacity: 0.76;
	}

	.stage[data-theme='light'] .beam-flow {
		background: linear-gradient(
			90deg,
			rgba(255, 145, 72, 0),
			rgba(255, 236, 204, 0.25) 14%,
			rgba(255, 124, 60, 0.18) 38%,
			rgba(84, 114, 190, 0.095) 58%,
			rgba(255, 128, 58, 0.06) 78%,
			rgba(255, 128, 58, 0)
		);
	}

	.stage[data-theme='light'] .next-word {
		color: rgba(104, 65, 34, 0.78);
		text-shadow:
			0 0 8px rgba(255, 172, 96, 0.34),
			0 0 22px rgba(255, 126, 56, 0.14);
	}

	.stage[data-theme='light'] .tail {
		color: rgba(58, 67, 84, 0.3);
	}

	.stage[data-theme='light'] .edge {
		width: 156px;
	}

	.stage[data-theme='light'] .edge-left {
		background: linear-gradient(90deg, rgba(249, 252, 255, 0.86), rgba(249, 252, 255, 0));
	}

	.stage[data-theme='light'] .edge-right {
		background: linear-gradient(
			270deg,
			rgba(241, 246, 253, 0.3) 0%,
			rgba(241, 246, 253, 0.16) 42%,
			rgba(241, 246, 253, 0.04) 74%,
			rgba(241, 246, 253, 0) 100%
		);
		opacity: 0.2;
	}

	.stage[data-theme='light'] .accept-button {
		color: rgba(58, 43, 32, 0.92);
		border-color: rgba(210, 123, 62, 0.23);
		background:
			radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.72), transparent 48%),
			rgba(255, 249, 242, 0.74);
		box-shadow:
			0 0 26px rgba(255, 134, 62, 0.18),
			0 10px 26px rgba(49, 57, 78, 0.16),
			0 1px 0 rgba(255, 255, 255, 0.85) inset;
	}

	.stage[data-theme='light'] .accept-button:active {
		border-color: rgba(203, 103, 47, 0.34);
		background:
			radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.8), transparent 48%),
			rgba(255, 237, 218, 0.82);
	}

	.stage[data-theme='light'] .status {
		color: rgba(158, 69, 48, 0.74);
	}

	/* Glow preset variables live in src/lib/glow-presets.css. */

	@keyframes -global-caret-blink {
		0%,
		48% {
			opacity: 1;
		}
		49%,
		100% {
			opacity: 0;
		}
	}

	@keyframes -global-caret-think {
		0%,
		100% {
			opacity: 0.52;
			transform: translateY(1px) scaleY(0.95);
		}
		50% {
			opacity: 1;
			transform: translateY(1px) scaleY(1.03);
		}
	}

	@keyframes -global-beam-open {
		from {
			opacity: 0;
			transform: translateY(-50%) scaleX(0.08);
		}
		to {
			transform: translateY(-50%) scaleX(1);
		}
	}

	@keyframes -global-beam-hot {
		from {
			opacity: 0;
			transform: translateY(-50%) scaleX(0.18);
			filter: blur(4px);
		}
		to {
			opacity: 0.98;
			transform: translateY(-50%) scaleX(1);
			filter: blur(8px);
		}
	}

	@keyframes -global-beam-breathe {
		0%,
		100% {
			opacity: 0.68;
			transform: translateY(-50%) scaleX(1);
		}
		50% {
			opacity: 0.82;
			transform: translateY(-50%) scaleX(1.04);
		}
	}

	@keyframes -global-beam-flow {
		0%,
		100% {
			opacity: 0.22;
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.18em) scaleX(0.92);
		}
		42% {
			opacity: 0.58;
			background-position: 100% 50%;
			transform: translateY(-49%) translateX(0.38em) scaleX(1.06);
		}
		68% {
			opacity: 0.34;
			background-position: 58% 50%;
			transform: translateY(-51%) translateX(0.12em) scaleX(0.98);
		}
	}

	@keyframes -global-torch-flow {
		0%,
		100% {
			opacity: 0.08;
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.1em) scaleX(0.52);
		}
		48% {
			opacity: 0.38;
			background-position: 100% 50%;
			transform: translateY(-49%) translateX(0.18em) scaleX(1);
		}
		76% {
			opacity: 0.18;
			background-position: 54% 50%;
			transform: translateY(-51%) translateX(0.04em) scaleX(0.7);
		}
	}

	@keyframes -global-field-flow {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	@keyframes -global-glow-breathe {
		0%,
		100% {
			opacity: calc(var(--haze-opacity) * 0.86);
			transform: translateY(-50%) translateX(-0.06em) scaleX(0.98);
		}
		50% {
			opacity: min(0.9, calc(var(--haze-opacity) * 1.12));
			transform: translateY(-50%) translateX(0.18em) scaleX(1.04);
		}
	}

	@keyframes -global-glow-flow {
		0%,
		100% {
			opacity: var(--flow-low);
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.18em) scaleX(0.9);
		}
		44% {
			opacity: var(--flow-high);
			background-position: 100% 50%;
			transform: translateY(-49%) translateX(0.36em) scaleX(1.06);
		}
		70% {
			opacity: calc((var(--flow-low) + var(--flow-high)) / 2);
			background-position: 58% 50%;
			transform: translateY(-51%) translateX(0.1em) scaleX(0.98);
		}
	}

	@keyframes -global-glow-particles {
		0%,
		100% {
			opacity: var(--spark-low);
			transform: translateY(-50%) translateX(0) scaleX(0.9);
		}
		38% {
			opacity: var(--spark-high);
			transform: translateY(-54%) translateX(0.28em) scaleX(1.02);
		}
		64% {
			opacity: calc((var(--spark-low) + var(--spark-high)) / 2);
			transform: translateY(-46%) translateX(0.58em) scaleX(0.94);
		}
	}

	@keyframes -global-candle-flame {
		0%,
		100% {
			opacity: calc(var(--haze-opacity) * 0.76);
			transform: translateY(-51%) translateX(-0.03em) scaleX(0.88) scaleY(1.06);
		}
		35% {
			opacity: min(0.88, calc(var(--haze-opacity) * 1.14));
			transform: translateY(-47%) translateX(0.05em) scaleX(1.04) scaleY(0.9);
		}
		68% {
			opacity: calc(var(--haze-opacity) * 0.92);
			transform: translateY(-54%) translateX(0.11em) scaleX(0.94) scaleY(1.12);
		}
	}

	@keyframes -global-candle-smoke {
		0%,
		100% {
			opacity: calc(var(--smoke-opacity) * 0.38);
			transform: translateY(-54%) translateX(0.02em) scaleX(0.7) scaleY(0.9) rotate(-1deg);
		}
		44% {
			opacity: var(--smoke-opacity);
			transform: translateY(-66%) translateX(0.42em) scaleX(1.08) scaleY(1.12) rotate(2deg);
		}
		72% {
			opacity: calc(var(--smoke-opacity) * 0.58);
			transform: translateY(-45%) translateX(0.74em) scaleX(0.9) scaleY(1.02) rotate(-2deg);
		}
	}

	@keyframes -global-bolt-pulse {
		0%,
		100% {
			opacity: calc(var(--haze-opacity) * 0.42);
			transform: translateY(-50%) translateX(-0.08em) scaleX(0.82);
		}
		46% {
			opacity: var(--haze-opacity);
			transform: translateY(-50%) translateX(0.22em) scaleX(1.06);
		}
		50% {
			opacity: calc(var(--haze-opacity) * 0.62);
			transform: translateY(-49%) translateX(0.05em) scaleX(0.92);
		}
		57% {
			opacity: calc(var(--haze-opacity) * 0.94);
			transform: translateY(-51%) translateX(0.35em) scaleX(1.12);
		}
	}

	@keyframes -global-bolt-surge {
		0%,
		100% {
			opacity: var(--flow-low);
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.12em) scaleX(0.76);
		}
		43% {
			opacity: var(--flow-high);
			background-position: 100% 50%;
			transform: translateY(-50%) translateX(0.48em) scaleX(1.12);
		}
		47% {
			opacity: calc(var(--flow-high) * 0.35);
			transform: translateY(-49%) translateX(0.22em) scaleX(0.86);
		}
		63% {
			opacity: calc(var(--flow-high) * 0.72);
			background-position: 78% 50%;
			transform: translateY(-51%) translateX(0.6em) scaleX(1.02);
		}
	}

	@keyframes -global-bolt-particles {
		0%,
		100% {
			opacity: var(--spark-low);
			transform: translateY(-50%) translateX(-0.1em) scaleX(0.78);
		}
		34% {
			opacity: calc(var(--spark-high) * 0.62);
			transform: translateY(-57%) translateX(0.16em) scaleX(0.95);
		}
		46% {
			opacity: var(--spark-high);
			transform: translateY(-44%) translateX(0.5em) scaleX(1.08);
		}
		62% {
			opacity: calc(var(--spark-high) * 0.46);
			transform: translateY(-53%) translateX(0.86em) scaleX(0.92);
		}
	}

	@keyframes -global-smoke-drift {
		0%,
		100% {
			opacity: calc(var(--smoke-opacity) * 0.36);
			transform: translateY(-50%) translateX(-0.16em) scaleX(0.86) scaleY(0.94);
		}
		48% {
			opacity: var(--smoke-opacity);
			transform: translateY(-56%) translateX(0.46em) scaleX(1.12) scaleY(1.08);
		}
		74% {
			opacity: calc(var(--smoke-opacity) * 0.58);
			transform: translateY(-44%) translateX(0.78em) scaleX(0.98) scaleY(1.02);
		}
	}

	@keyframes -global-smoke-roll {
		0%,
		100% {
			opacity: calc(var(--smoke-opacity) * 0.42);
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.22em) scaleX(0.78) scaleY(0.96) rotate(-1deg);
		}
		42% {
			opacity: var(--smoke-opacity);
			background-position: 100% 50%;
			transform: translateY(-57%) translateX(0.52em) scaleX(1.16) scaleY(1.08) rotate(2deg);
		}
		72% {
			opacity: calc(var(--smoke-opacity) * 0.62);
			background-position: 58% 50%;
			transform: translateY(-45%) translateX(0.86em) scaleX(0.96) scaleY(1.04) rotate(-2deg);
		}
	}

	@keyframes -global-neon-scan {
		0%,
		100% {
			opacity: calc(var(--haze-opacity) * 0.58);
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.2em) scaleX(0.88);
		}
		48% {
			opacity: var(--haze-opacity);
			background-position: 100% 50%;
			transform: translateY(-50%) translateX(0.42em) scaleX(1.08);
		}
		70% {
			opacity: calc(var(--haze-opacity) * 0.72);
			background-position: 58% 50%;
			transform: translateY(-49%) translateX(0.18em) scaleX(0.98);
		}
	}

	@keyframes -global-nebula-swirl {
		0%,
		100% {
			opacity: calc(var(--haze-opacity) * 0.58);
			background-position: 0% 50%;
			transform: translateY(-51%) translateX(-0.2em) scaleX(0.88) skewX(-2deg);
		}
		45% {
			opacity: var(--haze-opacity);
			background-position: 100% 50%;
			transform: translateY(-47%) translateX(0.4em) scaleX(1.1) skewX(4deg);
		}
		72% {
			opacity: calc(var(--haze-opacity) * 0.68);
			background-position: 54% 50%;
			transform: translateY(-53%) translateX(0.16em) scaleX(0.98) skewX(-3deg);
		}
	}

	@keyframes -global-torch-haze {
		0% {
			opacity: 0.08;
			transform: translateY(-50%) scaleX(0.22);
		}
		50% {
			opacity: 0.5;
			transform: translateY(-50%) scaleX(0.82);
		}
		100% {
			opacity: 0.2;
			transform: translateY(-50%) scaleX(0.52);
		}
	}

	@keyframes -global-torch-core {
		0%,
		100% {
			opacity: 0.18;
			transform: translateY(-50%) scaleX(0.42);
		}
		50% {
			opacity: 0.62;
			transform: translateY(-50%) scaleX(1);
		}
	}

	@keyframes -global-torch-spark {
		0%,
		100% {
			opacity: 0.02;
			transform: translateY(-50%) translateX(0) scaleX(0.6);
		}
		36% {
			opacity: 0.26;
			transform: translateY(-51%) translateX(0.18em) scaleX(0.92);
		}
		58% {
			opacity: 0.12;
			transform: translateY(-48%) translateX(0.42em) scaleX(0.76);
		}
	}

	@keyframes -global-beam-sparks {
		0%,
		100% {
			opacity: 0.02;
			transform: translateY(-50%) translateX(0) scaleX(0.9);
		}
		42% {
			opacity: 0.24;
			transform: translateY(-51%) translateX(0.28em) scaleX(1.04);
		}
		66% {
			opacity: 0.1;
			transform: translateY(-49%) translateX(0.54em) scaleX(0.95);
		}
	}

	@keyframes -global-candle-haze {
		0%,
		100% {
			opacity: 0.28;
			transform: translateY(-51%) translateX(-0.02em) scaleX(0.86) scaleY(1.02);
		}
		34% {
			opacity: 0.5;
			transform: translateY(-48%) translateX(0.04em) scaleX(1.02) scaleY(0.92);
		}
		66% {
			opacity: 0.36;
			transform: translateY(-53%) translateX(0.08em) scaleX(0.92) scaleY(1.08);
		}
	}

	@keyframes -global-candle-core {
		0%,
		100% {
			opacity: 0.42;
			transform: translateY(-51%) scaleX(0.82) scaleY(1.05);
		}
		45% {
			opacity: 0.76;
			transform: translateY(-48%) translateX(0.04em) scaleX(1.02) scaleY(0.92);
		}
		72% {
			opacity: 0.54;
			transform: translateY(-53%) translateX(-0.03em) scaleX(0.9) scaleY(1.1);
		}
	}

	@keyframes -global-candle-flow {
		0%,
		100% {
			opacity: 0.14;
			background-position: 0% 50%;
			transform: translateY(-51%) translateX(-0.12em) scaleX(0.86);
		}
		50% {
			opacity: 0.38;
			background-position: 100% 50%;
			transform: translateY(-48%) translateX(0.24em) scaleX(1.02);
		}
	}

	@keyframes -global-lightning-haze {
		0%,
		72%,
		100% {
			opacity: 0.16;
			transform: translateY(-50%) translateX(0) scaleX(0.72);
		}
		75% {
			opacity: 0.66;
			transform: translateY(-50%) translateX(0.18em) scaleX(1.08);
		}
		77% {
			opacity: 0.28;
			transform: translateY(-49%) translateX(0.04em) scaleX(0.9);
		}
		82% {
			opacity: 0.56;
			transform: translateY(-51%) translateX(0.34em) scaleX(1.16);
		}
	}

	@keyframes -global-lightning-strike {
		0%,
		68%,
		100% {
			opacity: 0.04;
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.08em) scaleX(0.74);
		}
		70% {
			opacity: 0.86;
			background-position: 86% 50%;
			transform: translateY(-50%) translateX(0.42em) scaleX(1.18);
		}
		72% {
			opacity: 0.12;
			transform: translateY(-49%) translateX(0.2em) scaleX(0.9);
		}
		78% {
			opacity: 0.62;
			background-position: 100% 50%;
			transform: translateY(-51%) translateX(0.58em) scaleX(1.06);
		}
	}

	@keyframes -global-aurora-drift {
		0%,
		100% {
			opacity: 0.22;
			background-position: 0% 50%;
			transform: translateY(-52%) translateX(-0.24em) scaleX(0.94) skewX(-3deg);
		}
		50% {
			opacity: 0.5;
			background-position: 100% 50%;
			transform: translateY(-48%) translateX(0.38em) scaleX(1.08) skewX(4deg);
		}
	}

	@keyframes -global-plasma-pulse {
		0%,
		100% {
			opacity: 0.22;
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.1em) scaleX(0.88) scaleY(0.94);
		}
		42% {
			opacity: 0.56;
			background-position: 100% 50%;
			transform: translateY(-49%) translateX(0.24em) scaleX(1.06) scaleY(1.08);
		}
		70% {
			opacity: 0.36;
			background-position: 58% 50%;
			transform: translateY(-51%) translateX(0.08em) scaleX(0.98) scaleY(0.98);
		}
	}

	@keyframes -global-prism-sweep {
		0%,
		100% {
			opacity: 0.24;
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.18em) scaleX(0.94);
		}
		48% {
			opacity: 0.5;
			background-position: 100% 50%;
			transform: translateY(-50%) translateX(0.36em) scaleX(1.08);
		}
		72% {
			opacity: 0.32;
			background-position: 54% 50%;
			transform: translateY(-49%) translateX(0.1em) scaleX(1);
		}
	}

	@keyframes -global-ember-drift {
		0%,
		100% {
			opacity: 0.2;
			transform: translateY(-50%) translateX(-0.12em) scaleX(0.86) scaleY(0.96);
		}
		44% {
			opacity: 0.45;
			transform: translateY(-52%) translateX(0.24em) scaleX(1.04) scaleY(1.06);
		}
		70% {
			opacity: 0.3;
			transform: translateY(-48%) translateX(0.46em) scaleX(0.96) scaleY(1);
		}
	}

	@keyframes -global-ember-sparks {
		0%,
		100% {
			opacity: 0.04;
			transform: translateY(-46%) translateX(0) scaleX(0.72);
		}
		36% {
			opacity: 0.38;
			transform: translateY(-64%) translateX(0.28em) scaleX(0.98);
		}
		58% {
			opacity: 0.18;
			transform: translateY(-38%) translateX(0.58em) scaleX(0.84);
		}
	}

	@keyframes -global-solar-corona {
		0%,
		100% {
			opacity: calc(var(--haze-opacity) * 0.56);
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.16em) scaleX(0.86) scaleY(0.94);
		}
		44% {
			opacity: var(--haze-opacity);
			background-position: 100% 50%;
			transform: translateY(-49%) translateX(0.34em) scaleX(1.14) scaleY(1.08);
		}
		72% {
			opacity: calc(var(--haze-opacity) * 0.74);
			background-position: 58% 50%;
			transform: translateY(-51%) translateX(0.1em) scaleX(0.98) scaleY(1.02);
		}
	}

	@keyframes -global-solar-core {
		0%,
		100% {
			opacity: calc(var(--core-opacity) * 0.54);
			transform: translateY(-50%) translateX(-0.06em) scaleX(0.78);
		}
		48% {
			opacity: var(--core-opacity);
			transform: translateY(-50%) translateX(0.08em) scaleX(1.08);
		}
		72% {
			opacity: calc(var(--core-opacity) * 0.78);
			transform: translateY(-49%) translateX(0.16em) scaleX(0.94);
		}
	}

	@keyframes -global-solar-sweep {
		0%,
		100% {
			opacity: var(--flow-low);
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.18em) scaleX(0.82);
		}
		46% {
			opacity: var(--flow-high);
			background-position: 100% 50%;
			transform: translateY(-49%) translateX(0.54em) scaleX(1.14);
		}
		74% {
			opacity: calc((var(--flow-low) + var(--flow-high)) / 2);
			background-position: 58% 50%;
			transform: translateY(-51%) translateX(0.16em) scaleX(0.98);
		}
	}

	@keyframes -global-solar-sparks {
		0%,
		100% {
			opacity: var(--spark-low);
			transform: translateY(-48%) translateX(0) scaleX(0.72);
		}
		34% {
			opacity: var(--spark-high);
			transform: translateY(-64%) translateX(0.28em) scaleX(1.02);
		}
		58% {
			opacity: calc(var(--spark-high) * 0.42);
			transform: translateY(-38%) translateX(0.72em) scaleX(0.88);
		}
	}

	@keyframes -global-holo-scan {
		0%,
		100% {
			opacity: calc(var(--haze-opacity) * 0.46);
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.22em) scaleX(0.9) skewX(-3deg);
		}
		46% {
			opacity: var(--haze-opacity);
			background-position: 100% 50%;
			transform: translateY(-49%) translateX(0.5em) scaleX(1.1) skewX(4deg);
		}
		66% {
			opacity: calc(var(--haze-opacity) * 0.62);
			background-position: 58% 50%;
			transform: translateY(-51%) translateX(0.12em) scaleX(0.98) skewX(-2deg);
		}
	}

	@keyframes -global-holo-spark {
		0%,
		60%,
		100% {
			opacity: var(--spark-low);
			background-position: 0% 50%;
			transform: translateY(-50%) translateX(-0.08em) scaleX(0.84);
		}
		63% {
			opacity: var(--spark-high);
			background-position: 100% 50%;
			transform: translateY(-50%) translateX(0.46em) scaleX(1.12);
		}
		67% {
			opacity: calc(var(--spark-high) * 0.32);
			transform: translateY(-49%) translateX(0.18em) scaleX(0.92);
		}
		78% {
			opacity: calc(var(--spark-high) * 0.76);
			background-position: 78% 50%;
			transform: translateY(-51%) translateX(0.66em) scaleX(1.04);
		}
	}

	@keyframes -global-word-reveal {
		from {
			opacity: 0.18;
			filter: blur(7px);
		}
		to {
			opacity: 1;
			filter: blur(0);
		}
	}

	@keyframes -global-tail-reveal {
		from {
			opacity: 0;
			filter: blur(6px);
		}
		to {
			opacity: 1;
			filter: blur(0);
		}
	}

	@media (max-width: 760px) {
		.stage {
			width: min(100%, calc(100vw - 28px));
		}

		.field {
			height: 116px;
			padding: 0 76px 0 32px;
			border-radius: 34px;
		}

		.viewport {
			--scroll-runway: clamp(156px, 46vw, 210px);
			font-size: 34px;
		}

		.stage[data-theme='light'] .edge,
		.edge {
			width: 48px;
		}

		.field[data-state='ready'] .viewport.scrolled .track {
			--ghost-offset: clamp(52px, 17vw, 76px);
		}

		.accept-button {
			right: 18px;
			display: grid;
			width: 46px;
			height: 46px;
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}

		.beam-smoke,
		.beam-aux,
		.beam-flow,
		.torch-smoke,
		.torch-aux,
		.torch-flow {
			display: none;
		}

		.beam-veil,
		.torch-haze {
			filter: blur(12px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.field::before,
		.caret.active,
		.caret.thinking,
		.torch-beam,
		.beam,
		.next-word,
		.tail {
			animation: none;
		}

		.caret.active,
		.caret.steady {
			opacity: 1;
		}
	}
</style>
