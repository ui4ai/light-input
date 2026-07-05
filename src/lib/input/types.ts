// Public types for the GhostInput snippet/callback surface.
//
// These live in a plain .ts module (not inside GhostInput.svelte's <script>) so `svelte-package`
// emits them as standalone declarations in `dist/` — a type declared only inside a component's
// script is not part of that component's generated `.d.ts` and could not be re-exported from the
// package root.

/**
 * State passed to a custom `caret` snippet so it can mirror the built-in caret's classes. The
 * default `.caret` span adds `.active` when focused, `.thinking` while a request is in flight, and
 * `.steady` when a suggestion is showing.
 */
export interface CaretState {
	/** The input is focused (the default caret adds `.active` and blinks). */
	focused: boolean;
	/** A prediction request is in flight (the default caret adds `.thinking`). */
	loading: boolean;
	/** A suggestion is showing (the default caret adds `.steady` and stops blinking). */
	ready: boolean;
}

/**
 * Payload for the `onaccept` callback, fired each time a word is accepted (Tab / → / the mobile
 * accept button).
 */
export interface AcceptDetail {
	/** The word (with any leading space) that was just accepted onto the input value. */
	word: string;
	/** The full input value *after* the word was appended. */
	text: string;
}
