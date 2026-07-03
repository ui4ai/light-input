export const MATRIX_COLUMN_COUNT = 20;
export const MATRIX_GLYPHS = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇ0123456789Z:=*+<>';

const MATRIX_DEPTH_SPEED = [1700, 2500, 3400];

export interface MatrixCell {
	flash: boolean;
	row: number;
	value: string;
}

export interface MatrixColumn {
	cells: MatrixCell[];
	delay: number;
	depth: number;
	drift: number;
	seed: number;
	speed: number;
}

export function createMatrixColumns(count = MATRIX_COLUMN_COUNT): MatrixColumn[] {
	return Array.from({ length: count }, (_, index) => {
		const depth = (index * 7) % 3;
		const rows = 8 + ((index * 7) % 5);

		return {
			cells: Array.from({ length: rows }, (_, row) => ({
				flash: false,
				row,
				value: MATRIX_GLYPHS[(index * 31 + row * (17 + index * 10)) % MATRIX_GLYPHS.length] ?? '0'
			})),
			delay: (index * 397) % 2200,
			depth,
			drift: ((index * 53) % 90) / 100,
			seed: (index * 2654435761) % 997,
			speed: (MATRIX_DEPTH_SPEED[depth] ?? 2500) + ((index * 271) % 700)
		};
	});
}

export function flipMatrixColumns(
	columns: MatrixColumn[],
	random: () => number = Math.random
): MatrixColumn[] {
	const total = columns.reduce((sum, column) => sum + column.cells.length, 0);
	if (!total) return columns;

	const flipCount = Math.min(total, Math.max(4, Math.round(total * 0.045)));
	const selected = new Set<number>();

	while (selected.size < flipCount) {
		selected.add(Math.floor(random() * total));
	}

	let offset = 0;

	return columns.map((column) => {
		const start = offset;
		offset += column.cells.length;

		return {
			...column,
			cells: column.cells.map((cell, cellIndex) => {
				if (!selected.has(start + cellIndex)) {
					return cell.flash ? { ...cell, flash: false } : cell;
				}

				return {
					...cell,
					flash: true,
					value: MATRIX_GLYPHS[Math.floor(random() * MATRIX_GLYPHS.length)] ?? cell.value
				};
			})
		};
	});
}
