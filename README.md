![light-input demo](https://raw.githubusercontent.com/ui4ai/light-input/main/static/demo.gif)

# @ui4ai/light-input

A ghost-text autocomplete `<input>` for **Svelte 5** with **39 deep light effects** you import one at
a time. Type, and the model's continuation **ignites** in place — a warm light turns on and highlights
the next word, Cursor / Apple-Intelligence style. Press **Tab** or **→** to accept it, word by word.

The component is the brain (transparent input + painted ghost layer + a small, robust completion state
machine). Each effect is the skin: pure CSS, keyed on a `data-glow` attribute, plus an optional Svelte
DOM layer for effects with live particles. Ship one effect and you pay ~24 KB of CSS; the other 38 stay
out of your bundle.

**[▶ Live demo — all 39 effects](https://ui4ai.github.io/light-input/)** (hosted build runs a scripted
demo, no backend).

- Svelte 5 (runes) · zero runtime dependencies · one peer (`svelte`)
- The glow is pure CSS; the SF/system font is native. Targets current Safari & Chrome.

## Install

```sh
npm install @ui4ai/light-input
```

## Quick start

Import the component and one effect. The effect's CSS rides along as a side-effect import, so there is
nothing else to wire up:

```svelte
<script>
	import { GhostInput } from '@ui4ai/light-input';
	import aurora from '@ui4ai/light-input/effects/aurora';
</script>

<GhostInput effect={aurora} endpoint="/api/complete" />
```

Your `endpoint` receives `POST { text, mode }` and returns `{ completion: string }`. To plug in any
other backend (a local model, a different API shape) without touching the state machine, pass a
[`complete` function](#customization) instead.

`torch` is the default effect and needs no import — its skin *is* the core anatomy:

```svelte
<GhostInput />
```

## Per-effect imports & tree-shaking

There are two ways to bring in effects, and the difference is your bundle size:

```ts
// ✅ One effect — ~24 KB of CSS (core anatomy + that skin), minified. Nothing else ships.
import aurora from '@ui4ai/light-input/effects/aurora';
import matrix from '@ui4ai/light-input/effects/matrix'; // brings its DOM layer too

// ⚠️ The whole registry — every effect's CSS + both DOM layers. For galleries/pickers that
//     show the full set (this is what the demo uses); do NOT reach for it to get one effect.
import { effects, effectByName } from '@ui4ai/light-input/effects';
```

Each per-effect entry imports `../core.css` first, then its own skin, so the cascade is correct no
matter your import order. The package declares `"sideEffects": ["**/*.css"]`, which keeps the CSS alive
under tree-shaking while everything else stays shakeable — **per-effect imports are the performance
mechanism**, not a footgun. Importing from the package root (`import { GhostInput }`) pulls only the
component and `core.css`.

CDN / no-bundler? The core anatomy is exposed directly at `@ui4ai/light-input/core.css`.

## Customization

Every knob below is a plain prop on `GhostInput`. Defaults reproduce the demo's behavior.

**Focus.** The input focuses on mount by default (the demo relies on it). In a host app where stealing
focus is rude, turn it off:

```svelte
<GhostInput autofocus={false} />
```

**Effect (sugar vs. explicit).** `effect={x}` sets `glow` to `x.meta.name` and `layer` to `x.layer`
in one prop. The explicit form is the escape hatch — an explicit `glow` or `layer` always wins:

```svelte
<GhostInput effect={aurora} />                          <!-- sugar -->
<GhostInput glow="aurora" layer={aurora.layer} />       <!-- explicit -->
```

**Completion source.** Swap the backend without forking the debounce / cache / abort / stale-guard
machinery. When `complete` is set it replaces the `endpoint` fetch for `llm` mode:

```svelte
<script lang="ts">
	import { GhostInput, type CompleteFn } from '@ui4ai/light-input';

	const complete: CompleteFn = async (text, { signal }) => {
		const r = await fetch('/my/endpoint', { method: 'POST', body: text, signal });
		const data = (await r.json()) as { completion: string };
		return data.completion; // raw continuation; the component normalizes it
	};
</script>

<GhostInput {complete} />
```

`CompleteFn` is exported from the package root, so your `complete` type-checks against the exact
signature the component expects (`(text: string, ctx: { signal: AbortSignal }) => Promise<string>`).

**Thinking indicator.** `loadingGlow` chooses where the "thinking" light shows while the model works:
`"torch"` (a weak flashlight warming up from the caret — the default), `"field"` (the whole input
warms), or `"none"` (invisible loading).

```svelte
<GhostInput loadingGlow="field" />
```

**Caret & waiting overrides (Svelte 5 snippets).** Replace just the caret element, or the thinking
indicator's contents, and every other node stays byte-identical to the built-in markup:

```svelte
<GhostInput>
	{#snippet caret({ focused, loading, ready })}
		<span class="block-caret" data-ready={ready}></span>
	{/snippet}
	{#snippet waiting()}
		<span class="orbit-spinner"></span>
	{/snippet}
</GhostInput>
```

The `waiting` snippet renders only where the default torch stack would — so with `loadingGlow="none"`
neither the snippet nor the default beams appear (style the field instead).

**Other props:** `value` (two-way bindable input text — `bind:value`), `onaccept` (callback
`({ word, text }) => void`, fired when a word is accepted), `theme` (`"dark"` | `"light"`),
`lightFlow` (keep the flow/particle motion drifting; `false` for a steadier reveal), `completionMode`
(`"llm"` | `"demo"`), `minChars` (2 — compared **strictly greater-than**, so a prediction needs
`value.trim().length > minChars`, i.e. 3+ non-space characters at the default), `maxChars` (2000),
`debounceMs` (260), `placeholder`, `touchAccept` (the mobile accept button).

## Authoring your own effect

An effect is **pure CSS plus optional DOM** — you never modify the component or `core.css`. You set
custom properties and structural rules keyed on `[data-glow='<your-name>']`, and (if the look needs live
DOM) ship one Svelte layer. The full reference — the state grammar, the class anatomy, every design
token, and the cascade ladder — is in **[CONTRACT.md](CONTRACT.md)**, which ships inside the package.

```ts
// my-effect/index.ts
import '@ui4ai/light-input/core.css'; // anatomy first (ordering invariant — see CONTRACT.md §5)
import './index.css'; // your skin
import { defineEffect } from '@ui4ai/light-input';
import { meta } from './meta';

export { meta };
export default defineEffect({ meta }); // add `layer` for a DOM effect
```

```svelte
<GhostInput effect={myEffect} />
```

`defineEffect` returns its argument unchanged and warns at runtime if `meta.name` is not kebab-case
(the name becomes the `data-glow` selector every rule keys on).

## The effects

39 built-ins, in the order they appear in the picker. Import each at
`@ui4ai/light-input/effects/<name>`.

| Effect | `name` | The look |
| --- | --- | --- |
| Torch | `torch` | The default warm flashlight; a soft beam warms on at the caret. (Core anatomy — no import.) |
| Candle | `candle` | A warm flame at the caret: flickering haze, licking core, drifting smoke. |
| Bolt | `lightning` | A strike across the caret — bolt haze, surging flow, crackling particles. |
| Aurora | `aurora` | A slow curtain of light drifting across the caret. |
| Plasma | `plasma` | An electric magenta/cyan bloom pulsing at the caret. |
| Prism | `prism` | A spectral sweep of refracted color across the caret. |
| Ember | `ember` | Glowing coals: warm haze, floating sparks, rolling smoke. |
| Neon | `neon` | A buzzing tube of light scanning at the caret. |
| Nebula | `nebula` | A slow galactic swirl of interstellar color. |
| Smoke | `smoke` | Thick billows curling up from the caret. |
| Solar | `solar` | A blazing corona: churning haze, molten core, sweeping flares. |
| Holo | `holo` | An iridescent hologram scanning across the caret. |
| Blackhole | `blackhole` | An accretion disk spins; light streams inward and dissolves at the horizon. |
| Flame | `flame` | A gas-burner jet from the caret — blue nozzle and a buoyant rising plume. |
| Matrix | `matrix` | Digital rain: falling glyph columns with a bright decoding head. *(DOM layer)* |
| Snow | `snow` | A polar-night blizzard — parallax dot fields and hero crystals on the wind. |
| Toxic | `toxic` | A radioactive acid puddle spreads under the word with a living meniscus. |
| Vortex | `vortex` | A spacetime whirlpool — interfering spiral arms spin around the eye. |
| Bubble Gum | `bubblegum` | A glossy gum bubble inflates from the caret and breathes behind the word. |
| Optic | `optic` | Camera autofocus: the word arrives defocused with chromatic aberration, then racks sharp. |
| Biolume | `biolume` | Deep-sea bioluminescence — marine snow sinks and plankton answers the text. |
| Ocean | `ocean` | A breaker rolls in along the reveal with a ragged foam crest. |
| Horror | `horror` | Dread by absence of light — darkness falls in hard steps over the field. |
| Heart | `heart` | A cardiac monitor: the reveal is a lub-dub heartbeat, rim and layers pulsing. |
| Liquid Glass | `liquidglass` | A refractive glass lozenge hovers over the word and magnifies it. |
| Android | `android` | A mechanical split-flap board — flap cells clatter into the letters. |
| Font Shift | `fontshift` | Kinetic typography: the type itself breathes and shifts — no glow. |
| Rorschach | `rorschach` | A symmetric inkblot blooms and bleeds across a vertical fold axis. |
| Diffusion | `diffusion` | A denoising sampler — latent RGB noise resolves into the word. |
| Chroma Bloom | `chromabloom` | A gray world flowers: settled glyphs bloom into a living rainbow. |
| Infrared | `infrared` | A thermal camera — glyph color is temperature, and the future reads as heat. |
| Staged | `staged` | A theatre in stage blacks: a spotlight finds the word over breathing footlights. |
| Blueprint | `blueprint` | A draftsman's board — the word is drawn onto a fine grid, then built. |
| Spoiler | `spoiler` | A Telegram spoiler: particle dust hides the future; only the next word is revealed. |
| Ghost Text | `ghosttext` | A spectral apparition — each glyph wafts in like a ghost through a wall. |
| Drift | `drift` | Words arrive sideways in a controlled slide, then catch and settle. |
| Art | `art` | A painting: the next word is wet pigment laid by a brush; the rest is a pencil sketch. |
| Scratch | `scratch` | A lottery scratch card — foil covers the future; only the next word is cleared. |
| Kaleidoscope | `kaleidoscope` | The future through an eyepiece — a mirrored mandala of colored glass. *(DOM layer)* |

## Development

This repo is both the published library (`src/lib`) and its demo app (`src/routes`), one SvelteKit
project.

```
CONTRACT.md                 the effect-authoring reference (repo root; also shipped in the tarball)
src/lib/                    the package (built by @sveltejs/package into dist/)
  GhostInput.svelte         the component
  input/                    the completion state machine (debounce, cache, abort, glyphs, selection)
    types.ts                public snippet/callback types (CaretState, AcceptDetail)
  effects/
    core.css                the shared anatomy every effect builds on
    <name>/                 one folder per effect: index.css, meta.ts, index.ts, optional Layer.svelte
    index.ts                the ALL-39 registry (the ./effects entry)
    types.ts, define.ts     the effect contract types + defineEffect()
src/routes/                 the demo app (landing gallery + a local OpenRouter proxy, not packaged)
scripts/                    packaging + QA tooling (below)
```

npm scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the demo app locally. |
| `npm run build` / `build:pages` | Build the demo (client / GitHub Pages static). |
| `npm run package` | `svelte-package` → `dist/`, then `publint`. |
| `npm run pack-smoke` | End-to-end: pack the tarball, assert its contents (39 effects, no `src/`/server/qa), install it into a throwaway vite+svelte project, verify single-effect CSS isolation + budget and an SSR render. |
| `npm test` | Vitest — unit tests plus the per-effect **contract test** (`src/lib/effects/contract.test.ts`) that parses every module and enforces `data-glow` gating, namespaced keyframes/`@property`, the registry order, and an infinite-animation budget. |
| `npm run check` | `svelte-check`. |

Visual-identity QA harness (`scripts/qa/`) — the guard that ~29 K lines of effect CSS render
identically as they moved into per-effect modules:

| Script | What it does |
| --- | --- |
| `qa:oracle` (`style-oracle.mjs`) | Drive the demo through all 39 effects × {dark,light} × {ready,waiting} = 156 combos in a frozen-animation snapshot; dump `getComputedStyle` for the full anatomy (incl. pseudo-elements) to one deterministic JSON per combo. |
| `qa:diff` (`diff-oracle.mjs`) | Diff two oracle runs; the release gate is **zero diffs** against the baseline. |
| `qa:shots` / `qa:diff:shots` | Screenshot matrix + pixel diff (`capture.mjs` / `diff-shots.mjs`). |
| `tie-scan.mjs` | Structural cascade check: prove no equal-specificity tie flipped a winner as component CSS unscoped into `core.css`. |
| `check-namespaces.mjs` | Assert `@keyframes` / `@property` names are globally unique across the whole effect bundle. |

### Releasing

CI (`.github/workflows/ci.yml`) runs the full suite on every push/PR to `main`; the Pages deploy
(`pages.yml`) and the manual npm release (`release.yml`) both gate on it. To publish: bump `version` in
`package.json`, then run the **Release** workflow from the Actions tab — it re-runs the suite and
`npm publish --provenance --access public`. Requires an `NPM_TOKEN` repo secret with publish rights to
the `@ui4ai` scope.

### Known limitation — `prefers-reduced-motion`

Reduced-motion support is **partial** in `0.1.0`. `core.css` carries a
`@media (prefers-reduced-motion: reduce)` block, but its `animation: none` rules are low-specificity
(0,1,0)/(0,2,0), so they only win where nothing outranks them. In practice today: the **caret
blink/think** and the **word / tail entrance** animations stop, but the **torch beams** and the
**field wash** keep animating — the anatomy that drives them lives at `data-glow`-scoped (0,5,0)
rules that outrank the media kill (and per-effect modules layer their own (0,5,0) animations on top).

So an effect keeps its visual identity under reduced-motion rather than going still. Full parity —
emitting a scoped `animation: none` at (0,5,0) under the media query for the core beams and every
module — is a tracked follow-up. If motion sensitivity matters for your app, prefer `torch` and set
`lightFlow={false}` to calm the flow/particle layers.

## License

MIT © ui4ai. See [LICENSE](LICENSE).
