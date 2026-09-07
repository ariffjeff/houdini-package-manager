import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from '../../routes/+page.svelte';

let scanRequests: Array<{ stage: string; pluginIds?: string[] }> = [];

const discoveryResponse = {
	installs: [
		{
			id: 'install:houdini-21.0-455-test',
			label: 'Houdini 21.0',
			version: '21.0',
			build: '455',
			platform: 'Windows',
			architecture: 'x86_64',
			role: 'Detected by hconfig',
			hfs: 'C:/Program Files/Side Effects Software/Houdini 21.0.455',
			hconfig: 'C:/Program Files/Side Effects Software/Houdini 21.0.455/bin/hconfig.exe',
			userPreferences: 'C:/Users/test/Documents/houdini21.0',
			packageDirectory: 'C:/Users/test/Documents/houdini21.0/packages',
			packageRoots: [{ path: 'C:/Users/test/Documents/houdini21.0/packages', origin: 'user' }],
			packageCount: 1,
			packageFiles: ['MOPS.json'],
			houdiniPath: [],
			variables: {},
			health: 'ready',
			diagnostics: [],
			scannedAt: '2026-09-06T00:00:00.000Z'
		}
	],
	plugins: [
		{
			id: 'package:mops',
			name: 'MOPS',
			description: 'Discovered from a Houdini package configuration.',
			version: 'v1.10.0',
			license: 'Not declared',
			source: 'C:/Users/test/Documents/houdini21.0/packages/MOPS',
			tags: ['hconfig', 'user'],
			packageFile: 'MOPS.json',
			packagePath: 'C:/Users/test/Documents/houdini21.0/packages/MOPS.json',
			origin: 'user',
			valid: true,
			versionSource: 'git',
			gitRef: 'v1.10.0',
			repositoryUrl: 'https://github.com/toadstorm/MOPS',
			availableVersions: ['v1.10.0', 'v1.9.2e'],
			installedVersions: ['v1.10.0'],
			sources: [
				{
					path: 'C:/Users/test/Desktop/DCC/MOPS',
					exists: true,
					version: 'v1.10.0',
					versionSource: 'git',
					gitRef: 'v1.10.0',
					repositoryUrl: 'https://github.com/toadstorm/MOPS',
					availableVersions: ['v1.10.0', 'v1.9.2e']
				}
			],
			stalePaths: ['C:/Users/test/Documents/HPM/plugins/mops']
		},
		{
			id: 'package:qlib',
			name: 'qLib',
			description: 'Discovered from a Houdini package configuration.',
			version: '2.4.1',
			license: 'Not declared',
			source: 'C:/Users/test/Documents/houdini21.0/packages/qLib',
			tags: ['hconfig', 'user'],
			packageFile: 'qLib.json',
			packagePath: 'C:/Users/test/Documents/houdini21.0/packages/qLib.json',
			origin: 'user',
			valid: true
		},
		{
			id: 'package:apex',
			name: 'Apex',
			description: 'Discovered from a Houdini package configuration.',
			version: 'Unversioned',
			license: 'Not declared',
			source: 'C:/Program Files/Side Effects Software/Houdini 21.0.455/packages/apex',
			tags: ['hconfig', 'install'],
			packageFile: 'apex.json',
			packagePath: 'C:/Program Files/Side Effects Software/Houdini 21.0.455/packages/apex.json',
			origin: 'install',
			valid: true
		}
	],
	targets: [
		{
			pluginId: 'package:mops',
			installId: 'install:houdini-21.0-455-test',
			status: 'warning',
			artifactVersion: null,
			packageFile: 'MOPS.json',
			packagePath: 'C:/Users/test/Documents/houdini21.0/packages/MOPS.json',
			origin: 'user',
			note: 'Package config references removed HPM source: C:/Users/test/Documents/HPM/plugins/mops; available source: C:/Users/test/Desktop/DCC/MOPS'
		},
		{
			pluginId: 'package:qlib',
			installId: 'install:houdini-21.0-455-test',
			status: 'enabled',
			artifactVersion: '2.4.1',
			packageFile: 'qLib.json',
			packagePath: 'C:/Users/test/Documents/houdini21.0/packages/qLib.json',
			origin: 'user',
			note: 'Package config was discovered and is enabled by default.'
		},
		{
			pluginId: 'package:apex',
			installId: 'install:houdini-21.0-455-test',
			status: 'enabled',
			artifactVersion: null,
			packageFile: 'apex.json',
			packagePath: 'C:/Program Files/Side Effects Software/Houdini 21.0.455/packages/apex.json',
			origin: 'install',
			note: 'Package config was discovered and is enabled by default.'
		}
	],
	scannedAt: '2026-09-06T00:00:00.000Z',
	gitSyncedAt: null,
	diagnostics: []
};

