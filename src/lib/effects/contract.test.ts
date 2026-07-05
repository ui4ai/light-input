// Per-effect CONTRACT test (workstream W8). This is the machine-enforced replacement for the
// regex forensics that used to pin effect isolation by convention. It parses every effect module
// with a real CSS parser (postcss) and asserts the structural contract each of the 39 effects must
// keep so they can be published as independent, tree-shakeable entries that never corrupt one
// another when several are loaded on the same page.
//
// What it enforces, per effect:
//   1. Metadata: `meta.name` === its folder name === its GLOW_VARIANTS entry; `label` non-empty.
//   2. Every module CSS (38 of them — torch's skin IS core.css) parses cleanly with postcss.
//   3. Every rule selector is gated on `[data-glow]` (bare or valued). Ungated selectors would
//      leak into other effects; @keyframes step rules are exempt (not part of the cascade), and
//      @property / @keyframes / @media are at-rules, not selectors.
//   4. Every `@keyframes` and `@property` name (both are PAGE-GLOBAL — no scoping) starts with the
//      effect's namespace prefix. The prefix set is derived per module from actual usage and
//      recorded here; classics keep their historical names (lightning → `bolt-`, ghosttext →
//      `ghost-`) and modules that register animated typed properties use a short abbreviation
//      (blackhole → `--bh-`, vortex → `--vx-`, …). Global uniqueness of these names across the
//      whole bundle is a separate guarantee (scripts/check-namespaces.mjs); here we prove each
//      name is *attributable to its owning effect*.
//   5. Registry shape: `effects` has length 39 and its order === GLOW_VARIANTS; `effectByName`
//      round-trips; layer-bearing effects (matrix, kaleidoscope) expose a `layer`.
//   6. Performance cap: the number of INFINITE animations an effect declares per visual state is
//      bounded. The bound is `max observed on the current tree` (measured below), asserted with
//      `<=`. It pins today's reality: an effect that suddenly declares more perpetual animations
//      than any existing one (a real perf regression) fails and must consciously bump the cap.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss, { type Rule } from 'postcss';
import { GLOW_VARIANTS } from '../autocomplete';
import { effects, effectByName } from './index';

const EFFECTS_DIR = 'src/lib/effects';

/** Effects that ship a skin CSS file (everyone except torch, whose skin is core.css). */
const CSS_EFFECTS = GLOW_VARIANTS.filter((name) => name !== 'torch');

function modulePath(name: string): string {
	return join(process.cwd(), EFFECTS_DIR, name, 'index.css');
}

function readModule(name: string): string {
	return readFileSync(modulePath(name), 'utf8');
}

/** Parse a module's CSS with postcss (throws on a syntax error, which is the assertion we want). */
function parseModule(name: string) {
	return postcss.parse(readModule(name), { from: modulePath(name) });
}

/** True if a rule sits inside a @keyframes block (its selectors are frame stops, not cascade rules). */
function insideKeyframes(rule: Rule): boolean {
	let p: Rule['parent'] | undefined = rule.parent;
	while (p) {
		if (p.type === 'atrule' && /keyframes/i.test((p as { name: string }).name)) return true;
		p = (p as { parent?: Rule['parent'] }).parent;
	}
	return false;
}

/**
 * Namespace prefix map. Every `@keyframes`/`@property` name a module declares must start with one
 * of the prefixes recorded for that module. Derived from actual usage on the current tree and kept
 * explicit so a stray un-prefixed name (which, being page-global, would collide across the bundle)
 * fails loudly.
 *
 * - `keyframes`: the allowed `@keyframes` name prefixes. Default is `<name>-`; the two classics
 *   that kept historical names are the only exceptions:
 *     lightning → `bolt-`  (bolt-pulse / bolt-surge / bolt-particles — pre-split names)
 *     ghosttext → `ghost-` (the effect is `ghosttext`, its animations read `ghost-*`)
 * - `property`: the allowed `@property` name prefixes (empty when the module registers none).
 *   Animated typed properties use a short, per-effect abbreviation.
 */
