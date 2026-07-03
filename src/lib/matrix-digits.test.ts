import { describe, expect, it } from 'vitest';
import {
	MATRIX_COLUMN_COUNT,
	MATRIX_GLYPHS,
	createMatrixColumns,
	flipMatrixColumns
} from './matrix-digits';

describe('matrix rain columns', () => {
	it('creates a deterministic column-major rain layout', () => {
		const columns = createMatrixColumns(3);

		expect(columns).toHaveLength(3);
		expect(columns.map((column) => column.cells.length)).toEqual([8, 10, 12]);
		expect(columns.map((column) => column.depth)).toEqual([0, 1, 2]);
		expect(columns.map((column) => column.speed)).toEqual([1700, 2771, 3942]);
		expect(columns.map((column) => column.delay)).toEqual([0, 397, 794]);
		expect(columns.map((column) => column.drift)).toEqual([0, 0.53, 0.16]);
		expect(columns[0]?.cells.map((cell) => cell.value).join('')).toBe('ﾊﾏ3ｰｴ6ﾅﾑ');

		const cells = columns.flatMap((column) => column.cells);
		expect(cells.every((cell) => !cell.flash)).toBe(true);
		expect(cells.every((cell) => MATRIX_GLYPHS.includes(cell.value))).toBe(true);
		expect(
			cells.every((cell, index) => cell.row === (index < 8 ? index : index < 18 ? index - 8 : index - 18))
		).toBe(true);
		expect(createMatrixColumns(3)).toEqual(columns);
	});

	it('keeps the default span budget bounded', () => {
		const columns = createMatrixColumns();

		expect(columns).toHaveLength(MATRIX_COLUMN_COUNT);
		expect(columns.reduce((sum, column) => sum + column.cells.length, 0)).toBe(200);
	});

	it('flips individual glyphs without rebuilding the rain layout', () => {
		const randomValues = [0, 0.35, 0.7, 0.99, 0.12, 0.44, 0.86, 0.23, 0.57, 0.91];
		let cursor = 0;
		const random = () => randomValues[cursor++ % randomValues.length];

		const before = createMatrixColumns(2);
		const after = flipMatrixColumns(before, random);

		const beforeCells = before.flatMap((column) => column.cells);
		const afterCells = after.flatMap((column) => column.cells);
		const flashed = afterCells.map((cell, index) => (cell.flash ? index : -1)).filter((index) => index >= 0);
		const changed = afterCells.filter((cell, index) => cell.value !== beforeCells[index]?.value);

		expect(afterCells).toHaveLength(beforeCells.length);
		expect(flashed).toEqual([0, 6, 12, 17]);
		expect(changed).toHaveLength(4);
		expect(flashed.map((index) => afterCells[index]?.value).join('')).toBe('ｼｶZﾂ');
		expect(after.map((column) => column.speed)).toEqual(before.map((column) => column.speed));
		expect(after.map((column) => column.delay)).toEqual(before.map((column) => column.delay));

		const settled = flipMatrixColumns(after, random);
		expect(settled.flatMap((column) => column.cells).filter((cell) => cell.flash)).toHaveLength(4);
	});
});
