import { Position } from '@xyflow/svelte';
import {
	activationStatusLabels,
	type ActivationEdge,
	type ActivationNode,
	type ActivationStatus,
	type ActivationTarget,
	type HoudiniInstall,
	type PluginRecord
} from './types';

const statusColors: Record<ActivationStatus, string> = {
	enabled: '#399b82',
	disabled: '#87948f',
	warning: '#d39b38',
	incompatible: '#df6d58',
	missing: '#ad7769'
};

const pluginAccents = ['#ef795f', '#4da7a1', '#d3a43d', '#8296e8', '#b77dd1'];
export const OFFICIAL_NODE_ID = 'official:sidefx';

export function isOfficialPlugin(plugin: PluginRecord): boolean {
	return plugin.origin === 'install' || plugin.origin === 'site';
}

export function isTargetIssue(target: ActivationTarget): boolean {
	return (
		target.status === 'warning' ||
		target.status === 'incompatible' ||
		(target.status === 'missing' && Boolean(target.packagePath))
	);
}

export function createActivationGraph(
	plugins: PluginRecord[],
	installs: HoudiniInstall[],
	targets: ActivationTarget[]
): { nodes: ActivationNode[]; edges: ActivationEdge[] } {
	const userPlugins = plugins.filter((plugin) => !isOfficialPlugin(plugin));
	const officialPlugins = plugins.filter(isOfficialPlugin);
	const officialPluginIds = officialPlugins.map((plugin) => plugin.id);
	const officialTargets = targets.filter((target) => officialPluginIds.includes(target.pluginId));
	const nodes: ActivationNode[] = [
		...userPlugins.map((plugin, index) => {
			const pluginTargets = targets.filter((target) => target.pluginId === plugin.id);
			const activeCount = pluginTargets.filter((target) => target.status === 'enabled').length;
			const versionLabel =
				plugin.installedVersions && plugin.installedVersions.length > 1
					? `${plugin.installedVersions.length} versions`
					: plugin.version;
			const sourceLabel =
				plugin.sources && plugin.sources.length > 1 ? ` / ${plugin.sources.length} sources` : '';
			const attention = pluginTargets.some(isTargetIssue);

			return {
				id: `plugin:${plugin.id}`,
				type: 'plugin' as const,
				position: { x: 70, y: 48 + index * 126 },
				sourcePosition: Position.Right,
				width: 256,
				height: 104,
				data: {
					kind: 'plugin' as const,
					eyebrow: plugin.origin === 'user' ? 'User package' : 'Package config',
					label: plugin.name,
					meta: `${versionLabel}${sourceLabel} / ${plugin.origin}`,
					status: attention ? ('warning' as const) : ('enabled' as const),
					statusLabel: installs.length
						? `${activeCount} / ${installs.length} installs`
						: 'No detected installs',
					accent: pluginAccents[index % pluginAccents.length],
					hasGitRepository: Boolean(plugin.repositoryUrl),
					gitSyncedAt: plugin.gitSyncedAt ?? null,
					searchText: `${plugin.name} ${plugin.version} ${plugin.source} ${plugin.tags.join(' ')}`
				}
			};
		}),
		...(officialPlugins.length
			? [
					{
						id: OFFICIAL_NODE_ID,
						type: 'official' as const,
						position: { x: 70, y: 48 + userPlugins.length * 126 },
						sourcePosition: Position.Right,
						width: 256,
						height: 104,
						data: {
							kind: 'official' as const,
							eyebrow: 'Official SideFX packages',
							label: 'Official Houdini packages',
							meta: `${officialPlugins.length} package configs / install + site roots`,
							status: aggregateStatus(officialTargets),
							statusLabel: `${officialPlugins.length} package configs`,
							accent: '#7a8c8b',
							searchText: `official sidefx houdini ${officialPlugins.map((plugin) => plugin.name).join(' ')}`,
							pluginIds: officialPluginIds
						}
					}
				]
			: []),
		...installs.map((install, index) => {
			const status: ActivationStatus = install.health === 'ready' ? 'enabled' : 'warning';
			const statusLabel =
				install.health === 'error'
					? 'hconfig unavailable'
					: install.health === 'warning'
						? `${install.packageCount} package configs / review`
						: `${install.packageCount} package configs`;

			return {
				id: install.id,
				type: 'install' as const,
				position: { x: 640, y: 84 + index * 126 },
				targetPosition: Position.Left,
				width: 256,
				height: 104,
				data: {
					kind: 'install' as const,
					eyebrow: 'Houdini install',
					label: install.label,
					meta: `${install.platform} / ${install.build}`,
					status,
					statusLabel,
					accent: '#334447',
					searchText: `${install.label} ${install.version} ${install.build} ${install.platform} ${install.hfs}`
				}
			};
		})
	];

	const userEdges: ActivationEdge[] = targets
		.filter((target) => !officialPluginIds.includes(target.pluginId) && target.status !== 'missing')
		.map((target) => ({
			id: `${target.pluginId}->${target.installId}`,
			source: `plugin:${target.pluginId}`,
			target: target.installId,
			type: 'smoothstep',
			data: {
				pluginId: target.pluginId,
				pluginIds: [target.pluginId],
				installId: target.installId,
				status: target.status,
				artifactVersion: target.artifactVersion
			},
			style: `stroke: ${statusColors[target.status]}; stroke-width: 2;${target.status === 'disabled' ? ' stroke-dasharray: 6 5;' : ''}`
		}));
	const officialEdges: ActivationEdge[] = installs.flatMap((install) => {
		const installTargets = officialTargets.filter(
			(target) => target.installId === install.id && target.status !== 'missing'
		);
		if (!installTargets.length) return [];

		const status = aggregateStatus(installTargets);
		return [
			{
				id: `${OFFICIAL_NODE_ID}->${install.id}`,
				source: OFFICIAL_NODE_ID,
				target: install.id,
				type: 'smoothstep',
				data: {
					pluginId: OFFICIAL_NODE_ID,
					pluginIds: officialPluginIds,
					installId: install.id,
					status,
					artifactVersion: null
				},
				style: `stroke: ${statusColors[status]}; stroke-width: 2;${status === 'disabled' ? ' stroke-dasharray: 6 5;' : ''}`
			}
		];
	});

	return { nodes, edges: [...userEdges, ...officialEdges] };
}

function aggregateStatus(targets: ActivationTarget[]): ActivationStatus {
	if (targets.some((target) => target.status === 'incompatible')) return 'incompatible';
	if (targets.some((target) => target.status === 'warning')) return 'warning';
	if (targets.some((target) => target.status === 'disabled')) {
		return targets.every((target) => target.status === 'disabled') ? 'disabled' : 'warning';
	}
	return 'enabled';
}

export function targetFor(
	targets: ActivationTarget[],
	pluginId: string,
	installId: string
): ActivationTarget | undefined {
	return targets.find((target) => target.pluginId === pluginId && target.installId === installId);
}

export function statusLabel(status: ActivationStatus): string {
	return activationStatusLabels[status];
}
