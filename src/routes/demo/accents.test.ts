import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOW_VARIANTS } from '@ui4ai/light-input';

// Accent-coverage guard for the demo glow rail. Every GLOW_VARIANTS effect must resolve a
// four-token accent pack in accents.css so no chip renders in the torch-orange fallback (torch
// itself is the deliberate exception — its palette IS the base default). Extract the packs by
// parsing the stylesheet, then assert full coverage + well-formedness.

const CSS = readFileSync(join(process.cwd(), 'src/routes/demo/accents.css'), 'utf8');
const ACCENT_TOKENS = ['--glow-a', '--glow-b', '--glow-border', '--glow-shadow'] as const;

/** Names with an explicit `.glow-accent[data-glow='<name>']` block. */
function packedNames(): Set<string> {
	const names = new Set<string>();
	const re = /\.glow-accent\[data-glow='([a-z0-9-]+)'\]/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(CSS))) names.add(m[1]);
	return names;
}

/** The body of a selector block, or null if the selector is absent. */
function blockBody(selector: string): string | null {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
	const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u');
	return re.exec(CSS)?.[1] ?? null;
}

describe('demo glow-rail accent coverage', () => {
	const packed = packedNames();

	it('torch is covered by the base .glow-accent default (not an explicit pack)', () => {
		const base = blockBody('.glow-accent');
		expect(base).not.toBeNull();
		for (const token of ACCENT_TOKENS) expect(base).toContain(`${token}:`);
		// torch has no per-effect override — it rides the orange base.
		expect(packed.has('torch')).toBe(false);
	});

	it('every non-torch GLOW_VARIANTS effect has an explicit accent pack', () => {
		const missing = GLOW_VARIANTS.filter((name) => name !== 'torch' && !packed.has(name));
		expect(missing).toEqual([]);
	});

	it('every accent pack defines all four accent tokens', () => {
		for (const name of GLOW_VARIANTS) {
			if (name === 'torch') continue;
			const body = blockBody(`.glow-accent[data-glow='${name}']`);
			expect(body, `pack for ${name}`).not.toBeNull();
			for (const token of ACCENT_TOKENS) {
				expect(body, `${name} → ${token}`).toContain(`${token}:`);
			}
		}
	});

	it('defines no accent pack for a name outside GLOW_VARIANTS', () => {
		const known = new Set<string>(GLOW_VARIANTS);
		const stray = [...packed].filter((name) => !known.has(name));
		expect(stray).toEqual([]);
	});
});
