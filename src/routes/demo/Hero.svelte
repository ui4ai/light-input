<script lang="ts">
	// Above-the-fold hero: the package name, the one-line ghost-text story, a copy-on-click install
	// chip, and the GitHub link. Deliberately tight — the input field below it stays the star.
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';

	const INSTALL_COMMAND = 'npm i @ui4ai/light-input';
	const GITHUB_URL = 'https://github.com/ui4ai/light-input';

	let copied = $state(false);
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyInstall() {
		try {
			await navigator.clipboard?.writeText(INSTALL_COMMAND);
		} catch {
			// Clipboard may be unavailable (insecure context / denied permission); fail quietly —
			// the command is right there to select by hand.
			return;
		}
		copied = true;
		clearTimeout(copyResetTimer);
		copyResetTimer = setTimeout(() => (copied = false), 1600);
	}

	$effect(() => () => clearTimeout(copyResetTimer));
</script>

<header class="hero">
	<div class="hero-lede">
		<p class="eyebrow">Ghost-text autocomplete for Svelte</p>
		<h2 class="wordmark">light-input</h2>
		<p class="tagline">
			Type a few words and the rest of the thought fades in ahead of your caret — a ghost
			completion you accept with <kbd>Tab</kbd>. Thirty-nine glow skins, one component.
		</p>
	</div>

	<div class="hero-actions">
		<button
			type="button"
			class="install-chip"
			data-copied={copied ? 'true' : 'false'}
			aria-label={copied ? 'Install command copied' : `Copy install command: ${INSTALL_COMMAND}`}
			onclick={copyInstall}
		>
			<span class="install-prompt" aria-hidden="true">$</span>
			<code class="install-cmd">{INSTALL_COMMAND}</code>
			<span class="install-copy" aria-hidden="true">
				{#if copied}
					<Check size={15} strokeWidth={2.5} />
				{:else}
					<Copy size={15} strokeWidth={2.25} />
				{/if}
			</span>
		</button>

		<a
			class="github-link"
			href={GITHUB_URL}
			target="_blank"
			rel="noreferrer"
			aria-label="Open ui4ai/light-input on GitHub"
			title="ui4ai/light-input"
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.5v-1.88c-2.78.62-3.37-1.22-3.37-1.22-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.33 9.33 0 0 1 12 6.94c.85 0 1.7.12 2.5.34 1.9-1.32 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.04.36.32.68.94.68 1.9v2.81c0 .28.18.6.69.5A10.06 10.06 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z"
				/>
			</svg>
			<span>GitHub</span>
		</a>
	</div>
</header>

<style>
	.hero {
		display: flex;
		flex-wrap: wrap;
		gap: 18px 32px;
		align-items: flex-end;
		justify-content: space-between;
		width: min(1120px, 100%);
		margin: 0 auto;
	}

	.hero-lede {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 8px;
		max-width: 640px;
	}

	.eyebrow {
		margin: 0;
		color: var(--control-muted);
		font-size: 12px;
		font-weight: 650;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.wordmark {
		margin: 0;
		font-size: clamp(30px, 4.4vw, 44px);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--control-ink);
	}

	.tagline {
		margin: 2px 0 0;
		max-width: 52ch;
		color: var(--control-muted);
		font-size: 14.5px;
		font-weight: 500;
		line-height: 1.5;
	}

	.tagline kbd {
		padding: 1px 6px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--segment-bg);
		color: var(--control-ink);
		font: inherit;
		font-size: 12px;
		font-weight: 650;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}

	.install-chip {
		display: inline-grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 9px;
		align-items: center;
		height: 42px;
		padding: 0 12px 0 14px;
		border: 1px solid var(--control-border);
		border-radius: 14px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0)),
			var(--control-bg);
		color: var(--control-ink);
		cursor: pointer;
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset;
		-webkit-tap-highlight-color: transparent;
		transition:
			border-color 180ms ease,
			box-shadow 180ms ease,
			transform 120ms ease,
			background 180ms ease;
	}

	.install-prompt {
		color: var(--control-muted);
		font-family: 'SF Mono', ui-monospace, 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 13px;
		font-weight: 600;
	}

	.install-cmd {
		overflow: hidden;
		font-family: 'SF Mono', ui-monospace, 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 13px;
		font-weight: 550;
		letter-spacing: -0.01em;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.install-copy {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 7px;
		color: var(--control-muted);
		transition: color 180ms ease;
	}

	.install-chip:hover,
	.install-chip:focus-visible {
		border-color: rgba(255, 190, 122, 0.32);
		box-shadow:
			0 0 22px rgba(255, 132, 58, 0.13),
			0 1px 0 rgba(255, 255, 255, 0.14) inset;
	}

	.install-chip:hover .install-copy,
	.install-chip:focus-visible .install-copy {
		color: var(--control-ink);
	}

	.install-chip:active {
		transform: scale(0.98);
	}

	.install-chip[data-copied='true'] {
		border-color: rgba(120, 224, 150, 0.4);
	}

	.install-chip[data-copied='true'] .install-copy {
		color: rgb(120, 224, 150);
	}

	.github-link {
		display: inline-grid;
		grid-template-columns: 18px auto;
		gap: 8px;
		place-items: center;
		height: 42px;
		padding: 0 15px 0 12px;
		border: 1px solid var(--control-border);
		border-radius: 14px;
		background:
			radial-gradient(circle at 28% 18%, rgba(255, 255, 255, 0.1), transparent 40%),
			var(--segment-bg);
		color: var(--control-ink);
		text-decoration: none;
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset;
		-webkit-tap-highlight-color: transparent;
		transition:
			border-color 180ms ease,
			box-shadow 180ms ease,
			transform 120ms ease;
	}

	.github-link svg {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}

	.github-link span {
		font-size: 13px;
		font-weight: 650;
	}

	.github-link:hover,
	.github-link:focus-visible {
		border-color: rgba(255, 190, 122, 0.32);
		box-shadow:
			0 0 20px rgba(255, 132, 58, 0.12),
			0 1px 0 rgba(255, 255, 255, 0.14) inset;
	}

	.github-link:active {
		transform: scale(0.98);
	}

	@media (max-width: 760px) {
		.hero {
			align-items: flex-start;
		}

		.hero-actions {
			width: 100%;
		}

		.install-chip {
			flex: 1 1 auto;
		}
	}
</style>
