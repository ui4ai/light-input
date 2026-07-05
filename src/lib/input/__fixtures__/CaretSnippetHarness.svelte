<!--
  Test harness: drives GhostInput with a custom `caret` snippet. The snippet renders a
  distinctive `<b class="custom-caret">` and echoes the passed CaretState onto data-attrs so a
  test can assert both that the override replaced the default `.caret` span and that the state
  flags flow through. All other props pass straight through.
-->
<script lang="ts">
	import GhostInput from '$lib/GhostInput.svelte';
	let props: Record<string, unknown> = $props();
</script>

<GhostInput {...props}>
	{#snippet caret({ focused, loading, ready })}
		<b
			class="custom-caret"
			data-focused={focused}
			data-loading={loading}
			data-ready={ready}
		></b>
	{/snippet}
</GhostInput>
