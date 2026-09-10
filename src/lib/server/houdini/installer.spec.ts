import { EventEmitter } from 'node:events';
import { mkdir, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HoudiniDiscoveryResponse } from '../../houdini/types.js';

const childProcessMocks = vi.hoisted(() => ({
	spawn: vi.fn()
}));

const discoveryMocks = vi.hoisted(() => ({
	discoverHoudiniWorkspace: vi.fn(),
	scanHoudiniWorkspace: vi.fn()
}));

vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
	spawn: childProcessMocks.spawn
}));
vi.mock('./discovery.js', () => discoveryMocks);

import { runHoudiniPluginAction } from './installer.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	vi.clearAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
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
