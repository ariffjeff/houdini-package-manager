import {
	applyPackageConfigFixes,
	findPathAliasLocationIssue,
	findPathAliasConflict,
	type PackageConfigFixPlan,
	type PackagePathAlias,
	type PackagePathAliasConflict,
	type PackagePathAliasLocationIssue
} from '$lib/houdini/package-config-fixes';
import {
	applyEdits,
	findNodeAtLocation,
	modify,
	parseTree,
	type FormattingOptions,
	type JSONPath,
	type Node
} from 'jsonc-parser';

export type PathAliasResolution =
	'keep-hpath' | 'keep-HOUDINI_PATH' | 'replace-hpath' | 'replace-HOUDINI_PATH' | null;

export type ConfigFixState = {
	config: Record<string, unknown>;
	defaultHpath: string;
	hpath: string;
	pathAlias: PackagePathAlias;
	legacyPathAlias: PackagePathAlias;
	originalPathAlias: PackagePathAlias;
	sourcePathFixCandidates: string[];
	applySourcePathFix: boolean;
	sourcePathFixPath: string;
	applyPathAliasFix: boolean;
	applyPathAliasLocationFix: boolean;
	migrateLegacyPath: boolean;
	pathAliasConflict: PackagePathAliasConflict | null;
	pathAliasLocationIssue: PackagePathAliasLocationIssue | null;
	undefinedVariableReferences: string[];
	pathAliasResolution: PathAliasResolution;
};

export type ConfigFixStateContext = {
	defaultHpath?: string;
	sourcePathFixCandidates?: string[];
	pathAliasConflict?: PackagePathAliasConflict | null;
	pathAliasLocationIssue?: PackagePathAliasLocationIssue | null;
	undefinedVariableReferences?: string[];
	migrateLegacyPath?: boolean;
};

export type PreviewLine = {
	text: string;
	kind: 'unchanged' | 'added' | 'removed';
	changed: boolean;
};

export type JsonToken = {
	text: string;
	className?: string;
};

export type ConfigLockedRange = {
	start: number;
	end: number;
	controllerId: string;
	label?: string;
};

export function findConfigControlRanges(
	text: string,
	keys: readonly string[],
	controllerId: string,
	label?: string,
	keyControllerId?: string,
	keyLabel?: string
): ConfigLockedRange[] {
	const root = parseTree(text);
	if (!root) return [];

	for (const key of keys) {
		const property = findPropertyByKey(root, key);
		if (property) {
			if (keyControllerId) {
				const keyNode = property.children?.[0];
				const valueNode = property.children?.[1];
				if (keyNode && valueNode) {
					return [
						{
							start: property.offset,
							end: keyNode.offset + keyNode.length,
							controllerId: keyControllerId,
							...(keyLabel ? { label: keyLabel } : {})
						},
						{
							start: keyNode.offset + keyNode.length,
							end: valueNode.offset,
							controllerId,
							...(label ? { label } : {})
						},
						{
							start: valueNode.offset,
							end: valueNode.offset + valueNode.length,
							controllerId,
							...(label ? { label } : {})
						},
						{
							start: valueNode.offset + valueNode.length,
							end: property.offset + property.length,
							controllerId,
							...(label ? { label } : {})
						}
					];
				}
			}
			return [
				{
					start: property.offset,
					end: property.offset + property.length,
					controllerId,
					...(label ? { label } : {})
				}
			];
		}
	}

	return [];
}

export function highlightJsonTokens(text: string): JsonToken[] {
	const tokens: JsonToken[] = [];
	const tokenPattern =
		/(\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\bnull\b/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = tokenPattern.exec(text))) {
		if (match.index > lastIndex) tokens.push({ text: text.slice(lastIndex, match.index) });
		const [, comment, key, string, number, boolean] = match;
		tokens.push({
			text: match[0],
			className: comment
				? 'json-token-comment'
				: key
					? 'json-token-key'
					: string
						? 'json-token-string'
						: number
							? 'json-token-number'
							: boolean
								? 'json-token-boolean'
								: 'json-token-null'
		});
		lastIndex = tokenPattern.lastIndex;
	}
	if (lastIndex < text.length) tokens.push({ text: text.slice(lastIndex) });
	return tokens;
}

