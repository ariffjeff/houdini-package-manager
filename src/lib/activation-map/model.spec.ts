import { describe, expect, it } from 'vitest';
import { createActivationGraph, isTargetIssue, OFFICIAL_NODE_ID } from './model';
import type { ActivationTarget, HoudiniInstall, PluginRecord } from './types';

const install: HoudiniInstall = {
	id: 'install:test',
	label: 'Houdini 21.0',
	version: '21.0',
	build: '455',
	platform: 'Windows',
	architecture: 'x86_64',
	role: 'Detected by hconfig',
	hfs: 'C:/Houdini',
	hconfig: 'C:/Houdini/bin/hconfig.exe',
	userPreferences: 'C:/Users/test/Documents/houdini21.0',
	packageDirectory: 'C:/Users/test/Documents/houdini21.0/packages',
	packageRoots: [],
	packageCount: 3,
	packageFiles: ['MOPS.json', 'apex.json', 'kinefx.json'],
	houdiniPath: [],
	variables: {},
	health: 'ready',
	diagnostics: [],
	scannedAt: '2026-09-07T00:00:00.000Z'
};

function plugin(id: string, name: string, origin: PluginRecord['origin']): PluginRecord {
	return {
		id,
		name,
		author: id === 'package:custom' ? 'AJ' : undefined,
		description: `${name} package`,
		version: 'Unversioned',
		license: 'Not declared',
		source: 'C:/packages',
		tags: ['hconfig', origin],
		packageFile: `${name}.json`,
		packagePath: `C:/packages/${name}.json`,
		origin,
		valid: true
	};
}

function target(
	pluginId: string,
	status: ActivationTarget['status'] = 'enabled'
): ActivationTarget {
	return {
		pluginId,
		installId: install.id,
		status,
		artifactVersion: null,
		packageFile: `${pluginId}.json`,
		packagePath: `C:/packages/${pluginId}.json`,
		origin: pluginId === 'package:custom' ? 'user' : 'install',
		note: ''
	};
}

describe('activation graph model', () => {
	it('does not treat an untargeted install as a plugin issue', () => {
		expect(
			isTargetIssue({
				...target('package:custom', 'missing'),
				packagePath: null
			})
		).toBe(false);
		expect(isTargetIssue(target('package:custom', 'missing'))).toBe(true);
	});

	it('keeps user packages individual and groups official packages', () => {
		const graph = createActivationGraph(
			[
				plugin('package:custom', 'Custom Tool', 'user'),
				plugin('package:apex', 'Apex', 'install'),
				plugin('package:kinefx', 'KineFX', 'site')
			],
			[install],
			[target('package:custom'), target('package:apex'), target('package:kinefx')]
		);

		expect(graph.nodes.map((node) => node.id)).toEqual([
			'plugin:package:custom',
			OFFICIAL_NODE_ID,
			install.id
		]);
		expect(graph.nodes.find((node) => node.id === OFFICIAL_NODE_ID)?.data).toMatchObject({
			kind: 'official',
			label: 'Official Houdini packages',
			pluginIds: ['package:apex', 'package:kinefx']
		});
		expect(graph.edges).toHaveLength(2);
		const officialEdge = graph.edges.find((edge) => edge.source === OFFICIAL_NODE_ID);
		expect(officialEdge).toBeDefined();
		expect(officialEdge?.data?.pluginIds).toEqual(['package:apex', 'package:kinefx']);
	});
});
