import { describe, expect, it } from 'vitest';
import { isScriptedInput, scriptedKeyInput } from './demo-script';

describe('isScriptedInput', () => {
	it('accepts insertion and deletion input types', () => {
		expect(isScriptedInput('insertText')).toBe(true);
		expect(isScriptedInput('insertFromPaste')).toBe(true);
		expect(isScriptedInput('deleteContentBackward')).toBe(true);
		expect(isScriptedInput('deleteContentForward')).toBe(true);
	});

	it('rejects other input types', () => {
		expect(isScriptedInput('formatBold')).toBe(false);
		expect(isScriptedInput('historyUndo')).toBe(false);
		expect(isScriptedInput('')).toBe(false);
	});
});

/** Minimal KeyboardEvent-shaped stub. */
function key(partial: Partial<KeyboardEvent>): KeyboardEvent {
	return {
		key: '',
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		...partial
	} as KeyboardEvent;
}

describe('scriptedKeyInput', () => {
	it('maps a printable character to insertText with its data', () => {
		expect(scriptedKeyInput(key({ key: 'a' }))).toEqual({ data: 'a', inputType: 'insertText' });
		expect(scriptedKeyInput(key({ key: 'Й' }))).toEqual({ data: 'Й', inputType: 'insertText' });
	});

	it('maps Backspace and Delete to the matching delete input types', () => {
		expect(scriptedKeyInput(key({ key: 'Backspace' }))).toEqual({
			inputType: 'deleteContentBackward'
		});
		expect(scriptedKeyInput(key({ key: 'Delete' }))).toEqual({
			inputType: 'deleteContentForward'
		});
	});

	it('ignores modifier chords (Alt/Ctrl/Meta) so shortcuts are not swallowed', () => {
		expect(scriptedKeyInput(key({ key: 'a', ctrlKey: true }))).toBeUndefined();
		expect(scriptedKeyInput(key({ key: 'a', metaKey: true }))).toBeUndefined();
		expect(scriptedKeyInput(key({ key: 'Backspace', altKey: true }))).toBeUndefined();
	});

	it('returns undefined for non-printable named keys', () => {
		expect(scriptedKeyInput(key({ key: 'ArrowLeft' }))).toBeUndefined();
		expect(scriptedKeyInput(key({ key: 'Shift' }))).toBeUndefined();
		expect(scriptedKeyInput(key({ key: 'Enter' }))).toBeUndefined();
	});

	it('allows a plain Shift+character (shift is not a chord modifier here)', () => {
		expect(scriptedKeyInput(key({ key: 'A', shiftKey: true }))).toEqual({
			data: 'A',
			inputType: 'insertText'
		});
	});
});
