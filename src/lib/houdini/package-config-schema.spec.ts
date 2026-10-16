import { describe, expect, it } from 'vitest';
import {
	clonePackageConfig,
	type HoudiniPackageConfig,
	houdiniPackageConfigKeys,
	knownPackageConfigKeys,
	updatePackageConfigValue
} from './package-config-schema';

describe('Houdini package config schema', () => {
	const documentedConfig = {
		env: [
			{ BOB: 1 },
			{
				HOUDINI_PATH: {
					value: ['$HOME/bob_tool', { value: '$HOME/tom_tool', method: 'append' }],
					method: 'replace'
				}
			}
		],
		enable: { "houdini_os == 'linux'": false },
		hpath: [{ "houdini_os == 'windows'": '$HOME/bob_tool' }],
		package_path: { "houdini_version == '18.0.302'": '/opt/bob/packages' },
		requires: { "houdini_version >= '20.0'": 'base_package' },
		show: true
	} satisfies HoudiniPackageConfig;

	it('accepts the documented conditional and path-operation forms', () => {
		expect(documentedConfig.env).toHaveLength(2);
		expect(documentedConfig.show).toBe(true);
	});

	it('lists the documented package keywords separately from metadata', () => {
		expect(houdiniPackageConfigKeys).toEqual([
			'path',
			'hpath',
			'env',
			'enable',
			'load_package_once',
			'process_order',
			'package_path',
			'recommends',
			'requires',
			'preload_libraries',
			'show'
		]);
		expect(knownPackageConfigKeys).toContain('hpm');
		expect(houdiniPackageConfigKeys).not.toContain('version');
	});

	it('updates a known value without mutating the source config', () => {
		const source = {
			enable: false,
			env: [{ TOOL_ROOT: '$HOME/tool' }]
		};

		const next = updatePackageConfigValue(source, 'enable', true);

		expect(next).toEqual({ enable: true, env: [{ TOOL_ROOT: '$HOME/tool' }] });
		expect(source).toEqual({ enable: false, env: [{ TOOL_ROOT: '$HOME/tool' }] });
		expect(clonePackageConfig(source)).not.toBe(source);
	});
});
