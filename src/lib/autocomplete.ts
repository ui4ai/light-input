export const MIN_INPUT_CHARS = 2;
export const MAX_INPUT_CHARS = 2_000;
export const DEFAULT_DEBOUNCE_MS = 260;
export const MAX_COMPLETION_CHARS = 120;
export const MAX_COMPLETION_WORDS = 7;
export const COMPLETION_CACHE_LIMIT = 48;
export const DEMO_COMPLETION_TEXT = "Let's make something that actually makes a difference";
export const COMPLETION_MODES = ['llm', 'demo'] as const;
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
] as const;

export type CompletionMode = (typeof COMPLETION_MODES)[number];
export type LoadingGlow = 'torch' | 'field' | 'none';
export type GlowVariant = (typeof GLOW_VARIANTS)[number];
export type ThemeMode = 'dark' | 'light';
export type VisualState = 'idle' | 'waiting' | 'ready' | 'error';

export interface CompletionResponse {
	completion?: string;
	error?: string;
}

export interface SplitCompletion {
	next: string;
	rest: string;
}

export interface ScriptedDemoInput {
	data?: string | null;
	inputType: string;
	selectionEnd: number | null | undefined;
	selectionStart: number | null | undefined;
	target?: string;
	text: string;
}

export interface ScriptedDemoInputResult {
	caret: number;
	value: string;
}

export class CompletionCache {
	readonly limit: number;
	readonly #entries = new Map<string, string>();

	constructor(limit = COMPLETION_CACHE_LIMIT) {
		if (!Number.isInteger(limit) || limit < 1) {
			throw new Error('Completion cache limit must be a positive integer.');
		}

		this.limit = limit;
	}

	get size() {
		return this.#entries.size;
	}

	get(text: string) {
		const completion = this.#entries.get(text);
		if (completion === undefined) return undefined;

		this.#entries.delete(text);
		this.#entries.set(text, completion);
		return completion;
	}

	set(text: string, completion: string) {
		if (this.#entries.has(text)) this.#entries.delete(text);
		this.#entries.set(text, completion);

		while (this.#entries.size > this.limit) {
			const oldestKey = this.#entries.keys().next().value;
			// Guard the (impossible-while-size>limit) empty iterator, not falsiness: an empty-string
			// key ('' — a legitimate cache key) is falsy but must still be evicted, so compare to
			// undefined rather than using `!oldestKey`.
			if (oldestKey === undefined) return;
			this.#entries.delete(oldestKey);
		}
	}

	clear() {
		this.#entries.clear();
	}
}

export function normalizeInlineCompletion(value: unknown, maxChars = MAX_COMPLETION_CHARS): string {
	if (typeof value !== 'string') return '';

	const hadLeadingSpace = /^\s/u.test(value);
	const normalized = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/gu, ' ').trim();
	if (!normalized) return '';

	const capped = normalized.slice(0, maxChars);
	return hadLeadingSpace ? ` ${capped}` : capped;
}

export function splitInlineCompletion(text: string): SplitCompletion {
	if (!text) return { next: '', rest: '' };

	const leading = text.match(/^\s*/u)?.[0] ?? '';
	const body = text.slice(leading.length);
	const first = body.match(/^\S+/u)?.[0] ?? '';

	return {
		next: leading + first,
		rest: body.slice(first.length)
	};
}

export function fixedTextCompletion(text: string, target = DEMO_COMPLETION_TEXT): string {
	if (!text || !target) return '';

	const clipped = text.trimStart().slice(0, target.length);
	if (!target.toLocaleLowerCase().startsWith(clipped.toLocaleLowerCase())) return '';

	return target.slice(clipped.length);
}

export function applyScriptedDemoInput({
	data,
	inputType,
	selectionEnd,
	selectionStart,
	target = DEMO_COMPLETION_TEXT,
	text
}: ScriptedDemoInput): ScriptedDemoInputResult {
	if (!target) return { caret: text.length, value: text };

	const start = clampIndex(selectionStart ?? text.length, target.length);
	const end = clampIndex(selectionEnd ?? start, target.length);
	const selectionFrom = Math.min(start, end);
	const selectionTo = Math.max(start, end);
	const hasSelection = selectionFrom !== selectionTo;

	if (inputType.startsWith('delete')) {
		const nextLength = hasSelection
			? selectionFrom
			: inputType === 'deleteContentBackward'
				? Math.max(0, selectionFrom - 1)
				: selectionFrom;
		return scriptedPrefix(target, nextLength);
	}

	if (inputType.startsWith('insert')) {
		const insertedLength = Math.max(1, Array.from(data ?? '').length);
		return scriptedPrefix(target, selectionFrom + insertedLength);
	}

	return scriptedPrefix(target, selectionFrom);
}

function scriptedPrefix(target: string, length: number): ScriptedDemoInputResult {
	const caret = clampIndex(length, target.length);
	return {
		caret,
		value: target.slice(0, caret)
	};
}

function clampIndex(value: number, max: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(Math.trunc(value), max));
}
