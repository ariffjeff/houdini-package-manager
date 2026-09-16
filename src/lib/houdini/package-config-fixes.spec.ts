import { describe, expect, it } from 'vitest';
import { applyPackageConfigFixes } from './package-config-fixes';

describe('package config fixes', () => {
	it('shows the exact result of migrating path when HOUDINI_PATH is also present', () => {
		const config = {
			path: 'C:/legacy/AJTools',
			HOUDINI_PATH: 'C:/houdini',
			enable: false
		};

		expect(
			applyPackageConfigFixes(config, {
				hpath: 'C:/new/AJTools',
				migrateLegacyPath: true
			})
		).toEqual({ hpath: 'C:/new/AJTools', enable: false });
		expect(config).toEqual({
			path: 'C:/legacy/AJTools',
			HOUDINI_PATH: 'C:/houdini',
			enable: false
		});
	});

	it('keeps alias resolution and nested cleanup consistent', () => {
		const config = {
			path: 'C:/legacy/AJTools',
			hpath: 'C:/old/AJTools',
			HOUDINI_PATH: 'C:/houdini',
			env: [{ HOUDINI_PATH: 'C:/nested', OTHER: '$hpath/bin' }],
			nested: { SOURCE: '$hpath', KEEP: '$hpath_extra' }
		};

		expect(
			applyPackageConfigFixes(config, {
				hpath: 'C:/new/AJTools',
				migrateLegacyPath: true,
				keepPathAlias: 'hpath'
			})
		).toEqual({
			hpath: 'C:/new/AJTools',
			env: [{ OTHER: '$hpath/bin' }],
			nested: { SOURCE: '$hpath', KEEP: '$hpath_extra' }
		});

		expect(
			applyPackageConfigFixes(config, {
				migrateLegacyPath: true,
				replacePathAlias: 'HOUDINI_PATH'
			})
		).toEqual({
			HOUDINI_PATH: 'C:/houdini',
			env: [{ HOUDINI_PATH: 'C:/nested', OTHER: '$HOUDINI_PATH/bin' }],
			nested: { SOURCE: '$HOUDINI_PATH', KEEP: '$hpath_extra' }
		});
	});
});