function findPropertyByKey(node: Node, key: string): Node | undefined {
	if (node.type === 'property' && node.children?.[0]?.value === key) return node;
	for (const child of node.children ?? []) {
		const property = findPropertyByKey(child, key);
		if (property) return property;
	}
	return undefined;
}

export function createConfigFixState(
	config: Record<string, unknown>,
	context: ConfigFixStateContext = {}
): ConfigFixState {
	const pathAliasConflict = context.pathAliasConflict ?? findPathAliasConflict(config);
	const pathAliasLocationIssue =
		context.pathAliasLocationIssue ?? findPathAliasLocationIssue(config);
	const pathAlias = configuredPathAlias(config, pathAliasConflict);
	const defaultHpath = context.defaultHpath ?? '';

	return {
		config,
		defaultHpath,
		hpath: configHpath(config, defaultHpath, pathAlias),
		pathAlias,
		legacyPathAlias: pathAlias,
		originalPathAlias: pathAlias,
		sourcePathFixCandidates: [...new Set((context.sourcePathFixCandidates ?? []).filter(Boolean))],
		applySourcePathFix: false,
		sourcePathFixPath: context.sourcePathFixCandidates?.[0] ?? '',
		applyPathAliasFix: false,
		applyPathAliasLocationFix: Boolean(pathAliasLocationIssue),
		migrateLegacyPath: context.migrateLegacyPath ?? false,
		pathAliasConflict,
		pathAliasLocationIssue,
		undefinedVariableReferences: context.undefinedVariableReferences ?? [],
		pathAliasResolution: recommendedPathResolution(pathAliasConflict)
	};
}

export function configuredPathAlias(
	config: Record<string, unknown>,
	conflict: PackagePathAliasConflict | null | undefined
): PackagePathAlias {
	if (config.path !== undefined) return 'hpath';
	const hasHpath = hasPathAlias(config, 'hpath');
	const hasHoudiniPath = hasPathAlias(config, 'HOUDINI_PATH');
	if (hasHpath && hasHoudiniPath) {
		if (conflict?.houdiniPathUsedAsVariable && !conflict.hpathUsedAsVariable) {
			return 'HOUDINI_PATH';
		}
		return 'hpath';
	}
	if (hasHoudiniPath) return 'HOUDINI_PATH';
	return 'hpath';
}

export function configHpath(
	config: Record<string, unknown>,
	fallback = '',
	preferredAlias: PackagePathAlias = 'hpath'
): string {
	if (typeof config.path === 'string') return config.path;
	if (Array.isArray(config.path)) {
		return config.path.filter((value): value is string => typeof value === 'string').join('; ');
	}
	const aliases: PackagePathAlias[] =
		preferredAlias === 'HOUDINI_PATH' ? ['HOUDINI_PATH', 'hpath'] : ['hpath', 'HOUDINI_PATH'];
	for (const alias of aliases) {
		const value = findPathAliasValue(config, alias);
		if (typeof value === 'string') return value;
		if (Array.isArray(value)) {
			return value.filter((entry): entry is string => typeof entry === 'string').join('; ');
		}
	}
	return fallback;
}

export function selectedPathAlias(state: ConfigFixState): PackagePathAlias | null {
	return state.applyPathAliasFix ? pathAliasTarget(state.pathAliasResolution) : state.pathAlias;
}

export function effectiveHpath(
	state: ConfigFixState,
	hpathOverride?: string,
	forceDestination = false
): string {
	if (forceDestination && hpathOverride !== undefined) return hpathOverride;
	if (state.applySourcePathFix) return state.sourcePathFixPath;
	if (state.migrateLegacyPath) return state.hpath;
	return hpathOverride ?? state.hpath;
}

