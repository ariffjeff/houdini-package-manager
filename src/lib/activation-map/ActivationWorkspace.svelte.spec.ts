import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from '../../routes/+page.svelte';

let scanRequests: Array<{ stage: string; pluginIds?: string[] }> = [];
let installRequests: Array<{
	pluginId: string;
	version: string;
	installIds: string[];
	destinationPath: string;
}> = [];
let pluginActionRequests: Array<{
	action: string;
	pluginId: string;
	installId?: string;
	sourcePath?: string;
	enabled?: boolean;
	hpath?: string;
}> = [];
let holdPluginAction = false;
let releasePluginAction: (() => void) | null = null;
let holdInstall = false;

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
			sourcePaths: ['C:/Users/test/Desktop/DCC/MOPS'],
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
	installRequests = [];
	pluginActionRequests = [];
	holdPluginAction = false;
	releasePluginAction = null;
	holdInstall = false;
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
					hpath?: string;
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
								: request.action === 'get-config'
									? 'Loaded MOPS.json.'
									: request.action === 'update-config'
										? 'Updated MOPS.json.'
										: 'Plugin refreshed',
						config:
							request.action === 'get-config'
								? {
										path: 'C:/Users/test/Documents/HPM/plugins/mops',
										hpath: 'C:/Users/test/Desktop/DCC/MOPS',
										enable: false
									}
								: undefined,
						discovery:
							request.action === 'set-enabled' || request.action === 'update-config'
								? {
										...response,
										targets: response.targets.map((target) =>
											target.pluginId === request.pluginId && target.installId === request.installId
												? {
														...target,
														...(request.action === 'set-enabled'
															? { status: request.enabled ? 'enabled' : 'disabled' }
															: { sourcePaths: [request.hpath] })
													}
												: target
										)
									}
								: undefined
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (requestPath === '/__hpm/houdini/install') {
				const request = JSON.parse(String(init?.body)) as {
					pluginId: string;
					version: string;
					installIds: string[];
					destinationPath: string;
				};
				installRequests.push(request);
				if (holdInstall) {
					return new Promise<never>((_, reject) => {
						init?.signal?.addEventListener('abort', () =>
							reject(new DOMException('The operation was aborted.', 'AbortError'))
						);
					});
				}
				return new Response(
					JSON.stringify({
						message: `MOPS ${request.version} installed at ${request.destinationPath}.`,
						discovery: response
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
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
		.element(page.getByRole('button', { name: 'View Plugin source not found for Houdini 21.0' }))
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
	await page.getByRole('button', { name: 'View Plugin source not found for Houdini 21.0' }).click();
	await expect
		.element(page.getByRole('heading', { name: 'Plugin source not found', exact: true }))
		.toBeInTheDocument();
	await expect
		.element(
			page.getByText(
				'Package config references removed HPM source: C:/Users/test/Documents/HPM/plugins/mops; available source: C:/Users/test/Desktop/DCC/MOPS',
				{ exact: true }
			)
		)
		.toBeInTheDocument();
	await page.getByRole('button', { name: 'Open config', exact: true }).click();
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

it('shows invalid package JSON details for a plugin target', async () => {
	const invalidJsonNote =
		'Invalid package JSON: Expected property name or } in JSON at position 18';
	const invalidJsonResponse = {
		...discoveryResponse,
		targets: discoveryResponse.targets.map((target) =>
			target.pluginId === 'package:mops'
				? { ...target, status: 'warning' as const, note: invalidJsonNote }
				: target
		)
	} as typeof discoveryResponse;
	stubDiscovery(invalidJsonResponse);
	render(Page);

	await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
	await expect.element(page.getByText('Invalid package JSON', { exact: true })).toBeInTheDocument();
	await expect.element(page.getByText(invalidJsonNote, { exact: true })).not.toBeInTheDocument();
	await page.getByRole('button', { name: 'View Invalid package JSON for Houdini 21.0' }).click();
	await expect
		.element(page.getByRole('heading', { name: 'Invalid package JSON', exact: true }))
		.toBeInTheDocument();
	await expect.element(page.getByText(invalidJsonNote, { exact: true })).toBeInTheDocument();
	await page.getByRole('button', { name: 'Open config', exact: true }).click();
	await expect
		.poll(() => pluginActionRequests.at(-1))
		.toEqual({
			action: 'open-config',
			pluginId: 'package:mops',
			installId: 'install:houdini-21.0-455-test'
		});
});

it('groups repeated config issues and selects the matching plugin node', async () => {
	const secondInstallId = 'install:houdini-22.0-100-test';
	const issueResponse = {
		...discoveryResponse,
		installs: [
			...discoveryResponse.installs,
			{
				...discoveryResponse.installs[0],
				id: secondInstallId,
				label: 'Houdini 22.0',
				version: '22.0',
				build: '100'
			}
		],
		targets: [
			{
				...discoveryResponse.targets[0],
				status: 'warning' as const,
				note: 'Package config has a compatibility issue.'
			},
			{
				...discoveryResponse.targets[0],
				installId: secondInstallId,
				status: 'warning' as const,
				note: 'Package config has a compatibility issue.'
			},
			...discoveryResponse.targets.slice(1)
		]
	} as typeof discoveryResponse;
	stubDiscovery(issueResponse);
	render(Page);

	await expect.element(page.getByText('2 installs scanned')).toBeInTheDocument();
	const issueTrigger = page.getByRole('button', { name: /1 Issues/ });
	await expect.element(issueTrigger).toBeInTheDocument();
	await page.getByRole('button', { name: 'Table', exact: true }).click();
	await issueTrigger.click();

	await expect
		.element(page.getByRole('heading', { name: 'Issues', exact: true }))
		.toBeInTheDocument();
	await expect
		.element(page.getByText('1 config issues across the workspace', { exact: true }))
		.toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: 'Open MOPS issue details', exact: true }))
		.toBeInTheDocument();

	await page.getByRole('button', { name: 'Open MOPS issue details', exact: true }).click();

	await expect.element(page.getByRole('table')).not.toBeInTheDocument();
	await expect
		.element(page.getByRole('heading', { name: 'MOPS', exact: true }))
		.toBeInTheDocument();
	await expect
		.element(page.getByRole('heading', { name: 'Issues', exact: true }))
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
	await expect.element(page.getByRole('img', { name: /2 versions installed/ })).toBeInTheDocument();
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
		await expect
			.element(page.getByRole('button', { name: 'Configure remote install for MOPS' }))
			.toBeInTheDocument();
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
		holdInstall = true;
		render(Page);

		await expect.element(page.getByText('1 installs scanned')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Configure remote install for MOPS' }).click();
		await page.getByRole('button', { name: 'Install plugin', exact: true }).click();
		await expect.poll(() => installRequests).toHaveLength(1);
		await expect
			.element(page.getByRole('button', { name: 'Cancel installation', exact: true }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel installation', exact: true }).click();
		await expect
			.element(page.getByRole('dialog').getByText('Installation cancelled.', { exact: true }))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await expect
			.element(page.getByRole('button', { name: 'Configure remote install for MOPS' }))
			.toBeInTheDocument();
	});

	it('installs a remote plugin for selected Houdini installs at a chosen destination', async () => {
		const secondInstallId = 'install:houdini-22.0-100-test';
		const multiInstallResponse = {
			...discoveryResponse,
			installs: [
				...discoveryResponse.installs,
				{
					...discoveryResponse.installs[0],
					id: secondInstallId,
					label: 'Houdini 22.0',
					version: '22.0',
					build: '100'
				}
			],
			targets: [
				...discoveryResponse.targets,
				{
					...discoveryResponse.targets[0],
					installId: secondInstallId,
					packagePath: 'C:/Users/test/Documents/houdini22.0/packages/MOPS.json'
				}
			]
		} as typeof discoveryResponse;
		stubDiscovery(multiInstallResponse);
		render(Page);

		await expect.element(page.getByText('2 installs scanned')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Configure remote install for MOPS' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Install MOPS', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('Use HPM plugin folder', { exact: true }))
			.toBeInTheDocument();

		await page.getByRole('checkbox', { name: /Houdini 21\.0/ }).click();
		await page.getByRole('radio', { name: /Use a custom folder/ }).click();
		const destination = 'C:/Users/test/Plugins/MOPS';
		await page.getByRole('textbox', { name: 'Custom plugin destination' }).fill(destination);
		await expect.element(page.getByText('1 of 2 Houdini installs')).toBeInTheDocument();
		await expect.element(page.getByText(destination, { exact: true })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Install plugin', exact: true }).click();
		await expect
			.poll(() => installRequests.at(-1))
			.toEqual({
				pluginId: 'package:mops',
				version: 'v1.10.0',
				installIds: [secondInstallId],
				destinationPath: destination
			});
		await expect
			.element(page.getByText(`MOPS v1.10.0 installed at ${destination}.`, { exact: true }))
			.toBeInTheDocument();
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

		await page.getByRole('button', { name: 'Edit config options for Houdini 21.0' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Config options', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText(/"path": "C:\/Users\/test\/Documents\/HPM\/plugins\/mops"/))
			.toBeInTheDocument();
		const sourceInput = page.getByRole('textbox', { name: 'Local plugin source' });
		await sourceInput.fill('C:/Users/test/Plugins/MOPS');
		await expect
			.element(page.getByText(/"hpath": "C:\/Users\/test\/Plugins\/MOPS"/))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Save config', exact: true }).click();
		await expect
			.poll(() => pluginActionRequests.at(-1))
			.toEqual({
				action: 'update-config',
				pluginId: 'package:mops',
				installId: 'install:houdini-21.0-455-test',
				hpath: 'C:/Users/test/Plugins/MOPS'
			});
		await expect.element(page.getByText('Updated MOPS.json.', { exact: true })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Close', exact: true }).click();

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
