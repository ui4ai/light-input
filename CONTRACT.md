# The light-input effect contract

This is the reference for authoring an **effect** — a visual skin for `<GhostInput>`. Everything
here is enforced by `src/lib/effects/core.css` (the anatomy every effect builds on) and by
`GhostInput.svelte` (which emits the DOM and sets the state attributes). Nothing below is invented:
each token, class, and rule maps to a line in `core.css`.

An effect is **pure CSS plus optional DOM**: you set custom properties and structural rules keyed on
`[data-glow='<your-name>']`, and — if the effect needs live DOM (falling glyphs, orbiting shards) —
you ship one Svelte layer component. You never modify the component or `core.css`.

---

## 1. How an effect is packaged

An effect is a folder with a JS entry that side-effect-imports its CSS (so one `import` gives the
consumer the skin, the metadata, and the optional layer in a single typed object):

```
my-effect/
  index.css      # the skin: var-packs + structural rules + @keyframes, all namespaced
  meta.ts        # export const meta: EffectMeta = { name, label, description? }
  Layer.svelte   # optional DOM layer (props: { suggestion, lightFlow })
  index.ts       # ties them together with defineEffect()
```

```ts
// my-effect/index.ts
import '@ui4ai/light-input/core.css'; // anatomy FIRST — see §5 (the ordering invariant)
import './index.css'; // your skin, so it wins equal-specificity ties by source order
import Layer from './Layer.svelte'; // omit if your effect is pure CSS
import { defineEffect } from '@ui4ai/light-input';
import { meta } from './meta';

export { meta };
export default defineEffect({ meta, layer: Layer });
```

```ts
// my-effect/meta.ts
import type { EffectMeta } from '@ui4ai/light-input';

export const meta: EffectMeta = {
	name: 'my-effect', // kebab-case; becomes the data-glow attribute selector
	label: 'My Effect', // shown in pickers/galleries
	description: 'One line describing the look.' // optional
};
```

`defineEffect(effect)` is an identity helper: it returns its argument unchanged and, in dev, warns
if `meta.name` is not kebab-case (a malformed name silently matches no CSS). The `name` you choose is
the value that lands in `data-glow` and that every selector in your `index.css` keys on — it MUST be
globally unique across the effects a given app loads.

Use it two ways in an app:

```svelte
<script>
	import { GhostInput } from '@ui4ai/light-input';
	import myEffect from './my-effect';
</script>

<GhostInput effect={myEffect} />                        <!-- sugar: sets glow + layer -->
<GhostInput glow="my-effect" layer={myEffect.layer} />  <!-- explicit form -->
```

`effect` derives `glow` from `effect.meta.name` and `layer` from `effect.layer`. An **explicit**
`glow` or `layer` prop wins over the effect's value, and the two are independent: `glow="x"` with
`effect={e}` uses `x` for `data-glow` but still takes the layer from `e` unless you also pass an
explicit `layer`.

---

## 2. State grammar (data attributes)

`GhostInput` sets these attributes; your CSS reads them. They are the only state channel.

On **`.stage`** and **`.field`**:

| Attribute          | Values                              | Meaning                                              |
| ------------------ | ----------------------------------- | ---------------------------------------------------- |
| `data-glow`        | your effect name (`torch` default)  | selects your effect; always present                  |
| `data-state`       | `idle` `waiting` `ready` `error`    | lifecycle: empty → thinking → suggestion → failed    |
| `data-theme`       | `dark` `light`                      | color scheme                                         |
| `data-light-flow`  | `on` `off`                          | when `off`, infinite flow/particle motion is killed  |

On **`.field`** only:

| Attribute            | Values                    | Meaning                                        |
| -------------------- | ------------------------- | ---------------------------------------------- |
| `data-loading-glow`  | `torch` `field` `none`    | where the "thinking" indicator shows           |

On the caret-anchored glow wrapper **`.caret-origin-glow`**:

