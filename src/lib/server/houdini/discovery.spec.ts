import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	normalizeRepositoryUrl,
	packageRoots,
	parseHconfigOutput,
	parseInstallIdentity,
	findMissingPackagePaths,
	mergePluginRecords,
	mergePluginSources,
	resolvePackagePaths,
	resolveAvailableGitTags,
	resolvePackageTargetStatus,
	resolvePluginVersion,
	scanHoudiniWorkspace
} from './discovery';
import type { HoudiniScanRequest } from '../../houdini/types';

describe('hconfig discovery parsing', () => {
	it('rejects invalid staged scan requests before scanning', async () => {
		await expect(
			scanHoudiniWorkspace({ stage: 'unknown' } as unknown as HoudiniScanRequest)
		).rejects.toThrow('Invalid Houdini scan stage');
		await expect(
			scanHoudiniWorkspace({
				stage: 'plugins',
				pluginIds: ['package:mops', 42]
			} as unknown as HoudiniScanRequest)
		).rejects.toThrow('pluginIds must be an array of strings');
	});

	it('parses quoted key/value records and ignores undefined variables', () => {
		const variables = parseHconfigOutput(`
HFS := 'C:/Program Files/Side Effects Software/Houdini 21.0.455'
HOUDINI_OS := 'Windows'
HOUDINI_USER_PREF_DIR := 'C:/Users/test/Documents/houdini21.0'
HOUDINI_PATH := 'C:/Users/test/Documents/houdini21.0/packages;C:/Program Files/Houdini'
UNSET_VALUE := '<not defined>'
`);

		expect(variables).toEqual({
			HFS: 'C:/Program Files/Side Effects Software/Houdini 21.0.455',
			HOUDINI_OS: 'Windows',
			HOUDINI_USER_PREF_DIR: 'C:/Users/test/Documents/houdini21.0',
			HOUDINI_PATH: 'C:/Users/test/Documents/houdini21.0/packages;C:/Program Files/Houdini'
		});
	});

	it('derives the Houdini version and build from installation roots', () => {
		expect(parseInstallIdentity('C:/Program Files/Side Effects Software/Houdini 21.0.455')).toEqual(
			{
				version: '21.0',
				build: '455'
			}
		);
		expect(parseInstallIdentity('/opt/hfs20.5.487')).toEqual({
			version: '20.5',
			build: '487'
		});
	});

	it('includes the Windows Documents Houdini package root', () => {
		const roots = packageRoots(
			'C:/Program Files/Side Effects Software/Houdini 22.0.368',
			'C:/Users/test/houdini22.0',
			'22.0',
			{}
		);

		if (process.platform !== 'win32') return;

		expect(roots).toContainEqual({
			directory: path.join(os.homedir(), 'Documents', 'houdini22.0', 'packages'),
			origin: 'user'
		});
	});

	it('normalizes Git remotes into browser-friendly repository URLs', () => {
		expect(normalizeRepositoryUrl('git@github.com:toadstorm/MOPS.git')).toBe(
			'https://github.com/toadstorm/MOPS'
		);
		expect(normalizeRepositoryUrl('https://github.com/Aeoll/Aelib.git')).toBe(
			'https://github.com/Aeoll/Aelib'
		);
	});

	it('resolves package paths from variables and array-valued package environments', () => {
		const packageDirectory = path.join(os.tmpdir(), 'hpm-packages');
		const pluginDirectory = path.join(packageDirectory, 'MOPS');
		const toolsDirectory = path.join(packageDirectory, 'tools');

		expect(
			resolvePackagePaths(
				{
					path: '$MOPS',
					env: [{ HOUDINI_PATH: [toolsDirectory, '$MOPS'] }]
				},
				{ MOPS: pluginDirectory },
				packageDirectory
			)
		).toEqual([pluginDirectory, toolsDirectory]);
	});

	it('reports deleted plugin paths without treating the package config as active', async () => {
		const missingPath = path.join(os.tmpdir(), 'hpm-deleted-plugin-payload', 'MOPS');

		expect(await findMissingPackagePaths([process.cwd(), missingPath])).toEqual([missingPath]);
		expect(
			resolvePackageTargetStatus({
				valid: true,
				enabled: true,
				existingPaths: [],
				missingPaths: [missingPath]
			})
		).toBe('missing');
		expect(
			resolvePackageTargetStatus({
				valid: true,
				enabled: true,
				existingPaths: [process.cwd()],
				missingPaths: [],
				stalePaths: [missingPath]
			})
		).toBe('warning');
		expect(
			resolvePackageTargetStatus({
				valid: true,
				enabled: true,
				existingPaths: [],
				missingPaths: [],
				stalePaths: [missingPath]
			})
		).toBe('missing');
		expect(resolvePackageTargetStatus(undefined)).toBe('missing');
	});

	it('groups source paths, versions, and official origins for one plugin', () => {
		const missingPath = path.join(os.tmpdir(), 'hpm-missing-mops');
		const customPath = path.join(os.tmpdir(), 'custom-mops');
		const missingSource = {
			path: missingPath,
			exists: false,
			version: null,
			versionSource: 'unknown' as const,
			availableVersions: ['v1.10.0']
		};
		const customSource = {
			path: customPath,
			exists: true,
			version: 'v1.10.0',
			versionSource: 'git' as const,
			gitRef: 'v1.10.0',
			repositoryUrl: 'https://github.com/toadstorm/MOPS',
			availableVersions: ['v1.10.0', 'v1.9.2e']
		};

		const mergedSources = mergePluginSources([missingSource, customSource]);
		const merged = mergePluginRecords(
			{
				id: 'package:mops',
				name: 'MOPS',
				description: 'Missing plugin path',
				version: 'Unversioned',
				license: 'Not declared',
				source: missingPath,
				tags: ['hconfig', 'user'],
				packageFile: 'MOPS.json',
				packagePath: `${missingPath}.json`,
				origin: 'user',
				valid: true,
				availableVersions: ['v1.10.0'],
				sources: [],
				stalePaths: [missingPath]
			},
			{
				id: 'package:mops',
				name: 'MOPS',
				description: 'Resolved through custom source',
				version: 'v1.10.0',
				license: 'Not declared',
				source: customPath,
				tags: ['hconfig', 'install'],
				packageFile: 'MOPS.json',
				packagePath: `${customPath}.json`,
				origin: 'install',
				valid: true,
				versionSource: 'git',
				gitRef: 'v1.10.0',
				repositoryUrl: 'https://github.com/toadstorm/MOPS',
				availableVersions: ['v1.10.0', 'v1.9.2e'],
				installedVersions: ['v1.10.0'],
				sources: [customSource]
			}
		);

		expect(mergedSources).toHaveLength(2);
		expect(merged.origin).toBe('install');
		expect(merged.source).toBe(customPath);
		expect(merged.version).toBe('v1.10.0');
		expect(merged.tags).toEqual(['hconfig', 'user', 'install']);
		expect(merged.installedVersions).toEqual(['v1.10.0']);
		expect(merged.availableVersions).toEqual(['v1.10.0', 'v1.9.2e']);
		expect(merged.sources).toEqual([customSource]);
		expect(merged.stalePaths).toEqual([missingPath]);
	});

	it('prefers explicit package versions over Git metadata', () => {
		const git = {
			ref: 'v1.10.0',
			commit: 'abc1234',
			repositoryUrl: 'https://github.com/toadstorm/MOPS',
			availableVersions: ['v1.10.0']
		};

		expect(resolvePluginVersion('MOPS.json', null, git)).toEqual({
			version: 'v1.10.0',
			source: 'git'
		});
		expect(resolvePluginVersion('MOPS.json', '2.0.0', git)).toEqual({
			version: '2.0.0',
			source: 'package'
		});
	});

	it('prefers sorted remote tags and falls back to local tags when offline', () => {
		expect(
			resolveAvailableGitTags(
				'v1.10.0\nv1.9.2e',
				[
					'65c4cff83003a51b31edbefa1dd1a11bd3ac3c25\trefs/tags/v1.12',
					'c3a9b20e252c9519900b327f475742160bbd26cd\trefs/tags/v1.11',
					'a0b30a9238047ec2b54973d9c2dafbea344c1cc5\trefs/tags/v1.10.0'
				].join('\n')
			)
		).toEqual(['v1.12', 'v1.11', 'v1.10.0']);

		expect(resolveAvailableGitTags('v1.10.0\nv1.9.2e', '')).toEqual(['v1.10.0', 'v1.9.2e']);
	});
});
