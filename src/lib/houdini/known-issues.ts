import type {
	KnownIssueKind,
	PackagePathAliasConflict,
	PackagePathAliasLocationIssue
} from './types';

type IssueStatus = 'enabled' | 'disabled' | 'warning' | 'incompatible' | 'missing';

export type KnownIssueContext = {
	error?: string;
	valid?: boolean;
	status?: IssueStatus;
	note?: string;
	packagePath?: string | null;
	issues?: string[];
	issueKinds?: KnownIssueKind[];
	stalePaths?: string[];
	missingPaths?: string[];
	existingPaths?: string[];
	usesLegacyPath?: boolean;
	pathAliasConflict?: PackagePathAliasConflict | null;
	pathAliasLocationIssue?: PackagePathAliasLocationIssue | null;
	undefinedVariableReferences?: string[];
};

export type TargetIssue = Pick<
	KnownIssueContext,
	| 'status'
	| 'note'
	| 'packagePath'
	| 'issues'
	| 'issueKinds'
	| 'usesLegacyPath'
	| 'pathAliasConflict'
	| 'pathAliasLocationIssue'
	| 'undefinedVariableReferences'
>;

export type KnownIssueDefinition = {
	kind: KnownIssueKind;
	summary: string;
	category: 'config' | 'status';
	appliesTo: (context: KnownIssueContext) => boolean;
	message: (context: KnownIssueContext) => string | null;
};

function hasKind(context: KnownIssueContext, kind: KnownIssueKind): boolean {
	return context.issueKinds?.includes(kind) ?? false;
}

function sourceAvailabilitySuffix(context: KnownIssueContext): string {
	const existingPaths = context.existingPaths ?? [];
	return existingPaths.length
		? `; available source${existingPaths.length === 1 ? '' : 's'}: ${existingPaths.join(', ')}`
		: '';
}

export function pathAliasConflictMessage(conflict: PackagePathAliasConflict): string {
	if (conflict.hpathUsedAsVariable && conflict.houdiniPathUsedAsVariable) {
		return 'Package config defines both hpath and HOUDINI_PATH, and both are used as variable dependencies; choose which alias to keep.';
	}
	if (conflict.hpathUsedAsVariable) {
		return 'Package config defines both hpath and HOUDINI_PATH; HOUDINI_PATH is not used as a variable dependency, so remove HOUDINI_PATH and keep hpath.';
	}
	if (conflict.houdiniPathUsedAsVariable) {
		return 'Package config defines both hpath and HOUDINI_PATH; hpath is not used as a variable dependency, so remove hpath and keep HOUDINI_PATH.';
	}
	return 'Package config defines both hpath and HOUDINI_PATH; neither alias is used as a variable dependency, so choose which alias to keep.';
}

export function pathAliasLocationMessage(issue: PackagePathAliasLocationIssue): string {
	const aliases = [issue.hpath ? 'hpath' : '', issue.houdiniPath ? 'HOUDINI_PATH' : ''].filter(
		Boolean
	);
	return `${aliases.join(' and ')} ${aliases.length === 1 ? 'is' : 'are'} in an invalid JSON location; hpath must be top-level and HOUDINI_PATH must be inside an object in env[].`;
}

export function undefinedVariableReferenceMessage(references: string[]): string {
	return `Package config references undefined variable key${references.length === 1 ? '' : 's'}: ${references.map((reference) => `$${reference}`).join(', ')}. Add the missing key or replace the reference; no reliable autofix is available.`;
}

export const knownIssueDefinitions: KnownIssueDefinition[] = [
	{
		kind: 'removed-hpm-source',
		summary: 'Plugin source not found',
		category: 'config',
		appliesTo: (context) =>
			hasKind(context, 'removed-hpm-source') ||
			Boolean(context.stalePaths?.length) ||
			Boolean(context.note?.startsWith('Package config references removed HPM source')) ||
			Boolean(
				context.issues?.some((issue) =>
					issue.startsWith('Package config references removed HPM source')
				)
			),
		message: (context) =>
			context.stalePaths?.length
				? `Package config references removed HPM source${context.stalePaths.length === 1 ? '' : 's'}: ${context.stalePaths.join(', ')}${sourceAvailabilitySuffix(context)}`
				: 'Package config references a removed HPM source.'
	},
	{
		kind: 'missing-source',
		summary: 'Plugin source not found',
		category: 'config',
		appliesTo: (context) =>
			hasKind(context, 'missing-source') ||
			Boolean(context.missingPaths?.length) ||
			(context.status === 'missing' && Boolean(context.packagePath)),
		message: (context) =>
			context.missingPaths?.length
				? `Package config has missing path${context.missingPaths.length === 1 ? '' : 's'}: ${context.missingPaths.join(', ')}${sourceAvailabilitySuffix(context)}`
				: 'The package config does not resolve to an available plugin source.'
	},
	{
		kind: 'deprecated-path',
		summary: 'Deprecated path key',
		category: 'config',
		appliesTo: (context) => hasKind(context, 'deprecated-path') || Boolean(context.usesLegacyPath),
		message: () => 'Package config uses deprecated path; replace it with hpath.'
	},
	{
		kind: 'duplicate-path-aliases',
		summary: 'Duplicate path aliases',
		category: 'config',
		appliesTo: (context) =>
			hasKind(context, 'duplicate-path-aliases') || Boolean(context.pathAliasConflict),
		message: (context) =>
			context.pathAliasConflict ? pathAliasConflictMessage(context.pathAliasConflict) : null
	},
	{
		kind: 'invalid-path-alias-location',
		summary: 'Invalid path alias location',
		category: 'config',
		appliesTo: (context) =>
			hasKind(context, 'invalid-path-alias-location') || Boolean(context.pathAliasLocationIssue),
		message: (context) =>
			context.pathAliasLocationIssue
				? pathAliasLocationMessage(context.pathAliasLocationIssue)
				: null
	},
	{
		kind: 'undefined-variable-reference',
		summary: 'Undefined variable reference',
		category: 'config',
		appliesTo: (context) =>
			hasKind(context, 'undefined-variable-reference') ||
			Boolean(context.undefinedVariableReferences?.length),
		message: (context) => {
			const references = context.undefinedVariableReferences ?? [];
			return references.length
				? undefinedVariableReferenceMessage(references)
				: 'Package config references an undefined variable key.';
		}
	},
	{
		kind: 'invalid-package-json',
		summary: 'Invalid package JSON',
		category: 'config',
		appliesTo: (context) =>
			hasKind(context, 'invalid-package-json') ||
			Boolean(context.error) ||
			context.valid === false ||
			Boolean(context.note?.startsWith('Invalid package JSON:')),
		message: (context) =>
			context.error ??
			(context.note?.startsWith('Invalid package JSON:') ? context.note : 'Invalid package JSON.')
	},
	{
		kind: 'warning',
		summary: 'Package config needs review',
		category: 'status',
		appliesTo: (context) => context.status === 'warning' || Boolean(context.issues?.length),
		message: () => 'The package config could not be activated for this Houdini install.'
	},
	{
		kind: 'incompatible',
		summary: 'Plugin is incompatible',
		category: 'status',
		appliesTo: (context) => context.status === 'incompatible',
		message: () => 'The package config could not be activated for this Houdini install.'
	}
];

