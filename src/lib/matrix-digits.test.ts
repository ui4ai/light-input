import { describe, expect, it } from 'vitest';
import { createMatrixDigits, flipMatrixDigits } from './matrix-digits';

describe('matrix digits', () => {
	it('starts from one deterministic alternating binary layer', () => {
		expect(createMatrixDigits(8).map((digit) => digit.value).join('')).toBe('01010101');
	});

	it('flips individual digits without rebuilding the whole layer pattern', () => {
		const randomValues = [0, 0.35, 0.7, 0.99, 0.12, 0.44, 0.86, 0.23, 0.57, 0.91];
		let cursor = 0;
		const random = () => randomValues[cursor++ % randomValues.length];

		const before = createMatrixDigits(8);
		const after = flipMatrixDigits(before, random);
		const changed = after.filter((digit, index) => digit.value !== before[index]?.value);

		expect(after).toHaveLength(before.length);
		expect(changed).toHaveLength(4);
		expect(after.some((digit) => digit.hot)).toBe(true);
	});
});
