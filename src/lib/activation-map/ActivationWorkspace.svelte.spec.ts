import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from '../../routes/+page.svelte';

let scanRequests: Array<{ stage: string; pluginIds?: string[] }> = [];
let pluginActionRequests: Array<{
	action: string;
	pluginId: string;
	installId?: string;
	sourcePath?: string;
	enabled?: boolean;
}> = [];
let holdPluginAction = false;
let releasePluginAction: (() => void) | null = null;

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
			status: 'enabled',
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
	stageScannedAt: {
		installs: '2026-09-06T00:00:00.000Z',
		plugins: '2026-09-06T00:01:00.000Z',
		git: null
	},
	gitSyncedAt: null,
	gitSyncedPluginIds: [],
	persistedAt: '2026-09-06T00:01:00.000Z',
	source: 'live' as const,
	diagnostics: []
};

afterEach(() => {
	localStorage.removeItem('hpm:last-selected-node');
	vi.unstubAllGlobals();
});

function stubDiscovery(
	response: typeof discoveryResponse = discoveryResponse,
	snapshotResponse: typeof discoveryResponse | null = null
) {
	scanRequests = [];
	pluginActionRequests = [];
	holdPluginAction = false;
	releasePluginAction = null;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const requestUrl = typeof input === 'string' ? input : input.toString();
			const requestPath = new URL(requestUrl, 'http://localhost').pathname;
			if (requestPath === '/__hpm/houdini/snapshot') {
				if (!snapshotResponse) return new Response(null, { status: 404 });
				return new Response(
					JSON.stringify({
						...snapshotResponse,
						source: 'saved',
						persistedAt: snapshotResponse.persistedAt ?? '2026-09-06T00:01:00.000Z'
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (requestPath === '/__hpm/houdini/plugin-action') {
				const request = JSON.parse(String(init?.body)) as {
					action: string;
					pluginId: string;
					installId?: string;
					sourcePath?: string;
					enabled?: boolean;
				};
				pluginActionRequests.push(request);
				if (holdPluginAction) {
					await new Promise<void>((resolve) => {
						releasePluginAction = resolve;
					});
				}
				return new Response(
					JSON.stringify({
						message:
							request.action === 'set-enabled'
								? `MOPS ${request.enabled ? 'enabled' : 'disabled'} for the selected Houdini install.`
								: 'Plugin refreshed',
						discovery:
							request.action === 'set-enabled'
								? {
										...response,
										targets: response.targets.map((target) =>
											target.pluginId === request.pluginId && target.installId === request.installId
												? { ...target, status: request.enabled ? 'enabled' : 'disabled' }
												: target
										)
									}
								: undefined
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (requestPath === '/__hpm/houdini/install') {
				return new Promise<never>((_, reject) => {
					init?.signal?.addEventListener('abort', () =>
						reject(new DOMException('The operation was aborted.', 'AbortError'))
					);
				});
			}
			if (requestPath !== '/__hpm/houdini/scan') {
				throw new Error(`Unexpected request: ${requestPath}`);
			}

			const request = JSON.parse(String(init?.body)) as (typeof scanRequests)[number];
			scanRequests.push(request);
			return new Response(
				JSON.stringify({
					...response,
					stageScannedAt: {
						...response.stageScannedAt,
						[request.stage]: new Date().toISOString()
					},
					plugins: response.plugins.map((plugin) => ({
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

it('hides target-specific actions for a missing plugin target', async () => {
	const missingTargetResponse = {
		...discoveryResponse,
		plugins: discoveryResponse.plugins.map((plugin) =>
			plugin.id === 'package:mops'
				? {
						...plugin,
						sources: plugin.sources?.map((source) => ({ ...source, exists: false }))
					}
				: plugin
		),
		targets: discoveryResponse.targets.map((target) =>
			target.pluginId === 'package:mops' ? { ...target, status: 'missing' as const } : target
		)
	} as typeof discoveryResponse;
	stubDiscovery(missingTargetResponse);
	render(Page);

	await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: 'Rescan plugin configs', exact: true }))
		.toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: 'Open packages folder for Houdini 21.0' }))
		.toBeInTheDocument();
	await expect
		.element(page.getByText('C:/Users/test/Desktop/DCC/MOPS', { exact: true }))
		.not.toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: 'Open config with missing source for Houdini 21.0' }))
		.toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: 'Rescan config for Houdini 21.0' }))
		.toBeInTheDocument();
	await page.getByRole('button', { name: 'Rescan config for Houdini 21.0' }).click();
	await expect
		.poll(() => scanRequests.at(-1))
		.toEqual({
			stage: 'plugins',
			pluginIds: ['package:mops']
		});
	await page
		.getByRole('button', { name: 'Open config with missing source for Houdini 21.0' })
		.click();
	await expect
		.poll(() => pluginActionRequests.at(-1))
		.toEqual({
			action: 'open-config',
			pluginId: 'package:mops',
			installId: 'install:houdini-21.0-455-test'
		});
	await page.getByRole('button', { name: 'Open packages folder for Houdini 21.0' }).click();
	await expect
		.poll(() => pluginActionRequests.at(-1))
		.toEqual({
			action: 'open-package-folder',
			pluginId: 'package:mops',
			installId: 'install:houdini-21.0-455-test'
		});
	await expect
		.element(page.getByRole('button', { name: 'Open JSON config for Houdini 21.0' }))
		.toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: 'Enable plugin for Houdini 21.0' }))
		.toBeDisabled();
	await expect
		.element(page.getByRole('button', { name: 'Disable plugin for Houdini 21.0' }))
		.not.toBeInTheDocument();
});

