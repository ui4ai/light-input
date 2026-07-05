import { describe, expect, it } from 'vitest';
import { endAlignedScrollLeft, SelectionTracker } from './selection.svelte';

describe('endAlignedScrollLeft (runway clamp)', () => {
	it('scrolls fully right when text overflows past the runway', () => {
		// scrollWidth 300, clientWidth 100, runway 20 -> overflow 180 (>1) -> scrollWidth.
		expect(endAlignedScrollLeft(300, 100, 20)).toBe(300);
	});

	it('pins to 0 when the text fits within client width minus runway', () => {
		// overflow = 100 - 100 - 20 = -20 -> 0.
		expect(endAlignedScrollLeft(100, 100, 20)).toBe(0);
	});

	it('pins to 0 at the exact boundary (overflow <= 1)', () => {
		// overflow = 121 - 100 - 20 = 1 -> not > 1 -> 0.
		expect(endAlignedScrollLeft(121, 100, 20)).toBe(0);
		// overflow = 122 - 100 - 20 = 2 -> > 1 -> scrollWidth.
		expect(endAlignedScrollLeft(122, 100, 20)).toBe(122);
	});
});

/** Build an <input> with stubbed geometry for deterministic scroll-runway assertions. */
function stubInput(opts: {
	selectionStart?: number | null;
	selectionEnd?: number | null;
	scrollWidth?: number;
	clientWidth?: number;
	scrollLeft?: number;
	paddingRight?: string;
}) {
	const input = document.createElement('input');
	document.body.appendChild(input);
	input.style.paddingRight = opts.paddingRight ?? '0px';
	Object.defineProperty(input, 'selectionStart', { value: opts.selectionStart ?? null, configurable: true });
	Object.defineProperty(input, 'selectionEnd', { value: opts.selectionEnd ?? null, configurable: true });
	Object.defineProperty(input, 'scrollWidth', { value: opts.scrollWidth ?? 0, configurable: true });
	Object.defineProperty(input, 'clientWidth', { value: opts.clientWidth ?? 0, configurable: true });
	// scrollLeft must be writable so sync() can set it.
	let scroll = opts.scrollLeft ?? 0;
	Object.defineProperty(input, 'scrollLeft', {
		get: () => scroll,
		set: (v: number) => {
			scroll = v;
		},
		configurable: true
	});
	return input;
}

describe('SelectionTracker', () => {
	it('is a no-op when no input is provided', () => {
		const t = new SelectionTracker();
		t.start = 3;
		t.sync(undefined, 10);
		expect(t.start).toBe(3); // unchanged
	});

	it('mirrors the input selection and scrollLeft into $state', () => {
		const t = new SelectionTracker();
		const input = stubInput({ selectionStart: 2, selectionEnd: 5, scrollLeft: 7 });
		t.sync(input, 10);
		expect(t.start).toBe(2);
		expect(t.end).toBe(5);
		expect(t.scrollLeft).toBe(7);
	});

	it('falls back to valueLength when selectionStart is null', () => {
		const t = new SelectionTracker();
		const input = stubInput({ selectionStart: null, selectionEnd: null, scrollLeft: 0 });
		t.sync(input, 8);
		expect(t.start).toBe(8);
		expect(t.end).toBe(8);
	});

	it('with alignEnd + caret at text end + overflow, scrolls the input fully right', () => {
		const t = new SelectionTracker();
		const input = stubInput({
			selectionStart: 12,
			selectionEnd: 12,
			scrollWidth: 300,
			clientWidth: 100,
			scrollLeft: 0,
			paddingRight: '20px'
		});
		t.sync(input, 12, true);
		expect(input.scrollLeft).toBe(300);
		expect(t.scrollLeft).toBe(300);
	});

	it('with alignEnd but caret NOT at text end, leaves scrollLeft as read', () => {
		const t = new SelectionTracker();
		const input = stubInput({
			selectionStart: 5,
			selectionEnd: 5,
			scrollWidth: 300,
			clientWidth: 100,
			scrollLeft: 42,
			paddingRight: '20px'
		});
		t.sync(input, 12, true);
		expect(input.scrollLeft).toBe(42); // untouched
		expect(t.scrollLeft).toBe(42);
	});
});
