import { describe, expect, it } from 'vitest';
import { distantGlyph, ghostGlyphs, similarGlyph } from './glyphs';

describe('ghostGlyphs', () => {
	it('produces one descriptor per character with continuous absolute indices', () => {
		const glyphs = ghostGlyphs('abc', 5);
		expect(glyphs.map((g) => g.char)).toEqual(['a', 'b', 'c']);
		expect(glyphs.map((g) => g.index)).toEqual([5, 6, 7]);
	});

	it('splits multi-code-unit input by code point (Array.from semantics)', () => {
		// A surrogate pair counts as one glyph, not two.
		const glyphs = ghostGlyphs('a😀b', 0);
		expect(glyphs.map((g) => g.char)).toEqual(['a', '😀', 'b']);
		expect(glyphs.map((g) => g.index)).toEqual([0, 1, 2]);
	});

	it('computes speed as max(520, 1900 - index*96)', () => {
		expect(ghostGlyphs('a', 0)[0].speed).toBe(1900);
		expect(ghostGlyphs('a', 1)[0].speed).toBe(1900 - 96);
		// index 15 -> 1900 - 1440 = 460 -> clamped to 520.
		expect(ghostGlyphs('a', 15)[0].speed).toBe(520);
		expect(ghostGlyphs('a', 100)[0].speed).toBe(520);
	});

	it('computes strength as min(1, 0.18 + index*0.055)', () => {
		expect(ghostGlyphs('a', 0)[0].strength).toBeCloseTo(0.18, 12);
		expect(ghostGlyphs('a', 3)[0].strength).toBeCloseTo(0.345, 12);
		// index 15 -> 0.18 + 0.825 = 1.005 -> clamped to 1.
		expect(ghostGlyphs('a', 15)[0].strength).toBe(1);
	});

	it('wires alt/hard to distantGlyph at index and index+7, soft to similarGlyph', () => {
		const [g] = ghostGlyphs('m', 2);
		expect(g.alt).toBe(distantGlyph('m', 2));
		expect(g.hard).toBe(distantGlyph('m', 2 + 7));
		expect(g.soft).toBe(similarGlyph('m', 2));
	});

	it('is fully deterministic across calls', () => {
		expect(ghostGlyphs('hello world', 3)).toEqual(ghostGlyphs('hello world', 3));
	});

	it('returns an empty array for empty text', () => {
		expect(ghostGlyphs('', 0)).toEqual([]);
	});
});

describe('similarGlyph', () => {
	it('leaves whitespace untouched', () => {
		expect(similarGlyph(' ', 0)).toBe(' ');
		expect(similarGlyph('\t', 3)).toBe('\t');
	});

	it('rotates through the soft-map options deterministically by index', () => {
		// 'a' -> ['a','á','à','ä']; next = options[(index % (len-1)) + 1].
		expect(similarGlyph('a', 0)).toBe('á'); // (0 % 3) + 1 = 1
		expect(similarGlyph('a', 1)).toBe('à'); // (1 % 3) + 1 = 2
		expect(similarGlyph('a', 2)).toBe('ä'); // (2 % 3) + 1 = 3
		expect(similarGlyph('a', 3)).toBe('á'); // (3 % 3) + 1 = 1
	});

	it('preserves case: uppercase input yields uppercased look-alike', () => {
		expect(similarGlyph('A', 0)).toBe('Á');
	});

	it('maps Cyrillic look-alikes', () => {
		// 'н' -> ['н','h']; index 0 -> (0 % 1) + 1 = 1 -> 'h'.
		expect(similarGlyph('н', 0)).toBe('h');
	});

	it('alternates digits: even index keeps, odd index increments mod 10', () => {
		expect(similarGlyph('7', 0)).toBe('7');
		expect(similarGlyph('7', 1)).toBe('8');
		expect(similarGlyph('9', 1)).toBe('0');
	});

	it('returns unmapped punctuation unchanged', () => {
		expect(similarGlyph('!', 4)).toBe('!');
	});
});

describe('distantGlyph', () => {
	it('leaves whitespace untouched', () => {
		expect(distantGlyph(' ', 5)).toBe(' ');
	});

	it('shifts digits by index+3 mod 10', () => {
		expect(distantGlyph('0', 0)).toBe('3');
		expect(distantGlyph('9', 0)).toBe('2'); // (9+3)%10
		expect(distantGlyph('5', 2)).toBe('0'); // (5+2+3)%10
	});

	it('rotates lowercase Latin within a..z by index+9', () => {
		// 'a'(97) -> 97 + ((0 + 0 + 9) % 26) = 106 -> 'j'.
		expect(distantGlyph('a', 0)).toBe('j');
		// wraps around the alphabet.
		expect(distantGlyph('z', 0)).toBe('i'); // 122 -> 97 + ((25+9)%26)=97+8=105 -> 'i'
	});

	it('rotates uppercase Latin within A..Z, preserving case', () => {
		expect(distantGlyph('A', 0)).toBe('J');
	});

	it('rotates Cyrillic within its alphabet', () => {
		// cyrillicLower = 'абвгдеёжзийклмн...'; 'а' at position 0 -> (0 + 0 + 11) % 32 = 11 -> 'к'.
		expect(distantGlyph('а', 0)).toBe('к');
	});

	it('falls back to the marks table for other characters', () => {
		const marks = ['#', '%', '0', '1', 'x', '/', '+', '*', '?', '~'];
		const code = '!'.codePointAt(0) ?? 0;
		expect(distantGlyph('!', 0)).toBe(marks[code % marks.length]);
	});

	it('is deterministic', () => {
		expect(distantGlyph('q', 4)).toBe(distantGlyph('q', 4));
	});
});
