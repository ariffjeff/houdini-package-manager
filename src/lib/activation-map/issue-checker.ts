import { isOfficialPlugin, OFFICIAL_NODE_ID } from './model';
import {
	isTargetIssue,
	mergeIssuePathAliasConflicts,
	targetIssueMessages
} from '../houdini/known-issues';
import type { ActivationTarget, HoudiniInstall, PluginRecord } from './types';

export type IssueFilter = Pick<ActivationTarget, 'installId' | 'packageFile' | 'packagePath'>;

export type IssueItem = {
	pluginId: string;
	nodeId: string;
	label: string;
	packageFile: string;
	targets: ActivationTarget[];
	statuses: ActivationTarget['status'][];
	installs: string[];
	notes: string[];
};

export type IssueConfigOption = {
	id: string;
	filter: IssueFilter;
	label: string;
};

export type IssueConfigGroup = { id: string; targets: ActivationTarget[] };

export function issueFilterId(filter: IssueFilter): string {
	return JSON.stringify([filter.installId, filter.packageFile, filter.packagePath]);
}

export function issueConfigId(target: ActivationTarget): string {
	return JSON.stringify([target.packageFile, target.packagePath]);
}

export function issueFilterForTarget(target: ActivationTarget): IssueFilter {
	return {
		installId: target.installId,
		packageFile: target.packageFile,
		packagePath: target.packagePath
	};
}

export function createIssueItems(
	targets: ActivationTarget[],
	plugins: PluginRecord[],
	installs: HoudiniInstall[]
): IssueItem[] {
	const issueGroups = new Map<string, ActivationTarget[]>();

	for (const target of targets) {
		if (!isTargetIssue(target)) continue;
		const groupTargets = issueGroups.get(target.pluginId);
		if (!groupTargets) {
			issueGroups.set(target.pluginId, [target]);
			continue;
		}

		const existingIndex = groupTargets.findIndex(
			(existingTarget) => issueFilterId(existingTarget) === issueFilterId(target)
		);
		if (existingIndex === -1) {
			groupTargets.push(target);
			continue;
		}

		const existingTarget = groupTargets[existingIndex];
		groupTargets[existingIndex] = {
			...existingTarget,
			issues: [...new Set([...(existingTarget.issues ?? []), ...(target.issues ?? [])])],
			issueKinds: [
				...new Set([...(existingTarget.issueKinds ?? []), ...(target.issueKinds ?? [])])
			],
			usesLegacyPath: existingTarget.usesLegacyPath || target.usesLegacyPath,
			undefinedVariableReferences: [
				...new Set([
					...(existingTarget.undefinedVariableReferences ?? []),
					...(target.undefinedVariableReferences ?? [])
				])
			],
			pathAliasConflict: mergeIssuePathAliasConflicts(
				existingTarget.pathAliasConflict,
				target.pathAliasConflict
			)
		};
	}

	return [...issueGroups.entries()]
		.map(([pluginId, groupTargets]) => {
			const plugin = plugins.find((item) => item.id === pluginId);
			const statuses = [...new Set(groupTargets.map((target) => target.status))];
			const installsForIssue = [
				...new Set(
					groupTargets.map(
						(target) =>
							installs.find((install) => install.id === target.installId)?.label ?? target.installId
					)
				)
			];
			const notes = [...new Set(groupTargets.map((target) => target.note).filter(Boolean))];

			return {
				pluginId,
				nodeId: plugin && isOfficialPlugin(plugin) ? OFFICIAL_NODE_ID : `plugin:${pluginId}`,
				label: plugin?.name ?? pluginId,
				packageFile: plugin?.packageFile ?? groupTargets[0].packageFile,
				targets: groupTargets,
				statuses,
				installs: installsForIssue,
				notes
			};
		})
		.sort((left, right) => left.label.localeCompare(right.label));
}

export function createIssueConfigOptions(
	targets: ActivationTarget[],
	installs: HoudiniInstall[]
): IssueConfigOption[] {
	const options = new Map<string, IssueConfigOption>();

	for (const target of targets) {
		if (!isTargetIssue(target)) continue;
		const filter = issueFilterForTarget(target);
		const id = issueFilterId(filter);
		if (options.has(id)) continue;
		const install = installs.find((item) => item.id === target.installId);
		options.set(id, {
			id,
			filter,
			label: `${install?.label ?? target.installId} / build ${install?.build ?? 'unknown'} / ${target.packageFile}`
		});
	}

	return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function filterIssueItems(
	issueItems: IssueItem[],
	filter: IssueFilter | null,
	installs: HoudiniInstall[]
): IssueItem[] {
	if (!filter) return issueItems;

	return issueItems
		.map((issue) => {
			const targets = issue.targets.filter(
				(target) =>
					target.installId === filter.installId &&
					target.packageFile === filter.packageFile &&
					target.packagePath === filter.packagePath
			);
			if (!targets.length) return null;

			return {
				...issue,
				targets,
				statuses: [...new Set(targets.map((target) => target.status))],
				installs: [
					...new Set(
						targets.map(
							(target) =>
								installs.find((install) => install.id === target.installId)?.label ??
								target.installId
						)
					)
				],
				notes: [...new Set(targets.map((target) => target.note).filter(Boolean))]
			};
		})
		.filter((issue): issue is IssueItem => issue !== null);
}

export function groupIssueTargets(
	issueItems: IssueItem[],
	groupBuilds: boolean
): Map<string, IssueConfigGroup[]> {
	const groups = new Map<string, IssueConfigGroup[]>();
	for (const issue of issueItems) {
		const issueGroups = issue.targets.reduce<IssueConfigGroup[]>((result, target) => {
			const id = groupBuilds ? issueConfigId(target) : issueFilterId(target);
			const existing = result.find((group) => group.id === id);
			if (existing) existing.targets.push(target);
			else result.push({ id, targets: [target] });
			return result;
		}, []);
		groups.set(issue.pluginId, issueGroups);
	}
	return groups;
}

export function issueGroupInstallLabels(
	targets: ActivationTarget[],
	installs: HoudiniInstall[]
): string[] {
	return targets.map((target) => {
		const install = installs.find((item) => item.id === target.installId);
		return `${install?.label ?? target.installId} / build ${install?.build ?? 'unknown'}`;
	});
}

export function issueGroupMessages(targets: ActivationTarget[]): string[] {
	return [...new Set(targets.flatMap((target) => targetIssueMessages(target)))];
}
