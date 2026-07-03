<script lang="ts">
	import { createMatrixColumns, flipMatrixColumns } from './digits';

	interface Props {
		suggestion: string;
		lightFlow: boolean;
	}

	let { suggestion, lightFlow }: Props = $props();

	let columns = $state(createMatrixColumns());
	let suggestionKey = '';

	$effect(() => {
		if (suggestion === suggestionKey) return;
		suggestionKey = suggestion;
		columns = createMatrixColumns();
	});

	$effect(() => {
		if (!lightFlow) return;

		const interval = window.setInterval(() => {
			columns = flipMatrixColumns(columns);
		}, 92);

		return () => window.clearInterval(interval);
	});
</script>

<span class="matrix-code-layer" data-testid="matrix-code-layer" aria-hidden="true"
	>{#each columns as column, colIndex (colIndex)}<span
			class="matrix-col"
			data-depth={column.depth}
			style={`--rows:${column.cells.length};--fall:${column.speed}ms;--phase:${column.delay}ms;--drift:${column.drift}em`}
			>{#each column.cells as cell, rowIndex (rowIndex)}<span
					class="matrix-cell"
					class:flash={cell.flash}
					style={`--row:${cell.row}`}>{cell.value}</span
				>{/each}</span
		>{/each}</span
>
