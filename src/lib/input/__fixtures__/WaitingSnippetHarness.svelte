<!--
  Test harness: drives GhostInput with a custom `waiting` snippet. The snippet renders a
  distinctive `<i class="custom-waiting">` inside the `.caret-origin-glow` subtree, replacing the
  six default torch beams. All other props pass straight through.
-->
<script lang="ts">
	import GhostInput from '$lib/GhostInput.svelte';
	let props: Record<string, unknown> = $props();
</script>

<GhostInput {...props}>
	{#snippet waiting()}
		<i class="custom-waiting"></i>
	{/snippet}
</GhostInput>
