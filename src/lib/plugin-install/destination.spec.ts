import { describe, expect, it } from 'vitest';
import { configuredPluginDestination } from './destination';

describe('configuredPluginDestination', () => {
	it('resolves a manifest path declared through env variables', () => {
		const manifest = JSON.stringify({
			path: '$QLIB',
			env: [{ QLIB: '$HOUDINI_USER_PREF_DIR/qLib-master' }]
		});

		expect(
			configuredPluginDestination(
				manifest,
				{
					HOUDINI_USER_PREF_DIR: 'C:/Users/test/Documents/houdini20.5'
				},
				'C:/fallback'
			)
		).toBe('C:/Users/test/Documents/houdini20.5/qLib-master');
	});

	it('falls back when the configured path cannot be resolved', () => {
		expect(configuredPluginDestination('{"path":"$UNKNOWN"}', {}, 'C:/fallback')).toBe(
			'C:/fallback'
		);
	});
});
