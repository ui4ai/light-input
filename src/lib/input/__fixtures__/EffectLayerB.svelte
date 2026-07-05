<!-- Test layer B: a second distinct marker, to prove an explicit layer prop wins over effect.layer. -->
<script lang="ts">
	let {}: { suggestion?: string; lightFlow?: boolean } = $props();
</script>

<span class="test-layer" data-layer="layer-b"></span>