it('hydrates a saved snapshot without running automatic scans', async () => {
	stubDiscovery(discoveryResponse, discoveryResponse);
	render(Page);

	await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
	await expect
		.element(page.getByText('Saved snapshot; may be stale.', { exact: true }))
		.toBeInTheDocument();
	await expect.poll(() => scanRequests).toEqual([]);
	await expect
		.element(page.getByRole('status', { name: 'Houdini installs: Saved' }))
		.toBeInTheDocument();
});

it('restores the last selected node from local storage', async () => {
	localStorage.setItem('hpm:last-selected-node', 'plugin:package:qlib');
	stubDiscovery(discoveryResponse, discoveryResponse);
	render(Page);

	await expect
		.element(page.getByRole('heading', { name: 'qLib', exact: true }))
		.toBeInTheDocument();
	await expect.poll(() => scanRequests).toEqual([]);
});

it('groups plugin targets that share a Houdini minor version', async () => {
	const secondInstallId = 'install:houdini-21.0-456-test';
	const groupedResponse = {
		...discoveryResponse,
		plugins: discoveryResponse.plugins.map((plugin) =>
			plugin.id === 'package:mops'
				? { ...plugin, installedVersions: ['v1.10.0', 'v1.9.2e'] }
				: plugin
		) as typeof discoveryResponse.plugins,
		installs: [
			...discoveryResponse.installs,
			{
				...discoveryResponse.installs[0],
				id: secondInstallId,
				build: '456',
				hfs: 'C:/Program Files/Side Effects Software/Houdini 21.0.456'
			},
			{
				...discoveryResponse.installs[0],
				id: 'install:houdini-22.0-100-test',
				label: 'Houdini 22.0',
				version: '22.0',
				build: '100',
				hfs: 'C:/Program Files/Side Effects Software/Houdini 22.0.100'
			}
		],
		targets: [
			...discoveryResponse.targets,
			{ ...discoveryResponse.targets[0], installId: secondInstallId }
		]
	} as typeof discoveryResponse;
	stubDiscovery(groupedResponse);
	render(Page);

	await expect.element(page.getByText('3 installs scanned')).toBeInTheDocument();
	await expect
		.element(page.getByRole('img', { name: '2 versions installed', exact: true }))
		.toBeInTheDocument();
	await expect.element(page.getByText('455', { exact: true })).toBeInTheDocument();
	await expect.element(page.getByText('456', { exact: true })).toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: 'Open JSON config for Houdini 22.0', exact: true }))
		.not.toBeInTheDocument();

	await page
		.getByRole('button', { name: 'Open JSON config for Houdini 21.0', exact: true })
		.click();
	await expect
		.poll(() => pluginActionRequests.at(-1))
		.toMatchObject({
			action: 'open-config',
			pluginId: 'package:mops',
			installId: 'install:houdini-21.0-455-test'
		});
});

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
			.not.toBeInTheDocument();
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

	it('cancels a remote plugin installation', async () => {
		stubDiscovery();
		render(Page);

		await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Install version' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Cancel installation' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel installation' }).click();
		await expect
			.element(page.getByText('Installation cancelled.', { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Install version' })).toBeInTheDocument();
	});

	it('refreshes and toggles the selected plugin config', async () => {
		stubDiscovery();
		render(Page);

		await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Rescan plugin configs' }).click();
		await expect
			.poll(() => scanRequests.at(-1))
			.toEqual({
				stage: 'plugins',
				pluginIds: ['package:mops']
			});
		await expect
			.element(page.getByText('Plugin configs rescanned', { exact: true }))
			.not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Open JSON config for Houdini 21.0' }).click();
		await expect
			.poll(() => pluginActionRequests.at(-1))
			.toEqual({
				action: 'open-config',
				pluginId: 'package:mops',
				installId: 'install:houdini-21.0-455-test'
			});
		await expect
			.poll(() => scanRequests.at(-1))
			.toEqual({
				stage: 'plugins',
				pluginIds: ['package:mops']
			});

		await page.getByRole('button', { name: 'Open packages folder for Houdini 21.0' }).click();
		await expect
			.poll(() => pluginActionRequests.at(-1))
			.toEqual({
				action: 'open-package-folder',
				pluginId: 'package:mops',
				installId: 'install:houdini-21.0-455-test'
			});

		await page
			.getByRole('button', {
				name: 'Open plugin folder for MOPS at C:/Users/test/Desktop/DCC/MOPS'
			})
			.click();
		await expect
			.poll(() => pluginActionRequests.at(-1))
			.toEqual({
				action: 'open-source',
				pluginId: 'package:mops',
				sourcePath: 'C:/Users/test/Desktop/DCC/MOPS'
			});

		holdPluginAction = true;
		await page
			.getByRole('button', {
				name: 'Open plugin folder for MOPS at C:/Users/test/Desktop/DCC/MOPS'
			})
			.click();
		await expect
			.element(page.getByRole('button', { name: 'Rescan plugin configs', exact: true }))
			.toBeInTheDocument();
		releasePluginAction?.();
		holdPluginAction = false;

		await page.getByRole('button', { name: 'Disable plugin for Houdini 21.0' }).click();
		await expect
			.poll(() => pluginActionRequests.at(-1))
			.toEqual({
				action: 'set-enabled',
				pluginId: 'package:mops',
				installId: 'install:houdini-21.0-455-test',
				enabled: false
			});
		await expect
			.poll(() => scanRequests.at(-1))
			.toEqual({
				stage: 'plugins',
				pluginIds: ['package:mops']
			});
		await expect
			.element(page.getByText('MOPS disabled for the selected Houdini install.', { exact: true }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Enable plugin for Houdini 21.0' }))
			.toBeInTheDocument();
	});
});
