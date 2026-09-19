import { describe, expect, it } from 'vitest';
import { applyPackageConfigFixes, findPathAliasLocationIssue } from './package-config-fixes';

describe('package config fixes', () => {
	it('detects aliases outside their canonical JSON locations', () => {
		expect(
			findPathAliasLocationIssue({
				hpath: 'C:/plugins',
				env: [{ HOUDINI_PATH: 'C:/houdini' }]
			})
		).toBeNull();
		expect(
			findPathAliasLocationIssue({
				env: [{ hpath: 'C:/plugins' }],
				HOUDINI_PATH: 'C:/houdini'
			})
		).toEqual({ hpath: true, houdiniPath: true });
	});

	it('shows the exact result of migrating path when HOUDINI_PATH is also present', () => {
		const config = {
			path: 'C:/legacy/AJTools',
			HOUDINI_PATH: 'C:/houdini',
			version: '2.0.0',
			env: [{ SOURCE: '$path/bin', KEEP: '$path_extra' }],
			enable: false
		};

		expect(
			applyPackageConfigFixes(config, {
				hpath: 'C:/new/AJTools',
				migrateLegacyPath: true
			})
		).toEqual({
			hpath: 'C:/new/AJTools',
			env: [{ SOURCE: '$hpath/bin', KEEP: '$path_extra' }],
			enable: false
		});
		expect(config).toEqual({
			path: 'C:/legacy/AJTools',
			HOUDINI_PATH: 'C:/houdini',
			version: '2.0.0',
			env: [{ SOURCE: '$path/bin', KEEP: '$path_extra' }],
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
			env: [{ HOUDINI_PATH: 'C:/houdini', OTHER: '$HOUDINI_PATH/bin' }],
			nested: { SOURCE: '$HOUDINI_PATH', KEEP: '$hpath_extra' }
		});
	});

	it('edits the selected alias and rewrites references when switching aliases', () => {
		const config = {
			HOUDINI_PATH: 'C:/old/AJTools',
			nested: {
				SOURCE: '$HOUDINI_PATH/bin',
				KEEP: '$HOUDINI_PATH_extra'
			}
		};

		expect(
			applyPackageConfigFixes(config, {
				hpath: 'C:/new/AJTools',
				pathAlias: 'HOUDINI_PATH'
			})
		).toEqual({
			env: [{ HOUDINI_PATH: 'C:/new/AJTools' }],
			nested: {
				SOURCE: '$HOUDINI_PATH/bin',
				KEEP: '$HOUDINI_PATH_extra'
			}
		});

		expect(
			applyPackageConfigFixes(config, {
				hpath: 'C:/new/AJTools',
				pathAlias: 'hpath',
				replacePathAlias: 'hpath'
			})
		).toEqual({
			hpath: 'C:/new/AJTools',
			nested: {
				SOURCE: '$hpath/bin',
				KEEP: '$HOUDINI_PATH_extra'
			}
		});
	});

	it('updates an existing nested alias instead of adding a duplicate root key', () => {
		const config = {
			hpath: 'C:/old/AJTools',
			env: [{ HOUDINI_PATH: 'C:/houdini', OTHER: 'C:/other' }]
		};

		expect(
			applyPackageConfigFixes(config, {
				hpath: 'C:/new/AJTools',
				pathAlias: 'HOUDINI_PATH',
				replacePathAlias: 'HOUDINI_PATH'
			})
		).toEqual({
			env: [{ HOUDINI_PATH: 'C:/new/AJTools', OTHER: 'C:/other' }]
		});
	});

	it('normalizes aliases to their required config locations', () => {
		expect(
			applyPackageConfigFixes(
				{
					hpath: 'C:/old/AJTools',
					env: [{ hpath: 'C:/nested', HOUDINI_PATH: 'C:/old/houdini' }],
					nested: { HOUDINI_PATH: 'C:/other' }
				},
				{ hpath: 'C:/new/AJTools', pathAlias: 'hpath' }
			)
		).toEqual({ hpath: 'C:/new/AJTools', env: [{}], nested: {} });

		expect(
			applyPackageConfigFixes(
				{
					hpath: 'C:/old/AJTools',
					env: [{ OTHER: 'C:/other' }],
					HOUDINI_PATH: 'C:/old/houdini'
				},
				{ hpath: 'C:/new/houdini', pathAlias: 'HOUDINI_PATH' }
			)
		).toEqual({
			env: [{ OTHER: 'C:/other', HOUDINI_PATH: 'C:/new/houdini' }]
		});
	});
});
