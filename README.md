![light-input demo](static/demo.gif)

# light-input

A small **Svelte 5 + SvelteKit** demo of an LLM ghost-text autocomplete. Type more
than 2 characters and the next words are predicted by an LLM (via
[OpenRouter](https://openrouter.ai)) and **ignite** — a warm light smoothly turns on
and highlights the next word, Cursor / Apple-Intelligence style. Press **Tab** or
**→** to accept the next word.

## Try it

[Open the GitHub Pages demo](https://ui4ai.github.io/light-input/) — the hosted build
is locked to **Demo** mode and does not call OpenRouter.

## Stack

- Svelte 5 (runes) · SvelteKit 2 · Vite 8 · TypeScript
- No UI/animation dependencies — the glow is pure CSS, the SF/system font is native.
- Targets current Safari & Chrome.

## Run it

```sh
npm install
npm run dev -- --open
```

The OpenRouter key is read from `.env` (already created for this demo). To set your own:

```sh
cp .env.example .env
# then edit OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL)
```

```ini
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=openai/gpt-4.1-mini  # any OpenRouter slug; fast models feel best
LIGHT_INPUT_COMPLETION_MODE=llm       # set to demo to skip OpenRouter server-side
LIGHT_INPUT_DEMO_COMPLETION=Let's make something that actually makes a difference
```

> **Security:** the key lives **server-side only**. The browser talks to
> `POST /api/complete`, which proxies to OpenRouter — the key is never shipped to the
> client. The key in `.env` is temporary; rotate/revoke it when you're done.

For visual testing without spending tokens, switch the top control to **Demo**. That
sends `mode: "demo"` to `/api/complete` and returns the fixed
`LIGHT_INPUT_DEMO_COMPLETION` suffix without calling OpenRouter. Set
`LIGHT_INPUT_COMPLETION_MODE=demo` to force this behavior on the server.

## How it works

| Piece | File |
| --- | --- |
| The component (transparent input + painted ghost layer + glow) | [`src/lib/GhostInput.svelte`](src/lib/GhostInput.svelte) |
| Shared autocomplete types, limits, and display helpers | [`src/lib/autocomplete.ts`](src/lib/autocomplete.ts) |
| Server proxy + prompt to OpenRouter | [`src/lib/server/complete.ts`](src/lib/server/complete.ts) · [`src/lib/server/completion-request.ts`](src/lib/server/completion-request.ts) · [`src/lib/server/completion-protocol.ts`](src/lib/server/completion-protocol.ts) · [`src/lib/server/rate-limit.ts`](src/lib/server/rate-limit.ts) · [`src/routes/api/complete/+server.ts`](src/routes/api/complete/+server.ts) |
| Demo page | [`src/routes/+page.svelte`](src/routes/+page.svelte) |

A few details that make it feel right:

- **Gated + debounced.** Nothing fires until the text is longer than 2 characters; then
  requests are debounced (~260 ms) and the previous in-flight request is aborted, which
  also aborts the upstream OpenRouter call.
- **Hardened proxy.** `POST /api/complete` rejects non-JSON bodies, malformed or
  oversized requests, and overlong input, sends `Cache-Control: no-store`, applies a
  bounded in-memory token-bucket rate limit, and returns sanitized errors instead of
  upstream details.
- **Stale-response guard.** A reply is dropped if you kept typing while it was in flight.
- **The "ignite".** When a suggestion lands, layered blurred beams animate on at the
  caret (`beam-open`, `beam-hot`, `word-reveal`, `tail-reveal`), the next word brightens,
  the tail fades to the right, and the whole bar warms from within. Respects
  `prefers-reduced-motion`.
- **Loading light modes.** `GhostInput` defaults to `loadingGlow="torch"`, a weak
  flashlight that warms up from the caret while the model is thinking. Use
  `loadingGlow="field"` for the full-input warm-up, or `"none"` to keep loading invisible.
- **Live demo controls.** The page exposes theme, thinking-glow, completion mode, glow
  preset, and natural light-flow controls. Settings are persisted in `localStorage`.
  `lightFlow` keeps the flashlight subtly drifting; turn it off for a steadier reveal.
- **Touch accept.** On iPhone / coarse-pointer screens, a compact arrow button appears
  inside the field when a suggestion is live. Tapping it accepts the next word, same as
  `Tab` / `→` on a hardware keyboard.
- **Correct spacing.** Chat APIs strip leading whitespace from replies, so the model uses
  an explicit protocol: `JOIN:<continuation>` for same-word/suffix completions and
  `SPACE:<continuation>` for next-word completions. The server parses that protocol and
  does not use language-specific spacing heuristics. User text is sent to the model as a
  JSON string data payload, not as free-form instructions.

## Verify

```sh
npm test
npm run check
npm run build
```

## Build

```sh
npm run build && npm run preview
```

This uses `@sveltejs/adapter-auto`; swap in a concrete
[adapter](https://svelte.dev/docs/kit/adapters) for your deploy target.