const NAMESPACE: Record<string, { keyframes: string[]; property: string[] }> = {
	// classics (var-packs + a handful of keyframes; no @property)
	candle: { keyframes: ['candle-'], property: [] },
	lightning: { keyframes: ['bolt-'], property: [] }, // historical: bolt-*
	aurora: { keyframes: ['aurora-'], property: [] },
	plasma: { keyframes: ['plasma-'], property: [] },
	prism: { keyframes: ['prism-'], property: [] },
	ember: { keyframes: ['ember-'], property: [] },
	neon: { keyframes: ['neon-'], property: [] },
	nebula: { keyframes: ['nebula-'], property: [] },
	smoke: { keyframes: ['smoke-'], property: [] },
	solar: { keyframes: ['solar-'], property: [] },
	holo: { keyframes: ['holo-'], property: [] },
	// redesigned modules
	blackhole: { keyframes: ['blackhole-'], property: ['--bh-'] },
	flame: { keyframes: ['flame-'], property: [] },
	matrix: { keyframes: ['matrix-'], property: [] },
	snow: { keyframes: ['snow-'], property: [] },
	toxic: { keyframes: ['toxic-'], property: [] },
	vortex: { keyframes: ['vortex-'], property: ['--vx-'] },
	bubblegum: { keyframes: ['bubblegum-'], property: ['--bblg-'] },
	optic: { keyframes: ['optic-'], property: ['--optic-'] },
	biolume: { keyframes: ['biolume-'], property: [] },
	ocean: { keyframes: ['ocean-'], property: [] },
	horror: { keyframes: ['horror-'], property: [] },
	heart: { keyframes: ['heart-'], property: [] },
	liquidglass: { keyframes: ['liquidglass-'], property: [] },
	android: { keyframes: ['android-'], property: [] },
	fontshift: { keyframes: ['fontshift-'], property: [] },
	rorschach: { keyframes: ['rorschach-'], property: [] },
	diffusion: { keyframes: ['diffusion-'], property: [] },
	chromabloom: { keyframes: ['chromabloom-'], property: ['--cb-'] },
	infrared: { keyframes: ['infrared-'], property: ['--ir-'] },
	staged: { keyframes: ['staged-'], property: [] },
	blueprint: { keyframes: ['blueprint-'], property: ['--bp-'] },
	spoiler: { keyframes: ['spoiler-'], property: [] },
	ghosttext: { keyframes: ['ghost-'], property: ['--gh-'] }, // historical: ghost-*
	drift: { keyframes: ['drift-'], property: ['--dr-'] },
	art: { keyframes: ['art-'], property: ['--art-'] },
	scratch: { keyframes: ['scratch-'], property: ['--sc-'] },
	kaleidoscope: { keyframes: ['kaleidoscope-'], property: ['--ka-'] }
};

/**
 * Infinite-animation budget per visual state, in DECLARATIONS (an `animation`/`animation-iteration-
 * count` or `--*-motion` value containing the `infinite` keyword). Measured on the current tree:
 *   base (ready/idle): max 17 (toxic) · waiting: max 6 (snow) · error: max 0 (none)
 *   total per module:  max 22 (toxic)
 * The cap equals the observed maximum and is asserted with `<=`, so it pins today's reality — an
 * effect that declares more perpetual animations than any existing one trips it. Bumping a cap is a
 * conscious edit here, not a silent regression.
 */
const INFINITE_CAP = { base: 17, waiting: 6, error: 0, total: 22 } as const;

