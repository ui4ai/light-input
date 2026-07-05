<!-- Test layer A: renders an identifiable marker inside the live prediction. -->
<script lang="ts">
	// GhostInput passes { suggestion, lightFlow } to every layer; we accept and ignore them.
	let {}: { suggestion?: string; lightFlow?: boolean } = $props();
</script>

<span class="test-layer" data-layer="layer-a"></span>
