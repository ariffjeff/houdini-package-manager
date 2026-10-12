import { describe, expect, it } from 'vitest';
import {
	configFixPlan,
	correctedConfigText,
	createConfigFixState,
	diffPreviewLines,
	effectiveHpath
} from './config-editor';

describe('config editor helpers', () => {
	it('detects alias conflicts and produces a destination-bound fix plan', () => {
		const state = createConfigFixState(
			{
				hpath: 'C:/old/plugin',
				HOUDINI_PATH: 'C:/old/houdini',
				SOURCE: '$hpath/bin'
			},
			{ defaultHpath: 'C:/fallback' }
		);

		expect(state.pathAliasConflict).toEqual({
			hpathUsedAsVariable: true,
			houdiniPathUsedAsVariable: false
		});
		expect(effectiveHpath(state, 'C:/install/plugin')).toBe('C:/install/plugin');
		expect(configFixPlan(state, 'C:/install/plugin')).toMatchObject({
			hpath: 'C:/install/plugin',
			pathAlias: 'hpath'
		});
	});

	it('renders the exact corrected JSON for a destination override', () => {
		const state = createConfigFixState(
			{ path: 'C:/legacy/plugin', enable: false },
			{
				defaultHpath: 'C:/install/plugin',
				migrateLegacyPath: true
			}
		);

		expect(correctedConfigText(state, 'C:/install/plugin')).toBe(
			JSON.stringify({ hpath: 'C:/install/plugin', enable: false }, null, 2)
		);
	});

	it('uses the selected alias when migrating a deprecated path', () => {
		const state = createConfigFixState(
			{ path: 'C:/legacy/plugin', env: [{ SOURCE: '$path/bin' }] },
			{ defaultHpath: 'C:/install/plugin', migrateLegacyPath: true }
		);
		state.legacyPathAlias = 'HOUDINI_PATH';

		expect(correctedConfigText(state, 'C:/install/plugin')).toBe(
			JSON.stringify(
				{ env: [{ SOURCE: '$HOUDINI_PATH/bin', HOUDINI_PATH: 'C:/install/plugin' }] },
				null,
				2
			)
		);
	});

	it('does not add hpath for an untouched legacy path with a destination override', () => {
		const state = createConfigFixState(
			{ path: 'C:/legacy/plugin', enable: false },
			{ defaultHpath: 'C:/install/plugin' }
		);

		expect(correctedConfigText(state, 'C:/install/plugin')).toBe(
			JSON.stringify({ path: 'C:/legacy/plugin', enable: false }, null, 2)
		);
	});

	it('preserves the source JSON formatting for corrected output', () => {
		const state = createConfigFixState(
			{ path: 'C:/legacy/plugin', enable: false },
			{ defaultHpath: 'C:/install/plugin', migrateLegacyPath: true }
		);
		const sourceText =
			'{\r\n\r\n    "path": "C:/legacy/plugin",\r\n\r\n    "enable": false\r\n}\r\n';

		expect(correctedConfigText(state, 'C:/install/plugin', sourceText)).toBe(
			'{\r\n\r\n    "hpath": "C:/install/plugin",\r\n\r\n    "enable": false\r\n}\r\n'
		);
	});

	it('returns the original source when no fix changes the config', () => {
		const state = createConfigFixState(
			{ hpath: 'C:/install/plugin', enable: false },
			{ defaultHpath: 'C:/install/plugin' }
		);
		const sourceText = '{\n\n    "hpath": "C:/install/plugin",\n\n    "enable": false\n}\n';

		expect(correctedConfigText(state, 'C:/install/plugin', sourceText)).toBe(sourceText);
	});

	it('marks added and removed preview lines', () => {
		expect(diffPreviewLines('{\n  "path": "old"\n}', '{\n  "hpath": "new"\n}')).toEqual([
			{ text: '{', kind: 'unchanged', changed: false },
			{ text: '  "hpath": "new"', kind: 'added', changed: true },
			{ text: '  "path": "old"', kind: 'removed', changed: false },
			{ text: '}', kind: 'unchanged', changed: false }
		]);
	});
});
