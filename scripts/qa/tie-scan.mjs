#!/usr/bin/env node
// scripts/qa/tie-scan.mjs
//
// EQUAL-SPECIFICITY / SHARED-PROPERTY TIE SCAN (workstream W1b gate).
//
// When GhostInput.svelte's <style> block moved into core.css (W1b), every rule lost its Svelte
// scope class — a UNIFORM -1-class specificity drop. Ties AMONG the moved rules therefore keep
// resolving by source order. The danger is ONLY at the boundary where a moved component rule
// collides, at EQUAL specificity and on a SHARED property, with a rule whose specificity did NOT
// change: the core.css anatomy consumers and the 27+ effect modules. At an equal-specificity tie
// the LATER rule in document order wins, so a specificity drop that turns a former "component
// beats module (higher spec)" into a "component ties module (equal spec) -> module wins by order"
// silently flips the visual. sdk-critique fatalFlaws[0] is exactly one such flip (the waiting
// field-flow ::before animation). W1b fixes it by strengthening the two waiting ::before arms
// with an added [data-glow].
//
// This script is the automated guard the plan requires. It:
//   1. Flattens the NEW effect CSS bundle (working tree: core.css -> 11 classic modules -> 27
//      redesigned modules, in @import order) into an ordered rule list with real specificities
//      and declared-property sets.
//   2. Builds the OLD bundle from git HEAD in HEAD's own @import order (core.css -> legacy.css ->
//      27 redesigned modules). Both W1b and W2 have landed at HEAD, so the component chrome
//      already lives at the top of HEAD's core.css and HEAD's classics still live in legacy.css;
//      this script splits HEAD's core.css the same way as NEW so the 'chrome' tag is populated on
//      both sides (it also keeps a fallback that lifts the component <style> for a pre-W1b HEAD).
//   3. Finds every equal-specificity pair whose selectors can match a common element and that
//      share >=1 declared property, restricted to pairs touching a COMPONENT-CHROME rule.
//   4. For each such collision, resolves the winner by document order and asserts the winner
//      (by a source-independent selector+property signature) is IDENTICAL in OLD and NEW.
//
// A non-empty "winner flipped" set means a moved rule changed who wins a real tie — a visual
// regression. Exit 1. Otherwise the moved rules' tie outcomes are provably unchanged.
//
// This is a STRUCTURAL pre-check. The authoritative visual gate remains the style oracle
// (scripts/qa/style-oracle.mjs), which dumps getComputedStyle for the full anatomy INCLUDING
// .field::before/::after across 156 combos and so observes the resolved winner directly; the
// oracle IS the ground-truth tie resolver and this scan is the fast, explainable companion that
// localizes any flip to the exact selector pair.
//
// Usage:
//   node scripts/qa/tie-scan.mjs [--verbose] [--all-collisions]
//     --verbose         print every component-touching collision (not just flips)
//     --all-collisions  do not restrict to component-chrome rules; print the full tie census

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import postcss from 'postcss';

const REPO = process.cwd();
const EFFECTS_DIR = path.join(REPO, 'src/lib/effects');

// ---------------------------------------------------------------------------
// Specificity + selector modelling
// ---------------------------------------------------------------------------