| Attribute   | Values              | Meaning                                             |
| ----------- | ------------------- | --------------------------------------------------- |
| `data-mode` | `ready` `waiting`   | whether the torch stack shows a suggestion or think |

The `ready`/`waiting` split matters — see §6.

---

## 3. DOM anatomy (class grammar)

These class names are the public, stable selector surface. The tree, in render order:

```
.stage[data-glow data-state data-theme data-light-flow]
 └ .field[…same… data-loading-glow]
    ├ .viewport(.scrolled)
    │  ├ input.input                       transparent real <input> (never styled by effects)
    │  ├ .paint > .track                   the painted mirror; carries --ghost-offset
    │  │   ├ .placeholder | .typed | .selected   (text runs — effects do not touch these)
    │  │   ├ .caret(.active|.thinking|.steady)    the blinking bar
    │  │   ├ .caret-origin-glow[data-mode]         the "thinking"/caret glow anchor
    │  │   │   └ .torch-beam.torch-{haze,flow,core,aux,spark,smoke}
    │  │   └ .prediction                           the live suggestion (anchored at x = 0)
    │  │       ├ .beam.beam-{veil,body,hot,flow,aux,spark,smoke}
    │  │       ├ <Layer/>                           your optional DOM layer
    │  │       ├ .next-word > .glyph*               the next word to accept
    │  │       └ .tail > .glyph*                    the rest of the suggestion (masked-fade)
    │  ├ .edge.edge-left / .edge.edge-right         scroll fades (effects may recolor)
    │  └ .accept-button                             mobile "accept next word" (styled by core)
    └ .status                                       aria-live error text (effects do not touch)
```

### Beam pairs

The prediction and the caret glow share a **six-layer stack** with parallel naming — a `.beam-*`
inside `.prediction` and a `.torch-*` inside `.caret-origin-glow`. `core.css` styles both from the
same token per layer (e.g. `.beam-veil` and `.torch-haze` both read `--haze-*`):

| Layer | Prediction node | Caret-glow node | Token prefix |
| ----- | --------------- | --------------- | ------------ |
| haze  | `.beam-veil`    | `.torch-haze`   | `--haze-*`   |
| body  | `.beam-body`    | (none)          | `--body-*`   |
| core  | `.beam-hot`     | `.torch-core`   | `--core-*`   |
| flow  | `.beam-flow`    | `.torch-flow`   | `--flow-*`   |
| spark | `.beam-spark`   | `.torch-spark`  | `--spark-*`  |
| smoke | `.beam-smoke`   | `.torch-smoke`  | `--smoke-*`  |
| aux   | `.beam-aux`     | `.torch-aux`    | `--aux-*`    |

The beams anchor at `left: -0.03em` (prediction) / `-0.02em` (caret), `top: 50%`, translated up 50%,
`mix-blend-mode: screen` (normalized to `normal` in light theme by core). `1em = 56px` desktop,
`34px` at ≤760px.

### Glyph micro-API

Each `.glyph` (inside `.next-word` and `.tail`) carries precomputed mutation characters and per-glyph
animation inputs your keyframes may consume:

- `data-alt` — a distant mutation glyph. `core.css` prints it via `.glyph::after { content: attr(data-alt) }` (opacity 0 by default; reveal it in your keyframes).
- `data-soft` — a nearby look-alike; `data-hard` — a harder mutation. (Exposed for effects that swap via `content: attr(data-soft)` etc.)
- `--i` — the glyph's absolute index across the whole suggestion (continuous from `.next-word` into `.tail`). Drive staggered timing with it.
- `--mut-speed` (ms) and `--mut-strength` (0..1) — per-glyph cadence/intensity. **Note:** `core.css` sets these but consumes neither; they exist for effects that want them.

Effects **must not** style `.input`, `.typed`, `.selected`, `.placeholder`, `.status`, or `.track` —
those are component chrome.

---