export function evaluateConfigVariables(text: string, variables: Record<string, string>): string {
	const evaluatedVariables = { ...variables };
	try {
		const config = JSON.parse(text) as { env?: unknown };
		const addEnvEntry = (entry: unknown): void => {
			if (!isJsonRecord(entry)) return;
			if (typeof entry.var === 'string') {
				if (typeof entry.value === 'string') evaluatedVariables[entry.var] = entry.value;
				else if (Array.isArray(entry.value)) {
					evaluatedVariables[entry.var] = entry.value
						.filter((value): value is string => typeof value === 'string')
						.join(';');
				}
			}
			for (const [name, value] of Object.entries(entry)) {
				if (name !== 'var' && name !== 'value' && name !== 'method' && typeof value === 'string') {
					evaluatedVariables[name] = value;
				}
			}
		};
		if (Array.isArray(config.env)) config.env.forEach(addEnvEntry);
		else if (isJsonRecord(config.env)) {
			for (const [name, value] of Object.entries(config.env)) {
				if (typeof value === 'string') evaluatedVariables[name] = value;
			}
		}
	} catch {
		// Continue with external variables while the draft is temporarily invalid JSON.
	}

	function resolveValue(value: string, resolving: string[] = []): string {
		return value.replace(
			/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
			(match, bracedName, plainName) => {
				const name = bracedName ?? plainName;
				if (
					!Object.prototype.hasOwnProperty.call(evaluatedVariables, name) ||
					resolving.includes(name)
				) {
					return match;
				}
				return resolveValue(evaluatedVariables[name], [...resolving, name]);
			}
		);
	}

	return resolveValue(text);
}

export function configFixPlan(
	state: ConfigFixState,
	hpathOverride?: string,
	forceDestination = false
): PackageConfigFixPlan {
	const targetAlias = state.migrateLegacyPath ? state.legacyPathAlias : selectedPathAlias(state);
	const pathAlias = targetAlias ?? state.pathAlias;
	const preserveLegacyPath =
		forceDestination &&
		hpathOverride !== undefined &&
		Object.prototype.hasOwnProperty.call(state.config, 'path') &&
		!state.migrateLegacyPath;

	return {
		hpath: effectiveHpath(state, hpathOverride, forceDestination),
		...(forceDestination && hpathOverride !== undefined
			? { destinationOverride: hpathOverride }
			: {}),
		pathAlias,
		writeHpath:
			preserveLegacyPath ||
			(forceDestination && hpathOverride !== undefined) ||
			shouldWriteHpath(state, targetAlias)
				? undefined
				: false,
		migrateLegacyPath: state.migrateLegacyPath,
		preservePathAliases:
			state.pathAliasConflict && !state.applyPathAliasFix && targetAlias === state.originalPathAlias
				? true
				: undefined,
		keepPathAlias:
			state.applyPathAliasFix && state.pathAliasResolution?.startsWith('keep-')
				? targetAlias!
				: undefined,
		replacePathAlias:
			targetAlias &&
			((state.applyPathAliasFix && state.pathAliasResolution?.startsWith('replace-')) ||
				(targetAlias !== state.originalPathAlias &&
					hasPathAlias(state.config, oppositePathAlias(targetAlias))))
				? targetAlias
				: undefined
	};
}

export function pathAliasConflictDescription(conflict: PackagePathAliasConflict): string {
	if (conflict.hpathUsedAsVariable && conflict.houdiniPathUsedAsVariable) {
		return 'Both aliases are referenced as variable dependencies. Choose which alias to keep, and references to the other alias will be updated.';
	}
	if (conflict.hpathUsedAsVariable) {
		return 'hpath is referenced as a variable dependency. Keep it, or replace its references with HOUDINI_PATH before removing it.';
	}
	if (conflict.houdiniPathUsedAsVariable) {
		return 'HOUDINI_PATH is referenced as a variable dependency. Keep it, or replace its references with hpath before removing it.';
	}
	return 'Neither alias is referenced as a variable dependency. Choose which alias to keep before saving.';
}

