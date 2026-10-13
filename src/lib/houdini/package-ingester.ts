import {
	applyPackageConfigFixes,
	findPathAliasLocationIssue,
	type PackagePathAlias
} from './package-config-fixes';
import { packageConfigIssues } from './known-issues';
import { applyEdits, modify, type FormattingOptions } from 'jsonc-parser';
import type {
	PackageConfigIssue,
	PackageConfigIssueCode,
	PackageManifestPreflight,
	PackagePathAliasConflict,
	KnownIssueKind
} from './types';

export const standardPackageConfigKeys = new Set([
	'path',
	'hpath',
	'HOUDINI_PATH',
	'env',
	'enable',
	'load_package_once',
	'version'
]);

const maximumPreflightContentLength = 128 * 1024;

export type PackageConfigInspection = {
	rawText: string;
	config?: Record<string, unknown>;
	recognized: boolean;
	fatal: boolean;
	issues: PackageConfigIssue[];
};

export type PackageConfigIngestionOptions = {
	hpath: string;
	applyPathFixes?: boolean;
	hpm?: Record<string, unknown>;
};

export type PackageConfigIngestionResult = {
	inspection: PackageConfigInspection;
	config?: Record<string, unknown>;
	text?: string;
};

export function inspectPackageConfig(rawText: string): PackageConfigInspection {
	let value: unknown;
	try {
		value = JSON.parse(rawText);
	} catch (error) {
		return {
			rawText,
			recognized: false,
			fatal: true,
			issues: [
				createIssue(
					'invalid-json',
					'fatal',
					`Package manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
				)
			]
		};
	}

	if (!isRecord(value)) {
		return {
			rawText,
			recognized: false,
			fatal: true,
			issues: [
				createIssue('non-object', 'fatal', 'Package manifest JSON must have an object as its root.')
			]
		};
	}

	const recognized = Object.keys(value).some((key) => standardPackageConfigKeys.has(key));
	const issues: PackageConfigIssue[] = [];
	if (!recognized) {
		issues.push(
			createIssue(
				'unrecognized-config',
				'warning',
				'No standard Houdini package keys were found; verify that this JSON file is the package manifest.'
			)
		);
	}

	const pathAliasLocationIssue = findPathAliasLocationIssue(value);
	const pathAliasConflict = findPathAliasConflict(value);
	issues.push(
		...packageConfigIssues({
			valid: true,
			usesLegacyPath: Object.prototype.hasOwnProperty.call(value, 'path'),
			pathAliasConflict,
			pathAliasLocationIssue
		}).map((issue) => createIssue(packageConfigIssueCode(issue.kind), 'warning', issue.message))
	);

	return { rawText, config: value, recognized, fatal: false, issues };
}

export function ingestPackageConfig(
	rawText: string,
	options: PackageConfigIngestionOptions
): PackageConfigIngestionResult {
	const inspection = inspectPackageConfig(rawText);
	if (!inspection.config || inspection.fatal) return { inspection };
	if (options.applyPathFixes === false && options.hpm) {
		const hpm = {
			...(isRecord(inspection.config.hpm) ? inspection.config.hpm : {}),
			...options.hpm
		};
		const text = mergeHpmMetadataText(rawText, inspection.config, hpm);
		return { inspection, config: JSON.parse(text) as Record<string, unknown>, text };
	}

	const config =
		options.applyPathFixes === false
			? cloneJsonRecord(inspection.config)
			: (() => {
					const pathAlias: PackagePathAlias = hasJsonKey(inspection.config, 'HOUDINI_PATH')
						? 'HOUDINI_PATH'
						: 'hpath';
					const pathAliasConflict = findPathAliasConflict(inspection.config);
					return applyPackageConfigFixes(inspection.config, {
						hpath: options.hpath,
						pathAlias,
						migrateLegacyPath: true,
						...(pathAliasConflict ? { replacePathAlias: pathAlias } : {}),
						preserveVersion: true
					});
				})();
	if (options.hpm) {
		config.hpm = {
			...(isRecord(config.hpm) ? config.hpm : {}),
			...options.hpm
		};
	}
	return { inspection, config };
}

function mergeHpmMetadataText(
	rawText: string,
	config: Record<string, unknown>,
	hpm: Record<string, unknown>
): string {
	const formattingOptions = detectFormattingOptions(rawText);
	let text = rawText;
	if (isRecord(config.hpm)) {
		for (const [key, value] of Object.entries(hpm)) {
			text = applyEdits(text, modify(text, ['hpm', key], value, { formattingOptions }));
		}
		return text;
	}
	return applyEdits(text, modify(text, ['hpm'], hpm, { formattingOptions }));
}

function detectFormattingOptions(text: string): FormattingOptions {
	const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
	const indentation = text.match(/(?:^|\n)([ \t]+)"/)?.[1];
	return {
		insertSpaces: indentation ? !indentation.includes('\t') : true,
		tabSize: indentation && !indentation.includes('\t') ? indentation.length : 2,
		eol: lineEnding
	};
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
	return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function toPackageManifestPreflight(
	inspection: PackageConfigInspection
): PackageManifestPreflight {
	const issues = [...inspection.issues];
	const content =
		inspection.rawText.length <= maximumPreflightContentLength ? inspection.rawText : undefined;
	if (!content) {
		issues.push(
			createIssue(
				'manifest-too-large',
				'warning',
				'The manifest is too large to edit in discovery; HPM will validate the checked-out file during installation.'
			)
		);
	}
	return {
		...(content !== undefined ? { content } : {}),
		recognized: inspection.recognized,
		fatal: inspection.fatal,
		issues
	};
}

function createIssue(
	code: PackageConfigIssueCode,
	severity: PackageConfigIssue['severity'],
	message: string
): PackageConfigIssue {
	return { code, severity, message };
}

function packageConfigIssueCode(kind: KnownIssueKind): PackageConfigIssueCode {
	switch (kind) {
		case 'deprecated-path':
			return 'deprecated-path';
		case 'duplicate-path-aliases':
			return 'path-alias-conflict';
		case 'invalid-path-alias-location':
			return 'path-alias-location';
		default:
			return 'known-issue';
	}
}

function findPathAliasConflict(value: Record<string, unknown>): PackagePathAliasConflict | null {
	if (!hasJsonKey(value, 'hpath') || !hasJsonKey(value, 'HOUDINI_PATH')) return null;

	const references = new Set<string>();
	collectVariableReferences(value, references);
	return {
		hpathUsedAsVariable: references.has('hpath'),
		houdiniPathUsedAsVariable: references.has('HOUDINI_PATH')
	};
}

function hasJsonKey(value: unknown, key: string): boolean {
	if (Array.isArray(value)) return value.some((entry) => hasJsonKey(entry, key));
	if (!isRecord(value)) return false;
	return (
		Object.prototype.hasOwnProperty.call(value, key) ||
		Object.values(value).some((entry) => hasJsonKey(entry, key))
	);
}

function collectVariableReferences(value: unknown, references: Set<string>): void {
	if (typeof value === 'string') {
		for (const match of value.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) references.add(match[1]);
		return;
	}
	if (Array.isArray(value)) {
		for (const entry of value) collectVariableReferences(entry, references);
		return;
	}
	if (isRecord(value)) {
		for (const entry of Object.values(value)) collectVariableReferences(entry, references);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