## 4. Design tokens (custom properties you set)

Set these on `.field[data-glow='<name>']`. Anything you leave unset inherits the **Torch defaults**
from `core.css` — that fallback is load-bearing, so you only override what your look needs.

**Field & caret & text**

| Token                | Applied to                    |
| -------------------- | ----------------------------- |
| `--ready-border`     | `.field` border in `ready`/waiting-field |
| `--ready-shadow`     | `.field` box-shadow in `ready`/waiting-field |
| `--field-wash`       | `.field::before` background (`background-size: 210% 100%` is fixed by core) |
| `--caret-gradient`   | `.caret` background |
| `--caret-shadow`     | `.caret` box-shadow |
| `--next-color`, `--next-shadow` | `.next-word` color / text-shadow |
| `--tail-color`       | `.tail` color |

**Geometry & masks (apply to every beam layer)**

| Token             | Meaning                                                     |
| ----------------- | ---------------------------------------------------------- |
| `--layer-radius`  | `border-radius` on all beams (default `0`)                 |
| `--layer-clip`    | `clip-path` on all beams (default `none`)                  |
| `--effect-mask`   | shared mask feeding `--body-mask` `--flow-mask` (default `none`) |
| `--effect-mask-soft` | shared mask feeding `--haze/spark/smoke/aux-mask` (default `none`) |
| `--{layer}-mask`  | per-layer mask override (layer ∈ haze, body, core, flow, spark, smoke, aux) |

**Per-layer knobs.** Every layer `X` reads `--X-width`, `--X-height`, `--X-bg`, `--X-filter`, plus an
optional `--X-size` (background-size; defaults `auto`, except flow defaults `220% 100%`). Opacity and
motion vary by layer:

| Layer `X` | width/height/bg/filter/size | opacity token(s)              | motion token(s)                         |
| --------- | --------------------------- | ----------------------------- | --------------------------------------- |
| haze      | ✓                           | `--haze-opacity`              | `--haze-motion` (beam) `--torch-haze-motion` (caret) |
| body      | ✓                           | `--body-opacity`              | *(none — entrance is `beam-open`, fixed)* |
| core      | ✓                           | `--core-opacity`              | `--core-motion` (beam) `--torch-core-motion` (caret) |
| flow      | ✓                           | `--flow-low`, `--flow-high`   | `--flow-motion`                          |
| spark     | ✓                           | `--spark-low`, `--spark-high` | `--spark-motion`                         |
| smoke     | ✓ + `--smoke-blend`         | `--smoke-opacity`             | `--smoke-motion`                         |
| aux       | ✓ + `--aux-blend`           | `--aux-opacity`               | `--aux-motion`                           |

Notes grounded in `core.css`:

- **flow/spark have `--X-low` and `--X-high`, not a single opacity.** The static rule sets
  `opacity: var(--X-low)`; the default motion keyframes (`glow-flow`, `glow-particles`) animate
  between `--X-low` and `--X-high`. If you replace the motion, decide what your keyframes read.
- **`aux` ships zeroed** (`--aux-opacity: 0`, `--aux-bg: transparent`); it is an opt-in extra layer.
- **`--*-motion` is a full `animation` shorthand string**, e.g.
  `--haze-motion: my-haze-drift 4s ease-in-out infinite;`. Core applies it as
  `animation: var(--haze-motion)` (beams also prepend the fixed `beam-open` entrance). Set it to
  `none` to freeze a layer. The keyframe name you use must be defined in your `index.css` and, like
  all `@keyframes`, is **page-global** — so prefix it with your effect name.

---

## 5. The cascade ladder (specificity + order)

Winners are decided by this ladder. Custom properties live only at L1/L2; structural overrides at
L4/L5.

- **L0** — `core.css` token defaults: `.field[data-glow] { … }` — specificity (0,2,0).
- **L1** — your token pack: `.field[data-glow='x'] { … }` — (0,2,0), **wins over L0 by source
  order** because your CSS imports `core.css` first.
