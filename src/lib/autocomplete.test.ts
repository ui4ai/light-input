import { describe, expect, it } from 'vitest';
import {
	CompletionCache,
	DEMO_COMPLETION_TEXT,
	applyScriptedDemoInput,
	fixedTextCompletion,
	normalizeInlineCompletion,
	splitInlineCompletion
} from './autocomplete';

describe('normalizeInlineCompletion', () => {
	it('preserves one meaningful leading space', () => {
		expect(normalizeInlineCompletion('  next word')).toBe(' next word');
	});

	it('collapses control whitespace and repeated Unicode whitespace', () => {
		expect(normalizeInlineCompletion('\t hello\u00a0\u00a0world\nagain')).toBe(' hello world again');
	});

	it('rejects non-string and blank completions', () => {
		expect(normalizeInlineCompletion(undefined)).toBe('');
		expect(normalizeInlineCompletion(' \n\t ')).toBe('');
	});

	it('caps display text', () => {
		expect(normalizeInlineCompletion('abcdef', 3)).toBe('abc');
	});
});

describe('splitInlineCompletion', () => {
	it('keeps leading space with the next accepted word', () => {
		expect(splitInlineCompletion(' hello world again')).toEqual({
			next: ' hello',
			rest: ' world again'
		});
	});

	it('handles join completions without spaces', () => {
		expect(splitInlineCompletion("'s go now")).toEqual({
			next: "'s",
			rest: ' go now'
		});
	});
});

describe('fixedTextCompletion', () => {
	it('returns the remaining suffix for the fixed demo phrase', () => {
		expect(fixedTextCompletion("Let's make something that actually")).toBe(
			' makes a difference'
		);
	});

	it('does not complete unrelated text', () => {
		expect(fixedTextCompletion('Something else')).toBe('');
	});
});

describe('applyScriptedDemoInput', () => {
	it('inserts the next fixed phrase character instead of the typed character', () => {
		expect(
			applyScriptedDemoInput({
				data: 'x',
				inputType: 'insertText',
				selectionEnd: 0,
				selectionStart: 0,
				text: ''
			})
		).toEqual({ caret: 1, value: DEMO_COMPLETION_TEXT.slice(0, 1) });

		expect(
			applyScriptedDemoInput({
				data: 'й',
				inputType: 'insertText',
				selectionEnd: 1,
				selectionStart: 1,
				text: DEMO_COMPLETION_TEXT.slice(0, 1)
			})
		).toEqual({ caret: 2, value: DEMO_COMPLETION_TEXT.slice(0, 2) });
	});

	it('uses pasted text length as scripted progress', () => {
		expect(
			applyScriptedDemoInput({
				data: 'abcdef',
				inputType: 'insertFromPaste',
				selectionEnd: 0,
				selectionStart: 0,
				text: ''
			})
		).toEqual({ caret: 6, value: DEMO_COMPLETION_TEXT.slice(0, 6) });
	});

	it('keeps deletion on the scripted phrase prefix', () => {
		expect(
			applyScriptedDemoInput({
				inputType: 'deleteContentBackward',
				selectionEnd: 5,
				selectionStart: 5,
				text: DEMO_COMPLETION_TEXT.slice(0, 5)
			})
		).toEqual({ caret: 4, value: DEMO_COMPLETION_TEXT.slice(0, 4) });
	});
});

describe('CompletionCache', () => {
	it('evicts the least recently used completion', () => {
		const cache = new CompletionCache(2);
		cache.set('a', 'one');
		cache.set('b', 'two');
		expect(cache.get('a')).toBe('one');

		cache.set('c', 'three');

		expect(cache.get('b')).toBeUndefined();
		expect(cache.get('a')).toBe('one');
		expect(cache.get('c')).toBe('three');
		expect(cache.size).toBe(2);
	});

	it('requires a positive integer limit', () => {
		expect(() => new CompletionCache(0)).toThrow(/positive integer/u);
		expect(() => new CompletionCache(1.5)).toThrow(/positive integer/u);
	});

	it('evicts an empty-string key (falsy but valid) instead of leaking past the limit', () => {
		const cache = new CompletionCache(1);
		cache.set('', 'blank'); // '' is a legitimate, falsy key
		cache.set('a', 'one'); // must evict the empty-string key, not bail on its falsiness

		expect(cache.size).toBe(1);
		expect(cache.get('')).toBeUndefined();
		expect(cache.get('a')).toBe('one');
	});
});