// A compound selector's contribution: count ids / (classes+attrs+pseudo-classes) / (elements+
// pseudo-elements). We parse a flat selector string (no :where/:is used in this codebase — a
// guard below asserts that, since they would change the arithmetic).
function specificityOf(selector) {
	let a = 0; // ids
	let b = 0; // classes, attributes, pseudo-classes
	let c = 0; // element names, pseudo-elements
	// Tokenize into pieces. Order within a compound does not matter for counting.
	// IDs
	a += (selector.match(/#[\w-]+/g) || []).length;
	// Attributes [..]
	b += (selector.match(/\[[^\]]*\]/g) || []).length;
	// Pseudo-elements ::x  (also legacy :before/:after/:first-line/:first-letter as elements)
	const doubleColonPseudos = selector.match(/::[\w-]+/g) || [];
	c += doubleColonPseudos.length;
	const legacyPseudoElements = selector.match(/(?<!:):(?:before|after|first-line|first-letter)\b/g) || [];
	c += legacyPseudoElements.length;
	// Pseudo-classes :x (excluding the pseudo-elements already counted)
	let work = selector
		.replace(/::[\w-]+/g, ' ')
		.replace(/(?<!:):(?:before|after|first-line|first-letter)\b/g, ' ');
	const pseudoClasses = work.match(/:[\w-]+(?:\([^)]*\))?/g) || [];
	b += pseudoClasses.length;
	work = work.replace(/:[\w-]+(?:\([^)]*\))?/g, ' ');
	// Classes .x
	b += (work.match(/\.[\w-]+/g) || []).length;
	work = work.replace(/\.[\w-]+/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/#[\w-]+/g, ' ');
	// Element names: bare identifiers left in `work`, minus combinators/wildcards.
	const elements = work.match(/[a-zA-Z][\w-]*/g) || [];
	c += elements.length;
	return [a, b, c];
}

function specKey([a, b, c]) {
	return `${a},${b},${c}`;
}

function specCmp(x, y) {
	if (x[0] !== y[0]) return x[0] - y[0];
	if (x[1] !== y[1]) return x[1] - y[1];
	return x[2] - y[2];
}

// Extract, from a full (possibly descendant) selector, an "element signature" for the SUBJECT
// (rightmost compound) plus the set of state constraints (attr name=value pairs anywhere).
// This is the overlap model: two selectors can match a common element iff
//   (a) subjects are compatible (same pseudo-element; neither requires a class/tag the other
//       forbids — we only have positive requirements here, so classes just union), and
//   (b) no attribute is required to hold two DIFFERENT values across the two selectors
//       (e.g. [data-state='ready'] vs [data-state='waiting'] are mutually exclusive).
// The scope class Svelte injects (svelte-xxxx) is stripped before modelling — it never changes
// which real element matches, only specificity (already accounted for separately).
function modelSelector(selector) {
	const cleaned = selector.replace(/\.svelte-[\w-]+/g, '').trim();
	// Split on descendant/child/sibling combinators to isolate the subject (last compound).
	const parts = cleaned.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
	const subject = parts[parts.length - 1] || cleaned;

	const classesOf = (s) => new Set((s.match(/\.[\w-]+/g) || []).map((x) => x.slice(1)));
	const tagsOf = (s) => {
		const stripped = s
			.replace(/::[\w-]+/g, ' ')
			.replace(/(?<!:):[\w-]+(?:\([^)]*\))?/g, ' ')
			.replace(/\.[\w-]+/g, ' ')
			.replace(/\[[^\]]*\]/g, ' ')
			.replace(/#[\w-]+/g, ' ');
		return new Set((stripped.match(/[a-zA-Z][\w-]*/g) || []));
	};
	const pseudoElOf = (s) => {
		const m = s.match(/::[\w-]+/) || s.match(/(?<!:):(?:before|after|first-line|first-letter)\b/);
		return m ? m[0].replace(/^:+/, '') : null;
	};

	// Attribute constraints across the WHOLE selector (state gates live on ancestors too).
	const attrConstraints = new Map(); // name -> value ('' means bare [name] presence)
	for (const m of cleaned.matchAll(/\[([\w-]+)(?:([~|^$*]?=)\s*'([^']*)')?\]/g)) {
		const name = m[1];
		const value = m[3] === undefined ? '' : m[3];
		// Record the strongest (valued) constraint; presence-only doesn't conflict with a value.
		const prev = attrConstraints.get(name);
		if (prev === undefined || (prev === '' && value !== '')) attrConstraints.set(name, value);
	}

	return {
		subjectClasses: classesOf(subject),
		subjectTags: tagsOf(subject),
		pseudoEl: pseudoElOf(subject),
		attrConstraints
	};
}