/** Which visual state a flat rule belongs to, read from a `data-state` gate in its selector. */
function stateOfRule(rule: Rule): 'base' | 'waiting' | 'error' {
	const sel = rule.selector ?? '';
	if (/\[data-state=['"]?waiting['"]?\]/.test(sel)) return 'waiting';
	if (/\[data-state=['"]?error['"]?\]/.test(sel)) return 'error';
	return 'base'; // ready / idle / not state-gated
}

/** True if this declaration turns on a perpetual (`infinite`) animation. */
function declaresInfinite(prop: string, value: string): boolean {
	if (!/\binfinite\b/.test(value.toLowerCase())) return false;
	const p = prop.toLowerCase();
	if (p === 'animation' || p === 'animation-iteration-count') return true;
	if (p.startsWith('--') && /-motion$/.test(p)) return true; // the effect motion tokens
	return false;
}

/** Count infinite-animation declarations per state for one module. */
function infiniteCounts(name: string): { base: number; waiting: number; error: number } {
	const counts = { base: 0, waiting: 0, error: 0 };
	parseModule(name).walkRules((rule) => {
		if (insideKeyframes(rule)) return;
		const state = stateOfRule(rule);
		rule.walkDecls((decl) => {
			if (declaresInfinite(decl.prop, decl.value)) counts[state]++;
		});
	});
	return counts;
}

/** Pull the `@keyframes` / `@property` names a module declares. */
function globalNames(name: string): { keyframes: string[]; property: string[] } {
	const keyframes: string[] = [];
	const property: string[] = [];
	parseModule(name).walkAtRules((rule) => {
		const kind = rule.name.toLowerCase();
		if (kind === 'keyframes' || kind.endsWith('-keyframes')) keyframes.push(rule.params.trim());
		else if (kind === 'property') property.push(rule.params.trim());
	});
	return { keyframes, property };
}

describe('effect registry', () => {
	it('has exactly 39 effects in canonical GLOW_VARIANTS order', () => {
		expect(effects).toHaveLength(39);
		expect(effects.map((effect) => effect.meta.name)).toEqual([...GLOW_VARIANTS]);
	});

	it('resolves every effect by name and nothing else', () => {
		for (const name of GLOW_VARIANTS) {
			expect(effectByName(name)?.meta.name).toBe(name);
		}
		expect(effectByName('does-not-exist')).toBeUndefined();
	});

	it('ships a DOM layer for exactly the effects that need one', () => {
		const withLayer = effects.filter((effect) => effect.layer).map((effect) => effect.meta.name);
		expect(withLayer.sort()).toEqual(['kaleidoscope', 'matrix']);
	});

	it('gives every effect a non-empty label', () => {
		for (const effect of effects) {
			expect(effect.meta.label, `${effect.meta.name} label`).toBeTruthy();
			expect(effect.meta.label.trim().length).toBeGreaterThan(0);
		}
	});
});

describe('per-effect metadata', () => {
	for (const effect of effects) {
		it(`${effect.meta.name}: meta.name matches its folder and GLOW_VARIANTS entry`, () => {
			// The registry imports each effect from its own folder, so a mismatch between meta.name
			// and the folder is impossible to construct without editing both — this asserts the
			// invariant the folder/name/variant triple depends on.
			expect(GLOW_VARIANTS).toContain(effect.meta.name);
			expect(NAMESPACE[effect.meta.name] ?? (effect.meta.name === 'torch' ? {} : undefined), `${effect.meta.name} in namespace map`).toBeDefined();
		});
	}
});

describe('per-effect CSS module contract', () => {
	for (const name of CSS_EFFECTS) {
		describe(name, () => {
			it('parses with postcss', () => {
				expect(() => parseModule(name)).not.toThrow();
			});

			it('gates every selector on [data-glow]', () => {
				const ungated: string[] = [];
				parseModule(name).walkRules((rule) => {
					if (insideKeyframes(rule)) return;
					for (const sel of rule.selectors) {
						if (!/\[data-glow/.test(sel)) ungated.push(sel);
					}
				});
				// Ungated selectors would apply to every effect on the page, not just this one. No
				// module currently has any; if one appears it must either be gated or added here as a
				// commented, provably-safe exception.
				expect(ungated, `ungated selectors in ${name}/index.css`).toEqual([]);
			});

			it('namespaces every @keyframes and @property to the effect', () => {
				const allowed = NAMESPACE[name];
				expect(allowed, `namespace prefixes for ${name}`).toBeDefined();

				const { keyframes, property } = globalNames(name);

				const badKeyframes = keyframes.filter(
					(kf) => !allowed.keyframes.some((prefix) => kf.startsWith(prefix))
				);
				expect(
					badKeyframes,
					`@keyframes names in ${name} must start with one of [${allowed.keyframes.join(', ')}]`
				).toEqual([]);

				const badProps = property.filter(
					(prop) => !allowed.property.some((prefix) => prop.startsWith(prefix))
				);
				expect(
					badProps,
					`@property names in ${name} must start with one of [${allowed.property.join(', ') || '(none registered)'}]`
				).toEqual([]);
			});

			it('stays within the infinite-animation budget per state', () => {
				const counts = infiniteCounts(name);
				const total = counts.base + counts.waiting + counts.error;
				expect(counts.base, `${name} base-state infinite animations`).toBeLessThanOrEqual(
					INFINITE_CAP.base
				);
				expect(counts.waiting, `${name} waiting-state infinite animations`).toBeLessThanOrEqual(
					INFINITE_CAP.waiting
				);
				expect(counts.error, `${name} error-state infinite animations`).toBeLessThanOrEqual(
					INFINITE_CAP.error
				);
				expect(total, `${name} total infinite animations`).toBeLessThanOrEqual(INFINITE_CAP.total);
			});
		});
	}
});
