#!/usr/bin/env node
// scripts/fix-dts.mjs
//
// Post-`svelte-package` step: strip side-effect CSS imports from the emitted declaration files.
//
// svelte-package copies the component/effect source imports verbatim into the generated `.d.ts`,
// including the side-effect CSS imports that carry the skin at runtime:
//
//   dist/GhostInput.svelte.d.ts    ->  import './effects/core.css';
//   dist/effects/<name>/index.d.ts ->  import '../core.css';  +  import './index.css';
//
// A `.d.ts` is type-checked by any consumer whose tsconfig has `skipLibCheck: false`. TypeScript
// then tries to resolve those `.css` specifiers as modules and fails — TS2882 ("module 'X' can only
// be default-imported using esModuleInterop" is the sibling; the concrete failure here is TS2307
// "cannot find module './index.css'") — a hard error the consumer never asked for. The CSS is a
// pure runtime side effect; it has no place in the declaration graph. So we delete exactly those
// side-effect-import lines from every shipped `.d.ts`.
//
// SAFETY: only whole lines that ARE a bare side-effect CSS import are removed
// (`import '<path>.css';` / `import "<path>.css";`, leading whitespace allowed). Lines that merely
// mention a `.css` path inside a comment or a JSDoc block (e.g. the `defineEffect` example in
// effects/define.d.ts) are left untouched — the regex requires the line to START with `import`.
// `.d.ts.map` files are irrelevant (they map declarations, not imports) and are left alone.
//
// Idempotent: running it twice is a no-op. Exits non-zero if the dist dir is missing.
//
// Usage: node scripts/fix-dts.mjs   (invoked by the `package` npm script after svelte-package)

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(REPO, 'dist');

// A whole line that is a side-effect CSS import: optional indent, `import`, a quoted specifier that
// ends in `.css`, a semicolon, optional trailing whitespace. No import binding (that would be a
// typed import, which we never generate for CSS).
const CSS_SIDE_EFFECT_IMPORT = /^\s*import\s+(['"])[^'"]+\.css\1\s*;\s*$/;

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) out.push(...walk(full));
		else if (full.endsWith('.d.ts')) out.push(full);
	}
	return out;
}

if (!existsSync(DIST)) {
	console.error('[fix-dts] dist/ not found — run svelte-package first.');
	process.exit(1);
}

const files = walk(DIST);
let touched = 0;
let removedLines = 0;

for (const file of files) {
	const src = readFileSync(file, 'utf8');
	// Preserve the original EOL style; svelte-package emits \n.
	const lines = src.split('\n');
	const kept = lines.filter((line) => {
		if (CSS_SIDE_EFFECT_IMPORT.test(line)) {
			removedLines++;
			return false;
		}
		return true;
	});
	if (kept.length !== lines.length) {
		writeFileSync(file, kept.join('\n'));
		touched++;
	}
}

console.log(
	`[fix-dts] scanned ${files.length} .d.ts file(s); stripped ${removedLines} side-effect CSS ` +
		`import line(s) from ${touched} file(s).`
);
