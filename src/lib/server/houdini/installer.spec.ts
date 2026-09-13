import { EventEmitter } from 'node:events';
import { mkdir, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HoudiniDiscoveryResponse } from '../../houdini/types.js';

const childProcessMocks = vi.hoisted(() => ({
	execFile: vi.fn(),
	spawn: vi.fn()
}));

const discoveryMocks = vi.hoisted(() => ({
	discoverHoudiniWorkspace: vi.fn(),
	scanHoudiniWorkspace: vi.fn()
}));

vi.mock('node:child_process', () => ({
	execFile: childProcessMocks.execFile,
	spawn: childProcessMocks.spawn
}));
vi.mock('./discovery.js', () => discoveryMocks);

import {
	installHoudiniPlugin,
	runHoudiniPluginAction,
	validateInstallPluginRequest
} from './installer.js';

const temporaryDirectories: string[] = [];

const validInstallRequest = {
	pluginId: 'package:ajtools',
	version: 'v1.0.0',
	installIds: ['install:19.5'],
	destinationPath: path.resolve('plugins', 'AJTools')
};

afterEach(async () => {
	vi.clearAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe('validateInstallPluginRequest', () => {
	it('requires at least one install id', () => {
		expect(() => validateInstallPluginRequest({ ...validInstallRequest, installIds: [] })).toThrow(
			'At least one Houdini install id is required.'
		);
	});

	it('rejects duplicate install ids', () => {
		expect(() =>
			validateInstallPluginRequest({
				...validInstallRequest,
				installIds: ['install:19.5', 'install:19.5']
			})
		).toThrow('Houdini install ids must be unique.');
	});

	it('requires an absolute destination path', () => {
		expect(() =>
			validateInstallPluginRequest({ ...validInstallRequest, destinationPath: 'plugins/AJTools' })
		).toThrow('An absolute plugin destination path is required.');
	});
});

it('opens an existing discovered source folder', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'hpm-plugin-source-'));
	temporaryDirectories.push(root);
	const packagePath = path.join(root, 'packages', 'AJTools.json');
	const sourcePath = path.join(root, 'plugins', 'AJTools');
	await mkdir(path.dirname(packagePath), { recursive: true });
	await mkdir(sourcePath, { recursive: true });
	await writeFile(packagePath, '{"path":"C:/missing/AJTools","hpath":"$AJTOOLS"}\n', 'utf8');

	const pluginId = 'package:ajtools';
	discoveryMocks.scanHoudiniWorkspace.mockResolvedValue({
		installs: [],
		plugins: [{ id: pluginId, name: 'AJTools', sources: [{ path: sourcePath, exists: true }] }],
		targets: []
	} as unknown as HoudiniDiscoveryResponse);
	const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
	child.unref = vi.fn();
	childProcessMocks.spawn.mockImplementation(() => {
		queueMicrotask(() => child.emit('close', 1, null));
		return child;
	});

	const result = await runHoudiniPluginAction({
		action: 'open-source',
		pluginId,
		sourcePath
	});

	expect(result.message).toBe('Opened AJTools source folder.');
	expect(childProcessMocks.spawn).toHaveBeenCalledWith(
		process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open',
		process.platform === 'win32'
			? ['/d', '/c', 'start', '', '/b', 'explorer.exe', path.normalize(sourcePath)]
			: [path.normalize(sourcePath)],
		{ stdio: 'ignore', windowsHide: true }
	);
});

