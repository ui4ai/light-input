// Scripted demo-typing handlers.
//
// In `completionMode='demo'` the input does not accept free text — every keystroke/paste is
// intercepted and the value is rebuilt as a prefix of the fixed demo sentence (see
// applyScriptedDemoInput in autocomplete.ts). These two pure helpers classify the raw browser
// events into the {inputType, data} the scripted rebuild consumes. Extracted verbatim from
// GhostInput.svelte; no state, no DOM — trivially unit-testable.

/** True for the InputEvent types the demo intercepts (any insertion or deletion). */
export function isScriptedInput(inputType: string): boolean {
	return inputType.startsWith('insert') || inputType.startsWith('delete');
}

export interface ScriptedKeyInput {
	inputType: string;
	data?: string;
}

/**
 * Map a keydown to a scripted input intent, or undefined if the key is not scripted typing.
 * Modifier chords (Alt/Ctrl/Meta) are ignored so shortcuts still work; Backspace/Delete map to
 * the matching delete inputType; any single printable character maps to insertText.
 */
export function scriptedKeyInput(event: KeyboardEvent): ScriptedKeyInput | undefined {
	if (event.altKey || event.ctrlKey || event.metaKey) return undefined;
	if (event.key === 'Backspace') return { inputType: 'deleteContentBackward' };
	if (event.key === 'Delete') return { inputType: 'deleteContentForward' };
	if (event.key.length === 1) return { data: event.key, inputType: 'insertText' };
	return undefined;
}