- **L2** — your state/theme token packs:
  `.field[data-state='waiting'][data-glow='x']`, `.field[data-theme='light'][data-glow='x']` —
  (0,3,0). **Put custom properties only here or at L1.**
- **L3** — core's anatomy application rules:
  `.stage[data-glow] .field[data-glow] .beam-veil { width: var(--haze-width); … }` — (0,5,0).
- **L4** — your structural overrides: `.stage[data-glow='x'] .field[data-glow] <part>` — ≥ (0,5,0),
  after core in order. Restyle any anatomy node, add pseudo-elements on `.prediction`, kill a
  `.beam`, repaint `.field`, extend `.edge-*`.
- **L5** — your theme + structural: `.stage[data-theme='light'][data-glow='x'] .field[data-glow] <part>`
  — (0,6,0). Core's light structural rules are `.stage[data-theme='light'] .beam-veil` = (0,3,0), so
  your plain L4 (0,5,0) already beats them; reach for L5 (0,6,0) only when you need a light-specific
  variant of an L4 override without disturbing the dark one (equal L4 selectors would otherwise tie
  and resolve by order).

**The ordering invariant.** L1 and L4 only beat core's L0/L3 because your CSS is loaded *after*
`core.css`. Guarantee it structurally: your `index.ts` imports `../core.css` as its **first**
statement. Bundlers dedupe core to its first occurrence and, within your module, core precedes your
skin — so the order holds regardless of the consumer's import order. **Do not** use `@layer`: the
component's own styles are unlayered and would suddenly beat layered effect CSS.

Component-scoped styles sit *below* everything above and are **not** targetable.

App-level theming (no effect authoring) works through the same tokens:
`.my-brand .field[data-glow] { --next-color: …; --caret-gradient: … }` is (0,3,0) — it beats core
defaults and loses to effect packs. Think "themes under, effects over."

---

## 6. The waiting-vs-ready split

Two visual states share the beam stack; keep them distinct.

- **ready** (`data-state='ready'`) — a suggestion is showing. The `.prediction` beams render; the
  caret glow, if present, is in `data-mode='ready'`. Core gates the caret torch layers' opacity here
  (`.caret-origin-glow[data-mode='ready'] .torch-haze { opacity: var(--haze-opacity) }`, etc.).
- **waiting** (`data-state='waiting'`) — the model is "thinking". No `.prediction` exists yet.
  Where the indicator shows depends on `data-loading-glow`:
  - `torch` → the caret glow renders in `data-mode='waiting'` (six `.torch-*` beams).
  - `field` → the whole `.field` lights (border/shadow via `--ready-*`, plus a field wash shimmer).
  - `none` → no caret glow and no field lift.

To restyle the thinking indicator without JS, add a **waiting token re-pack** at L2:

```css
.field[data-state='waiting'][data-glow='my-effect'] {
	--torch-haze-motion: my-think-pulse 900ms ease-in-out infinite;
	--core-opacity: 0.5;
	/* … */
}
```

This changes only the waiting look; the ready look stays on your L1 pack.

**`data-light-flow='off'`.** Core hides `beam-flow`, `beam-spark`, `torch-flow`, `torch-spark`,
`beam-smoke`, `torch-smoke`, `beam-aux`, `torch-aux` when flow is off, and freezes `.beam-veil` to
its entrance pose. If your effect adds infinite motion on other layers, add a matching
`.stage[data-glow='my-effect'][data-light-flow='off'] … { animation: none }` so "flow off" is
honored.

---

## 7. The var()-in-custom-property pitfall (read this)

**A custom property that is animated (or read inside an `@keyframes`) must be declared on the element
whose animation consumes it — not on an ancestor.**

