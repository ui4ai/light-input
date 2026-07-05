import {
	COMPLETION_MODES,
	GLOW_VARIANTS,
	type CompletionMode,
	type GlowVariant,
	type LoadingGlow,
	type ThemeMode
} from '@ui4ai/light-input';

export const DEMO_SETTINGS_STORAGE_KEY = 'light-input-demo-settings';

export interface DemoSettings {
	theme: ThemeMode;
	glow: GlowVariant;
	loadingGlow: LoadingGlow;
	lightFlow: boolean;
	completionMode: CompletionMode;
}

export const DEFAULT_DEMO_SETTINGS: DemoSettings = {
	theme: 'dark',
	glow: 'torch',
	loadingGlow: 'torch',
	lightFlow: true,
	completionMode: 'llm'
};

const LOADING_GLOWS = ['torch', 'field', 'none'] as const satisfies readonly LoadingGlow[];

function pickString<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseDemoSettings(raw: string | null | undefined): DemoSettings {
	if (!raw) return { ...DEFAULT_DEMO_SETTINGS };

	try {
		const value = JSON.parse(raw) as Partial<Record<keyof DemoSettings, unknown>>;
		return {
			theme: pickString(value.theme, ['dark', 'light'] as const, DEFAULT_DEMO_SETTINGS.theme),
			glow: pickString(value.glow, GLOW_VARIANTS, DEFAULT_DEMO_SETTINGS.glow),
			loadingGlow: pickString(value.loadingGlow, LOADING_GLOWS, DEFAULT_DEMO_SETTINGS.loadingGlow),
			lightFlow:
				typeof value.lightFlow === 'boolean'
					? value.lightFlow
					: DEFAULT_DEMO_SETTINGS.lightFlow,
			completionMode: pickString(
				value.completionMode,
				COMPLETION_MODES,
				DEFAULT_DEMO_SETTINGS.completionMode
			)
		};
	} catch {
		return { ...DEFAULT_DEMO_SETTINGS };
	}
}

export function serializeDemoSettings(settings: DemoSettings): string {
	return JSON.stringify(settings);
}