it('opens the selected install Documents package folder without a package target', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'hpm-package-folder-'));
	temporaryDirectories.push(root);
	const preferenceRoot = path.join(root, 'houdini19.5', 'packages');
	const documentsRoot = path.join(root, 'Documents', 'houdini19.5', 'packages');
	await Promise.all([
		mkdir(preferenceRoot, { recursive: true }),
		mkdir(documentsRoot, { recursive: true })
	]);

	const pluginId = 'package:ajtools';
	const installId = 'install:19.5';
	discoveryMocks.scanHoudiniWorkspace.mockResolvedValue({
		installs: [
			{
				id: installId,
				label: 'Houdini 19.5',
				version: '19.5',
				packageRoots: [
					{ path: preferenceRoot, origin: 'user' },
					{ path: documentsRoot, origin: 'user' }
				]
			}
		],
		plugins: [{ id: pluginId, name: 'AJTools' }],
		targets: [
			{
				pluginId,
				installId,
				status: 'missing',
				artifactVersion: null,
				packageFile: 'AJTools.json',
				packagePath: null,
				origin: null,
				note: 'No package config with this name was found for this Houdini install.'
			}
		]
	} as unknown as HoudiniDiscoveryResponse);
	const child = new EventEmitter();
	childProcessMocks.spawn.mockImplementation(() => {
		queueMicrotask(() => child.emit('close', 0, null));
		return child;
	});

	const result = await runHoudiniPluginAction({
		action: 'open-package-folder',
		pluginId,
		installId
	});

	expect(result.message).toBe('Opened Houdini 19.5 package folder.');
	expect(childProcessMocks.spawn).toHaveBeenCalledWith(
		process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open',
		process.platform === 'win32'
			? ['/d', '/c', 'start', '', '/b', 'explorer.exe', path.normalize(documentsRoot)]
			: [path.normalize(documentsRoot)],
		{ stdio: 'ignore', windowsHide: true }
	);
});

it('opens a package config through the Windows shell association', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'hpm-package-config-'));
	temporaryDirectories.push(root);
	const packagePath = path.join(root, 'AJTools.json');
	await writeFile(packagePath, '{"enable":true}\n', 'utf8');

	const pluginId = 'package:ajtools';
	const installId = 'install:19.5';
	discoveryMocks.scanHoudiniWorkspace.mockResolvedValue({
		installs: [{ id: installId, variables: {} }],
		plugins: [{ id: pluginId, name: 'AJTools' }],
		targets: [{ pluginId, installId, packagePath, packageFile: 'AJTools.json' }]
	} as unknown as HoudiniDiscoveryResponse);
	const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
	child.unref = vi.fn();
	childProcessMocks.spawn.mockImplementation(() => {
		queueMicrotask(() => child.emit('close', 1, null));
		return child;
	});

	await runHoudiniPluginAction({ action: 'open-config', pluginId, installId });

	expect(childProcessMocks.spawn).toHaveBeenCalledWith(
		process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open',
		process.platform === 'win32'
			? ['/d', '/c', 'start', '', '/b', path.normalize(packagePath)]
			: [path.normalize(packagePath)],
		{ stdio: 'ignore', windowsHide: true }
	);
});

