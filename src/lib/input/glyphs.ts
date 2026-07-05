// Ghost-glyph machinery for the live prediction.
//
// Pure, deterministic character math extracted verbatim from GhostInput.svelte. For each
// character of a suggestion it precomputes the mutation glyphs the CSS choreography swaps in
// (`soft`/`alt`/`hard` via data-* attributes) plus the per-glyph animation `speed`/`strength`
// consumed as inline custom properties. No randomness, no I/O — index arithmetic only — so the
// output is stable for a given (text, offset) and unit-testable in isolation.

export interface GhostGlyph {
	char: string;
	/** Distant mutation glyph, printed via `data-alt` (::after content). */
	alt: string;
	/** Harder distant mutation glyph, exposed via `data-hard`. */
	hard: string;
	/** Absolute index of this glyph across the whole suggestion (drives `--i`). */
	index: number;
	/** Nearby look-alike glyph, exposed via `data-soft`. */
	soft: string;
	/** Per-glyph mutation cadence in ms (drives `--mut-speed`). */
	speed: number;
	/** Per-glyph mutation strength 0..1 (drives `--mut-strength`). */
	strength: number;
}

/**
 * Build the glyph descriptors for `text`, whose first character sits at absolute `offset`.
 * Callers split a suggestion into the next word (offset 0) and the tail (offset = next.length)
 * so `--i` stays continuous across the two runs.
 */
export function ghostGlyphs(text: string, offset: number): GhostGlyph[] {
	return Array.from(text, (char, localIndex) => {
		const index = offset + localIndex;
		const speed = Math.max(520, 1900 - index * 96);
		const strength = Math.min(1, 0.18 + index * 0.055);

		return {
			char,
			alt: distantGlyph(char, index),
			hard: distantGlyph(char, index + 7),
			index,
			soft: similarGlyph(char, index),
			speed,
			strength
		};
	});
}

/** A nearby look-alike for `char` (Latin/Cyrillic soft map), deterministic in `index`. */
export function similarGlyph(char: string, index: number): string {
	if (/\s/u.test(char)) return char;

	const softMap: Record<string, string[]> = {
		a: ['a', 'á', 'à', 'ä'],
		b: ['b', 'þ', 'ь'],
		c: ['c', 'ç', '('],
		d: ['d', 'ð', 'cl'],
		e: ['e', 'é', 'ė', 'ë'],
		f: ['f', 'ƒ'],
		g: ['g', '9'],
		h: ['h', 'н'],
		i: ['i', 'í', '1', 'l'],
		j: ['j', 'ĵ'],
		k: ['k', 'κ'],
		l: ['l', '1', 'í'],
		m: ['m', 'rn'],
		n: ['n', 'ñ'],
		o: ['o', 'ó', '0', 'ø'],
		p: ['p', 'ρ'],
		q: ['q', '9'],
		r: ['r', 'г'],
		s: ['s', 'ś', '5'],
		t: ['t', '†', '+'],
		u: ['u', 'ú', 'υ'],
		v: ['v', 'ν'],
		w: ['w', 'vv'],
		x: ['x', '×'],
		y: ['y', 'ý'],
		z: ['z', 'ž', '2'],
		а: ['а', 'a', 'á'],
		в: ['в', 'b', 'ʙ'],
		г: ['г', 'r'],
		д: ['д', '∂'],
		е: ['е', 'ё', 'e'],
		з: ['з', '3'],
		и: ['и', 'й'],
		к: ['к', 'k'],
		л: ['л', 'Λ'],
		м: ['м', 'm'],
		н: ['н', 'h'],
		о: ['о', 'o', '0'],
		п: ['п', 'n'],
		р: ['р', 'p'],
		с: ['с', 'c'],
		т: ['т', 'm'],
		у: ['у', 'y'],
		х: ['х', 'x'],
		ч: ['ч', '4'],
		ь: ['ь', 'b'],
		я: ['я', 'R']
	};
	const lower = char.toLocaleLowerCase();
	const options = softMap[lower];
	if (options?.length) {
		const next = options[(index % (options.length - 1)) + 1] ?? options[0];
		return char === lower ? next : next.toLocaleUpperCase();
	}

	if (/[0-9]/u.test(char)) return index % 2 === 0 ? char : String((Number(char) + 1) % 10);

	return char;
}

/** A far-removed mutation glyph for `char`, deterministic in `index`. */
export function distantGlyph(char: string, index: number): string {
	if (/\s/u.test(char)) return char;

	const marks = ['#', '%', '0', '1', 'x', '/', '+', '*', '?', '~'];
	const cyrillicLower = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
	const cyrillicUpper = cyrillicLower.toLocaleUpperCase();
	const code = char.codePointAt(0) ?? 0;
	if (/[0-9]/u.test(char)) return String((Number(char) + index + 3) % 10);
	if (/[A-Za-z]/u.test(char)) {
		const base = char === char.toLocaleUpperCase() ? 65 : 97;
		return String.fromCharCode(base + ((code - base + index + 9) % 26));
	}
	if (cyrillicLower.includes(char)) {
		const charIndex = cyrillicLower.indexOf(char);
		return cyrillicLower[(charIndex + index + 11) % cyrillicLower.length] ?? char;
	}
	if (cyrillicUpper.includes(char)) {
		const charIndex = cyrillicUpper.indexOf(char);
		return cyrillicUpper[(charIndex + index + 11) % cyrillicUpper.length] ?? char;
	}

	return marks[(code + index) % marks.length];
}
