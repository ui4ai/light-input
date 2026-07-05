// Selection + scroll-runway tracking for the ghost input.
//
// Owns the caret/selection $state (start, end, scrollLeft) that GhostInput's deriveds read
// (collapsed, atEnd, visibleText, scrolled...). `sync()` mirrors the real <input>'s selection and,
// when aligning to the end of the text, computes the scroll offset that keeps the caret parked at
// the visual right edge behind the reserved runway (the input's right padding). Extracted verbatim
// from GhostInput.svelte so behavior is identical.

/**
 * Pure runway math: given the input's scroll/geometry when the caret is at text end, return the
 * scrollLeft to apply. If the text overflows past the runway (right padding), scroll fully right
 * so the caret sits at the edge; otherwise pin to 0. Exposed for unit testing the clamp.
 */
export function endAlignedScrollLeft(scrollWidth: number, clientWidth: number, runway: number): number {
	const textOverflow = scrollWidth - clientWidth - runway;
	return textOverflow > 1 ? scrollWidth : 0;
}

export class SelectionTracker {
	start = $state(0);
	end = $state(0);
	scrollLeft = $state(0);

	/**
	 * Read the input's selection into $state. When `alignEnd` is set and the caret is at the end
	 * of `valueLength`, first adjust the input's own scrollLeft via the runway math so the caret
	 * stays visible, then record it.
	 */
	sync(input: HTMLInputElement | undefined, valueLength: number, alignEnd = false) {
		if (!input) return;
		const start = input.selectionStart ?? valueLength;
		const end = input.selectionEnd ?? start;
		if (alignEnd && start === valueLength && end === valueLength) {
			const style = getComputedStyle(input);
			const runway = Number.parseFloat(style.paddingRight) || 0;
			input.scrollLeft = endAlignedScrollLeft(input.scrollWidth, input.clientWidth, runway);
		}
		this.start = start;
		this.end = end;
		this.scrollLeft = input.scrollLeft;
	}
}
