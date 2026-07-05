// Shared driving helpers for GhostInput component tests (happy-dom + fake timers).
//
// The three canonical visual states the DOM fixtures pin:
//   - idle:    mounted, autofocused, empty
//   - ready:   demo completionMode, a completable prefix typed -> live prediction
//   - waiting: llm completionMode, fetch hung -> loading (thinking) state
//
// Both the fixture generator (generate-fixtures.svelte.test.ts) and the persistent smoke test
// (ghost-input.svelte.test.ts) drive through THESE functions, so the states they compare are
// produced by identical code paths.
//
// Determinism: callers install vi.useFakeTimers(); the demo path's 220ms waitForDemoCompletion
// and the debounce timer are advanced via runAllTimersAsync(). The component uses no
// Math.random / Date.now / performance.now, so a frozen clock makes the rendered DOM byte-stable.

import { vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GhostInput from '$lib/GhostInput.svelte';

/** The prefix typed to reach the ready state (a completable prefix of the demo sentence). */
export const READY_PREFIX = "Let's make so";
/** The literal text typed in llm mode to reach the waiting (hung-fetch) state. */
export const WAITING_TEXT = 'Hello wor';

export interface MountedInput {
	target: HTMLElement;
	input: HTMLInputElement;
	stage: () => HTMLElement;
	html: () => string;
	component: ReturnType<typeof mount>;
	destroy: () => void;
}

export type GhostProps = Record<string, unknown>;

/** Run every pending fake timer (autofocus microtask, debounce, 220ms demo wait) to quiescence. */
export async function drainTimers() {
	await vi.runAllTimersAsync();
	flushSync();
}

/** Mount GhostInput into a detached target, drain timers (runs autofocus), return handles. */
export async function mountGhost(props: GhostProps): Promise<MountedInput> {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(GhostInput, { target, props });
	await drainTimers();
	const input = target.querySelector('input') as HTMLInputElement;
	const stage = () => target.querySelector('.stage') as HTMLElement;
	return {
		target,
		input,
		component,
		stage,
		html: () => stage().outerHTML,
		destroy: () => {
			unmount(component);
			target.remove();
		}
	};
}

/** Type a prefix through the demo scripted-input pipeline (beforeinput insertText events). */
export async function typeDemo(m: MountedInput, prefix: string) {
	m.input.focus();
	for (const ch of prefix) {
		const ev = new InputEvent('beforeinput', {
			inputType: 'insertText',
			data: ch,
			bubbles: true,
			cancelable: true
		});
		m.input.dispatchEvent(ev);
		await tick();
		flushSync();
	}
	await drainTimers();
}

/** Set the input value literally and fire a native input event (llm mode path). */
export async function typeLiteral(m: MountedInput, value: string) {
	m.input.focus();
	m.input.value = value;
	m.input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true }));
	await tick();
	flushSync();
}

/** State driver: mount idle (demo mode, empty). */
export async function driveIdle(props: GhostProps = {}): Promise<MountedInput> {
	return mountGhost({ theme: 'dark', glow: 'torch', completionMode: 'demo', placeholder: '', ...props });
}

/** State driver: mount + type a completable prefix in demo mode -> ready. */
export async function driveReady(props: GhostProps = {}): Promise<MountedInput> {
	const m = await mountGhost({
		theme: 'dark',
		glow: 'torch',
		completionMode: 'demo',
		placeholder: '',
		...props
	});
	await typeDemo(m, READY_PREFIX);
	return m;
}

/**
 * State driver: mount in llm mode with fetch hung, type a prefix -> waiting.
 * Installs a never-resolving fetch stub for the mount's lifetime; the returned `destroy`
 * restores the original fetch.
 */
export async function driveWaiting(props: GhostProps = {}): Promise<MountedInput> {
	const origFetch = globalThis.fetch;
	globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
	const m = await mountGhost({
		theme: 'dark',
		glow: 'torch',
		completionMode: 'llm',
		debounceMs: 10,
		placeholder: '',
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
