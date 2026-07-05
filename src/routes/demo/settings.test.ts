import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DEMO_SETTINGS,
	parseDemoSettings,
	serializeDemoSettings,
	type DemoSettings
} from './settings';

describe('demo settings', () => {
	it('parses valid persisted settings', () => {
		const settings: DemoSettings = {
			theme: 'light',
			glow: 'blueprint',
			loadingGlow: 'field',
			lightFlow: false,
			completionMode: 'demo'
		};

		expect(parseDemoSettings(serializeDemoSettings(settings))).toEqual(settings);
	});

	it('falls back for invalid or stale persisted settings', () => {
		expect(parseDemoSettings('{bad json')).toEqual(DEFAULT_DEMO_SETTINGS);
		expect(
			parseDemoSettings(
				JSON.stringify({
					theme: 'sepia',
					glow: 'unknown',
					loadingGlow: 'yes',
					lightFlow: 'true',
					completionMode: 'remote'
				})
			)
		).toEqual(DEFAULT_DEMO_SETTINGS);
	});
});