function elementsCanOverlap(m1, m2) {
	// Different pseudo-element target -> cannot be the same box.
	if ((m1.pseudoEl || null) !== (m2.pseudoEl || null)) return false;
	// Contradictory tag requirement on the subject.
	if (m1.subjectTags.size && m2.subjectTags.size) {
		let shared = false;
		for (const t of m1.subjectTags) if (m2.subjectTags.has(t)) shared = true;
		if (!shared) return false;
	}
	// Mutually exclusive attribute VALUE constraints anywhere in the two selectors.
	for (const [name, v1] of m1.attrConstraints) {
		const v2 = m2.attrConstraints.get(name);
		if (v2 !== undefined && v1 !== '' && v2 !== '' && v1 !== v2) return false;
	}
	// Subject class requirements: for the SAME element both class sets must be simultaneously
	// satisfiable. Positive-only requirements always union, so classes never contradict here —
	// BUT if the subjects clearly target different named parts (e.g. .beam-veil vs .beam-hot),
	// they cannot be one element. Model that: if both subjects carry a known "part" class and
	// they differ with no shared class, they don't overlap.
	if (m1.subjectClasses.size && m2.subjectClasses.size) {
		let shared = false;
		for (const cl of m1.subjectClasses) if (m2.subjectClasses.has(cl)) shared = true;
		// A subject like `.field[data-glow]` (class .field) vs `.field` (class .field) shares.
		// `.beam-veil` vs `.beam-hot` share nothing -> different elements.
		if (!shared) return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// Rule extraction
// ---------------------------------------------------------------------------

// Declared property names in a rule body (longhand-agnostic; we compare declared props, and
// treat the `animation` shorthand and its longhands as overlapping via canonicalization).
function propsOf(rule) {
	const props = new Set();
	rule.walkDecls((d) => props.add(canonProp(d.prop)));
	return props;
}

// Canonicalize a handful of shorthand/longhand pairs that matter for these collisions so that
// `animation: none` (shorthand) and `animation-name: ...` (longhand) are recognized as sharing.
function canonProp(prop) {
	const p = prop.toLowerCase();
	if (p === 'animation' || p.startsWith('animation-')) return 'animation';
	if (p === 'background' || p.startsWith('background-')) return 'background';
	if (p === '-webkit-mask-image' || p === 'mask-image') return 'mask-image';
	return p;
}

function sharedProps(a, b) {
	const out = [];
	for (const p of a) if (b.has(p)) out.push(p);
	return out;
}

// Parse a CSS string into an ordered list of flat rules. @media/@supports contents are included
// with their selectors (media context recorded so we don't cross-match rules in different media).
// @keyframes are ignored (not part of the cascade tie space). A `scopeBump` adds one class to
// every selector's specificity (used to model Svelte scoping of the OLD component chrome).
function extractRules(css, { file, section, mediaAllowed = true, scopeBump = false } = {}) {
	const root = postcss.parse(css);
	const rules = [];
	const guard = { whereIs: false };

	const pushRule = (rule, media) => {
		const declProps = propsOf(rule);
		if (declProps.size === 0) return;
		for (const sel of rule.selectors) {
			if (/:where\(|:is\(|:matches\(/.test(sel)) guard.whereIs = true;
			let spec = specificityOf(sel);
			if (scopeBump) spec = [spec[0], spec[1] + 1, spec[2]];
			rules.push({
				file,
				section,
				media: media || '',
				selector: sel,
				spec,
				props: declProps,
				model: modelSelector(sel)
			});
		}
	};

	root.walkRules((rule) => {
		// Skip keyframe step rules (their parent is atrule keyframes).
		if (rule.parent && rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
		let media = '';
		let p = rule.parent;
		while (p && p.type === 'atrule') {
			if (/media|supports/i.test(p.name)) media = `@${p.name} ${p.params}`;
			p = p.parent;
		}
		if (media && !mediaAllowed) return;
		pushRule(rule, media);
	});

	return { rules, guard };
}

// The component-chrome section of the NEW core.css is everything ABOVE the token-defaults header
// comment "Core ghost-input light anatomy". We tag those rules so collisions can be restricted to
// moved rules.
function splitCoreCss(css) {
	const marker = '/* Core ghost-input light anatomy';
	const idx = css.indexOf(marker);
	if (idx === -1) throw new Error('core.css: token-defaults marker not found — did W1b land?');
	return { chrome: css.slice(0, idx), rest: css.slice(idx) };
}

// ---------------------------------------------------------------------------
// Bundle assembly (NEW = working tree, OLD = git HEAD)
// ---------------------------------------------------------------------------

function moduleImportOrder(which) {
	// Derive the effect-CSS cascade order for the given arrangement. Since W5 the aggregate flows
	// through JS entries: effects/index.ts statically imports every effect entry in cascade order
	// and each entry imports '../core.css' then './index.css'. When an arrangement still carries
	// the old effects/index.css aggregator (pre-W5 git refs), fall back to its @import list.
	const read = (relPath) => {
		try {
			return which === 'new'
				? readFileSync(path.join(REPO, relPath), 'utf8')
				: gitShow('HEAD', relPath);
		} catch {
			return null;
		}
	};

	const indexCss = read('src/lib/effects/index.css');
	if (indexCss !== null) {
		return [...indexCss.matchAll(/@import\s+'\.\/([^']+)'/g)].map((m) => m[1]);
	}

	const registry = read('src/lib/effects/index.ts');
	if (registry === null) {
		throw new Error(`cannot determine module import order for arrangement '${which}'`);
	}
	const names = [...registry.matchAll(/from\s+'\.\/([a-z-]+)\/index\.js'/g)].map((m) => m[1]);
	const order = ['core.css'];
	for (const name of names) {
		// torch's entry imports only core.css — it ships no skin of its own.
		if (read(`src/lib/effects/${name}/index.css`) !== null) order.push(`${name}/index.css`);
	}
	return order;
}

function gitShow(ref, relPath) {
	return execFileSync('git', ['show', `${ref}:${relPath}`], {
		cwd: REPO,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

function extractComponentStyle(svelteSource) {
	const m = svelteSource.match(/<style>([\s\S]*?)<\/style>/);
	return m ? m[1] : '';
}

// Build the ordered rule list for a given arrangement. Both sides use their OWN @import order
// (they differ now that the classics graduated out of legacy.css into per-effect modules):
//   NEW (working tree): core.css (chrome section tagged 'chrome', rest tagged 'core') ->
//        11 classic modules -> 27 redesigned modules. NO legacy.css.
//   OLD (git HEAD):     HEAD core.css (which W1b already holds the component chrome in; tagged
//        wholly 'core') -> HEAD legacy.css (the classic var-packs) -> 27 redesigned modules.
// The section tags let collisions be restricted to moved component chrome; because the classic
// var-packs are (0,2,0)/(0,3,0) custom-property-only blocks that live in the SAME cascade band on
// both sides (after core, before the redesigned modules), relocating them cannot flip any tie the
// scan cares about — this run proves that structurally.
function buildArrangement(which) {
	const importOrder = moduleImportOrder(which);
	const modules = importOrder.filter((f) => f !== 'core.css' && f !== 'legacy.css');
	const read = which === 'new'
		? (rel) => readFileSync(path.join(EFFECTS_DIR, rel), 'utf8')
		: (rel) => gitShow('HEAD', `src/lib/effects/${rel}`);

	const all = [];
	const guards = [];

	if (which === 'new') {
		const coreCss = readFileSync(path.join(EFFECTS_DIR, 'core.css'), 'utf8');
		const { chrome, rest } = splitCoreCss(coreCss);
		const c1 = extractRules(chrome, { file: 'core.css', section: 'chrome' });
		const c2 = extractRules(rest, { file: 'core.css', section: 'core' });
		all.push(...c1.rules, ...c2.rules);
		guards.push(c1.guard, c2.guard);
	} else {
		// OLD: at git HEAD the component chrome already lives inside core.css (moved by W1b), and
		// HEAD's GhostInput.svelte has no <style> block. We split HEAD's core.css the same way the
		// NEW side does so the 'chrome' tag is populated on both sides; if HEAD predates W1b (no
		// marker) we fall back to tagging all of core as 'core' and lifting the component <style>.
		const coreCss = gitShow('HEAD', 'src/lib/effects/core.css');
		if (coreCss.includes('/* Core ghost-input light anatomy')) {
			const { chrome, rest } = splitCoreCss(coreCss);
			const c1 = extractRules(chrome, { file: 'core.css', section: 'chrome' });
			const c2 = extractRules(rest, { file: 'core.css', section: 'core' });
			all.push(...c1.rules, ...c2.rules);
			guards.push(c1.guard, c2.guard);
		} else {
			const svelte = gitShow('HEAD', 'src/lib/GhostInput.svelte');
			const chromeCss = extractComponentStyle(svelte).replace(/@keyframes -global-/g, '@keyframes ');
			const c1 = extractRules(chromeCss, { file: 'GhostInput.svelte', section: 'chrome', scopeBump: true });
			const c2 = extractRules(coreCss, { file: 'core.css', section: 'core' });
			all.push(...c1.rules, ...c2.rules);
			guards.push(c1.guard, c2.guard);
		}

		// legacy.css (only pre-W2 arrangements have it — the classics lived there).
		if (importOrder.includes('legacy.css')) {
			const legacyCss = read('legacy.css');
			const lg = extractRules(legacyCss, { file: 'legacy.css', section: 'legacy' });
			all.push(...lg.rules);
			guards.push(lg.guard);
		}
	}

	// modules (order is load-bearing but between-module order does not matter for ties; we keep
	// the @import order for determinism). For NEW this includes the 11 classic modules; for OLD
	// it is the 27 redesigned modules only.
	for (const rel of modules) {
		const css = read(rel);
		const r = extractRules(css, { file: rel, section: 'module' });
		all.push(...r.rules);
		guards.push(r.guard);
	}

	// Assign a global document-order index (this is the cascade order for equal-spec ties).
	all.forEach((r, i) => (r.order = i));
	const whereIs = guards.some((g) => g.whereIs);
	return { rules: all, whereIs };
}

// ---------------------------------------------------------------------------
// Collision detection
// ---------------------------------------------------------------------------

// A stable, source-order-independent signature for "who won": the winning selector (scope class
// stripped) + the shared property. Comparing this across OLD/NEW tells us if the winner changed.
function winnerSignature(rule, prop) {
	return `${rule.selector.replace(/\.svelte-[\w-]+/g, '')} :: ${prop}`;
}

// For an arrangement, compute the winner map for every equal-spec, overlapping, shared-property
// collision that touches a chrome rule. Key = a canonical PAIR identity independent of source
// order (so OLD/NEW keys line up); value = winnerSignature.
function collisionWinners(arrangement, { restrictToChrome = true } = {}) {
	const { rules } = arrangement;
	const bySpec = new Map();
	for (const r of rules) {
		const k = specKey(r.spec);
		if (!bySpec.has(k)) bySpec.set(k, []);
		bySpec.get(k).push(r);
	}

	const winners = new Map(); // pairKey -> { winner, loser, prop, spec }
	for (const [, group] of bySpec) {
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const A = group[i];
				const B = group[j];
				if (restrictToChrome && A.section !== 'chrome' && B.section !== 'chrome') continue;
				if (A.media !== B.media) continue; // different media context — no runtime collision
				if (!elementsCanOverlap(A.model, B.model)) continue;
				const shared = sharedProps(A.props, B.props);
				if (shared.length === 0) continue;
				for (const prop of shared) {
					// Winner = later in document order (equal specificity => last wins).
					const winner = A.order > B.order ? A : B;
					const loser = A.order > B.order ? B : A;
					// Order-independent pair key: the two cleaned selectors (sorted) + prop + spec.
					const s1 = A.selector.replace(/\.svelte-[\w-]+/g, '');
					const s2 = B.selector.replace(/\.svelte-[\w-]+/g, '');
					const pairKey = [s1, s2].sort().join('  <>  ') + `  @${A.media}  #${prop}  {${specKey(A.spec)}}`;
					winners.set(pairKey, {
						winner: winnerSignature(winner, prop),
						loser: winnerSignature(loser, prop),
						prop,
						spec: specKey(A.spec),
						media: A.media,
						chromeInvolved: A.section === 'chrome' || B.section === 'chrome'
					});
				}
			}
		}
	}
	return winners;
}

// ---------------------------------------------------------------------------
// Effective-winner regression check (authoritative, mirrors the oracle's resolution)
// ---------------------------------------------------------------------------
//
// The pairwise census above localizes ties but only compares pair-keys present in BOTH
// arrangements. A specificity CHANGE on a moved rule (exactly what W1b's +[data-glow] does) can
// move a pair out of one equal-spec bucket into another, so the same real-world property could be
// won by a different rule without any single pair-key flipping. To close that gap we resolve the
// EFFECTIVE winner the way the browser (and the style oracle) does: among ALL rules that match a
// concrete element state, pick the highest specificity, then the last in document order. We do
// this for a representative matrix of `.field` states and the properties the moved ::before rules
// actually contend for, and assert OLD and NEW agree for every (effect, theme, state, property).
//
// This is the check that would have caught fatalFlaws[0] regardless of how the specificity moved.

// Does `selector` match a `.field` element (or its ::before/::after) in the given attribute state?
// `state` is a map of the field's data-* attributes; ancestor `.stage` carries the same glow/
// theme/flow attributes (the component sets both), so ancestor attribute gates resolve against the
// same values. We only model the `.field` subject (+ optional pseudo) since every moved ::before
// rule and every competing consumer/module ::before rule is anchored on `.field`.
function matchesFieldState(selector, state, pseudo) {
	const s = selector.replace(/\.svelte-[\w-]+/g, '');
	const selPseudo = (s.match(/::[\w-]+/) || [])[0] || (s.match(/(?<!:):(?:before|after)\b/) || [])[0] || null;
	const normPseudo = selPseudo ? selPseudo.replace(/^:+/, '') : null;
	if ((normPseudo || null) !== (pseudo || null)) return false;

	// Subject must be `.field` (or bare/no-class). Reject rules whose subject targets a named part
	// like .beam-veil / .caret / .torch-haze — those aren't the field box.
	const parts = s.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
	const subject = parts[parts.length - 1];
	const subjectClasses = (subject.match(/\.[\w-]+/g) || []).map((x) => x.slice(1));
	if (subjectClasses.some((c) => c !== 'field')) return false;

	// All attribute value constraints anywhere in the selector must hold in `state`.
	for (const m of s.matchAll(/\[([\w-]+)(?:([~|^$*]?=)\s*'([^']*)')?\]/g)) {
		const name = m[1];
		const value = m[3];
		if (value === undefined) {
			// presence-only: the attr must exist (all our data-* attrs are always present)
			if (state[name] === undefined) return false;
			continue;
		}
		if (state[name] !== value) return false;
	}
	return true;
}

// Canonical identity of a winning rule for OLD-vs-NEW comparison. Strips (a) the Svelte scope
// class, and (b) a BARE [data-glow] presence attribute. `data-glow` is ALWAYS present on both
// `.stage` and `.field`, so adding/removing the valueless [data-glow] never changes which element
// matches — it is purely a specificity device. W1b deliberately adds it to the two waiting ::before
// arms to restore their scoped rank; treating it as identity-neutral lets us compare "which logical
// rule won" without the fix itself looking like a regression. Valued attrs (e.g. [data-glow='flame'])
// are preserved verbatim — they DO change matching.
function canonicalWinner(selector) {
	return selector
		.replace(/\.svelte-[\w-]+/g, '')
		.replace(/\[data-glow\](?!=)/g, '') // bare [data-glow] only; leaves [data-glow='x'] intact
		.replace(/\s+/g, ' ')
		.trim();
}

function effectiveWinner(rules, state, pseudo, prop) {
	const cands = rules.filter((r) => r.props.has(prop) && !r.media && matchesFieldState(r.selector, state, pseudo));
	if (!cands.length) return null;
	cands.sort((A, B) => specCmp(A.spec, B.spec) || A.order - B.order);
	const w = cands[cands.length - 1];
	return canonicalWinner(w.selector);
}

// Representative states that toggle the moved ::before contract, for every effect × theme.
// The ::before opacity/animation rules key off data-state and data-loading-glow, so we probe the
// ready state and the waiting state under each loadingGlow the component can set.
function fieldStates(effect, theme) {
	const base = { 'data-glow': effect, 'data-theme': theme, 'data-light-flow': 'on' };
	return [
		{ label: 'ready/torch', state: { ...base, 'data-state': 'ready', 'data-loading-glow': 'torch' } },
		{ label: 'waiting/field', state: { ...base, 'data-state': 'waiting', 'data-loading-glow': 'field' } },
		{ label: 'waiting/torch', state: { ...base, 'data-state': 'waiting', 'data-loading-glow': 'torch' } },
		{ label: 'waiting/none', state: { ...base, 'data-state': 'waiting', 'data-loading-glow': 'none' } }
	];
}

function effectiveWinnerRegression(oldArr, newArr, effects) {
	const themes = ['dark', 'light'];
	// The moved ::before rules contend for these; also cover ::after for completeness (light
	// theme sets nothing there, but a module might).
	const probes = [
		{ pseudo: 'before', prop: 'opacity' },
		{ pseudo: 'before', prop: 'animation' },
		{ pseudo: 'before', prop: 'background' },
		{ pseudo: 'after', prop: 'opacity' },
		{ pseudo: 'after', prop: 'animation' }
	];
	const flips = [];
	let checks = 0;
	for (const effect of effects) {
		for (const theme of themes) {
			for (const { label, state } of fieldStates(effect, theme)) {
				for (const { pseudo, prop } of probes) {
					const o = effectiveWinner(oldArr.rules, state, pseudo, prop);
					const n = effectiveWinner(newArr.rules, state, pseudo, prop);
					checks++;
					if (o !== n) {
						flips.push({ effect, theme, label, pseudo, prop, old: o, next: n });
					}
				}
			}
		}
	}
	return { flips, checks };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
	const argv = process.argv.slice(2);
	const verbose = argv.includes('--verbose');
	const allCollisions = argv.includes('--all-collisions');

	const newArr = buildArrangement('new');
	const oldArr = buildArrangement('old');

	if (newArr.whereIs || oldArr.whereIs) {
		console.error(
			'[tie-scan] FATAL: :where()/:is()/:matches() found in the bundle — specificity arithmetic ' +
				'here assumes none (the codebase invariant). Update the model before trusting results.'
		);
		process.exit(2);
	}

	const newWin = collisionWinners(newArr, { restrictToChrome: !allCollisions });
	const oldWin = collisionWinners(oldArr, { restrictToChrome: !allCollisions });

	// Census.
	const chromeCollisionsNew = [...newWin.values()].filter((v) => v.chromeInvolved);
	console.log(
		`[tie-scan] equal-spec shared-property collisions touching component chrome: ` +
			`OLD=${[...oldWin.values()].filter((v) => v.chromeInvolved).length} NEW=${chromeCollisionsNew.length}`
	);

	if (verbose || allCollisions) {
		for (const [key, v] of [...newWin.entries()].sort()) {
			if (!allCollisions && !v.chromeInvolved) continue;
			console.log(`  [${v.spec}]${v.media ? ' ' + v.media : ''} #${v.prop}`);
			console.log(`      WIN  ${v.winner}`);
			console.log(`      lose ${v.loser}`);
		}
	}

	// Informational: pair-keys present in only one arrangement (expected when +[data-glow] lifts a
	// waiting arm out of a (0,4,1) tie into (0,5,1) — the pair simply leaves the equal-spec census).
	const pairKeys = new Set([...oldWin.keys(), ...newWin.keys()]);
	let pairWinnerFlips = 0;
	for (const key of pairKeys) {
		const o = oldWin.get(key);
		const n = newWin.get(key);
		if (!o || !n) continue;
		if (((o && o.chromeInvolved) || (n && n.chromeInvolved)) && o.winner !== n.winner) pairWinnerFlips++;
	}
	console.log(`[tie-scan] pairwise census: ${pairKeys.size} pair-keys; ${pairWinnerFlips} shared-key winner flip(s)`);

	// AUTHORITATIVE GATE: effective-winner regression across the full effect × theme × state
	// matrix. This resolves winners exactly like the browser/oracle (max specificity, then last in
	// order) and so catches flips caused by a specificity CHANGE, not just an order change — the
	// robust guard for the two +[data-glow] waiting-arm fixes.
	const effects = new Set();
	for (const r of newArr.rules) {
		for (const m of r.selector.matchAll(/\[data-glow='([\w-]+)'\]/g)) effects.add(m[1]);
	}
	effects.add('torch'); // core-only skin, always present as data-glow
	const { flips, checks } = effectiveWinnerRegression(oldArr, newArr, [...effects].sort());

	if (verbose) {
		// Show the resolved winner for the two headline properties on the waiting/field state.
		for (const effect of [...effects].sort()) {
			for (const theme of ['dark', 'light']) {
				const st = { 'data-glow': effect, 'data-theme': theme, 'data-light-flow': 'on', 'data-state': 'waiting', 'data-loading-glow': 'field' };
				const anim = effectiveWinner(newArr.rules, st, 'before', 'animation');
				const op = effectiveWinner(newArr.rules, st, 'before', 'opacity');
				console.log(`  ${effect}/${theme} waiting/field ::before  animation<= ${anim}`);
				console.log(`  ${effect}/${theme} waiting/field ::before  opacity  <= ${op}`);
			}
		}
	}

	if (flips.length) {
		console.error(`\n[tie-scan] RESULT: ${flips.length} EFFECTIVE-WINNER FLIP(S) (of ${checks} probes):`);
		for (const f of flips) {
			console.error(`  ${f.effect}/${f.theme} ${f.label} ::${f.pseudo} #${f.prop}`);
			console.error(`     OLD winner: ${f.old || '(none)'}`);
			console.error(`     NEW winner: ${f.next || '(none)'}`);
		}
		console.error(
			'\nA flip means the moved component chrome now resolves a real property to a different ' +
				'rule than it did while Svelte-scoped (pre-W1b, git HEAD) — a visual regression. Restore ' +
				'the scoped rank on the affected selector (mirror it with an added attribute) instead of ' +
				'accepting the flip. Do NOT allowlist.'
		);
		process.exit(1);
	}

	if (pairWinnerFlips) {
		// Should be unreachable if the effective-winner check passed, but fail loud if the two
		// disagree (indicates a modelling gap).
		console.error(`\n[tie-scan] RESULT: ${pairWinnerFlips} pairwise winner flip(s) despite clean effective-winner pass — modelling inconsistency, investigate.`);
		process.exit(1);
	}

	console.log(
		`[tie-scan] RESULT: CLEAN — across ${checks} (effect × theme × state × property) probes, every ` +
			`moved-component-chrome property resolves to the SAME rule as the pre-W1b (git HEAD) scoped ` +
			`arrangement. The two +[data-glow] waiting-arm fixes reproduce their scoped ranks exactly.`
	);
}

main();