const configIssueDefinitions = knownIssueDefinitions.filter(
	({ category }) => category === 'config'
);
const statusIssueDefinitions = knownIssueDefinitions.filter(
	({ category }) => category === 'status'
);

export function knownIssueKinds(context: KnownIssueContext): KnownIssueKind[] {
	const configKinds = configIssueDefinitions
		.filter((definition) => definition.appliesTo(context))
		.map((definition) => definition.kind);
	if (configKinds.length) return configKinds;
	return statusIssueDefinitions
		.filter((definition) => definition.appliesTo(context))
		.map((definition) => definition.kind);
}

export function packageConfigIssueKinds(context: KnownIssueContext): KnownIssueKind[] {
	return knownIssueKinds(context);
}

export function packageConfigIssueMessages(context: KnownIssueContext): string[] {
	if (context.error) return [context.error];
	return configIssueDefinitions
		.filter((definition) => definition.appliesTo(context))
		.map((definition) => definition.message(context))
		.filter((message): message is string => Boolean(message));
}

export function targetIssueMessages(target: TargetIssue): string[] {
	const messages = new Set(target.issues ?? []);
	if (messages.size) {
		if (target.pathAliasConflict) messages.add(pathAliasConflictMessage(target.pathAliasConflict));
		if (target.undefinedVariableReferences?.length)
			messages.add(undefinedVariableReferenceMessage(target.undefinedVariableReferences));
		if (target.usesLegacyPath)
			messages.add('Package config uses deprecated path; replace it with hpath.');
		return [...messages];
	}
	if (target.note && !target.note.includes('discovered')) return [target.note];
	const generatedMessages = configIssueDefinitions
		.filter((definition) => definition.appliesTo(target))
		.map((definition) => definition.message(target))
		.filter((message): message is string => Boolean(message));
	if (generatedMessages.length) return [...new Set(generatedMessages)];
	return ['The package config could not be activated for this Houdini install.'];
}

export function targetIssueSummary(target: TargetIssue): string {
	const messages = targetIssueMessages(target);
	const kinds = knownIssueKinds(target);
	if (messages.length > 1) return 'Multiple issues';
	if (kinds.includes('missing-source')) return 'Plugin source not found';
	if (kinds.includes('invalid-package-json')) return 'Invalid package JSON';
	if (kinds.includes('incompatible')) return 'Plugin is incompatible';
	if (kinds.includes('duplicate-path-aliases')) return 'Duplicate path aliases';
	if (kinds.includes('invalid-path-alias-location')) return 'Invalid path alias location';
	if (kinds.includes('undefined-variable-reference')) return 'Undefined variable reference';
	if (kinds.includes('deprecated-path')) return 'Deprecated path key';
	if (kinds.includes('removed-hpm-source')) return 'Plugin source not found';
	return 'Package config needs review';
}

export function isInvalidPackageJson(target: TargetIssue): boolean {
	return knownIssueKinds(target).includes('invalid-package-json');
}

export function isTargetIssue(target: TargetIssue): boolean {
	return knownIssueKinds(target).length > 0;
}

export function hasTargetIssues(target: TargetIssue): boolean {
	return isTargetIssue(target) || target.status === 'missing';
}

export function mergeIssuePathAliasConflicts(
	left: PackagePathAliasConflict | undefined,
	right: PackagePathAliasConflict | undefined
): PackagePathAliasConflict | undefined {
	if (!left) return right;
	if (!right) return left;
	return {
		hpathUsedAsVariable: left.hpathUsedAsVariable || right.hpathUsedAsVariable,
		houdiniPathUsedAsVariable: left.houdiniPathUsedAsVariable || right.houdiniPathUsedAsVariable
	};
}
