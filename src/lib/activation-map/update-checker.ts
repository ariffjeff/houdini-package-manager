import { isOfficialPlugin } from './model';
import { compareVersionLabels } from './plugin-detail';
import type { ActivationTarget, HoudiniInstall } from './types';
import type { PluginRecord } from '$lib/houdini/types';

export type PluginUpdateItem = {
	id: string;
	pluginId: string;
	installId: string;
	pluginName: string;
	packageFile: string;
	packagePath: string;
	installLabel: string;
	installBuild: string;
	currentVersion: string;
	latestVersion: string;
};

export type PinnedPluginUpdates = Record<string, true>;

export function updatePreferenceKey(item: {
	pluginId: string;
	installId: string;
	packagePath: string;
	currentVersion: string;
	latestVersion: string;
}): string {
	return [item.pluginId, item.installId, item.packagePath, item.currentVersion, item.latestVersion]
		.map((part) => encodeURIComponent(part))
		.join('|');
}

export function readPinnedPluginUpdates(storage: Storage, storageKey: string): PinnedPluginUpdates {
	try {
		const stored = JSON.parse(storage.getItem(storageKey) ?? '[]');
		if (!Array.isArray(stored)) return {};
		return Object.fromEntries(
			stored.filter((key): key is string => typeof key === 'string').map((key) => [key, true])
		);
	} catch {
		return {};
	}
}

export function writePinnedPluginUpdates(
	storage: Storage,
	storageKey: string,
	pinnedUpdates: PinnedPluginUpdates
): void {
	storage.setItem(storageKey, JSON.stringify(Object.keys(pinnedUpdates)));
}

export function pinPluginUpdate(
	pinnedUpdates: PinnedPluginUpdates,
	update: PluginUpdateItem
): PinnedPluginUpdates {
	return { ...pinnedUpdates, [updatePreferenceKey(update)]: true };
}

export function unpinPluginUpdate(
	pinnedUpdates: PinnedPluginUpdates,
	update: PluginUpdateItem
): PinnedPluginUpdates {
	const nextPinnedUpdates = { ...pinnedUpdates };
	delete nextPinnedUpdates[updatePreferenceKey(update)];
	return nextPinnedUpdates;
}

export function createPluginUpdateItems(
	targets: ActivationTarget[],
	plugins: PluginRecord[],
	installs: HoudiniInstall[]
): PluginUpdateItem[] {
	return targets
		.flatMap((target) => {
			if (!target.packagePath) return [];
			const plugin = plugins.find((item) => item.id === target.pluginId);
			const install = installs.find((item) => item.id === target.installId);
			if (!plugin || !install || isOfficialPlugin(plugin) || !target.artifactVersion) return [];

			const latestVersion = (plugin.availableVersions ?? [])
				.filter((version) => compareVersionLabels(version, target.artifactVersion!) > 0)
				.reduce(
					(latest, version) =>
						!latest || compareVersionLabels(version, latest) > 0 ? version : latest,
					''
				);
			if (!latestVersion) return [];

			const item = {
				id: `${target.pluginId}:${target.installId}:${target.packagePath}`,
				pluginId: target.pluginId,
				installId: target.installId,
				pluginName: plugin.name,
				packageFile: target.packageFile,
				packagePath: target.packagePath,
				installLabel: install.label,
				installBuild: install.build,
				currentVersion: target.artifactVersion,
				latestVersion
			};
			return [item];
		})
		.sort(
			(left, right) =>
				left.pluginName.localeCompare(right.pluginName) ||
				left.installLabel.localeCompare(right.installLabel)
		);
}
