// Behavior tests for the W6 deep-customization seams on GhostInput:
//   - autofocus prop (off => no focus stolen on mount)
//   - effect sugar (derives glow + layer; explicit glow/layer win)
//   - complete() custom completion (replaces the endpoint fetch, keeps the engine guards)
//   - caret snippet (custom node replaces the default .caret; default path is fixture-identical)
//   - waiting snippet (custom node replaces the torch beams; gated by loadingGlow/showCaretGlow)
//
// These mount the real component (happy-dom + fake timers) via the same drivers as the fixture
// smoke test, so states are produced by identical code paths. Snippet cases use the two
// __fixtures__ harness components, which wrap GhostInput with a {#snippet}.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GhostInput from '$lib/GhostInput.svelte';
import CaretSnippetHarness from './__fixtures__/CaretSnippetHarness.svelte';
import WaitingSnippetHarness from './__fixtures__/WaitingSnippetHarness.svelte';
import BindValueHarness from './__fixtures__/BindValueHarness.svelte';
import EffectLayerA from './__fixtures__/EffectLayerA.svelte';
import EffectLayerB from './__fixtures__/EffectLayerB.svelte';
import {
	drainTimers,
	mountGhost,
	typeDemo,
	typeLiteral,
	READY_PREFIX,
	WAITING_TEXT,
	type MountedInput
} from './testkit.svelte';
import type { EffectDefinition } from '$lib/effects/types';

/** Build an effect definition with the given name and layer (layer A by default). */
const makeEffect = (name: string, layer = EffectLayerA): EffectDefinition => ({
	meta: { name, label: name },
	layer
});

/**
 * Mount an arbitrary component (e.g. a snippet harness) into a detached target, drain timers, and
 * return handles with the same shape as testkit's MountedInput so the shared typeLiteral/typeDemo
 * drivers accept it.
 */
async function mountComponent(
	Component: Parameters<typeof mount>[0],
	props: Record<string, unknown>
): Promise<MountedInput> {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component, { target, props });
	await drainTimers();
	const input = target.querySelector('input') as HTMLInputElement;
	return {
		target,
		input,
		component,
		stage: () => target.querySelector('.stage') as HTMLElement,
		html: () => (target.querySelector('.stage') as HTMLElement).outerHTML,
		destroy: () => {
			unmount(component);
			target.remove();
		}
	};
}

/** Type a completable demo prefix into an already-mounted harness input. */
async function typeDemoInto(handles: { input: HTMLInputElement }, prefix: string) {
	handles.input.focus();
	for (const ch of prefix) {
		handles.input.dispatchEvent(
			new InputEvent('beforeinput', { inputType: 'insertText', data: ch, bubbles: true, cancelable: true })
		);
		await tick();
		flushSync();
	}
	await drainTimers();
}

