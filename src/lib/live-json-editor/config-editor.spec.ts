import { describe, expect, it } from 'vitest';
import {
	configFixPlan,
	correctedConfigText,
	createConfigFixState,
	diffPreviewLines,
	effectiveHpath,
	evaluateConfigVariables,
	findConfigControlRanges,
	highlightJsonTokens,
	updatePackageConfigText
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

	it('renames a deprecated path without changing its value', () => {
		const state = createConfigFixState(
			{ path: 'C:/legacy/plugin', enable: false },
			{
				defaultHpath: 'C:/install/plugin',
				migrateLegacyPath: true
			}
		);

		expect(correctedConfigText(state, 'C:/install/plugin')).toBe(
			JSON.stringify({ hpath: 'C:/legacy/plugin', enable: false }, null, 2)
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
				{ env: [{ SOURCE: '$HOUDINI_PATH/bin', HOUDINI_PATH: 'C:/legacy/plugin' }] },
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

	it('updates a legacy path when the destination is explicitly selected', () => {
		const state = createConfigFixState(
			{ path: 'C:/legacy/plugin', enable: false },
			{ defaultHpath: 'C:/legacy/plugin' }
		);

		expect(correctedConfigText(state, 'C:/selected/plugin', undefined, true)).toBe(
			JSON.stringify({ path: 'C:/selected/plugin', enable: false }, null, 2)
		);
	});

	it('updates an existing alias when the destination is explicitly selected', () => {
		const state = createConfigFixState(
			{ hpath: '$QLIB', enable: false },
			{ defaultHpath: 'C:/legacy/plugin' }
		);

		expect(correctedConfigText(state, 'C:/selected/plugin', undefined, true)).toBe(
			JSON.stringify({ hpath: 'C:/selected/plugin', enable: false }, null, 2)
		);
	});

	it('finds the destination property range for a controller', () => {
		const source = '{\n  "enable": true,\n  "hpath": "C:/plugins/example"\n}';
		const [range] = findConfigControlRanges(
			source,
			['path', 'hpath', 'HOUDINI_PATH'],
			'plugin-destination',
			'Plugin destination'
		);

		expect(source.slice(range.start, range.end)).toBe('"hpath": "C:/plugins/example"');
		expect(range.controllerId).toBe('plugin-destination');
	});

	it('assigns the path key and value to separate controllers', () => {
		const source = '{\n  "path": "$QLIB"\n}';
		const ranges = findConfigControlRanges(
			source,
			['path'],
			'plugin-destination',
			'Plugin destination',
			'deprecated-path',
			'Remove deprecated path'
		);

		expect(source.slice(ranges[0].start, ranges[0].end)).toBe('"path"');
		expect(ranges[0].controllerId).toBe('deprecated-path');
		expect(source.slice(ranges[2].start, ranges[2].end)).toBe('"$QLIB"');
		expect(ranges[2].controllerId).toBe('plugin-destination');
	});

	it('lets an explicit destination override an enabled source path autofix', () => {
		const state = createConfigFixState(
			{ hpath: 'C:/legacy/plugin', enable: false },
			{
				defaultHpath: 'C:/legacy/plugin',
				sourcePathFixCandidates: ['C:/autofix/plugin']
			}
		);
		state.applySourcePathFix = true;

		expect(correctedConfigText(state, 'C:/custom/plugin', undefined, true)).toBe(
			JSON.stringify({ hpath: 'C:/custom/plugin', enable: false }, null, 2)
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
			'{\r\n\r\n    "hpath": "C:/legacy/plugin",\r\n\r\n    "enable": false\r\n}\r\n'
		);
	});

	it('keeps renamed environment keys in their original position', () => {
		const config = {
			env: [
				{ QLIB: '$HOUDINI_USER_PREF_DIR/qLib-master' },
				{ QOTL: '$QLIB/otls' },
				{
					var: 'HOUDINI_OTLSCAN_PATH',
					value: ['$QOTL/base', '$QOTL/future', '$QOTL/experimental'],
					method: 'append'
				}
			]
		};
		const sourceText = JSON.stringify(config, null, 4);
		const nextConfig = {
			env: [
				config.env[0],
				config.env[1],
				{
					variable: 'HOUDINI_OTLSCAN_PATH',
					paths: ['$QOTL/base', '$QOTL/future', '$QOTL/experimental'],
					mode: 'append'
				}
			]
		};

		const nextText = updatePackageConfigText(sourceText, config, nextConfig);
		const nextEnvironment = JSON.parse(nextText).env;

		expect(Object.keys(nextEnvironment[2])).toEqual(['variable', 'paths', 'mode']);
	});

	it('preserves blank lines after env when migrating path into HOUDINI_PATH', () => {
		const state = createConfigFixState(
			{
				path: 'C:/legacy/plugin',
				load_package_once: true,
				recommends: "houdini_version >= '17.5.321'",
				env: [
					{
						QLIB: '$HOUDINI_USER_PREF_DIR/qLib-master',
						HOUDINI_PATH: 'C:/Users/ariff/HPM/plugins/qlib'
					},
					{ QOTL: '$QLIB/otls' }
				]
			},
			{ defaultHpath: 'C:/install/plugin', migrateLegacyPath: true }
		);
		state.legacyPathAlias = 'HOUDINI_PATH';
		const sourceText = `{
    "path": "C:/legacy/plugin",
    "load_package_once": true,
    "recommends": "houdini_version >= '17.5.321'",
    "env": [

        {
            "QLIB": "$HOUDINI_USER_PREF_DIR/qLib-master",
            "HOUDINI_PATH": "C:/Users/ariff/HPM/plugins/qlib"
        },
        {
            "QOTL": "$QLIB/otls"
        }
    ]
}`;

		const corrected = correctedConfigText(state, 'C:/install/plugin', sourceText);
		expect(corrected).toContain('    "env": [\n\n        {');
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

	it('resolves known variables without changing unknown or cyclic references', () => {
		expect(
			evaluateConfigVariables('A=$ROOT; B=${CHILD}; C=$UNKNOWN; D=$CYCLE', {
				ROOT: 'C:/houdini',
				CHILD: '$ROOT/packages',
				CYCLE: '$CYCLE'
			})
		).toBe('A=C:/houdini; B=C:/houdini/packages; C=$UNKNOWN; D=$CYCLE');
	});

	it('resolves variables declared in the package env array', () => {
		const source = JSON.stringify(
			{ path: '$QLIB', env: [{ QLIB: '$HOUDINI_USER_PREF_DIR/qLib-master' }] },
			null,
			2
		);

		expect(evaluateConfigVariables(source, { HOUDINI_USER_PREF_DIR: 'C:/Users/test' })).toContain(
			'"path": "C:/Users/test/qLib-master"'
		);
	});

	it('resolves variables declared in a package env object', () => {
		const source = JSON.stringify({ path: '$QLIB', env: { QLIB: '$ROOT/qLib-master' } });

		expect(evaluateConfigVariables(source, { ROOT: 'C:/Users/test' })).toContain(
			'"path":"C:/Users/test/qLib-master"'
		);
	});

	it('tokenizes JSON values for syntax highlighting', () => {
		expect(highlightJsonTokens('{"enabled": true, "count": 2, "value": null}')).toEqual([
			{ text: '{' },
			{ text: '"enabled"', className: 'json-token-key' },
			{ text: ': ' },
			{ text: 'true', className: 'json-token-boolean' },
			{ text: ', ' },
			{ text: '"count"', className: 'json-token-key' },
			{ text: ': ' },
			{ text: '2', className: 'json-token-number' },
			{ text: ', ' },
			{ text: '"value"', className: 'json-token-key' },
			{ text: ': ' },
			{ text: 'null', className: 'json-token-null' },
			{ text: '}' }
		]);
	});
});
