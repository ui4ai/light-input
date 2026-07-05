<script lang="ts">
	import '../app.css';
	import favicon from './demo/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
	<title>light-input · ghost autocomplete</title>
</svelte:head>

{@render children()}