Why: CSS custom properties resolve **per element**. The default motion keyframes in `core.css` read
tokens *inside their frame bodies* — e.g. `glow-flow` reads `--flow-high`, `glow-particles` reads
`--spark-high`, `glow-breathe` and `smoke-drift` read `--haze-opacity`/`--smoke-opacity`. Those work
because the tokens are set on `.field[data-glow]`, and the beam elements **inherit** them, so the
value is defined *at the animating beam*. The moment you introduce your **own** animated property via
`@property` (for a smoothly interpolated angle, hue, radius, …), the same rule bites:

```css
/* WRONG — the animated var is declared on .field, but the animation runs on the beam.
   The beam sees only the inherited *static* value; the interpolation never reaches it. */
@property --my-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.field[data-glow='my-effect'] {
	--my-angle: 0deg;
	--haze-bg: conic-gradient(from var(--my-angle), …);
	--haze-motion: my-spin 6s linear infinite;
}
@keyframes my-spin { to { --my-angle: 360deg; } }
```

```css
/* RIGHT — declare and animate --my-angle on the consuming element (.beam-veil / .torch-haze),
   and reference it in that element's own background. */
@property --my-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.stage[data-glow='my-effect'] .field[data-glow] .beam-veil,
.stage[data-glow='my-effect'] .field[data-glow] .torch-haze {
	--my-angle: 0deg;
	background: conic-gradient(from var(--my-angle), …);
	animation: my-spin 6s linear infinite;
}
@keyframes my-spin { to { --my-angle: 360deg; } }
```

`@property` registrations (and every `@keyframes`) are **page-global** — name them with your effect
prefix so two effects never collide.

---

## 8. A complete minimal effect

Pure-CSS "firefly": warm sparks that assemble the word. Two files (three with a layer, omitted here).

```ts
// firefly/index.ts
import '@ui4ai/light-input/core.css';
import './index.css';
import { defineEffect } from '@ui4ai/light-input';
import { meta } from './meta';

export { meta };
export default defineEffect({ meta });
```

```ts
// firefly/meta.ts
import type { EffectMeta } from '@ui4ai/light-input';
export const meta: EffectMeta = {
	name: 'firefly',
	label: 'Firefly',
	description: 'Warm sparks assemble the prediction.'
};
```

```css
/* firefly/index.css */

/* L1 — token pack (custom properties only) */
.field[data-glow='firefly'] {
	--ready-border: rgba(255, 214, 130, 0.3);
	--field-wash: linear-gradient(90deg, rgba(255, 196, 92, 0.08), transparent 44%);
	--caret-gradient: linear-gradient(180deg, #fff, #ffe9a8 40%, #ffb02e);
	--caret-shadow: 0 0 18px rgba(255, 176, 46, 0.5);
	--haze-bg: radial-gradient(ellipse 70% 60% at 0% 50%, rgba(255, 210, 120, 0.4), transparent 70%);
	--haze-motion: firefly-drift 4s ease-in-out infinite;
	--spark-bg: radial-gradient(circle at 20% 50%, rgba(255, 236, 170, 0.9), transparent 6%);
	--spark-low: 0.06;
	--spark-high: 0.4;
	--spark-motion: firefly-blink 2.4s steps(3, end) infinite;
	--next-color: rgba(255, 244, 214, 0.95);
	--next-shadow: 0 0 10px rgba(255, 190, 90, 0.4);
	--tail-color: rgba(230, 210, 170, 0.34);
}

/* L2 — waiting re-pack: a slower, dimmer pulse while thinking */
.field[data-state='waiting'][data-glow='firefly'] {
	--torch-haze-motion: firefly-drift 3s ease-in-out infinite;
	--core-opacity: 0.5;
}

/* L2 — light theme dampers */
.field[data-theme='light'][data-glow='firefly'] {
	--next-color: rgba(120, 78, 20, 0.85);
}

/* L4 — a custom sparkle on the prediction (structural override) */
.stage[data-glow='firefly'] .field[data-glow] .prediction::after {
	content: '';
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: radial-gradient(circle at 50% 42%, rgba(255, 240, 190, 0.14), transparent 60%);
}

/* honor flow-off (§6) */
.stage[data-glow='firefly'][data-light-flow='off'] .field[data-glow] .beam-spark,
.stage[data-glow='firefly'][data-light-flow='off'] .field[data-glow] .torch-spark {
	animation: none;
}

/* namespaced keyframes (page-global — always prefix) */
@keyframes firefly-drift {
	0%, 100% { transform: translateY(-50%) scaleX(0.96); }
	50% { transform: translateY(-52%) scaleX(1.05); }
}
@keyframes firefly-blink {
	0%, 100% { opacity: var(--spark-low); }
	50% { opacity: var(--spark-high); }
}
```

