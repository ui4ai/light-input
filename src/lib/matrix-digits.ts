export const MATRIX_DIGIT_COUNT = 210;

export interface MatrixDigit {
	delay: number;
	hot: boolean;
	opacity: number;
	speed: number;
	value: '0' | '1';
}

export function createMatrixDigits(count = MATRIX_DIGIT_COUNT): MatrixDigit[] {
	return Array.from({ length: count }, (_, index) => {
		return {
			delay: (index * 97) % 1900,
			hot: false,
			opacity: 0.28 + (((index * 17) % 41) / 100),
			speed: 1200 + ((index * 73) % 2400),
			value: index % 2 === 0 ? '0' : '1'
		};
	});
}

export function flipMatrixDigits(
	digits: MatrixDigit[],
	random: () => number = Math.random
): MatrixDigit[] {
	if (!digits.length) return digits;

	const flipCount = Math.min(digits.length, Math.max(4, Math.round(digits.length * 0.065)));
	const selected = new Set<number>();

	while (selected.size < flipCount) {
		selected.add(Math.floor(random() * digits.length));
	}

	return digits.map((digit, index) => {
		const hot = selected.has(index);
		if (!hot) return { ...digit, hot: false };

		return {
			...digit,
			hot: true,
			opacity: 0.42 + random() * 0.44,
			speed: 900 + Math.round(random() * 2300),
			value: digit.value === '0' ? '1' : '0'
		};
	});
}
