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
	let suggestion = $state('');
	let focused = $state(false);
	let loading = $state(false);
	let composing = $state(false);
	let error = $state('');
	let selStart = $state(0);
	let selEnd = $state(0);
	let scrollLeft = $state(0);
	let igniteKey = $state(0);
	let visualKey = '';
	let sourceKey = '';

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
									></span>{#if Layer}<Layer {suggestion} {lightFlow} />{/if}<span class="next-word"
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
