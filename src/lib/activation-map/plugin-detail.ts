import type { PluginRecord } from '$lib/houdini/types';
import { targetFor } from './model';
import type { ActivationTarget, HoudiniInstall } from './types';

export type PluginDetailActionState = 'idle' | 'working' | 'success' | 'error';

export type PluginTargetGroup = {
	representativeInstall: HoudiniInstall;
	target: ActivationTarget;
	installs: HoudiniInstall[];
};

export type PluginDetailAction =
	| { action: 'open-config' | 'open-package-folder'; installId: string }
	| { action: 'open-source'; sourcePath: string }
	| { action: 'set-enabled'; installId: string; enabled: boolean };

export function createPluginTargetGroups(
	plugin: PluginRecord,
	installs: HoudiniInstall[],
	targets: ActivationTarget[]
): PluginTargetGroup[] {
	const groups: PluginTargetGroup[] = [];
	for (const install of installs) {
		const target = targetFor(targets, plugin.id, install.id);
		if (!target?.packagePath) continue;

		const existing = groups.find(
			(group) => group.representativeInstall.version === install.version
		);
		if (existing) {
			existing.installs.push(install);
			continue;
		}

		groups.push({
			representativeInstall: install,
			target,
			installs: [install]
		});
	}

	return groups;
}

export function installBuildLabels(installs: HoudiniInstall[]): string[] {
	return [...new Set(installs.map((install) => install.build))];
}

export function compactPath(value: string): string {
	const segments = value.split(/[\\/]+/).filter(Boolean);
	if (segments.length <= 3) return value;

	const separator = value.includes('\\') ? '\\' : '/';
	const prefix = /^[A-Za-z]:[\\/]/.test(value) ? `${segments[0]}${separator}` : '';
	const tail = segments.slice(-2).join(separator);
	return `${prefix}...${separator}${tail}`;
}

export function installedVersionLabel(plugin: PluginRecord): string {
	const installedVersions = plugin.installedVersions ?? [];
	if (installedVersions.length > 1) return `${installedVersions.length} versions installed`;
	if (installedVersions.length === 1) return installedVersions[0];
	return 'No version';
}

export function availablePluginUpdates(
	plugin: Pick<PluginRecord, 'availableVersions' | 'installedVersions' | 'gitRef' | 'version'>
): string[] {
	const availableVersions = plugin.availableVersions ?? [];
	if (!availableVersions.length) return [];

	const currentTag = gitDescribeTag(plugin.gitRef ?? plugin.version);
	if (currentTag) {
		return availableVersions.filter((version) => compareVersionLabels(version, currentTag) > 0);
	}

	const installedVersions = new Set(plugin.installedVersions ?? []);
	return availableVersions.filter((version) => !installedVersions.has(version));
}

function gitDescribeTag(ref: string | undefined): string | null {
	if (!ref) return null;

	const cleanRef = ref.replace(/-dirty$/, '');
	const describedTag = cleanRef.match(/^(.+)-(\d+)-g[0-9a-f]+$/i)?.[1];
	if (describedTag) return describedTag;
	if (/^[0-9a-f]{7,40}$/i.test(cleanRef) || cleanRef === 'git') return null;
	return cleanRef;
}

function compareVersionLabels(left: string, right: string): number {
	const leftTokens = left.match(/\d+|\D+/g) ?? [left];
	const rightTokens = right.match(/\d+|\D+/g) ?? [right];

	for (let index = 0; index < Math.max(leftTokens.length, rightTokens.length); index += 1) {
		const leftToken = leftTokens[index];
		const rightToken = rightTokens[index];
		if (leftToken === undefined) return -1;
		if (rightToken === undefined) return 1;

		const leftNumber = /^\d+$/.test(leftToken) ? Number(leftToken) : null;
		const rightNumber = /^\d+$/.test(rightToken) ? Number(rightToken) : null;
		if (leftNumber !== null && rightNumber !== null) {
			if (leftNumber !== rightNumber) return leftNumber - rightNumber;
			continue;
		}

		const comparison = leftToken.localeCompare(rightToken);
		if (comparison) return comparison;
	}

	return 0;
}

export function sourceTargets(
	plugin: PluginRecord | undefined,
	groups: PluginTargetGroup[],
	sourcePath: string
): PluginTargetGroup[] {
	if (!plugin) return [];

	const sourceKey = sourcePath.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
	const matches = groups.filter(({ target }) =>
		target.sourcePaths?.some(
			(candidate) => candidate.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase() === sourceKey
		)
	);
	const localSources = plugin.sources?.filter((source) => source.exists) ?? [];
	return matches.length || localSources.length !== 1 ? matches : groups;
}