afterEach(() => {
	vi.unstubAllGlobals();
});

function stubDiscovery() {
	scanRequests = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const requestUrl = typeof input === 'string' ? input : input.toString();
			const requestPath = new URL(requestUrl, 'http://localhost').pathname;
			if (requestPath !== '/__hpm/houdini/scan') {
				throw new Error(`Unexpected request: ${requestPath}`);
			}

			const request = JSON.parse(String(init?.body)) as (typeof scanRequests)[number];
			scanRequests.push(request);
			return new Response(
				JSON.stringify({
					...discoveryResponse,
					plugins: discoveryResponse.plugins.map((plugin) => ({
						...plugin,
						gitSyncedAt:
							request.stage === 'git' && (request.pluginIds ?? ['package:mops']).includes(plugin.id)
								? new Date().toISOString()
								: null
					})),
					gitSyncedAt: request.stage === 'git' ? new Date().toISOString() : null,
					gitSyncedPluginIds: request.stage === 'git' ? (request.pluginIds ?? ['package:mops']) : []
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' }
				}
			);
		})
	);
}

describe('activation workspace', () => {
	it('selects an install from the map and updates the detail rail', async () => {
		stubDiscovery();
		render(Page);

		await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Houdini installs', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Plugin inventory', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Remote Git metadata', exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Rescan all' })).toBeInTheDocument();
		await expect
			.poll(() => scanRequests.map(({ stage }) => stage))
			.toEqual(['installs', 'plugins']);
		await expect.element(page.getByText('Git not synced', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Rescan all' }).click();
		await expect
			.poll(() => scanRequests.map(({ stage }) => stage))
			.toEqual(['installs', 'plugins', 'installs', 'plugins', 'git']);
		await expect
			.element(page.getByText('Git synced just now', { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'MOPS', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('C:/Users/test/Desktop/DCC/MOPS', { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('C:/Users/test/Documents/HPM/plugins/mops', { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: 'Open source' }))
			.toHaveAttribute('href', 'https://github.com/toadstorm/MOPS');
		await expect.element(page.getByRole('combobox', { name: 'Version' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('group', { name: 'Official Houdini packages, 1 package configs' }))
			.toBeInTheDocument();

		await page.getByRole('group', { name: 'Official Houdini packages, 1 package configs' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Official Houdini packages', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('apex.json / install / 1 enabled targets'))
			.toBeInTheDocument();

		await page.getByRole('group', { name: 'Houdini 21.0, 1 package configs' }).click();

		await expect
			.element(page.getByRole('heading', { name: 'Houdini 21.0', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('C:/Users/test/Documents/houdini21.0', { exact: true }))
			.toBeInTheDocument();
	});

	it('switches to the table and filters plugin rows', async () => {
		stubDiscovery();
		render(Page);

		await page.getByRole('button', { name: 'Table' }).click();
		await expect.element(page.getByRole('table')).toBeInTheDocument();

		const filter = page.getByRole('searchbox', { name: 'Filter plugins or installs' });
		await filter.fill('qlib');

		await expect.element(page.getByRole('row', { name: /qLib/ })).toBeInTheDocument();
		await expect.element(page.getByRole('row', { name: /MOPS/ })).not.toBeInTheDocument();
	});

	it('syncs all Git metadata from the compact stage action', async () => {
		stubDiscovery();
		render(Page);

		await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Sync Remote Git metadata' }).click();

		await expect
			.poll(() => scanRequests.at(-1))
			.toEqual({
				stage: 'git'
			});
		await expect
			.element(page.getByText('Git synced just now', { exact: true }))
			.toBeInTheDocument();
	});

	it('syncs Git metadata for the selected plugin', async () => {
		stubDiscovery();
		render(Page);

		await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Sync Git', exact: true }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Sync Git', exact: true }).click();
		await expect
			.poll(() => scanRequests.at(-1))
			.toEqual({
				stage: 'git',
				pluginIds: ['package:mops']
			});
		await expect
			.element(page.getByText('Git synced just now', { exact: true }))
			.toBeInTheDocument();

		await page.getByRole('group', { name: /qLib/ }).click();
		await expect
			.element(page.getByRole('button', { name: 'Sync Git', exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('group', { name: /Official Houdini packages/ }).click();
		await expect
			.element(page.getByRole('button', { name: 'Sync Git', exact: true }))
			.not.toBeInTheDocument();
	});
});