describe('Houdini plugin actions', () => {
	it('installs selected Houdini targets at an explicit destination', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'hpm-plugin-install-'));
		temporaryDirectories.push(root);
		const packageDirectories = [
			path.join(root, 'Documents', 'houdini19.5', 'packages'),
			path.join(root, 'Documents', 'houdini20.0', 'packages'),
			path.join(root, 'Documents', 'houdini21.0', 'packages')
		];
		const preferenceDirectories = [
			path.join(root, 'houdini19.5', 'packages'),
			path.join(root, 'houdini20.0', 'packages'),
			path.join(root, 'houdini21.0', 'packages')
		];
		await Promise.all(
			[...packageDirectories, ...preferenceDirectories].map((directory) =>
				mkdir(directory, { recursive: true })
			)
		);

		const installs = ['19.5', '20.0', '21.0'].map((version, index) => ({
			id: `install:${version}`,
			label: `Houdini ${version}`,
			version,
			packageDirectory: packageDirectories[index],
			packageRoots: [
				{ path: preferenceDirectories[index], origin: 'user' as const },
				{ path: packageDirectories[index], origin: 'user' as const }
			]
		}));
		const pluginId = 'package:ajtools';
		const repositoryUrl = 'https://github.com/example/AJTools';
		const destinationPath = path.join(root, 'custom', 'AJTools');
		const discovery = {
			installs,
			plugins: [
				{
					id: pluginId,
					name: 'AJTools',
					packageFile: 'AJTools.json',
					repositoryUrl,
					availableVersions: ['v1.0.0']
				}
			],
			targets: []
		} as unknown as HoudiniDiscoveryResponse;
		discoveryMocks.discoverHoudiniWorkspace
			.mockResolvedValueOnce(discovery)
			.mockResolvedValueOnce(discovery);
		childProcessMocks.execFile.mockImplementation(
			(
				_command: string,
				_args: string[],
				_options: object,
				callback: (error: null, result: { stdout: string; stderr: string }) => void
			) => {
				callback(null, { stdout: '', stderr: '' });
			}
		);

		const result = await installHoudiniPlugin({
			pluginId,
			version: 'v1.0.0',
			installIds: [installs[0].id, installs[2].id],
			destinationPath
		});

		expect(result.message).toBe(
			`AJTools v1.0.0 installed for Houdini 19.5, Houdini 21.0 at ${path.normalize(destinationPath)}.`
		);
		expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(
			1,
			'git',
			['clone', '--no-checkout', repositoryUrl, path.normalize(destinationPath)],
			expect.objectContaining({ cwd: undefined }),
			expect.any(Function)
		);
		expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(
			2,
			'git',
			['checkout', '--detach', 'v1.0.0'],
			expect.objectContaining({ cwd: path.normalize(destinationPath) }),
			expect.any(Function)
		);

		for (const index of [0, 2]) {
			const packageValue = JSON.parse(
				await readFile(path.join(packageDirectories[index], 'AJTools.json'), 'utf8')
			) as Record<string, unknown>;
			expect(packageValue).toMatchObject({
				path: path.normalize(destinationPath),
				enable: true,
				hpm: { managed: true, repository: repositoryUrl, version: 'v1.0.0' }
			});
		}
		await expect(
			readFile(path.join(packageDirectories[1], 'AJTools.json'), 'utf8')
		).rejects.toThrow();
	});

	it('updates only the selected minor-version package config without a Git scan', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'hpm-plugin-action-'));
		temporaryDirectories.push(root);
		const houdini19Package = path.join(
			root,
			'Documents',
			'houdini19.5',
			'packages',
			'AJTools.json'
		);
		const houdini20Package = path.join(
			root,
			'Documents',
			'houdini20.0',
			'packages',
			'AJTools.json'
		);
		await Promise.all([
			mkdir(path.dirname(houdini19Package), { recursive: true }),
			mkdir(path.dirname(houdini20Package), { recursive: true })
		]);
		await Promise.all([
			writeFile(houdini19Package, '{"path":"C:/plugins/AJTools","enable":true}\n', 'utf8'),
			writeFile(houdini20Package, '{"path":"C:/plugins/AJTools","enable":true}\n', 'utf8')
		]);

		const pluginId = 'package:ajtools';
		const houdini19InstallId = 'install:19.5';
		const houdini20InstallId = 'install:20.0';
		const discovery = {
			plugins: [
				{
					id: pluginId,
					name: 'AJTools',
					packageFile: 'AJTools.json'
				}
			],
			targets: [
				{
					pluginId,
					installId: houdini19InstallId,
					packagePath: houdini19Package,
					packageFile: 'AJTools.json'
				},
				{
					pluginId,
					installId: houdini20InstallId,
					packagePath: houdini20Package,
					packageFile: 'AJTools.json'
				}
			]
		} as unknown as HoudiniDiscoveryResponse;
		discoveryMocks.scanHoudiniWorkspace.mockResolvedValue(discovery);
		discoveryMocks.discoverHoudiniWorkspace.mockRejectedValue(
			new Error('Plugin actions must not run the full discovery scan.')
		);

		const result = await runHoudiniPluginAction({
			action: 'set-enabled',
			pluginId,
			installId: houdini20InstallId,
			enabled: false
		});

		expect(result.message).toContain('disabled for the selected Houdini install');
		expect(discoveryMocks.discoverHoudiniWorkspace).not.toHaveBeenCalled();
		expect(discoveryMocks.scanHoudiniWorkspace).toHaveBeenNthCalledWith(1, {
			stage: 'plugins',
			pluginIds: [pluginId]
		});
		expect(discoveryMocks.scanHoudiniWorkspace).toHaveBeenNthCalledWith(2, {
			stage: 'plugins',
			pluginIds: [pluginId]
		});
		expect(JSON.parse(await readFile(houdini19Package, 'utf8')).enable).toBe(true);
		expect(JSON.parse(await readFile(houdini20Package, 'utf8')).enable).toBe(false);
	});
});
