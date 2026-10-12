import {
	applyPackageConfigFixes,
	findPathAliasLocationIssue,
	findPathAliasConflict,
	type PackageConfigFixPlan,
	type PackagePathAlias,
	type PackagePathAliasConflict,
	type PackagePathAliasLocationIssue
} from '$lib/houdini/package-config-fixes';

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

export function effectiveHpath(state: ConfigFixState, hpathOverride?: string): string {
	return hpathOverride ?? (state.applySourcePathFix ? state.sourcePathFixPath : state.hpath);
}

export function configFixPlan(state: ConfigFixState, hpathOverride?: string): PackageConfigFixPlan {
	const targetAlias = state.migrateLegacyPath ? state.legacyPathAlias : selectedPathAlias(state);
	const pathAlias = targetAlias ?? state.pathAlias;

	return {
		hpath: effectiveHpath(state, hpathOverride),
		pathAlias,
		writeHpath: shouldWriteHpath(state, targetAlias) ? undefined : false,
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
	sourceText?: string
): string {
	const correctedConfig = applyPackageConfigFixes(
		state.config,
		configFixPlan(state, hpathOverride)
	);
	if (
		sourceText !== undefined &&
		JSON.stringify(correctedConfig) === JSON.stringify(state.config)
	) {
		return sourceText;
	}
	const indentation = sourceText === undefined ? 2 : detectJsonIndentation(sourceText);
	const lineEnding = sourceText?.includes('\r\n') ? '\r\n' : '\n';
	const correctedText = JSON.stringify(correctedConfig, null, indentation).replace(
		/\n/g,
		lineEnding
	);
	const formattedText =
		sourceText === undefined
			? correctedText
			: preserveBlankLines(sourceText, correctedText, lineEnding);
	return sourceText && /\r?\n$/.test(sourceText) ? `${formattedText}${lineEnding}` : formattedText;
}

function detectJsonIndentation(sourceText: string): string | number {
	if (!/\r?\n/.test(sourceText)) return 0;
	return sourceText.match(/^[ \t]+(?=["}\]])/m)?.[0] ?? 2;
}

function preserveBlankLines(sourceText: string, generatedText: string, lineEnding: string): string {
	const sourceBody = sourceText.replace(/\r?\n$/, '');
	const sourceLines = sourceBody.split(/\r?\n/);
	type LineAnchor = { line: string; occurrence: number } | null;
	type BlankRun = {
		count: number;
		contentIndex: number;
		previous: LineAnchor;
		next: LineAnchor;
	};

	function anchors(lines: string[]): LineAnchor[] {
		const occurrences = new Map<string, number>();
		return lines.map((line) => {
			if (line.trim() === '') return null;
			const occurrence = (occurrences.get(line) ?? 0) + 1;
			occurrences.set(line, occurrence);
			return { line, occurrence };
		});
	}

	function sameAnchor(left: LineAnchor, right: LineAnchor): boolean {
		return left?.line === right?.line && left?.occurrence === right?.occurrence;
	}

	const sourceAnchors = anchors(sourceLines);
	const blankRuns: BlankRun[] = [];
	let sourceContentLineCount = 0;
	for (let index = 0; index < sourceLines.length; index += 1) {
		if (sourceLines[index].trim() !== '') {
			sourceContentLineCount += 1;
			continue;
		}
		const start = index;
		while (index + 1 < sourceLines.length && sourceLines[index + 1].trim() === '') index += 1;
		blankRuns.push({
			count: index - start + 1,
			contentIndex: sourceContentLineCount,
			previous: sourceAnchors[start - 1] ?? null,
			next: sourceAnchors[index + 1] ?? null
		});
	}

	const outputLines: string[] = [];
	const generatedLines = generatedText.split(/\r?\n/);
	const generatedAnchors = anchors(generatedLines);
	const appliedRuns = new Set<BlankRun>();
	let generatedContentLineCount = 0;
	for (let index = 0; index < generatedLines.length; index += 1) {
		const run = blankRuns.find(
			(candidate) =>
				!appliedRuns.has(candidate) &&
				((sameAnchor(candidate.previous, generatedAnchors[index - 1] ?? null) &&
					sameAnchor(candidate.next, generatedAnchors[index] ?? null)) ||
					candidate.contentIndex === generatedContentLineCount)
		);
		if (run) {
			outputLines.push(...Array(run.count).fill(''));
			appliedRuns.add(run);
		}
		outputLines.push(generatedLines[index]);
		if (generatedLines[index].trim() !== '') generatedContentLineCount += 1;
	}
	const trailingRun = blankRuns.find(
		(candidate) =>
			!appliedRuns.has(candidate) &&
			candidate.next === null &&
			(sameAnchor(candidate.previous, generatedAnchors[generatedAnchors.length - 1] ?? null) ||
				candidate.contentIndex === generatedContentLineCount)
	);
	if (trailingRun) outputLines.push(...Array(trailingRun.count).fill(''));
	return outputLines.join(lineEnding);
}