export function diffPreviewLines(originalText: string, previewText: string): PreviewLine[] {
	const originalLines = originalText.split('\n');
	const previewLines = previewText.split('\n');
	const commonLineCounts = Array.from({ length: originalLines.length + 1 }, () =>
		Array<number>(previewLines.length + 1).fill(0)
	);

	for (let originalIndex = originalLines.length - 1; originalIndex >= 0; originalIndex -= 1) {
		for (let previewIndex = previewLines.length - 1; previewIndex >= 0; previewIndex -= 1) {
			commonLineCounts[originalIndex][previewIndex] =
				originalLines[originalIndex] === previewLines[previewIndex]
					? commonLineCounts[originalIndex + 1][previewIndex + 1] + 1
					: Math.max(
							commonLineCounts[originalIndex + 1][previewIndex],
							commonLineCounts[originalIndex][previewIndex + 1]
						);
		}
	}

	const lines: PreviewLine[] = [];
	let originalIndex = 0;
	let previewIndex = 0;
	while (originalIndex < originalLines.length || previewIndex < previewLines.length) {
		if (
			originalIndex < originalLines.length &&
			previewIndex < previewLines.length &&
			originalLines[originalIndex] === previewLines[previewIndex]
		) {
			lines.push({ text: previewLines[previewIndex], kind: 'unchanged', changed: false });
			originalIndex += 1;
			previewIndex += 1;
		} else if (
			previewIndex < previewLines.length &&
			(originalIndex === originalLines.length ||
				commonLineCounts[originalIndex][previewIndex + 1] >=
					commonLineCounts[originalIndex + 1][previewIndex])
		) {
			lines.push({ text: previewLines[previewIndex], kind: 'added', changed: true });
			previewIndex += 1;
		} else {
			lines.push({ text: originalLines[originalIndex], kind: 'removed', changed: false });
			originalIndex += 1;
		}
	}

	return lines;
}

function shouldWriteHpath(state: ConfigFixState, targetAlias: PackagePathAlias | null): boolean {
	const configuredHpath = configHpath(state.config, state.defaultHpath, state.originalPathAlias);
	return (
		state.applySourcePathFix ||
		state.migrateLegacyPath ||
		state.applyPathAliasLocationFix ||
		state.hpath.trim() !== configuredHpath.trim() ||
		(targetAlias !== null && targetAlias !== state.originalPathAlias)
	);
}

function recommendedPathResolution(
	conflict: PackagePathAliasConflict | null | undefined
): PathAliasResolution {
	if (!conflict) return null;
	if (conflict.hpathUsedAsVariable && !conflict.houdiniPathUsedAsVariable) return 'keep-hpath';
	if (conflict.houdiniPathUsedAsVariable && !conflict.hpathUsedAsVariable) {
		return 'keep-HOUDINI_PATH';
	}
	return null;
}

function pathAliasTarget(resolution: PathAliasResolution): PackagePathAlias | null {
	if (!resolution) return null;
	return resolution.endsWith('hpath') ? 'hpath' : 'HOUDINI_PATH';
}

export function hasPathAlias(value: unknown, alias: PackagePathAlias): boolean {
	if (Array.isArray(value)) return value.some((entry) => hasPathAlias(entry, alias));
	if (!value || typeof value !== 'object') return false;
	const object = value as Record<string, unknown>;
	return (
		Object.prototype.hasOwnProperty.call(object, alias) ||
		Object.values(object).some((entry) => hasPathAlias(entry, alias))
	);
}

function findPathAliasValue(value: unknown, alias: PackagePathAlias): unknown {
	if (Array.isArray(value)) {
		for (const entry of value) {
			const result = findPathAliasValue(entry, alias);
			if (result !== undefined) return result;
		}
		return undefined;
	}
	if (!value || typeof value !== 'object') return undefined;
	const object = value as Record<string, unknown>;
	if (Object.prototype.hasOwnProperty.call(object, alias)) return object[alias];
	for (const entry of Object.values(object)) {
		const result = findPathAliasValue(entry, alias);
		if (result !== undefined) return result;
	}
	return undefined;
}

