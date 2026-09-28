import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { scanHoudiniWorkspace } from './discovery.js';
import {
	readPackageValue,
	safePackageFile,
	writableUserPackageDirectory,
	writePackageValue
} from './plugin-actions.js';
import type {
	HoudiniPluginActionResponse,
	HoudiniPluginMigrationRequest
} from '../../houdini/types.js';

export async function migratePluginConfigs(
	request: HoudiniPluginMigrationRequest
): Promise<HoudiniPluginActionResponse> {
	validatePluginMigrationRequest(request);
	const pluginIds = request.sources.map(({ pluginId }) => pluginId);
	const current = await scanHoudiniWorkspace({ stage: 'plugins', pluginIds });
	const destinationInstall = current.installs.find(
		(install) => install.id === request.destinationInstallId
	);
	if (!destinationInstall) throw new Error('The destination Houdini install was not found.');
	const selectedPlugins = request.sources.map(({ pluginId }) => {
		const plugin = current.plugins.find((candidate) => candidate.id === pluginId);
		if (!plugin) throw new Error(`Plugin ${pluginId} was not found in the discovery scan.`);
		return plugin;
	});
	let copiedPlugins = 0;
	for (const [index, plugin] of selectedPlugins.entries()) {
		const sourceTarget = current.targets.find(
			(target) =>
				target.pluginId === plugin.id && target.installId === request.sources[index].sourceInstallId
		);
		if (!sourceTarget?.packagePath) continue;
		const packageValue = await readPackageValue(sourceTarget.packagePath);
		const packageDirectory = await writableUserPackageDirectory(destinationInstall);
		await mkdir(packageDirectory, { recursive: true });
		await writePackageValue(
			path.join(packageDirectory, safePackageFile(sourceTarget.packageFile || plugin.packageFile)),
			packageValue
		);
		copiedPlugins += 1;
	}
	if (!copiedPlugins)
		throw new Error('No selected plugins have a package config in the source Houdini install.');
	return {
		message: `Copied ${copiedPlugins} plugin config${copiedPlugins === 1 ? '' : 's'} to ${destinationInstall.label}.`,
		discovery: await scanHoudiniWorkspace({ stage: 'plugins', pluginIds })
	};
}

export function validatePluginMigrationRequest(request: HoudiniPluginMigrationRequest): void {
	if (typeof request.destinationInstallId !== 'string' || !request.destinationInstallId.trim())
		throw new Error('A destination Houdini install id is required.');
	if (!Array.isArray(request.sources) || !request.sources.length)
		throw new Error('At least one plugin source is required.');
	if (
		request.sources.some(
			(source) =>
				!source ||
				typeof source.pluginId !== 'string' ||
				!source.pluginId.trim() ||
				typeof source.sourceInstallId !== 'string' ||
				!source.sourceInstallId.trim()
		)
	)
		throw new Error('Each plugin source requires a plugin id and install id.');
	const pluginIds = request.sources.map(({ pluginId }) => pluginId);
	if (new Set(pluginIds).size !== pluginIds.length) throw new Error('Plugin ids must be unique.');
}
