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
import { isTargetIssue } from '../houdini/known-issues';

export { isTargetIssue } from '../houdini/known-issues';

const statusColors: Record<ActivationStatus, string> = {
	enabled: '#777',
	disabled: '#4f8f9c',
	warning: '#d39b38',
	incompatible: '#df6d58',
	missing: '#ad7769'
};

const pluginAccents = ['#ef795f', '#4da7a1', '#d3a43d', '#8296e8', '#b77dd1'];
export const OFFICIAL_NODE_ID = 'official:sidefx';

const nodeWidth = 256;
const nodeHeight = 104;
const gridColumnGap = 36;
const gridRowGap = 22;
const gridOriginY = 48;
const pluginGridOriginX = 70;
const pluginGridTargetAspectRatio = 1.4;

function gridColumnCount(itemCount: number) {
	if (itemCount <= 1) return 1;

	let bestColumns = 1;
	let smallestDifference = Number.POSITIVE_INFINITY;
	for (let columns = 1; columns <= itemCount; columns += 1) {
		const rows = Math.ceil(itemCount / columns);
		const width = columns * nodeWidth + (columns - 1) * gridColumnGap;
		const height = rows * nodeHeight + (rows - 1) * gridRowGap;
		const difference = Math.abs(Math.log(width / height / pluginGridTargetAspectRatio));

		if (difference < smallestDifference) {
			bestColumns = columns;
			smallestDifference = difference;
		}
	}

	return bestColumns;
}

function gridPosition(index: number, originX: number, columns: number) {
	const column = index % columns;
	const row = Math.floor(index / columns);

	return {
		x: originX + column * (nodeWidth + gridColumnGap),
		y: gridOriginY + row * (nodeHeight + gridRowGap)
	};
}

export function isOfficialPlugin(plugin: PluginRecord): boolean {
	return plugin.origin === 'install' || plugin.origin === 'site';
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
	const pluginGridColumns = gridColumnCount(userPlugins.length + (officialPlugins.length ? 1 : 0));
	const installGridOriginX =
		pluginGridOriginX +
		pluginGridColumns * nodeWidth +
		(pluginGridColumns - 1) * gridColumnGap +
		70;
	const nodes: ActivationNode[] = [
		...userPlugins.map((plugin, index) => {
			const pluginTargets = targets.filter((target) => target.pluginId === plugin.id);
			const activeCount = pluginTargets.filter((target) => target.status === 'enabled').length;
			const versionLabel =
				plugin.installedVersions && plugin.installedVersions.length > 1
					? `${plugin.installedVersions.length} versions`
					: plugin.version;
			const attention = pluginTargets.some(isTargetIssue);
			const hasGitRepository =
				plugin.versionSource === 'git' ||
				Boolean(
					plugin.gitRef ||
					plugin.gitCommit ||
					plugin.gitTag ||
					plugin.gitBranch ||
					plugin.sources?.some((source) => source.versionSource === 'git')
				);
			const hasRemoteRepository =
				Boolean(plugin.repositoryUrl) ||
				Boolean(plugin.sources?.some((source) => source.repositoryUrl));

			return {
				id: `plugin:${plugin.id}`,
				type: 'plugin' as const,
				position: gridPosition(index, pluginGridOriginX, pluginGridColumns),
				sourcePosition: Position.Right,
				width: 256,
				height: 104,
				data: {
					kind: 'plugin' as const,
					eyebrow: plugin.origin === 'user' ? 'User package' : 'Package config',
					label: plugin.name,
					meta: versionLabel,
					status: attention ? ('warning' as const) : ('enabled' as const),
					statusLabel: installs.length
						? `${activeCount} / ${installs.length} installs`
						: 'No detected installs',
					activeInstallCount: activeCount,
					accent: pluginAccents[index % pluginAccents.length],
					hasGitRepository,
					hasRemoteRepository,
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
						position: gridPosition(userPlugins.length, pluginGridOriginX, pluginGridColumns),
						sourcePosition: Position.Right,
						width: 256,
						height: 104,
						data: {
							kind: 'official' as const,
							eyebrow: 'SideFX packages',
							label: 'SideFX packages',
							meta: '',
							status: aggregateStatus(officialTargets),
							statusLabel: `${officialPlugins.length} package configs`,
							totalPluginCount: officialPlugins.length,
							accent: '#7a8c8b',
							searchText: `official sidefx houdini ${officialPlugins.map((plugin) => plugin.name).join(' ')}`,
							pluginIds: officialPluginIds
						}
					}
				]
			: []),
		...installs.map((install, index) => {
			const userPackageCount = targets.filter(
				(target) =>
					target.installId === install.id &&
					target.status !== 'missing' &&
					!officialPluginIds.includes(target.pluginId)
			).length;
			const status: ActivationStatus = install.health === 'ready' ? 'enabled' : 'warning';
			const statusLabel =
				install.health === 'error'
					? 'hconfig unavailable'
					: install.health === 'warning'
						? `${userPackageCount} package configs / review`
						: `${userPackageCount} package configs`;

			return {
				id: install.id,
				type: 'install' as const,
				position: gridPosition(index, installGridOriginX, 1),
				targetPosition: Position.Left,
				width: 256,
				height: 104,
				data: {
					kind: 'install' as const,
					eyebrow: 'Houdini install',
					label: install.label,
					meta: `Build ${install.build}`,
					status,
					statusLabel,
					totalPluginCount: install.health === 'error' ? undefined : userPackageCount,
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
