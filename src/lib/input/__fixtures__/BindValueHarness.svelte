<!--
  Test harness for `bind:value`. Owns a reactive `text` state, two-way binds it to GhostInput's
  `value`, mirrors the live bound value into an `<output class="bound">` probe, and exports a
  `setValue` setter so a test can push a value INTO the binding (prop -> input direction). The
  input -> prop direction is observed by reading the probe after typing. All other props pass
  through. `initialValue` seeds the state.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import GhostInput from '$lib/GhostInput.svelte';

	let { initialValue = '', ...rest }: { initialValue?: string } & Record<string, unknown> =
		$props();

	// Seed once from the prop; the binding owns the value thereafter (untrack silences the
	// state_referenced_locally hint — the one-time read is intentional).
	let text = $state(untrack(() => initialValue));

	/** Push a value into the binding from the parent (prop -> input). */
	export function setValue(next: string) {
		text = next;
	}
	/** Read the current bound value (input -> prop). */
	export function getValue() {
		return text;
	}
</script>

<GhostInput bind:value={text} {...rest} />
<output class="bound">{text}</output>