function oppositePathAlias(alias: PackagePathAlias): PackagePathAlias {
	return alias === 'hpath' ? 'HOUDINI_PATH' : 'hpath';
}

export function correctedConfigText(
	state: ConfigFixState,
	hpathOverride?: string,
	sourceText?: string,
	forceDestination = false
): string {
	const plan = configFixPlan(state, hpathOverride, forceDestination);
	const correctedConfig = applyPackageConfigFixes(state.config, plan);
	if (
		sourceText !== undefined &&
		JSON.stringify(correctedConfig) === JSON.stringify(state.config)
	) {
		return sourceText;
	}
	if (sourceText === undefined) return JSON.stringify(correctedConfig, null, 2);
	let workingSource = sourceText;
	let workingSourceConfig = state.config;
	if (
		plan.migrateLegacyPath &&
		plan.pathAlias === 'hpath' &&
		Object.prototype.hasOwnProperty.call(state.config, 'path') &&
		Object.prototype.hasOwnProperty.call(correctedConfig, 'hpath')
	) {
		workingSource = renameJsonProperty(workingSource, ['path'], 'hpath');
		workingSourceConfig = { ...state.config, hpath: state.config.path };
		delete workingSourceConfig.path;
	}

	return updatePackageConfigText(workingSource, workingSourceConfig, correctedConfig);
}

export function updatePackageConfigText(
	sourceText: string,
	sourceConfig: Record<string, unknown>,
	nextConfig: Record<string, unknown>
): string {
	if (JSON.stringify(sourceConfig) === JSON.stringify(nextConfig)) return sourceText;

	const lineEnding = sourceText.includes('\r\n') ? '\r\n' : '\n';
	const formattingOptions = detectFormattingOptions(sourceText, lineEnding);
	return applyConfigTextEdits(sourceText, sourceConfig, nextConfig, formattingOptions);
}

function detectFormattingOptions(sourceText: string, lineEnding: string): FormattingOptions {
	const indentation = sourceText.match(/^[ \t]+(?=["}\]])/m)?.[0] ?? '  ';
	return {
		insertSpaces: !indentation.includes('\t'),
		tabSize: indentation.includes('\t') ? 1 : indentation.length,
		eol: lineEnding,
		insertFinalNewline: false
	};
}

function renameJsonProperty(sourceText: string, path: JSONPath, nextName: string): string {
	const root = parseTree(sourceText);
	const valueNode = root ? findNodeAtLocation(root, path) : undefined;
	const propertyNode = valueNode?.parent;
	const keyNode = propertyNode?.children?.[0];
	if (!keyNode) return sourceText;
	return applyEdits(sourceText, [
		{ offset: keyNode.offset, length: keyNode.length, content: JSON.stringify(nextName) }
	]);
}

function applyConfigTextEdits(
	sourceText: string,
	sourceConfig: Record<string, unknown>,
	correctedConfig: Record<string, unknown>,
	formattingOptions: FormattingOptions
): string {
	let result = sourceText;

	function applyModification(path: JSONPath, value: unknown): void {
		result = applyEdits(result, modify(result, path, value, { formattingOptions }));
	}

	function visit(path: JSONPath, before: unknown, after: unknown): void {
		if (isJsonRecord(before) && isJsonRecord(after)) {
			for (const key of Object.keys(before)) {
				if (Object.prototype.hasOwnProperty.call(after, key))
					visit([...path, key], before[key], after[key]);
			}
			for (const key of Object.keys(before)) {
				if (!Object.prototype.hasOwnProperty.call(after, key))
					applyModification([...path, key], undefined);
			}
			for (const key of Object.keys(after)) {
				if (!Object.prototype.hasOwnProperty.call(before, key))
					applyModification([...path, key], after[key]);
			}
			return;
		}
		if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
			for (let index = 0; index < before.length; index += 1) {
				visit([...path, index], before[index], after[index]);
			}
			return;
		}
		if (JSON.stringify(before) !== JSON.stringify(after)) applyModification(path, after);
	}

	visit([], sourceConfig, correctedConfig);
	return result;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
