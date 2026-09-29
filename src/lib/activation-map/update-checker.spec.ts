import { describe, expect, it } from 'vitest';
import type { ActivationTarget, HoudiniInstall } from './types';
import type { PluginRecord } from '$lib/houdini/types';
import {
	createPluginUpdateItems,
	pinPluginUpdate,
	unpinPluginUpdate,
	updatePreferenceKey
} from './update-checker';

const install = {
	id: 'houdini-20',
	label: 'Houdini 20.0',
	build: '20.0.653',
	version: '20.0',
	packageDirectory: 'C:/Users/test/Documents/houdini20.0/packages'
} as HoudiniInstall;

const plugin = {
	id: 'user:toolkit',
	name: 'Toolkit',
	origin: 'user',
	version: 'v1.0.0',
	availableVersions: ['v1.2.0', 'v1.1.0'],
	installedVersions: ['v1.0.0'],
	gitRef: 'v1.0.0'
} as PluginRecord;

const target = {
	pluginId: plugin.id,
	installId: install.id,
	packageFile: 'toolkit.json',
	packagePath: 'C:/Users/test/Documents/houdini20.0/packages/toolkit.json',
	artifactVersion: 'v1.0.0'
} as ActivationTarget;

describe('createPluginUpdateItems', () => {
	it('counts the newest available version once per config target', () => {
		expect(createPluginUpdateItems([target], [plugin], [install])).toMatchObject([
			{
				pluginId: plugin.id,
				installId: install.id,
				currentVersion: 'v1.0.0',
				latestVersion: 'v1.2.0'
			}
		]);
	});

	it('pins and unpins an exact target update preference', () => {
		const [update] = createPluginUpdateItems([target], [plugin], [install]);
		const pinned = pinPluginUpdate({}, update);

		expect(pinned[updatePreferenceKey(update)]).toBe(true);
		expect(unpinPluginUpdate(pinned, update)).toEqual({});
	});

	it('finds an update on an older target when another install has the latest version', () => {
		const latestPlugin = {
			...plugin,
			version: 'v1.2.0',
			gitRef: 'v1.2.0',
			installedVersions: ['v1.0.0', 'v1.2.0']
		};

		expect(createPluginUpdateItems([target], [latestPlugin], [install])).toMatchObject([
			{ currentVersion: 'v1.0.0', latestVersion: 'v1.2.0' }
		]);
	});
});