For an effect with live DOM, add `Layer.svelte` (props `{ suggestion, lightFlow }`) and pass it to
`defineEffect({ meta, layer })`. The layer renders inside `.prediction` (position it absolutely,
`pointer-events: none`) and is **remounted on every ignite**, so entrance animations replay with no
self-reset logic.

---

## 9. Custom caret and waiting snippets (DOM overrides)

Beyond CSS, `GhostInput` accepts two Svelte 5 snippet props to replace DOM. Omit them and the
built-in markup renders unchanged.

### `caret` snippet — replace the caret element

Receives `{ focused, loading, ready }` so you can mirror the built-in class logic (the default
adds `.active` when focused, `.thinking` while loading, `.steady` when a suggestion shows):

```svelte
<GhostInput>
	{#snippet caret({ focused, loading, ready })}
		<span class="block-caret" data-focused={focused} data-loading={loading} data-ready={ready}></span>
	{/snippet}
</GhostInput>
```

The snippet replaces the `.caret` span in place; every other node is byte-identical to the default.

### `waiting` snippet — replace the thinking indicator's children

Replaces the six `.torch-*` beams inside `.caret-origin-glow`:

```svelte
<GhostInput>
	{#snippet waiting()}
		<span class="orbit-spinner"></span>
	{/snippet}
</GhostInput>
```

**Gating (important):** the `waiting` snippet renders **only where the default torch stack would** —
i.e. only when the caret glow is shown. That means it renders when a suggestion is showing
(`ready`, `data-mode='ready'`) or while thinking with `loadingGlow='torch'`
(`data-mode='waiting'`). With `loadingGlow='field'` or `loadingGlow='none'`, the `.caret-origin-glow`
wrapper is not rendered at all, so **neither the snippet nor the default beams appear** — style the
thinking indicator via the field instead (§6).

---

## 10. Custom completion source

`GhostInput` accepts a `complete` prop to swap the backend without forking the state machine:

```ts
type CompleteFn = (text: string, ctx: { signal: AbortSignal }) => Promise<string>;
```

```svelte
<GhostInput completionMode="llm" complete={async (text, { signal }) => {
	const r = await fetch('/my/endpoint', { method: 'POST', body: text, signal });
	return (await r.json()).completion;
}} />
```

When `complete` is set it **replaces** the built-in `endpoint` fetch for `llm` mode (the `endpoint`
prop is then ignored). Your function runs inside the same guards as the built-in path: debounce, LRU
cache, monotonic stale-response guard, and the shared `AbortSignal` (which fires when the request is
superseded or the input blurs — honor it). Return the raw completion string; the component normalizes
it exactly like an endpoint response. `demo` mode never calls `complete`.

Custom effect names + persisted settings: an app that lets users pick effects should validate a
persisted name against the effects it actually registered (built-ins from `GLOW_VARIANTS` plus its
own), falling back to `torch` for an unknown name — the component itself accepts any string for
`glow`, so validation is the app's responsibility.

---

## Non-goals

The internal completion engine, selection tracker, and glyph tables are **not** exported — the
package's exports map makes deep imports impossible on purpose. If you need one, open an issue; adding
an export later is safe, removing one is not.