describe('GhostInput W6 seams', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		document.body.innerHTML = '';
	});

	describe('autofocus', () => {
		it('focuses the input on mount by default', async () => {
			const m = await mountGhost({ completionMode: 'demo' });
			try {
				expect(document.activeElement).toBe(m.input);
			} finally {
				m.destroy();
			}
		});

		it('does NOT focus the input when autofocus={false}', async () => {
			const m = await mountGhost({ completionMode: 'demo', autofocus: false });
			try {
				expect(document.activeElement).not.toBe(m.input);
			} finally {
				m.destroy();
			}
		});
	});

	describe('effect sugar', () => {
		it('derives data-glow from effect.meta.name', async () => {
			const m = await mountGhost({ effect: makeEffect('ocean'), completionMode: 'demo' });
			try {
				expect(m.stage().getAttribute('data-glow')).toBe('ocean');
			} finally {
				m.destroy();
			}
		});

		it('renders the effect.layer inside the live prediction (ready state)', async () => {
			const m = await mountGhost({ effect: makeEffect('ocean'), completionMode: 'demo' });
			await typeDemoInto(m, READY_PREFIX);
			try {
				expect(m.stage().getAttribute('data-state')).toBe('ready');
				expect(m.target.querySelector('.prediction [data-layer="layer-a"]')).not.toBeNull();
			} finally {
				m.destroy();
			}
		});

		it('an explicit glow prop wins over effect.meta.name', async () => {
			const m = await mountGhost({
				effect: makeEffect('ocean'),
				glow: 'torch',
				completionMode: 'demo'
			});
			try {
				expect(m.stage().getAttribute('data-glow')).toBe('torch');
			} finally {
				m.destroy();
			}
		});

		it('an explicit layer prop wins over effect.layer', async () => {
			const m = await mountGhost({
				effect: makeEffect('ocean', EffectLayerA),
				layer: EffectLayerB,
				completionMode: 'demo'
			});
			await typeDemoInto(m, READY_PREFIX);
			try {
				// The explicit layer (B) rendered; effect.layer (A) did not.
				expect(m.target.querySelector('.prediction [data-layer="layer-b"]')).not.toBeNull();
				expect(m.target.querySelector('.prediction [data-layer="layer-a"]')).toBeNull();
			} finally {
				m.destroy();
			}
		});

		it('an explicit glow still lets effect.layer supply the layer (independent precedence)', async () => {
			// glow explicit, layer omitted => glow wins for data-glow, effect.layer still supplies the layer.
			const m = await mountGhost({
				effect: makeEffect('ocean', EffectLayerA),
				glow: 'torch',
				completionMode: 'demo'
			});
			await typeDemoInto(m, READY_PREFIX);
			try {
				expect(m.stage().getAttribute('data-glow')).toBe('torch');
				expect(m.target.querySelector('.prediction [data-layer="layer-a"]')).not.toBeNull();
			} finally {
				m.destroy();
			}
		});

		it('with no glow/effect at all, defaults to torch', async () => {
			const m = await mountGhost({ completionMode: 'demo' });
			try {
				expect(m.stage().getAttribute('data-glow')).toBe('torch');
			} finally {
				m.destroy();
			}
		});
	});

	describe('complete()', () => {
		it('calls complete() with the input text and an abort signal; endpoint fetch is NOT called', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			let seenText = '';
			let seenSignal: unknown;
			const complete = vi.fn(async (text: string, ctx: { signal: AbortSignal }) => {
				seenText = text;
				seenSignal = ctx.signal;
				return ' via-complete';
			});
			const m = await mountGhost({ completionMode: 'llm', debounceMs: 10, complete });
			await typeLiteral(m, WAITING_TEXT);
			await vi.runAllTimersAsync();
			flushSync();
			try {
				expect(complete).toHaveBeenCalled();
				expect(seenText).toBe(WAITING_TEXT);
				expect(seenSignal).toBeInstanceOf(AbortSignal);
				expect(fetchSpy).not.toHaveBeenCalled();
				expect(m.stage().getAttribute('data-state')).toBe('ready');
				expect(m.target.querySelector('.prediction')).not.toBeNull();
			} finally {
				m.destroy();
			}
		});

		it('still honors the stale guard: a superseded complete() result is dropped', async () => {
			let resolveFn: (s: string) => void = () => {};
			const complete = vi.fn(() => new Promise<string>((res) => (resolveFn = res)));
			const m = await mountGhost({ completionMode: 'llm', debounceMs: 10, complete });
			await typeLiteral(m, 'Hello wor');
			await vi.advanceTimersByTimeAsync(20); // complete() in flight for 'Hello wor'

			// User types more; the live value changes before the first result lands.
			await typeLiteral(m, 'Hello world!!');
			resolveFn(' STALE-FIRST');
			await vi.advanceTimersByTimeAsync(0);
			flushSync();
			try {
				// The stale first result must not have been committed as the suggestion.
				const pred = m.target.querySelector('.next-word')?.textContent ?? '';
				expect(pred).not.toContain('STALE-FIRST');
			} finally {
				m.destroy();
			}
		});
	});

	describe('caret snippet', () => {
		it('renders the custom caret node instead of the default .caret span (ready state)', async () => {
			const m = await mountComponent(CaretSnippetHarness, { completionMode: 'demo' });
			await typeDemoInto(m, READY_PREFIX);
			try {
				expect(m.stage().getAttribute('data-state')).toBe('ready');
				const custom = m.target.querySelector('.custom-caret');
				expect(custom).not.toBeNull();
				// The default caret span is gone.
				expect(m.target.querySelector('span.caret')).toBeNull();
				// State flowed into the snippet: ready => steady.
				expect(custom?.getAttribute('data-ready')).toBe('true');
				expect(custom?.getAttribute('data-focused')).toBe('true');
			} finally {
				m.destroy();
			}
		});

		it('reflects the waiting state (loading=true, ready=false) in the caret snippet', async () => {
			const origFetch = globalThis.fetch;
			globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
			const m = await mountComponent(CaretSnippetHarness, {
				completionMode: 'llm',
				debounceMs: 10
			});
			try {
				await typeLiteral(m, WAITING_TEXT);
				await vi.advanceTimersByTimeAsync(50);
				flushSync();
				const custom = m.target.querySelector('.custom-caret');
				expect(custom).not.toBeNull();
				expect(custom?.getAttribute('data-loading')).toBe('true');
				expect(custom?.getAttribute('data-ready')).toBe('false');
			} finally {
				m.destroy();
				globalThis.fetch = origFetch;
			}
		});

		it('leaves the rest of the DOM identical to the default (only the caret node differs)', async () => {
			// Default render.
			const base = await mountGhost({ completionMode: 'demo' });
			await typeDemo(base, READY_PREFIX);
			const baseHtml = base.html();
			base.destroy();

			// Snippet render (through the wrapper harness).
			const snip = await mountComponent(CaretSnippetHarness, { completionMode: 'demo' });
			await typeDemoInto(snip, READY_PREFIX);
			const snipHtml = snip.html();
			snip.destroy();

			// Swap the custom caret node back to the default caret span, then strip all inert Svelte
			// anchor comments (the wrapper harness contributes its own, unrelated to the caret seam)
			// so the comparison is purely "is every rendered element identical?".
			const strip = (s: string) => s.replaceAll('<!---->', '');
			const normalized = strip(
				snipHtml.replace(/<b class="custom-caret"[^>]*><\/b>/, '<span class="caret active steady"></span>')
			);
			expect(normalized).toBe(strip(baseHtml));
		});
	});

	describe('waiting snippet', () => {
		async function driveWaitingHarness(props: Record<string, unknown>) {
			const origFetch = globalThis.fetch;
			globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
			const m = await mountComponent(WaitingSnippetHarness, {
				completionMode: 'llm',
				debounceMs: 10,
				...props
			});
			await typeLiteral(m, WAITING_TEXT);
			await vi.advanceTimersByTimeAsync(50);
			flushSync();
			const innerDestroy = m.destroy;
			m.destroy = () => {
				innerDestroy();
				globalThis.fetch = origFetch;
			};
			return m;
		}

		it('renders the custom waiting node inside .caret-origin-glow (loadingGlow=torch)', async () => {
			const m = await driveWaitingHarness({ loadingGlow: 'torch' });
			try {
				expect(m.stage().getAttribute('data-state')).toBe('waiting');
				const glow = m.target.querySelector(".caret-origin-glow[data-mode='waiting']");
				expect(glow).not.toBeNull();
				expect(glow?.querySelector('.custom-waiting')).not.toBeNull();
				// The default torch beams are gone.
				expect(m.target.querySelector('.torch-beam')).toBeNull();
			} finally {
				m.destroy();
			}
		});

		it("renders NEITHER the waiting snippet nor .caret-origin-glow when loadingGlow='none'", async () => {
			const m = await driveWaitingHarness({ loadingGlow: 'none' });
			try {
				expect(m.stage().getAttribute('data-state')).toBe('waiting');
				// showCaretGlow is false when loadingGlow!=='torch', so the whole subtree is absent.
				expect(m.target.querySelector('.caret-origin-glow')).toBeNull();
				expect(m.target.querySelector('.custom-waiting')).toBeNull();
			} finally {
				m.destroy();
			}
		});

		it("also renders no caret glow subtree when loadingGlow='field' (waiting shows in the field, not the caret)", async () => {
			const m = await driveWaitingHarness({ loadingGlow: 'field' });
			try {
				expect(m.stage().getAttribute('data-state')).toBe('waiting');
				expect(m.target.querySelector('.caret-origin-glow')).toBeNull();
				expect(m.target.querySelector('.custom-waiting')).toBeNull();
			} finally {
				m.destroy();
			}
		});
	});

	describe('bind:value', () => {
		// The harness owns a reactive `text` state two-way bound to GhostInput's `value`, mirrors it
		// into an <output class="bound"> probe, and exports setValue/getValue.
		type BoundHarness = MountedInput & {
			exports: { setValue(v: string): void; getValue(): string };
			bound: () => string;
		};

		async function mountBound(props: Record<string, unknown>): Promise<BoundHarness> {
			const target = document.createElement('div');
			document.body.appendChild(target);
			const component = mount(BindValueHarness, { target, props }) as unknown as {
				setValue(v: string): void;
				getValue(): string;
			};
			await drainTimers();
			const input = target.querySelector('input') as HTMLInputElement;
			return {
				target,
				input,
				component: component as unknown as MountedInput['component'],
				exports: component,
				stage: () => target.querySelector('.stage') as HTMLElement,
				html: () => (target.querySelector('.stage') as HTMLElement).outerHTML,
				bound: () => (target.querySelector('output.bound') as HTMLElement).textContent ?? '',
				destroy: () => {
					unmount(component as unknown as Parameters<typeof unmount>[0]);
					target.remove();
				}
			};
		}

		it('reflects typing OUT to the bound prop (input -> prop)', async () => {
			const m = await mountBound({ completionMode: 'demo' });
			try {
				await typeDemoInto(m, READY_PREFIX);
				// The scripted demo pipeline rebuilds `value` to the typed prefix; the binding must
				// surface it on the parent's state (read through both the export and the DOM probe).
				expect(m.input.value).toBe(READY_PREFIX);
				expect(m.exports.getValue()).toBe(READY_PREFIX);
				expect(m.bound()).toBe(READY_PREFIX);
			} finally {
				m.destroy();
			}
		});

		it('reflects a parent SET back into the input (prop -> input)', async () => {
			const m = await mountBound({ completionMode: 'demo' });
			try {
				m.exports.setValue('Hello there');
				flushSync();
				await tick();
				flushSync();
				// Setting the parent state must drive the <input> value through the binding.
				expect(m.input.value).toBe('Hello there');
				expect(m.bound()).toBe('Hello there');
			} finally {
				m.destroy();
			}
		});

		it('seeds the input from an initial bound value', async () => {
			const m = await mountBound({ completionMode: 'demo', initialValue: 'seeded' });
			try {
				expect(m.input.value).toBe('seeded');
				expect(m.exports.getValue()).toBe('seeded');
			} finally {
				m.destroy();
			}
		});
	});

	describe('onaccept', () => {
		it('fires with { word, text } when the next word is Tab-accepted', async () => {
			const onaccept = vi.fn();
			const m = await mountGhost({ completionMode: 'demo', onaccept });
			await typeDemo(m, READY_PREFIX);
			try {
				expect(m.stage().getAttribute('data-state')).toBe('ready');
				// Tab accepts the next word. For the demo phrase, "Let's make so" + suggestion
				// "mething that actually makes a difference" => accepted word "mething".
				m.input.dispatchEvent(
					new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
				);
				await tick();
				flushSync();

				expect(onaccept).toHaveBeenCalledTimes(1);
				const detail = onaccept.mock.calls[0][0] as { word: string; text: string };
				expect(detail.word).toBe('mething');
				expect(detail.text).toBe("Let's make something");
				// The payload text equals the input value after acceptance.
				expect(detail.text).toBe(m.input.value);
			} finally {
				m.destroy();
			}
		});

		it('does not fire without a ready suggestion', async () => {
			const onaccept = vi.fn();
			const m = await mountGhost({ completionMode: 'demo', onaccept });
			try {
				// No text typed => no suggestion => Tab is a no-op for acceptance.
				m.input.focus();
				m.input.dispatchEvent(
					new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
				);
				await tick();
				flushSync();
				expect(onaccept).not.toHaveBeenCalled();
			} finally {
				m.destroy();
			}
		});
	});
});
