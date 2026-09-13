import { describe, expect, it } from 'vitest';
import {
	createIssueConfigOptions,
	createIssueItems,
	filterIssueItems,
	groupIssueTargets,
	issueFilterId
} from './issue-checker';
import type { ActivationTarget, HoudiniInstall, PluginRecord } from './types';

const installs = [
	{ id: 'houdini:21', label: 'Houdini 21.0', build: '455' },
	{ id: 'houdini:22', label: 'Houdini 22.0', build: '100' }
] as HoudiniInstall[];

const plugins = [{ id: 'package:mops', name: 'MOPS', packageFile: 'MOPS.json' }] as PluginRecord[];

function issueTarget(installId: string): ActivationTarget {
	return {
		pluginId: 'package:mops',
		installId,
		status: 'warning',
		artifactVersion: null,
		packageFile: 'MOPS.json',
		packagePath: 'C:/packages/MOPS.json',
		origin: 'user',
		note: 'Package config has a compatibility issue.'
	};
}

describe('Issue checker transformations', () => {
	it('merges plugin targets and groups matching package builds', () => {
		const issueItems = createIssueItems(
			[issueTarget('houdini:21'), issueTarget('houdini:22')],
			plugins,
			installs
		);

		expect(issueItems).toHaveLength(1);
		expect(issueItems[0].targets).toHaveLength(2);
		expect(groupIssueTargets(issueItems, true).get('package:mops')).toEqual([
			{
				id: JSON.stringify(['MOPS.json', 'C:/packages/MOPS.json']),
				targets: issueItems[0].targets
			}
		]);
	});

	it('creates unique config options and filters to one target', () => {
		const targets = [issueTarget('houdini:21'), issueTarget('houdini:22')];
		const issueItems = createIssueItems(targets, plugins, installs);
		const options = createIssueConfigOptions(targets, installs);

		expect(options.map((option) => option.id)).toEqual([
			issueFilterId(targets[0]),
			issueFilterId(targets[1])
		]);
		expect(filterIssueItems(issueItems, options[1].filter, installs)[0].targets).toEqual([
			targets[1]
		]);
	});
});
